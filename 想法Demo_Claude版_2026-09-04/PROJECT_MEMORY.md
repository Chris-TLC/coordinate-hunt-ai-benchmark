# 游戏demo（坐标猎场）Project Memory

> 新线程/新 agent 开工前必读本文件；AGENT_LOG.md 为完整工作日志（备查）。
> updated_at: 2026-08-08 17:20 | last_maintained_by: Hermes

## 1. Canonical Rule
- 与旧文档冲突时以本文件为准；方向变更须在 AGENT_LOG.md 留条（旧→新+理由）。
- 全局协议见 `~/Desktop/项目文件夹/AGENTS.md`。

## 2. Current North Star
- 坐标猎场：一个可玩的游戏 Demo（Vite + React + TS），展示 3D/2D 场景与 AI 控制的游戏机制。
- 定位：用户（Chris）个人项目之一，非申请主线（主线=28fall 美本申请 CC→UC 转学）。

## 3. Current Direction
- （2026-08-08）版本控制基线建立：git init + .gitignore + 三件套 + 基线提交；node_modules 262MB 已从工作区删除（corepack pnpm install 可随时恢复）。
- 概念与开发路线文档：`坐标猎场_游戏Demo概念与开发路线_2026-07-23.docx`。

## 4. Engineering State
- 技术栈：Vite + React + TypeScript（tsconfig.app.json / tsconfig.node.json）、ESLint、Vitest。
- 包管理：pnpm（corepack pnpm 11.x），lockfileVersion 9.0（pnpm-lock.yaml）。
- 依赖：4 生产依赖 + 13 开发依赖；构建 `corepack pnpm build`（tsc -b && vite build）✅；测试 `corepack pnpm test` = 31/31 通过 ✅。
- 结构：src/game/（rules.test.ts、AIController.test.ts、math.test.ts 等）、src/ 主场景、index.html、vite.config.ts、启动脚本 启动坐标猎场.command。
- 基线提交：a0xxxxx（2026-08-08，t_cleanup01 组2-1）。

## 5. Must-Read For New Threads
- AGENTS.md（本目录）
- 坐标猎场_游戏Demo概念与开发路线_2026-07-23.docx（概念与路线）
- README.md（若有）

## 6. Active Risks
- P2：构建产单 chunk 773KB（>500KB 警告）——后续可 code-split，非阻断。
- P2：node_modules 已删，恢复环境需 `corepack pnpm install`（网络可用时）。

## 7. Immediate Next Actions
- （可选）chunk 拆分优化；继续游戏玩法迭代。

## 8. Open Decisions
- 无（2026-08-08 基线建立后暂无开放决策）。

> 本节省由 kanban_open_decisions.py 自动同步（每 6h）——人工修改会被覆盖，决策详情以 AGENT_LOG 为准。
