use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub enum HttpProxyScope {
    SteamApi,
    SteamStore,
    Hltb,
    Automation,
}

impl HttpProxyScope {
    fn key(self) -> &'static str {
        match self {
            Self::SteamApi => "steamApi",
            Self::SteamStore => "steamStore",
            Self::Hltb => "hltb",
            Self::Automation => "automation",
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProxyScopes {
    #[serde(default = "default_true")]
    pub steam_api: bool,
    #[serde(default = "default_true")]
    pub steam_store: bool,
    #[serde(default = "default_true")]
    pub hltb: bool,
    #[serde(default)]
    pub automation: bool,
}

impl Default for ProxyScopes {
    fn default() -> Self {
        Self {
            steam_api: true,
            steam_store: true,
            hltb: true,
            automation: false,
        }
    }
}

impl ProxyScopes {
    fn enabled_for(&self, scope: HttpProxyScope) -> bool {
        match scope {
            HttpProxyScope::SteamApi => self.steam_api,
            HttpProxyScope::SteamStore => self.steam_store,
            HttpProxyScope::Hltb => self.hltb,
            HttpProxyScope::Automation => self.automation,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProxyProfile {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub proxy_type: String,
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_batch_size")]
    pub batch_size: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProxySettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_proxy_mode")]
    pub mode: String,
    #[serde(default)]
    pub active_profile_id: String,
    #[serde(default)]
    pub scopes: ProxyScopes,
    #[serde(default)]
    pub profiles: Vec<ProxyProfile>,
}

impl Default for ProxySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: default_proxy_mode(),
            active_profile_id: String::new(),
            scopes: ProxyScopes {
                steam_api: true,
                steam_store: true,
                hltb: true,
                automation: false,
            },
            profiles: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyTestResult {
    pub ok: bool,
    pub status: u16,
    pub latency_ms: u128,
    pub message: String,
}

#[derive(Default)]
struct HttpPolicyState {
    settings: ProxySettings,
    counters: HashMap<&'static str, u64>,
    clients: HashMap<(HttpProxyScope, String, [u8; 32]), reqwest::Client>,
}

static HTTP_POLICY: OnceLock<Mutex<HttpPolicyState>> = OnceLock::new();

fn policy_state() -> &'static Mutex<HttpPolicyState> {
    HTTP_POLICY.get_or_init(|| Mutex::new(HttpPolicyState::default()))
}

#[tauri::command]
pub fn configure_http_policy(settings: ProxySettings) -> Result<(), String> {
    let mut state = policy_state()
        .lock()
        .map_err(|_| "HTTP policy lock poisoned".to_string())?;
    if state.settings == settings {
        return Ok(());
    }
    state.settings = settings;
    state.counters.clear();
    state.clients.clear();
    Ok(())
}

#[tauri::command]
pub async fn test_proxy_profile(
    profile: ProxyProfile,
    test_url: Option<String>,
) -> Result<ProxyTestResult, String> {
    let url = test_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/?format=json");

    let proxy = profile_to_reqwest_proxy(&profile)?;
    let client = reqwest::Client::builder()
        .user_agent(format!("Repressurizer/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(20))
        .proxy(proxy)
        .build()
        .map_err(|error| format!("Failed to build proxy test client: {error}"))?;

    let started = Instant::now();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Proxy test request failed: {error}"))?;
    let status = response.status();
    let latency_ms = started.elapsed().as_millis();
    let ok = status.is_success();
    let message = if ok {
        format!("Proxy test succeeded with HTTP {}", status.as_u16())
    } else {
        let preview = response
            .text()
            .await
            .unwrap_or_default()
            .chars()
            .take(180)
            .collect::<String>();
        format!("Proxy test returned HTTP {}: {}", status.as_u16(), preview)
    };

    Ok(ProxyTestResult {
        ok,
        status: status.as_u16(),
        latency_ms,
        message,
    })
}

pub fn client_builder_for_scope(scope: HttpProxyScope) -> Result<reqwest::ClientBuilder, String> {
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30));
    if let Some(profile) = choose_proxy_profile(scope)? {
        builder = builder.proxy(profile_to_reqwest_proxy(&profile)?);
    }
    Ok(builder)
}

/// Clients are pooled per selected proxy and user agent. Configuration changes
/// invalidate the pool; unchanged UI preferences cannot reset proxy rotation.
pub fn client_for_scope(
    scope: HttpProxyScope,
    user_agent: Option<&str>,
) -> Result<reqwest::Client, String> {
    let mut state = policy_state()
        .lock()
        .map_err(|_| "HTTP policy lock poisoned".to_string())?;
    pooled_client(&mut state, scope, user_agent)
}

fn pooled_client(
    state: &mut HttpPolicyState,
    scope: HttpProxyScope,
    user_agent: Option<&str>,
) -> Result<reqwest::Client, String> {
    let profile = choose_proxy_profile_in_state(state, scope)?;
    let profile_data = serde_json::to_vec(&profile).map_err(|error| error.to_string())?;
    let fingerprint: [u8; 32] = Sha256::digest(profile_data).into();
    let key = (scope, user_agent.unwrap_or_default().to_string(), fingerprint);
    if let Some(client) = state.clients.get(&key) {
        return Ok(client.clone());
    }
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .pool_idle_timeout(Duration::from_secs(60))
        .pool_max_idle_per_host(4);
    if let Some(agent) = user_agent {
        builder = builder.user_agent(agent);
    }
    if let Some(profile) = profile {
        builder = builder.proxy(profile_to_reqwest_proxy(&profile)?);
    }
    let client = builder
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;
    if state.clients.len() >= 64 {
        state.clients.clear();
    }
    state.clients.insert(key, client.clone());
    Ok(client)
}

fn choose_proxy_profile(scope: HttpProxyScope) -> Result<Option<ProxyProfile>, String> {
    let mut state = policy_state()
        .lock()
        .map_err(|_| "HTTP policy lock poisoned".to_string())?;
    choose_proxy_profile_in_state(&mut state, scope)
}

fn choose_proxy_profile_in_state(
    state: &mut HttpPolicyState,
    scope: HttpProxyScope,
) -> Result<Option<ProxyProfile>, String> {
    let settings = state.settings.clone();
    if !settings.enabled || !settings.scopes.enabled_for(scope) {
        return Ok(None);
    }

    let profiles = settings
        .profiles
        .into_iter()
        .filter(|profile| profile.enabled)
        .filter(|profile| !profile.host.trim().is_empty() && profile.port > 0)
        .collect::<Vec<_>>();
    if profiles.is_empty() {
        return Ok(None);
    }

    let key = scope.key();
    let counter = state.counters.entry(key).or_insert(0);
    let selected = match settings.mode.as_str() {
        "fixed" => profiles
            .iter()
            .find(|profile| profile.id == settings.active_profile_id)
            .cloned()
            .unwrap_or_else(|| profiles[0].clone()),
        "random" => {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.subsec_nanos() as usize)
                .unwrap_or(0);
            profiles[nanos % profiles.len()].clone()
        }
        "batch" => {
            let total = profiles
                .iter()
                .map(|profile| profile.batch_size.max(1) as u64)
                .sum::<u64>()
                .max(1);
            let mut slot = *counter % total;
            let mut selected = profiles[0].clone();
            for profile in &profiles {
                let size = profile.batch_size.max(1) as u64;
                if slot < size {
                    selected = profile.clone();
                    break;
                }
                slot = slot.saturating_sub(size);
            }
            *counter = counter.saturating_add(1);
            selected
        }
        _ => {
            let selected = profiles[(*counter as usize) % profiles.len()].clone();
            *counter = counter.saturating_add(1);
            selected
        }
    };

    Ok(Some(selected))
}

fn profile_to_reqwest_proxy(profile: &ProxyProfile) -> Result<reqwest::Proxy, String> {
    let scheme = match profile.proxy_type.trim().to_ascii_lowercase().as_str() {
        "https" => "https",
        "socks5" => "socks5h",
        _ => "http",
    };
    let host = profile.host.trim();
    if host.is_empty() {
        return Err("Proxy host is required".to_string());
    }
    if profile.port == 0 {
        return Err("Proxy port is required".to_string());
    }

    let mut proxy = reqwest::Proxy::all(format!("{scheme}://{host}:{}", profile.port))
        .map_err(|error| format!("Invalid proxy configuration: {error}"))?;
    let username = profile.username.trim();
    if !username.is_empty() {
        proxy = proxy.basic_auth(username, &profile.password);
    }
    Ok(proxy)
}

fn default_true() -> bool {
    true
}

fn default_batch_size() -> u32 {
    1
}

fn default_proxy_mode() -> String {
    "roundRobin".to_string()
}

#[cfg(test)]
mod pool_tests {
    use super::*;

    #[tokio::test]
    async fn repeated_direct_requests_share_one_pool_configuration() {
        let mut state = HttpPolicyState::default();
        for _ in 0..8 {
            pooled_client(&mut state, HttpProxyScope::SteamStore, Some("test-agent")).unwrap();
        }
        assert_eq!(state.clients.len(), 1);
        pooled_client(&mut state, HttpProxyScope::SteamStore, Some("other-agent")).unwrap();
        assert_eq!(state.clients.len(), 2);
    }

    #[tokio::test]
    async fn pools_do_not_mix_proxy_credentials_or_rotation_slots() {
        let profile = |id: &str| ProxyProfile {
            id: id.into(),
            name: id.into(),
            proxy_type: "http".into(),
            host: "127.0.0.1".into(),
            port: 8080,
            username: id.into(),
            password: "test-password".into(),
            enabled: true,
            batch_size: 1,
        };
        let mut state = HttpPolicyState {
            settings: ProxySettings {
                enabled: true,
                profiles: vec![profile("a"), profile("b")],
                ..Default::default()
            },
            ..Default::default()
        };
        for _ in 0..4 {
            pooled_client(&mut state, HttpProxyScope::SteamStore, None).unwrap();
        }
        assert_eq!(state.clients.len(), 2);
        assert_eq!(state.counters.get("steamStore"), Some(&4));
        // A credential change must select a different pool even for the same proxy.
        state.settings.profiles[0].password = "changed-password".into();
        pooled_client(&mut state, HttpProxyScope::SteamStore, None).unwrap();
        assert_eq!(state.clients.len(), 3);
        for _ in 0..3 {
            pooled_client(&mut state, HttpProxyScope::SteamStore, None).unwrap();
        }
        assert_eq!(state.clients.len(), 3);
    }

    #[tokio::test]
    async fn direct_pool_key_uses_raw_sha256_bytes() {
        let mut state = HttpPolicyState::default();
        pooled_client(&mut state, HttpProxyScope::SteamStore, None).unwrap();
        // SHA-256 of the serialized absent proxy profile: `null`.
        let expected: [u8; 32] = [
            0x74, 0x23, 0x4e, 0x98, 0xaf, 0xe7, 0x49, 0x8f, 0xb5, 0xda, 0xf1, 0xf3, 0x6a, 0xc2,
            0xd7, 0x8a, 0xcc, 0x33, 0x94, 0x64, 0xf9, 0x50, 0x70, 0x3b, 0x8c, 0x01, 0x98, 0x92,
            0xf9, 0x82, 0xb9, 0x0b,
        ];
        let key = (HttpProxyScope::SteamStore, String::new(), expected);
        assert!(state.clients.contains_key(&key));
    }

    #[tokio::test]
    async fn pools_do_not_mix_request_scopes() {
        let mut state = HttpPolicyState::default();
        for scope in [
            HttpProxyScope::SteamApi,
            HttpProxyScope::SteamStore,
            HttpProxyScope::Hltb,
            HttpProxyScope::Automation,
        ] {
            pooled_client(&mut state, scope, Some("test-agent")).unwrap();
            pooled_client(&mut state, scope, Some("test-agent")).unwrap();
        }
        assert_eq!(state.clients.len(), 4);
    }
}
