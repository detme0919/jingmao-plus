//! 课程表 WebForms 三步查询（院系 → 班级 → 课表），无需登录

use serde::Serialize;

use crate::config::COURSE_PAGE;
use crate::util::{client, hidden_field, parse_options, select_block};

#[derive(Debug, Clone, Serialize)]
pub struct OptionItem {
    pub value: String,
    pub label: String,
}

async fn http_text(
    method: &str,
    url: &str,
    form: Option<Vec<(&'static str, String)>>,
) -> Result<String, String> {
    let cli = client();
    let req = match method {
        "POST" => {
            let f = form.ok_or("POST 缺少表单")?;
            cli.post(url).form(&f)
        }
        _ => cli.get(url),
    };
    let resp = req.send().await.map_err(|e| format!("网络请求失败：{e}"))?;
    resp.text().await.map_err(|e| format!("读取响应失败：{e}"))
}

async fn get_page() -> Result<String, String> {
    http_text("GET", COURSE_PAGE, None).await
}

/// 第一步：GET 页面，取院系列表
pub async fn fetch_colleges() -> Result<Vec<OptionItem>, String> {
    let html = get_page().await?;
    let block = select_block(&html, "ddl_yx").ok_or("页面结构变化：未找到院系列表")?;
    Ok(parse_options(&block)
        .into_iter()
        .filter(|(v, _)| !v.is_empty())
        .map(|(value, label)| OptionItem { value, label })
        .collect())
}

/// 第二步：POST 院系回传，取班级列表
pub async fn fetch_classes(college_value: &str) -> Result<Vec<OptionItem>, String> {
    let html = get_page().await?;
    let fields = postback_fields(&html);

    let posted = http_text(
        "POST",
        COURSE_PAGE,
        Some(vec![
            ("__EVENTTARGET", "ddl_yx".to_string()),
            ("__EVENTARGUMENT", String::new()),
            ("ddl_yx", college_value.to_string()),
            ("ddl_bj", String::new()),
            ("hd_wxid", String::new()),
        ]
        .into_iter()
        .chain(fields)
        .collect()),
    )
    .await?;
    let block = select_block(&posted, "ddl_bj").ok_or("页面结构变化：未找到班级列表")?;
    Ok(parse_options(&block)
        .into_iter()
        .filter(|(v, _)| !v.is_empty())
        .map(|(value, label)| OptionItem { value, label })
        .collect())
}

/// 第三步：POST 班级回传 + 查询，解析课表
pub async fn query_table(
    college_value: &str,
    class_value: &str,
) -> Result<crate::course_parse::CourseTable, String> {
    let html = get_page().await?;
    let fields = postback_fields(&html);

    let with_classes = http_text(
        "POST",
        COURSE_PAGE,
        Some(vec![
            ("__EVENTTARGET", "ddl_yx".to_string()),
            ("__EVENTARGUMENT", String::new()),
            ("ddl_yx", college_value.to_string()),
            ("ddl_bj", String::new()),
            ("hd_wxid", String::new()),
        ]
        .into_iter()
        .chain(fields.clone())
        .collect()),
    )
    .await?;
    let fields2 = postback_fields(&with_classes);

    let table_html = http_text(
        "POST",
        COURSE_PAGE,
        Some(vec![
            ("__EVENTTARGET", String::new()),
            ("__EVENTARGUMENT", String::new()),
            ("ddl_yx", college_value.to_string()),
            ("ddl_bj", class_value.to_string()),
            ("hd_wxid", String::new()),
            ("bt_cx", "查 询".to_string()),
        ]
        .into_iter()
        .chain(fields2)
        .collect()),
    )
    .await?;

    let table = crate::course_parse::parse_course_html(&table_html);
    if table.days.is_empty() {
        return Err("没有查到该班级的课表".into());
    }
    Ok(table)
}

/// 兜底：直接按公众号课表链接抓取
pub async fn fetch_by_link(url: &str) -> Result<crate::course_parse::CourseTable, String> {
    let html = http_text("GET", url, None).await?;
    let table = crate::course_parse::parse_course_html(&html);
    if table.days.is_empty() {
        return Err("课表页面加载失败".into());
    }
    Ok(table)
}

/// WebForms 隐藏字段（每次回传使用上一次响应中的值）
fn postback_fields(html: &str) -> Vec<(&'static str, String)> {
    vec![
        ("__VIEWSTATE", hidden_field(html, "__VIEWSTATE").unwrap_or_default()),
        (
            "__VIEWSTATEGENERATOR",
            hidden_field(html, "__VIEWSTATEGENERATOR").unwrap_or_default(),
        ),
        (
            "__EVENTVALIDATION",
            hidden_field(html, "__EVENTVALIDATION").unwrap_or_default(),
        ),
    ]
}
