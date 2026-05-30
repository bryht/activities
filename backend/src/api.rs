use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use sqlx::{PgPool, QueryBuilder};
use uuid::Uuid;

use crate::error::{ApiResult, AppError};
use crate::models::*;
use crate::state::AppState;
use crate::{matching, nlu};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/groups", get(list_groups))
        .route("/api/spots", get(list_spots))
        .route("/api/activities", get(list_activities).post(create_activity))
        .route("/api/activities/:id", get(get_activity))
        .route("/api/activities/:id/join", post(join_activity))
        .route("/api/activities/:id/messages", post(post_message))
        .route("/api/users", post(upsert_user))
        .route("/api/users/by-phone/:phone", get(user_by_phone))
        .route("/api/users/:id/activities", get(user_activities))
        .route("/api/nlu/parse", post(parse_sentence))
        .with_state(state)
}

/// Shared projection: one activity row with host, spot and participant nicknames.
const SELECT_ACTIVITY: &str = r#"
SELECT a.id, a.title, a.group_id, a.spot_id, a.area, a.tags, a.starts_at, a.recurring,
       a.capacity, a.notes,
       a.host_id AS host_id, h.nickname AS host_name, h.child_stage AS host_stage,
       hg.age_range AS host_child_range,
       s.name AS spot_name, s.area AS spot_area, s.type AS spot_type, s.ages AS spot_ages,
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
        "SELECT id, name, area, type, ages FROM kidgo_spots ORDER BY name",
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
}

async fn list_activities(
    State(st): State<AppState>,
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
    let out = rows.into_iter().map(|r| r.into_activity(vec![])).collect();
    Ok(Json(out))
}

#[derive(Deserialize)]
struct Viewer {
    #[serde(rename = "userId")]
    user_id: Option<Uuid>,
}

async fn get_activity(
    State(st): State<AppState>,
    Path(id): Path<Uuid>,
    Query(v): Query<Viewer>,
) -> ApiResult<Json<Activity>> {
    let row = fetch_activity_row(&st.pool, id).await?.ok_or(AppError::NotFound)?;
    let messages = fetch_messages(&st.pool, id, v.user_id).await?;
    Ok(Json(row.into_activity(messages)))
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
    Json(body): Json<PostMessage>,
) -> ApiResult<Json<Vec<Message>>> {
    if body.body.trim().is_empty() {
        return Err(AppError::BadRequest("message body is empty".into()));
    }
    // Privacy (PRD §4.4): only the host or a participant may post.
    let allowed: Option<i32> = sqlx::query_scalar(
        "SELECT 1 FROM kidgo_participants WHERE activity_id = $1 AND user_id = $2
         UNION SELECT 1 FROM kidgo_activities WHERE id = $1 AND host_id = $2",
    )
    .bind(id)
    .bind(body.user_id)
    .fetch_optional(&st.pool)
    .await?;
    if allowed.is_none() {
        return Err(AppError::Conflict("join the activity before messaging".into()));
    }

    sqlx::query(
        "INSERT INTO kidgo_messages (id, activity_id, user_id, body) VALUES ($1,$2,$3,$4)",
    )
    .bind(Uuid::new_v4())
    .bind(id)
    .bind(body.user_id)
    .bind(body.body.trim())
    .execute(&st.pool)
    .await?;

    let messages = fetch_messages(&st.pool, id, Some(body.user_id)).await?;
    Ok(Json(messages))
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
