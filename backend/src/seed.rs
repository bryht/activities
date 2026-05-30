use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc, Weekday};
use sqlx::PgPool;
use uuid::Uuid;

/// Developmental-stage groups (PRD §4.1) — the brand core. `(id, emoji, name, range, color, order)`.
const GROUPS: &[(&str, &str, &str, &str, &str)] = &[
    ("newborn", "🍼", "Newborn", "0–6 months", "bg-sky-100 text-sky-700 ring-sky-200"),
    ("explorer", "🐛", "Explorer", "6–12 months", "bg-emerald-100 text-emerald-700 ring-emerald-200"),
    ("toddler", "🚶", "Toddler", "12–24 months", "bg-amber-100 text-amber-700 ring-amber-200"),
    ("talker", "🗣️", "Talker", "2–3 years", "bg-violet-100 text-violet-700 ring-violet-200"),
    ("creator", "🎨", "Creator", "3–5 years", "bg-rose-100 text-rose-700 ring-rose-200"),
];

/// Maastricht kid-friendly spots (PRD §7). `(id, name, area, type, ages, lat, lon)`.
/// Coordinates are approximate (hand-placed around Maastricht, ~50.85 N, 5.69 E)
/// and good enough to plot a recognisable pin on the map view.
const SPOTS: &[(&str, &str, &str, &str, &str, f64, f64)] = &[
    ("stadspark", "Stadspark", "Centrum", "Outdoor / sandbox", "All ages", 50.8447, 5.6890),
    ("bonnefantenpark", "Bonnefantenpark", "Randwyck", "Outdoor / playground", "1–5", 50.8419, 5.7045),
    ("stadtbibliotheek", "Stadtbibliotheek", "Centrum", "Indoor / picture books", "0–5", 50.8475, 5.6995),
    ("geusseltbad", "Geusseltbad", "Noord", "Indoor pool", "6m+", 50.8592, 5.7144),
    ("playzone", "Playzone Maastricht", "Noord", "Indoor play", "1–5", 50.8635, 5.6975),
    ("dierenpark", "Dierenpark Maastricht", "Noord", "Zoo", "1–5", 50.8688, 5.7090),
    ("frontenpark", "Frontenpark", "Centrum", "Outdoor walking", "All ages", 50.8558, 5.6852),
    ("pietersberg", "Sint Pietersberg", "Zuid", "Outdoor / caves", "3+", 50.8347, 5.6862),
    ("fortwillem", "Speeltuin Fort Willem", "West", "Outdoor / playground", "1–12", 50.8576, 5.6829),
    ("centreceramique", "Centre Céramique", "Centrum", "Indoor / library", "0–8", 50.8456, 5.7029),
];

/// A real, weekly community activity (PRD §4.1). Unlike user posts, these are
/// seeded so the public board is never empty: each is recreated with a stable
/// UUID and its `starts_at` recomputed to the next upcoming occurrence on every
/// boot, so it always shows as a future event. Hosted by the `KidGo Community`
/// account. `tags`/`group`/`spot` reuse the seeded reference data above.
struct Recurring {
    id: &'static str,
    weekday: Weekday,
    /// Local Maastricht start hour (24h). End time lives in `notes`.
    hour: u32,
    title: &'static str,
    group: &'static str, // kidgo_groups.id
    spot_id: &'static str,
    area: &'static str, // must match the spot's area
    tags: &'static [&'static str],
    capacity: i32,
    notes: &'static str,
}

/// The system account that hosts the seeded community activities.
const COMMUNITY_HOST_ID: &str = "00000000-0000-0000-0000-0000000000c0";
const COMMUNITY_HOST_PHONE: &str = "000000000000";

/// Real recurring kid activities around Maastricht (verified against each
/// venue's public info — see PR notes). Times are local wall-clock.
const RECURRING: &[Recurring] = &[
    Recurring {
        id: "00000000-0000-0000-0000-0000000000a1",
        weekday: Weekday::Sat,
        hour: 13,
        title: "Play together at Speeltuin Fort Willem",
        group: "creator",
        spot_id: "fortwillem",
        area: "West",
        tags: &["playground", "outdoor"],
        capacity: 12,
        notes: "Open play 13:00–17:00 at Speeltuin Fort Willem (Kastanjelaan 50). \
                €2.50 entry per person; bring a picnic. Season runs March–November.",
    },
    Recurring {
        id: "00000000-0000-0000-0000-0000000000a2",
        weekday: Weekday::Sun,
        hour: 10,
        title: "Toddler playground meetup at Stadspark",
        group: "toddler",
        spot_id: "stadspark",
        area: "Centrum",
        tags: &["playground", "outdoor"],
        capacity: 10,
        notes: "Sunday-morning meetup by the Berenkuil playground in Stadspark. \
                Free; little ones welcome to roam the lawns and city walls.",
    },
    Recurring {
        id: "00000000-0000-0000-0000-0000000000a3",
        weekday: Weekday::Wed,
        hour: 15,
        title: "Story hour at Centre Céramique",
        group: "talker",
        spot_id: "centreceramique",
        area: "Centrum",
        tags: &["books", "indoor"],
        capacity: 12,
        notes: "Weekly read-aloud story hour at the library in Centre Céramique. \
                Free admission; great for little talkers and picture-book fans.",
    },
    Recurring {
        id: "00000000-0000-0000-0000-0000000000a4",
        weekday: Weekday::Fri,
        hour: 10,
        title: "Parent & baby swim at Geusseltbad",
        group: "explorer",
        spot_id: "geusseltbad",
        area: "Noord",
        tags: &["swimming", "indoor"],
        capacity: 8,
        notes: "Friday-morning parent-and-baby swim in the warm pool at Geusseltbad. \
                Check the pool's schedule for the current session price.",
    },
];

/// Next future UTC instant for `weekday` at `hour` Maastricht local time.
/// Maastricht is CET/CEST (UTC+1/+2); we approximate with +2 (summer), which is
/// fine for seed data — it only shifts the displayed time by an hour in winter.
fn next_occurrence(weekday: Weekday, hour: u32) -> DateTime<Utc> {
    const TZ_OFFSET_HOURS: i64 = 2; // Europe/Amsterdam (CEST)
    let now = Utc::now();
    let today: NaiveDate = now.date_naive();
    let days_ahead = (7 + weekday.num_days_from_monday() as i64
        - today.weekday().num_days_from_monday() as i64)
        % 7;
    let at = |d: NaiveDate| -> DateTime<Utc> {
        let naive = d.and_hms_opt(hour, 0, 0).expect("valid hour");
        Utc.from_utc_datetime(&naive) - Duration::hours(TZ_OFFSET_HOURS)
    };
    let mut start = at(today + Duration::days(days_ahead));
    if start <= now {
        start = at(today + Duration::days(days_ahead + 7));
    }
    start
}

/// Seed the reference tables. Idempotent — safe to run on every startup.
pub async fn run(pool: &PgPool) -> Result<(), sqlx::Error> {
    for (i, (id, emoji, name, range, color)) in GROUPS.iter().enumerate() {
        sqlx::query(
            "INSERT INTO kidgo_groups (id, emoji, name, age_range, color, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (id) DO UPDATE
               SET emoji=$2, name=$3, age_range=$4, color=$5, sort_order=$6",
        )
        .bind(id)
        .bind(emoji)
        .bind(name)
        .bind(range)
        .bind(color)
        .bind(i as i32)
        .execute(pool)
        .await?;
    }

    for (id, name, area, ty, ages, lat, lon) in SPOTS {
        sqlx::query(
            "INSERT INTO kidgo_spots (id, name, area, type, ages, lat, lon)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (id) DO UPDATE
               SET name=$2, area=$3, type=$4, ages=$5, lat=$6, lon=$7",
        )
        .bind(id)
        .bind(name)
        .bind(area)
        .bind(ty)
        .bind(ages)
        .bind(lat)
        .bind(lon)
        .execute(pool)
        .await?;
    }

    seed_recurring(pool).await?;

    Ok(())
}

/// Upsert the `KidGo Community` host and its weekly community activities.
/// Idempotent: stable UUIDs + `starts_at` rolled forward to the next occurrence,
/// so re-running on every boot keeps these events permanently upcoming.
async fn seed_recurring(pool: &PgPool) -> Result<(), sqlx::Error> {
    let host_id: Uuid = sqlx::query_scalar(
        "INSERT INTO kidgo_users (id, nickname, phone, city)
         VALUES ($1,$2,$3,'Maastricht')
         ON CONFLICT (phone) DO UPDATE SET nickname = EXCLUDED.nickname
         RETURNING id",
    )
    .bind(Uuid::parse_str(COMMUNITY_HOST_ID).expect("valid host uuid"))
    .bind("KidGo Community")
    .bind(COMMUNITY_HOST_PHONE)
    .fetch_one(pool)
    .await?;

    for r in RECURRING {
        let id = Uuid::parse_str(r.id).expect("valid activity uuid");
        let tags: Vec<String> = r.tags.iter().map(|t| t.to_string()).collect();
        let starts_at = next_occurrence(r.weekday, r.hour);

        sqlx::query(
            "INSERT INTO kidgo_activities
               (id, title, group_id, spot_id, area, tags, starts_at, recurring,
                host_id, capacity, notes, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,'open')
             ON CONFLICT (id) DO UPDATE
               SET title=EXCLUDED.title, group_id=EXCLUDED.group_id,
                   spot_id=EXCLUDED.spot_id, area=EXCLUDED.area, tags=EXCLUDED.tags,
                   starts_at=EXCLUDED.starts_at, recurring=true,
                   capacity=EXCLUDED.capacity, notes=EXCLUDED.notes, status='open'",
        )
        .bind(id)
        .bind(r.title)
        .bind(r.group)
        .bind(r.spot_id)
        .bind(r.area)
        .bind(&tags)
        .bind(starts_at)
        .bind(host_id)
        .bind(r.capacity)
        .bind(r.notes)
        .execute(pool)
        .await?;

        // The community host counts as the first family going.
        sqlx::query(
            "INSERT INTO kidgo_participants (activity_id, user_id) VALUES ($1,$2)
             ON CONFLICT DO NOTHING",
        )
        .bind(id)
        .bind(host_id)
        .execute(pool)
        .await?;
    }

    Ok(())
}
