//! HTTP 客户端与 HTML 解析小工具

use regex::Regex;

/// 共享 reqwest 客户端（带移动端 UA；学校接口均为表单提交）
pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) \
             Chrome/120.0.0.0 Mobile Safari/537.36",
        )
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .expect("reqwest client")
}

/// 剥离 HTML 标签并解码基本实体，压缩空白（对应 textOf()）
pub fn text_of(html: &str) -> String {
    let with_breaks = Regex::new(r"(?i)<br\s*/?>").unwrap().replace_all(html, "\n");
    let no_tags = Regex::new(r"<[^>]+>").unwrap().replace_all(&with_breaks, " ");
    let decoded = no_tags
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    let collapsed = Regex::new(r"\s+").unwrap().replace_all(&decoded, " ");
    collapsed.trim().to_string()
}

/// 提取 <input>/<textarea> 的 value（WebForms 隐藏字段）
pub fn hidden_field(html: &str, id: &str) -> Option<String> {
    let esc = regex::escape(id);
    if let Some(c) = Regex::new(&format!(
        r#"(?is)<textarea[^>]*name="{esc}"[^>]*>([\s\S]*?)</textarea>"#
    ))
    .ok()?
    .captures(html)
    {
        return Some(c.get(1)?.as_str().trim().to_string());
    }
    let input = Regex::new(&format!(r#"(?is)<input[^>]*name="{esc}"[^>]*>"#))
        .ok()?
        .captures(html)?;
    let tag = input.get(0)?.as_str();
    let val = Regex::new(r#"(?is)value="([^"]*)""#).ok()?.captures(tag)?;
    Some(html_entity_decode(val.get(1)?.as_str()))
}

/// 解析 <select> 内的 option：返回 (value, label)
pub fn parse_options(html: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let opt_re = Regex::new(r#"(?is)<option([^>]*)>([\s\S]*?)</option>"#).unwrap();
    let val_re = Regex::new(r#"(?is)value="([^"]*)""#).unwrap();
    for cap in opt_re.captures_iter(html) {
        let attrs = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let label = text_of(cap.get(2).map(|m| m.as_str()).unwrap_or(""));
        let value = val_re
            .captures(attrs)
            .and_then(|v| v.get(1))
            .map(|v| html_entity_decode(v.as_str()))
            .unwrap_or_default();
        if !label.is_empty() {
            out.push((value, label));
        }
    }
    out
}

/// 提取 <select ... id="xxx"> ... </select> 块
pub fn select_block(html: &str, id: &str) -> Option<String> {
    let re = Regex::new(&format!(
        r#"(?is)<select[^>]*id="{}"[\s\S]*?</select>"#,
        regex::escape(id)
    ))
    .ok()?;
    Some(re.captures(html)?.get(0)?.as_str().to_string())
}

pub fn html_entity_decode(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_of_strips_tags() {
        let html = "<td>a<br/>b&nbsp;&amp;&nbsp;c</td>";
        assert_eq!(text_of(html), "a b & c");
    }

    #[test]
    fn hidden_fields_viewstate() {
        let html = r#"<textarea name="__VIEWSTATE" rows="1">abc/def+</textarea>
            <input type="hidden" name="__VIEWSTATEGENERATOR" value="C2EE9ABB" />
            <input type="hidden" name="__EVENTVALIDATION" value="&quot;e1&quot;" />"#;
        assert_eq!(hidden_field(html, "__VIEWSTATE").unwrap(), "abc/def+");
        assert_eq!(hidden_field(html, "__VIEWSTATEGENERATOR").unwrap(), "C2EE9ABB");
        assert_eq!(hidden_field(html, "__EVENTVALIDATION").unwrap(), "\"e1\"");
    }

    #[test]
    fn options_parse() {
        let html = r#"<select id="ddl_yx"><option value="">--请选择--</option>
            <option selected value="01">信息学院</option><option value="02">会计学院</option></select>"#;
        let block = select_block(html, "ddl_yx").unwrap();
        let opts = parse_options(&block);
        assert_eq!(opts.len(), 3);
        assert_eq!(opts[0], ("".into(), "--请选择--".into()));
        assert_eq!(opts[1], ("01".into(), "信息学院".into()));
        assert_eq!(opts[2], ("02".into(), "会计学院".into()));
            }
}
