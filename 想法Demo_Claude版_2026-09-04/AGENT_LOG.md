# 游戏demo（坐标猎场）工作日志

> 完整工作日志，永不轮转。格式：日期时间 | 主题；决策含"为什么"、产出给绝对路径、状态含失败原因。

## 2026-08-08 17:18 | 项目启动 + 版本控制基线（t_cleanup01 组2-1）
- 决策：此前项目无 git（盘点发现）——裁决书组2-1 要求 git init + .gitignore + 三件套 + 测试/构建验证 + 基线提交 + 最后删 node_modules（262MB 可回收）。
- 执行：corepack pnpm 11.20.0 实测可用（裸 pnpm 未安装）；`corepack pnpm build` ✅（tsc -b && vite build，单 chunk 773KB 警告）；`corepack pnpm test` ✅ 31/31（rules 4 + AIController 9 + math 18）；git init（main 分支）+ .gitignore（node_modules/dist/日志）+ 三件套落盘。
- 产出：.gitignore、AGENTS.md、PROJECT_MEMORY.md、本日志；git 基线提交（见下）。
- 状态：✅ 完成；node_modules 已删（262MB 回收），恢复 = `corepack pnpm install`。
- 下一步：玩法迭代（可选）；chunk 拆分（P2）。
