//! 蓝牙 iBeacon 扫描（教室/教学楼精准定位）
//!
//! Android 端由 Kotlin `BeaconScanner` 执行扫描，这里通过 wry 的 JNI handle 调用。
//! 打卡时若扫描到学校信标，按官方格式组装 iBeaconstr 并将 position 置空；
//! 无信标/无权限时回退 GPS 定位。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

/// 本次进程内蓝牙权限被拒后跳过扫描，避免每次打卡都等待
static BLE_SKIPPED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Beacon {
    pub uuid: String,
    pub major: i32,
    pub minor: i32,
    pub rssi: i32,
    #[serde(default)]
    pub txpower: i32,
    #[serde(default)]
    pub address: String,
    #[serde(default)]
    pub name: String,
}

#[cfg(target_os = "android")]
fn exec_on_activity<F>(app: &AppHandle, f: F) -> Result<(), String>
where
    F: FnOnce(&mut jni::JNIEnv, &jni::objects::JObject) + Send + 'static,
{
    use tauri::Manager;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不可用".to_string())?;
    window
        .with_webview(move |w| {
            w.jni_handle().exec(move |env, activity, _webview| {
                f(env, activity);
            });
        })
        .map_err(|e| format!("调用原生蓝牙失败：{e}"))
}

#[cfg(target_os = "android")]
async fn call_start(app: &AppHandle) -> Result<i32, String> {
    let (tx, rx) = mpsc::channel::<Result<i32, String>>();
    exec_on_activity(app, move |env, activity| {
        let res = (|| -> Result<i32, String> {
            let class = env
                .find_class("com/jingmaoplus/app/BeaconScanner")
                .map_err(|e| e.to_string())?;
            let value = env
                .call_static_method(
                    class,
                    "start",
                    "(Landroid/app/Activity;)I",
                    &[activity.into()],
                )
                .map_err(|e| e.to_string())?;
            value.i().map_err(|e| e.to_string())
        })();
        let _ = env.exception_clear();
        let _ = tx.send(res);
    })?;
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(10)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "调用原生蓝牙超时".to_string())?
}

#[cfg(target_os = "android")]
async fn call_is_scanning(app: &AppHandle) -> Result<bool, String> {
    let (tx, rx) = mpsc::channel::<Result<bool, String>>();
    exec_on_activity(app, move |env, _activity| {
        let res = (|| -> Result<bool, String> {
            let class = env
                .find_class("com/jingmaoplus/app/BeaconScanner")
                .map_err(|e| e.to_string())?;
            let value = env
                .call_static_method(class, "isScanning", "()Z", &[])
                .map_err(|e| e.to_string())?;
            value.z().map_err(|e| e.to_string())
        })();
        let _ = env.exception_clear();
        let _ = tx.send(res);
    })?;
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(5)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "调用原生蓝牙超时".to_string())?
}

#[cfg(target_os = "android")]
async fn call_stop(app: &AppHandle) -> Result<Vec<Beacon>, String> {
    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    exec_on_activity(app, move |env, _activity| {
        let res = (|| -> Result<String, String> {
            let class = env
                .find_class("com/jingmaoplus/app/BeaconScanner")
                .map_err(|e| e.to_string())?;
            let value = env
                .call_static_method(class, "stop", "()Ljava/lang/String;", &[])
                .map_err(|e| e.to_string())?;
            let obj = value.l().map_err(|e| e.to_string())?;
            let jstr: jni::objects::JString = obj.into();
            let text: String = env.get_string(&jstr).map_err(|e| e.to_string())?.into();
            Ok(text)
        })();
        let _ = env.exception_clear();
        let _ = tx.send(res);
    })?;
    let json = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(10)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "调用原生蓝牙超时".to_string())??;
    serde_json::from_str::<Vec<Beacon>>(&json).map_err(|e| format!("解析信标数据失败：{e}"))
}

/// 开始扫描。返回值：0=已开始，1=已请求权限（内部会等待授权），2=蓝牙未开启，3=设备不支持
pub async fn start_scan(app: &AppHandle) -> Result<i32, String> {
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("蓝牙扫描仅在 Android App 内可用".into())
    }
    #[cfg(target_os = "android")]
    {
        if BLE_SKIPPED.load(Ordering::SeqCst) {
            return Ok(2);
        }
        let status = call_start(app).await?;
        if status == 1 {
            // 已弹出系统权限框：等待用户授权，Kotlin 侧授权后会自动开始扫描
            for _ in 0..20 {
                tokio::time::sleep(Duration::from_millis(500)).await;
                if call_is_scanning(app).await.unwrap_or(false) {
                    return Ok(0);
                }
            }
            BLE_SKIPPED.store(true, Ordering::SeqCst);
            return Err("未获得蓝牙权限，请在系统设置中允许「经贸+」使用附近的设备".into());
        }
        Ok(status)
    }
}

/// 停止扫描并返回收集到的信标（按 RSSI 从强到弱）
pub async fn stop_scan(app: &AppHandle) -> Result<Vec<Beacon>, String> {
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("蓝牙扫描仅在 Android App 内可用".into())
    }
    #[cfg(target_os = "android")]
    {
        call_stop(app).await
    }
}

/// 组装官方格式的 iBeaconstr：`{"uuid&major&minor":rssi,...}`（按 RSSI 降序）。
/// 有学校信标（UUID 匹配）才参与；没有学校信标时不构造（走 GPS 兜底）。
fn build_ibeaconstr(beacons: &[Beacon]) -> Option<String> {
    let school: Vec<&Beacon> = beacons
        .iter()
        .filter(|b| b.uuid.eq_ignore_ascii_case(crate::config::SCHOOL_IBEACON_UUID))
        .collect();
    if school.is_empty() {
        return None;
    }
    let mut sorted = school;
    sorted.sort_by(|a, b| b.rssi.cmp(&a.rssi));
    let mut obj = serde_json::Map::new();
    for b in sorted {
        obj.insert(
            format!("{}&{}&{}", b.uuid, b.major, b.minor),
            serde_json::json!(b.rssi),
        );
    }
    Some(serde_json::Value::Object(obj).to_string())
}

/// 打卡用：扫描一段时间并组装 iBeaconstr。无学校信标时返回 Ok(None)（调用方走 GPS 兜底）。
pub async fn scan_ibeaconstr(app: &AppHandle, ms: u64) -> Result<Option<String>, String> {
    let status = start_scan(app).await?;
    if status != 0 {
        return Ok(None);
    }
    tokio::time::sleep(Duration::from_millis(ms)).await;
    let list = stop_scan(app).await?;
    Ok(build_ibeaconstr(&list))
}

/// 命令封装（调试界面可用）
#[tauri::command]
pub async fn ble_start(app: AppHandle) -> Result<i32, String> {
    start_scan(&app).await
}

#[tauri::command]
pub async fn ble_stop(app: AppHandle) -> Result<Vec<Beacon>, String> {
    stop_scan(&app).await
}
