#!/bin/bash
# 打包:把 parts/*.js 合并进单文件 mirrorroom.html
set -e
cd "$(dirname "$0")"
OUT="../mirrorroom.html"
{
  cat head.html
  for f in parts/*.js; do
    echo "/* ===== $(basename "$f") ===== */"
    cat "$f"
    echo ""
  done
  cat foot.html
} > "$OUT"
echo "built: $OUT ($(wc -c < "$OUT") bytes)"
