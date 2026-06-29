use serde::{Deserialize, Serialize};
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

#[derive(Debug, Clone, Deserialize, Serialize)]
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

#[derive(Debug, Clone, Deserialize, Serialize)]
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

#[derive(Debug, Clone, Deserialize, Serialize)]
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
    state.settings = settings;
    state.counters.clear();
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
    let mut builder = reqwest::Client::builder();
    if let Some(profile) = choose_proxy_profile(scope)? {
        builder = builder.proxy(profile_to_reqwest_proxy(&profile)?);
    }
    Ok(builder)
}

fn choose_proxy_profile(scope: HttpProxyScope) -> Result<Option<ProxyProfile>, String> {
    let mut state = policy_state()
        .lock()
        .map_err(|_| "HTTP policy lock poisoned".to_string())?;
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
