# 经贸+ · 校园工具箱

> 河南经贸职业学院校园服务聚合应用 · 非官方个人项目

![tauri](https://img.shields.io/badge/Tauri%202-Rust-B7410E?logo=tauri&logoColor=white)
![react](https://img.shields.io/badge/React%2018-antd--mobile-61DAFB?logo=react&logoColor=white)
![platform](https://img.shields.io/badge/platform-Android-3DDC84?logo=android&logoColor=white)
![status](https://img.shields.io/badge/status-active%20development-blue)

「经贸+」把分散在公众号、旧版 App 和学校网页里的校园服务收进一个 App：课程表、出校登记、打卡考勤。

项目基于 **Tauri 2 + Rust + React 18（antd-mobile）**：Rust 承担全部学校接口访问、HTML 解析、登录窗口管理、定位转换与本机存储，前端只负责界面。当前以 Android 为主，Windows 桌面用于开发调试；uni-app 旧版保留在 git 标签 `uniapp-v0.2.0`。

> 本项目为个人作品，与河南经贸职业学院官方无关。所有接口仅用于使用者本人有权访问的学校系统，不提供批量请求、自动打卡或自动提交申请等能力。

## 目录

- [功能总览](#功能总览)
- [技术栈](#技术栈)
- [架构](#架构)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [打包 Android](#打包-android)
- [使用说明](#使用说明)
- [数据与隐私](#数据与隐私)
- [已知限制](#已知限制)
- [路线图](#路线图)
- [FAQ](#faq)
- [贡献](#贡献)
- [免责声明](#免责声明)
- [许可证](#许可证)
- [接口文档](#接口文档)

---

## 功能总览

| 模块 | 能力 |
| --- | --- |
| 课程表 | 周网格课表、院系/班级导入、周次切换、当前节次高亮、手动加课、公众号链接兜底、每日自动刷新 |
| 出校登记 | 记录列表、状态筛选、下拉刷新、离校申请、申请详情、统一认证 / 微信链接两种凭证 |
| 打卡考勤 | 定位打卡（GCJ-02）、今日签到记录、账号密码直连登录、可选记住密码 |
| 我的 | 统一认证登录（应用内窗口）、5 套主题色、数据管理、关于 |

## 技术栈

- **壳与后端**：Tauri 2 · Rust（reqwest / regex / serde / chrono / tokio）
- **插件**：clipboard-manager（剪贴板识别登记链接）、geolocation（打卡定位）
- **前端**：React 18 · TypeScript · antd-mobile 5 · react-router（hash）· zustand
- **构建**：Vite 5 · Android SDK/NDK · 本地 Gradle 构建（无云打包）

## 架构

```
┌────────────────────────── Android App ──────────────────────────┐
│  React UI（WebView）              Rust 核心（libjingmao_plus.so）│
│  ├─ 页面：课表/工具/我的/…         ├─ config  端点与域名白名单     │
│  ├─ antd-mobile 组件   ◄─invoke─► ├─ course  WebForms 课表+解析  │
│  └─ 浏览器预览 mock 层             ├─ kq      考勤登录/打卡        │
│                                   ├─ leave   出校登记接口        │
│                                   ├─ geo     WGS-84 → GCJ-02     │
│                                   ├─ store   应用私有 JSON 存储   │
│                                   └─ cas     登录子窗口抓 token   │
└─────────────────────────────────────────────────────────────────┘
```

- 所有学校接口都在 Rust 侧发起（绕开 WebView CORS 与明文限制），token/凭证保存在应用私有目录（`jm_store.json`），不进 WebView localStorage。
- 统一认证（CAS）登录：弹出独立登录窗口，Rust 监听每次跳转抓取 token 后自动关窗；仅允许 `*.henetc.edu.cn` / `*.hnjmxy.cn`。
- 打卡定位：`tauri-plugin-geolocation` 取 WGS-84 坐标，Rust 内转换为 GCJ-02 后提交，与学校小程序一致；高精度超时自动降级普通精度。

## 目录结构

```
├── src/                    React 前端
│   ├── api/                invoke 封装 + 类型化 API + 浏览器预览 mock
│   ├── pages/              课表 / 工具 / 我的 / 出校登记 / 打卡考勤 / 关于
│   ├── components/         PageShell / SubPage / 图标
│   ├── store/              zustand（主题色）
│   └── styles/             设计 tokens 与页面样式
├── src-tauri/              Rust 核心
│   ├── src/                config / course / course_parse / kq / leave / person / geo / store / cas / commands
│   ├── capabilities/       Tauri 权限
│   ├── gen/android/        Android 工程（含明文域名白名单与签名配置钩子）
│   └── icons/              应用图标
├── docs/api-notes.md       学校接口研究文档（完整保留）
├── scripts/android-env.sh  Android 构建环境变量
└── public/school-logo.png  校徽资源
```

## 快速开始（开发）

环境要求：Node 20+、Rust（stable-msvc）、Android SDK（Platform 34 + Build-Tools 34+ + NDK 27）、JDK 17。

```bash
npm install

# 浏览器预览（mock 数据，不需要 Rust）
npm run dev

# Windows 桌面调试（真实 Rust 后端）
npm run tauri:dev

# Android 真机调试
source scripts/android-env.sh   # 设置 JAVA_HOME / ANDROID_HOME / NDK 与 NDK clang
npm run tauri:android-dev
```

## 打包 Android（本机构建）

```bash
source scripts/android-env.sh
npm run tauri:android-build      # 产出 release APK
```

- 签名：`src-tauri/gen/android/keystore.properties`（已 gitignore，指向仓库外的 keystore 文件）。首次构建请用 `keytool` 生成自己的密钥，按同样键值填写即可；没有该文件时产物为未签名 APK。
- 产物：`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`

## 使用说明

- **课程表**：首次使用选择院系与班级导入；也可从剪贴板导入公众号课表链接。「管理」里可手动加课、切换班级、取消绑定。
- **出校登记**：在「我的」完成统一认证登录（应用内窗口，抓取 token 后自动返回），或在「工具箱」保存微信里复制的登记链接；之后可查看记录、发起离校申请（申请为真实操作）。
- **打卡考勤**：使用考勤系统（学校签到小程序）的账号密码登录——统一认证密码不通用。打卡需要定位权限；提交的是真实打卡。
- **数据管理**：「我的」里可清除登记链接或本机全部数据；退出登录不影响已保存的课表。

## 数据与隐私

- 账号、密码、token 仅保存在本机应用私有目录（Android 沙箱内），任何数据不上传到开发者或第三方服务器。
- 「记住密码」为可选项；密码明文保存在私有目录、不加密——请避免在共用设备上开启。
- 退出登录 / 清除数据时删除对应本机数据。
- 项目仓库不含任何个人数据、密钥与抓包文件。

## 已知限制

- 课程表来自学校公众号课表页，调课请以教务系统为准；3-4 节上课时间与教学楼有关。
- 定位打卡在室内、地下车库等弱信号位置可能超时，可到窗边或室外重试。
- 打卡考勤登录接口与学校小程序共用，学校调整接口时需要更新版本。
- iOS 未适配（Tauri 本身支持，本项目未做配置）。

## 路线图

- [ ] 出校登记链接失效提示优化
- [ ] 课表桌面小组件
- [ ] 水电缴费（研究记录见接口文档，暂未接入）

## FAQ

**Q: 提示「登录已过期」？**
统一认证 token 有效期约 24 小时，过期后在「我的」重新登录即可；CAS 勾选过「记住我」时重登通常免输密码。

**Q: 打卡定位失败？**
先确认系统定位已开、App 定位权限选择「精确位置」；室内失败请到窗边或室外重试，失败弹窗会显示具体原因。

**Q: 为什么不用学校官方 App / 小程序？**
本项目只是个人效率工具，官方渠道永远更可靠；接口仅做只读聚合与用户主动的操作提交。

## 贡献

个人学习项目，欢迎 Issue 指正，暂不接受功能 PR。提交前请确认：

- 不要提交真实账号、token、openid、姓名、学号或登记链接
- 调试接口时使用假数据，不要批量请求学校系统

## 免责声明

- 本项目为非官方个人作品，与河南经贸职业学院及其附属系统无关
- 使用本项目产生的任何后果由使用者自行承担
- 请遵守学校网络与信息系统使用规定，仅访问本人有权访问的数据
- 不提供自动提交申请、自动打卡、批量请求或绕过权限的功能
- 学校系统调整可能导致功能失效，作者不保证持续维护

## 许可证

本仓库暂未附带开源许可证。未经作者许可，请勿将代码或接口笔记用于商业用途或二次分发。

## 接口文档

- [学校系统接口参考（非官方）](docs/api-notes.md)

接口文档包含出校登记、统一认证、考勤、课程表以及暂缓的水电/空调缴费研究记录，供个人维护和二次开发参考。
