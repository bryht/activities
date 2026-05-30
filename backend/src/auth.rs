// Short-lived capability tokens for activity "manage" links (PRD §4.4).
//
// The bot hands a logged-in parent a link like
//   https://kidgo.bryht.net/activities/<id>?token=<token>
// The token authenticates the *user* (not a single activity) for one hour; the
// backend then derives their role (owner / participant) per activity from the
// database. After it expires the parent simply re-requests the list from the
// bot. Tokens are stateless HMAC-signed strings — no storage, no cleanup.
//
// Format:  <user-uuid>.<exp-unix>.<hex-hmac-sha256>
// signed:  "<user-uuid>.<exp-unix>"   (key = KIDGO_LINK_SECRET)
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use uuid::Uuid;

use crate::error::AppError;

type HmacSha256 = Hmac<Sha256>;

/// How long a manage link stays valid.
pub const TOKEN_TTL_MINUTES: i64 = 60;

/// Mint a token authenticating `user_id`. Returns the token and its expiry.
pub fn mint(secret: &[u8], user_id: Uuid) -> (String, DateTime<Utc>) {
    let exp = Utc::now() + Duration::minutes(TOKEN_TTL_MINUTES);
    let msg = format!("{user_id}.{}", exp.timestamp());
    let sig = sign(secret, &msg);
    (format!("{msg}.{sig}"), exp)
}

/// Verify a token's signature and expiry, returning the authenticated user id.
pub fn verify(secret: &[u8], token: &str) -> Result<Uuid, AppError> {
    let mut parts = token.splitn(3, '.');
    let (uid, exp, sig) = match (parts.next(), parts.next(), parts.next()) {
        (Some(u), Some(e), Some(s)) if !u.is_empty() && !e.is_empty() && !s.is_empty() => (u, e, s),
        _ => return Err(invalid()),
    };

    let expected = sign(secret, &format!("{uid}.{exp}"));
    if !constant_eq(expected.as_bytes(), sig.as_bytes()) {
        return Err(invalid());
    }

    let exp_unix: i64 = exp.parse().map_err(|_| invalid())?;
    if Utc::now().timestamp() > exp_unix {
        return Err(AppError::Unauthorized(
            "this link has expired — ask the bot for a fresh one".into(),
        ));
    }

    Uuid::parse_str(uid).map_err(|_| invalid())
}

/// Load the signing key from `KIDGO_LINK_SECRET`. Falls back to an ephemeral
/// random key (with a warning) so dev works out of the box — but outstanding
/// links then die on restart, so production must set the env var.
pub fn load_secret() -> Vec<u8> {
    match std::env::var("KIDGO_LINK_SECRET") {
        Ok(s) if s.len() >= 16 => s.into_bytes(),
        Ok(_) => {
            tracing::warn!("KIDGO_LINK_SECRET is too short (<16 chars); using an ephemeral key");
            random_secret()
        }
        Err(_) => {
            tracing::warn!(
                "KIDGO_LINK_SECRET not set; using an ephemeral key — manage links won't survive a restart"
            );
            random_secret()
        }
    }
}

fn random_secret() -> Vec<u8> {
    // 256 bits of randomness from two v4 UUIDs — no extra crate needed.
    let mut v = Uuid::new_v4().as_bytes().to_vec();
    v.extend_from_slice(Uuid::new_v4().as_bytes());
    v
}

fn sign(secret: &[u8], msg: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(msg.as_bytes());
    hex(&mac.finalize().into_bytes())
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0x0f) as usize] as char);
    }
    s
}

/// Length-independent, content-constant-time equality (avoids timing oracles).
fn constant_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn invalid() -> AppError {
    AppError::Unauthorized("invalid link token".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_valid_token() {
        let secret = b"test-secret-key-of-some-length";
        let uid = Uuid::new_v4();
        let (token, _) = mint(secret, uid);
        assert_eq!(verify(secret, &token).unwrap(), uid);
    }

    #[test]
    fn rejects_a_tampered_signature() {
        let secret = b"test-secret-key-of-some-length";
        let (token, _) = mint(secret, Uuid::new_v4());
        let mut bad = token.clone();
        bad.pop();
        bad.push(if token.ends_with('a') { 'b' } else { 'a' });
        assert!(verify(secret, &bad).is_err());
    }

    #[test]
    fn rejects_a_different_secret() {
        let (token, _) = mint(b"secret-number-one-key", Uuid::new_v4());
        assert!(verify(b"secret-number-two-key", &token).is_err());
    }

    #[test]
    fn rejects_an_expired_token() {
        let secret = b"test-secret-key-of-some-length";
        let uid = Uuid::new_v4();
        // Hand-craft a token that expired an hour ago.
        let past = (Utc::now() - Duration::hours(1)).timestamp();
        let msg = format!("{uid}.{past}");
        let token = format!("{msg}.{}", sign(secret, &msg));
        assert!(verify(secret, &token).is_err());
    }

    #[test]
    fn rejects_malformed_tokens() {
        let secret = b"test-secret-key-of-some-length";
        assert!(verify(secret, "").is_err());
        assert!(verify(secret, "nonsense").is_err());
        assert!(verify(secret, "a.b").is_err());
    }
}
