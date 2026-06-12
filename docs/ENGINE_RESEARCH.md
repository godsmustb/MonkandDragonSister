# Engine Research: Third-Person Action RPG — 2026 Landscape

> Prepared by: Research & Strategy Department
> Date: June 2026
> Scope: Evaluate engines for "The Monk & The Dragon Sister" — current release and 2026 roadmap

---

## 1. Critical Legal Note (Read First)

"Using an engine's starter code as a base" means one of two things legally:

- **Correct:** Build your game *inside* that engine under its license. Use architectural patterns, node hierarchies, and system designs as inspiration.
- **Incorrect / Infringing:** Copy-paste engine source code, template scripts, or example assets into a codebase governed by a different license.

Lyra (UE5), Unity's Starter Assets, and Godot's demo projects are all licensed for use *within their respective engines*. None may be extracted wholesale into our Three.js codebase or any other engine's project. When we port, we port from scratch — informed by those architectures, not cloning their code.

---

## 2. Engine Profiles

### 2.1 Unreal Engine 5

**Strengths for Third-Person RPG**
- Lumen global illumination + Nanite virtualized geometry = near-photorealistic environments out of the box
- MetaHuman Creator for high-fidelity characters; robust IK retargeting
- Chaos physics, Niagara VFX, World Partition for large open worlds
- Lyra Starter Game provides a complete modular gameplay framework (ability system, input, UI, team/game mode management) as a learning reference and starting point *inside UE5*

**Licensing / Royalties (2026)**
- Free to use, free to ship, zero royalty until $1 million USD cumulative gross revenue
- 5% royalty on revenue above $1 million per product
- Lyra assets are "UE-Only Content" — licensed for use only within Unreal Engine projects

**Web Deploy Story**
- Poor. UE5 Pixel Streaming pushes a server-rendered video stream to browsers — requires cloud GPU infrastructure. Pixel Streaming latency and bandwidth cost make it unsuitable as a zero-install distribution channel
- No native WebAssembly/WebGL export as of mid-2026

**Asset Store Ecosystem**
- Fab.com (merged Unreal Marketplace, Quixel, ArtStation Marketplace, Sketchfab) — enormous, thousands of anime/stylized packs
- Quixel Megascans library free with UE5

**Learning Curve**
- High. C++ core with Blueprint visual scripting. Large project compile times. Requires powerful hardware (32 GB RAM recommended, NVMe SSD essential)

**Co-op / Splitscreen**
- First-class: Unreal's Player Controller / Viewport client system supports local splitscreen natively
- Dedicated server, listen server, and peer-to-peer all supported out of the box

---

### 2.2 Unity 6 (LTS)

**Strengths for Third-Person RPG**
- Starter Assets: Third-Person Controller (URP, free) — solid reference for character locomotion, Cinemachine camera rig, Input System
- HDRP for high-fidelity; URP for performance balance
- Strong animation tooling: Animator, Animation Rigging package, Timeline
- Largest third-party asset store of any engine

**Licensing / Royalties (2026)**
- Runtime Fee: canceled for all gaming customers (announced September 2024, effective immediately)
- Unity Personal: free for studios earning under $200,000/year
- Unity Pro: ~$2,200/seat/year (5% price increase applied January 2026) for studios $200K–$25M/year
- Note: Unity reintroduced a runtime fee concept through its "Industry" license tier only — this does not affect game developers

**Web Deploy Story**
- WebGL build target is mature and widely used
- Unity 6 WebGL export works well for URP projects; HDRP is unsupported on WebGL
- Initial load size is large (often 20–60 MB compressed); playable in browser but not lightweight

**Asset Store Ecosystem**
- Unity Asset Store: the largest in the industry, with deep anime/stylized content libraries
- Third-person controllers, combat systems, dialogue systems all have mature paid options

**Learning Curve**
- Moderate. C# scripting, large Editor surface area. Better documentation than Godot, better approachability than UE5

**Co-op / Splitscreen**
- Netcode for GameObjects (NGO) is the official multiplayer solution; Mirror and Fish-Net are popular community alternatives
- Local splitscreen requires manual camera/viewport setup — no built-in splitscreen toggle

---

### 2.3 Godot 4.x (MIT)

**Strengths for Third-Person RPG**
- MIT license — zero royalties, zero fees, forever, including commercial products
- GDScript (Python-like) lowers the barrier; C# .NET support for performance-critical systems
- Third-person controller demos and Asset Library plugins available under MIT/CC-By licenses
- AnimationTree, IK, ragdoll, and CharacterBody3D cover our gameplay needs
- Active 2026 development: Godot 4.5+ multiplayer replication (MultiplayerSynchronizer, MultiplayerSpawner) is production-ready for co-op games

**Licensing / Royalties**
- MIT license on the engine itself. Your game code is yours. No revenue share, no seat fees, no royalty triggers — ever.

**Web Deploy Story**
- Godot 4's HTML5/WebAssembly export is functional but requires optimization work for 3D titles
- Key constraints: initial WASM + PCK bundle is large by default; "Basis Universal" texture compression and the Compatibility renderer (not Forward+) are required for good browser performance
- Works — but will not match the raw Three.js browser footprint we have today
- SharedArrayBuffer requirement means games must be served with specific HTTPS headers (COEP/COOP)

**Asset Store Ecosystem**
- Godot Asset Library (godotengine.org/asset-library) is smaller than Unity's but growing rapidly
- Most assets are free/open-source; paid pipeline less mature
- Third-party: itch.io, GitHub, GDQuest provide quality free plugins

**Learning Curve**
- Low-to-moderate. GDScript is readable; scene/node model is intuitive. Weakest area: rendering pipeline documentation is thinner than Unity/UE5

**Co-op / Splitscreen**
- Local splitscreen: SubViewport nodes per player — straightforward to implement
- Online co-op: built-in high-level multiplayer API; GodotSteam for Steam Networking Sockets; GD-Sync as a hosted solution

---

### 2.4 Three.js / React Three Fiber

**Strengths**
- Zero-install browser distribution — our current distribution edge
- We already have a working build shipping this weekend
- Full control over rendering pipeline; no engine abstraction layer
- React Three Fiber adds declarative scene management and hooks
- Splitscreen via multiple WebGL viewports or scissor rendering — our current implementation

**Limitations**
- Not a game engine: no built-in scene editor, physics is external (Rapier/Cannon.js), audio is Web Audio API manual wiring, no animation state machine (must use mixer + custom FSM)
- Multiplayer requires Socket.io / WebRTC from scratch
- Asset pipeline is entirely DIY; no node-based editor, no prefab system
- Team velocity stays low as complexity scales — every system is hand-rolled

**Licensing**
- Three.js: MIT. React Three Fiber: MIT. No fees.

**Web Deploy**
- Native browser. Our current deployment model. Unbeatable for zero-friction play.

---

### 2.5 Babylon.js

**Strengths**
- Full game engine philosophy ("batteries included"): built-in PBR, physics (Havok WebAssembly integration), audio, XR, post-processing pipeline, GUI
- Microsoft-backed; strong enterprise stability signal
- Inspector tool makes it the most debuggable web 3D engine
- Better out-of-box post-processing than Three.js (bloom, tone mapping, SSAO all in one import)

**Limitations**
- Smaller community than Three.js; fewer anime/stylized tutorials
- No visual scene editor (Babylon Editor exists but is not widely used)
- Bundle size larger than Three.js for minimal use cases

**Licensing**
- Apache 2.0. Free for commercial use, no royalties.

**Web Deploy**
- Native browser WebGL/WebGPU. Strong mobile performance.

---

### 2.6 PlayCanvas

**Strengths**
- Browser-based visual editor — no local install required for development
- Real-time collaborative editing (like Figma for 3D games)
- Optimized for team workflows with non-technical contributors
- Good mobile WebGL performance

**Limitations**
- Cloud-first editor can be a bottleneck for complex offline development
- Asset store is modest compared to Unity/UE5
- Physics, audio, and animation tooling less mature than Babylon.js

**Licensing**
- PlayCanvas Engine: MIT (open-source). PlayCanvas Editor: free tier available; paid plans for larger teams/private projects

**Web Deploy**
- First-class browser publishing. CDN-hosted builds available.

---

### 2.7 Rosebud AI

**What It Is**
- AI-assisted game generation platform: describe a game in natural language, AI scaffolds code and assets
- Primarily targets 2D and simple 3D prototypes
- Output is a Three.js / JavaScript scaffold, not a standalone engine

**For Our Use Case**
- Not suitable as a primary engine for a combat RPG with custom IK, split-screen, and designed combat systems
- Best evaluated as an ideation/rapid-prototype tool for level concept sketching, not production use

**Licensing**
- Proprietary SaaS; generated code may have usage restrictions — check terms before using output in commercial products

---

### 2.8 Needle Engine

**What It Is**
- Unity-to-web bridge: author in Unity, export to a Three.js-based web runtime
- Enables use of Unity's editor, animation tools, and asset pipeline while targeting the browser
- Relevant if the team is comfortable in Unity but needs web distribution

**Strengths**
- Best of both worlds for Unity developers targeting web
- Good glTF/GLB pipeline; supports compression, lightmaps, animations

**Limitations**
- Depends on Unity license (seat costs apply above Personal tier thresholds)
- Additional licensing cost for Needle itself (commercial plans required for revenue-generating projects)
- Two-layer abstraction (Unity + Needle runtime) can create debugging complexity

**Web Deploy**
- Core strength: produces lightweight Three.js-based bundles from Unity scenes

---

### 2.9 Wonderland Engine

**What It Is**
- High-performance web 3D engine purpose-built for WebXR (VR/AR), with a custom scene editor
- Component-based; TypeScript scripting
- Very fast runtime — minimal legacy overhead

**For Our Use Case**
- Strong WebXR story is not our priority
- Smaller community; fewer third-person action game references
- Viable niche choice if VR support becomes a future goal

**Licensing**
- Free for personal/indie use; commercial license required for revenue-generating products

---

## 3. Recommendation Matrix

| Engine | RPG Strength | Royalty | Web Deploy | Asset Ecosystem | Learning Curve | Co-op/Split |
|---|---|---|---|---|---|---|
| Unreal Engine 5 | ★★★★★ | 5% above $1M | Poor (Pixel Streaming only) | ★★★★★ | High | Native |
| Unity 6 | ★★★★ | None (canceled) | Good (WebGL URP) | ★★★★★ | Moderate | Manual |
| **Godot 4** | **★★★★** | **None (MIT)** | **Good (needs optimization)** | **★★★** | **Low-Moderate** | **Good** |
| Three.js / R3F | ★★ | None | Native/best | ★★ | Moderate (DIY) | Manual |
| Babylon.js | ★★★ | None | Native | ★★ | Moderate | Manual |
| PlayCanvas | ★★ | None | Native | ★★ | Low | Manual |
| Needle Engine | ★★★ | None (engine MIT) | Native | ★★★ (via Unity) | Moderate | Manual |
| Wonderland | ★★ | Commercial fee | Native | ★ | Moderate | Manual |
| Rosebud AI | ★ | SaaS terms | Native | N/A | Very Low | No |

---

## 4. Our Position and Recommendation

### This Weekend — Stay on Three.js
Zero-install browser play is our distribution moat. No other option lets a player click a link and play in 5 seconds with no download. Preserving this for the v1.0 launch is non-negotiable.

### Q3 2026 — Prototype Godot 4 Port
Godot 4 is the correct next engine for "The Monk & The Dragon Sister" full release:
- MIT license eliminates all royalty and seat-fee risk as revenue scales
- GDScript is learnable quickly; our existing game logic (state machines, combat, IK) translates directly
- Third-person controllers, animation trees, and local splitscreen are all solved problems in Godot's ecosystem
- Web export is viable (with Compatibility renderer) for a future hybrid distribution strategy
- Online co-op evaluation (v2.0 scope) is supported via built-in networking + GodotSteam

### Stretch / Team Growth — Unreal Engine 5
If the studio grows to 5+ people, adds a dedicated technical artist, and targets console or high-end PC distribution, UE5's visual ceiling and Fab.com asset library justify the learning investment. The 5% royalty only triggers at $1M — not a near-term concern.

### Unity — Watch and Wait
The runtime-fee saga damaged community trust. Unity 6 is technically sound and the asset store is unmatched, but we gain nothing over Godot 4 that justifies the seat cost risk or the goodwill deficit with the indie audience we are targeting.
