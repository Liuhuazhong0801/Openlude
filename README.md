<p align="center">
  <img src="public/assets/branding/app-icon.png" width="96" height="96" alt="Openlude 小银狐图标">
</p>

# Openlude

为每一次打开，加一段喜欢的开场。

Openlude 是一款适用于 macOS 和 Windows 的应用启动动画工具。添加自己的应用，选一个主题，保存绑定；从工作台启动，或让 Openlude 留在后台，通过原来的 Dock、桌面和开始菜单打开应用，即可播放开场动画。

[介绍网站与主题试玩](https://liuhuazhong0801.github.io/Openlude/) · [下载 0.6.2 预览版](https://github.com/Liuhuazhong0801/Openlude/releases/tag/v0.6.2) · [开始使用](#开始使用) · [动画主题](#动画主题) · [参与开发](CONTRIBUTING.md) · [反馈问题](https://github.com/Liuhuazhong0801/Openlude/issues)

## 下载与安装

当前版本为 **Openlude 0.6.2 预览版**，提供三个平台的安装包：

| 平台 | 下载 | 安装方式 |
| --- | --- | --- |
| macOS · Apple Silicon（M 系列） | [DMG 安装包](https://github.com/Liuhuazhong0801/Openlude/releases/download/v0.6.2/Openlude-0.6.2-macos-arm64.dmg) · [ZIP](https://github.com/Liuhuazhong0801/Openlude/releases/download/v0.6.2/Openlude-0.6.2-macos-arm64.zip) | 打开 DMG，将 Openlude 拖入「应用程序」；也可解压 ZIP |
| macOS · Intel | [DMG 安装包](https://github.com/Liuhuazhong0801/Openlude/releases/download/v0.6.2/Openlude-0.6.2-macos-x64.dmg) · [ZIP](https://github.com/Liuhuazhong0801/Openlude/releases/download/v0.6.2/Openlude-0.6.2-macos-x64.zip) | 打开 DMG，将 Openlude 拖入「应用程序」；也可解压 ZIP |
| Windows · 64 位 | [EXE 安装包](https://github.com/Liuhuazhong0801/Openlude/releases/download/v0.6.2/Openlude-0.6.2-windows-x64-setup.exe) | 运行安装向导，可选择安装目录 |

安装版无需安装 Node.js、开发工具或模型 API。Mac 预览包采用 ad-hoc 签名且未公证，Windows 预览包未做发布者签名，首次运行可能遇到系统安全提示。

所有安装包均附有 [SHA-256 校验值](https://github.com/Liuhuazhong0801/Openlude/releases/download/v0.6.2/SHA256SUMS.txt)；发布页中的 `build-info-*.json` 记录版本、架构与源码提交。[完整发布说明](https://github.com/Liuhuazhong0801/Openlude/releases/tag/v0.6.2)中列出了验证范围。

## 工作台

![Openlude 工作台：居中选择主题、预览车窗动画并按应用保存设置](docs/workspace.png)

- **按应用设置**：自行添加应用，分别保存主题、可调时长、图标开场、柔和模式和主题原声。
- **透明图标开场**：可选展示目标应用自己的图标，在透明背景上淡入、停留、淡出，再进入主题动画。
- **连续过渡**：动画末段逐渐变透明，显露后方的目标应用；按 Esc 可跳过。
- **系统入口启动**：Openlude 在后台运行时，检测已绑定应用的新启动，沿用原来的应用入口。
- **日常使用设置**：系统深浅主题、登录启动、后台运行、菜单栏或系统托盘入口，以及完整设置页面。

主题选择栏保持选中项居中，支持左右按钮、方向键和横向滑动。首次打开是空列表，不预置或扫描应用。

## 开始使用

1. 打开 Openlude，点击左侧「添加应用」，选择 macOS 的 `.app` 或 Windows 的 `.exe` / `.lnk`。
2. 在左侧选择应用，挑选主题，按需开启「显示应用图标」「柔和模式」或「主题原声」，然后点击「保存绑定」。部分主题可调整时长，剧情和原版视频主题使用各自的播放节奏。
3. 点击上方「启动应用」，或让 Openlude 保持后台运行，再从 Dock、桌面或开始菜单新启动该应用。
4. 「播放」和「全屏」只预览当前草稿，不启动目标应用，也不保存修改。全屏播放时按 Esc 可跳过。

切换应用或关闭工作台到后台时，未保存的草稿会保留；退出 Openlude 会放弃草稿。移除应用时，将鼠标移到左侧应用行，或用键盘聚焦该行，再点击删除图标；原软件不会被卸载。

**从原来的应用入口打开时，Openlude 必须仍在运行**，且「设置 → 通用 → 从系统入口启动时播放动画」处于开启状态（默认开启）。已经运行的应用切回前台时不会重复播放；从工作台启动也不会再触发第二次动画。

系统入口检测发生在应用启动之后，不会暂停第三方应用。启动很快的应用可能先显示自己的窗口，再出现动画；工作台的「启动应用」会先展示动画。应用内部页面是否已经加载完成，仍由该应用决定。

## 动画主题

当前主题库共 **8 个主题**。六个场景由实时渲染与独立图层驱动；两项整活主题播放原版视频，保留角色、动作、原始比例与节奏，原声默认关闭。

| 主题 | 效果 |
| --- | --- |
| 漫画疾速 | 漫画分镜依次入场，跃起特写、城市远景与速度线 |
| 晴空来信 | 日漫海岸、镜头推进、飞鸟、樱花与海面反光 |
| 星海列车 | 车厢内的圆角车窗、金属窗框、木质窗沿、玻璃雨滴与窗外视差 |
| 纸鹤山海 | 金箔纸雕山海、折纸鹤振翅、景深与前景花瓣 |
| 像素星航 | 像素飞船、动态尾焰、环状行星与分层星空 |
| 水墨晕染 | 纸面纹理与逐渐扩散的墨迹 |
| 奶蛙大笑 | 原版奶蛙捧腹大笑视频，约 4.2 秒，可选原声 |
| 肥嘟嘟 | 原版单只黄色袋鼠独舞视频，约 4 秒，可选原声 |

[观看星海列车的实际录屏](docs/train-window-preview.mp4)。柔和模式会减少场景运动、缩短过渡，并暂停原版视频与音频。

## 设置与更新

从工作台**左下角「设置」**进入完整设置页面，包含「通用、外观、更新、关于」四个分类。macOS 也可使用 `⌘,` 打开。

| 设置 | 行为 |
| --- | --- |
| 开机自启动 | 登录电脑后启动 Openlude，默认关闭；在安装版中生效 |
| 登录后在后台运行 | 登录启动时保留菜单栏或托盘入口，不打开工作台，默认开启 |
| 从系统入口启动时播放动画 | Openlude 运行时检测已绑定应用的新启动，默认开启 |
| 关闭工作台时 | 默认继续在后台运行，也可改为直接退出 |
| 外观 | 默认跟随系统，也可固定为深色或浅色 |
| 自动检查更新 | 默认开启，可手动检查、下载并选择重启安装；不会自动下载或中断工作 |

**0.6.2 预览版通过本页手动下载安装，不进入正式自动更新通道。** 当前只发布了预览版，所以「检查更新」显示「尚未发布正式版本」属于正常状态。正式自动更新还需要签名、公证、更新元数据和真实跨版本升级验收。

## 配置与升级

应用列表、绑定和偏好保存在本机；主题播放无需账号或模型 API，更新检查会访问 GitHub。应用移动导致原路径失效时，从列表移除并重新添加即可。

从 TimeGate 升级时，若 Openlude 尚无配置，会复制原配置并保留旧文件。0.6.2 已移除「猫猫开门」与「深海鲸游」：旧绑定会先完整备份，再迁移为「星海列车」，保留应用与各自偏好。移除所有应用后，重启仍保持空列表。

## 开发与构建

源码使用 Electron、TypeScript、Three.js / GLSL 和 Vite。需要 Node.js 24（至少 24.14，低于 25），版本系列见 [`.nvmrc`](.nvmrc)；从源码构建 macOS 版本还需要 Xcode Command Line Tools。

复现当前发布版：

```sh
git clone --branch v0.6.2 https://github.com/Liuhuazhong0801/Openlude.git
cd Openlude
npm ci
npm run dev
```

上述命令检出发布标签。准备修改源码时，再创建自己的工作分支；提交与 PR 流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

<details>
<summary>常用命令、打包方式与项目结构</summary>

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 类型检查并构建主进程、预加载、渲染界面与本机组件 |
| `npm test` | 单元测试与正式发布前置条件检查；先运行构建 |
| `npm run build:preview` | 生成单文件离线预览 `dist-preview/Openlude-preview.html` |
| `npm run dev:site` | 本地预览 GitHub Pages 介绍网站 |
| `npm run build:site` | 检查并构建介绍网站至 `dist-site/`；`main` 的网站改动通过 GitHub Actions 自动部署 |
| `npm run test:site` | 在 Chrome 中验证八个主题、移动端布局、播放控制与减少动态效果偏好；先构建网站 |
| `npm run test:preview` | 检查离线主题动效；需要 Chrome 与 Playwright FFmpeg |
| `npm run test:desktop` | 检查桌面播放、绑定持久化与 macOS 前台交接 |
| `npm run test:external` | 在 macOS 验证系统入口启动检测与交接 |
| `npm run test:windows-observer` | 在 Windows 验证真实进程、中文及空格路径、快捷方式和输入协议 |
| `npm run test:regressions` | 检查写盘失败、视频取消、资源复用与高 DPI 渲染预算 |
| `npm run pack:mac` | 构建 macOS 本地 ad-hoc 签名 `.app` 测试包 |
| `npm run pack:win` | 构建 Windows x64 NSIS 安装包 |
| `npm run pack:preview -- --arch arm64` | 构建预览安装包；也可使用 `x64`，Windows 仅支持 `x64` |
| `npm run pack:release` | 构建正式 Mac 包，要求 Developer ID 签名与 Apple 公证凭据 |

`pack:preview` 需先执行 `npm run build`，并在对应操作系统运行。Mac 输出 DMG 与 ZIP，Windows 输出 EXE，下载文件位于 `release/preview/<平台>-<架构>/downloads/`，附架构、源码提交和 SHA-256。打包命令不会自动发布 GitHub。

单文件预览包含八个主题、图标与媒体，可离线观看、切换和全屏播放；它只展示动效，原生窗口淡出和目标应用启动需在桌面应用中查看。预览测试前执行 `npx playwright install ffmpeg`。

如果使用 HTTP 代理且 Electron 运行时下载失败，可在配置好代理后运行 `NODE_USE_ENV_PROXY=1 node node_modules/electron/install.js`；Windows PowerShell 先设置 `$env:NODE_USE_ENV_PROXY='1'`。代理凭证不应提交到仓库。

正式自动更新使用 `electron-updater`，Mac 需提供 ZIP、DMG 和 `latest-mac.yml`，Windows 需提供 NSIS 安装包和 `latest.yml`，并保持应用身份与签名一致。`node scripts/pack-release.mjs --check` 可检查 Mac 正式发布的凭据前置条件。

```text
src/main/       应用启动、配置、系统入口检测与动画窗口生命周期
src/preload/    限定范围的进程通信接口
src/renderer/   工作台、设置、实时动效与全屏播放
src/shared/     主题定义与数据类型
native/         macOS 原生观察器与 Windows 检测、唤醒脚本
public/assets/  品牌图标、主题插画、缩略图与原版视频
scripts/        构建、打包、素材处理与验证脚本
verification/   经过整理的验证记录
```

</details>

## 验证状态

0.6.2 的 [发布 CI](https://github.com/Liuhuazhong0801/Openlude/actions/runs/42583271137) 五项任务全部通过：macOS / Windows 构建与 19 项单元测试，以及 Mac arm64、Mac x64、Windows x64 安装包构建。Windows 原生启动检测的 6 项检查通过，覆盖中文、空格路径及快捷方式。

macOS Apple Silicon 已验证桌面播放与应用交接；**Mac Intel 和 Windows 的完整桌面行为仍需对应实机验收**。构建通过不代表各平台的窗口行为均已验证。详细覆盖范围、历史记录和性能检查见 [VERIFICATION.md](VERIFICATION.md)。

## 开源与贡献

Openlude 的原创源代码与项目文档使用 [MIT License](LICENSE)。第三方应用的图标、名称、商标，以及原版整活素材沿用各自权利，不包含在本项目的 MIT 授权内；来源与权利状态见 [第三方声明](THIRD_PARTY_NOTICES.md)。

欢迎通过 [Issues](https://github.com/Liuhuazhong0801/Openlude/issues) 反馈问题，或按照 [贡献流程](CONTRIBUTING.md) 提交 Pull Request。
