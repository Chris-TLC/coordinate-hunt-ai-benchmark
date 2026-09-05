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

---

## The benchmark prompt (English)

This is the exact prompt given to every fresh AI model in an empty folder. It is the model's only source of truth:

> I recently had a dream about a game I've never seen before. After waking up, the more I thought about it, the more interesting it became, so I want to build it. I don't know how to write games, but I want your help making it into something that can actually be played.
>
> In the dream: I'm in a very large room, kind of like a classroom, but not quite. Instead of a blackboard, the front of the room has an enormous screen that almost fills the entire wall. I'm standing in the room in first person, able to walk, turn, and look up just like a normal FPS game. My teammates are in the same room too, and we can run around freely.
>
> That giant screen shows a floor plan of the opposite room — like an architectural blueprint viewed from above. The people on the other side are in exactly the same kind of space as ours; they're running and hiding too. But you can't see them on the screen. The screen only shows the map, no little figures. You can only occasionally see traces appear on the map — like a blurry patch of light suddenly showing up somewhere, or a faint drag mark. Those are the clues they leave behind, and that's all you get.
>
> I'm holding a gun. When it fires, it doesn't hit the glass of the screen — it hits "a location on the map." If I aim at some point on the screen and fire, the bullet lands at the corresponding spot in the opponents' room. If someone happens to be standing there, they get hit. So I'm really *guessing* — I'm guessing where they are right now, and firing at that spot. If I guess right, they're hurt. If I guess wrong, that shot was wasted on empty air — and worse, it exposes me: the place I fired from leaves a trace on their screen too, and they'll fire back at my direction.
>
> It's hard to describe the feeling. You might be running, when suddenly the edge of the screen flickers, your vision turns red, and you know someone almost hit you — or maybe already did. You don't know where they are, but you know someone is watching you. This room is enclosed, with nowhere to hide — just a few obstacles. You can only rely on footsteps, the faint traces on the map, and your own judgment: where is he, where should I fire, should I change position. The whole game is like a psychological duel — sort of like Buckshot Roulette, that fixed-scene tension of "I know you're there, but I don't know where."
>
> I've also thought about some extended ideas; feel free to pick and choose: launch a "detector" onto the map that scans a small area of the opposite side — if someone's there, you see their trail; if not, it shows empty. Things like bushes and obstacles to enrich movement. When a player is hit, their screen turns red and they speed up to flee, making the "hunt" feel stronger. Maybe someday a 3v3 mode, where teams coordinate by voice — "I saw someone on the left," "go pressure him." None of these are required; use your own judgment.
>
> But a few things I've already decided. Please don't change these:
>
> * The arena is roughly a rectangular space 16 meters wide by 15 meters deep (that's the proportion; decoration is up to you).
> * Each round is 120 seconds.
> * Single-player works: just me, fighting the computer AI 1v1.
> * I'll play directly in the browser on a MacBook. No extra software, no internet, all materials drawn/written by you — code only, no online assets.
>
> Everything else is yours, by your taste: what the room looks like, the style of the giant screen, the feel of the gun, how much damage, what abilities, how smart the AI, how the UI is designed, whether there's audio, what the map shows, what the arena's theme is... My only requirement is that what you build makes me feel "this is the game from my dream," not "you made some other game and just wrapped my idea in a shell."
>
> Finally, if I were to score you, I'd look at these:
>
> 1. It's playable from the moment it opens — no manual needed.
> 2. Within 30 seconds, I understand what I'm doing and how to win.
> 3. It's actually fun, with real mind games — not just mindless clicking.
> 4. It looks good — visuals and UI don't hurt the eyes.
> 5. After one round, I want to play another — not boring.
>
> You don't need to make the game huge; a complete single-round flow is enough for a first version. But hitting the feelings above IS the core.

---

## How a submission is scored

Each model's artifact is judged against the five criteria in the prompt: instant playability, 30-second comprehension, genuine mind-game fun, comfortable visuals and UI, and replayability. No strict rubric — this is a hobby record of how different AI models "dream" the same game.
