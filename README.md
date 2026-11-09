# ApexPulse XR • Seated Spatial Motorsport Cockpit & Counterfactual Pit-Wall

> **Built for the Meta Horizon / Immersive Web SDK (IWSDK) Competition**  
> **Track**: Gaming / Entertainment & Sports Telemetry • **Runtime**: `@iwsdk/core@^0.5.3` + Three.js r181 + EliCS v3.4.2 + Spatial UIKitML (`@drawcall/uikitml`)  
> **Target Hardware**: Meta Quest 3 / 3S Mixed Reality Passthrough + Desktop WebXR Simulator (`iwer`)

---

## 1. Overview & Core Loop

**ApexPulse XR** turns any chair, sofa, or desk into a **controllerless Mixed Reality Formula 1 Pit-Wall and 1:1 FIA Halo Cockpit**. Instead of passively watching flat 2D race telemetry, players step into a **3-Stage Counterfactual Race Strategist Loop**:

1. **The Turn 4 Dirty-Air Lockup Hook (`t = 22.8s`)**: The session boots 3.0 seconds before a high-stakes overtake duel at Turn 4 Hairpin. Car A gets boxed into Car B's turbulent aero wake (`38%` downforce loss) and locks its front-left tire into a volumetric smoke cloud.
2. **Elastic Bowstring Time-Rewind & Counterfactual Forking**: Pinch the frozen car or lockup plume and pull backward (`0–12cm`) to scrub time back to `19.6s`. Tilt your bare palm (or dial the **Brake Offset** and **Apex Line Shift** controls) to sculpt a clean-air switchback trajectory while keeping peak load inside **Kamm's 3D Friction Dome** (`< 96%` tire grip).
3. **1:1 First-Person FIA Halo Cockpit Transition**: Pull Car A toward your visor (`< 0.24m`)—or tap the **1:1 Halo Cockpit** button—to snap inside the **1:1 FIA Titanium Halo Cockpit** for a 7.5-second first-person overtake duel with two-hand Air-Yoke steering, pinch paddle-shifts, 10-LED RPM shift lights, and spatial Doppler engine audio.

---

## 2. How ApexPulse XR Meets All Meta / IWSDK Devpost Criteria

| Hackathon Requirement / Judging Pillar | How ApexPulse XR Fulfils It |
| :--- | :--- |
| **Built with Immersive Web SDK (`@iwsdk/core`)** | Uses `World.create`, `iwsdk.project.v1` ([`iwsdk.config.json`](./iwsdk.config.json)), `iwsdk.scene.v1` ([`public/scenes/main.iwsdk.scene.json`](./public/scenes/main.iwsdk.scene.json)), 11 EliCS systems, `AssetType.UIKitML` ([`public/ui/apexpulse-hud.uikitml`](./public/ui/apexpulse-hud.uikitml)), `PokeInteractable`, `RayInteractable`, `OneHandGrabbable`, and `DistanceGrabbable`. |
| **100% Hands-First Controllerless UX** | Every interaction works end-to-end without controllers: direct index-finger poke on 3D micro-pucks & scrubber segments, pinch-pull Elastic Time-Rewind, bare-palm pitch/roll chassis puppeteering, visor-pull (`< 0.24m`) scale transition, and a **650ms Eyes-Only Gaze-Dwell** accessibility mode. |
| **Seated-Optimized Ergonomic Envelope** | [`SeatedCockpitSystem`](./src/systems/SeatedCockpitSystem.ts) anchors all 5 spatial zones within a comfortable `0.28m–0.58m` reach radius and `±0.28m` lateral envelope with a `20°` yaw deadband—zero roomscale walking required. |
| **Originality & Technical Depth** | Zero-allocation 11-system ECS architecture with a deterministic Catmull-Rom spline physics kernel, Kamm friction circle solver, Nash-equilibrium aero wake game-theory evaluator, and procedural WebAudio spatial Doppler + tire-scrub synthesis (zero external MP3/GLB dependencies). |

---

## 3. Architecture (11 Zero-Allocation ECS Systems)

```
src/
├── index.ts                                  # IWSDK World bootstrap, 5 spatial zones & bindings
├── assets.ts                                 # Critical UIKitML spatial HUD asset manifest
├── components.ts                             # EliCS components (SeatedEnvelopeNode, HandsFirstNode, etc.)
├── audio/SpatialDopplerAudio.ts              # Procedural HRTF 3D Doppler V6 + tire-scrub WebAudio synth
├── telemetry/CircuitTelemetryEngine.ts       # Deterministic 60s closed-loop spline & telemetry solver
├── ui/BroadcastCockpitOverlay.ts             # Synchronized 2D Pit-Wall & 1:1 Driver Visor HUD
└── systems/
    ├── SeatedCockpitSystem.ts                # Spherical seated reach-envelope & yaw deadband solver
    ├── HandsFirstInteractionSystem.ts        # Controllerless poke, grab, distance-pull & 650ms gaze-dwell
    ├── TelemetryScrubSystem.ts               # Real-time car kinematics, G-vectors & tire thermal bay
    ├── SpatialAIRaceEngineerSystem.ts        # Deictic 3D ghost-tube delta comparison & spoken radio
    ├── CounterfactualForkSystem.ts           # What-If trajectory solver & 3D Kamm Friction Dome
    ├── StrategistChallengeSystem.ts          # 3-Stage medal loop, ELO rating & 14-day streak storage
    ├── AeroGameTheoryDuelSystem.ts           # Dirty-air wake turbulence & Nash equilibrium solver
    ├── BareHandChassisPuppetSystem.ts        # Bare-palm pitch/roll chassis tilt & contact-patch rings
    ├── TimeLoopAndEnvironmentSystem.ts       # Turn 4 freeze-frame hook, elastic rewind & XR hit-test
    ├── SpatialHaloCockpitSystem.ts           # 1:1 FIA Halo Cockpit, Air-Yoke steering & 7.5s duel
    └── WinnerPolishSystem.ts                 # 3D Bezier telemetry tethers, 2x scale & voice commands
```

---

## 4. Quick Start (Local Development & Meta Quest 3)

### Prerequisites
- **Node.js**: `v20.19.0+` (or `v22+`)

### Install & Run
```bash
npm install
npm run dev
```
- Open **`http://localhost:5174/`** in Chrome/Edge (or on Meta Quest Browser via `adb reverse tcp:5174 tcp:5174`).
- Click **`Enter XR`** at the top center to launch the **Meta Quest 3 IWER Emulator** (or Mixed Reality Passthrough on headset).

### Production Build
```bash
npm run build
npm run preview
```

---

## 5. Controls & Interaction Guide

### In Meta Quest 3 Mixed Reality (Hands-First)
- **Pinch & Pull Car A (`< 24cm` to visor)**: Snap into the **1:1 First-Person FIA Halo Cockpit**.
- **Pinch & Pull Turn 4 Lockup Plume backward (`0–12cm`)**: Elastic Time-Rewind from `22.8s` to `19.6s`.
- **Direct Poke on Right Console Micro-Pucks**:
  - **Cyan Puck**: Step Brake Offset (`-4.0m` to `+16.5m`)
  - **Purple Puck**: Step Apex Line Shift (`-2.6m` to `+2.4m`)
  - **Gold Puck**: Simulate 14-Day Pro Career Streak (`ELO 1,920`)
  - **Emerald Puck**: Toggle `1:1 FIA Halo Cockpit` / `Macro Pit-Wall`
- **Poke Amber Sector Beacons**: Run Deictic AI Race Engineer analysis on Sector 1, Turn 4, or Sector 3.

### Desktop / Judge Rapid-Testing Shortcuts
- **`Space`**: Rewind & Execute Counterfactual What-If Fork
- **`H`**: Toggle **1:1 First-Person FIA Halo Cockpit** vs **Macro Pit-Wall**
- **`Q` / `E`**: Downshift / Upshift in 1:1 Halo Cockpit
- **`A` / `D` (or `←` / `→`)**: Steer F1 Air-Yoke Left / Right
- **`J`**: Trigger 14-Day Judge Career Streak Preview (`ELO 1,920`, `8/9` Stars)
- **`R` / Right-Click Drag**: Orbit / Reset Desktop Seated Camera
- **`Tab`**: Toggle 2D Broadcast Telemetry Overlay

---

## 6. License

Released under the [MIT License](./LICENSE).
