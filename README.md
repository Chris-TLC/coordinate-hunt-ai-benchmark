# Coordinate Hunt — AI 3D Game Benchmark

This repository is a personal hobby benchmark for measuring how well AI models can turn a **vague, human, dream-like idea** into a working 3D game.

## The origin

The game idea came from a dream. One night, the author dreamt of standing in a large room, aiming a gun not at enemies — but at a giant screen showing a 2D map of the opponent's identical room. Shooting a coordinate on the map hurt the opponent standing at that exact spot in their own 3D room. Blind guessing, traps, detectors, and the constant feeling that someone is hunting you. Since then, the idea has lived on as a personal project: proving that the core loop (asymmetric information + spatial mismatch + two-way exposure) is fun — and, increasingly, proving that *AI models* can reconstruct the same fuzzy vision in different ways.

## Two personal versions (not benchmark samples)

Two versions were first built by hand as a one-off experiment:

| Folder | Version | Finished |
| --- | --- | --- |
| `想法Demo_GPT版_2026-08-11/` | First version — generated with GPT (Codex) | 2026-08-11 |
| `想法Demo_Claude版_2026-09-04/` | Second version — generated with Claude | 2026-09-04 |

> **Important:** These two versions are **NOT** part of the benchmark. They were built in the same polluted environment (the Claude version was influenced by the GPT version), and they were not created from the same prompt. They exist here as archival history, not as comparable test subjects.

## The benchmark

Starting from now, a designed prompt (vague, human, dream-like) will be given to a fresh AI model in a completely empty folder. The model must reconstruct the game from that prompt alone.

Every new model's finished artifact is added to this repository under:

```
<模型名>_<完成日期>/
```

and then committed to GitHub. Over time, this builds up a comparative record of how different models interpret the same fuzzy description — their creativity, their ability to build a coherent 3D game from scratch, and their personal "taste."

## What the benchmark measures

- How well a model translates a vague human description into concrete game mechanics
- 3D scene modeling and game development capability in an empty workspace
- Creative freedom: the same idea, interpreted by different models
- Usability of the result: easy to pick up, low friction, fun to play, comfortable visuals, replayable

This is a hobby project, **not** a strict scientific benchmark. It's a way to have fun with the idea, and to see how different AI "dream" the same game.
