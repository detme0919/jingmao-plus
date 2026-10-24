//! 定位：设备坐标（WGS-84）→ GCJ-02（火星坐标），打卡接口要求 GCJ-02

const PI: f64 = std::f64::consts::PI;
const A: f64 = 6378245.0; // 长半轴
const EE: f64 = 0.00669342162296594326; // 偏心率平方

fn transform_lat(x: f64, y: f64) -> f64 {
    let mut ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y
        + 0.2 * x.abs().sqrt();
    ret += (20.0 * (6.0 * x * PI).sin() * 2.0) / 3.0;
    ret += (20.0 * (2.0 * x * PI).sin() * 2.0) / 3.0;
    ret += (20.0 * (y * PI).sin() * 2.0) / 3.0;
    ret += (40.0 * (y / 3.0 * PI).sin() * 2.0) / 3.0;
    ret += (160.0 * (y / 12.0 * PI).sin() * 2.0) / 3.0;
    ret += (320.0 * (y * PI / 30.0).sin() * 2.0) / 3.0;
    ret
}

fn transform_lon(x: f64, y: f64) -> f64 {
    let mut ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * x.abs().sqrt();
    ret += (20.0 * (6.0 * x * PI).sin() * 2.0) / 3.0;
    ret += (20.0 * (2.0 * x * PI).sin() * 2.0) / 3.0;
    ret += (20.0 * (x * PI).sin() * 2.0) / 3.0;
    ret += (20.0 * (x / 3.0 * PI).sin() * 2.0) / 3.0;
    ret += (150.0 * (x / 12.0 * PI).sin() * 2.0) / 3.0;
    ret += (300.0 * (x / 30.0 * PI).sin() * 2.0) / 3.0;
    ret
}

fn out_of_china(lng: f64, lat: f64) -> bool {
    !(73.66 < lng && lng < 135.05 && 3.86 < lat && lat < 53.55)
}

/// WGS-84 → GCJ-02
pub fn wgs84_to_gcj02(lng: f64, lat: f64) -> (f64, f64) {
    if out_of_china(lng, lat) {
        return (lng, lat);
    }
    let mut dlat = transform_lat(lng - 105.0, lat - 35.0);
    let mut dlng = transform_lon(lng - 105.0, lat - 35.0);
    let radlat = lat / 180.0 * PI;
    let mut magic = radlat.sin();
    magic = 1.0 - EE * magic * magic;
    let sqrtmagic = magic.sqrt();
    dlat = (dlat * 180.0) / ((A * (1.0 - EE)) / (magic * sqrtmagic) * PI);
    dlng = (dlng * 180.0) / (A / sqrtmagic * radlat.cos() * PI);
    (lng + dlng, lat + dlat)
}

/// 生成打卡 position 字符串
pub fn gcj02_position(lng: f64, lat: f64) -> String {
    let (g_lng, g_lat) = wgs84_to_gcj02(lng, lat);
    format!("{:.6},{:.6}", g_lng, g_lat)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gcj02_offset_is_reasonable() {
        // 郑州市区大致坐标（WGS-84 示例值）
        let (g_lng, g_lat) = wgs84_to_gcj02(113.625368, 34.746598);
        // 偏移应在 100~800 米量级（约 0.001~0.007 度）
        let d_lng = (g_lng - 113.625368).abs();
        let d_lat = (g_lat - 34.746598).abs();
        assert!(d_lng > 0.0005 && d_lng < 0.008, "dlng={d_lng}");
        assert!(d_lat > 0.0005 && d_lat < 0.008, "dlat={d_lat}");
    }

    #[test]
    fn out_of_china_unchanged() {
        let (lng, lat) = wgs84_to_gcj02(2.35, 48.85); // 巴黎
        assert_eq!(lng, 2.35);
        assert_eq!(lat, 48.85);
    }

    #[test]
    fn position_string_format() {
        let p = gcj02_position(113.625368, 34.746598);
        let mut parts = p.split(',');
        let l1 = parts.next().unwrap().parse::<f64>().unwrap();
        let l2 = parts.next().unwrap().parse::<f64>().unwrap();
        assert!(parts.next().is_none());
        assert!(l1 > 113.0 && l1 < 114.0);
        assert!(l2 > 34.0 && l2 < 35.0);
    }
}
