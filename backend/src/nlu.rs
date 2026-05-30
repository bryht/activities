//! Natural-language → structured activity fields (PRD §4.2).
//!
//! Two layers: an LLM call when a provider key is configured, and a
//! deterministic rule-based parser that always runs as a fallback so the bot
//! works even with no LLM / no network.

use chrono::{DateTime, Datelike, Duration, FixedOffset, NaiveDate, NaiveTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};

use crate::error::ApiResult;
use crate::state::AppState;

/// Maastricht local offset (CEST). Fixed for the summer pilot — swap for a
/// real tz database (chrono-tz) when we support multiple cities/seasons.
const LOCAL_OFFSET_SECS: i32 = 2 * 3600;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Parsed {
    pub when: Option<DateTime<Utc>>,
    pub spot_id: Option<String>,
    pub tags: Vec<String>,
    pub group: Option<String>,
    pub title: Option<String>,
    pub source: &'static str,
}

pub async fn parse(state: &AppState, text: &str) -> ApiResult<Parsed> {
    let spots: Vec<(String, String)> =
        sqlx::query_as("SELECT id, name FROM kidgo_spots").fetch_all(&state.pool).await?;

    // Try the LLM first; on any hiccup fall back to rules.
    if state.llm.enabled() {
        match llm_parse(state, text, &spots).await {
            Ok(p) => return Ok(p),
            Err(e) => tracing::warn!("LLM NLU failed, using rules: {e:?}"),
        }
    }
    Ok(rule_parse(text, &spots))
}

// ---------- deterministic parser ----------

fn rule_parse(text: &str, spots: &[(String, String)]) -> Parsed {
    let lower = text.to_lowercase();
    let date = parse_date(&lower);
    let time = parse_time(&lower);
    let when = combine(date, time);
    let spot_id = match_spot(&lower, spots);
    let tags = match_tags(&lower);

    Parsed {
        when,
        spot_id,
        tags,
        group: None, // defaults to the host's stage at creation time
        title: None,
        source: "rules",
    }
}

fn parse_date(t: &str) -> NaiveDate {
    let today = Utc::now().with_timezone(&offset()).date_naive();
    if t.contains("today") {
        return today;
    }
    if t.contains("tomorrow") {
        return today + Duration::days(1);
    }
    const DAYS: [&str; 7] =
        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    for (i, name) in DAYS.iter().enumerate() {
        if t.contains(name) {
            let target = i as i64; // 0 = Monday
            let cur = today.weekday().num_days_from_monday() as i64;
            let mut delta = (target - cur).rem_euclid(7);
            if delta == 0 {
                delta = 7; // "Saturday" means the upcoming one, not today
            }
            return today + Duration::days(delta);
        }
    }
    today
}

fn parse_time(t: &str) -> NaiveTime {
    // Explicit "2pm", "2 pm", "14:00", "10am", "9.30am"
    if let Some(time) = scan_clock(t) {
        return time;
    }
    if t.contains("morning") {
        return NaiveTime::from_hms_opt(10, 0, 0).unwrap();
    }
    if t.contains("noon") || t.contains("lunch") {
        return NaiveTime::from_hms_opt(12, 0, 0).unwrap();
    }
    if t.contains("afternoon") {
        return NaiveTime::from_hms_opt(14, 0, 0).unwrap();
    }
    if t.contains("evening") {
        return NaiveTime::from_hms_opt(18, 0, 0).unwrap();
    }
    NaiveTime::from_hms_opt(10, 0, 0).unwrap()
}

/// Find the first clock-like token and return it as a 24h time.
fn scan_clock(t: &str) -> Option<NaiveTime> {
    // Work entirely in char space: indices below are char positions, so they
    // must never be used to slice the byte-indexed `&str` (that panics on any
    // multi-byte character, e.g. CJK input).
    let chars: Vec<char> = t.chars().collect();
    let digits = |from: usize, to: usize| -> String { chars[from..to].iter().collect() };
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            let start = i;
            while i < chars.len() && chars[i].is_ascii_digit() {
                i += 1;
            }
            // Ignore implausibly long runs rather than overflowing u32.
            let mut hour: u32 = match digits(start, i).parse() {
                Ok(h) => h,
                Err(_) => continue,
            };
            let mut minute = 0u32;
            if i < chars.len() && (chars[i] == ':' || chars[i] == '.') {
                let m0 = i + 1;
                let mut j = m0;
                while j < chars.len() && chars[j].is_ascii_digit() {
                    j += 1;
                }
                if j > m0 {
                    minute = digits(m0, j).parse().unwrap_or(0);
                    i = j;
                }
            }
            // skip spaces, then look for am/pm
            let rest: String = chars[i..].iter().collect::<String>().trim_start().chars().take(2).collect();
            if rest == "pm" && hour < 12 {
                hour += 12;
            } else if rest == "am" && hour == 12 {
                hour = 0;
            }
            if hour < 24 && minute < 60 {
                return NaiveTime::from_hms_opt(hour, minute, 0);
            }
        }
        i += 1;
    }
    None
}

/// Spot name / alias matching against the seeded library.
fn match_spot(t: &str, spots: &[(String, String)]) -> Option<String> {
    // direct name-word match
    for (id, name) in spots {
        let key = name.split_whitespace().next().unwrap_or(name).to_lowercase();
        if key.len() > 3 && t.contains(&key) {
            return Some(id.clone());
        }
    }
    // common aliases
    let alias: &[(&str, &str)] = &[
        ("library", "stadtbibliotheek"),
        ("biblio", "stadtbibliotheek"),
        ("book", "stadtbibliotheek"),
        ("zoo", "dierenpark"),
        ("dieren", "dierenpark"),
        ("pool", "geusseltbad"),
        ("swim", "geusseltbad"),
        ("zwem", "geusseltbad"),
        ("cave", "pietersberg"),
        ("berg", "pietersberg"),
        ("sandbox", "stadspark"),
        ("playzone", "playzone"),
    ];
    for (kw, id) in alias {
        if t.contains(kw) {
            return Some((*id).to_string());
        }
    }
    None
}

fn match_tags(t: &str) -> Vec<String> {
    let table: &[(&str, &str)] = &[
        ("sandbox", "sandbox"),
        ("playground", "playground"),
        ("picture book", "picture book"),
        ("book", "picture book"),
        ("swim", "swimming"),
        ("pool", "swimming"),
        ("indoor play", "indoor play"),
        ("walk", "walking"),
        ("stroll", "walking"),
        ("zoo", "zoo"),
        ("cave", "caves"),
    ];
    let mut tags = Vec::new();
    for (kw, tag) in table {
        if t.contains(kw) && !tags.iter().any(|x| x == tag) {
            tags.push(tag.to_string());
        }
    }
    tags
}

fn offset() -> FixedOffset {
    FixedOffset::east_opt(LOCAL_OFFSET_SECS).unwrap()
}

fn combine(date: NaiveDate, time: NaiveTime) -> Option<DateTime<Utc>> {
    let naive = date.and_time(time);
    offset()
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.with_timezone(&Utc))
}

// ---------- LLM parser ----------

#[derive(Deserialize)]
struct LlmFields {
    #[serde(default)]
    date: Option<String>, // YYYY-MM-DD
    #[serde(default)]
    time: Option<String>, // HH:MM (24h)
    #[serde(default)]
    spot_id: Option<String>,
    #[serde(default)]
    tags: Option<Vec<String>>,
    #[serde(default)]
    title: Option<String>,
}

async fn llm_parse(
    state: &AppState,
    text: &str,
    spots: &[(String, String)],
) -> ApiResult<Parsed> {
    let spot_list = spots
        .iter()
        .map(|(id, name)| format!("{id} ({name})"))
        .collect::<Vec<_>>()
        .join(", ");
    let today = Utc::now().with_timezone(&offset()).date_naive();
    let system = format!(
        "You extract a kids' playdate from one sentence. Today is {today} (Europe/Amsterdam). \
         Known spots: {spot_list}. Reply ONLY with compact JSON of the form \
         {{\"date\":\"YYYY-MM-DD\",\"time\":\"HH:MM\",\"spot_id\":\"<id or null>\",\
         \"tags\":[\"sandbox\"],\"title\":\"short title\"}}. Use the nearest future date for weekdays."
    );

    let base = state.llm.api_base_url.as_ref().unwrap();
    let key = state.llm.api_key.as_ref().unwrap();
    let payload = serde_json::json!({
        "model": state.llm.model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": text}
        ]
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(base)
        .bearer_auth(key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| crate::error::anyhow_lite::Error::from(e))?
        .error_for_status()
        .map_err(|e| crate::error::anyhow_lite::Error::from(e))?;
    let body: serde_json::Value =
        resp.json().await.map_err(crate::error::anyhow_lite::Error::from)?;

    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| crate::error::anyhow_lite::Error("no LLM content".into()))?;
    let json_slice = extract_json(content)
        .ok_or_else(|| crate::error::anyhow_lite::Error("no JSON in LLM reply".into()))?;
    let fields: LlmFields =
        serde_json::from_str(json_slice).map_err(crate::error::anyhow_lite::Error::from)?;

    // Combine date+time; fall back to the rule parser for anything missing.
    let rules = rule_parse(text, spots);
    let when = match (fields.date.as_deref(), fields.time.as_deref()) {
        (Some(d), Some(t)) => {
            let date = NaiveDate::parse_from_str(d, "%Y-%m-%d").ok();
            let time = NaiveTime::parse_from_str(t, "%H:%M").ok();
            match (date, time) {
                (Some(d), Some(t)) => combine(d, t),
                _ => rules.when,
            }
        }
        _ => rules.when,
    };

    Ok(Parsed {
        when,
        spot_id: fields.spot_id.filter(|s| s != "null").or(rules.spot_id),
        tags: fields.tags.filter(|t| !t.is_empty()).unwrap_or(rules.tags),
        group: None,
        title: fields.title,
        source: "llm",
    })
}

/// Pull the first `{...}` block out of an LLM reply that may wrap it in prose.
fn extract_json(s: &str) -> Option<&str> {
    let start = s.find('{')?;
    let end = s.rfind('}')?;
    if end > start {
        Some(&s[start..=end])
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Regression: a byte-index slice on multi-byte (CJK) input used to panic
    // ("byte index N is not a char boundary"), dropping the API connection.
    #[test]
    fn scan_clock_handles_non_ascii_without_panicking() {
        let s = "我明天想去maastricht 圣彼得堡山 野餐 12 点吧，帮我发个活动";
        assert_eq!(scan_clock(s), NaiveTime::from_hms_opt(12, 0, 0));
    }

    #[test]
    fn scan_clock_reads_common_formats() {
        assert_eq!(scan_clock("meet at 14:30 today"), NaiveTime::from_hms_opt(14, 30, 0));
        assert_eq!(scan_clock("2pm at the park"), NaiveTime::from_hms_opt(14, 0, 0));
        assert_eq!(scan_clock("no time here"), None);
    }
}
