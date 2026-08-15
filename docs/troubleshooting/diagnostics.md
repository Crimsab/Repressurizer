# Diagnostics and bug reports

Repressurizer can export redacted diagnostics for support. Redaction reduces accidental disclosure, but you should still inspect the file before attaching it to a public issue.

## Native crash reports

Desktop builds write a small `repressurizer.native-crash/v1` JSON report when
the Rust process panics. The report contains the app version, platform, time,
redacted panic message, and source filename/line when available. The diagnostics
export summarizes these reports; missing or malformed files do not block the
export and are reported only as an ignored-file count.

This app-generated JSON is the supported native crash artifact on Windows,
Linux, and macOS. Repressurizer does not
automatically import Windows Error Reporting dumps, Linux core dumps or journal
contents, or macOS DiagnosticReports: those system artifacts can contain memory,
environment variables, usernames, and unrelated paths. Mention their existence
in a private support conversation before sharing one.

Crash messages remove credential-shaped values, long account identifiers, and
filesystem paths. Diagnostics also omit the configured Steam path and app-data
path entirely. Redaction is defensive rather than a guarantee, so inspect an
export before publishing it.

Repressurizer retains at most five app-generated crash reports for 30 days.
Exporting diagnostics reads summaries without deleting the source reports. To
delete them immediately, close Repressurizer and remove the `crash-reports`
folder inside the Repressurizer application-data directory. Deleting the whole
application-data directory also removes them, together with settings and caches.

## Include

- Repressurizer version and build channel.
- Operating system, distribution, and version.
- The exact workflow that failed.
- Whether Steam was running.
- A small reproducible example when possible.
- Redacted diagnostics.

## Remove

- Steam Web API keys, GG.deals API keys, and Store tokens.
- Full Steam IDs when they are not necessary.
- Personal notes and private library exports.
- Private filesystem paths and proxy credentials.

Choose the specialized issue template for installation, Steam Family, Steam metadata, or HLTB matching when one fits the problem.
