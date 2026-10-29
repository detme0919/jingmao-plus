//! 学校接口端点与公共参数（来源见 docs/api-notes.md）

pub const SCHOOL_NAME: &str = "河南经贸职业学院";

/// 出校登记（smartlock / 统一认证体系）
pub const SMARTLOCK_API: &str = "http://smartlock.henetc.edu.cn/throughSchool";
pub const PERREGISTER_URL: &str = "http://smartlock.henetc.edu.cn/throughSchool/static/app/#/perregister";
pub const SMARTLOCK_PAGE: &str = "http://smartlock.henetc.edu.cn/throughSchool/static/app/#/perregister";

/// 统一认证入口：302 到 CAS，登录成功后回调并附带 token
pub const UNIFY_AUTH_LOGIN: &str = "http://id.henetc.edu.cn/user_center/core/login/unifyAuthLogin";

/// 打卡考勤（独立账号体系）
pub const KQ_API: &str = "https://kq.henetc.edu.cn/catch";
pub const KQ_LOGIN_API: &str = "https://kq.henetc.edu.cn/ucenter/core/user/hnjmCatchWxLogin";
#[allow(dead_code)]
pub const KQ_SIGN_PAGE: &str = "https://kq.henetc.edu.cn/catch/static/app/#/sign?aid=catch&pid=yyzx"; // 打卡记录 WebView 入口

/// 课程表（公开 WebForms 页面，无需登录）
pub const COURSE_PAGE: &str = "http://weixin.henetc.edu.cn/student/bjkbcx.aspx?type=student";
#[allow(dead_code)]
pub const COURSE_HOST: &str = "weixin.henetc.edu.cn"; // 课程链接识别用

/// 学校考勤蓝牙信标的 iBeacon UUID（抓包实测，所有教室信标共用，Major=1）
pub const SCHOOL_IBEACON_UUID: &str = "17320508-0756-8877-2935-274463415059";

/// URL 白名单：仅允许学校域名（含子域）
pub fn is_allowed_host(url: &str) -> bool {
    let lower = url.to_lowercase();
    let rest = match lower.strip_prefix("http://").or_else(|| lower.strip_prefix("https://")) {
        Some(r) => r,
        None => return false,
    };
    let host = rest.split(['/', ':', '?', '#']).next().unwrap_or("");
    host.ends_with(".henetc.edu.cn") || host.ends_with(".hnjmxy.cn")
}

/// 构造统一认证入口地址。callback 中的 `#` 编码为 `_1_`（学校约定），
/// 其余按 encodeURIComponent 规则转义。
pub fn unify_auth_login_url(callback: &str) -> String {
    let encoded = callback.replace('#', "_1_");
    let encoded = encodeURIComponent(&encoded);
    format!("{UNIFY_AUTH_LOGIN}?system_flag=throughSchool&type=3&callback={encoded}")
}

/// JS encodeURIComponent 的 Rust 等价实现（unreserved chars: A-Za-z0-9-_.!~*'()）
#[allow(non_snake_case)]
pub fn encodeURIComponent(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for &b in s.as_bytes() {
        let c = b as char;
        if c.is_ascii_alphanumeric() || "-_.!~*'()".contains(c) {
            out.push(c);
        } else {
            out.push('%');
            out.push_str(&format!("{b:02X}"));
        }
    }
    out
}

/// 从 URL 中提取登录 token（`?token=` 或 `#/xxx?token=`，支持多层编码）
pub fn parse_login_token(raw: &str) -> Option<(String, String)> {
    let mut text = raw.trim().to_string();
    if text.is_empty() {
        return None;
    }
    // 逐层解码，最多 5 层
    for _ in 0..5 {
        let decoded = urlencoding::decode(&text).ok()?.into_owned();
        if decoded == text {
            break;
        }
        text = decoded;
    }
    if !text.starts_with("http") {
        return None;
    }
    if !is_allowed_host(&text) {
        return None;
    }
    let token = extract_query_param(&text, "token")?;
    if token.is_empty() {
        return None;
    }
    // 回调地址去掉 token 参数后作为业务入口
    let base = text
        .split(&['?', '#'][..])
        .next()
        .unwrap_or(SMARTLOCK_PAGE)
        .to_string();
    Some((token, base))
}

/// 提取 URL 查询参数（不含 fragment 内参数；fragment 参数由调用方预处理）
fn extract_query_param(url: &str, key: &str) -> Option<String> {
    for part in url.split(['?', '&', '#']) {
        if let Some(v) = part.strip_prefix(&format!("{key}=")) {
            return Some(v.split('&').next().unwrap_or("").to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_host_check() {
        assert!(is_allowed_host("https://smartlock.henetc.edu.cn/throughSchool/static/app/#/perregister"));
        assert!(is_allowed_host("http://id.henetc.edu.cn/user_center/x"));
        assert!(is_allowed_host("https://a.b.hnjmxy.cn/x"));
        assert!(!is_allowed_host("https://evil.example.com/?x=henetc.edu.cn"));
        assert!(!is_allowed_host("https://henetc.edu.cn.evil.com/"));
        assert!(!is_allowed_host("ftp://henetc.edu.cn/"));
    }

    #[test]
    fn unify_url_encoding() {
        let url = unify_auth_login_url(PERREGISTER_URL);
        assert!(url.starts_with("http://id.henetc.edu.cn/user_center/core/login/unifyAuthLogin?"));
        assert!(url.contains("_1_")); // # → _1_
        assert!(!url.contains('#'));
    }

    #[test]
    fn parse_token_plain() {
        let url = "http://smartlock.henetc.edu.cn/throughSchool/static/app/index.html?token=abcDEF123._-x&expire=86400#/perregister";
        let (token, base) = parse_login_token(url).unwrap();
        assert_eq!(token, "abcDEF123._-x");
        assert!(base.starts_with("http://smartlock.henetc.edu.cn"));
    }

    #[test]
    fn parse_token_encoded() {
        let raw = "http%3A%2F%2Fsmartlock.henetc.edu.cn%2FthroughSchool%2Fstatic%2Fapp%2F%23%2Fperregister%3Ftoken%3DTok12345678";
        let (token, _) = parse_login_token(raw).unwrap();
        assert_eq!(token, "Tok12345678");
    }

    #[test]
    fn parse_token_rejects_foreign_host() {
        assert!(parse_login_token("https://evil.com/?token=abcdefgh").is_none());
        assert!(parse_login_token("").is_none());
    }
}
