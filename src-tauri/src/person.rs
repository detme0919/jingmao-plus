//! 个人信息（smartlock Person/detail），仅取界面使用的字段

use serde::Serialize;
use serde_json::Value;

use crate::config::SMARTLOCK_API;

#[derive(Debug, Clone, Serialize)]
pub struct Person {
    pub name: String,
    pub idnum: String,
    pub academy: String,
    pub specialty: String,
    #[serde(rename = "className")]
    pub class_name: String,
    pub avatar: String,
}

/// 拉取个人信息。只保留 5 个展示字段，其余（手机号、宿舍等）丢弃不上屏。
pub async fn detail(token: &str) -> Result<Person, String> {
    let url = format!("{SMARTLOCK_API}/core/user/Person/detail");
    let form = vec![
        ("token", token.to_string()),
        ("pid", "yyzx".into()),
        ("aid", "throughSchool".into()),
    ];
    let resp = crate::util::client()
        .post(&url)
        .form(&form)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("网络请求失败：{e}"))?;
    let body: Value = resp.json().await.map_err(|e| format!("响应解析失败：{e}"))?;
    if body.get("status").and_then(Value::as_i64) != Some(0) {
        return Err(body
            .get("errmsg")
            .and_then(Value::as_str)
            .unwrap_or("登录已过期，请重新登录")
            .to_string());
    }
    let d = body.get("data").cloned().unwrap_or(Value::Null);
    Ok(Person {
        name: d.get("username").and_then(Value::as_str).unwrap_or("").into(),
        idnum: d.get("idnum").and_then(Value::as_str).unwrap_or("").into(),
        academy: d.get("academy").and_then(Value::as_str).unwrap_or("").into(),
        specialty: d
            .get("specialty")
            .and_then(Value::as_str)
            .unwrap_or("")
            .into(),
        class_name: d.get("class").and_then(Value::as_str).unwrap_or("").into(),
        avatar: d
            .get("head_image")
            .and_then(Value::as_str)
            .unwrap_or("")
            .into(),
    })
}
