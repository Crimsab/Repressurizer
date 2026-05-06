# Security Policy

## Supported Versions

Only the latest GitHub Release is actively supported.

Download it here:

<https://github.com/Crimsab/Repressurizer/releases/latest>

## Reporting A Vulnerability

Please do not open public issues for security or privacy problems.

Use GitHub's private vulnerability reporting if it is available on the repository. If it is not available yet, open a minimal public issue that says you need a private contact path, without including secrets or exploit details.

Never post:

- Steam Web API keys.
- Steam Store `webapi_token` values.
- Full Steam IDs.
- Private Steam install paths.
- Raw diagnostics that have not been checked/redacted.

## Scope

Security-sensitive areas include:

- Reading and writing local Steam collection files.
- Backup and restore behavior.
- Diagnostics export redaction.
- Storage of Steam API keys and Store tokens.
- GitHub Release assets and updater metadata.

Repressurizer is local-first and does not run a hosted backend for user library data.
