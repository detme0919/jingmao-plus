//! 出校登记（smartlock / 统一认证体系）接口，见 docs/api-notes.md §4

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::config::SMARTLOCK_API;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaveRecord {
    pub id: String,
    #[serde(rename = "beginTime", default)]
    pub begin_time: String,
    #[serde(rename = "endTime", default)]
    pub end_time: String,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub destination: String,
    #[serde(rename = "trafficWay", default)]
    pub traffic_way: String,
    #[serde(default)]
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LeavePage {
    pub list: Vec<LeaveRecord>,
    #[serde(rename = "totalPage")]
    pub total_page: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct LeaveConfig {
    #[serde(rename = "outSchoolTime")]
    pub out_school_time: String,
    #[serde(rename = "inSchoolTime")]
    pub in_school_time: String,
    #[serde(rename = "advanceDays")]
    pub advance_days: u32,
}

async fn post_leave(path: &str, form: Vec<(&str, String)>) -> Result<Value, String> {
    let url = format!("{SMARTLOCK_API}{path}");
    let resp = crate::util::client()
        .post(&url)
        .form(&form)
        .timeout(std::time::Duration::from_secs(12))
        .send()
        .await
        .map_err(|e| format!("网络请求失败：{e}"))?;
    resp.json::<Value>()
        .await
        .map_err(|e| format!("响应解析失败：{e}"))
}

fn check_envelope(body: &Value) -> Result<Value, String> {
    match body.get("status").and_then(Value::as_i64) {
        Some(0) => Ok(body.get("data").cloned().unwrap_or(Value::Null)),
        Some(-1) => Err("登录已过期，请重新登录".into()),
        _ => Err(body
            .get("errmsg")
            .and_then(Value::as_str)
            .unwrap_or("请求失败")
            .to_string()),
    }
}

/// 登记记录分页列表；status 为空字符串表示全部
pub async fn list(token: &str, status: &str, page: u32) -> Result<LeavePage, String> {
    let form = vec![
        ("token", token.to_string()),
        ("status", status.to_string()),
        ("page", page.to_string()),
        ("pageSize", "10".into()),
    ];
    let body = post_leave("/core/user/Outapply/getList", form).await?;
    let data = check_envelope(&body)?;
    let arr = data
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let total_page = data
        .get("pageInfo")
        .and_then(|p| p.get("totalPage"))
        .and_then(Value::as_u64)
        .unwrap_or(1) as u32;
    let list = arr
        .iter()
        .map(|r| LeaveRecord {
            id: r
                .get("id")
                .map(|v| match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
                .unwrap_or_default(),
            begin_time: r
                .get("apply_begin_time")
                .and_then(Value::as_str)
                .unwrap_or("")
                .into(),
            end_time: r
                .get("apply_end_time")
                .and_then(Value::as_str)
                .unwrap_or("")
                .into(),
            reason: r.get("reason").and_then(Value::as_str).unwrap_or("").into(),
            destination: r
                .get("destination")
                .and_then(Value::as_str)
                .unwrap_or("")
                .into(),
            traffic_way: r
                .get("traffic_way")
                .map(|v| match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
                .unwrap_or_default(),
            status: r
                .get("status")
                .map(|v| match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
                .unwrap_or_default(),
        })
        .collect();
    Ok(LeavePage { list, total_page })
}

/// 学校配置：出入校时间与可提前申请天数
pub async fn config(token: &str) -> Result<LeaveConfig, String> {
    let form = vec![("token", token.to_string())];
    let body = post_leave("/core/user/config/getList", form).await?;
    let data = check_envelope(&body)?;
    let arr = data.as_array().cloned().unwrap_or_default();
    let get = |key: &str| -> String {
        arr.iter()
            .find(|item| item.get("ckey").and_then(Value::as_str) == Some(key))
            .and_then(|item| item.get("value"))
            .map(|v| match v {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            })
            .unwrap_or_default()
    };
    Ok(LeaveConfig {
        out_school_time: {
            let v = get("outSchoolTime");
            if v.is_empty() { "06:30".into() } else { v }
        },
        in_school_time: {
            let v = get("inSchoolTime");
            if v.is_empty() { "22:00".into() } else { v }
        },
        advance_days: {
            let v = get("advanceDays");
            v.parse::<u32>().unwrap_or(1).max(1)
        },
    })
}

/// 申请详情
pub async fn detail(token: &str, id: &str) -> Result<LeaveRecord, String> {
    let form = vec![("token", token.to_string()), ("id", id.to_string())];
    let body = post_leave("/core/user/outapply/detail", form).await?;
    let data = check_envelope(&body)?;
    let r = if data.is_object() { data } else { Value::Null };
    Ok(LeaveRecord {
        id: id.to_string(),
        begin_time: r
            .get("apply_begin_time")
            .and_then(Value::as_str)
            .unwrap_or("")
            .into(),
        end_time: r
            .get("apply_end_time")
            .and_then(Value::as_str)
            .unwrap_or("")
            .into(),
        reason: r.get("reason").and_then(Value::as_str).unwrap_or("").into(),
        destination: r
            .get("destination")
            .and_then(Value::as_str)
            .unwrap_or("")
            .into(),
        traffic_way: r
            .get("traffic_way")
            .map(|v| match v {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            })
            .unwrap_or_default(),
        status: r
            .get("status")
            .map(|v| match v {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            })
            .unwrap_or_default(),
    })
}

/// 提交离校申请。只在用户明确点击提交时调用；测试中禁止触发。
pub async fn submit(
    token: &str,
    begin_time: &str,
    end_time: &str,
    reason: &str,
    traffic_way: &str,
    destination: &str,
) -> Result<(), String> {
    let form = vec![
        ("token", token.to_string()),
        ("apply_begin_time", begin_time.to_string()),
        ("apply_end_time", end_time.to_string()),
        ("reason", reason.to_string()),
        ("traffic_way", traffic_way.to_string()),
        ("destination", destination.to_string()),
    ];
    let body = post_leave("/core/user/Outapply/add", form).await?;
    check_envelope(&body)?;
    Ok(())
}
