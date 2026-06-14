# Rigged hero GLBs (v1.5 asset pipeline)

Drop the Mixamo-merged models here:
- `monk_animated.glb`
- `sister_animated.glb`

Produced by ContentGenAI: `scripts/characters/mixamo_merge.py` (clips: idle, walk, run, attack1-3, cast, dodge, hit, death).

## Activate
1. Place the two GLBs in this folder.
2. In `src/main.js`, set the flag to true:  `ctx.useGltfHeroes = true;`
3. Run the gate:  `cd test && node e2e.mjs`  (expect screenshots to change — that's the art swap, not a regression).
4. Tune `ctx.HERO_SCALE` / `forwardYaw` in main.js if size/facing is off.

Flag stays OFF by default, so the game is unchanged until you opt in.
