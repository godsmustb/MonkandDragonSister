# 🐉 The Monk & The Dragon Sister

### *Quest I — The Initial Compassion*

A **2-player local co-op** anime action game that runs in your **web browser**. A Japanese Zen garden has been invaded by demons. A wandering **Monk** and his sister — a girl who transforms into **elemental dragons** — fight back across five waves to a two-phase boss. Cel-shaded, bloom-lit, with procedural music that reacts to the battle.

No install, no download, no account. It's a single web page. **Play solo, with an AI partner, or with a friend on the same screen** — and it works on phones too.

> **▶ Play online:** https://slategray-marten-643793.hostingersite.com

---

## 📖 The Story

The garden was a place of stillness — koi in the pond, cherry blossoms on the wind, raked gravel in perfect circles. Then the **Inferno Demon Lord** tore a rift through it and loosed his legions. The Monk will not raise a weapon in anger; he fights to *protect*. His sister carries the old dragon-blood, and when the fighting turns desperate she becomes something elemental and vast. Together they must hold the line through five demon waves — and show even the Demon Lord a measure of compassion.

This is **Quest I** of a planned larger saga. It ends in victory over the Demon Lord and opens into **Endless** survival.

---

## 🦸 The Heroes

| | **The Monk** (Player 1) | **The Dragon Sister** (Player 2) |
|---|---|---|
| **Role** | Support / control | Damage / elemental burst |
| **Style** | Staff combos, shields, healing, meditation | Transforms into 4 elemental dragons |
| **Strength** | Keeps the team alive, controls space | Hits the right elemental weakness for huge damage |

The Sister transforms between **four dragons** — **🔥 Fire, ❄️ Ice, ☠️ Poison, 💧 Water** — each unlocked as you progress. Picking the right element against each demon is the heart of the game.

---

## 🚀 How to Run

### Easiest — play online
Open **https://slategray-marten-643793.hostingersite.com** in any modern browser (desktop or mobile). Done.

### Run it locally (from the project folder)
The game is plain HTML + JavaScript, but it **must be served over `http://`** — opening `index.html` directly as a file will **not** work (browsers block the game's modules on `file://`).

- **Windows:** double-click **`play.bat`**. It finds Python, starts a tiny local web server, and opens the game. Keep the little server window open while you play.
- **Any OS (manual):** in the project folder run
  ```
  python -m http.server 8321
  ```
  then open **http://localhost:8321/index.html** in your browser.

> The whole game (including the 3D engine) is bundled locally — it works **fully offline** once you have the files.

---

## 🎮 Game Modes

Pick from the main menu:

- **1 Player — Solo:** Choose the Monk *or* the Sister and play full-screen on your own.
- **1 Player — AI Partner:** Choose your hero; the computer plays the other one alongside you.
- **2 Players — Split-screen:** Two players, one keyboard, side-by-side views. (The default on desktop.)
- **Endless:** Unlocked after you finish the quest — survive escalating waves for a high score, ending in a **collapsing-arena sudden death**. *In Endless, one death ends the run.*
- **Mobile:** On phones the game runs in **1-Player** mode with on-screen touch controls.

---

## ⌨️ Controls

All keyboard controls are **fully remappable** in **Controls** (main menu *or* the pause screen), and your layout is saved on your device.

### Player 1 — The Monk (default keys)
| Action | Key | | Action | Key |
|---|---|---|---|---|
| Move | **W A S D** | | Heal | **L** |
| Attack (light) | **Space** / **I** | | Jump | **C** |
| Heavy attack | **U** | | Ultimate | **R** |
| Block / Parry | **G** | | Orbit camera | **Q** / **E** |
| Chi shield | **J** | | Lock-on | **F** |
| Dodge | **K** | | | |

### Player 2 — The Dragon Sister (default keys)
> Numpad keys need **Num Lock ON**.

| Action | Key | | Action | Key |
|---|---|---|---|---|
| Move | **Arrow Keys** | | Dodge | **Numpad 5** |
| Attack (light) | **Enter** / **Numpad 8** | | Jump | **Numpad 2** |
| Heavy attack | **Numpad 3** | | Ultimate | **Numpad ✱** |
| Block / Parry | **Numpad 1** | | Orbit camera | **Numpad 7 / 9** |
| Transform dragon | **Numpad 4** | | Lock-on | **Numpad 0** |
| Dragon special | **Numpad 6** | | | |

### Global
| Action | Key |
|---|---|
| Pause | **Esc** |
| Mute / unmute | **M** |

### Mobile / touch
An on-screen **joystick** (move) and **action buttons** appear automatically. **Tap** to dismiss the intro and navigate menus. On the **Controls** screen you can **drag** the button areas to reposition them and **tap** a button to resize it — your custom touch layout is saved per device.

---

## ⚔️ Core Combat

- **Light & Heavy attacks** — light builds quick combos; **heavy** hits ~2× harder with knockback and a satisfying *hitstop* freeze on impact. A 3-hit combo finisher hits hardest.
- **Block & Parry (hold to block, time it to parry)** — holding block cuts incoming damage but drains your **Guard** meter; a *perfectly timed* parry negates the hit and staggers the attacker.
- **Dodge & Jump** — both give brief invincibility (i-frames) to escape telegraphed demon attacks.
- **Lock-on** — softly snaps your facing toward the nearest enemy so attacks land.
- **The Monk's kit** — **Chi Shield** (absorbs hits), **Heal** (restore the team), plus staff control.
- **The Sister's kit** — **Transform** between her four dragons and unleash each one's **Special** (fire dash, frost nova, etc.).

### Two meters to watch
- **Guard** — spent by blocking; recovers over time. Don't turtle forever.
- **Resonance** — fills as you fight. When it's full you can trigger your **Ultimate**.

### The Ultimate ("Shikai" awakening)
Fill **Resonance**, then press your Ultimate key for a ~10-second super-state: **invincible, ~2.5× damage**, with a named on-screen banner. You earn the ability through a mid-quest awakening — save it for boss phases.

---

## 🔁 The Elemental Ring (the most important rule)

Each dragon element beats the next in a ring:

> **💧 Water → 🔥 Fire → ❄️ Ice → ☠️ Poison → 💧 Water**

- Hitting an enemy with the element it's **weak to deals 2× damage**.
- Using the **reverse** (the element it resists) deals only **0.5×**.
- Everything else is normal (1×).

Every demon wave is themed to **punish one dragon and reward its counter** — so transforming to the right element is how you win efficiently.

---

## 🌊 The Quest — 5 Waves

| Wave | Enemy | Element | Counter | Reward on clear |
|---|---|---|---|---|
| **1** | Shadowlings (×3) | Neutral | — | Unlock **🔥 Fire** |
| **2** | Frost Imps (×4) | ❄️ Ice | 🔥 Fire | Unlock **☠️ Poison** + Prayer Beads |
| **3** | Tide Wraiths (×4) | 💧 Water | ☠️ Poison | Unlock **❄️ Ice** + Dragon Pearl |
| **4** | **Venom Oni** (mini-boss) + adds | ☠️ Poison | ❄️ Ice | Unlock **💧 Water** + Saffron Robe |
| **5** | **Inferno Demon Lord** (2-phase final) | 🔥 Fire | 💧 Water | 🏆 **Quest Complete!** |

Bosses have multiple phases with telegraphed attacks, enrage states, and new mechanics each phase — the Venom Oni summons adds; the **Inferno Demon Lord shifts to Ice in his final phase** and drops ground-hazard AoEs. Note the final unlock (**Water**) is exactly what counters the final boss — that's not a coincidence.

Relics you earn (Prayer Beads, Dragon Pearl, Saffron Robe…) **auto-equip** and strengthen your heroes as you go.

---

## 🗺️ The Three Worlds

Beyond the starting garden, later levels transform the battlefield:

1. **🌸 The Zen Garden** — cherry blossoms, koi pond, raked gravel, warm sun.
2. **🏔️ The Glacial Peaks** — a frozen world of snow-laden trees, pale ice-blue skies, and drifting snow.
3. **☠️ The Venom Abyss** — a dark, poisoned place of toxic fog, withered flora, and floating spores.

---

## 🏆 Score & Leaderboards

- You earn **score** from kills (multiplied in Endless) and level-ups; a live **Lv + XP bar** floats under each hero.
- There's a **cross-device leaderboard per stage** — beat your friends' scores and the game will tell you when you've claimed **#1**.
- Endless game-over shows an arcade-style high-score board.

---

## 💡 Tips

- **Match the element.** Against an ice wave, go Fire. Against the final fire boss, go Water. 2× vs 0.5× is a massive swing.
- **The Monk should heal and shield**, not just swing — keeping both heroes alive matters more than raw damage (you share **3 team lives**).
- **Parry the telegraphs.** Big wind-up attacks are parryable for a free stagger.
- **Bank your Ultimate for boss phases**, especially the Demon Lord's enrage.
- **Dodge through** AoE hazards using the i-frames rather than running around them.
- **Use lock-on** so your hits don't whiff past a moving target.

---

## ⚙️ Settings & Accessibility

- **Quality** (menu): *High* (full bloom + anti-aliasing + grade) or *Low* (faster — the default on mobile).
- **Audio: On/Off** and **M** to mute anytime. Music is procedural and adapts to the fight (calmer between waves, darker and faster on boss phases).
- **Remappable controls** for both players, saved on your device.

---

## 🛠️ Tech (for the curious)

A self-contained browser game built in **Three.js** (vendored locally — no external downloads needed). All art, animation, sound, and music are **generated in code** — no image, model, or audio files to load. Runs on desktop (Chrome / Edge / Firefox / Safari) and mobile (iOS Safari, Android Chrome).

*Developers: see [`CLAUDE.md`](CLAUDE.md) for the full architecture, folder structure, and QA/test setup.*

---

*The Monk & The Dragon Sister — **V1.0**. Made with care, one pass at a time.* 🌸
