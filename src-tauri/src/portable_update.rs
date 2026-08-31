use serde::Serialize;
use sha2::{Digest, Sha256};

const RELEASES_API: &str =
    "https://api.github.com/repos/Crimsab/Repressurizer/releases/latest";
const PORTABLE_ASSET: &str = "Repressurizer-portable.exe";
const SUMS_ASSET: &str = "SHA256SUMS.txt";
const STAGED_UPDATE_NAME: &str = "repressurizer-update.exe";
const OLD_UPDATE_NAME: &str = "repressurizer-old.exe";
const USER_AGENT: &str = "Repressurizer portable updater";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PortableUpdateInfo {
    pub(crate) version: String,
    pub(crate) url: String,
    pub(crate) sha256: String,
}

pub(crate) fn parse_sums_entry(sums: &str, asset: &str) -> Option<String> {
    for line in sums.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split_whitespace();
        let hash = parts.next().unwrap_or_default();
        if parts.last().unwrap_or_default() == asset && hash.len() == 64 {
            return Some(hash.to_ascii_lowercase());
        }
    }
    None
}

fn version_triplet(value: &str) -> ((u64, u64, u64), bool) {
    let trimmed = value.trim().trim_start_matches('v');
    let core = trimmed.split(['-', '+']).next().unwrap_or_default();
    let mut numbers = core
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0));
    let triplet = (
        numbers.next().unwrap_or(0),
        numbers.next().unwrap_or(0),
        numbers.next().unwrap_or(0),
    );
    (triplet, trimmed.contains('-'))
}

pub(crate) fn is_newer_version(current: &str, candidate: &str) -> bool {
    let (current_triplet, current_prerelease) = version_triplet(current);
    let (candidate_triplet, candidate_prerelease) = version_triplet(candidate);
    if candidate_triplet != current_triplet {
        return candidate_triplet > current_triplet;
    }
    current_prerelease && !candidate_prerelease
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| error.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[tauri::command]
pub(crate) async fn portable_update_check(
    current_version: String,
) -> Result<Option<PortableUpdateInfo>, String> {
    let client = http_client()?;
    let release: serde_json::Value = client
        .get(RELEASES_API)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;
    let tag = release["tag_name"].as_str().unwrap_or_default();
    if !is_newer_version(&current_version, tag) {
        return Ok(None);
    }
    let mut portable_url = None;
    let mut sums_url = None;
    if let Some(assets) = release["assets"].as_array() {
        for asset in assets {
            match asset["name"].as_str() {
                Some(PORTABLE_ASSET) => {
                    portable_url = asset["browser_download_url"].as_str().map(str::to_string)
                }
                Some(SUMS_ASSET) => {
                    sums_url = asset["browser_download_url"].as_str().map(str::to_string)
                }
                _ => {}
            }
        }
    }
    let (portable_url, sums_url) = match (portable_url, sums_url) {
        (Some(portable), Some(sums)) => (portable, sums),
        _ => return Ok(None),
    };
    let sums = client
        .get(&sums_url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;
    let Some(sha256) = parse_sums_entry(&sums, PORTABLE_ASSET) else {
        return Ok(None);
    };
    Ok(Some(PortableUpdateInfo {
        version: tag.trim_start_matches('v').to_string(),
        url: portable_url,
        sha256,
    }))
}

#[tauri::command]
pub(crate) async fn portable_update_download(
    url: String,
    expected_sha256: String,
) -> Result<String, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let directory = executable
        .parent()
        .ok_or_else(|| "portable directory missing".to_string())?;
    let staged = directory.join(STAGED_UPDATE_NAME);
    let client = http_client()?;
    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .bytes()
        .await
        .map_err(|error| error.to_string())?;
    let actual = sha256_hex(&bytes);
    if actual != expected_sha256.trim().to_ascii_lowercase() {
        return Err("portable update checksum mismatch".to_string());
    }
    std::fs::write(&staged, &bytes).map_err(|error| error.to_string())?;
    Ok(staged.to_string_lossy().into_owned())
}

#[tauri::command]
pub(crate) fn portable_update_apply() -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let directory = executable
        .parent()
        .ok_or_else(|| "portable directory missing".to_string())?;
    let staged = directory.join(STAGED_UPDATE_NAME);
    if !staged.is_file() {
        return Err("staged portable update missing".to_string());
    }
    let old = directory.join(OLD_UPDATE_NAME);
    let _ = std::fs::remove_file(&old);
    std::fs::rename(&executable, &old).map_err(|error| error.to_string())?;
    if let Err(error) = std::fs::rename(&staged, &executable) {
        let _ = std::fs::rename(&old, &executable);
        return Err(error.to_string());
    }
    std::process::Command::new(&executable)
        .spawn()
        .map_err(|error| error.to_string())?;
    std::process::exit(0);
}

pub(crate) fn cleanup_stale_update_files() {
    let Ok(executable) = std::env::current_exe() else {
        return;
    };
    let Some(directory) = executable.parent() else {
        return;
    };
    let _ = std::fs::remove_file(directory.join(OLD_UPDATE_NAME));
    let _ = std::fs::remove_file(directory.join(STAGED_UPDATE_NAME));
}

#[cfg(test)]
mod tests {
    use super::{is_newer_version, parse_sums_entry};

    #[test]
    fn parses_portable_checksum_from_sums() {
        let sums = "aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222  Repressurizer-portable.exe\n0000000000000000000000000000000000000000000000000000000000000000  other.exe\n";
        assert_eq!(
            parse_sums_entry(sums, "Repressurizer-portable.exe").as_deref(),
            Some("aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222")
        );
    }

    #[test]
    fn ignores_missing_or_short_hashes() {
        assert_eq!(parse_sums_entry("zz  Repressurizer-portable.exe", "Repressurizer-portable.exe"), None);
        assert_eq!(parse_sums_entry("", "Repressurizer-portable.exe"), None);
    }

    #[test]
    fn compares_versions() {
        assert!(is_newer_version("0.8.4", "v0.8.5"));
        assert!(is_newer_version("0.8.4", "0.9.0"));
        assert!(!is_newer_version("0.8.4", "0.8.4"));
        assert!(!is_newer_version("0.8.4", "0.8.3"));
        assert!(is_newer_version("0.8.4-beta.1", "0.8.4"));
        assert!(!is_newer_version("0.8.4", "0.8.4-beta.1"));
    }
}
