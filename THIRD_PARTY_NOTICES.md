# 第三方素材与依赖声明

Openlude 的原创源代码和项目文档按 [MIT License](LICENSE) 发布。第三方依赖继续适用其各自的许可证；第三方应用的名称、图标和商标不属于 Openlude 的 MIT 授权范围，权利归各自权利人所有。

## 应用识别图标

下列资源仅用于识别用户选择的目标应用。图标资源的公开可访问性不表示本项目拥有其版权，也不表示相关应用与 Openlude 存在隶属、合作或背书关系。本项目不对这些第三方资源授予额外许可。

| 应用 | 资源来源 |
| --- | --- |
| Codex | Codex 桌面应用资源 `Contents/Resources/icon-codex-light.png`，bundle ID `com.openai.codex` |
| WorkBuddy | [官方网站图标资源](https://assets.workbuddy.cn/web/workbuddy/2d555459d623c206fdb8c6a492111abb97151910/assets/logo.svg) |
| DeepSeek | [官方网页图标资源](https://fe-static.deepseek.com/chat/icon-180.png) |
| 豆包 | [官方网页图标资源](https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/favicon/new-doubao/192x192.png) |

程序从用户本机应用读取的图标仅在本机用于识别与启动预览，不会上传。图标来源的详细记录随相关素材保存在 `public/assets/apps/sources.json`。

## 原图动画主题

`comic.png` 与 `anime.png` 是本项目通过内置 `image_gen` 生成的原创插画素材，分别用于动态漫画分镜和日漫场景。完整提示词、实际像素尺寸和 SHA-256 记录在 `public/assets/themes/illustration-prompts.json`；不包含第三方角色、商标或署名。其他更新主题的缩略图截取自项目自己的实时渲染画面。

历史素材 `public/assets/themes/maple.jpg` 为用户提供的 3840×2160 原画「剑来.jpg」；旧版本在原图上实现镜头推进和分层落叶，人物姿态保持原样。未使用之前带水印的视频，也未对该视频进行去水印。素材记录见 `public/assets/themes/maple.source.json`。原画沿用原始权利，不属于项目源代码的 MIT 授权范围。

## 0.6.0 场景与原版整活素材

星海列车的窗外背景由内置 `image_gen` 生成，完整提示词、实际像素尺寸和 SHA-256 记录在 `public/assets/themes/story-prompts.json`。0.6.2 的车厢窗框、窗沿、玻璃反光与运动由实时 shader 绘制。深海鲸游与猫猫开门已从主题库移除；已有绑定保留应用与偏好，转为星海列车。

| 素材 | 来源 | 本地处理 |
| --- | --- | --- |
| 奶蛙大笑 | [Naiwa Hub 收录页](https://naiwahub.com/zh/memes/ghn-naiwa-wallpaper-1c05a2a8af20)；原片归属记录指向 [NaiWa-Wallpaper](https://github.com/Nailong-Studio/NaiWa-Wallpaper) | 截取前 4.2 秒，保留原角色、原动作、原比例和原声，转码为 H.264/AAC |
| 肥嘟嘟 | [Naiwa Hub 收录页](https://naiwahub.com/zh/memes/dot-feidudu-6ff4cdcdb0a1)；来源记录指向 [肥嘟嘟素材站](https://feidudu.org/) | 按用户选择采用单只袋鼠独舞视频前 4 秒，保留原角色、原动作、原比例与原声，转码为 H.264/AAC |

上述互联网素材的创作者与再分发授权尚未核实，权利归相应权利人；本项目不对其授予 MIT 许可。按项目所有者本次指令随 0.6.2 预览版同步，来源与权利状态如实保留。素材地址、原文件校验值、转码后校验值和实际媒体规格保存在 `public/assets/themes/originals/sources.json`。未使用 AI 重绘的奶蛙或袋鼠替代形象。

## 软件依赖

直接与间接依赖见 `package.json` 和 `package-lock.json`。使用和分发这些依赖时，应保留其原有的许可证和版权声明。桌面构建中由 Electron 提供的许可证与 Chromium 第三方声明应随应用保留。

0.4.1 极光丝缎、纸雕山海底图由内置 image_gen 生成，提示词与实际尺寸见 `public/assets/themes/refinement-prompts.json`。Openlude 小银狐图标沿用用户在设计对话选定的原始文件，记录见 `public/assets/branding/source.json`；菜单栏使用对应的简化矢量狐狸轮廓。
