use super::collections::SteamCollection;
use chrono::Utc;
use serde::Serialize;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SteamShortcut {
    pub appid: u64,
    pub appname: String,
    pub exe: String,
    pub start_dir: String,
    pub icon: String,
    pub shortcut_path: String,
    pub launch_options: String,
    pub hidden: bool,
    pub last_play_time: u64,
    pub tags: Vec<String>,
}

#[tauri::command]
pub fn load_shortcuts(steam_path: String, steam_id3: String) -> Result<Vec<SteamShortcut>, String> {
    let path = shortcuts_path(&steam_path, &steam_id3);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read(&path).map_err(|error| {
        format!(
            "Failed to read shortcuts file {}: {}",
            path.display(),
            error
        )
    })?;
    parse_shortcuts_vdf(&data)
}

#[tauri::command]
pub fn save_shortcuts(
    steam_path: String,
    steam_id3: String,
    collections: Vec<SteamCollection>,
) -> Result<usize, String> {
    if super::sam::is_steam_running() {
        return Err(
            "Steam appears to be running. Close Steam before saving shortcuts.vdf.".to_string(),
        );
    }

    let path = shortcuts_path(&steam_path, &steam_id3);
    if !path.exists() {
        return Ok(0);
    }

    let data = fs::read(&path).map_err(|error| {
        format!(
            "Failed to read shortcuts file {}: {}",
            path.display(),
            error
        )
    })?;
    let mut root = parse_shortcuts_tree(&data)?;
    let index = shortcut_collection_index(&collections);
    let updated = update_shortcuts_tree(&mut root, &index);

    if updated == 0 {
        return Ok(0);
    }

    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let backup = path.with_file_name(format!("shortcuts.backup-{timestamp}.vdf"));
    let _ = fs::copy(&path, backup);

    let output = write_shortcuts_tree(&root);
    let tmp_path = path.with_extension("tmp");
    fs::write(&tmp_path, output).map_err(|error| {
        format!(
            "Failed to write shortcuts temp file {}: {}",
            tmp_path.display(),
            error
        )
    })?;
    fs::rename(&tmp_path, &path).map_err(|error| {
        format!(
            "Failed to replace shortcuts file {}: {}",
            path.display(),
            error
        )
    })?;

    Ok(updated)
}

fn shortcuts_path(steam_path: &str, steam_id3: &str) -> PathBuf {
    PathBuf::from(steam_path)
        .join("userdata")
        .join(steam_id3)
        .join("config")
        .join("shortcuts.vdf")
}

pub fn parse_shortcuts_vdf(data: &[u8]) -> Result<Vec<SteamShortcut>, String> {
    let mut reader = BinaryVdfReader { data, pos: 0 };
    let root_type = reader.read_u8()?;
    if root_type != 0 {
        return Err("shortcuts.vdf does not start with a root object".to_string());
    }
    let root_name = reader.read_cstring()?;
    if root_name != "shortcuts" {
        return Err(format!(
            "Unexpected shortcuts.vdf root object: {}",
            root_name
        ));
    }

    let mut shortcuts = Vec::new();
    loop {
        let value_type = reader.read_u8()?;
        if value_type == 8 {
            break;
        }
        if value_type != 0 {
            return Err(format!("Unexpected shortcut entry type: {}", value_type));
        }
        let _index = reader.read_cstring()?;
        shortcuts.push(read_shortcut_object(&mut reader)?);
    }

    Ok(shortcuts)
}

fn read_shortcut_object(reader: &mut BinaryVdfReader<'_>) -> Result<SteamShortcut, String> {
    let mut appid = 0_u64;
    let mut appname = String::new();
    let mut exe = String::new();
    let mut start_dir = String::new();
    let mut icon = String::new();
    let mut shortcut_path = String::new();
    let mut launch_options = String::new();
    let mut hidden = false;
    let mut last_play_time = 0_u64;
    let mut tags = Vec::new();

    loop {
        let value_type = reader.read_u8()?;
        if value_type == 8 {
            break;
        }
        let key = reader.read_cstring()?;
        match value_type {
            0 if key == "tags" => {
                tags = read_tags_object(reader)?;
            }
            0 => {
                reader.skip_object()?;
            }
            1 => {
                let value = reader.read_cstring()?;
                match key.as_str() {
                    "appname" => appname = value,
                    "Exe" => exe = value,
                    "StartDir" => start_dir = value,
                    "icon" => icon = value,
                    "ShortcutPath" => shortcut_path = value,
                    "LaunchOptions" => launch_options = value,
                    _ => {}
                }
            }
            2 => {
                let value = reader.read_i32()? as u32 as u64;
                match key.as_str() {
                    "appid" => appid = value,
                    "IsHidden" | "hidden" => hidden = value != 0,
                    "LastPlayTime" => last_play_time = value,
                    _ => {}
                }
            }
            other => return Err(format!("Unsupported shortcuts.vdf value type: {}", other)),
        }
    }

    Ok(SteamShortcut {
        appid,
        appname,
        exe,
        start_dir,
        icon,
        shortcut_path,
        launch_options,
        hidden,
        last_play_time,
        tags,
    })
}

#[derive(Debug, Clone, PartialEq)]
enum BinaryVdfValue {
    Object(Vec<(String, BinaryVdfValue)>),
    String(String),
    I32(i32),
}

#[derive(Debug, Clone, PartialEq)]
struct BinaryVdfRoot {
    name: String,
    fields: Vec<(String, BinaryVdfValue)>,
}

struct ShortcutCollectionIndex {
    tags_by_appid: HashMap<u64, Vec<String>>,
    hidden_appids: HashSet<u64>,
}

fn shortcut_collection_index(collections: &[SteamCollection]) -> ShortcutCollectionIndex {
    let mut tags_by_appid: HashMap<u64, BTreeSet<String>> = HashMap::new();
    let mut hidden_appids = HashSet::new();

    for collection in collections
        .iter()
        .filter(|collection| !collection.is_dynamic)
    {
        let is_hidden = collection.key == "user-collections.hidden" || collection.id == "hidden";
        let is_favorite =
            collection.key == "user-collections.favorite" || collection.id == "favorite";
        for appid in &collection.added {
            if is_hidden {
                hidden_appids.insert(*appid);
                continue;
            }
            let tag = if is_favorite {
                "favorite".to_string()
            } else {
                collection.name.trim().to_string()
            };
            if !tag.is_empty() {
                tags_by_appid.entry(*appid).or_default().insert(tag);
            }
        }
    }

    ShortcutCollectionIndex {
        tags_by_appid: tags_by_appid
            .into_iter()
            .map(|(appid, tags)| (appid, tags.into_iter().collect()))
            .collect(),
        hidden_appids,
    }
}

fn parse_shortcuts_tree(data: &[u8]) -> Result<BinaryVdfRoot, String> {
    let mut reader = BinaryVdfReader { data, pos: 0 };
    let root_type = reader.read_u8()?;
    if root_type != 0 {
        return Err("shortcuts.vdf does not start with a root object".to_string());
    }
    let name = reader.read_cstring()?;
    let fields = read_vdf_fields(&mut reader)?;
    Ok(BinaryVdfRoot { name, fields })
}

fn read_vdf_fields(
    reader: &mut BinaryVdfReader<'_>,
) -> Result<Vec<(String, BinaryVdfValue)>, String> {
    let mut fields = Vec::new();
    loop {
        let value_type = reader.read_u8()?;
        if value_type == 8 {
            return Ok(fields);
        }
        let key = reader.read_cstring()?;
        let value = match value_type {
            0 => BinaryVdfValue::Object(read_vdf_fields(reader)?),
            1 => BinaryVdfValue::String(reader.read_cstring()?),
            2 => BinaryVdfValue::I32(reader.read_i32()?),
            other => return Err(format!("Unsupported shortcuts.vdf value type: {}", other)),
        };
        fields.push((key, value));
    }
}

fn update_shortcuts_tree(root: &mut BinaryVdfRoot, index: &ShortcutCollectionIndex) -> usize {
    let mut updated = 0usize;
    for (_, value) in &mut root.fields {
        let BinaryVdfValue::Object(fields) = value else {
            continue;
        };
        let Some(appid) = vdf_i32_field(fields, "appid").map(|value| (value as u32) as u64) else {
            continue;
        };
        let hidden = index.hidden_appids.contains(&appid);
        let Some(tags) = index.tags_by_appid.get(&appid) else {
            if hidden {
                set_tags_field(fields, &[]);
                set_hidden_field(fields, true);
                updated += 1;
            }
            continue;
        };
        set_tags_field(fields, tags);
        set_hidden_field(fields, hidden);
        updated += 1;
    }
    updated
}

fn vdf_i32_field(fields: &[(String, BinaryVdfValue)], key: &str) -> Option<i32> {
    fields.iter().find_map(|(field_key, value)| {
        if field_key == key {
            match value {
                BinaryVdfValue::I32(value) => Some(*value),
                _ => None,
            }
        } else {
            None
        }
    })
}

fn set_hidden_field(fields: &mut Vec<(String, BinaryVdfValue)>, hidden: bool) {
    let value = BinaryVdfValue::I32(if hidden { 1 } else { 0 });
    if let Some((_, current)) = fields
        .iter_mut()
        .find(|(key, _)| key == "IsHidden" || key == "hidden")
    {
        *current = value;
        return;
    }
    fields.push(("IsHidden".to_string(), value));
}

fn set_tags_field(fields: &mut Vec<(String, BinaryVdfValue)>, tags: &[String]) {
    let value = BinaryVdfValue::Object(
        tags.iter()
            .enumerate()
            .map(|(index, tag)| (index.to_string(), BinaryVdfValue::String(tag.clone())))
            .collect(),
    );

    if let Some((_, current)) = fields.iter_mut().find(|(key, _)| key == "tags") {
        *current = value;
        return;
    }
    fields.push(("tags".to_string(), value));
}

fn write_shortcuts_tree(root: &BinaryVdfRoot) -> Vec<u8> {
    let mut data = Vec::new();
    data.push(0);
    write_cstring(&mut data, &root.name);
    write_vdf_fields(&mut data, &root.fields);
    data
}

fn write_vdf_fields(data: &mut Vec<u8>, fields: &[(String, BinaryVdfValue)]) {
    for (key, value) in fields {
        match value {
            BinaryVdfValue::Object(fields) => {
                data.push(0);
                write_cstring(data, key);
                write_vdf_fields(data, fields);
            }
            BinaryVdfValue::String(value) => {
                data.push(1);
                write_cstring(data, key);
                write_cstring(data, value);
            }
            BinaryVdfValue::I32(value) => {
                data.push(2);
                write_cstring(data, key);
                data.extend_from_slice(&value.to_le_bytes());
            }
        }
    }
    data.push(8);
}

fn write_cstring(data: &mut Vec<u8>, value: &str) {
    data.extend_from_slice(value.as_bytes());
    data.push(0);
}

fn read_tags_object(reader: &mut BinaryVdfReader<'_>) -> Result<Vec<String>, String> {
    let mut tags = Vec::new();
    loop {
        let value_type = reader.read_u8()?;
        if value_type == 8 {
            break;
        }
        let _key = reader.read_cstring()?;
        match value_type {
            1 => {
                let value = reader.read_cstring()?;
                if !value.trim().is_empty() {
                    tags.push(value);
                }
            }
            0 => reader.skip_object()?,
            2 => {
                let _ = reader.read_i32()?;
            }
            other => return Err(format!("Unsupported shortcuts tag value type: {}", other)),
        }
    }
    Ok(tags)
}

struct BinaryVdfReader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl BinaryVdfReader<'_> {
    fn read_u8(&mut self) -> Result<u8, String> {
        let value = *self
            .data
            .get(self.pos)
            .ok_or("Unexpected end of shortcuts.vdf".to_string())?;
        self.pos += 1;
        Ok(value)
    }

    fn read_i32(&mut self) -> Result<i32, String> {
        let end = self.pos + 4;
        let bytes = self
            .data
            .get(self.pos..end)
            .ok_or("Unexpected end of shortcuts.vdf int".to_string())?;
        self.pos = end;
        Ok(i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_cstring(&mut self) -> Result<String, String> {
        let start = self.pos;
        while self.pos < self.data.len() && self.data[self.pos] != 0 {
            self.pos += 1;
        }
        if self.pos >= self.data.len() {
            return Err("Unterminated shortcuts.vdf string".to_string());
        }
        let value = String::from_utf8_lossy(&self.data[start..self.pos]).to_string();
        self.pos += 1;
        Ok(value)
    }

    fn skip_object(&mut self) -> Result<(), String> {
        loop {
            let value_type = self.read_u8()?;
            if value_type == 8 {
                return Ok(());
            }
            let _key = self.read_cstring()?;
            match value_type {
                0 => self.skip_object()?,
                1 => {
                    let _ = self.read_cstring()?;
                }
                2 => {
                    let _ = self.read_i32()?;
                }
                other => return Err(format!("Unsupported shortcuts.vdf value type: {}", other)),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn parses_binary_shortcuts_with_tags() {
        let mut data = Vec::new();
        start_object(&mut data, "shortcuts");
        start_object(&mut data, "0");
        write_i32(&mut data, "appid", -1_234_567);
        write_string(&mut data, "appname", "My Non-Steam Game");
        write_string(&mut data, "Exe", "\"C:\\Games\\game.exe\"");
        write_string(&mut data, "StartDir", "\"C:\\Games\"");
        write_i32(&mut data, "IsHidden", 1);
        write_i32(&mut data, "LastPlayTime", 1_700_000_000);
        start_object(&mut data, "tags");
        write_string(&mut data, "0", "Deck");
        write_string(&mut data, "1", "Co-op");
        end_object(&mut data);
        end_object(&mut data);
        end_object(&mut data);

        let shortcuts = parse_shortcuts_vdf(&data).unwrap();
        assert_eq!(shortcuts.len(), 1);
        assert_eq!(shortcuts[0].appid, (-1_234_567_i32 as u32) as u64);
        assert_eq!(shortcuts[0].appname, "My Non-Steam Game");
        assert!(shortcuts[0].hidden);
        assert_eq!(shortcuts[0].tags, vec!["Deck", "Co-op"]);
    }

    #[test]
    fn updates_shortcut_tags_and_hidden_while_preserving_other_fields() {
        let mut data = Vec::new();
        start_object(&mut data, "shortcuts");
        start_object(&mut data, "0");
        write_i32(&mut data, "appid", -1_234_567);
        write_string(&mut data, "appname", "My Non-Steam Game");
        write_string(&mut data, "Exe", "\"C:\\Games\\game.exe\"");
        write_i32(&mut data, "IsHidden", 0);
        start_object(&mut data, "tags");
        write_string(&mut data, "0", "Old");
        end_object(&mut data);
        end_object(&mut data);
        end_object(&mut data);

        let mut root = parse_shortcuts_tree(&data).unwrap();
        let appid = (-1_234_567_i32 as u32) as u64;
        let index = shortcut_collection_index(&[
            collection("deck", "Deck", vec![appid]),
            collection("favorite", "Favorites", vec![appid]),
            collection("hidden", "Hidden", vec![appid]),
        ]);

        assert_eq!(update_shortcuts_tree(&mut root, &index), 1);
        let output = write_shortcuts_tree(&root);
        let shortcuts = parse_shortcuts_vdf(&output).unwrap();

        assert_eq!(shortcuts[0].appname, "My Non-Steam Game");
        assert!(shortcuts[0].hidden);
        assert_eq!(shortcuts[0].tags, vec!["Deck", "favorite"]);
    }

    #[test]
    fn saves_shortcuts_file_from_steam_directory_fixture() {
        let steam_id3 = "12345";
        let steam_path = temp_steam_dir("shortcuts-save");
        let shortcuts_dir = steam_path.join("userdata").join(steam_id3).join("config");
        fs::create_dir_all(&shortcuts_dir).unwrap();

        let tagged_appid = (-1_234_567_i32 as u32) as u64;
        let hidden_only_appid = (-7_654_321_i32 as u32) as u64;
        let mut data = Vec::new();
        start_object(&mut data, "shortcuts");
        shortcut_entry(&mut data, "0", -1_234_567, "My Non-Steam Game", 0, &["Old"]);
        shortcut_entry(
            &mut data,
            "1",
            -7_654_321,
            "Hidden Tool",
            0,
            &["Old Hidden Tag"],
        );
        end_object(&mut data);
        fs::write(shortcuts_dir.join("shortcuts.vdf"), data).unwrap();

        let before = load_shortcuts(
            steam_path.to_string_lossy().to_string(),
            steam_id3.to_string(),
        )
        .unwrap();
        assert_eq!(before.len(), 2);
        assert_eq!(before[0].tags, vec!["Old"]);

        let updated = save_shortcuts(
            steam_path.to_string_lossy().to_string(),
            steam_id3.to_string(),
            vec![
                collection("deck", "Deck", vec![tagged_appid]),
                collection("favorite", "Favorites", vec![tagged_appid]),
                collection("hidden", "Hidden", vec![tagged_appid, hidden_only_appid]),
            ],
        )
        .unwrap();

        assert_eq!(updated, 2);
        assert!(shortcuts_dir.read_dir().unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("shortcuts.backup-")));

        let after = load_shortcuts(
            steam_path.to_string_lossy().to_string(),
            steam_id3.to_string(),
        )
        .unwrap();
        assert_eq!(after[0].appname, "My Non-Steam Game");
        assert!(after[0].hidden);
        assert_eq!(after[0].tags, vec!["Deck", "favorite"]);
        assert_eq!(after[1].appname, "Hidden Tool");
        assert!(after[1].hidden);
        assert!(after[1].tags.is_empty());

        fs::remove_dir_all(steam_path).unwrap();
    }

    fn collection(id: &str, name: &str, added: Vec<u64>) -> SteamCollection {
        SteamCollection {
            id: id.to_string(),
            key: format!("user-collections.{id}"),
            name: name.to_string(),
            added,
            removed: Vec::new(),
            timestamp: 0,
            is_deleted: false,
            is_dynamic: false,
        }
    }

    fn start_object(data: &mut Vec<u8>, name: &str) {
        data.push(0);
        data.extend_from_slice(name.as_bytes());
        data.push(0);
    }

    fn end_object(data: &mut Vec<u8>) {
        data.push(8);
    }

    fn write_string(data: &mut Vec<u8>, key: &str, value: &str) {
        data.push(1);
        data.extend_from_slice(key.as_bytes());
        data.push(0);
        data.extend_from_slice(value.as_bytes());
        data.push(0);
    }

    fn write_i32(data: &mut Vec<u8>, key: &str, value: i32) {
        data.push(2);
        data.extend_from_slice(key.as_bytes());
        data.push(0);
        data.extend_from_slice(&value.to_le_bytes());
    }

    fn shortcut_entry(
        data: &mut Vec<u8>,
        index: &str,
        appid: i32,
        appname: &str,
        hidden: i32,
        tags: &[&str],
    ) {
        start_object(data, index);
        write_i32(data, "appid", appid);
        write_string(data, "appname", appname);
        write_string(data, "Exe", "\"C:\\Games\\game.exe\"");
        write_i32(data, "IsHidden", hidden);
        start_object(data, "tags");
        for (index, tag) in tags.iter().enumerate() {
            write_string(data, &index.to_string(), tag);
        }
        end_object(data);
        end_object(data);
    }

    fn temp_steam_dir(name: &str) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "repressurizer-{name}-{}-{unique}",
            std::process::id()
        ))
    }
}
