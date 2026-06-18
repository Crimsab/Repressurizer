# Integration Package Release

The Repressurizer snapshot schema is public integration data. The release workflow is separate from that schema: it publishes the reusable TypeScript package that receivers can install.

The desktop app root remains private in npm terms. Only `packages/integration` is publishable.

## Package

- Package: `@crimsab/repressurizer-integration`
- Directory: `packages/integration`
- Registry target: npm, once the scope and `NPM_TOKEN` are configured
- Tag format: `integration-v<packages/integration/package.json version>`

Example: package version `0.1.0` publishes from tag `integration-v0.1.0`.

## Local Release Simulation

Run the same commands used by the GitHub Actions validation job:

```bash
bun install --frozen-lockfile
bun run --cwd packages/integration check
bun run --cwd packages/integration build
cd packages/integration
bun pm pack --dry-run
```

This proves that the package builds and that the published tarball would contain only the package metadata, README, compiled `dist`, and schema files.

## GitHub Actions

Workflow: `.github/workflows/publish-integration.yml`

The workflow has two paths:

- `workflow_dispatch`, with `dry_run: true` by default: validates and packs, but does not publish.
- `push` tag `integration-v*`: validates, checks the tag matches the package version, then publishes to npm.

Manual publish is also possible by running `workflow_dispatch` with `dry_run: false`, but it still requires the `NPM_TOKEN` repository secret.

The publish job uses `npm publish --provenance --access public`, matching GitHub's recommended npm publishing flow with `NODE_AUTH_TOKEN` and provenance. Keep the npm automation token in the GitHub Actions secret named `NPM_TOKEN`.

## Update Behavior

This workflow does not publish on every push. Normal CI validates the package when code changes, but npm publishing only happens from a matching tag or an explicit manual dispatch with `dry_run: false`.

That keeps desktop-app changes separate from library releases. To publish a TypeScript library update, bump `packages/integration/package.json`, merge the validated change, then create `integration-v<version>`.

## Why This Is Not In The Snapshot Schema Doc

`repressurizer.library-snapshot.v1` describes the wire format that receivers accept. GitHub Actions publishing is release infrastructure for this repository. Keeping them separate avoids making consumers think the workflow is part of the snapshot contract.
