# repressurizer-integration

Rust types and helpers for `repressurizer.library-snapshot.v1`.

```rust
use repressurizer_integration::{
    index_snapshot_by_app_id,
    parse_library_snapshot_str,
};

let snapshot = parse_library_snapshot_str(body)?;
let games = index_snapshot_by_app_id(&snapshot);
println!("{:?}", games.get(&632470));
# Ok::<(), Box<dyn std::error::Error>>(())
```

This crate treats Repressurizer snapshots as read-only integration data. Receivers should not treat snapshots as a control channel into Steam or Repressurizer.
