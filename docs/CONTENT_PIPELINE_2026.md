# Content-Generation Pipeline 2026 — Open-Source / Low-Cost AAA Asset Plan

> Research artifact (live web research, June 2026). Goal: replace the game's
> 100%-procedural art with real generated 3D assets using an **open-source /
> cheap** toolchain that mimics **NanoBanana** (consistent-character image
> gen/edit) and **Kling** (image/text→video) — and is **safe to sell**.
> Nothing here is built yet; this is the plan to approve before asset work.

## 0. The one rule that dominates everything: LICENSE

This game will be **sold worldwide**, so "downloadable" ≠ "usable." The research
turned up repeated traps where blogs call a model "Apache 2.0" but the real model
card is restrictive. **Verify every license on the official card before shipping.**

Known traps to AVOID for a sold product:
- **FLUX.1/FLUX.2 "dev" and "klein 9B"** image tiers → non-commercial (downloadable but not sellable).
- **Hunyuan3D** (the 3D quality leader) → Tencent Community License: **excludes EU/UK/South Korea** and caps at **1M MAU**. Do not depend on it for worldwide sale.
- **Stable Fast 3D / SPAR3D** → only free under **$1M/yr revenue** (a hit-game risk).
- **Civitai anime LoRAs** → each carries its own license; many forbid commercial/merch use.

**Safe core = MIT / Apache / OpenRAIL++ only**, or **paid tiers** of managed tools
(Meshy/Tripo Pro) that grant full commercial ownership. Keep a per-asset **license log**
(already required by the roadmap).

## 1. Honest quality ceiling (set expectations)

Achievable in a browser: a **polished, stylized cel-shaded anime** look — clean toon
materials + ramp shadows + rim light + inverted-hull outlines + bloom, on 3k–6k-tri
characters, total download < 10 MB. That is a **large, visible jump** over today's
procedural primitives.

NOT achievable for free / hands-off: **Genshin-photoreal hero fidelity.** Every current
AI mesh generator has a realism bias that "rounds out" cel features, and outputs dense
triangulated sculpts that need **manual retopo + UV + face/hair cleanup** for hero
characters. True AAA-anime = hand-finishing each hero. The realistic target is
**"polished indie stylized anime,"** with hero assets hand-cleaned over time. (All of it
exports straight to GLB, which also feeds the planned **Godot 4** v2.0 port.)

## 2. The pipeline (concept → in-game)

```
 2D concept/cel ref ─► image→3D mesh ─► albedo-only texture ─► auto-rig + anim
        │                   │                  │                     │
   Qwen-Image-Edit     TRELLIS.2 (MIT)      TEXGen / StableGen     UniRig (MIT)
   + SDXL-anime        or Tripo/Meshy Pro   (discard PBR)          + Mixamo/Rokoko
                                                                        │
                          ┌─────────────────────────────────────────────┘
                          ▼
        gltf-transform (meshopt + KTX2/ETC1S, 1024² cap)  ─►  GLTFLoader in Three.js
                                                                behind ctx.config.useGLB
                                                                re-skinned w/ toon shader
```

### Stage A — Image generation (the "NanoBanana" job)
Replicate consistent-character + multi-image fusion + instruction editing, commercial-safe:
- **Qwen-Image + Qwen-Image-Edit-2511** — Apache 2.0, the only open family that natively
  does consistent character across shots + multi-person fusion + instruction edits.
  Hosted ~**$0.02–0.03/img** (fal/Replicate); ~16 GB FP8 local.
- **FLUX.2 [klein] 4B** — Apache 2.0 (the **4B only**), ~13 GB, fast cheap generations.
- **Anime/cel styling:** SDXL **Illustrious** or **NoobAI** checkpoint (OpenRAIL++ = commercial)
  + a **commercially-licensed** cel-shade LoRA + **IP-Adapter/ControlNet** (lineart/openpose/depth)
  to lock the same character across angles. *Log each LoRA's license.*

### Stage B — Image/text → 3D mesh
- **TRELLIS.2** (Microsoft, **MIT**, unrestricted) — cleanest open topology, 24 GB local or fal.
- **TRELLIS v1** (MIT, ~16 GB) — lighter fallback.
- **TripoSR / InstantMesh** (MIT / Apache) — fast, props-grade; weak for hero anime.
- **Managed (best stylized output, full ownership on paid tier):** **Tripo 3.0 Pro $19.90/mo**
  (strongest cartoon/stylized + auto bone-binding) or **Meshy 6 Pro $20/mo** (Smart Remesh auto-retopo).
- ⚠️ **Avoid Hunyuan3D** for worldwide sale (license, §0) despite being the quality leader.
- **Topology truth:** no 2026 tool gives clean quad topology blind — **hero meshes need retopo**
  (Blender Decimate/Quadriflow, free). Props/enemies can often ship as-is.

### Stage C — Texture (albedo-only, because we discard PBR)
Genshin-style NPR is lit by a **shadow ramp, not the BRDF** — so we throw away metallic/roughness
and keep **albedo only**. That makes a full-PBR generator wasteful; prefer:
- **TEXGen** (`github.com/CVMI-Lab/TEXGen`) — seamless albedo in UV space.
- **StableGen** (Blender add-on) — drive an **anime SD checkpoint** for native stylized albedo (most control).

### Stage D — Rig + animation
- **UniRig** (VAST/Tsinghua, **MIT**, scriptable, SIGGRAPH'25) — humanoids **and quadrupeds/dragons**,
  outputs Mixamo-compatible FBX. The standout free pick.
- **Mixamo** clips for the humanoids (Monk, Sister) — license lets you **sell games** (just not resell raw FBX);
  but it's been flaky since mid-2025, so **pull clips now, don't depend on it live**.
- **Retarget:** free **Rokoko** Blender plugin (or **Auto-Rig Pro $40** for one-stop rig+retarget+Godot export).
- Recommended free combo: **Rigify (humanoids) + UniRig (dragons) + Rokoko retarget.**

### Stage E — Browser optimization (Three.js)
Confirmed current: **Three.js r184** (we're on r160), **gltf-transform 4.4.0**.
- **Compression:** **Meshopt** for skinned characters/enemies (compresses animation+morphs, GPU-cache-friendly)
  + brotli at serve. **Draco** only for the static environment mesh.
- **Textures:** **KTX2/Basis** — **ETC1S** for flat albedo/emissive (tiny), **UASTC** only for normal/data maps.
- **One-shot:** `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2 --texture-size 1024`
  (or `gltfpack -cc -tc`).
- **Budgets:** heroes **3k–6k tris** / **150–600 KB**; enemies **1.5k–3k** / **50–250 KB**; environment **1–3 MB**;
  **total transfer < 10 MB**; cap textures at **1024²**.
- **Instancing/LOD:** keep hero/boss as normal SkinnedMesh; `THREE.LOD.update()` must run **per split-screen camera**.

### Stage F — Re-skin to the toon look in Three.js
Three tiers, lowest-risk first:
1. **Works on current r160:** `MeshToonMaterial` + `gradientMap` ramp — **must** set
   `texture.minFilter = magFilter = THREE.NearestFilter` or bands smear. (We already have a 3-band ramp in `common.js`.)
2. **Most authentic, least code:** **`@pixiv/three-vrm` MToon** (MIT) — shade color, rim, MatCap, built-in outline.
   *Requires bumping Three.js to r167+.*
3. **Full control:** custom `ShaderMaterial` (NdotL ramp + constant-width rim + quantized Blinn-Phong);
   reference ports: `ZaneAtega/Three-js-Anime-Shader`, `manbust/three-js-toon-shader`.

### Video (the "Kling" job — trailer + between-wave cutscenes)
- **LTX-Video / LTX-2** (Apache 2.0, 16 GB, cheapest, ~$0.05–0.20 per 5s) — volume work.
- **Wan 2.x** (Apache 2.0) — best motion quality when it matters.
- Skip **HunyuanVideo** unless you accept its Tencent community-license conditions.

## 3. Orchestration & compute

- **ComfyUI** is still the 2026 standard. **ComfyUI-3D-Pack** (MIT) wraps the 3D models but lags PyTorch —
  pin versions or use the **`YanWenKun/Comfy3D-WinPortable`** prebuilt bundle. Add **ComfyUI-UniRig** to chain
  image→3D→rig in one graph.
- **VRAM:** a **24 GB GPU (RTX 4090)** runs the whole stack. 12–16 GB cards do shape gen / offloaded texture.
- **Cheapest cloud (live June 2026):** RTX 4090 **$0.31/hr** (Vast.ai), A100 80GB **$0.60/hr** (Spheron spot).
  **Serverless per-gen for one-offs:** fal.ai ~$0.05/gen, Salad ~$0.009/gen.
- **Cost to do the entire cast** (Monk, 4 dragons, 5 demons, boss): DIY ≈ **$0.05–0.50 compute each**,
  or managed Tripo/Meshy Pro ≈ **$1–2 all-in each → one ~$20/mo subscription generates everything, then cancel.**

## 4. Recommended commercial-safe stack (the bottom line)

| Stage | Pick (free/OSS) | Pick (fastest, ~$20/mo) | License |
|---|---|---|---|
| Concept + consistent edits | Qwen-Image-Edit-2511 + SDXL-anime | same | Apache 2.0 / OpenRAIL++ |
| Image→3D | TRELLIS.2 | Tripo 3.0 Pro / Meshy 6 Pro | MIT / paid-commercial |
| Texture (albedo) | TEXGen / StableGen-anime | (managed includes it) | MIT / paid |
| Rig + anim | UniRig + Mixamo + Rokoko | Tripo auto-bind / Auto-Rig Pro $40 | MIT / EULA |
| Retopo hero meshes | Blender Quadriflow | manual | GPL |
| Optimize | gltf-transform 4.4.0 (meshopt+KTX2) | same | MIT |
| Toon re-skin | MeshToonMaterial+ramp → MToon (r167+) | same | MIT |
| Video | LTX-Video / Wan 2.x | same | Apache 2.0 |
| Orchestration | ComfyUI (self-host) | fal.ai serverless | — |

**Net:** software ~$0 (all MIT/Apache/free) + pennies of compute per asset, OR ~$20 for one managed month.

## 5. Game integration seam (how it plugs into THIS codebase)

The clean, E2E-safe way to introduce GLB assets without breaking the green gate or `window.__game`:
- Add an async GLB builder in **`src/chars/builders.js`** behind **`ctx.config.useGLB`** (default **false** —
  keeps E2E 60/60 and the debug API stable). It must return the **same rig interface** the current
  procedural builders expose.
- **Bone-name mapping** is the real work: `src/chars/anim.js` and `src/chars/ik.js` look up specific joints,
  so imported skeletons need a name map. Drive `mixer.update(dt)` from the **fixed-substep dt** in `src/main.js`.
- After load, **re-apply `MeshToonMaterial`/emissive** (emissiveIntensity ≥ ~1.8 so bloom catches it — see
  `src/fx/postfx.js` threshold 0.85) and add inverted-hull outlines.
- Touch points: `builders.js`, `anim.js`, `ik.js`, `common.js`, `main.js`, `state.js`, `postfx.js`.
- Wire **GLTFLoader + Draco + KTX2 + Meshopt** decoders once at boot.

## 6. Phased rollout (proposed)

- **P0 — Renderer polish (no assets, I can do today, $0):** custom toon/rim shader, better lighting/post,
  rebuild the weak zen-garden floor (the known #1 visual offender), juicier VFX. Big jump, de-risks the look,
  and is the exact shading the GLB models will reuse. *This is the highest-leverage thing I can do alone.*
- **P1 — Pipeline scaffold:** install Blender + ComfyUI(-3D-Pack/UniRig), wire GLTFLoader decoders, add the
  `useGLB` builder seam + bone-map, ship one throwaway test GLB end-to-end behind the flag.
- **P2 — Heroes:** Monk + Dragon Sister (human) as the first real assets (hand-cleaned).
- **P3 — Dragons (4) + demons (5) + boss.**
- **P4 — Environment** pass + KTX2/meshopt budget tuning to keep < 10 MB.
- **P5 — Trailer + between-wave cutscenes** via LTX/Wan (marketing + "AAA feel" cheaply).

## 7. Division of labor (honest)

- **I (in code) can do:** the entire P0 renderer overhaul; all Blender Python automation; the GLTFLoader/decoder
  wiring; the `useGLB` builder seam + bone mapping; gltf-transform optimization scripts; the custom toon/NPR shader;
  ComfyUI graph configs.
- **You (external, needs your accounts/$/GPU):** run the paid/cloud generators (Qwen/Tripo/Meshy/LTX), pick the
  concept art, and (for hero quality) the manual retopo/face cleanup — or we keep it to the auto pipeline and
  accept enemy/prop-grade results on heroes.
- **Prereqs to start P1:** install **Blender** (not currently on PATH) and either a 24 GB GPU or a RunPod/fal account.

---
*Sources: see the two research briefs in session history — BFL/Tencent/Alibaba/Microsoft model cards, fal/RunPod/Spheron pricing, gltf-transform & three-vrm docs, all verified live June 2026.*
