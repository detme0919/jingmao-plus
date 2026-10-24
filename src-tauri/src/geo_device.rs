//! 设备定位 → GCJ-02（打卡用）：tauri-plugin-geolocation + WGS-84 转换
//!
//! 行为对齐旧版：先高精度（9s），失败且非权限问题时降级普通精度（7s）。

use std::time::Duration;

use tauri::plugin::PermissionState;
use tauri::AppHandle;
use tauri_plugin_geolocation::{GeolocationExt, PermissionType, PositionOptions};

/// 打卡定位入口，返回 GCJ-02 "经度,纬度"
/// 错误串带 `__denied__` / `__timeout__` 前缀，供前端分类提示
pub async fn locate_gcj02(app: &AppHandle) -> Result<String, String> {
    // 权限：Android 请求 ACCESS_FINE/COARSE_LOCATION
    let status = app
        .geolocation()
        .check_permissions()
        .map_err(|e| format!("定位权限检查失败：{e}"))?;
    if status.location != PermissionState::Granted {
        let after = app
            .geolocation()
            .request_permissions(Some(vec![PermissionType::Location]))
            .map_err(|e| format!("请求定位权限失败：{e}"))?;
        if after.location != PermissionState::Granted {
            return Err(
                "__denied__ 未获得定位权限。请到系统设置 → 应用 → 经贸+ → 权限，把“位置信息”设为允许（含精确位置）后重试。"
                    .into(),
            );
        }
    }

    let high = once(app, true, 9000).await;
    let coords = match high {
        Ok(c) => c,
        Err(e) => {
            if is_denied(&e) {
                return Err(format!("__denied__ {e}"));
            }
            let normal = once(app, false, 7000).await;
            match normal {
                Ok(c) => c,
                Err(e2) => {
                    let detail = [e.clone(), e2.clone()].join(" / ");
                    let msg = if is_timeout(&e) || is_timeout(&e2) {
                        "定位超时。室内或信号弱的位置容易失败，请到窗边或室外重试，并确认系统定位已开启。"
                            .to_string()
                    } else {
                        "未能获取当前位置，请确认手机定位服务已开启并允许「经贸+」使用定位。"
                            .to_string()
                    };
                    return Err(format!("__timeout__ {msg}|{detail}"));
                }
            }
        }
    };
    Ok(crate::geo::gcj02_position(coords.1, coords.0))
}

async fn once(app: &AppHandle, high_accuracy: bool, timeout_ms: u64) -> Result<(f64, f64), String> {
    let app = app.clone();
    let maximum_age = if high_accuracy { 0 } else { 60_000 };
    let job = tauri::async_runtime::spawn_blocking(move || {
        let opts = PositionOptions {
            enable_high_accuracy: high_accuracy,
            timeout: timeout_ms as u32,
            maximum_age,
        };
        let pos = app
            .geolocation()
            .get_current_position(Some(opts))
            .map_err(|e| e.to_string())?;
        Ok((pos.coords.latitude, pos.coords.longitude))
    });
    match tokio::time::timeout(Duration::from_millis(timeout_ms + 2000), job).await {
        Ok(Ok(Ok(c))) => Ok(c),
        Ok(Ok(Err(e))) => Err(e),
        Ok(Err(_)) => Err("定位任务失败".into()),
        Err(_) => Err("定位超时".into()),
    }
}

fn is_denied(msg: &str) -> bool {
    let m = msg.to_lowercase();
    m.contains("denied") || m.contains("permission") || msg.contains("拒绝") || msg.contains("授权")
}

fn is_timeout(msg: &str) -> bool {
    let m = msg.to_lowercase();
    m.contains("timeout") || msg.contains("超时")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_classification() {
        assert!(is_denied("location permission denied"));
        assert!(is_timeout("getCurrentPosition timeout"));
        assert!(!is_timeout("no network"));
    }
}
