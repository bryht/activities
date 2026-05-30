use sqlx::PgPool;

/// Developmental-stage groups (PRD §4.1) — the brand core. `(id, emoji, name, range, color, order)`.
const GROUPS: &[(&str, &str, &str, &str, &str)] = &[
    ("newborn", "🍼", "Newborn", "0–6 months", "bg-sky-100 text-sky-700 ring-sky-200"),
    ("explorer", "🐛", "Explorer", "6–12 months", "bg-emerald-100 text-emerald-700 ring-emerald-200"),
    ("toddler", "🚶", "Toddler", "12–24 months", "bg-amber-100 text-amber-700 ring-amber-200"),
    ("talker", "🗣️", "Talker", "2–3 years", "bg-violet-100 text-violet-700 ring-violet-200"),
    ("creator", "🎨", "Creator", "3–5 years", "bg-rose-100 text-rose-700 ring-rose-200"),
];

/// Maastricht kid-friendly spots (PRD §7). `(id, name, area, type, ages)`.
const SPOTS: &[(&str, &str, &str, &str, &str)] = &[
    ("stadspark", "Stadspark", "Centrum", "Outdoor / sandbox", "All ages"),
    ("bonnefantenpark", "Bonnefantenpark", "Randwyck", "Outdoor / playground", "1–5"),
    ("stadtbibliotheek", "Stadtbibliotheek", "Centrum", "Indoor / picture books", "0–5"),
    ("geusseltbad", "Geusseltbad", "Noord", "Indoor pool", "6m+"),
    ("playzone", "Playzone Maastricht", "Noord", "Indoor play", "1–5"),
    ("dierenpark", "Dierenpark Maastricht", "Noord", "Zoo", "1–5"),
    ("frontenpark", "Frontenpark", "Centrum", "Outdoor walking", "All ages"),
    ("pietersberg", "Sint Pietersberg", "Zuid", "Outdoor / caves", "3+"),
];

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

    for (id, name, area, ty, ages) in SPOTS {
        sqlx::query(
            "INSERT INTO kidgo_spots (id, name, area, type, ages)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (id) DO UPDATE
               SET name=$2, area=$3, type=$4, ages=$5",
        )
        .bind(id)
        .bind(name)
        .bind(area)
        .bind(ty)
        .bind(ages)
        .execute(pool)
        .await?;
    }

    Ok(())
}
