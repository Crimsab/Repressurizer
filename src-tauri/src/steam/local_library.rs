use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::PathBuf;

const PACKAGEINFO_MAGIC_27: u32 = 0x06_56_55_27;
const PACKAGEINFO_MAGIC_28: u32 = 0x06_56_55_28;

#[derive(Debug, Clone, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct LocalLicenseApp {
    pub appid: u64,
    pub package_id: u32,
}

#[derive(Debug, Clone, PartialEq)]
enum BinaryKvValue {
    Object(BTreeMap<String, BinaryKvValue>),
    String(String),
    I32(i32),
    U64(u64),
}

#[tauri::command]
pub fn load_local_license_library(
    steam_path: String,
    steam_id3: String,
) -> Result<Vec<LocalLicenseApp>, String> {
    let account_id = steam_id3
        .trim()
        .parse::<i32>()
        .map_err(|_| format!("Invalid Steam ID3/account ID: {steam_id3}"))?;
    let license_path = PathBuf::from(&steam_path)
        .join("userdata")
        .join(&steam_id3)
        .join("config")
        .join("licensecache");
    let package_path = PathBuf::from(&steam_path)
        .join("appcache")
        .join("packageinfo.vdf");

    if !license_path.exists() {
        return Err(format!("licensecache not found at {}", license_path.display()));
    }
    if !package_path.exists() {
        return Err(format!(
            "packageinfo.vdf not found at {}",
            package_path.display()
        ));
    }

    let licenses = parse_licensecache(&fs::read(&license_path).map_err(|error| {
        format!(
            "Failed to read licensecache {}: {}",
            license_path.display(),
            error
        )
    })?, account_id)?;
    let packages = parse_packageinfo(&fs::read(&package_path).map_err(|error| {
        format!(
            "Failed to read packageinfo.vdf {}: {}",
            package_path.display(),
            error
        )
    })?)?;

    let mut apps = BTreeSet::new();
    for package_id in licenses {
        if package_id == 0 {
            continue;
        }
        if let Some(appids) = packages.get(&package_id) {
            for appid in appids {
                apps.insert(LocalLicenseApp {
                    appid: u64::from(*appid),
                    package_id,
                });
            }
        }
    }

    Ok(apps.into_iter().collect())
}

pub fn parse_licensecache(data: &[u8], account_id: i32) -> Result<Vec<u32>, String> {
    if data.len() <= 4 {
        return Ok(Vec::new());
    }
    let decrypted = decrypt_licensecache(account_id, data);
    parse_license_list_protobuf(&decrypted[..decrypted.len().saturating_sub(4)])
}

fn decrypt_licensecache(account_id: i32, data: &[u8]) -> Vec<u8> {
    let mut random = SteamRandomStream::new();
    random.set_seed(account_id);
    data.iter().map(|byte| byte ^ random.random_char()).collect()
}

fn parse_license_list_protobuf(data: &[u8]) -> Result<Vec<u32>, String> {
    let mut pos = 0usize;
    let mut packages = Vec::new();
    while pos < data.len() {
        let key = read_varint(data, &mut pos)?;
        let field = key >> 3;
        let wire_type = key & 0x07;
        if field == 2 && wire_type == 2 {
            let len = read_varint(data, &mut pos)? as usize;
            let end = pos
                .checked_add(len)
                .ok_or("licensecache protobuf length overflow".to_string())?;
            let message = data
                .get(pos..end)
                .ok_or("licensecache protobuf license message truncated".to_string())?;
            if let Some(package_id) = parse_license_package_id(message)? {
                packages.push(package_id);
            }
            pos = end;
        } else {
            skip_protobuf_field(data, &mut pos, wire_type)?;
        }
    }
    Ok(packages)
}

fn parse_license_package_id(data: &[u8]) -> Result<Option<u32>, String> {
    let mut pos = 0usize;
    while pos < data.len() {
        let key = read_varint(data, &mut pos)?;
        let field = key >> 3;
        let wire_type = key & 0x07;
        if field == 1 && wire_type == 0 {
            return Ok(Some(read_varint(data, &mut pos)? as u32));
        }
        skip_protobuf_field(data, &mut pos, wire_type)?;
    }
    Ok(None)
}

fn read_varint(data: &[u8], pos: &mut usize) -> Result<u64, String> {
    let mut value = 0u64;
    let mut shift = 0u32;
    loop {
        let byte = *data
            .get(*pos)
            .ok_or("protobuf varint ended unexpectedly".to_string())?;
        *pos += 1;
        value |= u64::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
        shift += 7;
        if shift >= 64 {
            return Err("protobuf varint is too long".to_string());
        }
    }
}

fn skip_protobuf_field(data: &[u8], pos: &mut usize, wire_type: u64) -> Result<(), String> {
    match wire_type {
        0 => {
            let _ = read_varint(data, pos)?;
        }
        1 => {
            *pos = pos
                .checked_add(8)
                .ok_or("protobuf fixed64 offset overflow".to_string())?;
        }
        2 => {
            let len = read_varint(data, pos)? as usize;
            *pos = pos
                .checked_add(len)
                .ok_or("protobuf bytes offset overflow".to_string())?;
        }
        5 => {
            *pos = pos
                .checked_add(4)
                .ok_or("protobuf fixed32 offset overflow".to_string())?;
        }
        other => return Err(format!("Unsupported protobuf wire type: {other}")),
    }
    if *pos > data.len() {
        return Err("protobuf field extends past end of data".to_string());
    }
    Ok(())
}

pub fn parse_packageinfo(data: &[u8]) -> Result<BTreeMap<u32, Vec<u32>>, String> {
    let mut reader = BinaryReader { data, pos: 0 };
    let magic = reader.read_u32()?;
    if magic != PACKAGEINFO_MAGIC_27 && magic != PACKAGEINFO_MAGIC_28 {
        return Err("packageinfo.vdf has an unsupported magic header".to_string());
    }
    let _universe = reader.read_u32()?;

    let mut packages = BTreeMap::new();
    loop {
        let header_package_id = reader.read_u32()?;
        if header_package_id == 0xffff_ffff {
            break;
        }
        let _sha = reader.read_exact(20)?;
        let _change_number = reader.read_u32()?;
        if magic == PACKAGEINFO_MAGIC_28 {
            let _token = reader.read_u64()?;
        }

        let entries = reader.read_kv_entries()?;
        let package_id = object_i32(&entries, "packageid")
            .map(|value| value as u32)
            .unwrap_or(header_package_id);
        let appids = object_appids(&entries, "appids");
        packages.insert(package_id, appids);
    }

    Ok(packages)
}

fn object_i32(object: &BTreeMap<String, BinaryKvValue>, key: &str) -> Option<i32> {
    match object.get(key) {
        Some(BinaryKvValue::I32(value)) => Some(*value),
        Some(BinaryKvValue::U64(value)) => Some(*value as i32),
        Some(BinaryKvValue::String(value)) => value.parse().ok(),
        _ => None,
    }
}

fn object_appids(object: &BTreeMap<String, BinaryKvValue>, key: &str) -> Vec<u32> {
    let Some(BinaryKvValue::Object(appids)) = object.get(key) else {
        return Vec::new();
    };
    let mut values = appids
        .values()
        .filter_map(|value| match value {
            BinaryKvValue::I32(value) if *value > 0 => Some(*value as u32),
            BinaryKvValue::U64(value) => Some(*value as u32),
            BinaryKvValue::String(value) => value.parse::<u32>().ok(),
            _ => None,
        })
        .collect::<Vec<_>>();
    values.sort_unstable();
    values.dedup();
    values
}

struct BinaryReader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl BinaryReader<'_> {
    fn read_u8(&mut self) -> Result<u8, String> {
        let value = *self
            .data
            .get(self.pos)
            .ok_or("Unexpected end of packageinfo.vdf".to_string())?;
        self.pos += 1;
        Ok(value)
    }

    fn read_u32(&mut self) -> Result<u32, String> {
        let bytes = self.read_exact(4)?;
        Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_i32(&mut self) -> Result<i32, String> {
        let bytes = self.read_exact(4)?;
        Ok(i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_u64(&mut self) -> Result<u64, String> {
        let bytes = self.read_exact(8)?;
        Ok(u64::from_le_bytes([
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        ]))
    }

    fn read_exact(&mut self, len: usize) -> Result<&[u8], String> {
        let end = self
            .pos
            .checked_add(len)
            .ok_or("packageinfo.vdf offset overflow".to_string())?;
        let bytes = self
            .data
            .get(self.pos..end)
            .ok_or("Unexpected end of packageinfo.vdf".to_string())?;
        self.pos = end;
        Ok(bytes)
    }

    fn read_cstring(&mut self) -> Result<String, String> {
        let start = self.pos;
        while self.pos < self.data.len() && self.data[self.pos] != 0 {
            self.pos += 1;
        }
        if self.pos >= self.data.len() {
            return Err("Unterminated packageinfo.vdf string".to_string());
        }
        let value = String::from_utf8_lossy(&self.data[start..self.pos]).to_string();
        self.pos += 1;
        Ok(value)
    }

    fn read_kv_entries(&mut self) -> Result<BTreeMap<String, BinaryKvValue>, String> {
        let mut object = BTreeMap::new();
        loop {
            let value_type = self.read_u8()?;
            if value_type == 8 {
                return Ok(object);
            }
            let key = self.read_cstring()?;
            let value = match value_type {
                0 => BinaryKvValue::Object(self.read_kv_entries()?),
                1 => BinaryKvValue::String(self.read_cstring()?),
                2 => BinaryKvValue::I32(self.read_i32()?),
                7 => BinaryKvValue::U64(self.read_u64()?),
                other => return Err(format!("Unsupported packageinfo.vdf KV type: {other}")),
            };
            object.insert(key, value);
        }
    }
}

struct SteamRandomStream {
    idum: i32,
    iy: i32,
    iv: [i32; 32],
}

impl SteamRandomStream {
    fn new() -> Self {
        Self {
            idum: 0,
            iy: 0,
            iv: [0; 32],
        }
    }

    fn set_seed(&mut self, seed: i32) {
        self.idum = if seed < 0 { seed } else { -seed };
        self.iy = 0;
        self.iv = [0; 32];
    }

    fn random_number(&mut self) -> i32 {
        const IA: i32 = 16807;
        const IM: i32 = 2_147_483_647;
        const IQ: i32 = 127_773;
        const IR: i32 = 2_836;
        const NTAB: usize = 32;
        const NDIV: i32 = 1 + (IM - 1) / NTAB as i32;

        if self.idum <= 0 || self.iy == 0 {
            self.idum = if -self.idum < 1 { 1 } else { -self.idum };
            for j in (0..(NTAB + 7)).rev() {
                let k = self.idum / IQ;
                self.idum = IA * (self.idum - k * IQ) - IR * k;
                if self.idum < 0 {
                    self.idum += IM;
                }
                if j < NTAB {
                    self.iv[j] = self.idum;
                }
            }
            self.iy = self.iv[0];
        }

        let k = self.idum / IQ;
        self.idum = IA * (self.idum - k * IQ) - IR * k;
        if self.idum < 0 {
            self.idum += IM;
        }

        let mut j = self.iy / NDIV;
        if !(0..NTAB as i32).contains(&j) {
            j = (j % NTAB as i32) & 0x7fff_ffff;
        }
        self.iy = self.iv[j as usize];
        self.iv[j as usize] = self.idum;
        self.iy
    }

    fn random_int(&mut self, low: i32, high: i32) -> i32 {
        const MAX_RANDOM_RANGE: u32 = 0x7fff_ffff;
        let range = high - low + 1;
        if range <= 1 || MAX_RANDOM_RANGE < (range - 1) as u32 {
            return low;
        }
        let max_acceptable = MAX_RANDOM_RANGE - ((MAX_RANDOM_RANGE + 1) % range as u32);
        loop {
            let value = self.random_number() as u32;
            if value <= max_acceptable {
                return low + (value % range as u32) as i32;
            }
        }
    }

    fn random_char(&mut self) -> u8 {
        self.random_int(32, 126) as u8
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_licensecache_package_ids_from_encrypted_protobuf() {
        let mut plaintext = Vec::new();
        write_license(&mut plaintext, 42);
        write_license(&mut plaintext, 99);
        plaintext.extend_from_slice(&[0, 0, 0, 0]);
        let encrypted = decrypt_licensecache(12345, &plaintext);

        assert_eq!(parse_licensecache(&encrypted, 12345).unwrap(), vec![42, 99]);
    }

    #[test]
    fn parses_packageinfo_appids() {
        let data = packageinfo_fixture(42, &[10, 20]);
        let packages = parse_packageinfo(&data).unwrap();

        assert_eq!(packages.get(&42).cloned().unwrap(), vec![10, 20]);
    }

    fn write_license(data: &mut Vec<u8>, package_id: u32) {
        let mut license = Vec::new();
        write_varint_field(&mut license, 1, package_id as u64);
        data.push((2 << 3) | 2);
        write_varint(data, license.len() as u64);
        data.extend_from_slice(&license);
    }

    fn write_varint_field(data: &mut Vec<u8>, field: u8, value: u64) {
        data.push(field << 3);
        write_varint(data, value);
    }

    fn write_varint(data: &mut Vec<u8>, mut value: u64) {
        while value >= 0x80 {
            data.push((value as u8) | 0x80);
            value >>= 7;
        }
        data.push(value as u8);
    }

    fn packageinfo_fixture(package_id: u32, appids: &[u32]) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(&PACKAGEINFO_MAGIC_27.to_le_bytes());
        data.extend_from_slice(&1u32.to_le_bytes());
        data.extend_from_slice(&package_id.to_le_bytes());
        data.extend_from_slice(&[0u8; 20]);
        data.extend_from_slice(&1u32.to_le_bytes());
        write_i32(&mut data, "packageid", package_id as i32);
        write_i32(&mut data, "billingtype", 1);
        start_object(&mut data, "appids");
        for (index, appid) in appids.iter().enumerate() {
            write_i32(&mut data, &index.to_string(), *appid as i32);
        }
        end_object(&mut data);
        end_object(&mut data);
        data.extend_from_slice(&0xffff_ffffu32.to_le_bytes());
        data
    }

    fn start_object(data: &mut Vec<u8>, name: &str) {
        data.push(0);
        data.extend_from_slice(name.as_bytes());
        data.push(0);
    }

    fn end_object(data: &mut Vec<u8>) {
        data.push(8);
    }

    fn write_i32(data: &mut Vec<u8>, key: &str, value: i32) {
        data.push(2);
        data.extend_from_slice(key.as_bytes());
        data.push(0);
        data.extend_from_slice(&value.to_le_bytes());
    }
}
