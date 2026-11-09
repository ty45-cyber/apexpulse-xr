# Devpost Submission Kit — ApexPulse XR

Use this ready-to-copy guide and checklist to complete your **Devpost** submission for the Meta Horizon / Immersive Web SDK (IWSDK) hackathon.

---

## 1. Devpost Submission Checklist Status

| Requirement | Status | Details |
| :--- | :---: | :--- |
| **Built with `@iwsdk/core` (`v0.5.3`)** | ✅ Ready | Validated `iwsdk.project.v1` manifest, `iwsdk.scene.v1` scene, `AssetType.UIKitML` spatial HUD, and 11 EliCS systems. |
| **Hands-First Controllerless UX** | ✅ Ready | Full bare-hand poke, pinch-grab, distance-pull, elastic time-rewind, two-hand Air-Yoke steering, and 650ms gaze-dwell accessibility fallback. |
| **Seated-Optimized Design** | ✅ Ready | All 5 spatial zones stay within `0.28m–0.58m` reach radius (`SeatedCockpitSystem`). |
| **Clean Production Build (`dist/`)** | ✅ Ready | `npm run build` (`tsc && vite build`) compiles cleanly with 0 TypeScript or UIKitML errors. |
| **GitHub Repository + `README.md` + `LICENSE`** | ✅ Ready | `README.md`, `LICENSE` (MIT), `vercel.json`, and `.github/workflows/deploy-pages.yml` included. |
| **High-Res Screenshots** | ✅ Ready | Generated in `public/screenshots/macro-pitwall.png` and `public/screenshots/halo-cockpit.png`. |
| **Playable Hosted URL (GitHub Pages / Vercel)** | ⚠️ Action Needed | Push the latest commit to `https://github.com/ty45-cyber/apexpulse-xr` and enable GitHub Pages (Actions) or connect to Vercel. |
| **< 3-Minute Demo Video (YouTube / Vimeo)** | ⚠️ Action Needed | Record a 90–150s screen capture of the app (script provided in Section 3 below) and upload to YouTube/Vimeo. |

---

## 2. Copy-Paste Devpost Form Fields

### Project Name
`ApexPulse XR — Seated Spatial Motorsport Cockpit & Counterfactual Pit-Wall`

### Elevator Pitch / Tagline (Max 200 characters)
`Rewind F1 crashes with your bare hands, sculpt counterfactual racing lines inside Kamm's 3D friction dome, and pull the miniature car to your visor to drive the 1:1 FIA Halo overtake in Mixed Reality.`

### Recommended Track & Metadata
- **Primary Track**: Gaming / Entertainment
- **Build Path**: Immersive Web SDK (IWSDK / WebXR)
- **Target Device**: Meta Quest 3 / 3S (Mixed Reality Passthrough + Hand Tracking + WebXR Hit-Test)

### Full Project Description (Copy-Paste Markdown for Devpost)

#### Inspiration
Formula 1 races are decided by milliseconds and invisible physics—dirty-air aerodynamic wake, Kamm's friction circle, and trail-braking geometry. On a flat 2D screen, telemetry is a wall of spreadsheets. We asked: *What if any chair in your living room could become an interactive Mixed Reality F1 Pit-Wall where you can freeze a crash in 3D space, pull time backward like a bowstring with your bare hands, test a "What-If" overtake line, and physically pull the miniature race car toward your eyes to drive the 1:1 FIA Halo Cockpit yourself?*

#### What It Does
**ApexPulse XR** is a controllerless, seated Mixed Reality motorsport strategy & cockpit experience built on Meta's **Immersive Web SDK (`@iwsdk/core`)**:
1. **3-Second Freeze-Frame Hook**: The session launches right into the heat of a lap—3 seconds before Car A suffers a front-left tire lockup at Turn 4 Hairpin inside Car B's turbulent wake.
2. **Elastic Bowstring Time-Rewind**: Pinch the frozen car or volumetric smoke cloud and pull your hand backward (`0–12cm`) to scrub time back to corner entry while tilting your palm to aim a clean-air switchback vector.
3. **3-Stage "Beat the Race Strategist" Loop & 3D Kamm Friction Dome**: Dial **Brake Offset (`m`)** and **Apex Line Shift (`m`)** across 3 circuit stages (Turn 4 Hairpin, Sector 1 Uphill Esses, Sector 3 Banked Sweeper) to beat Gold delta targets without breaching the 3D wireframe Kamm tire-grip dome.
4. **Visor-Pull Transition to 1:1 FIA Halo Cockpit**: Grab Car A and pull it within `24cm` of your headset visor (or tap the **1:1 Halo Cockpit** button) to seamlessly transition from the 1:35 tabletop diorama into a **1:1 First-Person FIA Titanium Halo Cockpit**, complete with two-hand Air-Yoke steering, pinch paddle shifts, 10 shift-light LEDs, and a 7.5-second overtake duel.

#### How We Built It
- **Immersive Web SDK (`@iwsdk/core@^0.5.3`) & EliCS**: Engineered 11 modular, zero-allocation ECS systems managing spherical seated ergonomics (`SeatedCockpitSystem`), hands-first poke/grab/distance-pull/gaze-dwell (`HandsFirstInteractionSystem`), spline physics (`TelemetryScrubSystem`), counterfactual simulation (`CounterfactualForkSystem`), and aero game-theory (`AeroGameTheoryDuelSystem`).
- **3D Spatial UI (`@drawcall/uikitml`) + Broadcast HUD**: Built a diegetic MSDF 3D scoreboard (`apexpulse-hud.uikitml`) paired with a synchronized desktop/simulator broadcast overlay.
- **100% Procedural Geometry & Spatial WebAudio**: All 3D F1 cars, speed-heatmap circuit ribbons, Kamm friction domes, FIA Halo arches, and HRTF 3D Doppler V6 hybrid engine + tire-scrub synthesizers (`SpatialDopplerAudio`) are generated procedurally in TypeScript—resulting in instant load times and zero external asset failures.

#### Challenges We Ran Into
- **Coordinate-Space Alignment Between Local Track Splines and World-Space XR Entities**: Ensuring miniature F1 cars, ghost fork cars, and dirty-air wake ribbons oriented accurately along a 3D Catmull-Rom circuit while parenting cleanly under a spring-stabilized `SeatedEnvelopeNode`.
- **Seamless Dual-Scale Transition (1:35 Tabletop to 1:1 Halo Cockpit)**: Isolating scene visibility and camera-pose tracking so switching between the Macro Pit-Wall and the 1:1 Driver Visor feels instantaneous and nausea-free while seated.

#### Accomplishments That We're Proud Of
- **Zero-Controller End-to-End Playability**: Every feature—from scrubbing 60-second telemetry and sculpting corner apexes to steering the 1:1 Air-Yoke—works with bare hands (plus a 650ms eyes-only gaze-dwell mode for accessibility).
- **Real Physics, Not Canned Animations**: The Kamm friction ellipse, trail-braking entry speed delta, and dirty-air wake penalty dynamically compute whether your chosen line earns a 3-Star Gold overtake or skids into the runoff.

#### What's Next for ApexPulse XR
- **Live OpenF1 Telemetry Ingestion**: Stream real-world Grand Prix telemetry laps directly into the 3D tabletop diorama.
- **Co-Located Multiplayer Pit-Wall**: Allow two Quest 3 users in the same room to co-analyze and race counterfactual ghost forks head-to-head.

---

## 3. 2-Minute Demo Video Script (Required by Devpost: < 3 Minutes)

1. **`0:00 – 0:20` • The Hook (Turn 4 Dirty-Air Lockup)**:
   - Launch `http://localhost:5174/`. Show the 3D Tabletop Circuit Diorama, Kamm Friction Dome, AI Drone, and 3D UIKitML Scoreboard.
   - At `t = 22.8s`, point out the automatic **Turn 4 Dirty-Air Lockup Freeze-Frame** and crimson alert banner.
2. **`0:20 – 0:55` • Counterfactual Fork & Kamm Friction Dome**:
   - Adjust the **Brake Offset** (`+7.0m`) and **Apex Line** (`-1.5m`) sliders (or poke the Cyan/Purple 3D console pucks) and trigger **Run Fork (`Space`)**.
   - Show the golden clean-air trajectory ribbon, the cyan force vector staying inside the emerald **Kamm Friction Dome (`89% Grip`)**, and the **3-Star Gold (`-0.149s`)** verdict!
   - Also demonstrate over-braking (`+15.0m`) to show a **Crimson Kamm Traction Breach (`>100% Grip`)**.
3. **`0:55 – 1:35` • 1:1 First-Person FIA Halo Cockpit Overtake**:
   - Click **1:1 Halo Cockpit (`H`)** (or pull Car A toward the camera/visor in XR).
   - Show the **1:1 FIA Titanium Halo**, OLED Air-Yoke steering wheel (`A`/`D`), 15-LED RPM shift bar + paddle shifts (`Q`/`E`), rushing red-and-white kerbs, and overtaking Rival Car B during the 7.5s duel.
4. **`1:35 – 2:00` • 3-Stage Career Loop, 2x Scale & Meta Quest 3 XR Mode**:
   - Trigger **14D Pro (`J`)** to showcase the 14-Day Career Streak (`ELO 1,920`), toggle **2x Scale**, and click **Enter XR** to show the Meta Quest 3 WebXR session.
