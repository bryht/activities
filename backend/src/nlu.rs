//! Natural-language → structured activity fields (PRD §4.2).
//!
//! Two layers: an LLM call when a provider key is configured, and a
//! deterministic rule-based parser that always runs as a fallback so the bot
//! works even with no LLM / no network.

use chrono::{DateTime, Datelike, Duration, FixedOffset, NaiveDate, NaiveTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};

use crate::error::{anyhow_lite, ApiResult, AppError};
use crate::state::{AppState, ProviderConfig};

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

    let json_slice = chat_json(state, &system, text).await?;
    let fields: LlmFields =
        serde_json::from_str(&json_slice).map_err(anyhow_lite::Error::from)?;

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

// ---------- shared LLM call ----------

/// One chat-completion round-trip to a given provider. `messages` is the raw
/// OpenAI-style array, so callers can embed images/audio as content parts.
async fn chat_messages(provider: &ProviderConfig, messages: serde_json::Value) -> ApiResult<String> {
    let payload = serde_json::json!({
        "model": provider.model,
        "temperature": 0,
        "messages": messages,
    });
    let resp = reqwest::Client::new()
        .post(&provider.base_url)
        .bearer_auth(&provider.api_key)
        .json(&payload)
        .send()
        .await
        .map_err(anyhow_lite::Error::from)?
        .error_for_status()
        .map_err(anyhow_lite::Error::from)?;
    let body: serde_json::Value = resp.json().await.map_err(anyhow_lite::Error::from)?;
    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| anyhow_lite::Error("no LLM content".into()))?;
    Ok(content.to_string())
}

/// Plain system+user text turn against the configured chat provider.
async fn chat(state: &AppState, system: &str, user: &str) -> ApiResult<String> {
    let provider = state.llm.chat.as_ref().expect("chat provider checked by caller");
    chat_messages(
        provider,
        serde_json::json!([
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]),
    )
    .await
}

/// As `chat`, but extract the first `{...}` JSON block from the reply.
async fn chat_json(state: &AppState, system: &str, user: &str) -> ApiResult<String> {
    let content = chat(state, system, user).await?;
    let slice = extract_json(&content)
        .ok_or_else(|| anyhow_lite::Error("no JSON in LLM reply".into()))?;
    Ok(slice.to_string())
}

// ---------- media understanding (images & voice notes) ----------

/// Describe an image (likely a flyer/photo) as a one-line activity sentence the
/// rest of the pipeline can route and slot-fill.
pub async fn understand_image(state: &AppState, data_b64: &str, mime: &str) -> ApiResult<String> {
    let provider = state
        .llm
        .vision
        .as_ref()
        .ok_or_else(|| AppError::BadRequest("image understanding is not configured".into()))?;
    let prompt = "This image was sent to a kids' playdate bot — likely a flyer or photo of a \
        children's activity. In ONE short sentence, describe the activity including day, time and \
        place if visible (e.g. \"Toddler music class Saturday 10am at Centre Céramique\"). \
        If it isn't about an activity, briefly say what it shows.";
    let messages = serde_json::json!([{
        "role": "user",
        "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": format!("data:{mime};base64,{data_b64}")}}
        ]
    }]);
    chat_messages(provider, messages).await
}

/// Transcribe a voice note to text (in English) for the normal flow.
pub async fn transcribe_audio(state: &AppState, data_b64: &str, mime: &str) -> ApiResult<String> {
    let provider = state
        .llm
        .audio
        .as_ref()
        .ok_or_else(|| AppError::BadRequest("audio understanding is not configured".into()))?;
    // "audio/ogg; codecs=opus" -> "ogg"; the model wants a bare container name.
    let format = mime.rsplit('/').next().unwrap_or("ogg").split(';').next().unwrap_or("ogg").trim();
    let prompt = "This is a voice note from a parent talking to a kids' playdate bot. Write out, \
        in English text, exactly what they said. Return only their message, nothing else.";
    let messages = serde_json::json!([{
        "role": "user",
        "content": [
            {"type": "text", "text": prompt},
            {"type": "input_audio", "input_audio": {"data": data_b64, "format": format}}
        ]
    }]);
    chat_messages(provider, messages).await
}

// ---------- intent routing ----------

const INTENTS: [&str; 5] = ["post", "browse", "mine", "profile", "help"];

/// Route a free-form message to one of the bot's flows (LLM, rules as fallback).
pub async fn classify_intent(state: &AppState, text: &str) -> ApiResult<String> {
    if state.llm.enabled() {
        match llm_intent(state, text).await {
            Ok(i) => return Ok(i),
            Err(e) => tracing::warn!("LLM intent failed, using rules: {e:?}"),
        }
    }
    Ok(rule_intent(text))
}

fn rule_intent(text: &str) -> String {
    let t = text.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| t.contains(w));
    if has(&["post", "create", "host", "organi", "playdate", "meet up", "meetup"]) {
        "post".into()
    } else if has(&["browse", "find", "what's on", "whats on", "see activ", "near me"]) {
        "browse".into()
    } else if has(&["my activ", "manage", "mine", "my event", "my post"]) {
        "mine".into()
    } else if has(&["profile", "my stage", "account", "settings"]) {
        "profile".into()
    } else {
        "help".into()
    }
}

async fn llm_intent(state: &AppState, text: &str) -> ApiResult<String> {
    let system = "Classify a parent's WhatsApp message to a kids' playdate bot into ONE intent. \
        Intents: post = wants to create/host/organise a new activity or playdate; \
        browse = wants to find or see existing activities; \
        mine = wants to see or manage their own activities; \
        profile = wants to see or change their account or child's stages; \
        help = greeting, menu, unclear, or anything else. \
        Reply ONLY compact JSON: {\"intent\":\"post|browse|mine|profile|help\"}.";
    let slice = chat_json(state, system, text).await?;
    let v: serde_json::Value = serde_json::from_str(&slice).map_err(anyhow_lite::Error::from)?;
    let intent = v["intent"].as_str().unwrap_or("help").to_string();
    Ok(if INTENTS.contains(&intent.as_str()) { intent } else { "help".into() })
}

// ---------- "create activity" slot filling ----------

/// The running draft of an activity being assembled over several messages. The
/// place is either a known `spot_id` or a free-text `location` (custom place).
#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Draft {
    pub when: Option<DateTime<Utc>>,
    pub spot_id: Option<String>,
    pub location: Option<String>,
    pub tags: Vec<String>,
    pub title: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FillResult {
    pub draft: Draft,
    /// True once we have a time and a place — the bot can show the confirm step.
    pub ready: bool,
    /// Natural-language prompt for the next missing field (used when not ready).
    pub reply: String,
}

/// Merge what the user just said into the running draft and decide what's next.
pub async fn post_fill(state: &AppState, draft: Draft, message: &str) -> ApiResult<FillResult> {
    let spots: Vec<(String, String)> = sqlx::query_as("SELECT id, name FROM kidgo_spots WHERE curated")
        .fetch_all(&state.pool)
        .await?;
    if state.llm.enabled() {
        match llm_fill(state, &draft, message, &spots).await {
            Ok(r) => return Ok(r),
            Err(e) => tracing::warn!("LLM post-fill failed, using rules: {e:?}"),
        }
    }
    Ok(rule_fill(draft, message, &spots))
}

/// A library spot wins over free text; "ready" needs a time and a place.
fn finalize(mut draft: Draft) -> (Draft, bool) {
    if draft.spot_id.is_some() {
        draft.location = None;
    }
    let ready = draft.when.is_some() && (draft.spot_id.is_some() || draft.location.is_some());
    (draft, ready)
}

fn rule_fill(mut draft: Draft, message: &str, spots: &[(String, String)]) -> FillResult {
    let had_when = draft.when.is_some();
    let p = rule_parse(message, spots);
    if draft.when.is_none() {
        draft.when = p.when;
    }
    if draft.spot_id.is_none() && draft.location.is_none() {
        if let Some(sid) = p.spot_id {
            draft.spot_id = Some(sid);
        } else if had_when {
            // The time was already known, so treat this reply as the place.
            draft.location = Some(message.trim().to_string());
        }
    }
    if draft.title.is_none() {
        draft.title = p.title;
    }
    if draft.tags.is_empty() {
        draft.tags = p.tags;
    }
    let (draft, ready) = finalize(draft);
    let reply = if draft.when.is_none() {
        "What day and time? e.g. “Saturday 2pm”.".to_string()
    } else if draft.spot_id.is_none() && draft.location.is_none() {
        "Where should it be? You can name any place.".to_string()
    } else {
        "Great — let me confirm.".to_string()
    };
    FillResult { draft, ready, reply }
}

#[derive(Deserialize)]
struct FillFields {
    #[serde(default)]
    date: Option<String>,
    #[serde(default)]
    time: Option<String>,
    #[serde(default)]
    spot_id: Option<String>,
    #[serde(default)]
    location: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    tags: Option<Vec<String>>,
    #[serde(default)]
    reply: Option<String>,
}

async fn llm_fill(
    state: &AppState,
    draft: &Draft,
    message: &str,
    spots: &[(String, String)],
) -> ApiResult<FillResult> {
    let spot_list = spots.iter().map(|(id, name)| format!("{id} ({name})")).collect::<Vec<_>>().join(", ");
    let today = Utc::now().with_timezone(&offset()).date_naive();
    let draft_json = serde_json::json!({
        "when": draft.when, "spot_id": draft.spot_id, "location": draft.location,
        "title": draft.title, "tags": draft.tags,
    });
    let system = format!(
        "You help a parent create a kids' playdate over WhatsApp, collecting details step by step. \
         Today is {today} (Europe/Amsterdam). Known spots as id (name): {spot_list}. \
         The draft so far is: {draft_json}. From the draft plus the user's new message, fill the fields. \
         Required: a date AND time, and a place. For the place, if it clearly matches a known spot use its \
         spot_id; otherwise put the place name in `location` (custom places are allowed — do not force a match). \
         Capture title and tags only if mentioned. Keep already-known values unless the user changes them. \
         `reply` must be ONE short, friendly WhatsApp message asking ONLY for the next missing required field \
         (date/time, or place), or a brief upbeat lead-in if everything required is present. \
         Reply ONLY with compact JSON: {{\"date\":\"YYYY-MM-DD\"|null,\"time\":\"HH:MM\"|null,\
         \"spot_id\":\"<id>\"|null,\"location\":\"<place>\"|null,\"title\":\"...\"|null,\
         \"tags\":[\"sandbox\"],\"reply\":\"...\"}}."
    );
    let slice = chat_json(state, &system, message).await?;
    let f: FillFields = serde_json::from_str(&slice).map_err(anyhow_lite::Error::from)?;

    let mut next = draft.clone();
    if let (Some(d), Some(t)) = (f.date.as_deref(), f.time.as_deref()) {
        if let (Ok(d), Ok(t)) =
            (NaiveDate::parse_from_str(d, "%Y-%m-%d"), NaiveTime::parse_from_str(t, "%H:%M"))
        {
            next.when = combine(d, t);
        }
    }
    if let Some(sid) = f.spot_id.filter(|s| s != "null" && spots.iter().any(|(id, _)| id == s)) {
        next.spot_id = Some(sid);
        next.location = None;
    } else if let Some(loc) = f.location.filter(|s| s != "null" && !s.trim().is_empty()) {
        next.location = Some(loc);
    }
    if let Some(title) = f.title.filter(|s| s != "null" && !s.trim().is_empty()) {
        next.title = Some(title);
    }
    if let Some(tags) = f.tags.filter(|t| !t.is_empty()) {
        next.tags = tags;
    }

    let (next, ready) = finalize(next);
    let reply = f.reply.unwrap_or_else(|| "Tell me a bit more — when and where?".into());
    Ok(FillResult { draft: next, ready, reply })
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
