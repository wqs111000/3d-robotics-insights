# 3D & Robotics Insights

静态网站；研究和草稿由现有 ChatGPT 任务负责。网页不调用 AI API，不自动生成内容。初始为空站；原有基线条目尚未确认本人审阅，因此没有发布。

## 部署

1. 创建独立公开 GitHub 仓库，例如 `3d-robotics-insights`，不要覆盖旧博客。上传本目录（包含隐藏的 `.github`）至 `main`。公共仓库中的源文件全部公开：不要上传私人材料或未准备公开的草稿。
2. 仓库 Settings → Pages → Build and deployment → Source 选择 GitHub Actions。推送 main 将触发构建；也可 Actions → Build and deploy GitHub Pages → Run workflow 手动部署已有内容。
3. 工作流成功后使用部署结果返回的地址。网站地址为 https://wqs111000.github.io/3d-robotics-insights/。
4. 内容审核通过后编辑 `content/articles.json`、提交到 main；构建脚本要求条目和归档快照明确标记 `owner_reviewed: true` 并具有 HTTPS 原始来源。避免将未审核草稿放入公开仓库。原型的数据结构可参考此前提供的 MVP 包。手动运行 Actions 仅部署已有内容，不会启动研究任务。

本地构建：`node tools/build.mjs`，再使用 `python3 -m http.server --directory dist 8000` 查看。网页使用相对路径和 hash 路由，适用于 Pages 项目子路径。定时研究仍为每周六北京时间 10:00，人工审核与网页发布是独立步骤。
