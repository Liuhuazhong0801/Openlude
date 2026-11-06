# 第三方素材与依赖声明

TimeGate 的原创源代码和项目文档按 [MIT License](LICENSE) 发布。第三方依赖继续适用其各自的许可证；第三方应用的名称、图标和商标不属于 TimeGate 的 MIT 授权范围，权利归各自权利人所有。

## 应用识别图标

下列资源仅用于识别用户选择的目标应用。图标资源的公开可访问性不表示本项目拥有其版权，也不表示相关应用与 TimeGate 存在隶属、合作或背书关系。本项目不对这些第三方资源授予额外许可。

| 应用 | 资源来源 |
| --- | --- |
| Codex | Codex 桌面应用资源 `Contents/Resources/icon-codex-light.png`，bundle ID `com.openai.codex` |
| WorkBuddy | [官方网站图标资源](https://assets.workbuddy.cn/web/workbuddy/2d555459d623c206fdb8c6a492111abb97151910/assets/logo.svg) |
| DeepSeek | [官方网页图标资源](https://fe-static.deepseek.com/chat/icon-180.png) |
| 豆包 | [官方网页图标资源](https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/favicon/new-doubao/192x192.png) |

程序从用户本机应用读取的图标仅在本机用于识别与启动预览，不会上传。图标来源的详细记录随相关素材保存在 `public/assets/apps/sources.json`。

## 软件依赖

直接与间接依赖见 `package.json` 和 `package-lock.json`。使用和分发这些依赖时，应保留其原有的许可证和版权声明。桌面构建中由 Electron 提供的许可证与 Chromium 第三方声明应随应用保留。
