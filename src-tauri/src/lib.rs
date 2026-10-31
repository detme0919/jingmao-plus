mod ble;
mod cas;
mod commands;
mod config;
mod course;
mod course_parse;
mod ehall;
mod geo;
mod geo_device;
mod kq;
mod leave;
mod person;
mod store;
mod util;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_geolocation::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("无法确定数据目录：{e}"))?;
            let s = store::Store::load(&dir)?;
            // 保证存在稳定 openid（考勤登录依赖）
            if s.get("kq_openid")?.is_none() {
                s.set("kq_openid", serde_json::json!(store::generate_openid()))?;
            }
            app.manage(s);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::store_get,
            commands::store_set,
            commands::store_clear_all,
            commands::course_fetch_colleges,
            commands::course_fetch_classes,
            commands::course_query_table,
            commands::course_fetch_by_link,
            commands::course_parse_link_text,
            commands::kq_login,
            commands::kq_profile,
            commands::kq_today,
            commands::kq_current_week,
            commands::kq_logout,
            commands::kq_saved_cred,
            commands::kq_punch,
            commands::leave_list,
            commands::leave_config,
            commands::leave_detail,
            commands::leave_submit,
            commands::person_detail,
            commands::cas_open_login,
            commands::clipboard_detect_register_link,
            commands::official_url,
            commands::qj_records,
            commands::qj_can_apply,
            ble::ble_start,
            ble::ble_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
