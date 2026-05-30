//! Smart Match scoring (PRD §4.5). After an activity is created we score the
//! other open activities and persist the top suggestions for the creator.
//!
//! Weight order (decreasing): same-day time overlap > age-group match >
//! location proximity (same area) > activity-type (tag) similarity.

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

const STAGES: [&str; 5] = ["newborn", "explorer", "toddler", "talker", "creator"];
const MAX_SUGGESTIONS: usize = 3;

struct Candidate {
    id: Uuid,
    group_id: String,
    area: String,
    tags: Vec<String>,
    starts_at: DateTime<Utc>,
}

pub async fn recompute(pool: &PgPool, activity_id: Uuid) -> Result<(), sqlx::Error> {
    let me: Option<(String, String, Vec<String>, DateTime<Utc>, Uuid)> = sqlx::query_as(
        "SELECT group_id, area, tags, starts_at, host_id FROM kidgo_activities WHERE id = $1",
    )
    .bind(activity_id)
    .fetch_optional(pool)
    .await?;
    let Some((group, area, tags, starts_at, host_id)) = me else {
        return Ok(());
    };

    let cands: Vec<Candidate> = sqlx::query_as::<_, (Uuid, String, String, Vec<String>, DateTime<Utc>)>(
        "SELECT id, group_id, area, tags, starts_at
         FROM kidgo_activities
         WHERE id <> $1 AND status = 'open' AND host_id <> $2 AND starts_at >= now()",
    )
    .bind(activity_id)
    .bind(host_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|(id, group_id, area, tags, starts_at)| Candidate { id, group_id, area, tags, starts_at })
    .collect();

    let mut scored: Vec<(Uuid, f64)> = cands
        .iter()
        .map(|c| (c.id, score(&group, &area, &tags, starts_at, c)))
        .filter(|(_, s)| *s > 0.0)
        .collect();
    scored.sort_by(|a, b| b.1.total_cmp(&a.1));
    scored.truncate(MAX_SUGGESTIONS);

    for (suggested_id, s) in scored {
        sqlx::query(
            "INSERT INTO kidgo_match_suggestions (id, activity_id, suggested_id, score)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (activity_id, suggested_id) DO UPDATE SET score = EXCLUDED.score",
        )
        .bind(Uuid::new_v4())
        .bind(activity_id)
        .bind(suggested_id)
        .bind(s)
        .execute(pool)
        .await?;
    }
    Ok(())
}

fn score(group: &str, area: &str, tags: &[String], starts_at: DateTime<Utc>, c: &Candidate) -> f64 {
    let mut s = 0.0;
    // same day (strongest signal)
    if starts_at.date_naive() == c.starts_at.date_naive() {
        s += 4.0;
    }
    // age-group: exact = 3, adjacent stage = 1
    match (stage_idx(group), stage_idx(&c.group_id)) {
        (Some(a), Some(b)) if a == b => s += 3.0,
        (Some(a), Some(b)) if a.abs_diff(b) == 1 => s += 1.0,
        _ => {}
    }
    // same area
    if area == c.area {
        s += 2.0;
    }
    // shared activity tags
    let shared = tags.iter().filter(|t| c.tags.contains(t)).count();
    s += shared as f64 * 0.5;
    s
}

fn stage_idx(id: &str) -> Option<usize> {
    STAGES.iter().position(|s| *s == id)
}
