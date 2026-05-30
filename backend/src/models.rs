use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ---------- Reference data ----------

#[derive(Serialize, FromRow)]
pub struct Group {
    pub id: String,
    pub emoji: String,
    pub name: String,
    #[sqlx(rename = "age_range")]
    pub range: String,
    pub color: String,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Spot {
    pub id: String,
    pub name: String,
    pub area: String,
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    pub kind: String,
    pub ages: String,
    /// Geographic coordinates for the map view. Nullable: a spot without
    /// coordinates is omitted from the map but still listed everywhere else.
    pub lat: Option<f64>,
    pub lon: Option<f64>,
}

// ---------- Users ----------

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: Uuid,
    pub nickname: String,
    pub phone: String,
    pub city: String,
    pub child_stage: Option<String>,
    pub interests: Vec<String>,
    pub push_optout: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertUser {
    pub nickname: String,
    pub phone: String,
    pub city: Option<String>,
    pub child_stage: Option<String>,
    pub interests: Option<Vec<String>>,
}

// ---------- Activities ----------

/// JSON shape returned to the frontend & bot. Mirrors the prototype's
/// `activities.js` object so the website needs no reshaping.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: Uuid,
    pub title: String,
    pub group: String,
    pub spot_id: String,
    pub spot: Spot,
    pub area: String,
    pub tags: Vec<String>,
    pub when: DateTime<Utc>,
    pub recurring: bool,
    pub host: Host,
    pub going: Vec<String>,
    pub capacity: i32,
    pub notes: Option<String>,
    pub messages: Vec<Message>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Host {
    pub id: Uuid,
    pub name: String,
    /// Stage range label, e.g. "12–24 months" (we group by stage, not raw age).
    pub child: Option<String>,
    pub child_group: Option<String>,
}

#[derive(Serialize)]
pub struct Message {
    pub from: String,
    pub text: String,
    pub mine: bool,
}

/// Flat row from the big activity SELECT (joins host, spot, participants).
#[derive(FromRow)]
pub struct ActivityRow {
    pub id: Uuid,
    pub title: String,
    pub group_id: String,
    pub spot_id: String,
    pub area: String,
    pub tags: Vec<String>,
    pub starts_at: DateTime<Utc>,
    pub recurring: bool,
    pub capacity: i32,
    pub notes: Option<String>,
    pub host_id: Uuid,
    pub host_name: String,
    pub host_stage: Option<String>,
    pub host_child_range: Option<String>,
    pub spot_name: String,
    pub spot_area: String,
    pub spot_type: String,
    pub spot_ages: String,
    pub spot_lat: Option<f64>,
    pub spot_lon: Option<f64>,
    pub going: Vec<String>,
}

impl ActivityRow {
    pub fn into_activity(self, messages: Vec<Message>) -> Activity {
        Activity {
            id: self.id,
            title: self.title,
            group: self.group_id,
            spot_id: self.spot_id.clone(),
            spot: Spot {
                id: self.spot_id,
                name: self.spot_name,
                area: self.spot_area,
                kind: self.spot_type,
                ages: self.spot_ages,
                lat: self.spot_lat,
                lon: self.spot_lon,
            },
            area: self.area,
            tags: self.tags,
            when: self.starts_at,
            recurring: self.recurring,
            host: Host {
                id: self.host_id,
                name: self.host_name,
                child: self.host_child_range,
                child_group: self.host_stage,
            },
            going: self.going,
            capacity: self.capacity,
            notes: self.notes,
            messages,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateActivity {
    pub host_id: Uuid,
    pub title: Option<String>,
    pub group: Option<String>,
    pub spot_id: String,
    pub tags: Option<Vec<String>>,
    pub when: DateTime<Utc>,
    pub recurring: Option<bool>,
    pub capacity: Option<i32>,
    pub notes: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinBody {
    pub user_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostMessage {
    pub user_id: Uuid,
    pub body: String,
}
