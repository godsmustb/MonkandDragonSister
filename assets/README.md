# Rigged hero GLBs (v1.5 asset pipeline)

Drop the Mixamo-merged models here:
- `monk_animated.glb`
- `sister_animated.glb`

Each: one rigged mesh, Y-up, ~1.75 m, animation clips named
`idle, walk, run, attack1, attack2, attack3, cast, dodge, hit, death`.

## Where they come from (ContentGenAI — `C:\Users\scnun\Projects\ContentGenAI`)
The image→3D path is automated; **rigging is one manual Mixamo step**. Current state:
the un-rigged meshes are ready (`pipeline/output/characters/{monk,sister}/*_for_mixamo.fbx`),
but the animated GLBs have NOT been produced yet. To finish them:

1. **Mixamo (web, manual)** — at https://www.mixamo.com upload each `*_for_mixamo.fbx`,
   auto-rig, and download the 10 clips (FBX Binary · With Skin · 30 FPS · In-Place where
   offered) into `pipeline/output/characters/<name>/mixamo/` using the exact filenames
   `idle.fbx … death.fbx`. See `ContentGenAI/docs/MIXAMO_GUIDE.md` for the per-clip table.
   *(Watch the Sister — if her arms hang straight, regenerate in a T-pose first or the
   auto-rig fuses arms to torso.)*
2. **Merge (automated)** — per character:
   ```powershell
   $blender = (gci "C:\Program Files\Blender Foundation" -r -filter blender.exe).FullName
   & $blender --background --python scripts\characters\mixamo_merge.py -- `
      --dir pipeline\output\characters\monk\mixamo --name monk `
      --out pipeline\output\characters\monk\monk_animated.glb --height 1.75
   ```
3. **Copy** `monk_animated.glb` + `sister_animated.glb` into this `assets/` folder.

## Activate in the game (no code edit needed)
- Quick test: open the game with `?glb=1` in the URL.
- Persistent: in the browser console run `window.__game.setGltfHeroes(true)` then reload
  (saved in `localStorage.mds_gltf_heroes`). `setGltfHeroes(false)` reverts.
- The flag is **OFF by default**, so without the GLBs the game uses the procedural heroes
  and is unchanged. With the flag on but a model missing, it logs a warning and keeps the
  procedural hero (never crashes).

## Tuning (in `src/main.js`, the `useGltfHeroes` block)
- `ctx.HERO_SCALE` — overall size if the model is too big/small.
- `forwardYaw` (passed to `loadGltfCharacter`) — rotate if the hero faces the wrong way
  (Mixamo faces +Z; `Math.PI` is the usual flip).

## Deploy
`assets/` is now part of `node deploy.mjs`, so the GLBs upload to the live site automatically.
