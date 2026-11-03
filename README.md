# 3D & Robotics Insights

网站：https://wqs111000.github.io/3d-robotics-insights/

个人三维与机器人技术观察静态网站，使用 GitHub Pages 托管。网页不调用 AI API，不自动生成内容。内容先上线、持续检查，发现问题后修订或撤下。

## 当前状态

- 第 001 期（2026-10-11）与第 002 期（2026-10-31）已公开；2026-11-02 部署的连续编号已在线核验。
- 允许公开（`publish_approved`）与本人审阅（`owner_reviewed`）、独立实测（`independently_tested`）是不同状态，必须分别如实记录。
- 每周六北京时间 10:00 的 ChatGPT 任务负责研究和生成内容。其配置要求具备权限时更新仓库并部署，但自动发布尚未经过成功运行验证。最近一次记录的运行只生成了待发布内容；生成成功不代表网站已发布。
- 历史部署记录见 `content/articles.json`；站点发布日期沿用已有两期的发布日期，并非已核实的首次部署时间。

## 内容更新与部署

1. 查看任务输出，核对来源、事实边界及是否取得仓库写入权限；缺少权限时，人工整理更新稿并合并至 `content/articles.json`。避免公开私人材料或未准备公开的草稿。
2. 保留历史期数与稳定 ID，新增条目和归档快照须设置 `publish_approved: true` 并提供 HTTPS 原始来源。本人审阅和实测只在得到本人明确确认后标记。
3. 本地运行 `node tools/build.mjs`，可用 `python3 -m http.server --directory dist 8000` 预览。
4. 提交到 `main` 会触发 GitHub Actions 构建并部署；也可在 Actions 的 Build and deploy GitHub Pages 中手动运行，部署已有内容。手动运行工作流不会启动 ChatGPT 研究任务。
5. 检查对应提交的工作流结果，再访问线上网站核对期数及内容；只有完成这些检查才能报告发布成功。若任务未能提交或部署，保持待发布状态并人工处理。

不购买额外 API、credits、服务器或域名；沿用现有 ChatGPT 能力与静态托管。
