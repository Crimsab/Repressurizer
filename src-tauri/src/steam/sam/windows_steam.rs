use super::probe::find_steam_client_library;
use super::SamAchievementState;
use libloading::Library;
use std::ffi::OsString;
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::mem;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

const STEAM_CLIENT_VERSION: &[u8] = b"SteamClient018\0";
const STEAM_UTILS_VERSION: &[u8] = b"SteamUtils005\0";
const STEAM_USER_VERSION: &[u8] = b"SteamUser012\0";
const STEAM_USER_STATS_VERSION: &[u8] = b"STEAMUSERSTATS_INTERFACE_VERSION013\0";
const USER_STATS_RECEIVED_CALLBACK_ID: c_int = 1101;
const USER_STATS_STORED_CALLBACK_ID: c_int = 1102;

type CreateInterface =
    unsafe extern "C" fn(version: *const c_char, return_code: *mut c_int) -> *mut c_void;
type SteamBGetCallback =
    unsafe extern "C" fn(pipe: c_int, message: *mut CallbackMessage, call: *mut c_int) -> bool;
type SteamFreeLastCallback = unsafe extern "C" fn(pipe: c_int) -> bool;

type CreateSteamPipe = unsafe extern "system" fn(this: *mut c_void) -> c_int;
type ReleaseSteamPipe = unsafe extern "system" fn(this: *mut c_void, pipe: c_int) -> bool;
type ConnectToGlobalUser = unsafe extern "system" fn(this: *mut c_void, pipe: c_int) -> c_int;
type ReleaseUser = unsafe extern "system" fn(this: *mut c_void, pipe: c_int, user: c_int);
type GetSteamUser =
    unsafe extern "system" fn(*mut c_void, c_int, c_int, *const c_char) -> *mut c_void;
type GetSteamUtils = unsafe extern "system" fn(*mut c_void, c_int, *const c_char) -> *mut c_void;
type GetSteamUserStats =
    unsafe extern "system" fn(*mut c_void, c_int, c_int, *const c_char) -> *mut c_void;
type ShutdownIfAllPipesClosed = unsafe extern "system" fn(*mut c_void) -> bool;

type GetAppId = unsafe extern "system" fn(*mut c_void) -> u32;
type GetSteamId = unsafe extern "system" fn(*mut c_void, *mut u64);
type RequestUserStats = unsafe extern "system" fn(*mut c_void, u64) -> u64;
type GetNumAchievements = unsafe extern "system" fn(*mut c_void) -> u32;
type GetAchievementName = unsafe extern "system" fn(*mut c_void, u32) -> *const c_char;
type GetAchievementAndUnlockTime =
    unsafe extern "system" fn(*mut c_void, *const c_char, *mut bool, *mut u32) -> bool;
type SetAchievement = unsafe extern "system" fn(*mut c_void, *const c_char) -> bool;
type ClearAchievement = unsafe extern "system" fn(*mut c_void, *const c_char) -> bool;
type StoreStats = unsafe extern "system" fn(*mut c_void) -> bool;

#[repr(C)]
struct CallbackMessage {
    user: c_int,
    id: c_int,
    param_pointer: *mut c_void,
    param_size: c_int,
}

pub struct SamSteamBridge {
    _library: Library,
    steam_client: *mut c_void,
    steam_user: *mut c_void,
    steam_user_stats: *mut c_void,
    pipe: c_int,
    user: c_int,
    steam_b_get_callback: SteamBGetCallback,
    steam_free_last_callback: SteamFreeLastCallback,
    release_user: ReleaseUser,
    release_steam_pipe: ReleaseSteamPipe,
    shutdown_if_all_pipes_closed: ShutdownIfAllPipesClosed,
    active_app_id: u32,
    _steam_app_id_env: ScopedEnvVar,
    _steam_game_id_env: ScopedEnvVar,
    _steam_overlay_game_id_env: ScopedEnvVar,
}

impl SamSteamBridge {
    pub fn connect(steam_path: &str, app_id: u64) -> Result<Self, String> {
        if app_id == 0 || app_id > u32::MAX as u64 {
            return Err("A valid Steam appId is required.".to_string());
        }

        let steam_root = PathBuf::from(steam_path.trim());
        let steam_client_path = find_steam_client_library(&steam_root)
            .ok_or("Steam client library was not found under the configured Steam path.")?;
        prepend_dll_search_path(&steam_root);
        let steam_app_id_env = ScopedEnvVar::set("SteamAppId", app_id.to_string());
        let steam_game_id_env = ScopedEnvVar::remove("SteamGameId");
        let steam_overlay_game_id_env = ScopedEnvVar::remove("SteamOverlayGameId");

        let library = unsafe { Library::new(&steam_client_path) }
            .map_err(|error| format!("Failed to load steamclient: {error}"))?;
        let create_interface = unsafe {
            *library
                .get::<CreateInterface>(b"CreateInterface")
                .map_err(|error| format!("CreateInterface not found: {error}"))?
        };
        let steam_b_get_callback = unsafe {
            *library
                .get::<SteamBGetCallback>(b"Steam_BGetCallback")
                .map_err(|error| format!("Steam_BGetCallback not found: {error}"))?
        };
        let steam_free_last_callback = unsafe {
            *library
                .get::<SteamFreeLastCallback>(b"Steam_FreeLastCallback")
                .map_err(|error| format!("Steam_FreeLastCallback not found: {error}"))?
        };

        let steam_client =
            unsafe { create_interface(STEAM_CLIENT_VERSION.as_ptr().cast(), std::ptr::null_mut()) };
        if steam_client.is_null() {
            return Err("Failed to create ISteamClient018.".to_string());
        }

        let create_steam_pipe = unsafe {
            vfunc::<CreateSteamPipe>(steam_client, SteamClientFn::CreateSteamPipe as usize)
        };
        let release_steam_pipe = unsafe {
            vfunc::<ReleaseSteamPipe>(steam_client, SteamClientFn::ReleaseSteamPipe as usize)
        };
        let shutdown_if_all_pipes_closed = unsafe {
            vfunc::<ShutdownIfAllPipesClosed>(
                steam_client,
                SteamClientFn::ShutdownIfAllPipesClosed as usize,
            )
        };
        let connect_to_global_user = unsafe {
            vfunc::<ConnectToGlobalUser>(steam_client, SteamClientFn::ConnectToGlobalUser as usize)
        };
        let release_user =
            unsafe { vfunc::<ReleaseUser>(steam_client, SteamClientFn::ReleaseUser as usize) };
        let get_steam_user =
            unsafe { vfunc::<GetSteamUser>(steam_client, SteamClientFn::GetISteamUser as usize) };
        let get_steam_utils =
            unsafe { vfunc::<GetSteamUtils>(steam_client, SteamClientFn::GetISteamUtils as usize) };
        let get_steam_user_stats = unsafe {
            vfunc::<GetSteamUserStats>(steam_client, SteamClientFn::GetISteamUserStats as usize)
        };

        let pipe = unsafe { create_steam_pipe(steam_client) };
        if pipe == 0 {
            return Err("Failed to create Steam pipe.".to_string());
        }
        let user = unsafe { connect_to_global_user(steam_client, pipe) };
        if user == 0 {
            unsafe {
                release_steam_pipe(steam_client, pipe);
            }
            return Err("Failed to connect to the logged-in Steam user.".to_string());
        }

        let steam_utils =
            unsafe { get_steam_utils(steam_client, pipe, STEAM_UTILS_VERSION.as_ptr().cast()) };
        if steam_utils.is_null() {
            unsafe {
                release_user(steam_client, pipe, user);
                release_steam_pipe(steam_client, pipe);
            }
            return Err("Failed to get ISteamUtils.".to_string());
        }
        let get_app_id = unsafe { vfunc::<GetAppId>(steam_utils, SteamUtilsFn::GetAppId as usize) };
        let active_app_id = unsafe { get_app_id(steam_utils) };
        if active_app_id != app_id as u32 {
            unsafe {
                release_user(steam_client, pipe, user);
                release_steam_pipe(steam_client, pipe);
            }
            return Err(format!(
                "Steam initialized appId {active_app_id}, expected {app_id}."
            ));
        }

        let steam_user =
            unsafe { get_steam_user(steam_client, user, pipe, STEAM_USER_VERSION.as_ptr().cast()) };
        if steam_user.is_null() {
            unsafe {
                release_user(steam_client, pipe, user);
                release_steam_pipe(steam_client, pipe);
            }
            return Err("Failed to get ISteamUser.".to_string());
        }

        let steam_user_stats = unsafe {
            get_steam_user_stats(
                steam_client,
                user,
                pipe,
                STEAM_USER_STATS_VERSION.as_ptr().cast(),
            )
        };
        if steam_user_stats.is_null() {
            unsafe {
                release_user(steam_client, pipe, user);
                release_steam_pipe(steam_client, pipe);
            }
            return Err("Failed to get ISteamUserStats.".to_string());
        }

        Ok(Self {
            _library: library,
            steam_client,
            steam_user,
            steam_user_stats,
            pipe,
            user,
            steam_b_get_callback,
            steam_free_last_callback,
            release_user,
            release_steam_pipe,
            shutdown_if_all_pipes_closed,
            active_app_id,
            _steam_app_id_env: steam_app_id_env,
            _steam_game_id_env: steam_game_id_env,
            _steam_overlay_game_id_env: steam_overlay_game_id_env,
        })
    }

    pub fn active_app_id(&self) -> u32 {
        self.active_app_id
    }

    pub fn prepare_user_stats(&mut self) -> bool {
        let get_steam_id =
            unsafe { vfunc::<GetSteamId>(self.steam_user, SteamUserFn::GetSteamId as usize) };
        let request_user_stats = unsafe {
            vfunc::<RequestUserStats>(
                self.steam_user_stats,
                SteamUserStatsFn::RequestUserStats as usize,
            )
        };
        let mut steam_id = 0u64;
        unsafe {
            get_steam_id(self.steam_user, &mut steam_id);
        }
        if steam_id == 0 {
            return false;
        }

        let request = unsafe { request_user_stats(self.steam_user_stats, steam_id) };
        let _ = self.wait_for_user_stats(Duration::from_millis(1500));
        request != 0
    }

    pub fn achievement_names(&self) -> Result<Vec<String>, String> {
        let get_num = unsafe {
            vfunc::<GetNumAchievements>(
                self.steam_user_stats,
                SteamUserStatsFn::GetNumAchievements as usize,
            )
        };
        let get_name = unsafe {
            vfunc::<GetAchievementName>(
                self.steam_user_stats,
                SteamUserStatsFn::GetAchievementName as usize,
            )
        };

        let count = unsafe { get_num(self.steam_user_stats) };
        let mut names = Vec::new();
        for index in 0..count {
            let ptr = unsafe { get_name(self.steam_user_stats, index) };
            if ptr.is_null() {
                continue;
            }
            let name = unsafe { CStr::from_ptr(ptr) }
                .to_string_lossy()
                .into_owned();
            if !name.trim().is_empty() {
                names.push(name);
            }
        }
        Ok(names)
    }

    pub fn capture_states(&self, ids: &[String]) -> Vec<SamAchievementState> {
        ids.iter()
            .map(|id| {
                let (achieved, unlock_time, valid) = self.achievement_state(id);
                SamAchievementState {
                    api_name: id.clone(),
                    achieved,
                    unlock_time: unlock_time as u64,
                    valid,
                }
            })
            .collect()
    }

    pub fn set_achievement(&self, name: &str, achieved: bool) -> bool {
        let Ok(name) = CString::new(name) else {
            return false;
        };
        if achieved {
            let set = unsafe {
                vfunc::<SetAchievement>(
                    self.steam_user_stats,
                    SteamUserStatsFn::SetAchievement as usize,
                )
            };
            unsafe { set(self.steam_user_stats, name.as_ptr()) }
        } else {
            let clear = unsafe {
                vfunc::<ClearAchievement>(
                    self.steam_user_stats,
                    SteamUserStatsFn::ClearAchievement as usize,
                )
            };
            unsafe { clear(self.steam_user_stats, name.as_ptr()) }
        }
    }

    pub fn store_stats(&self) -> bool {
        let store = unsafe {
            vfunc::<StoreStats>(self.steam_user_stats, SteamUserStatsFn::StoreStats as usize)
        };
        unsafe { store(self.steam_user_stats) }
    }

    pub fn wait_for_stats_stored(&self, duration: Duration) -> bool {
        self.run_callbacks_until(duration, |message| {
            callback_matches_app(message, USER_STATS_STORED_CALLBACK_ID, self.active_app_id)
        })
    }

    fn wait_for_user_stats(&self, duration: Duration) -> bool {
        self.run_callbacks_until(duration, |message| {
            callback_matches_app(message, USER_STATS_RECEIVED_CALLBACK_ID, self.active_app_id)
        })
    }

    fn run_callbacks_until<F>(&self, duration: Duration, mut predicate: F) -> bool
    where
        F: FnMut(&CallbackMessage) -> bool,
    {
        let end = Instant::now() + duration;
        while Instant::now() < end {
            loop {
                let mut message = CallbackMessage {
                    user: 0,
                    id: 0,
                    param_pointer: std::ptr::null_mut(),
                    param_size: 0,
                };
                let mut call = 0;
                let has_callback =
                    unsafe { (self.steam_b_get_callback)(self.pipe, &mut message, &mut call) };
                if !has_callback {
                    break;
                }
                let matched = predicate(&message);
                unsafe {
                    (self.steam_free_last_callback)(self.pipe);
                }
                if matched {
                    return true;
                }
            }
            thread::sleep(Duration::from_millis(25));
        }
        false
    }

    fn achievement_state(&self, name: &str) -> (bool, u32, bool) {
        let Ok(name) = CString::new(name) else {
            return (false, 0, false);
        };
        let get = unsafe {
            vfunc::<GetAchievementAndUnlockTime>(
                self.steam_user_stats,
                SteamUserStatsFn::GetAchievementAndUnlockTime as usize,
            )
        };
        let mut achieved = false;
        let mut unlock_time = 0u32;
        let valid = unsafe {
            get(
                self.steam_user_stats,
                name.as_ptr(),
                &mut achieved,
                &mut unlock_time,
            )
        };
        (achieved, unlock_time, valid)
    }
}

fn callback_matches_app(message: &CallbackMessage, callback_id: c_int, app_id: u32) -> bool {
    message.id == callback_id && callback_app_id(message) == Some(app_id)
}

fn callback_app_id(message: &CallbackMessage) -> Option<u32> {
    if message.param_pointer.is_null() || message.param_size < mem::size_of::<u64>() as c_int {
        return None;
    }
    let game_id = unsafe { std::ptr::read_unaligned(message.param_pointer.cast::<u64>()) };
    if game_id <= u32::MAX as u64 {
        return Some(game_id as u32);
    }
    Some((game_id & u32::MAX as u64) as u32)
}

struct ScopedEnvVar {
    key: &'static str,
    previous: Option<OsString>,
}

impl ScopedEnvVar {
    fn set(key: &'static str, value: String) -> Self {
        let previous = std::env::var_os(key);
        std::env::set_var(key, value);
        Self { key, previous }
    }

    fn remove(key: &'static str) -> Self {
        let previous = std::env::var_os(key);
        std::env::remove_var(key);
        Self { key, previous }
    }
}

impl Drop for ScopedEnvVar {
    fn drop(&mut self) {
        if let Some(previous) = &self.previous {
            std::env::set_var(self.key, previous);
        } else {
            std::env::remove_var(self.key);
        }
    }
}

impl Drop for SamSteamBridge {
    fn drop(&mut self) {
        unsafe {
            if self.user != 0 {
                (self.release_user)(self.steam_client, self.pipe, self.user);
                self.user = 0;
            }
            if self.pipe != 0 {
                (self.release_steam_pipe)(self.steam_client, self.pipe);
                self.pipe = 0;
            }
            let _ = (self.shutdown_if_all_pipes_closed)(self.steam_client);
        }
    }
}

#[repr(usize)]
enum SteamClientFn {
    CreateSteamPipe = 0,
    ReleaseSteamPipe = 1,
    ConnectToGlobalUser = 2,
    ReleaseUser = 4,
    GetISteamUser = 5,
    GetISteamUtils = 9,
    GetISteamUserStats = 13,
    ShutdownIfAllPipesClosed = 23,
}

#[repr(usize)]
enum SteamUserFn {
    GetSteamId = 2,
}

#[repr(usize)]
enum SteamUtilsFn {
    GetAppId = 9,
}

#[repr(usize)]
enum SteamUserStatsFn {
    SetAchievement = 6,
    ClearAchievement = 7,
    GetAchievementAndUnlockTime = 8,
    StoreStats = 9,
    GetNumAchievements = 13,
    GetAchievementName = 14,
    RequestUserStats = 15,
}

unsafe fn vfunc<T: Copy>(object: *mut c_void, index: usize) -> T {
    let vtable = *(object as *const *const *const c_void);
    let function = *vtable.add(index);
    mem::transmute_copy(&function)
}

fn prepend_dll_search_path(steam_root: &Path) {
    let mut paths = vec![steam_root.to_path_buf(), steam_root.join("bin")];
    if let Some(current) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&current));
    }
    if let Ok(joined) = std::env::join_paths(paths) {
        std::env::set_var("PATH", joined);
    }
}
