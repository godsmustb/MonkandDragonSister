# Studio Structure — Operating Model

> "The Monk & The Dragon Sister" Game Studio
> Agent-based department model — each department maps to a Claude model tier and defined responsibilities

---

## Department Overview

```
┌─────────────────────────────────────────────────────────┐
│                    DIRECTION (Fable)                    │
│          Planning · Orchestration · QA Gates            │
└────────────────────┬────────────────────────────────────┘
                     │  Issues design docs to all depts
         ┌───────────┼───────────────┐
         ▼           ▼               ▼
   ┌──────────┐ ┌──────────┐  ┌──────────────┐
   │   ART    │ │  ENG.    │  │  RESEARCH    │
   │ (Opus)   │ │(Sonnet)  │  │  (Sonnet)    │
   └────┬─────┘ └────┬─────┘  └──────────────┘
        │             │
        └──────┬──────┘
               ▼
        ┌─────────────┐
        │     QA      │
        │ (Playwright │
        │  + Opus)    │
        └─────────────┘
```

---

## 1. Direction — Fable (Claude claude-sonnet-4-6 / Orchestrator Tier)

**Role:** Studio Director. Owns the creative vision, project schedule, and pass gate decisions.

**Responsibilities:**
- Write and maintain design docs (the primary handoff artifact between departments)
- Decompose epics into department-scoped tasks with clear acceptance criteria
- Set pass sequence for each feature (Art → Engineering → QA or Engineering-first for systems)
- Review QA reports and decide pass/fail at each gate
- Maintain the ROADMAP and escalate blockers to the Owner
- Final sign-off before any build is promoted to release

**Does NOT do:** Direct code edits, direct asset authoring. Direction orchestrates; it does not implement.

**Key outputs:**
- Design docs (`.md` files per feature/quest/system)
- Sprint briefs (what each department works on this cycle)
- QA gate verdicts (pass / conditional pass / fail with requeue criteria)

---

## 2. Art Department — Opus Agents (Claude Opus Tier)

**Role:** All visual authoring — characters, environments, VFX, UI skin, and cinematics.

**Responsibilities:**
- Read design doc from Direction; execute visual passes as specified
- Character passes: model reference sheets, texture paint specs, rig joint hierarchy docs
- Environment passes: scene layout, lighting setup docs, skybox/horizon layer specs
- VFX passes: particle system parameter sheets, sprite sheet animation specs
- Produce asset delivery specs (file names, poly counts, texture dimensions, export settings)
- Do NOT author final in-engine assets directly — produce specs and source files (`.blend`, `.psd`) for Engineering to integrate

**Pass types:**
1. **Concept Pass** — Rough direction, reference gathering, palette decisions
2. **Production Pass** — Final specs, source files, texture maps
3. **Polish Pass** — Requested by QA or Direction; targeted fixes only

**Handoff artifact:** A design doc update annotated with "ART PASS COMPLETE" + asset list, file paths, and integration notes for Engineering.

---

## 3. Engineering — Sonnet Agents (Claude Sonnet Tier)

**Role:** All code — game systems, rendering, refactors, bug fixes, tooling.

**Responsibilities:**
- Read design doc + Art handoff doc; implement as specified
- Systems work: input, physics, combat, AI, camera, audio, networking
- Refactors: improve architecture without changing behavior (must have QA gate before and after)
- Bug fixes: reproduce, patch, write regression note in fix commit
- Asset integration: import Art Department outputs into the engine (GLB load, texture bind, animation hookup)
- Do NOT make creative decisions outside the design doc scope — flag ambiguity to Direction

**Pass types:**
1. **Systems Pass** — New feature implementation from design doc spec
2. **Refactor Pass** — Structural improvement; no behavior change
3. **Fix Pass** — Targeted bug resolution; minimal surface area

**Handoff artifact:** Updated code with inline comments keyed to the design doc section, plus a brief "ENG PASS COMPLETE" note listing what was implemented, what was deferred, and any design questions raised.

---

## 4. Research — Sonnet Agents (This Department)

**Role:** Strategic intelligence. Answers "should we" and "how best" before the studio commits engineering time.

**Responsibilities:**
- Engine and technology evaluation (see ENGINE_RESEARCH.md)
- Asset licensing research and risk flagging
- Competitive analysis of comparable titles
- Monetization and distribution strategy
- Platform requirement research (Steam Deck compatibility, Web API support, etc.)
- Produce structured recommendation documents for Direction to act on

**Does NOT do:** Make decisions. Research produces recommendations with evidence; Direction decides.

---

## 5. QA — Playwright E2E Harness + Opus Review Gates

**Role:** Independent verification that each pass meets acceptance criteria before promotion.

### 5.1 Automated Layer — Playwright E2E

Playwright drives a headless Chromium instance against the hosted build. Tests run on every Engineering pass completion.

**Test categories:**
- **Smoke tests:** Page loads, no console errors, canvas renders, HUD elements present
- **Input tests:** Keyboard WASD moves player, attack input triggers animation state change, split-screen viewports are correct size
- **Gameplay tests:** Enemy spawns in wave 1, player HP decrements on hit, wave 3 clear triggers win state
- **Regression tests:** Add one test per fixed critical bug to prevent recurrence

**Gate criteria — Playwright must be green before an Opus QA review begins.**

### 5.2 Review Layer — Opus QA Agent

An Opus agent reviews:
- Screenshot comparison (current build vs. last approved build) — flags visual regressions
- Design doc compliance check — does the implemented behavior match the spec?
- Performance spot-check — frame time, memory, any obvious CPU spikes in browser DevTools output
- Produces a structured QA report: PASS / CONDITIONAL / FAIL with specific line-item findings

### 5.3 Gate Outcomes

| Verdict | Meaning | Action |
|---|---|---|
| PASS | All criteria met | Direction promotes build; Engineering closes task |
| CONDITIONAL PASS | Minor issues; no blockers | Engineering fixes listed items; QA re-spot-checks (no full rerun) |
| FAIL | Blocker found | Engineering requeued; full Playwright run + Opus review required after fix |

---

## 6. The Pass-Based Pipeline

Every feature or change flows through this sequence. Stages may be abbreviated for small fixes (Engineering-only passes may skip Art for non-visual changes) but the gate structure is never skipped.

```
Direction writes Design Doc
         │
         ▼
[GATE 0] Does the Design Doc have clear acceptance criteria? 
         No → Direction revises. Yes → continue.
         │
         ▼
Art Department: Concept Pass
         │
[GATE 1] Direction reviews Art concept. Approved? No → Art revises.
         │
         ▼
Art Department: Production Pass (specs + source files)
         │
[GATE 2] Direction reviews Art production artifacts. Approved? No → Art revises.
         │
         ▼
Engineering: Systems Pass (implements from design doc + Art handoff)
         │
[GATE 3] Playwright E2E runs automatically. All green? No → Engineering fixes.
         │
         ▼
QA: Opus screenshot review + design doc compliance check
         │
[GATE 4] QA verdict. PASS → promote. CONDITIONAL → Engineering spot-fix. FAIL → requeue.
         │
         ▼
Direction: Final sign-off → Build promoted to release candidate
```

---

## 7. Design Docs as Handoff Artifacts

Design docs are the studio's communication protocol. They are:

- **The single source of truth** for what a feature is supposed to do
- **Art's brief** — tells Opus agents what to create and to what spec
- **Engineering's spec** — tells Sonnet agents what to build, what inputs to expect, what behavior to implement
- **QA's acceptance criteria** — tells the Playwright harness what to test and the Opus reviewer what to check

**Design doc minimum required sections:**
1. Feature name + version + author + date
2. Player-facing description (what the player experiences)
3. Technical requirements (inputs, outputs, state changes, edge cases)
4. Art requirements (asset names, dimensions, format, animation states needed)
5. Acceptance criteria (explicit, testable "Given / When / Then" statements)
6. Out of scope (explicit list of what this doc does NOT cover)

**Naming convention:** `/docs/design/FEATURE_NAME_v1.md`

---

## 8. Current Staffing (June 2026)

| Department | Current Agent | Notes |
|---|---|---|
| Direction | Fable (claude-sonnet-4-6) | Orchestrator; Owner's primary interface |
| Art | Opus (on-demand) | Invoked per art pass; not running continuously |
| Engineering | Sonnet (on-demand) | Invoked per engineering task |
| Research | Sonnet (on-demand) | This document was produced by Research |
| QA | Playwright + Opus (CI) | Automated layer runs on every push |

The Owner is the human executive above Direction. All strategic decisions, creative pivots, and monetization choices flow from the Owner → Direction → departments.
