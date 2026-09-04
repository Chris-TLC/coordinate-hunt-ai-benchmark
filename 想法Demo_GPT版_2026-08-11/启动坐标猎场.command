#!/bin/zsh

set -e

PROJECT_DIR="${0:A:h}"
GAME_URL="http://127.0.0.1:4173/"

cd "$PROJECT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "未检测到 pnpm。请先安装 Node.js 20.19+，再运行：npm install -g pnpm"
  read -r "?按回车键关闭窗口..."
  exit 1
fi

RUNNING_PAGE="$(curl --silent --fail "$GAME_URL" 2>/dev/null || true)"
if [[ "$RUNNING_PAGE" == *"<title>坐标猎场</title>"* ]]; then
  open "$GAME_URL"
  echo "坐标猎场已经在运行，已在浏览器中打开。"
  exit 0
fi

if [[ -n "$RUNNING_PAGE" ]]; then
  echo "端口 4173 已被其他服务占用。请先关闭该服务后再启动坐标猎场。"
  read -r "?按回车键关闭窗口..."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "首次启动，正在安装本地依赖..."
  pnpm install
fi

(sleep 1; open "$GAME_URL") &
echo "坐标猎场启动中。关闭此窗口或按 Control-C 可停止服务。"
pnpm dev --host 127.0.0.1 --port 4173 --strictPort
