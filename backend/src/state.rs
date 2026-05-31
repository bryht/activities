use std::sync::Arc;

use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub llm: LlmConfig,
    /// HMAC key for signing manage-link tokens (see `auth.rs`).
    pub link_secret: Arc<Vec<u8>>,
}

/// One OpenAI-compatible chat provider: endpoint + key + model. Vision and audio
/// may live on entirely different providers, so each carries its own.
#[derive(Clone)]
pub struct ProviderConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

impl ProviderConfig {
    /// Read `<PREFIX>_BASE_URL`, `<PREFIX>_API_KEY`, `<PREFIX>_MODEL`. Returns
    /// `None` unless base URL and key are both present (i.e. provider disabled).
    fn from_env(prefix: &str, default_model: Option<&str>) -> Option<Self> {
        let nonempty = |k: String| std::env::var(k).ok().filter(|s| !s.is_empty());
        let base_url = nonempty(format!("{prefix}_BASE_URL"))?;
        let api_key = nonempty(format!("{prefix}_API_KEY"))?;
        let model = nonempty(format!("{prefix}_MODEL")).or_else(|| default_model.map(String::from))?;
        Some(Self { base_url, api_key, model })
    }
}

/// LLM providers for NLU. Each is optional; NLU degrades to a deterministic
/// parser when the chat provider is absent (see `nlu.rs`), and media handling is
/// simply unsupported when its provider is unset.
#[derive(Clone)]
pub struct LlmConfig {
    pub chat: Option<ProviderConfig>,
    pub vision: Option<ProviderConfig>,
    pub audio: Option<ProviderConfig>,
}

impl LlmConfig {
    pub fn from_env() -> Self {
        Self {
            chat: ProviderConfig::from_env("KIDGO_LLM", Some("glm-5.1")),
            vision: ProviderConfig::from_env("KIDGO_VISION", None),
            audio: ProviderConfig::from_env("KIDGO_AUDIO", None),
        }
    }

    pub fn enabled(&self) -> bool {
        self.chat.is_some()
    }
}
