use std::sync::Arc;

use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub llm: LlmConfig,
    /// HMAC key for signing manage-link tokens (see `auth.rs`).
    pub link_secret: Arc<Vec<u8>>,
}

/// LLM provider for NLU. Read from env; NLU degrades to a deterministic
/// parser when no key is configured (see `nlu.rs`).
#[derive(Clone)]
pub struct LlmConfig {
    pub api_base_url: Option<String>,
    pub api_key: Option<String>,
    pub model: String,
}

impl LlmConfig {
    pub fn from_env() -> Self {
        Self {
            api_base_url: std::env::var("KIDGO_LLM_BASE_URL").ok(),
            api_key: std::env::var("KIDGO_LLM_API_KEY").ok(),
            model: std::env::var("KIDGO_LLM_MODEL").unwrap_or_else(|_| "glm-5.1".to_string()),
        }
    }

    pub fn enabled(&self) -> bool {
        self.api_base_url.is_some() && self.api_key.is_some()
    }
}
