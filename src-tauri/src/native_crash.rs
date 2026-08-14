use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const CRASH_REPORT_DIRECTORY: &str = "crash-reports";
const MAX_REPORTS: usize = 5;
const MAX_REPORT_AGE_DAYS: u64 = 30;
const MAX_REPORT_BYTES: u64 = 64 * 1024;
const MAX_MESSAGE_CHARS: usize = 1_200;

#[derive(Clone, Debug, Deserialize, Serialize)]
struct NativeCrashReport {
    schema: String,
    version: u8,
    captured_at: String,
    platform: String,
    app_version: String,
    kind: String,
    message: String,
    location_file: Option<String>,
    location_line: Option<u32>,
    location_column: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct NativeCrashSummary {
    supported_artifact: &'static str,
    report_count: usize,
    ignored_corrupt_reports: usize,
    reports: Vec<NativeCrashReport>,
    retention: NativeCrashRetention,
}

#[derive(Clone, Debug, Serialize)]
struct NativeCrashRetention {
    max_reports: usize,
    max_age_days: u64,
}

pub(crate) fn install_panic_hook() {
    prune_default_reports();
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let _ = write_panic_report(panic_info);
        previous(panic_info);
    }));
}

pub(crate) fn diagnostics_summary() -> NativeCrashSummary {
    crate::app_data_dir()
        .map(|directory| summarize_reports(&directory.join(CRASH_REPORT_DIRECTORY)))
        .unwrap_or_else(empty_summary)
}

fn write_panic_report(panic_info: &std::panic::PanicHookInfo<'_>) -> Result<(), String> {
    let data_directory = crate::app_data_dir().ok_or("App data directory unavailable")?;
    let report_directory = data_directory.join(CRASH_REPORT_DIRECTORY);
    fs::create_dir_all(&report_directory).map_err(|error| error.to_string())?;

    let location = panic_info.location();
    let report = NativeCrashReport {
        schema: "repressurizer.native-crash".to_string(),
        version: 1,
        captured_at: chrono::Utc::now().to_rfc3339(),
        platform: std::env::consts::OS.to_string(),
        app_version: crate::app_channel::app_version().to_string(),
        kind: "rust-panic".to_string(),
        message: redact_crash_text(&panic_message(panic_info)),
        location_file: location.map(|value| portable_file_name(value.file())),
        location_line: location.map(|value| value.line()),
        location_column: location.map(|value| value.column()),
    };
    let file_name = format!(
        "repressurizer-panic-{}.json",
        chrono::Utc::now().format("%Y%m%dT%H%M%S%3fZ")
    );
    let serialized = serde_json::to_vec_pretty(&report).map_err(|error| error.to_string())?;
    fs::write(report_directory.join(file_name), serialized).map_err(|error| error.to_string())?;
    prune_reports(&report_directory);
    Ok(())
}

fn panic_message(panic_info: &std::panic::PanicHookInfo<'_>) -> String {
    panic_info
        .payload()
        .downcast_ref::<&str>()
        .map(|message| (*message).to_string())
        .or_else(|| panic_info.payload().downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "Native panic without a string payload".to_string())
}

fn summarize_reports(directory: &Path) -> NativeCrashSummary {
    let mut ignored_corrupt_reports = 0;
    let mut reports = Vec::new();
    let mut candidates = report_files(directory);
    candidates.sort_by_key(|(_, modified)| std::cmp::Reverse(*modified));

    for (path, _) in candidates {
        if reports.len() >= MAX_REPORTS {
            break;
        }
        let report = fs::metadata(&path)
            .ok()
            .filter(|metadata| metadata.len() <= MAX_REPORT_BYTES)
            .and_then(|_| fs::read_to_string(&path).ok())
            .and_then(|contents| serde_json::from_str::<NativeCrashReport>(&contents).ok());
        match report {
            Some(mut report)
                if report.schema == "repressurizer.native-crash"
                    && report.version == 1
                    && chrono::DateTime::parse_from_rfc3339(&report.captured_at).is_ok() =>
            {
                if !matches!(report.platform.as_str(), "windows" | "linux" | "macos") {
                    report.platform = "unknown".to_string();
                }
                if report.kind != "rust-panic" {
                    report.kind = "unknown".to_string();
                }
                report.app_version = redact_crash_text(&report.app_version);
                report.message = redact_crash_text(&report.message);
                report.location_file = report
                    .location_file
                    .as_deref()
                    .map(portable_file_name)
                    .map(|value| redact_crash_token(&value));
                reports.push(report);
            }
            _ => ignored_corrupt_reports += 1,
        }
    }

    NativeCrashSummary {
        supported_artifact: "repressurizer.native-crash/v1",
        report_count: reports.len(),
        ignored_corrupt_reports,
        reports,
        retention: retention(),
    }
}

fn prune_default_reports() {
    if let Some(data_directory) = crate::app_data_dir() {
        prune_reports(&data_directory.join(CRASH_REPORT_DIRECTORY));
    }
}

fn prune_reports(directory: &Path) {
    let now = SystemTime::now();
    let max_age = Duration::from_secs(MAX_REPORT_AGE_DAYS * 24 * 60 * 60);
    let mut current = report_files(directory);

    for (path, modified) in &current {
        if now.duration_since(*modified).is_ok_and(|age| age > max_age) {
            let _ = fs::remove_file(path);
        }
    }

    current = report_files(directory);
    current.sort_by_key(|(_, modified)| std::cmp::Reverse(*modified));
    for (path, _) in current.into_iter().skip(MAX_REPORTS) {
        let _ = fs::remove_file(path);
    }
}

fn report_files(directory: &Path) -> Vec<(PathBuf, SystemTime)> {
    fs::read_dir(directory)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let is_json = path
                .extension()
                .is_some_and(|extension| extension == "json");
            let modified = entry.metadata().ok()?.modified().ok()?;
            is_json.then_some((path, modified))
        })
        .collect()
}

fn empty_summary() -> NativeCrashSummary {
    NativeCrashSummary {
        supported_artifact: "repressurizer.native-crash/v1",
        report_count: 0,
        ignored_corrupt_reports: 0,
        reports: Vec::new(),
        retention: retention(),
    }
}

fn portable_file_name(value: &str) -> String {
    value
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(value)
        .to_string()
}

fn retention() -> NativeCrashRetention {
    NativeCrashRetention {
        max_reports: MAX_REPORTS,
        max_age_days: MAX_REPORT_AGE_DAYS,
    }
}

fn redact_crash_text(value: &str) -> String {
    let mut output = String::new();
    let mut redact_next_bearer = false;
    for segment in value.split_inclusive(char::is_whitespace) {
        let trimmed = segment.trim_end_matches(char::is_whitespace);
        let whitespace = &segment[trimmed.len()..];
        let mut safe = if redact_next_bearer {
            redact_next_bearer = false;
            "***".to_string()
        } else {
            redact_crash_token(trimmed)
        };
        if trimmed.eq_ignore_ascii_case("bearer") {
            redact_next_bearer = true;
            safe = "Bearer".to_string();
        }
        output.push_str(&safe);
        output.push_str(whitespace);
    }

    output.chars().take(MAX_MESSAGE_CHARS).collect()
}

fn redact_crash_token(value: &str) -> String {
    let lower = value.to_ascii_lowercase();
    let sensitive_key = [
        "apikey",
        "api_key",
        "token",
        "secret",
        "password",
        "authorization",
        "cookie",
        "credential",
    ]
    .iter()
    .any(|marker| lower.contains(marker));
    if sensitive_key {
        if let Some(separator) = value.find(['=', ':']) {
            return format!("{}***", &value[..=separator]);
        }
        return "***".to_string();
    }
    if value.contains('/') || value.contains('\\') {
        return "<redacted-path>".to_string();
    }
    redact_long_numbers(value)
}

fn redact_long_numbers(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut output = String::new();
    let mut index = 0;
    while index < chars.len() {
        if !chars[index].is_ascii_digit() {
            output.push(chars[index]);
            index += 1;
            continue;
        }
        let start = index;
        while index < chars.len() && chars[index].is_ascii_digit() {
            index += 1;
        }
        let run = &chars[start..index];
        if run.len() >= 7 {
            output.push_str("***");
            output.extend(run.iter().skip(run.len() - 4));
        } else {
            output.extend(run);
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::{prune_reports, redact_crash_text, summarize_reports, NativeCrashReport};
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_DIRECTORY_COUNTER: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn crash_text_redacts_credentials_accounts_and_paths() {
        let redacted = redact_crash_text(
            "apiKey=secret Bearer raw-token steam=76561198000012345 at C:\\Users\\Alice\\private.rs",
        );
        assert!(!redacted.contains("secret"));
        assert!(!redacted.contains("raw-token"));
        assert!(!redacted.contains("76561198000012345"));
        assert!(!redacted.contains("Alice"));
        assert!(redacted.contains("***2345"));
        assert!(redacted.contains("<redacted-path>"));
    }

    #[test]
    fn summaries_ignore_corrupt_reports_and_redact_imported_content() {
        let directory = test_directory();
        fs::create_dir_all(&directory).expect("create crash test directory");
        let report = NativeCrashReport {
            schema: "repressurizer.native-crash".to_string(),
            version: 1,
            captured_at: "2026-08-14T00:00:00Z".to_string(),
            platform: "windows".to_string(),
            app_version: "0.5.6".to_string(),
            kind: "rust-panic".to_string(),
            message: "token=secret for 76561198000012345".to_string(),
            location_file: Some("C:\\private\\main.rs".to_string()),
            location_line: Some(12),
            location_column: Some(4),
        };
        fs::write(
            directory.join("valid.json"),
            serde_json::to_vec(&report).expect("serialize report"),
        )
        .expect("write report");
        fs::write(directory.join("corrupt.json"), b"{not-json").expect("write corrupt report");

        let summary = summarize_reports(&directory);
        let serialized = serde_json::to_string(&summary).expect("serialize summary");
        assert_eq!(summary.report_count, 1);
        assert_eq!(summary.ignored_corrupt_reports, 1);
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("76561198000012345"));
        assert!(!serialized.contains("private"));
        assert!(serialized.contains("main.rs"));

        fs::remove_dir_all(directory).expect("remove crash test directory");
    }

    #[test]
    fn retention_keeps_only_the_newest_report_limit() {
        let directory = test_directory();
        fs::create_dir_all(&directory).expect("create crash test directory");
        for index in 0..7 {
            fs::write(directory.join(format!("report-{index}.json")), b"{}")
                .expect("write crash report");
        }

        prune_reports(&directory);
        assert_eq!(
            fs::read_dir(&directory)
                .expect("read crash test directory")
                .count(),
            5
        );

        fs::remove_dir_all(directory).expect("remove crash test directory");
    }

    fn test_directory() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "repressurizer-crash-test-{}-{}",
            std::process::id(),
            TEST_DIRECTORY_COUNTER.fetch_add(1, Ordering::Relaxed)
        ))
    }
}
