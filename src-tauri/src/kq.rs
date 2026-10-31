//! 打卡考勤接口（独立账号体系；密码登录为纯 HTTP，见 docs/api-notes.md §5）

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::config::{KQ_API, KQ_LOGIN_API};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KqAuth {
    pub token: String,
    #[serde(rename = "savedAt")]
    pub saved_at: i64,
    #[serde(rename = "expiresAt", default)]
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KqProfile {
    pub idnum: String,
    pub name: String,
    #[serde(rename = "className")]
    pub class_name: String,
    pub academy: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct KqRecord {
    pub time: String,
    pub title: String,
    /// 签到类型名（如「定位点签到」「扫脸签到」）
    #[serde(rename = "typeName")]
    pub type_name: String,
    pub position: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct KqLoginResult {
    pub token: String,
    /// token 过期时间（秒级时间戳），缺失时由调用方按 24h 计算
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<i64>,
    pub name: String,
    #[serde(rename = "className")]
    pub class_name: String,
}

/// 表单 POST，返回 {status, data, errmsg}
async fn post_kq(path: &str, form: Vec<(&str, String)>) -> Result<Value, String> {
    let url = if path.starts_with("http") {
        path.to_string()
    } else {
        format!("{KQ_API}{path}")
    };
    let resp = crate::util::client()
        .post(&url)
        .header("pid", "yyzx") // 占位，真实参数在表单里
        .form(&form)
        .timeout(std::time::Duration::from_secs(12))
        .send()
        .await
        .map_err(|e| format!("网络请求失败：{e}"))?;
    resp.json::<Value>()
        .await
        .map_err(|e| format!("响应解析失败：{e}"))
}

fn base_form() -> Vec<(&'static str, String)> {
    vec![("pid", "yyzx".into()), ("aid", "catch".into())]
}

/// 密码登录（与学校小程序一致；openid 由客户端生成并固定）
pub async fn login(username: &str, password: &str, openid: &str) -> Result<KqLoginResult, String> {
    let mut form = base_form();
    form.push(("username", username.to_string()));
    form.push(("password", password.to_string()));
    form.push(("openid", openid.to_string()));
    form.push(("app", String::new()));

    let body = post_kq(KQ_LOGIN_API, form).await?;
    match body.get("status").and_then(Value::as_i64) {
        Some(0) => {
            let data = body.get("data").cloned().unwrap_or(Value::Null);
            let token = data
                .get("token")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if token.is_empty() {
                return Err("登录响应缺少 token".into());
            }
            let expires_at = data
                .get("token_expire_time")
                .and_then(Value::as_i64)
                .map(|secs| secs * 1000);
            let userinfo = data.get("userinfo").cloned().unwrap_or(Value::Null);
            Ok(KqLoginResult {
                token,
                expires_at,
                name: userinfo
                    .get("username")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                class_name: userinfo
                    .get("classnameStr")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
            })
        }
        Some(4) => Err("登录缺少 OpenID，请重试（应用会自动生成）".into()),
        Some(5) => Err("账号或密码错误".into()),
        Some(_) => Err(body
            .get("errmsg")
            .and_then(Value::as_str)
            .unwrap_or("登录失败")
            .to_string()),
        None => Err("登录响应格式异常".into()),
    }
}

fn expect_token(auth: &KqAuth) -> Result<(&str, bool), String> {
    let now = chrono::Utc::now().timestamp_millis();
    let expired = auth.expires_at.map(|e| e < now).unwrap_or(false);
    if expired {
        return Err("登录已过期，请重新登录考勤".into());
    }
    Ok((auth.token.as_str(), true))
}

/// 个人信息（同时校验 token 有效性）
pub async fn profile(auth: &KqAuth) -> Result<KqProfile, String> {
    expect_token(auth)?;
    let mut form = base_form();
    form.push(("token", auth.token.clone()));
    let body = post_kq("/core/person/detailajax", form).await?;
    if body.get("status").and_then(Value::as_i64) != Some(0) {
        let msg = body
            .get("errmsg")
            .and_then(Value::as_str)
            .unwrap_or("考勤凭证无效");
        return Err(msg.to_string());
    }
    let d = body
        .get("data")
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .cloned()
        .ok_or("个人信息为空")?;
    Ok(KqProfile {
        idnum: d.get("idnum").and_then(Value::as_str).unwrap_or("").into(),
        name: d.get("username").and_then(Value::as_str).unwrap_or("").into(),
        class_name: d
            .get("classnameStr")
            .and_then(Value::as_str)
            .unwrap_or("")
            .into(),
        academy: d.get("academy").and_then(Value::as_str).unwrap_or("").into(),
    })
}

fn today_str() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// 今天的签到记录
pub async fn today(auth: &KqAuth) -> Result<Vec<KqRecord>, String> {
    expect_token(auth)?;
    let day = today_str();
    let mut form = base_form();
    form.push(("token", auth.token.clone()));
    form.push(("begintime", day.clone()));
    form.push(("endtime", day));
    form.push(("page", "1".into()));
    form.push(("pageSize", "20".into()));
    let body = post_kq("/core/Signin/getFreeSignAjax", form).await?;
    if body.get("status").and_then(Value::as_i64) != Some(0) {
        return Err(body
            .get("errmsg")
            .and_then(Value::as_str)
            .unwrap_or("查询失败")
            .to_string());
    }
    let list = body
        .get("data")
        .and_then(|d| d.get("data"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(list
        .iter()
        .map(|r| {
            // 小程序展示的是 time_part（如「夜晚归寝」「9-10节课」「自由签到」），
            // 而非 title（恒为「自由签到」）；缺失时回退 title
            let title = r
                .get("time_part")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .or_else(|| r.get("title").and_then(Value::as_str))
                .unwrap_or("")
                .into();
            KqRecord {
                time: r.get("signintime").and_then(Value::as_str).unwrap_or("").into(),
                title,
                type_name: r
                    .get("signtypename")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .into(),
                position: r.get("position").and_then(Value::as_str).unwrap_or("").into(),
                status: r
                    .get("status")
                    .map(|s| match s {
                        Value::String(x) => x.clone(),
                        other => other.to_string(),
                    })
                    .unwrap_or_default(),
            }
        })
        .collect())
}

/// 当前教学周（课程表页使用）
pub async fn current_week(auth: &KqAuth) -> Result<(u32, u32), String> {
    let mut form = vec![("pid", "yyzx".to_string()), ("aid", "catch".to_string())];
    form.push(("token", auth.token.clone()));
    let body = post_kq("/core/syllabus/getSyllabusInfoAjax", form).await?;
    if body.get("status").and_then(Value::as_i64) != Some(0) {
        return Err("当前周查询失败（考勤凭证无效）".into());
    }
    let data = body.get("data").cloned().unwrap_or(Value::Null);
    // 学校接口 week 可能是数字也可能是字符串（实测返回 "09"），做兼容解析
  let week_num = |key: &str| -> i64 {
    let v = data.get(key);
    v.and_then(Value::as_i64)
      .or_else(|| v.and_then(Value::as_str).and_then(|x| x.trim().parse::<i64>().ok()))
      .unwrap_or(0)
  };
  let week = week_num("week").max(0) as u32;
  let total = week_num("weeknum").max(20) as u32;
    Ok((week, total))
}

/// 打卡。position 为 GCJ-02 "经度,纬度"（由 geo 模块提供）。
/// 注意：只在用户明确点击打卡时调用，测试中禁止触发。
pub async fn punch(auth: &KqAuth, idnum: &str, position: &str, ibeaconstr: &str) -> Result<String, String> {
    expect_token(auth)?;
    let mut form = base_form();
    form.push(("token", auth.token.clone()));
    form.push(("idnum", idnum.to_string()));
    form.push(("position", position.to_string()));
    form.push(("iBeaconstr", ibeaconstr.to_string()));
    let body = post_kq("/core/syllabus/freeSignAjax", form).await?;
    if body.get("status").and_then(Value::as_i64) == Some(0) {
        Ok("打卡成功".into())
    } else {
        Err(body
            .get("errmsg")
            .and_then(Value::as_str)
            .unwrap_or("打卡失败，请稍后重试")
            .to_string())
    }
}
