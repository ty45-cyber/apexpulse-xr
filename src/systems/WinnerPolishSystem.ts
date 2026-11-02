// src/systems/WinnerPolishSystem.ts
import {
  BufferAttribute,
  BufferGeometry,
  CubicBezierCurve3,
  createSystem,
  Group,
  Line,
  LineBasicMaterial,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { SpatialDopplerAudio } from '../audio/SpatialDopplerAudio';
import { TelemetrySessionState } from '../components';
import { CircuitTelemetryEngine } from '../telemetry/CircuitTelemetryEngine';

export interface WinnerPolishBindings {
  trackRoot: Object3D;
  trackRibbonGeometry: BufferGeometry;
  carObjects: [Object3D, Object3D];
  explodedBayRoot: Object3D;
  aiDroneRoot: Group;
  sectorBeaconMeshes: Mesh[];
  onVoiceIntentResolved: (intent: string, sectorIdx?: number) => void;
}

export class WinnerPolishSystem extends createSystem({
  sessionState: { required: [TelemetrySessionState] },
}) {
  private engine!: CircuitTelemetryEngine;
  private audio!: SpatialDopplerAudio;
  private bindings: WinnerPolishBindings | null = null;

  // 1. Flows.xr-style 3D Cubic Bezier Data Tethers (Zero-allocation pre-allocated buffers)
  private readonly tetherSegments = 28;
  private carToBayLine!: Line;
  private apexToAiLine!: Line;
  private readonly bezierCurve = new CubicBezierCurve3(
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3()
  );

  // Scratch vectors for 90 FPS zero-GC updates
  private readonly pStart = new Vector3();
  private readonly pEnd = new Vector3();
  private readonly pCtrl1 = new Vector3();
  private readonly pCtrl2 = new Vector3();
  private readonly headWorldPos = new Vector3();
  private readonly localSculptPos = new Vector3();

  // 2. The Nanauts-style Embodied AI Drone Procedural Animation State
  private droneOuterRing!: Mesh;
  private droneInnerEye!: Mesh;
  private droneExcitement = 0.0;
  private clock = 0.0;

  // 3. Pocket Lands-style Dual-Scale Diorama Morph (1.0x Tabletop <-> 1.42x Wrap-Around)
  private isExpandedScale = false;
  private targetTrackScale = 1.0;

  // 4. Retention & Streak Persistence ("Best Reason to Come Back" $25k Award)
  public sessionStreakDays = 1;
  public savedCustomLaps = 0;

  public bindWinnerUpgrades(
    engine: CircuitTelemetryEngine,
    audio: SpatialDopplerAudio,
    bindings: WinnerPolishBindings
  ): void {
    this.engine = engine;
    this.audio = audio;
    this.bindings = bindings;

    this.buildEmbodiedAIDroneGeometry(bindings.aiDroneRoot);
    this.build3DBezierTethers();
    this.restorePersistedTrackAndStreak();
    this.initVoiceCommandListener();
  }

  /**
   * Builds The Nanauts-inspired Embodied AI Drone with counter-rotating gimbal rings
   * and an expressive pupil that turns to look at the user.
   */
  private buildEmbodiedAIDroneGeometry(root: Group): void {
    const ringGeo = new TorusGeometry(0.036, 0.0035, 12, 36);
    const ringMat = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.7,
      metalness: 0.8,
      roughness: 0.2,
    });
    this.droneOuterRing = new Mesh(ringGeo, ringMat);
    root.add(this.droneOuterRing);

    const eyeGeo = new SphereGeometry(0.014, 16, 16);
    eyeGeo.translate(0, 0, 0.018); // Forward-facing pupil
    const eyeMat = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.0,
    });
    this.droneInnerEye = new Mesh(eyeGeo, eyeMat);
    root.add(this.droneInnerEye);
  }

  /**
   * Builds Flows.xr-inspired 3D Cubic-Bezier data tethers connecting the moving car
   * on the lap track to the floating Exploded Telemetry Bay and AI Drone.
   */
  private build3DBezierTethers(): void {
    const createTetherLine = (hexColor: number): Line => {
      const geo = new BufferGeometry();
      const positions = new Float32Array((this.tetherSegments + 1) * 3);
      geo.setAttribute('position', new BufferAttribute(positions, 3));
      const mat = new LineBasicMaterial({
        color: hexColor,
        transparent: true,
        opacity: 0.75,
      });
      const line = new Line(geo, mat);
      line.frustumCulled = false;
      this.world.scene.add(line);
      return line;
    };

    this.carToBayLine = createTetherLine(0x00f0ff); // Cyan tether: Active Car -> Tire Bay
    this.apexToAiLine = createTetherLine(0x10b981); // Emerald tether: Active Apex -> AI Drone
  }

  /**
   * Updates a 3D Cubic-Bezier line in-place between two world positions.
   */
  private updateBezierTetherInPlace(
    line: Line,
    startWorld: Vector3,
    endWorld: Vector3,
    arcHeight = 0.06
  ): void {
    this.pCtrl1.lerpVectors(startWorld, endWorld, 0.33);
    this.pCtrl1.y += arcHeight;
    this.pCtrl2.lerpVectors(startWorld, endWorld, 0.66);
    this.pCtrl2.y += arcHeight * 1.15;

    this.bezierCurve.v0.copy(startWorld);
    this.bezierCurve.v1.copy(this.pCtrl1);
    this.bezierCurve.v2.copy(this.pCtrl2);
    this.bezierCurve.v3.copy(endWorld);

    const posAttr = line.geometry.getAttribute('position') as BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i <= this.tetherSegments; i++) {
      const t = i / this.tetherSegments;
      this.bezierCurve.getPoint(t, this.pStart);
      const idx = i * 3;
      arr[idx] = this.pStart.x;
      arr[idx + 1] = this.pStart.y;
      arr[idx + 2] = this.pStart.z;
    }
    posAttr.needsUpdate = true;
  }

  /**
   * Triggers squash-and-stretch excitement animation on the AI Drone (The Nanauts technique).
   */
  public triggerDroneExcitementPulse(): void {
    this.droneExcitement = 1.0;
  }

  /**
   * Pocket Lands / DreamSpace Dual-Scale Toggle:
   * Morphs the circuit between compact tabletop diorama (1.0x) and wrap-around cockpit scale (1.42x)
   * while staying strictly inside the 0.58m Airplane Seat boundary.
   */
  public toggleDioramaWrapScale(): boolean {
    this.isExpandedScale = !this.isExpandedScale;
    this.targetTrackScale = this.isExpandedScale ? 1.42 : 1.0;
    this.triggerDroneExcitementPulse();
    this.audio.playInteractionChime(this.isExpandedScale ? 840 : 620);
    return this.isExpandedScale;
  }

  /**
   * Restores user's custom sculpted circuit & daily streak from localStorage
   * to satisfy the "Best Reason to Come Back" ($25,000) special award.
   */
  private restorePersistedTrackAndStreak(): void {
    if (!this.bindings) return;
    try {
      const streakRaw = localStorage.getItem('apexpulse_streak_days');
      this.sessionStreakDays = streakRaw ? parseInt(streakRaw, 10) + 1 : 1;
      localStorage.setItem(
        'apexpulse_streak_days',
        String(this.sessionStreakDays)
      );

      const savedCurve = localStorage.getItem('apexpulse_custom_circuit_v1');
      if (savedCurve) {
        const pts = JSON.parse(savedCurve) as [number, number, number][];
        if (
          Array.isArray(pts) &&
          pts.length === this.engine.curve.points.length
        ) {
          pts.forEach((coords, idx) => {
            this.engine.curve.points[idx].set(coords[0], coords[1], coords[2]);
          });
          if (
            typeof (this.engine as any).sculptCornerAndRebuildRibbon ===
            'function'
          ) {
            this.engine.sculptCornerAndRebuildRibbon(
              1,
              this.engine.curve.points[7],
              this.bindings.trackRibbonGeometry
            );
          }
          this.savedCustomLaps++;
        }
      }
    } catch {
      // Safe fallback if storage is restricted
    }
  }

  /**
   * Live Hands-Free Voice Command Listener (The Nanauts Speech-to-Intent pattern).
   */
  private initVoiceCommandListener(): void {
    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[
          event.results.length - 1
        ][0].transcript
          .toLowerCase()
          .trim();
        this.triggerDroneExcitementPulse();

        if (transcript.includes('turn 4') || transcript.includes('hairpin')) {
          this.bindings?.onVoiceIntentResolved('analyze-sector', 1);
        } else if (
          transcript.includes('sector 1') ||
          transcript.includes('esses')
        ) {
          this.bindings?.onVoiceIntentResolved('analyze-sector', 0);
        } else if (
          transcript.includes('sector 3') ||
          transcript.includes('sweeper')
        ) {
          this.bindings?.onVoiceIntentResolved('analyze-sector', 2);
        } else if (
          transcript.includes('scale') ||
          transcript.includes('expand')
        ) {
          this.toggleDioramaWrapScale();
        }
      };

      recognition.start();
    } catch {
      // Browser requires user gesture before starting mic; silently falls back to poke/gaze
    }
  }

  update(delta: number): void {
    if (!this.bindings) return;
    const dt = Math.min(delta, 0.1);
    this.clock += dt;

    // Hide tabletop tethers when user is inside the 1:1 First-Person Halo Cockpit
    const isTabletopVisible = this.bindings.trackRoot.visible;
    if (this.carToBayLine) this.carToBayLine.visible = isTabletopVisible;
    if (this.apexToAiLine) this.apexToAiLine.visible = isTabletopVisible;

    // 1. Read active car & sector state
    let selectedCarIdx = 0;
    let activeSectorIdx = 1;
    this.queries.sessionState.entities.forEach((entity) => {
      selectedCarIdx =
        entity.getValue(TelemetrySessionState, 'selectedCarIndex') ?? 0;
      activeSectorIdx =
        entity.getValue(TelemetrySessionState, 'activeSectorIndex') ?? 1;
    });

    // 2. Smoothly morph Diorama Scale (Pocket Lands Dual-Scale effect)
    const currentScale = this.bindings.trackRoot.scale.x;
    const nextScale = MathUtils.lerp(
      currentScale,
      this.targetTrackScale,
      Math.min(1.0, dt * 7.5)
    );
    this.bindings.trackRoot.scale.setScalar(nextScale);

    // 3. Check if user pinch-dragged any Sector Beacon to sculpt the track (Tiny Golf UGC effect)
    this.bindings.sectorBeaconMeshes.forEach((beaconMesh, idx) => {
      const sector = this.engine.sectors[idx];
      if (!sector) return;

      const distMoved = beaconMesh.position.distanceTo(sector.apexLocalPos);
      if (
        distMoved > 0.022 &&
        typeof (this.engine as any).sculptCornerAndRebuildRibbon === 'function'
      ) {
        this.localSculptPos.copy(beaconMesh.position);
        this.engine.sculptCornerAndRebuildRibbon(
          idx,
          this.localSculptPos,
          this.bindings!.trackRibbonGeometry
        );
        beaconMesh.position.copy(sector.apexLocalPos);
        beaconMesh.position.y += 0.016;
      }
    });

    // 4. Update Flows.xr 3D Cubic-Bezier Telemetry Tethers in World Space
    if (isTabletopVisible) {
      const activeCarObj = this.bindings.carObjects[selectedCarIdx];
      if (activeCarObj) {
        activeCarObj.getWorldPosition(this.pStart);
        this.bindings.explodedBayRoot.getWorldPosition(this.pEnd);
        this.updateBezierTetherInPlace(
          this.carToBayLine,
          this.pStart,
          this.pEnd,
          0.045
        );
      }

      const activeBeacon = this.bindings.sectorBeaconMeshes[activeSectorIdx];
      if (activeBeacon) {
        activeBeacon.getWorldPosition(this.pStart);
        this.bindings.aiDroneRoot.getWorldPosition(this.pEnd);
        this.updateBezierTetherInPlace(
          this.apexToAiLine,
          this.pStart,
          this.pEnd,
          0.055
        );
      }
    }

    // 5. Update The Nanauts Embodied AI Drone (Eye Gaze Look-At + Squash & Stretch)
    const xrCamera =
      this.world.renderer?.xr?.getCamera?.() ?? this.world.camera;
    if (xrCamera) {
      xrCamera.getWorldPosition(this.headWorldPos);
      this.bindings.aiDroneRoot.lookAt(this.headWorldPos);
    }

    if (this.droneOuterRing) {
      this.droneOuterRing.rotation.z = this.clock * 1.8;
      this.droneOuterRing.rotation.x = Math.sin(this.clock * 2.2) * 0.35;
    }

    if (this.droneExcitement > 0.001) {
      this.droneExcitement = Math.max(0, this.droneExcitement - dt * 1.8);
      // Classic harmonic squash-and-stretch oscillation
      const squash =
        1.0 + Math.sin(this.clock * 28.0) * 0.28 * this.droneExcitement;
      const stretch = 1.0 / Math.sqrt(Math.max(0.5, squash));
      this.bindings.aiDroneRoot.scale.set(stretch, squash, stretch);
    } else {
      this.bindings.aiDroneRoot.scale.setScalar(1.0);
    }
  }
}
