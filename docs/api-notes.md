# 学校系统接口参考（非官方）

> 本文档记录「经贸+」在实现过程中核实过的学校系统接口与页面流程，供个人维护、排错和二次开发参考。
>
> - 分析对象：河南经贸职业学院相关系统
> - 分析时间：2026-10
> - 信息来源：公开前端脚本、页面表单结构，以及使用者本人账号的正常访问
> - 文档中的 `<token>`、`<openid>`、`<wxid>`、`<room>`、`<img_key>` 均为占位符，不对应任何真实数据
>
> **免责声明**：本项目为非官方个人作品。请只访问本人有权访问的数据，不要批量请求、自动化提交申请、自动打卡或绕过权限。学校接口可能随时调整，文档不保证长期有效。

---

## 目录

1. [系统总览](#1-系统总览)
2. [通用约定](#2-通用约定)
3. [统一认证与用户中心](#3-统一认证与用户中心)
4. [出校登记](#4-出校登记)
5. [考勤](#5-考勤)
6. [课程表](#6-课程表)
7. [水电与空调缴费](#7-水电与空调缴费)
8. [本地存储](#8-本地存储)
9. [错误与兼容性](#9-错误与兼容性)
10. [隐私与安全](#10-隐私与安全)
11. [参考实现](#11-参考实现)

---

## 1. 系统总览

| 系统 | 域名 | 认证方式 | App 模块 |
| --- | --- | --- | --- |
| 用户中心 / CAS | `id.henetc.edu.cn`、`auth.henetc.edu.cn` | CAS 登录换取 token | 我的、出校登记 |
| 出校登记 | `smartlock.henetc.edu.cn` | 用户中心 token / 微信链接 token | 工作台 → 出校登记 |
| 学生考勤 | `kq.henetc.edu.cn` | 考勤系统独立 token | 工作台 → 打卡考勤 |
| 班级课表 | `weixin.henetc.edu.cn` | 公开页面，无需登录 | 课程表 |
| 空调缴费 | `weixin.henetc.edu.cn` | 微信 openid 绑定 | 暂未接入（研究记录） |
| 宿舍水电 | `xqh5.17wanxiao.com` | 第三方 H5 链接参数 | 暂未接入（研究记录） |

几个关键结论：

- 统一认证 token 只适用于用户中心/出校登记体系，**不能直接调用考勤接口**（实测返回 `status: -1 未登录`）。
- 考勤系统有自己的 ucenter 和 token，需要单独登录一次。
- 课表页是公开的 ASP.NET WebForms 页面，按院系/班级查询。
- 空调缴费在已绑定微信身份后不需要登录，直接输入房间号和金额即可。
- 缴费链接包含个人 openid/token，只保存在本机，不进入仓库。

---

## 2. 通用约定

### 2.1 请求与响应

- 出校登记、考勤、课表、空调缴费的多数接口使用 `POST` + `application/x-www-form-urlencoded`
- 响应一般为 JSON：
  ```json
  {
    "status": 0,
    "data": {},
    "errmsg": ""
  }
  ```
- `status == 0` 表示成功；非 0 时读取 `errmsg` 或 `msg`
- 部分旧页面返回 HTML（ASP.NET WebForms），需要解析隐藏字段或表格

### 2.2 状态码

| 系统 | 状态码 | 含义 |
| --- | --- | --- |
| 出校登记 | `0` | 成功 |
| 出校登记 | `-1` | token 失效/未登录 |
| 出校登记 | `-2` | 业务错误 |
| 考勤 | `0` | 成功 |
| 考勤 | `-1` | 未登录/token 失效 |
| 考勤 | `4` | 缺少 openid |
| 考勤 | `5` | 用户名或密码错误 |

### 2.3 公共参数

| 参数 | 说明 |
| --- | --- |
| `pid` | 学校/项目标识，当前为 `yyzx` |
| `aid` | 应用标识：出校登记 `throughSchool`，考勤 `catch` |
| `token` | 登录凭证，放在表单字段或 URL 查询参数中 |

### 2.4 分页与时间

- 分页从 `page=1` 开始，`pageSize` 常用 10
- 日期格式：`yyyy-MM-dd`
- 时间格式：`yyyy-MM-dd HH:mm:ss`
- 考勤定位格式：`经度,纬度`（GCJ-02）

### 2.5 协议

学校部分老系统仍使用 HTTP 明文：

- `http://smartlock.henetc.edu.cn`
- `http://weixin.henetc.edu.cn`
- `http://id.henetc.edu.cn`

App 在 manifest 中开启 `usesCleartextTraffic`（Android 上是全局开关），但 App 目前只访问上述 HTTP 学校域名；HTTPS 域名（如 `kq.henetc.edu.cn`、`auth.henetc.edu.cn`）保持默认校验。

---

## 3. 统一认证与用户中心

### 3.1 CAS 入口

用户中心后端提供统一认证入口：

```text
GET http://id.henetc.edu.cn/user_center/core/login/unifyAuthLogin
  ?system_flag=throughSchool
  &type=3
  &callback=<URL 编码后的回跳地址>
```

请求后会 302 到学校 CAS：

```text
https://auth.henetc.edu.cn/GGSCASServer/login?service=<用户中心回调地址>
```

登录成功后，CAS 携带票据回到：

```text
http://id.henetc.edu.cn/user_center/core/login/unifyAuthLoginCallback
  ?params=throughSchool__3__<回跳地址编码>
```

用户中心校验票据后签发 token，并跳回 `callback`，token 拼在地址中。

### 3.2 回跳地址编码

- `params` 使用 `system_flag__type__callback` 的格式
- 回跳地址里的 `#` 会被服务端编码为 `_1_`，避免 fragment 截断
- token 可能出现两种位置，App 均兼容：
  - `http://smartlock.henetc.edu.cn/throughSchool/static/app/#/perregister?token=<token>`
  - `http://smartlock.henetc.edu.cn/throughSchool/static/app/?token=<token>#/perregister`

### 3.3 CAS 会话与记住我

- CAS 默认使用会话级 `JSESSIONID`，关闭页面后可能失效
- 登录页包含标准 `rememberMe` 复选框（`name="rememberMe"`）
- App 在 WebView 页面加载后自动勾选「记住我」，让 CAS 下发持久票据
- 统一认证 token 约 24 小时有效；到期后重新打开 CAS 入口，通常可以静默换发新 token
- 持久票据的有效期由学校服务端决定（通常数天到数周）

### 3.4 已废弃/不可用的入口

| 入口 | 状态 | 说明 |
| --- | --- | --- |
| 用户中心移动端 `#/mlogin` | 已废弃 | 账号密码校验失败，短信也收不到 |
| 学工系统 `xgzx.henetc.edu.cn` 绑定页 | 仅微信内 | 依赖微信网页授权，原生 App 无法直接调用 |
| 考勤接口使用统一认证 token | 不可用 | 返回 `status: -1 未登录` |

### 3.5 相关实现

- 登录地址构造：`src/config/school.js` → `buildLoginUrl()`
- WebView 登录与 token 捕获：`src/pages/webview/webview.vue`
- token 解析与存储：`src/utils/link.js`

---

## 4. 出校登记

### 4.1 基础信息

```text
页面基址：http://smartlock.henetc.edu.cn/throughSchool/static/app/
接口基址：http://smartlock.henetc.edu.cn/throughSchool
```

- 请求方式：`POST`
- 请求头：`Content-Type: application/x-www-form-urlencoded`
- 公共参数：`token`、`pid=yyzx`、`aid=throughSchool`
- 链接 token：微信链接带 `expire=86400`（24 小时）

### 4.2 个人信息

```text
POST /core/user/Person/detail
```

| 参数 | 说明 |
| --- | --- |
| 公共参数 | 无额外业务参数 |

返回 `data` 为个人信息对象，主要字段：

| 字段 | 含义 | 备注 |
| --- | --- | --- |
| `id` / `idnum` | 内部 ID / 学号 | 敏感 |
| `username` | 姓名 | 敏感 |
| `type` | 用户类型 | 1 学生，2 教师等 |
| `grade` / `academy` / `specialty` / `class` | 年级/学院/专业/班级 | 敏感 |
| `head_image` | 头像完整地址 | 可直接 GET |
| `img_key` | 头像 key | 敏感 |
| `mobile` / `certificate_no` / `dormitory` / `dorm_no` / `bed_no` | 联系方式/证件/宿舍 | 敏感，禁止写入文档或日志 |

> 隐私要求：真实姓名、学号、手机号、证件号、头像 key 不得出现在仓库、Issue、截图或提交记录中。

### 4.3 登记记录列表

```text
POST /core/user/Outapply/getList
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `status` | string | 否 | `1` 未出校、`2` 待返校、`3` 已返校、`4` 超时未返校；空字符串为全部 |
| `begin_time` | string | 否 | `yyyy-MM-dd` |
| `end_time` | string | 否 | `yyyy-MM-dd` |
| `page` | number | 是 | 从 1 开始 |
| `pageSize` | number | 是 | 常用 10 |

返回：

```json
{
  "status": 0,
  "data": {
    "data": [
      {
        "apply_begin_time": "yyyy-MM-dd HH:mm:ss",
        "apply_end_time": "yyyy-MM-dd HH:mm:ss",
        "status": "1"
      }
    ],
    "pageInfo": {
      "totalPage": 3
    }
  }
}
```

### 4.4 提交离校申请

```text
POST /core/user/Outapply/add
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `apply_begin_time` | string | 是 | 预计离校时间 |
| `apply_end_time` | string | 是 | 预计返校时间 |
| `reason` | string | 是 | 外出事由，≤30 字 |
| `traffic_way` | number | 是 | `1` 公共交通、`2` 打车、`3` 私家车、`4` 其他 |
| `destination` | string | 是 | 目的地，≤20 字 |

前端校验：

- 离校与返校时间间隔 ≥ 1 小时
- 事由、交通方式、目的地必填
- 时间需符合学校配置（默认最早 06:30、最晚 22:00）
- 提交成功后，门禁权限在申请时段内生效

### 4.5 时间规则配置

```text
POST /core/user/config/getList
```

返回 `data` 为 `[{ ckey, value }]`，已知键：

| ckey | 含义 |
| --- | --- |
| `outSchoolTime` | 允许离校最早时刻，`HH:mm` |
| `inSchoolTime` | 允许返校最晚时刻，`HH:mm` |
| `advanceDays` | 可提前申请天数 |

### 4.6 申请详情与出入日志

| 接口 | 说明 |
| --- | --- |
| `POST /core/user/outapply/detail` | 申请详情，参数 `{ id }` |
| `POST /core/user/Outrecordlog/getList` | 出入记录日志 |

### 4.7 App 实现

| 功能 | 文件 |
| --- | --- |
| 接口封装 | `src/utils/leave.js` |
| 记录列表 | `src/pages/tool/leave/leave.vue` |
| 离校申请 | `src/pages/tool/leave/apply.vue` |
| 申请详情 | `src/pages/tool/leave/detail.vue` |
| 凭证解析/存储 | `src/utils/link.js` |

---

## 5. 考勤

### 5.1 两套页面

| 入口 | 用途 | 学生可用 |
| --- | --- | --- |
| `https://kq.henetc.edu.cn/` → `duty.html` | 教职工坐班考勤/管理端 | 否，登录后提示「暂未绑定登陆权限」 |
| `https://kq.henetc.edu.cn/catch/static/app/#/sign?...&token=<token>` | 学生签到 SPA | 是 |

### 5.2 考勤登录

```text
POST https://kq.henetc.edu.cn/ucenter/core/user/hnjmCatchWxLogin
Content-Type: application/x-www-form-urlencoded
```

同一个接口支持两个分支：

| 分支 | 参数 | 可用性 |
| --- | --- | --- |
| 微信授权 | `pid=yyzx&aid=catch&code=<微信 code>` | 仅微信内可用，code 由 `wx.login` 生成 |
| 账号密码 | `username=<学号>&password=<密码>&openid=<openid>&app=` | 第三方 App 可直接调用（已实测） |

账号密码分支还需要：

| 参数 | 说明 |
| --- | --- |
| `pid` | `yyzx` |
| `aid` | `catch` |
| `openid` | 微信身份标识；缺失会返回 status 4 |
| `app` | 空字符串即可 |

错误响应：

```json
{"status": 4, "errmsg": "请输入OpenID"}
{"status": 5, "errmsg": "用户名或密码错误，请重新输入！"}
```

成功响应：

```json
{
  "status": 0,
  "data": {
    "token": "<token>",
    "userinfo": {
      "uid": "",
      "username": "",
      "level": "",
      "nickname": "",
      "userimg": "",
      "status": true,
      "realname": ""
    },
    "token_expire_time": 1792723162
  }
}
```

- `token_expire_time` 为秒级时间戳，有效期约 24 小时
- 旧版非微信密码接口 `/ucenter/core/user/hnjmloginCatchAjax` 已停用
- 统一认证 token 不能用于该接口，也不能调用考勤业务接口

### 5.3 学生考勤接口

除登录外，业务接口均使用考勤 token，公共参数：

```text
token=<token>&pid=yyzx&aid=catch
```

| 接口 | 方法 | 参数 | 用途 |
| --- | --- | --- | --- |
| `/catch/core/person/detailajax` | POST | token | 当前用户信息，含 `idnum`、班级、头像 key |
| `/catch/core/Signin/getFreeSignAjax` | POST | token, `begintime`, `endtime`, `page`, `pageSize` | 签到记录 |
| `/catch/core/syllabus/oneDayListAjax` | POST | token | 今日课程/日程 |
| `/catch/core/syllabus/getSyllabusInfoAjax` | POST | token | 当前教学周等信息 |
| `/catch/core/Auth/getFaceConf` | GET | `conf_key=catch_use_face` | 是否启用刷脸 |
| `/catch/core/syllabus/freeSignAjax` | POST | token, `idnum`, `position`, `iBeaconstr` | 学生打卡 |

### 5.4 打卡

```text
POST /catch/core/syllabus/freeSignAjax
```

| 参数 | 说明 |
| --- | --- |
| `token` | 考勤 token |
| `idnum` | 学号，来自 `person/detailajax` |
| `position` | `经度,纬度`，GCJ-02 |
| `iBeaconstr` | 空字符串 |
| `pid` / `aid` | `yyzx` / `catch` |

- 返回 `{"status":0}` 表示成功；失败时读取 `errmsg`
- 页面上的打卡按钮原本走原生桥接 `clockInForStudentID`，但服务端 HTTP 接口已通过抓包确认
- **调试时不要真实打卡**，避免产生考勤记录

### 5.5 凭证生命周期

- `token_expire_time` 优先作为过期时间；缺失时按保存时间 +24 小时判断
- App 勾选「记住密码」后，用本地保存的账号密码在 token 失效时静默重新登录
- 账号密码只做固定密钥的 XOR 混淆，**不是加密**
- 共用设备不建议勾选「记住密码」；手机被 root 或备份可能读取本地数据
- openid 优先复用课表绑定的 wxid，否则生成一个稳定的本地值

### 5.6 教职工管理端

- 前端：`/catch/static/manage/`（jQuery + DataTables）
- 登录走 CAS：`http://kq.henetc.edu.cn/ucenter/core/admin/hnjmlogin`
- token 存 Cookie
- 学生账号无管理权限，App 不接入

### 5.7 App 实现

| 功能 | 文件 |
| --- | --- |
| 登录/凭证/打卡接口 | `src/utils/kq.js` |
| 原生打卡页 | `src/pages/tool/kq/kq.vue` |
| 每日静默续期 | `src/App.vue` → `refreshKqDaily()` |

---

## 6. 课程表

### 6.1 查询页

```text
GET http://weixin.henetc.edu.cn/student/bjkbcx.aspx?type=student
```

- ASP.NET WebForms，UTF-8
- 公开页面，无需登录
- 可带 `wxid` 参数自动定位班级
- 旧地址 `smartlock.henetc.edu.cn/student/bjkbcx.aspx` 已 404

### 6.2 WebForms 查询流程

1. `GET` 页面，提取：
   - `__VIEWSTATE`
   - `__VIEWSTATEGENERATOR`
   - `__EVENTVALIDATION`
   - `ddl_yx`（院系列表）
2. `POST` 同一 URL，带：
   - `__EVENTTARGET=ddl_yx`
   - `ddl_yx=<院系值>`
   - 最新隐藏字段
   → 返回该院系的 `ddl_bj`（班级列表）和新的隐藏字段
3. `POST` 同一 URL，带：
   - `ddl_yx=<院系值>`
   - `ddl_bj=<班级值>`
   - `bt_cx=查 询`
   - 最新隐藏字段
   → 返回课表 HTML

> 每次回发都会更新 `__VIEWSTATE` 和 `__EVENTVALIDATION`，必须使用上一次响应中的值。

### 6.3 课表结构

- 页面包含 5 张表，对应星期一到星期五
- 表前有 `[班级] [星期X]` 标记
- 行结构：
  ```text
  节次 | 课程名【周次；地点】 | 教师
  ```
- 周次示例：`3-5,9-19周`
- 解析器会展开周次区间，并按星期/节次排序

### 6.4 班级去重

学校返回的班级选项中可能存在重复项（例如值相同或文本相同）。App 在构建下拉列表时按 `value + text` 去重，避免出现重复班级名称。

### 6.5 当前教学周

- 若本机有考勤 token，调用 `/catch/core/syllabus/getSyllabusInfoAjax` 获取当前 `week`
- 用该周筛选课程；如果该周没有课程，回落到「全部」
- 没有考勤凭证时默认显示「全部」

### 6.6 缓存与刷新

| 键 | 内容 |
| --- | --- |
| `jm_course_selection` | 已选院系/班级 |
| `jm_course_auth` | 公众号课表链接模式（含 wxid） |
| `jm_course_cache` | 最近一次解析结果 |
| `jm_course_manual` | 手动添加的课程 |
| `jm_course_last_refresh` | 最近自动刷新日期 |

- 每天首次进入课程表时静默刷新一次
- 刷新失败保留缓存
- 「管理」菜单：手动加课、切换班级、取消绑定
- 手动课程仅存本机，合并到对应星期，带「手动」标记

### 6.7 链接兜底

- 支持从剪贴板读取公众号课表链接（带 `wxid`），直接 `GET` 并解析
- 链接模式与班级模式互斥
- 链接保存在 `jm_course_auth`

### 6.8 App 实现

| 功能 | 文件 |
| --- | --- |
| 班级查询/缓存/当前周 | `src/utils/course.js` |
| HTML 解析 | `src/utils/course-parse.js` |
| 周课表 | `src/pages/course/course.vue` |
| 选择班级 | `src/pages/tool/course-bind/course-bind.vue` |
| 手动加课 | `src/pages/tool/course-add/course-add.vue` |

---

## 7. 水电与空调缴费

> 本节来自对本人账号正常缴费页面的抓包与页面结构分析。文档不包含真实姓名、学号、房间号、openid、token、订单号或微信支付 payload。
>
> **状态：水电/空调缴费功能已从 App 暂时移除（2026-10-22）。本节保留接口研究记录，供后续恢复时参考；当前 App 不包含这些入口。**

### 7.1 宿舍电费（17wanxiao H5）

- 入口：`xqh5.17wanxiao.com/userwaterelec/...`
- 链接包含 `openid`、`userid`、`token`、`code` 等个人参数
- 原 App 只把完整链接保存在本机并在 WebView 中打开，不解析第三方下单接口
- 支付由第三方页面处理，App 不采集支付信息

抓包可见的第三方链路（仅记录，未接入）：

| 接口 | 用途 |
| --- | --- |
| `GET /CloudPayment/bill/selectPayProject.do` | 账单页，显示缴费房间、剩余电量、金额输入 |
| `GET /CloudPayment/user/pay.do` | 发起支付，跳转微信授权/收银台 |
| `POST /smartWaterAndElectricityService/SWAEServlet` | `login`、`getbindroom`、`getstuindexpage`、`getrechargelist`、`writeLogs` 等方法 |

- 第三方接口依赖会话 Cookie、`customercode` 和内部签名，且属于第三方系统，App 不直接调用
- 不要把真实链接、Cookie、`payaccnum`、`txcode` 等写入仓库

隐私要求：

- 只在本机保存完整链接；首次使用时从微信复制，在「缴费链接设置」中粘贴
- 链接失效后重新复制覆盖
- 不要把链接或缴费截图发到 Issue、聊天或提交记录

### 7.2 空调缴费（学校 WebForms）

缴费入口：

```text
http://weixin.henetc.edu.cn/student/StudentRoom.aspx
  ?wxid=<openid>
  &wxid_main=<主 openid>
  &payment_type=ktjf
```

- 页面标题「【空调】电费充值」
- 已绑定微信身份后不需要再次登录，直接输入房间号
- `wxid`、`wxid_main` 是个人身份标识，真实值只保存在本机

#### 7.2.1 房间查询

表单字段：

| 字段 | 说明 |
| --- | --- |
| `tb_room` | 房间号，最多 4 位 |
| `ddl_payment_type` | 缴费类型：电费 `2`、水费 `1`、空调缴费 `ktjf` |
| `cb_cxroom` | 提交按钮「下一步」 |
| `__VIEWSTATE` / `__VIEWSTATEGENERATOR` / `__EVENTVALIDATION` | WebForms 隐藏字段，必须使用当前页面的值 |
| `hd_wxid` / `hd_page` / `hd_type` | 页面上下文 |

提交成功后返回 302，跳转到金额页：

```text
http://weixin.henetc.edu.cn/pay/PayElectricity.aspx
  ?type=student
  &wxid=<openid>
  &room=<room>
  &roomid=<room_id>
  &wxid_main=<主 openid>
  &mid=<mid>
```

抓包中该流程未依赖 Cookie，但仍建议每次从 `StudentRoom.aspx` 重新获取隐藏字段，不要复用旧 `__VIEWSTATE`。

#### 7.2.2 金额页

`PayElectricity.aspx` 页面包含：

- 班级、姓名、学号、宿舍号（敏感，不写入日志或文档）
- `剩余量：`：抓包中为空，余额/剩余电量并未可靠地出现在该页
- 缴费金额下拉框 `ddl_total_fee`

金额选项：

| value | 显示 |
| --- | --- |
| `500` | 5 元 |
| `3000` | 30 元 |
| `5000` | 50 元 |
| `10000` | 100 元 |
| `15000` | 150 元 |
| `30000` | 300 元 |

相关控件：

| 字段 | 说明 |
| --- | --- |
| `ddl_total_fee` | 金额下拉框，切换时触发 WebForms 回发 |
| `bt_pay` | 「立即支付」提交按钮 |
| `hd_wxid` | 页面上下文 |
| `student/pay_cx.aspx?dorm_num=<room>` | 宿舍缴费记录查询页 |

#### 7.2.3 支付流程与限制

`bt_pay` 的 `onclick` 不是提交表单，而是调用页面内的 `callpay()`：

```js
WeixinJSBridge.invoke(
  'getBrandWCPayRequest',
  {
    appId, nonceStr,
    package: 'prepay_id=<prepay_id>',
    paySign, signType, timeStamp
  },
  callback
)
```

- 预支付参数由学校页面在服务端生成，随页面下发
- 支付成功后跳转 `PayElectricityResult.aspx?r=1&orderno=<order_no>`
- `WeixinJSBridge` 只存在于微信内置浏览器；普通 App 的 WebView 没有这个桥接
- 因此：
  - 页面可以正常显示房间、金额选项
  - 「立即支付」在第三方 App 内通常无反应或失败
  - **完整原生支付不可行**，也不应伪造或重放预支付参数
- 如需实际支付，应在微信中打开学校缴费页完成
- 另一次「带支付」抓包（7 条请求）也只到 `payCode.aspx` → `open.weixin.qq.com/connect/oauth2/authorize`，没有出现 `wx.tenpay`、`mmpayweb` 或可外部打开的支付 URL；实际扣款在微信客户端内完成，浏览器 HAR 捕获不到

#### 7.2.4 余额与记录

- 学校金额页的「剩余量」在抓包中为空，不能作为稳定余额来源
- 17wanxiao 账单页会显示「剩余电量」，但那是第三方页面，且依赖其会话
- App 目前不实现原生余额查询，避免依赖不稳定的第三方接口
- 缴费记录可打开 `student/pay_cx.aspx?dorm_num=<room>` 查看

#### 7.2.5 原生边界

- 原实现：原生房间号 + 充值金额选择（5/30/50/100/150/300 元）
- 原实现：点「下一步」弹出确认框，确认后调用 `weixin://` 拉起微信，并提示本次房间号和金额
- 微信内需要从学校公众号的缴费入口重新输入相同信息；第三方 App 无法把金额带入微信，也无法直接调起 JSAPI 支付
- 原实现：「查看学校缴费页」在 App 内打开学校页面，可查看余额和金额选项
- 微信不允许外部 App 直接打开其内置浏览器到任意网页；`weixin://` 只能拉起微信本身，不能定位到具体缴费页
- 即使页面已在微信中打开，外部 App 也无法向微信页面注入脚本或模拟点击；自动填表/自动点付款不可实现
- 无障碍服务或 root 自动化虽可能模拟点击，但存在资金风险、违反平台规则且不稳定，本项目不采用
- 真正的「一键微信支付」需要微信开放平台 App/小程序、商户号和小程序 `web-view` 业务域名，超出个人 App 范围
- App 内 UI 会说明金额不会带入微信，避免用户误以为支付已按选定金额自动发起

### 7.3 学生身份绑定页

```text
http://weixin.henetc.edu.cn/userreg_student.aspx
  ?wxid=<主 openid>
  &page=
  &type=student
  &oprate=bind
```

- 未绑定：显示「学生身份绑定」，提交学号 `xh`、密码 `pwd`、`subok=提交绑定`
- 已绑定：同一地址会变成「解除学生身份绑定」
- **不要在已绑定状态下提交学号密码**，否则会触发解绑
- 空调缴费本身不需要再次登录；绑定页只是首次绑定/解绑入口

### 7.4 历史 App 实现（已移除）

- 原生缴费页：`src/pages/tool/ac/ac.vue`
  - 房间号只保留数字，最多 4 位
  - 充值金额选项：5/30/50/100/150/300 元
  - 保存到本机 `jm_ac_room`、`jm_ac_amount`
  - 「下一步」：确认房间号和金额后拉起微信；金额不会自动带入微信
  - 「查看学校缴费页」：带 `fillRoom` 参数打开 WebView
- WebView 页：`src/pages/webview/webview.vue`
  - 当内嵌页 URL 匹配 `StudentRoom.aspx` 时，注入脚本：
    - 找到 `#tb_room`
    - 填入房间号
    - 点击 `#cb_cxroom`
  - 余额和学校页面仍由 WebView 展示
  - 支付按钮使用微信 JSAPI，App 内无法调起

### 7.5 旧版本链接存储

| 键 | 内容 |
| --- | --- |
| `jm_utility_elec` | 宿舍电费完整链接 |
| `jm_utility_ac` | 空调缴费完整链接 |
| `jm_ac_room` | 上次使用的房间号 |
| `jm_ac_amount` | 上次选择的充值金额 |

### 7.6 安全边界

- 不实现支付参数伪造、重放或绕过微信支付
- 不实现自动缴费、批量缴费
- 不采集银行卡、支付密码或微信支付凭证
- 抓包文件（HAR）含个人信息和支付参数，必须保存在本机临时目录，不能提交到仓库

---

## 8. 本地存储

所有数据均通过 `uni.storage` 保存在本机。

| 键 | 内容 | 敏感性 | 说明 |
| --- | --- | --- | --- |
| `jm_login_token` | 统一认证 token | 高 | 出校登记、个人信息 |
| `jm_register_link` | 微信登记链接 | 高 | 含 token |
| `jm_register_mode` | 凭证使用方式 | 低 | `login` / `link` |
| `jm_person` | 个人信息缓存 | 高 | 姓名、学号、学院、头像 |
| `jm_kq_auth` | 考勤 token | 高 | 约 24 小时 |
| `jm_kq_cred` | 考勤账号密码 | 高 | XOR 混淆，非加密 |
| `jm_kq_openid` | 考勤 openid | 中 | 登录接口需要 |
| `jm_course_selection` | 院系/班级 | 低 | 课表查询 |
| `jm_course_auth` | 课表链接/wxid | 中 | 链接兜底 |
| `jm_course_cache` | 课表解析缓存 | 低 | 最近结果 |
| `jm_course_manual` | 手动课程 | 低 | 仅本机 |
| `jm_course_last_refresh` | 最近刷新日期 | 低 | 每日刷新去重 |
| `jm_utility_elec` | 宿舍电费链接 | 高 | 旧版本，当前启动时清理 |
| `jm_utility_ac` | 空调缴费链接 | 高 | 旧版本，当前启动时清理 |
| `jm_ac_room` | 空调房间号 | 中 | 旧版本，当前启动时清理 |
| `jm_ac_amount` | 空调充值金额 | 低 | 旧版本，当前启动时清理 |
| `jm_theme` | 主题 ID | 低 | 外观偏好 |

清除 App 数据或卸载 App 会删除以上内容；重新安装后需要重新配置。

---

## 9. 错误与兼容性

### 9.1 常见错误

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 出校登记返回 `-1` | 统一认证 token 过期/无效 | 重新登录或更新链接 |
| 考勤返回 `-1` | 考勤 token 过期 | 重新登录；勾选记住密码可自动续期 |
| 考勤返回 `4` | 缺少 openid | 检查 `jm_kq_openid` 或重新登录 |
| 考勤返回 `5` | 账号密码错误 | 核对学号密码 |
| 课表查询失败 | `__VIEWSTATE` 过期/页面结构变化 | 重新获取页面并回发 |
| 空调页提示房间号不存在 | 房间号错误或未绑定 | 返回原生页修改房间号 |
| 空调缴费点「立即支付」无反应 | 非微信环境，`WeixinJSBridge` 不存在 | 返回原生页点「下一步」拉起微信，从学校公众号入口完成支付 |
| H5 请求失败 | 浏览器 CORS | 使用 Android App 测试 |

### 9.2 WebForms 注意事项

- 隐藏字段会随每次回发变化，不能复用旧值
- 班级列表依赖院系回发，不能跳过步骤
- 页面编码为 UTF-8，解析时注意中文和空格（如 `查 询`）

### 9.3 接口稳定性

- 学校系统可能升级、改版或关闭旧接口
- 本文档记录的是 2026-10 的可用状态，不保证未来一致
- 发现失效时，优先检查页面是否改版、登录方式是否变化

### 9.4 测试原则

- 使用假数据测试解析和错误分支
- 不要批量提交离校申请
- 不要真实打卡
- 不要发起真实缴费
- 不要触发实体门禁
- 不要把真实凭证写入测试快照或日志

---

## 10. 隐私与安全

- 仓库不包含任何真实姓名、学号、手机号、身份证号、头像 key、openid 或 token
- 统一认证密码不保存；考勤密码仅在用户主动勾选时保存，且只是简单混淆
- 缴费链接由用户从微信复制，仅保存在本机；上传或转发会泄露个人身份
- 缴费抓包（HAR）包含姓名、学号、房间号、openid、token、订单号和微信支付参数，只能临时分析，不能提交到仓库或公开分享
- `docs/api-notes.md` 属于校内接口笔记，公开仓库前请评估是否设为私有或移除
- App 不提供自动打卡、自动申请、批量请求或绕过权限的能力
- 支付信息由学校/第三方支付页面处理，App 不采集银行卡或支付密码

---

## 11. 参考实现

| 模块 | 文件 |
| --- | --- |
| 学校域名与登录链接 | `src/config/school.js` |
| 出校登记链接/token | `src/utils/link.js` |
| 出校登记接口 | `src/utils/leave.js` |
| 个人信息与头像 | `src/utils/person.js` |
| 考勤登录/凭证/打卡 | `src/utils/kq.js` |
| 课表查询/缓存/当前周 | `src/utils/course.js` |
| 课表 HTML 解析 | `src/utils/course-parse.js` |
| 缴费链接（历史） | 已移除，原 `src/utils/utility.js` |
| 主题配色 | `src/utils/theme.js` |
| 通用 WebView | `src/pages/webview/webview.vue` |

---

*最后更新：2026-10-22*
