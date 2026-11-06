# TimeGate 0.2.1 验证记录

## 0.2.1 启动交接

2026-11-06：目标应用激活请求移到动画窗口关闭之前；使用原生窗口透明度进行缓入缓出的交叠过渡，画布和目标图标保留到窗口淡出。过渡时间计入所选动效时长，系统激活与合成等待可能额外增加少量时间。

- 构建、4 项单元测试、独立预览构建及 Chrome 6 项检查通过。
- macOS 解锁桌面 24 项检查通过，无 pending 或 renderer errors。在独立 Swift 测试应用上确认：目标先激活，动画随后淡出，最终前台 PID 与目标一致。
- 原生窗口透明度在 521 毫秒内单调降到 0；淡出中仍保留 WebGL 画布，目标标识透明度为 1。检查的是实际原生窗口透明度，不是页面内模拟。
- 模拟系统打开请求尚未返回时，点击跳过在 210 毫秒内移除覆盖窗口；不点击时由交接超时自动移除。柔和模式使用约 160 毫秒淡出。
- 原始记录：`verification/desktop-handoff.json`、`verification/launch-reveal.json`。测试只替换慢启动场景的系统 URL 打开函数；正常启动和前台焦点测试使用实际本机应用。

Windows 的原生窗口淡出与焦点交接仍待实机验收。系统打开请求被接受或应用取得焦点，不代表第三方应用内部内容已加载完成；跨显示器、跨桌面空间和各种真实应用的冷启动仍需分别验证。

原生透明度接口见 [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window#winsetopacityopacity)。

## 0.2.0 原有功能验证

日期：2026-11-06。此交付包括第二版工作台、目标应用图标以及按应用保存设置，尚未完成双平台发布验收。

## 当前环境

- macOS 26.6.2，Apple Silicon / arm64。
- Node.js 24.14.1，Electron 45.2.3，Three.js 0.187.0。
- macOS 的 WebGL 使用 Metal 后端；浏览器预览使用本机 Chrome 的隔离测试上下文。

## 已验证

| 范围 | 实际结果 |
| --- | --- |
| TypeScript 与构建 | `npm run build` 通过 |
| 配置与路径校验 | 4 项单元测试通过；覆盖 Windows 含空格、中文路径，异常时长、旧配置兼容与按应用设置 |
| 动效预览 | 五种主题均能播放；比较中央图标之外的场景，确认画面随时间变化；无脚本错误 |
| 桌面工作台 | 三栏布局正常；在最小 1120×760 窗口中，播放、全屏、保存与添加按钮均可见 |
| 应用身份 | 四个预设都有独立图标；Codex 使用其专用资源；自定义应用读取 bundle 图标；无图标时只显示目标名称 |
| 草稿与预览 | 切换应用保留草稿，修改和预览不会写入配置；全屏预览使用草稿时长与目标图标 |
| 全屏退出 | Esc 能在播放结束前关闭动画窗口 |
| 应用绑定 | 使用测试替身提供文件选择结果，实际走添加、绑定和保存流程；未人工操作系统文件选择器 |
| 本机启动 | 编译独立 Swift 测试应用，通过 TimeGate 请求启动；该应用写出启动标记，证明进程实际进入运行 |
| 前台切换 | 解锁后完成补测；动画窗口关闭后读取系统当前前台进程，PID 与目标应用一致，同时观察到目标应用的激活事件 |
| 重复启动 | 动画进行时，第二次启动被拒绝 |
| 失效路径 | 移动测试应用后，报告路径失效，不遗留动画窗口 |
| 持久化 | 重启后保留动画时长和主题绑定 |
| macOS 打包产物 | 实际启动 `.app`，工作台加载成功；全屏 Codex 目标预览完成并自动关闭；ad-hoc 签名验证通过 |

动效预览录屏来自浏览器运行同一份 `motion.ts` 的实际画面，视频裁切到动画画布区域。它不证明真实应用的启动时间，也不是目标应用窗口的录屏。

2026-11-06 解锁后，在项目目录执行完整桌面测试，未设置 `TIMEGATE_SKIP_FOCUS_ASSERT`。19 项检查全部通过，`pending` 和 `errors` 均为空。目标进程 PID 与系统前台进程 PID 均为 99658。构建与 4 项配置校验测试也通过。

当前完整报告：`verification/desktop-full.json`。浏览器 6 项检查见 `verification/preview-v2.json`，打包后的 0.2.0 启动与预览检查见 `verification/packaged-v2.json`。之前锁屏运行的部分报告仅作历史排查记录，不再代表最新状态。

仓库初始化时完成 `npm ci`。本次重新通过构建、4 项单元测试和单文件预览导出。`npm audit --omit=dev` 报告 0 项漏洞；完整依赖审计报告开发打包工具链中的 6 个中风险依赖节点，关联 [minimatch 公告 GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)，需在后续打包工具链升级时复核。

## 尚待验证

- **Windows 实机**：已实现 `.exe` / `.lnk` 选择、启动及窗口激活辅助脚本，提供 NSIS 打包配置；尚未在 Windows 运行、打包或验收。
- macOS Intel、多个显示器、多个桌面空间、应用冷启动较慢时的实际衔接、不同显卡性能尚待实测。
- 系统原生文件选择器的人工操作尚待确认。自动化只验证选定路径之后的业务流程。

## 发布边界

- 当前提供的 macOS 包仅为本地测试用 ad-hoc 签名，未使用 Developer ID 签名和公证。
- 目前由 TimeGate 内的入口触发，不拦截原 Dock 或任务栏图标。
- 无法统一识别第三方应用内部页面是否加载完毕；动画时长可配置，允许 Esc 跳过。
- 静态图为视觉参考和主题缩略图。当前默认穿梭效果已改为三条银灰轮廓，其他主题保留各自的材质和运动。

## 复现

```sh
npm ci
npm run build
npm test
npx playwright install ffmpeg
npm run build:preview
npm run test:preview
npm run test:desktop
```

桌面完整验证需解锁 Mac，并安装 Xcode Command Line Tools。浏览器测试默认使用已安装的 Chrome，可用 `PREVIEW_BROWSER_CHANNEL` 选择兼容的 Playwright channel。

锁屏环境下的部分检查：

```sh
TIMEGATE_SKIP_FOCUS_ASSERT=1 npm run test:desktop
```

这条命令的成功退出不代表前台切换通过。原始 JSON 报告保存在交付目录的 `verification/` 中。
