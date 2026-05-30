use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::{PgPool, QueryBuilder};
use uuid::Uuid;

use crate::error::{ApiResult, AppError};
use crate::models::*;
use crate::state::AppState;
use crate::{auth, matching, nlu};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/groups", get(list_groups))
        .route("/api/spots", get(list_spots))
        .route("/api/activities", get(list_activities).post(create_activity))
        .route("/api/activities/:id", get(get_activity).patch(update_activity))
        .route("/api/activities/:id/calendar.ics", get(activity_calendar))
        .route("/api/activities/:id/join", post(join_activity))
        .route("/api/activities/:id/cancel", post(cancel_activity))
        .route("/api/activities/:id/messages", post(post_message))
        .route("/api/links", post(create_links))
        .route("/api/links/:code", get(resolve_link))
        .route("/api/users", post(upsert_user))
        .route("/api/users/by-phone/:phone", get(user_by_phone))
        .route("/api/users/:id/activities", get(user_activities))
        .route("/api/nlu/parse", post(parse_sentence))
        .with_state(state)
}

/// Shared projection: one activity row with host, spot and participant nicknames.
const SELECT_ACTIVITY: &str = r#"
SELECT a.id, a.title, a.group_id, a.spot_id, a.area, a.tags, a.starts_at, a.recurring,
       a.capacity, a.notes, a.status,
       a.host_id AS host_id, h.nickname AS host_name, h.child_stage AS host_stage,
       hg.age_range AS host_child_range,
       s.name AS spot_name, s.area AS spot_area, s.type AS spot_type, s.ages AS spot_ages,
       s.lat AS spot_lat, s.lon AS spot_lon,
       COALESCE((SELECT array_agg(u.nickname ORDER BY pp.joined_at)
                 FROM kidgo_participants pp JOIN kidgo_users u ON u.id = pp.user_id
                 WHERE pp.activity_id = a.id), ARRAY[]::text[]) AS going
FROM kidgo_activities a
JOIN kidgo_users h ON h.id = a.host_id
JOIN kidgo_spots s ON s.id = a.spot_id
LEFT JOIN kidgo_groups hg ON hg.id = h.child_stage
"#;

async fn health() -> &'static str {
    "ok"
}

// ---------- Reference data ----------

async fn list_groups(State(st): State<AppState>) -> ApiResult<Json<Vec<Group>>> {
    let groups = sqlx::query_as::<_, Group>(
        "SELECT id, emoji, name, age_range, color FROM kidgo_groups ORDER BY sort_order",
    )
    .fetch_all(&st.pool)
    .await?;
    Ok(Json(groups))
}

async fn list_spots(State(st): State<AppState>) -> ApiResult<Json<Vec<Spot>>> {
    let spots = sqlx::query_as::<_, Spot>(
        "SELECT id, name, area, type, ages, lat, lon FROM kidgo_spots ORDER BY name",
    )
    .fetch_all(&st.pool)
    .await?;
    Ok(Json(spots))
}

// ---------- Activities ----------

#[derive(Deserialize)]
struct ListFilters {
    group: Option<String>,
    area: Option<String>,
    tag: Option<String>,
    /// today | week | all
    date: Option<String>,
    /// date | area
    sort: Option<String>,
    /// Optional manage token — annotates each activity with the viewer's role
    /// so the browse list can show "going"/"hosting" and hide the join button.
    token: Option<String>,
}

async fn list_activities(
    State(st): State<AppState>,
    headers: HeaderMap,
    Query(f): Query<ListFilters>,
) -> ApiResult<Json<Vec<Activity>>> {
    let mut qb = QueryBuilder::new(SELECT_ACTIVITY);
    qb.push(" WHERE a.status = 'open' AND a.starts_at >= date_trunc('day', now())");

    if let Some(g) = f.group.filter(|s| s != "all") {
        qb.push(" AND a.group_id = ").push_bind(g);
    }
    if let Some(ar) = f.area.filter(|s| s != "all") {
        qb.push(" AND a.area = ").push_bind(ar);
    }
    if let Some(t) = f.tag.filter(|s| s != "all") {
        qb.push(" AND ").push_bind(t).push(" = ANY(a.tags)");
    }
    match f.date.as_deref() {
        Some("today") => {
            qb.push(" AND a.starts_at < date_trunc('day', now()) + interval '1 day'");
        }
        Some("week") => {
            qb.push(" AND a.starts_at < date_trunc('day', now()) + interval '7 days'");
        }
        _ => {}
    }
    match f.sort.as_deref() {
        Some("area") => qb.push(" ORDER BY a.area, a.starts_at"),
        _ => qb.push(" ORDER BY a.starts_at"),
    };

    let rows: Vec<ActivityRow> = qb.build_query_as().fetch_all(&st.pool).await?;

    // Annotate each row with the viewer's role, if a valid token was supplied.
    // One batch query fetches which of these activities they've joined.
    let viewer = optional_auth(&st, &headers, &f.token);
    let joined: std::collections::HashSet<Uuid> = match viewer {
        Some(uid) => {
            let ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
            sqlx::query_scalar(
                "SELECT activity_id FROM kidgo_participants
                 WHERE user_id = $1 AND activity_id = ANY($2)",
            )
            .bind(uid)
            .bind(&ids)
            .fetch_all(&st.pool)
            .await?
            .into_iter()
            .collect()
        }
        None => Default::default(),
    };

    let out = rows
        .into_iter()
        .map(|r| {
            let role = viewer.and_then(|uid| {
                if uid == r.host_id {
                    Some("owner")
                } else if joined.contains(&r.id) {
                    Some("participant")
                } else {
                    None
                }
            });
            let mut a = r.into_activity(vec![]);
            a.viewer = role.map(|role| ViewerInfo { id: viewer.unwrap(), role: role.into() });
            a
        })
        .collect();
    Ok(Json(out))
}

/// A manage token may arrive as `?token=` (the link the bot sends) or as an
/// `Authorization: Bearer` header (writes issued by the frontend).
#[derive(Deserialize)]
struct AuthQuery {
    token: Option<String>,
}

async fn get_activity(
    State(st): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Query(q): Query<AuthQuery>,
) -> ApiResult<Json<Activity>> {
    let row = fetch_activity_row(&st.pool, id).await?.ok_or(AppError::NotFound)?;
    let host_id = row.host_id;

    // An expired/invalid token on a read just degrades to the public view, so a
    // stale link still shows the activity (with the "I want to come" button)
    // instead of an error — the parent re-requests a fresh link to manage it.
    let viewer_id = optional_auth(&st, &headers, &q.token);
    let role = match viewer_id {
        Some(uid) => viewer_role(&st.pool, id, uid, host_id).await?,
        None => None,
    };

    let messages = fetch_messages(&st.pool, id, viewer_id).await?;
    let mut activity = row.into_activity(messages);
    activity.viewer = role.map(|r| ViewerInfo {
        id: viewer_id.unwrap(),
        role: r.into(),
    });
    Ok(Json(activity))
}

/// Serve an activity as a downloadable `.ics` calendar file.
///
/// Served from a real URL with `Content-Type: text/calendar` and an *inline*
/// disposition so iOS Safari opens the native "Add to Calendar" sheet instead
/// of just saving the file (a `data:` URL + `download` attribute does not).
async fn activity_calendar(
    State(st): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    let row = fetch_activity_row(&st.pool, id).await?.ok_or(AppError::NotFound)?;
    let body = build_ics(&row);
    let filename = ics_filename(&row.title, &row.id);
    let headers = [
        (header::CONTENT_TYPE, "text/calendar; charset=utf-8".to_string()),
        (
            header::CONTENT_DISPOSITION,
            format!("inline; filename=\"{filename}\""),
        ),
    ];
    Ok((headers, body).into_response())
}

async fn create_activity(
    State(st): State<AppState>,
    Json(body): Json<CreateActivity>,
) -> ApiResult<Json<Activity>> {
    // Host must exist; use their child's stage as the default group.
    let host_stage: Option<String> =
        sqlx::query_scalar("SELECT child_stage FROM kidgo_users WHERE id = $1")
            .bind(body.host_id)
            .fetch_optional(&st.pool)
            .await?
            .ok_or_else(|| AppError::BadRequest("unknown host".into()))?;

    let group = body
        .group
        .or(host_stage)
        .ok_or_else(|| AppError::BadRequest("group is required (host has no stage set)".into()))?;

    // Spot drives the area, so the two never disagree.
    let spot: Option<(String, String)> =
        sqlx::query_as("SELECT area, name FROM kidgo_spots WHERE id = $1")
            .bind(&body.spot_id)
            .fetch_optional(&st.pool)
            .await?;
    let (area, spot_name) = spot.ok_or_else(|| AppError::BadRequest("unknown spot".into()))?;

    let tags = body.tags.unwrap_or_default();
    let title = body.title.unwrap_or_else(|| default_title(&tags, &spot_name));
    let id = Uuid::new_v4();

    let mut tx = st.pool.begin().await?;
    sqlx::query(
        "INSERT INTO kidgo_activities
           (id, title, group_id, spot_id, area, tags, starts_at, recurring, host_id, capacity, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    )
    .bind(id)
    .bind(&title)
    .bind(&group)
    .bind(&body.spot_id)
    .bind(&area)
    .bind(&tags)
    .bind(body.when)
    .bind(body.recurring.unwrap_or(false))
    .bind(body.host_id)
    .bind(body.capacity.unwrap_or(6))
    .bind(&body.notes)
    .execute(&mut *tx)
    .await?;

    // The host counts as the first family going.
    sqlx::query(
        "INSERT INTO kidgo_participants (activity_id, user_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING",
    )
    .bind(id)
    .bind(body.host_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    // Smart Match (PRD §4.5) — best effort, never blocks activity creation.
    if let Err(e) = matching::recompute(&st.pool, id).await {
        tracing::warn!("matching failed for {id}: {e:?}");
    }

    let row = fetch_activity_row(&st.pool, id).await?.ok_or(AppError::NotFound)?;
    Ok(Json(row.into_activity(vec![])))
}

async fn join_activity(
    State(st): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<JoinBody>,
) -> ApiResult<Json<Activity>> {
    let exists: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM kidgo_activities WHERE id = $1 AND status = 'open'")
            .bind(id)
            .fetch_optional(&st.pool)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    sqlx::query(
        "INSERT INTO kidgo_participants (activity_id, user_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING",
    )
    .bind(id)
    .bind(body.user_id)
    .execute(&st.pool)
    .await?;

    let row = fetch_activity_row(&st.pool, id).await?.ok_or(AppError::NotFound)?;
    let messages = fetch_messages(&st.pool, id, Some(body.user_id)).await?;
    Ok(Json(row.into_activity(messages)))
}

async fn post_message(
    State(st): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Query(q): Query<AuthQuery>,
    Json(body): Json<PostMessage>,
) -> ApiResult<Json<Vec<Message>>> {
    // The token proves who is posting (PRD §4.4); the body no longer carries a
    // user id, so a parent can only ever message as themselves.
    let user_id = require_auth(&st, &headers, &q.token)?;
    if body.body.trim().is_empty() {
        return Err(AppError::BadRequest("message body is empty".into()));
    }
    // Only the host or a participant may post.
    if viewer_role(&st.pool, id, user_id, host_id_of(&st.pool, id).await?).await?.is_none() {
        return Err(AppError::Conflict("join the activity before messaging".into()));
    }

    sqlx::query(
        "INSERT INTO kidgo_messages (id, activity_id, user_id, body) VALUES ($1,$2,$3,$4)",
    )
    .bind(Uuid::new_v4())
    .bind(id)
    .bind(user_id)
    .bind(body.body.trim())
    .execute(&st.pool)
    .await?;

    let messages = fetch_messages(&st.pool, id, Some(user_id)).await?;
    Ok(Json(messages))
}

/// Unambiguous base32 alphabet (digits 2-9 + A-Z without I/O) for short codes.
/// 256 % 32 == 0, so mapping a random byte with `% 32` is perfectly uniform.
const CODE_ALPHABET: &[u8; 32] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LEN: usize = 7;

fn gen_code() -> String {
    Uuid::new_v4()
        .into_bytes()
        .iter()
        .take(CODE_LEN)
        .map(|b| CODE_ALPHABET[(*b as usize) % 32] as char)
        .collect()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateLinks {
    user_id: Uuid,
    activity_ids: Vec<Uuid>,
}

/// Create short manage codes for a batch of the user's activities. Returns one
/// `{ activityId, code }` per existing activity, all sharing one 1-hour expiry.
async fn create_links(
    State(st): State<AppState>,
    Json(body): Json<CreateLinks>,
) -> ApiResult<Json<serde_json::Value>> {
    let exists: Option<Uuid> = sqlx::query_scalar("SELECT id FROM kidgo_users WHERE id = $1")
        .bind(body.user_id)
        .fetch_optional(&st.pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    // Opportunistically sweep expired codes so the table stays small.
    sqlx::query("DELETE FROM kidgo_link_codes WHERE expires_at < now()")
        .execute(&st.pool)
        .await?;

    let expires_at = Utc::now() + Duration::minutes(auth::TOKEN_TTL_MINUTES);
    let mut links = Vec::new();
    for activity_id in body.activity_ids {
        // Skip ids that don't resolve to a real activity.
        let activity_exists: Option<Uuid> =
            sqlx::query_scalar("SELECT id FROM kidgo_activities WHERE id = $1")
                .bind(activity_id)
                .fetch_optional(&st.pool)
                .await?;
        if activity_exists.is_none() {
            continue;
        }

        // Insert with a fresh code, retrying on the (vanishingly rare) collision.
        let mut code = gen_code();
        for _ in 0..5 {
            let res = sqlx::query(
                "INSERT INTO kidgo_link_codes (code, user_id, activity_id, expires_at)
                 VALUES ($1,$2,$3,$4)",
            )
            .bind(&code)
            .bind(body.user_id)
            .bind(activity_id)
            .bind(expires_at)
            .execute(&st.pool)
            .await;
            match res {
                Ok(_) => break,
                Err(sqlx::Error::Database(e)) if e.is_unique_violation() => code = gen_code(),
                Err(e) => return Err(e.into()),
            }
        }
        links.push(json!({ "activityId": activity_id, "code": code }));
    }

    Ok(Json(json!({ "expiresAt": expires_at, "links": links })))
}

/// Resolve a short code into a session token (and the activity to open).
/// Unknown code → 404. Expired code → `expired: true` with no token, so the
/// landing page can offer a one-tap refresh via the bot.
async fn resolve_link(
    State(st): State<AppState>,
    Path(code): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let row: Option<(Uuid, Uuid, DateTime<Utc>)> = sqlx::query_as(
        "SELECT user_id, activity_id, expires_at FROM kidgo_link_codes WHERE code = $1",
    )
    .bind(&code)
    .fetch_optional(&st.pool)
    .await?;
    let (user_id, activity_id, expires_at) = row.ok_or(AppError::NotFound)?;

    if expires_at <= Utc::now() {
        return Ok(Json(json!({ "activityId": activity_id, "expired": true })));
    }

    let (token, token_exp) = auth::mint(&st.link_secret, user_id);
    Ok(Json(json!({
        "activityId": activity_id,
        "token": token,
        "expired": false,
        "expiresAt": token_exp,
    })))
}

async fn update_activity(
    State(st): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Query(q): Query<AuthQuery>,
    Json(body): Json<UpdateActivity>,
) -> ApiResult<Json<Activity>> {
    let user_id = require_auth(&st, &headers, &q.token)?;
    let host_id = host_id_of(&st.pool, id).await?;
    if host_id != user_id {
        return Err(AppError::Forbidden("only the host can edit this activity".into()));
    }

    // Spot drives the area, so resolve the new area up front if the spot changes.
    let new_area: Option<String> = match &body.spot_id {
        Some(spot_id) => Some(
            sqlx::query_scalar("SELECT area FROM kidgo_spots WHERE id = $1")
                .bind(spot_id)
                .fetch_optional(&st.pool)
                .await?
                .ok_or_else(|| AppError::BadRequest("unknown spot".into()))?,
        ),
        None => None,
    };

    let mut qb = QueryBuilder::new("UPDATE kidgo_activities SET ");
    let mut n = 0;
    {
        let mut set = qb.separated(", ");
        if let Some(v) = &body.title {
            set.push("title = ").push_bind_unseparated(v);
            n += 1;
        }
        if let Some(v) = body.when {
            set.push("starts_at = ").push_bind_unseparated(v);
            n += 1;
        }
        if let Some(v) = &body.tags {
            set.push("tags = ").push_bind_unseparated(v);
            n += 1;
        }
        if let Some(v) = body.capacity {
            set.push("capacity = ").push_bind_unseparated(v);
            n += 1;
        }
        if let Some(v) = &body.notes {
            set.push("notes = ").push_bind_unseparated(v);
            n += 1;
        }
        if let Some(v) = body.recurring {
            set.push("recurring = ").push_bind_unseparated(v);
            n += 1;
        }
        if let (Some(spot_id), Some(area)) = (&body.spot_id, &new_area) {
            set.push("spot_id = ").push_bind_unseparated(spot_id);
            set.push("area = ").push_bind_unseparated(area);
            n += 1;
        }
    }

    if n > 0 {
        qb.push(" WHERE id = ").push_bind(id);
        qb.build().execute(&st.pool).await?;
    }

    let row = fetch_activity_row(&st.pool, id).await?.ok_or(AppError::NotFound)?;
    let mut activity = row.into_activity(vec![]);
    activity.viewer = Some(ViewerInfo { id: user_id, role: "owner".into() });
    Ok(Json(activity))
}

/// Soft-cancel: set status='cancelled' so the activity drops out of browse/join
/// (those queries filter `status = 'open'`) while keeping its history & messages.
async fn cancel_activity(
    State(st): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Query(q): Query<AuthQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let user_id = require_auth(&st, &headers, &q.token)?;
    let result = sqlx::query(
        "UPDATE kidgo_activities SET status = 'cancelled'
         WHERE id = $1 AND host_id = $2 AND status = 'open'",
    )
    .bind(id)
    .bind(user_id)
    .execute(&st.pool)
    .await?;

    if result.rows_affected() == 0 {
        // Distinguish "not yours" from "gone / already cancelled" for a clear error.
        return Err(match host_id_lookup(&st.pool, id).await? {
            Some(host) if host != user_id => {
                AppError::Forbidden("only the host can cancel this activity".into())
            }
            Some(_) => AppError::Conflict("this activity is already cancelled".into()),
            None => AppError::NotFound,
        });
    }
    Ok(Json(json!({ "status": "cancelled" })))
}

// ---------- Users ----------

async fn upsert_user(
    State(st): State<AppState>,
    Json(body): Json<UpsertUser>,
) -> ApiResult<Json<User>> {
    if body.nickname.trim().is_empty() || body.phone.trim().is_empty() {
        return Err(AppError::BadRequest("nickname and phone are required".into()));
    }
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO kidgo_users (id, nickname, phone, city, child_stage, interests)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (phone) DO UPDATE
           SET nickname = EXCLUDED.nickname,
               city = EXCLUDED.city,
               child_stage = COALESCE(EXCLUDED.child_stage, kidgo_users.child_stage),
               interests = EXCLUDED.interests
         RETURNING id, nickname, phone, city, child_stage, interests, push_optout",
    )
    .bind(Uuid::new_v4())
    .bind(body.nickname.trim())
    .bind(normalize_phone(&body.phone))
    .bind(body.city.unwrap_or_else(|| "Maastricht".into()))
    .bind(body.child_stage)
    .bind(body.interests.unwrap_or_default())
    .fetch_one(&st.pool)
    .await?;
    Ok(Json(user))
}

async fn user_by_phone(
    State(st): State<AppState>,
    Path(phone): Path<String>,
) -> ApiResult<Json<User>> {
    let user = sqlx::query_as::<_, User>(
        "SELECT id, nickname, phone, city, child_stage, interests, push_optout
         FROM kidgo_users WHERE phone = $1",
    )
    .bind(normalize_phone(&phone))
    .fetch_optional(&st.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(user))
}

async fn user_activities(
    State(st): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Vec<Activity>>> {
    let sql = format!(
        "{SELECT_ACTIVITY} WHERE a.host_id = $1 OR EXISTS \
         (SELECT 1 FROM kidgo_participants pp WHERE pp.activity_id = a.id AND pp.user_id = $1) \
         ORDER BY a.starts_at"
    );
    let rows = sqlx::query_as::<_, ActivityRow>(&sql)
        .bind(id)
        .fetch_all(&st.pool)
        .await?;
    Ok(Json(rows.into_iter().map(|r| r.into_activity(vec![])).collect()))
}

// ---------- NLU ----------

#[derive(Deserialize)]
struct ParseBody {
    text: String,
}

async fn parse_sentence(
    State(st): State<AppState>,
    Json(body): Json<ParseBody>,
) -> ApiResult<Json<nlu::Parsed>> {
    let parsed = nlu::parse(&st, &body.text).await?;
    Ok(Json(parsed))
}

// ---------- helpers ----------

async fn fetch_activity_row(pool: &PgPool, id: Uuid) -> Result<Option<ActivityRow>, sqlx::Error> {
    let sql = format!("{SELECT_ACTIVITY} WHERE a.id = $1");
    sqlx::query_as::<_, ActivityRow>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
}

// ---------- auth helpers ----------

/// Read a manage token from the `?token=` query or an `Authorization: Bearer`
/// header (query wins, since that's the link the bot hands out).
fn extract_token(headers: &HeaderMap, query: &Option<String>) -> Option<String> {
    if let Some(t) = query.as_deref().filter(|t| !t.is_empty()) {
        return Some(t.to_string());
    }
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t.trim().to_string())
}

/// Resolve the viewer for a read: a missing or invalid token is simply anonymous.
fn optional_auth(st: &AppState, headers: &HeaderMap, query: &Option<String>) -> Option<Uuid> {
    let token = extract_token(headers, query)?;
    auth::verify(&st.link_secret, &token).ok()
}

/// Resolve the user for a write: a missing/invalid/expired token is a hard 401.
fn require_auth(st: &AppState, headers: &HeaderMap, query: &Option<String>) -> ApiResult<Uuid> {
    let token = extract_token(headers, query)
        .ok_or_else(|| AppError::Unauthorized("a manage link is required for this action".into()))?;
    auth::verify(&st.link_secret, &token)
}

/// The viewer's role on an activity: owner (host), participant, or neither.
async fn viewer_role(
    pool: &PgPool,
    activity_id: Uuid,
    user_id: Uuid,
    host_id: Uuid,
) -> Result<Option<&'static str>, sqlx::Error> {
    if user_id == host_id {
        return Ok(Some("owner"));
    }
    let joined: Option<i32> = sqlx::query_scalar(
        "SELECT 1 FROM kidgo_participants WHERE activity_id = $1 AND user_id = $2",
    )
    .bind(activity_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(joined.map(|_| "participant"))
}

/// Host id for an existing activity, or `NotFound`.
async fn host_id_of(pool: &PgPool, id: Uuid) -> ApiResult<Uuid> {
    host_id_lookup(pool, id).await?.ok_or(AppError::NotFound)
}

async fn host_id_lookup(pool: &PgPool, id: Uuid) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar("SELECT host_id FROM kidgo_activities WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

async fn fetch_messages(
    pool: &PgPool,
    activity_id: Uuid,
    viewer: Option<Uuid>,
) -> Result<Vec<Message>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String, Uuid, String)>(
        "SELECT u.nickname, m.user_id, m.body
         FROM kidgo_messages m JOIN kidgo_users u ON u.id = m.user_id
         WHERE m.activity_id = $1 ORDER BY m.created_at",
    )
    .bind(activity_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(from, uid, text)| Message {
            from,
            text,
            mine: Some(uid) == viewer,
        })
        .collect())
}

/// Default event length when an activity carries no explicit duration.
const CALENDAR_DURATION_HOURS: i64 = 2;

/// Build an RFC 5545 calendar file for one activity (single VEVENT).
fn build_ics(row: &ActivityRow) -> String {
    let start = row.starts_at;
    let end = start + Duration::hours(CALENDAR_DURATION_HOURS);
    let stamp = |dt: DateTime<Utc>| dt.format("%Y%m%dT%H%M%SZ").to_string();
    let location = format!("{}, {}, Maastricht", row.spot_name, row.area);
    let description = row
        .notes
        .clone()
        .unwrap_or_else(|| format!("A KidGo activity at {}.", row.spot_name));

    let mut lines = vec![
        "BEGIN:VCALENDAR".to_string(),
        "VERSION:2.0".to_string(),
        "PRODID:-//KidGo//Activities//EN".to_string(),
        "CALSCALE:GREGORIAN".to_string(),
        "METHOD:PUBLISH".to_string(),
        "BEGIN:VEVENT".to_string(),
        format!("UID:{}@kidgo", row.id),
        format!("DTSTAMP:{}", stamp(Utc::now())),
        format!("DTSTART:{}", stamp(start)),
        format!("DTEND:{}", stamp(end)),
        format!("SUMMARY:{}", ics_escape(&format!("KidGo · {}", row.title))),
        format!("LOCATION:{}", ics_escape(&location)),
        format!("DESCRIPTION:{}", ics_escape(&description)),
    ];
    if row.recurring {
        lines.push("RRULE:FREQ=WEEKLY".to_string());
    }
    lines.push("END:VEVENT".to_string());
    lines.push("END:VCALENDAR".to_string());
    // iCalendar requires CRLF line endings.
    lines.join("\r\n")
}

/// Escape a text value per RFC 5545 (backslash, comma, semicolon, newline).
fn ics_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
}

/// A filesystem-friendly download name, e.g. `kidgo-sandbox-afternoon.ics`.
fn ics_filename(title: &str, id: &Uuid) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for c in title.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
            prev_dash = false;
        } else if !prev_dash {
            slug.push('-');
            prev_dash = true;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        format!("kidgo-{id}.ics")
    } else {
        format!("kidgo-{slug}.ics")
    }
}

fn default_title(tags: &[String], spot_name: &str) -> String {
    match tags.first() {
        Some(t) => format!("{} at {spot_name}", capitalize(t)),
        None => format!("Playdate at {spot_name}"),
    }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

/// Keep only digits — WhatsApp ids are bare E.164 without "+".
fn normalize_phone(raw: &str) -> String {
    raw.chars().filter(|c| c.is_ascii_digit()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_row(recurring: bool, notes: Option<&str>) -> ActivityRow {
        ActivityRow {
            id: Uuid::nil(),
            title: "Weekly Wednesday sandbox".into(),
            group_id: "toddler".into(),
            spot_id: "stadspark".into(),
            area: "Centrum".into(),
            tags: vec!["sandbox".into()],
            starts_at: DateTime::parse_from_rfc3339("2026-06-03T14:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            recurring,
            capacity: 6,
            notes: notes.map(Into::into),
            status: "open".into(),
            host_id: Uuid::nil(),
            host_name: "Amy".into(),
            host_stage: Some("toddler".into()),
            host_child_range: Some("12–24 months".into()),
            spot_name: "Stadspark".into(),
            spot_area: "Centrum".into(),
            spot_type: "Outdoor / sandbox".into(),
            spot_ages: "All ages".into(),
            spot_lat: Some(50.8452),
            spot_lon: Some(5.6858),
            going: vec![],
        }
    }

    #[test]
    fn ics_has_event_with_two_hour_window_and_crlf() {
        let ics = build_ics(&sample_row(false, Some("Bring a spade; meet by the oak, near entrance")));
        assert!(ics.contains("BEGIN:VCALENDAR"));
        assert!(ics.contains("BEGIN:VEVENT"));
        assert!(ics.contains("DTSTART:20260603T140000Z"));
        assert!(ics.contains("DTEND:20260603T160000Z"));
        assert!(ics.contains("SUMMARY:KidGo · Weekly Wednesday sandbox"));
        // RFC 5545 escaping of comma + semicolon in free text.
        assert!(ics.contains("DESCRIPTION:Bring a spade\\; meet by the oak\\, near entrance"));
        assert!(ics.contains("LOCATION:Stadspark\\, Centrum\\, Maastricht"));
        assert!(ics.contains("\r\n"));
        // A one-off activity must not carry a recurrence rule.
        assert!(!ics.contains("RRULE"));
    }

    #[test]
    fn recurring_activity_gets_weekly_rule() {
        let ics = build_ics(&sample_row(true, None));
        assert!(ics.contains("RRULE:FREQ=WEEKLY"));
        // Falls back to a generated description when notes are absent.
        assert!(ics.contains("DESCRIPTION:A KidGo activity at Stadspark."));
    }

    #[test]
    fn filename_is_slugified_with_fallback() {
        assert_eq!(
            ics_filename("Weekly Wednesday sandbox", &Uuid::nil()),
            "kidgo-weekly-wednesday-sandbox.ics"
        );
        // No alphanumerics → fall back to the id.
        assert_eq!(
            ics_filename("!!!", &Uuid::nil()),
            format!("kidgo-{}.ics", Uuid::nil())
        );
    }
}
