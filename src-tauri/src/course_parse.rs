//! 课程表页面解析（逐条移植 src/utils/course-parse.js@uniapp-v0.2.0，保持行为一致）

use regex::Regex;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Course {
    pub name: String,
    pub period: String,
    #[serde(rename = "weeksText")]
    pub weeks_text: String,
    pub weeks: Vec<u32>,
    pub room: String,
    pub teacher: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CourseDay {
    pub label: String,
    pub name: String,
    pub order: u32,
    pub courses: Vec<Course>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CourseTable {
    #[serde(rename = "className")]
    pub class_name: String,
    pub days: Vec<CourseDay>,
}

/// 从剪贴板文本识别课表链接（返回 URL + wxid）
pub fn parse_course_link(text: &str) -> Option<(String, String)> {
    let raw = text.trim();
    if raw.is_empty() {
        return None;
    }
    let re = Regex::new(
        r#"(?i)https?://weixin\.henetc\.edu\.cn/student/bjkbcx\.aspx\?[^\s"'<>，。；]+"#,
    )
    .ok()?;
    let url = re.find(raw)?.as_str().to_string();
    let wxid = extract_param(&url, "wxid")?;
    if wxid.is_empty() {
        return None;
    }
    Some((url, wxid))
}

/// 展开 "3-5,9-19周" / "7,12,17周"
pub fn expand_weeks(text: &str) -> Vec<u32> {
    let re = Regex::new(r"\d+\s*-\s*\d+|\d+").unwrap();
    let mut weeks = Vec::new();
    for m in re.find_iter(text) {
        let item = m.as_str();
        if item.contains('-') {
            let mut it = item.split('-');
            let a: i64 = it.next().unwrap_or("0").trim().parse().unwrap_or(0);
            let b: i64 = it.next().unwrap_or("0").trim().parse().unwrap_or(0);
            let (lo, hi) = (a.min(b), a.max(b));
            for w in lo..=hi {
                weeks.push(w as u32);
            }
        } else {
            weeks.push(item.trim().parse().unwrap_or(0));
        }
    }
    weeks.retain(|w| *w > 0);
    weeks.sort_unstable();
    weeks.dedup();
    weeks
}

fn day_order(name: &str) -> u32 {
    match name {
        "一" => 1,
        "二" => 2,
        "三" => 3,
        "四" => 4,
        "五" => 5,
        "六" => 6,
        "日" | "天" => 7,
        _ => 9,
    }
}

/// 解析 "高等数学【1-16周；1号楼201】" → (name, weeks_text, room)
fn parse_course_text(raw: &str) -> Option<(String, String, String)> {
    let text = crate::util::text_of(raw);
    if text.is_empty() {
        return None;
    }
    let re = Regex::new(r"^(.*?)【(.*?)】\s*$").unwrap();
    if let Some(c) = re.captures(&text) {
        let name = c.get(1).unwrap().as_str().trim().to_string();
        let inner = c.get(2).unwrap().as_str().trim().to_string();
        let mut parts = inner.split('；');
        let weeks_text = parts.next().unwrap_or("").trim().to_string();
        let room = parts.next().unwrap_or("").trim().to_string();
        Some((name, weeks_text, room))
    } else {
        Some((text, String::new(), String::new()))
    }
}

/// 解析课表 HTML → { className, days }
pub fn parse_course_html(src: &str) -> CourseTable {
    let mut class_name = String::new();
    // 班级：优先 ddl_bj 中选中的 option
    if let Some(select) = crate::util::select_block(src, "ddl_bj") {
        let selected = Regex::new(r#"(?is)<option[^>]*selected[^>]*>([^<]*)</option>"#).unwrap();
        if let Some(c) = selected.captures(&select) {
            class_name = crate::util::text_of(c.get(1).unwrap().as_str());
        }
    }
    if class_name.is_empty() {
        let bracket = Regex::new(r"\[([^\]]+)\]\s*\[星期").unwrap();
        if let Some(c) = bracket.captures(src) {
            class_name = c.get(1).unwrap().as_str().trim().to_string();
        }
    }

    let table_re = Regex::new(r"(?is)<table[\s\S]*?</table>").unwrap();
    let day_before_re = Regex::new(r"\[(星期[一二三四五六日天])\]").unwrap();
    let row_re = Regex::new(r"(?is)<tr[\s\S]*?</tr>").unwrap();
    let cell_re = Regex::new(r"(?is)<td[\s\S]*?</td>").unwrap();
    let br_re = Regex::new(r"(?i)<br\s*/?>").unwrap();

    let mut days: Vec<CourseDay> = Vec::new();
    for table_match in table_re.find_iter(src) {
        let table = table_match.as_str();
        // 回看 ≤500 字节（对齐 JS 版 500 字符），并退到 UTF-8 字符边界
        let mut look_start = table_match.start().saturating_sub(500);
        while look_start > 0 && !src.is_char_boundary(look_start) {
            look_start -= 1;
        }
        let before = &src[look_start..table_match.start()];
        let day_match = match day_before_re.captures(before) {
            Some(c) => c,
            None => continue,
        };
        let day_name = day_match.get(1).unwrap().as_str(); // 星期一
        let label = format!("周{}", &day_name[6..]); // 周一（"星期"占 6 字节）
        let order = day_order(&day_name[6..]);

        let mut courses = Vec::new();
        for row_match in row_re.find_iter(table) {
            let row = row_match.as_str();
            let cells: Vec<&str> = cell_re.find_iter(row).map(|m| m.as_str()).collect();
            if cells.len() < 2 {
                continue;
            }
            let period = crate::util::text_of(cells[0]).replace(' ', "");
            let teacher = if cells.len() > 2 {
                crate::util::text_of(cells[2])
            } else {
                String::new()
            };
            for line in br_re.split(cells[1]) {
                if let Some((name, weeks_text, room)) = parse_course_text(line) {
                    courses.push(Course {
                        name,
                        period: period.clone(),
                        weeks: expand_weeks(&weeks_text),
                        weeks_text,
                        room,
                        teacher: teacher.clone(),
                    });
                }
            }
        }
        days.push(CourseDay {
            label,
            name: day_name.to_string(),
            order,
            courses,
        });
    }
    days.sort_by_key(|d| d.order);
    CourseTable { class_name, days }
}

/// 按周筛选某一天的课程；week=0 表示全部（命令层按周过滤时使用）
#[allow(dead_code)]
pub fn courses_for_week(courses: &[Course], week: u32) -> Vec<Course> {
    if week == 0 {
        return courses.to_vec();
    }
    courses
        .iter()
        .filter(|c| c.weeks.is_empty() || c.weeks.contains(&week))
        .cloned()
        .collect()
}

fn extract_param(url: &str, key: &str) -> Option<String> {
    for part in url.split(['?', '&']) {
        if let Some(v) = part.strip_prefix(&format!("{key}=")) {
            return Some(v.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expand_weeks_ranges() {
        assert_eq!(expand_weeks("1-16周"), (1..=16).collect::<Vec<_>>());
        assert_eq!(expand_weeks("3-5,9-11周"), vec![3, 4, 5, 9, 10, 11]);
        assert_eq!(expand_weeks("7,12,17周"), vec![7, 12, 17]);
        assert_eq!(expand_weeks("16-14周"), vec![14, 15, 16]); // 反向区间
        assert!(expand_weeks("").is_empty());
    }

    #[test]
    fn course_link_parse() {
        let (url, wxid) = parse_course_link(
            "看这里 http://weixin.henetc.edu.cn/student/bjkbcx.aspx?wxid=oABC123&type=student 谢谢",
        )
        .unwrap();
        assert!(url.ends_with("type=student"));
        assert_eq!(wxid, "oABC123");
        assert!(parse_course_link("random text").is_none());
    }

    const SAMPLE: &str = r#"
    <select id="ddl_bj"><option value="a">班级A</option><option selected value="b">26网络3班</option></select>
    [26网络3班][星期一]
    <table>
      <tr><td>1-2节</td><td>计算机网络技术【7-8周；3号楼302】<br>Web前端开发【1-16周；2号楼105】</td><td>张老师</td></tr>
      <tr><td>5-6节</td><td>高等数学【3-5,9-11周；1号楼201】</td><td>刘老师</td></tr>
    </table>
    <p>占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容占位内容</p>
    [26网络3班][星期三]
    <table>
      <tr><td>3-4节</td><td>数据结构【7-17周；5号楼501】</td><td>陈老师</td></tr>
    </table>
    "#;

    #[test]
    fn parse_course_html_sample() {
        let table = parse_course_html(SAMPLE);
        assert_eq!(table.class_name, "26网络3班");
        assert_eq!(table.days.len(), 2);
        assert_eq!(table.days[0].label, "周一");
        assert_eq!(table.days[1].label, "周三");
        let d0 = &table.days[0];
        assert_eq!(d0.courses.len(), 3);
        assert_eq!(d0.courses[0].name, "计算机网络技术");
        assert_eq!(d0.courses[0].period, "1-2节");
        assert_eq!(d0.courses[0].room, "3号楼302");
        assert_eq!(d0.courses[0].teacher, "张老师");
        assert_eq!(d0.courses[0].weeks, vec![7, 8]);
        assert_eq!(d0.courses[1].name, "Web前端开发");
        assert!(d0.courses[1].weeks.len() == 16);
        let d1 = &table.days[1];
        assert_eq!(d1.courses[0].weeks, (7..=17).collect::<Vec<_>>());
    }

    #[test]
    fn filter_by_week() {
        let table = parse_course_html(SAMPLE);
        let week7 = courses_for_week(&table.days[0].courses, 7);
        assert_eq!(week7.len(), 2);
        let week16 = courses_for_week(&table.days[0].courses, 16);
        assert_eq!(week16.len(), 1); // 只有 Web前端开发(1-16)
        assert_eq!(week16[0].name, "Web前端开发");
        let all = courses_for_week(&table.days[0].courses, 0);
        assert_eq!(all.len(), 3);
    }
}
