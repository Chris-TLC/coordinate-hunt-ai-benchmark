#!/usr/bin/env python3
"""像素级 QA:检查截图的关键视觉特征(不依赖人眼)。"""
import sys
from PIL import Image
import numpy as np

def analyze(path):
    img = Image.open(path).convert('RGB')
    a = np.asarray(img, dtype=np.float32)
    H, W, _ = a.shape
    lum = a.mean(axis=2)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    out = {}
    out['size'] = f"{W}x{H}"
    out['p50_lum'] = float(np.percentile(lum, 50))
    out['p95_lum'] = float(np.percentile(lum, 95))
    out['blue_dom_pct'] = float(((b > r + 10) & (b > 40)).mean() * 100)
    # 枪械区域:底部 8% × 中间 40%
    gy0, gy1 = int(H * 0.92), H
    gx0, gx1 = int(W * 0.45), int(W * 0.85)
    gun_region = a[gy0:gy1, gx0:gx1]
    gr, gb = gun_region[..., 0], gun_region[..., 2]
    gun_px = int(((gr > 15) & (gr < 75) & (gb > gr + 4)).sum())
    out['gun_pixels'] = gun_px
    out['gun_ok'] = gun_px > 500
    # 全图亮字像素(标题/HUD 文字)
    out['text_pixels'] = int((lum > 150).sum())
    # 左侧竖带(曾出现过曝):x<70, y 150-630 平均亮度
    band = lum[150:630, :70]
    out['left_band_lum'] = float(band.mean()) if band.size else 0
    out['left_band_p95'] = float(np.percentile(band, 95)) if band.size else 0
    # 巨幕区域(中央):亮度与蓝色主导
    mid = a[int(H*0.25):int(H*0.55), int(W*0.2):int(W*0.8)]
    out['mid_lum'] = float(mid.mean(axis=2).mean())
    out['mid_blue_pct'] = float(((mid[..., 2] > mid[..., 0] + 10)).mean() * 100)
    # 顶部 HUD 区域亮度(文字存在感)
    top = lum[:int(H*0.08), :]
    out['top_p95'] = float(np.percentile(top, 95))
    # 全图色彩
    out['saturation_mean'] = float((a.max(axis=2) - a.min(axis=2)).mean())
    return out

for p in sys.argv[1:]:
    r = analyze(p)
    name = p.split('/')[-1]
    print(f"== {name} ==")
    for k, v in r.items():
        print(f"  {k}: {v}")
