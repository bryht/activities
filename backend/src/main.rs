mod api;
mod error;
mod matching;
mod models;
mod nlu;
mod seed;
mod state;

use std::time::Duration;

use sqlx::postgres::PgPoolOptions;
use sqlx::Executor;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::state::{AppState, LlmConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn".into()),
        )
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set (postgres connection string)");
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);

    // KidGo lives in its own `kid_go` schema. Pin search_path on every pooled
    // connection so all unqualified queries resolve there regardless of the
    // role's default (keeps local dev and the shared server consistent).
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(10))
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                conn.execute("SET search_path TO kid_go, public").await?;
                Ok(())
            })
        })
        .connect(&database_url)
        .await?;

    // Schema is idempotent (IF NOT EXISTS) and prefixed `kidgo_`, so this is
    // safe to run against a shared database on every boot. Migrations run in
    // order; each is idempotent, so re-running them on every boot is harmless.
    sqlx::raw_sql(include_str!("../migrations/0001_kidgo_init.sql"))
        .execute(&pool)
        .await?;
    sqlx::raw_sql(include_str!("../migrations/0002_spot_coords.sql"))
        .execute(&pool)
        .await?;
    seed::run(&pool).await?;
    tracing::info!("schema ready, reference data seeded");

    let state = AppState { pool, llm: LlmConfig::from_env() };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // When served behind a reverse proxy that does NOT strip a path prefix
    // (e.g. api.bryht.net/kid-go), set API_PREFIX=/kid-go so routes match.
    let routes = api::router(state);
    let app = match std::env::var("API_PREFIX").ok().filter(|p| !p.is_empty() && p != "/") {
        Some(prefix) => {
            let prefix = format!("/{}", prefix.trim_matches('/'));
            tracing::info!("serving under prefix {prefix}");
            axum::Router::new()
                .route("/health", axum::routing::get(|| async { "ok" }))
                .nest(&prefix, routes)
        }
        None => routes,
    }
    .layer(cors)
    .layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("KidGo API listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
