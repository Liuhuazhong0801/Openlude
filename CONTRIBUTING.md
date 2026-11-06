# 开发流程

`main` 保存可构建的代码。日常改动从最新的 `main` 新建短期分支，通过 Pull Request 合入。

```sh
git switch main
git pull --ff-only
git switch -c feat/your-change
npm ci
```

提交前检查差异，只暂存本次改动涉及的文件。提交信息使用 `feat:`、`fix:`、`docs:`、`test:` 或 `chore:` 等清晰前缀。

```sh
npm run build
npm test
git diff --check
git diff
git add <本次修改的文件>
git commit -m "feat: describe the change"
git push -u origin feat/your-change
```

Pull Request 说明修改的问题、实现后的行为、实际验证结果和未覆盖的平台。等待 macOS 与 Windows 的 CI 检查通过并完成评审后合并；避免强制推送 `main`。

## 验证范围

- CI 验证类型、构建、配置与路径逻辑，以及单文件动效预览的构建。
- 修改桌面启动或窗口生命周期时，在解锁的本机运行 `npm run test:desktop`。
- 修改动效时，运行 `npm run build:preview` 和 `npm run test:preview`，并实际查看效果。首次运行预览测试前安装 Chrome 并执行 `npx playwright install ffmpeg`。
- Windows 的构建成功不代表 Windows 桌面行为已验收，需要 Windows 实机检查启动、全屏动画和窗口激活。

## 仓库边界

提交源码、必要素材、依赖锁文件和经过整理的验证记录。依赖目录、缓存、个人环境配置、安装包与临时测试输出由 `.gitignore` 排除。

公开发布前应另行确定代码许可、应用签名、公证与 Release 产物；本仓库初始化不会自动发布安装包。
