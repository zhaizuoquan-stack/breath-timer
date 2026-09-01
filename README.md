# Breath Timer（呼吸计时器）

呼吸练习计时应用。可自定义吸气 / 屏息 / 呼气 / 休息时长，带合成音效引导与周期统计。

## 运行

- **使用**：直接双击打开 `index.html`（浏览器即可，无需安装任何依赖）。
- **开发调试（可选）**：`python -m http.server 8080` 后访问 `http://localhost:8080`。
- **在线访问（GitHub Pages）**：https://zhaizuoquan-stack.github.io/breath-timer/
- **源码仓库**：https://github.com/zhaizuoquan-stack/breath-timer

## 测试

```bash
node --test test/          # 全量单测（Node ≥ 18 自带 test runner，零依赖）
# 或逐个文件：node test/settings.test.js
```

## 文档

- `docs/PRD.md` — 产品设计文档（需求基准）
- `docs/tech-design.md` — 技术方案文档（实现基准）

## 项目规范

- **版本控制 (Git)**：项目初期已初始化 Git 仓库。每完成一个功能保存一个提交快照，便于一键回退到可用状态；后续同步至 GitHub 防止代码丢失。
- 分支：`main`
- 提交规范：每个功能完成后提交一次，提交信息简洁说明该功能。

## 环境

- Git：便携版 2.55.0（`C:\Users\zhaizuoquan\PortableGit`），已加入用户 PATH。
