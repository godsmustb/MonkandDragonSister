# Asset Library Plan — v1.5 "ContentGenAI" AAA Art Pass

> How we take The Monk & The Dragon Sister from stylized-procedural to a market-ready
> AAA-looking game using the local ContentGenAI pipeline. Read with `CLAUDE.md` and
> `docs/CONTENT_PIPELINE_2026.md`.

## The one finding that drives everything

I pulled the actual ContentGenAI outputs and compared each stage:

| Stage | Engine | Verdict |
|---|---|---|
| **2D concept art** | Flux Schnell NF4 | **Already AAA.** The `monk.png` reference is genuinely excellent — clean anime, full-body, perfectly usable as hero art, store art, key art. |
| **Image → 3D** | TripoSR | **The bottleneck.** Outputs are blobby, dark, mis-oriented, low-fidelity. Not shippable as hero/boss models. |

**Conclusion:** the pipeline architecture is right and the 2D half is launch-grade. The *only*
thing between us and a real visual jump is the **image→3D model**. So the plan is two-track:
ship the AAA 2D now, and upgrade the 3D engine for the hero/creature meshes.

## Track A — Upgrade image→3D (TripoSR → Hunyuan3D-2) ✅ scaffolded

New HQ path added to ContentGenAI, mirroring the TripoSR scripts but far higher fidelity,
tuned for the RTX 4060 8 GB (shape-only, `low_vram_mode`, mini-turbo — **no C++ compiler needed**):

- `scripts/3d/install_3d_hq.ps1` — isolated `tools/3d-hq` venv + Hunyuan3D-2 (one-time).
- `scripts/3d/hunyuan_run.py` — headless image→`mesh.glb` (low-VRAM, flashvdm).
- `scripts/3d/image_to_3d_hq.ps1` — drop-in replacement for `image_to_3d.ps1` (same
  Blender clean/decimate/export → `_game.glb` + `_game.fbx`).

> Texture painting (Hunyuan's `texgen`) needs MSVC and is intentionally skipped; we texture
> from the source Flux image in Blender. If 8 GB OOMs, fall back to the GPU-Poor fork
> `deepbeepmeep/Hunyuan3D-2GP --profile 4` (noted in the installer).

## Track B — The asset library (the "brand new library") ✅ authored

Prompt library (anime cel-shaded; 3D-bound prompts carry the mandatory
full-body / front / A-pose / flat-gray-bg discipline that makes reconstruction clean):

- `pipeline/input/prompts/game/heroes.txt` — Monk, Sister, + 4 elemental dragons
- `pipeline/input/prompts/game/demons.txt` — 5 demon types
- `pipeline/input/prompts/game/bosses.txt` — Venom Oni + Inferno Demon Lord (+ frozen phase)
- `pipeline/input/prompts/game/environment.txt` — props for all 3 worlds + relics
- `pipeline/input/prompts/game/marketing_2d.txt` — key art, menu BGs, portraits, icons, logo

Build manifest + orchestrator (handles the one-GPU-at-a-time staging):

- `pipeline/input/game_asset_manifest.json` — the launch-critical asset set, source of truth.
- `scripts/build_game_library.ps1 -Stage images|meshes|prep|rig|game`.

## The pipeline, end to end

```
Flux image  ──►  Hunyuan3D mesh  ──►  Blender clean/decimate  ──►  _game.glb/fbx
(Track B)        (Track A)            (existing)                    │
                                                                    ├─ heroes: Mixamo auto-rig
                                                                    │   + mixamo_merge.py ──► <name>_animated.glb
                                                                    │   ──► game assets/  (?glb=1 swap, already wired)
                                                                    └─ 2D art ──► game UI / itch.io / Steam
```

## Run order (do this)

```powershell
# ── ONE-TIME ──
cd C:\Users\scnun\Projects\ContentGenAI
scripts\3d\install_3d_hq.ps1

# ── STAGE 1: images (Forge UP) ──
scripts\start-forge.ps1                      # wait for :7860
scripts\build_game_library.ps1 -Stage images
#   review pipeline\output\images\game\<name>\, keep the best seed per asset

# ── STAGE 2: meshes (Forge DOWN — free the GPU) ──
scripts\build_game_library.ps1 -Stage meshes
#   review pipeline\output\3d\<name>\<name>_game.glb (turntables in output\renders)

# ── STAGE 3+4: heroes only — prep + Mixamo (manual web) ──
scripts\build_game_library.ps1 -Stage prep -Category hero
scripts\build_game_library.ps1 -Stage rig  -Category hero   # prints the Mixamo checklist

# ── STAGE 5: stage into the game + ship ──
scripts\build_game_library.ps1 -Stage game
cd C:\Users\scnun\FirstGame
#   test: open http://localhost:8321/index.html?glb=1   (or __game.setGltfHeroes(true))
cd test; node e2e.mjs                                   # gate must stay green
cd ..; node deploy.mjs
```

## Prioritized action items (highest leverage first)

1. **2D quick win — ship this week, zero 3D risk.** Generate `marketing_2d.txt`: menu/loading
   backgrounds, hero portraits for the select/HUD plates, element icons, and the key art for
   itch.io/Steam. This is the biggest *visible* quality jump for the least effort and feeds the
   store page for launch.
2. **Hero GLBs (Monk + Sister).** The GLB swap is already wired (`?glb=1`); Hunyuan3D + Mixamo
   makes the two heroes real 3D models. Highest in-game impact.
3. **Bosses (Venom Oni, Inferno Lord).** Most-watched creatures on screen; Hunyuan static meshes.
4. **Demons + dragons.** Rounds out the cast. (Needs a small game-side GLB loader for non-hero
   enemies — currently only heroes have the swap; tracked as the next engine task.)
5. **Environment props — fix the zen floor.** The floor is the documented weakest element; replace
   flat procedural geometry with lantern/torii/rock/bridge meshes + a better ground texture.
6. **Re-gate + deploy.** E2E 60/60, mobile verify, then `deploy.mjs`.

## Honest constraints

- **One GPU at a time.** Forge and Hunyuan3D can't co-reside in 8 GB — hence the staged build.
- **Untested scripts.** The HQ-3D scripts target the documented `hy3dgen` shape API but haven't
  been run on this machine (no GPU session here). Expect to tune torch/pip pins or the
  `octree`/`steps` on first run; the GP fork is the fallback. The 2D track is fully proven.
- **Non-hero GLBs need loader work.** The game only swaps *heroes* to GLB today. Demons/props as
  GLB is a small additive engine pass (a static-mesh loader keyed off the same flag) — not done yet.
- **GitHub remote stays frozen** at V1.0 until Owner says "ready for v1.1." Local commits + the
  Hostinger deploy continue as normal.
