use super::SamAchievementSchemaItem;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SamLocalWritePermission {
    Allowed,
    Protected,
    Unknown,
}

pub(super) fn load_sam_achievement_schema_items(
    steam_path: &str,
    app_id: u64,
) -> Result<Vec<SamAchievementSchemaItem>, String> {
    if app_id == 0 || app_id > u32::MAX as u64 {
        return Err("A valid Steam appId is required.".to_string());
    }
    let path = sam_schema_path(steam_path, app_id);
    let bytes = fs::read(&path).map_err(|error| {
        format!(
            "Steam local achievement schema was not found at {}: {error}",
            path.display()
        )
    })?;
    parse_sam_achievement_schema(&bytes, app_id)
}

pub(super) fn load_required_schema_permissions(
    steam_path: &str,
    app_id: u64,
) -> Result<HashMap<String, SamAchievementSchemaItem>, String> {
    load_sam_achievement_schema_items(steam_path, app_id)
        .map(|items| {
            items
                .into_iter()
                .map(|item| (item.api_name.clone(), item))
                .collect()
        })
        .map_err(|error| {
            format!(
                "Could not verify SAM achievement permissions, so no achievements were changed: {error}"
            )
        })
}

pub(super) fn local_write_permission(
    permissions: &HashMap<String, SamAchievementSchemaItem>,
    achievement_id: &str,
) -> SamLocalWritePermission {
    match permissions.get(achievement_id) {
        Some(item) if item.protected_achievement => SamLocalWritePermission::Protected,
        Some(_) => SamLocalWritePermission::Allowed,
        None => SamLocalWritePermission::Unknown,
    }
}

pub(super) fn ensure_verified_target_permissions(
    permissions: &HashMap<String, SamAchievementSchemaItem>,
    achievement_ids: &[String],
) -> Result<(), String> {
    let unknown = achievement_ids
        .iter()
        .filter(|id| local_write_permission(permissions, id) == SamLocalWritePermission::Unknown)
        .cloned()
        .collect::<Vec<_>>();
    if unknown.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Could not verify local Steam write permissions for {}; no achievements were changed.",
            unknown.join(",")
        ))
    }
}

pub(super) fn sam_schema_path(steam_path: &str, app_id: u64) -> PathBuf {
    PathBuf::from(steam_path.trim())
        .join("appcache")
        .join("stats")
        .join(format!("UserGameStatsSchema_{app_id}.bin"))
}

pub(super) fn parse_sam_achievement_schema(
    bytes: &[u8],
    app_id: u64,
) -> Result<Vec<SamAchievementSchemaItem>, String> {
    let root = BinaryKeyValue::parse(bytes)?;
    let app = root
        .child(&app_id.to_string())
        .ok_or_else(|| format!("Steam schema does not contain appId {app_id}."))?;
    let stats = app
        .child("stats")
        .ok_or_else(|| "Steam schema does not contain a stats node.".to_string())?;
    let mut items = Vec::new();

    for stat in &stats.children {
        for bits in stat.children_named("bits") {
            for bit in &bits.children {
                let api_name = bit
                    .child("name")
                    .and_then(BinaryKeyValue::as_string)
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                if api_name.is_empty() {
                    continue;
                }
                let Some(permission) = bit.child("permission").and_then(BinaryKeyValue::as_i32)
                else {
                    continue;
                };
                items.push(SamAchievementSchemaItem {
                    api_name,
                    permission,
                    protected_achievement: sam_achievement_is_protected(permission),
                    flags: sam_achievement_permission_flags(permission),
                });
            }
        }
    }

    Ok(items)
}

pub(super) fn sam_achievement_is_protected(permission: i32) -> bool {
    permission & 3 != 0
}

pub(super) fn sam_achievement_permission_flags(permission: i32) -> Vec<String> {
    let mut flags = Vec::new();
    if sam_achievement_is_protected(permission) {
        flags.push("Protected".to_string());
    }
    if permission & !3 != 0 {
        flags.push("UnknownPermission".to_string());
    }
    if flags.is_empty() {
        flags.push("None".to_string());
    }
    flags
}

#[derive(Debug, Clone)]
struct BinaryKeyValue {
    name: String,
    value: BinaryKeyValueValue,
    children: Vec<BinaryKeyValue>,
}

#[derive(Debug, Clone)]
enum BinaryKeyValueValue {
    None,
    String(String),
    Int32(i32),
    Float32(f32),
    UInt32(u32),
    UInt64(u64),
}

impl BinaryKeyValue {
    fn parse(bytes: &[u8]) -> Result<Self, String> {
        let mut cursor = BinaryCursor::new(bytes);
        let children = cursor.read_children()?;
        if !cursor.is_complete() {
            return Err("Steam binary KeyValues schema contains trailing bytes.".to_string());
        }
        Ok(Self {
            name: "<root>".to_string(),
            value: BinaryKeyValueValue::None,
            children,
        })
    }

    fn child(&self, name: &str) -> Option<&Self> {
        self.children
            .iter()
            .find(|child| child.name.eq_ignore_ascii_case(name))
    }

    fn children_named<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Self> + 'a {
        self.children
            .iter()
            .filter(move |child| child.name.eq_ignore_ascii_case(name))
    }

    fn as_string(&self) -> Option<String> {
        match &self.value {
            BinaryKeyValueValue::String(value) => Some(value.clone()),
            BinaryKeyValueValue::Int32(value) => Some(value.to_string()),
            BinaryKeyValueValue::Float32(value) => Some(value.to_string()),
            BinaryKeyValueValue::UInt32(value) => Some(value.to_string()),
            BinaryKeyValueValue::UInt64(value) => Some(value.to_string()),
            BinaryKeyValueValue::None => None,
        }
    }

    fn as_i32(&self) -> Option<i32> {
        match &self.value {
            BinaryKeyValueValue::String(value) => value.parse::<i32>().ok(),
            BinaryKeyValueValue::Int32(value) => Some(*value),
            BinaryKeyValueValue::Float32(value) => Some(*value as i32),
            BinaryKeyValueValue::UInt32(value) => i32::try_from(*value).ok(),
            BinaryKeyValueValue::UInt64(value) => i32::try_from(*value).ok(),
            BinaryKeyValueValue::None => None,
        }
    }
}

struct BinaryCursor<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> BinaryCursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn is_complete(&self) -> bool {
        self.offset == self.bytes.len()
    }

    fn read_children(&mut self) -> Result<Vec<BinaryKeyValue>, String> {
        let mut children = Vec::new();
        loop {
            let value_type = self.read_u8()?;
            if value_type == 8 {
                break;
            }
            let name = self.read_cstring()?;
            let child = match value_type {
                0 => BinaryKeyValue {
                    name,
                    value: BinaryKeyValueValue::None,
                    children: self.read_children()?,
                },
                1 => BinaryKeyValue {
                    name,
                    value: BinaryKeyValueValue::String(self.read_cstring()?),
                    children: Vec::new(),
                },
                2 => BinaryKeyValue {
                    name,
                    value: BinaryKeyValueValue::Int32(self.read_i32()?),
                    children: Vec::new(),
                },
                3 => BinaryKeyValue {
                    name,
                    value: BinaryKeyValueValue::Float32(self.read_f32()?),
                    children: Vec::new(),
                },
                4 | 6 => BinaryKeyValue {
                    name,
                    value: BinaryKeyValueValue::UInt32(self.read_u32()?),
                    children: Vec::new(),
                },
                5 => {
                    return Err("Steam binary KeyValues wstring values are unsupported.".to_string())
                }
                7 => BinaryKeyValue {
                    name,
                    value: BinaryKeyValueValue::UInt64(self.read_u64()?),
                    children: Vec::new(),
                },
                other => {
                    return Err(format!(
                        "Steam binary KeyValues schema has unsupported value type {other}."
                    ))
                }
            };
            children.push(child);
        }
        Ok(children)
    }

    fn read_u8(&mut self) -> Result<u8, String> {
        let Some(value) = self.bytes.get(self.offset).copied() else {
            return Err("Unexpected end of Steam binary KeyValues schema.".to_string());
        };
        self.offset += 1;
        Ok(value)
    }

    fn read_cstring(&mut self) -> Result<String, String> {
        let start = self.offset;
        while self.offset < self.bytes.len() && self.bytes[self.offset] != 0 {
            self.offset += 1;
        }
        if self.offset >= self.bytes.len() {
            return Err("Unterminated string in Steam binary KeyValues schema.".to_string());
        }
        let value = std::str::from_utf8(&self.bytes[start..self.offset])
            .map_err(|error| format!("Invalid UTF-8 in Steam binary KeyValues schema: {error}"))?
            .to_string();
        self.offset += 1;
        Ok(value)
    }

    fn read_i32(&mut self) -> Result<i32, String> {
        Ok(i32::from_le_bytes(self.read_array()?))
    }

    fn read_u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_le_bytes(self.read_array()?))
    }

    fn read_u64(&mut self) -> Result<u64, String> {
        Ok(u64::from_le_bytes(self.read_array()?))
    }

    fn read_f32(&mut self) -> Result<f32, String> {
        Ok(f32::from_le_bytes(self.read_array()?))
    }

    fn read_array<const N: usize>(&mut self) -> Result<[u8; N], String> {
        if self.offset + N > self.bytes.len() {
            return Err("Unexpected end of Steam binary KeyValues schema.".to_string());
        }
        let mut array = [0u8; N];
        array.copy_from_slice(&self.bytes[self.offset..self.offset + N]);
        self.offset += N;
        Ok(array)
    }
}
