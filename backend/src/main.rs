mod api;
mod auth;
mod error;
mod matching;
mod models;
mod nlu;
mod seed;
mod state;

use std::sync::Arc;
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

    // Apply every migration under `migrations/` in version order. sqlx tracks
    // what's been applied in its own `_sqlx_migrations` table, so adding a new
    // file is all it takes for it to run on the next boot — no more hand-wiring
    // each migration here. The table lands in our `kid_go` schema (it's first
    // in search_path), keeping everything isolated like the rest of the schema.
    // Existing migrations are idempotent (IF NOT EXISTS), so applying them
    // against a database first provisioned by the old raw_sql path is harmless.
    sqlx::migrate!("./migrations").run(&pool).await?;
    seed::run(&pool).await?;
    tracing::info!("schema ready, reference data seeded");

    let state = AppState {
        pool,
        llm: LlmConfig::from_env(),
        link_secret: Arc::new(auth::load_secret()),
    };

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
