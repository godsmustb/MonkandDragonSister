# Auto-Rigging: killing the manual Mixamo step

The one non-automated hole in the hero pipeline was **Mixamo** (web upload → auto-rig →
download clips). Here's the comparison and the pick.

## Why Mixamo was the blocker
Mixamo is free and rigs + animates humanoids, but it is **web-only — no official CLI or
API**. Automating it means a brittle, ToS-risky browser script. It also only rigs
*humanoids* (no dragons/bosses).

## Options compared

| Tool | License / cost | Commercial OK? | CLI / headless? | Rigs non-humanoids? | Notes |
|---|---|---|---|---|---|
| **UniRig** (VAST-AI + Tsinghua, SIGGRAPH'25) | **MIT** | ✅ yes | ✅ **yes** — 3 bash scripts (skeleton → skin → merge) | ✅ yes (autoregressive, any mesh) | 8 GB VRAM. ML auto-skeleton + skinning. **Same lab as Hunyuan3D** → designed to pair. Inputs `.obj/.fbx/.glb/.vrm`. |
| **Blender Rigify** | GPL (free w/ Blender) | ✅ yes | ⚠️ scriptable via `bpy`, but needs a **metarig aligned to the mesh** — auto-placing the metarig per-mesh is the hard, unreliable part | humanoid/quadruped templates | Truly "automatic" only if you can fit the metarig automatically; otherwise semi-manual. |
| **AccuRig** (Reallusion) | Free, output royalty-free | ✅ yes | ❌ **GUI-only, no CLI** | humanoid only | Great quality (19-joint + fingers) but can't headless-automate → defeats the 99%-automation goal. |
| **Auto-Rig Pro** (Blender) | **Paid** (~$40) | ✅ yes | partial (Blender) | humanoid/some | Not free → out. |
| **Mixamo** | Free | ✅ yes | ❌ web-only | humanoid only | The current manual blocker. |

## Decision: **UniRig**

- **Free for our purposes** — MIT, commercial-safe.
- **Fully CLI** → drops into our serial-queue pipeline like Hunyuan/ACE-Step.
- **8 GB-fit**, and from the **same lab as Hunyuan3D** (Tripo/VAST-AI) — the meshes our
  `image_to_3d_hq.ps1` already produces feed straight in.
- Rigs **dragons and bosses too**, not just humanoids — Mixamo couldn't.

### The pipeline becomes 99% automated
```
Flux image → Hunyuan3D mesh → UniRig (skeleton + skinning, CLI) → rigged FBX/GLB
           → [animation clips] → game assets/<name>_animated.glb  (?glb=1 swap, wired)
```

### The one remaining gap: animation *clips*
UniRig produces the **rig + skin weights**, not idle/walk/attack *animations* (Mixamo gave
both). To stay free + automated, retarget a **free clip library onto the UniRig skeleton**:
- **Mixamo clips are free for commercial use** — download the ~10 clips once (one-time, not
  per-character) and **retarget** them onto each UniRig-rigged hero via Blender's retarget
  (or Rokoko's free Blender plugin / Auto-Rig Pro remap). Retargeting *is* scriptable.
- Or use **CMU mocap / AMASS**-derived clips (free) retargeted the same way.

So: **UniRig for rigging (fully automated), one-time clip library + scripted retarget for
animation.** No per-hero manual step.

> Status: UniRig **selected + installed, imports clean** (`scripts\3d\install_unirig.ps1`).
> Working stack in `tools\unirig\venv`: torch 2.4.1+cu121, **spconv-cu121** (the cu120 wheel
> DLL-load-failed — use cu121 and add `os.add_dll_directory(<torch>/lib)` before importing spconv),
> trimesh/transformers/lightning, CLI scripts present. `flash_attn` excluded (needs MSVC, optional).
> **Next:** functional rig test — `generate_skeleton → generate_skin → merge` on a Hunyuan mesh
> (e.g. `monk_hy_game.glb`), then retarget a free clip set for animation. Run serially (GPU), keep
> C: above ~15 GB free.
