//! Best-effort geocoding for custom (non-library) locations a parent names when
//! posting. We use OpenStreetMap's Nominatim — free and keyless — biased to
//! Maastricht. It's strictly best-effort: any failure returns `None` and the
//! caller stores the place by name only (a Google Maps name-search link still
//! works; the place just won't get a precise map pin).
use serde::Deserialize;

#[derive(Deserialize)]
struct Hit {
    lat: String,
    lon: String,
}

/// Resolve a free-form place name to `(lat, lon)`, or `None` on any failure.
pub async fn geocode(name: &str) -> Option<(f64, f64)> {
    let query = format!("{}, Maastricht, Netherlands", name.trim());
    let client = reqwest::Client::new();
    let resp = client
        .get("https://nominatim.openstreetmap.org/search")
        .query(&[("q", query.as_str()), ("format", "json"), ("limit", "1")])
        // Nominatim's usage policy requires an identifying User-Agent.
        .header(reqwest::header::USER_AGENT, "KidGo/1.0 (https://kidgo.bryht.net)")
        .timeout(std::time::Duration::from_secs(6))
        .send()
        .await
        .ok()?;
    let hits: Vec<Hit> = resp.json().await.ok()?;
    let hit = hits.into_iter().next()?;
    Some((hit.lat.parse().ok()?, hit.lon.parse().ok()?))
}
