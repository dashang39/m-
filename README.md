# mikufun

> 界面显示名：**M记** · 一款 Windows 桌面动漫客户端

mikufun 是一个基于 Electron 的本地追番客户端。它把「源」抽象成可插拔的 JS 脚本或标准 API 适配器，内置多个内容源，打开即看，无需注册账号。

> ⚠️ 本项目仅作为播放器前端工具。所有影片内容来自第三方源站，本项目不存储、不提供任何影片资源。请支持正版。

---

## 特性

**播放**
- 半屏播放页：上方播放器 + 下方封面、简介与选集
- 双全屏控制：页面全屏（铺满窗口）与屏幕全屏（系统级）互不干扰
- 鼠标滚轮：左半屏调亮度、右半屏调音量，带居中提示
- 快捷键：空格播放/暂停、←/→ 快退快进、N 下一集、F 全屏、Esc 分级退出
- 断点续播、自动连播、倍速（0.75x–2x）

**内容源**
- 内置多个源：稀饭动漫、金牌、黑猫动漫、米番、可可影视、次元城
- 支持粘贴网址自动识别（苹果CMS / 通用 HTML 站）
- 支持导入 `.js` 源脚本（本地文件或链接）
- 源健康检查：失效源自动跳过，不拖慢首页

**检索**
- 全局搜索：同时搜所有健康源，结果标注来源
- 标签检索：发现页可在全部源之间切换，无分类的源自动回退到内容浏览
- 新番周表：按周一至周日查看更新时段

**体验**
- 日间 / 夜间模式、自定义背景
- 收藏与观看历史（记录到第几集、播放进度条）
- 顶栏一键刷新
- 问题反馈入口：填写描述后一键发送邮件，诊断日志可选
- 日志导出自定义位置

---

## 安装

### 方式一：安装包（推荐）

下载 `mikufun-Setup-x.x.x.exe`，双击安装。装完自动创建桌面与开始菜单快捷方式。

> 安装包没有代码签名，Windows 可能提示"未知发布者"，点「更多信息 → 仍要运行」即可。

### 方式二：便携版

解压 `dist/mikufun` 文件夹，双击 `mikufun.exe`。

### 方式三：从源码运行

```bash
npm install
npm start          # 等价于 electron .
```

需要 Node.js 18+。

---

## 使用

| 操作 | 说明 |
|---|---|
| 看番 | 首页点击海报进入详情，点剧集直接播放 |
| 搜索 | 顶栏输入番名回车，跨所有已启用源搜索 |
| 换源 | 播放报错时点「换源」，自动在其他源找同名番 |
| 添加源 | 首页源栏末尾「＋ 管理源」→ 粘贴网址 → 识别并添加 |
| 刷新 | 顶栏圆形箭头，按当前页面刷新 |
| 反馈 | 设置 → 问题反馈，描述问题后可一键发邮件 |

详细图文说明见 [`USAGE.md`](USAGE.md)。

---

## 数据位置

| 内容 | 路径 |
|---|---|
| 配置与收藏历史 | `%APPDATA%\mikufun\store.json` |
| 日志 | `%APPDATA%\mikufun\logs\app.log` |
| 自定义源 | `%APPDATA%\mikufun\sources\` |

从旧版本升级会自动迁移数据，收藏与历史不会丢失。

---

## 开发

### 目录结构

```
pc/
├── main.js             主进程：窗口、IPC、源调度、日志、数据迁移
├── preload.js          渲染进程桥接
├── worker.js           源脚本执行线程（独立 vm）
├── host.js             源宿主：注入 request/post/md5/crypto 等
├── maccms.js           苹果CMS 通用适配器
├── xifan.js            稀饭动漫适配器
├── generic.js          通用 HTML 站适配器
├── cycani.js           次元城适配器
├── sources/            内置 JS 源脚本
├── renderer/           界面（原生 JS，无框架）
├── build.ps1           离线打包脚本
└── electron-builder.yml 安装包配置
```

### 构建

```powershell
# 便携版（输出 dist/mikufun）
.\build.ps1

# 安装包
npx electron-builder --win nsis --x64 --prepackaged "dist/mikufun" --config electron-builder.yml
```

### 源脚本接口

源脚本需实现以下函数（同步返回字符串）：

```js
function homeSections()        // [{ title, items: [{ id, name, pic }] }]
function search(keyword, page) // [{ id, name, pic }]
function detail(id)            // { id, name, pic, desc, episodes: [{ name, route, url }] }
function play(flag)            // { url, type: 'm3u8'|'mp4', headers? }
```

`play` 的 `flag` 来自 `detail` 里每个 episode 的 `url` 字段（通常是 JSON 字符串）。

---

## 免责声明

- 本项目仅作为播放器前端工具，**不提供、不存储任何影片资源**
- 所有内容通过第三方源站获取，版权归原站所有
- 请勿将本项目用于商业用途
- 因使用本项目产生的任何问题，与项目作者无关
- 如有侵权，请联系删除

---

## 许可证

[MIT](LICENSE)
