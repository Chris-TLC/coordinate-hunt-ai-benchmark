#!/bin/bash
# ============================================================
#  坐标猎场 · COORDINATE HUNT
#  双击本文件即可开始游戏(macOS)
# ============================================================
cd "$(dirname "$0")" || exit 1

PORT=8420
# 端口被占用时自动顺延
while lsof -i :$PORT >/dev/null 2>&1; do
  PORT=$((PORT+1))
  if [ $PORT -gt 8450 ]; then
    echo "找不到可用端口,请先关闭其他本地服务。"
    read -r -p "按回车键退出..."
    exit 1
  fi
done

if ! command -v python3 >/dev/null 2>&1; then
  echo "未找到 python3。"
  echo "macOS 自带 python3;若缺失,可在终端运行:xcode-select --install"
  read -r -p "按回车键退出..."
  exit 1
fi

clear
cat <<'BANNER'

    ██████╗ ██████╗  ██████╗ ██████╗ ██████╗
   ██╔════╝██╔═══██╗██╔═══██╗██╔══██╗██╔══██╗
   ██║     ██║   ██║██║   ██║██████╔╝██║  ██║
   ██║     ██║   ██║██║   ██║██╔══██╗██║  ██║
   ╚██████╗╚██████╔╝╚██████╔╝██║  ██║██████╔╝
    ╚═════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═════╝
              坐  标  猎  场

BANNER
echo "  正在启动本地服务器 (端口 $PORT) ..."

python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT INT TERM

sleep 1
open "http://127.0.0.1:$PORT/index.html"

echo "  游戏已在浏览器中打开。"
echo ""
echo "  ── 玩之前只需要知道三件事 ─────────────────"
echo "     ① 你面前那块巨幕,是对手房间的俯视图"
echo "     ② 朝你猜他在的位置开枪,打的是地图上的坐标"
echo "     ③ 但你开火的位置,也会亮在他的屏幕上"
echo "  ───────────────────────────────────────────"
echo ""
echo "  操作:WASD 移动 · 右键放大巨幕 · 左键开火 · Q 侦测器"
echo ""
echo "  ⚠️  玩的时候请不要关闭这个终端窗口。"
echo "     玩完后,在这里按 Ctrl+C 即可退出。"
echo ""

wait $SRV
