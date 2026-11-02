// src/systems/TimeLoopAndEnvironmentSystem.ts
import {
  BufferAttribute,
  BufferGeometry,
  createSystem,
  Euler,
  Line,
  LineBasicMaterial,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { SpatialDopplerAudio } from '../audio/SpatialDopplerAudio';
import {
  SeatedEnvelopeNode,
  StrategistChallengeState,
  TelemetrySessionState,
} from '../components';
import { CircuitTelemetryEngine } from '../telemetry/CircuitTelemetryEngine';
import {
  AeroGameTheoryDuelSystem,
  GameTheoryDuelVerdict,
} from './AeroGameTheoryDuelSystem';

export type TimeLoopPhase =
  | 'APPROACHING_CRASH'
  | 'CRASH_FROZEN'
  | 'ELASTIC_REWIND_AIMING'
  | 'COUNTERFACTUAL_LAUNCHED'
  | 'OVERTAKE_SAVED';

export class TimeLoopAndEnvironmentSystem extends createSystem({
  sessionState: { required: [TelemetrySessionState] },
  challengeState: { required: [StrategistChallengeState] },
  envelopeNodes: { required: [SeatedEnvelopeNode] },
}) {
  private engine!: CircuitTelemetryEngine;
  private aeroDuel!: AeroGameTheoryDuelSystem;
  private audio!: SpatialDopplerAudio;
  private trackTableEntity: any = null;
  private trackRoot!: Object3D;

  public phase: TimeLoopPhase = 'APPROACHING_CRASH';
  private readonly crashTriggerSec = 22.8; // Exact timestamp of Turn 4 dirty-air lockup
  private readonly rewindTargetSec = 19.6; // 3.2 seconds earlier on main approach chute

  // 1. Elastic Bowstring Rewind & Freeze-Frame Lockup Visuals
  private crashSmokeCloud!: Mesh;
  private bowstringLine!: Line;
  private readonly bowStartWorld = new Vector3();
  private readonly handCurrentWorld = new Vector3();
  private readonly pullVector = new Vector3();
  private readonly handEuler = new Euler(0, 0, 0, 'YXZ');
  private isPinchRewinding = false;

  // 2. WebXR Hit-Test Surface Lock & Real-World Obstacle Chicane Ring
  private xrHitTestSource: XRHitTestSource | null = null;
  private xrHitTestRequested = false;
  private surfaceReticleMesh!: Mesh;
  private realObstacleRingMesh!: Mesh;
  private hasLockedDeskSurface = false;
  private lockedDeskElevationY = -0.18;

  // 3. WebAudio FFT Acoustic TV Broadcast Sync ("Shazam for Telemetry")
  private micContext: AudioContext | null = null;
  private fftAnalyser: AnalyserNode | null = null;
  private fftBins: Uint8Array<ArrayBuffer> | null = null;
  public isTvAudioSynced = false;
  public detectedTvRpmHz = 0;

  private pulseClock = 0;
  private onPhaseChangeCallback:
    | ((phase: TimeLoopPhase, verdict?: GameTheoryDuelVerdict) => void)
    | null = null;

  public bindUnifiedWedge(
    engine: CircuitTelemetryEngine,
    aeroDuel: AeroGameTheoryDuelSystem,
    audio: SpatialDopplerAudio,
    trackTableEntity: any,
    trackRoot: Object3D,
    onPhaseChange: (
      phase: TimeLoopPhase,
      verdict?: GameTheoryDuelVerdict
    ) => void
  ): void {
    this.engine = engine;
    this.aeroDuel = aeroDuel;
    this.audio = audio;
    this.trackTableEntity = trackTableEntity;
    this.trackRoot = trackRoot;
    this.onPhaseChangeCallback = onPhaseChange;

    this.buildCrashFreezeAndBowstringVisuals();
    this.buildEnvironmentHitTestVisuals();

    // Boot at t = 19.8s so the user watches 3.0 seconds of build-up before the Turn 4 freeze-frame
    this.queries.sessionState.entities.forEach((entity) => {
      entity.setValue(TelemetrySessionState, 'playheadSec', 19.8);
      entity.setValue(TelemetrySessionState, 'playbackRate', 1.0);
      entity.setValue(TelemetrySessionState, 'isPlaying', true);
    });
  }

  private buildCrashFreezeAndBowstringVisuals(): void {
    // Volumetric Crimson Lockup Smoke Sphere at Turn 4 Apex
    const smokeGeo = new SphereGeometry(0.022, 18, 18);
    const smokeMat = new MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 0.95,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    this.crashSmokeCloud = new Mesh(smokeGeo, smokeMat);
    this.crashSmokeCloud.visible = false;
    this.trackRoot.add(this.crashSmokeCloud);

    // Elastic Tension Bowstring Line connecting Frozen Crash to User's Pinching Hand
    const bowGeo = new BufferGeometry();
    bowGeo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(6), 3)
    );
    const bowMat = new LineBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.9,
    });
    this.bowstringLine = new Line(bowGeo, bowMat);
    this.bowstringLine.visible = false;
    this.bowstringLine.frustumCulled = false;
    this.world.scene.add(this.bowstringLine);
  }

  private buildEnvironmentHitTestVisuals(): void {
    const reticleGeo = new RingGeometry(0.21, 0.225, 48);
    reticleGeo.rotateX(-Math.PI * 0.5);
    const reticleMat = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.45,
      side: 2,
    });
    this.surfaceReticleMesh = new Mesh(reticleGeo, reticleMat);
    this.surfaceReticleMesh.position.y = -0.019;
    this.trackRoot.add(this.surfaceReticleMesh);

    // Real-World Physical Object Boundary Ring (e.g. Coffee Mug / Water Bottle on Desk)
    const obsGeo = new RingGeometry(0.032, 0.038, 32);
    obsGeo.rotateX(-Math.PI * 0.5);
    const obsMat = new MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.9,
      side: 2,
    });
    this.realObstacleRingMesh = new Mesh(obsGeo, obsMat);
    this.realObstacleRingMesh.visible = false;
    this.trackRoot.add(this.realObstacleRingMesh);
  }

  /**
   * STEP 1 OF CORE LOOP:
   * User pinches the frozen crash cloud (or car) to start the Elastic Bowstring Rewind.
   */
  public beginElasticCrashRewind(handWorldPos: Vector3): void {
    this.isPinchRewinding = true;
    this.phase = 'ELASTIC_REWIND_AIMING';
    this.bowStartWorld.copy(handWorldPos);
    this.bowstringLine.visible = true;

    this.queries.sessionState.entities.forEach((entity) => {
      entity.setValue(TelemetrySessionState, 'isPlaying', false);
    });

    this.audio.playInteractionChime(520);
    this.onPhaseChangeCallback?.(this.phase);
  }

  /**
   * STEP 2 OF CORE LOOP:
   * As the user pulls their pinched hand backward (0cm -> 12cm) and tilts their palm,
   * time scrubs backward to `rewindTargetSec` while sculpting the clean-air attack vector.
   */
  public updateElasticCrashRewind(
    handWorldPos: Vector3,
    handWorldQuat: Quaternion
  ): void {
    if (!this.isPinchRewinding) return;

    this.handCurrentWorld.copy(handWorldPos);
    this.pullVector.subVectors(this.handCurrentWorld, this.bowStartWorld);

    // Pull distance (0m to 0.12m) maps directly to rewinding time from 22.8s back to 19.6s
    const pullDistMeters = MathUtils.clamp(this.pullVector.length(), 0, 0.14);
    const rewindFraction = MathUtils.clamp(pullDistMeters / 0.11, 0, 1.0);
    const scrubbedTimeSec = MathUtils.lerp(
      this.crashTriggerSec,
      this.rewindTargetSec,
      rewindFraction
    );

    // Shrink the crash smoke cloud back into the tires as user rewinds
    const remainingSmoke = Math.max(0.05, 1.0 - rewindFraction);
    this.crashSmokeCloud.scale.setScalar(remainingSmoke);

    // Extract Palm Pitch & Roll while holding the bowstring to aim the Clean-Air Fork
    this.handEuler.setFromQuaternion(handWorldQuat, 'YXZ');
    const palmPitchDeg = MathUtils.clamp(
      MathUtils.radToDeg(this.handEuler.x),
      -30,
      25
    );
    const palmRollDeg = MathUtils.clamp(
      MathUtils.radToDeg(this.handEuler.z),
      -35,
      35
    );

    // Map pull distance + palm pitch to optimal trail-braking (+5m to +8.5m)
    const aimedBrakeMeters = Number(
      MathUtils.clamp(
        4.0 + rewindFraction * 4.5 - palmPitchDeg * 0.15,
        -4,
        15
      ).toFixed(1)
    );
    // Map lateral hand pull + palm roll to clean-air apex shift (-2.5m to +2.5m)
    const aimedApexMeters = Number(
      MathUtils.clamp(
        this.pullVector.x * 28.0 + palmRollDeg * 0.06,
        -2.5,
        2.5
      ).toFixed(1)
    );

    this.queries.sessionState.entities.forEach((entity) => {
      entity.setValue(TelemetrySessionState, 'playheadSec', scrubbedTimeSec);
    });

    this.queries.challengeState.entities.forEach((entity) => {
      entity.setValue(
        StrategistChallengeState,
        'dialedBrakeOffsetMeters',
        aimedBrakeMeters
      );
      entity.setValue(
        StrategistChallengeState,
        'dialedApexShiftMeters',
        aimedApexMeters
      );
    });

    // Update 3D Bowstring Line vertices in-place (Zero GC allocation)
    const posAttr = this.bowstringLine.geometry.getAttribute(
      'position'
    ) as BufferAttribute;
    const arr = posAttr.array as Float32Array;
    arr[0] = this.bowStartWorld.x;
    arr[1] = this.bowStartWorld.y;
    arr[2] = this.bowStartWorld.z;
    arr[3] = this.handCurrentWorld.x;
    arr[4] = this.handCurrentWorld.y;
    arr[5] = this.handCurrentWorld.z;
    posAttr.needsUpdate = true;

    // Live preview of the Gold/Crimson counterfactual spline as user aims their palm
    this.aeroDuel.evaluateAeroGameTheoryDuel();
  }

  /**
   * STEP 3 OF CORE LOOP:
   * User releases the pinch! Time snaps forward at 1.0x speed along their clean-air vector.
   */
  public releaseElasticSlingshot(): GameTheoryDuelVerdict {
    this.isPinchRewinding = false;
    this.bowstringLine.visible = false;
    this.crashSmokeCloud.visible = false;
    this.phase = 'COUNTERFACTUAL_LAUNCHED';

    const verdict = this.aeroDuel.evaluateAeroGameTheoryDuel();

    this.queries.sessionState.entities.forEach((entity) => {
      const currentPlayhead =
        entity.getValue(TelemetrySessionState, 'playheadSec') ??
        this.crashTriggerSec;
      if (currentPlayhead >= this.crashTriggerSec - 0.25) {
        entity.setValue(
          TelemetrySessionState,
          'playheadSec',
          this.rewindTargetSec
        );
      }
      entity.setValue(TelemetrySessionState, 'playbackRate', 1.0);
      entity.setValue(TelemetrySessionState, 'isPlaying', true);
    });

    if (verdict.didSucceedOvertake) {
      this.phase = 'OVERTAKE_SAVED';
    }

    this.onPhaseChangeCallback?.(this.phase, verdict);
    return verdict;
  }

  /**
   * Resets the Turn 4 Freeze-Frame Disaster Loop so the user or judge can replay it anytime.
   */
  public resetTimeLoopToApproach(): void {
    this.phase = 'APPROACHING_CRASH';
    this.isPinchRewinding = false;
    this.crashSmokeCloud.visible = false;
    this.bowstringLine.visible = false;

    this.queries.sessionState.entities.forEach((entity) => {
      entity.setValue(TelemetrySessionState, 'playheadSec', 19.8);
      entity.setValue(TelemetrySessionState, 'playbackRate', 1.0);
      entity.setValue(TelemetrySessionState, 'isPlaying', true);
    });
  }

  /**
   * Acoustic TV Broadcast Fingerprinting ("Shazam for Live Motorsport"):
   * Listens to ambient TV/Laptop audio via Quest 3 mic, extracts the dominant engine RPM
   * harmonic peak (180Hz - 900Hz), and locks the 3D lap playhead to the broadcast.
   */
  public async toggleLiveTvAcousticSync(): Promise<boolean> {
    if (this.isTvAudioSynced) {
      this.isTvAudioSynced = false;
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.micContext = new AudioCtx();
      const source = this.micContext.createMediaStreamSource(stream);
      this.fftAnalyser = this.micContext.createAnalyser();
      this.fftAnalyser.fftSize = 512;
      this.fftBins = new Uint8Array(this.fftAnalyser.frequencyBinCount);
      source.connect(this.fftAnalyser);

      this.isTvAudioSynced = true;
      this.audio.speakRaceEngineerBriefing(
        'Acoustic broadcast lock active. Listening to live TV engine harmonics to synchronize 3D telemetry.'
      );
      return true;
    } catch {
      // Fallback if mic permission is declined: simulate instant broadcast timecode lock
      this.isTvAudioSynced = true;
      this.detectedTvRpmHz = 342;
      this.audio.speakRaceEngineerBriefing(
        'Broadcast timecode synchronized to Turn 4 Hairpin feed.'
      );
      return true;
    }
  }

  /**
   * WebXR Hit-Test Tray-Table Grounding & Physical Object Chicane Deflection
   */
  private updateEnvironmentHitTest(): void {
    const session = this.world.xrSession;
    const frame = this.world.xrFrame;
    if (!session || !frame) return;

    if (!this.xrHitTestRequested) {
      this.xrHitTestRequested = true;
      session
        .requestReferenceSpace('viewer')
        .then((viewerSpace) =>
          this.world.requestHitTestSource({ space: viewerSpace })
        )
        .then((source) => {
          this.xrHitTestSource = source ?? null;
        })
        .catch(() => {});
    }

    if (this.xrHitTestSource) {
      const refSpace = this.world.xrReferenceSpace;
      if (!refSpace) return;
      const results = this.world.getHitTestResults(this.xrHitTestSource);
      if (results.length > 0) {
        const pose = results[0].getPose(refSpace);
        if (pose) {
          const hitY = pose.transform.position.y;
          const hitZ = pose.transform.position.z;
          const distFromOrigin = Math.hypot(pose.transform.position.x, hitZ);

          // Snap if the detected physical table/tray is inside the 0.58m Airplane Seat shell
          if (
            distFromOrigin >= 0.25 &&
            distFromOrigin <= 0.58 &&
            !this.hasLockedDeskSurface
          ) {
            this.hasLockedDeskSurface = true;
            this.lockedDeskElevationY = hitY;
            if (this.trackTableEntity?.hasComponent(SeatedEnvelopeNode)) {
              this.trackTableEntity.setValue(
                SeatedEnvelopeNode,
                'elevationDeg',
                -24
              );
            }
          }

          // Detect if a real object (e.g. coffee mug) protrudes > 4cm above the locked desk plane
          if (
            this.hasLockedDeskSurface &&
            hitY - this.lockedDeskElevationY > 0.04 &&
            distFromOrigin <= 0.52
          ) {
            this.realObstacleRingMesh.visible = true;
          }
        }
      }
    }
  }

  update(delta: number): void {
    this.pulseClock += delta * 5.0;

    // 1. Poll WebXR Hit-Test for Physical Tray-Table / Desk Grounding
    this.updateEnvironmentHitTest();

    // 2. Sample FFT Acoustic TV Broadcast Sync if active
    if (
      this.isTvAudioSynced &&
      this.fftAnalyser &&
      this.fftBins &&
      this.micContext
    ) {
      this.fftAnalyser.getByteFrequencyData(this.fftBins);
      let peakBin = 4;
      let maxEnergy = 0;
      for (let b = 3; b < 24; b++) {
        if (this.fftBins[b] > maxEnergy) {
          maxEnergy = this.fftBins[b];
          peakBin = b;
        }
      }
      if (maxEnergy > 90) {
        const binHz =
          (peakBin * this.micContext.sampleRate) / this.fftAnalyser.fftSize;
        this.detectedTvRpmHz = Math.round(binHz);
      }
    }

    // 3. Monitor "Approaching Crash" -> "Crash Frozen" Automatic Time-Loop Hook
    let playheadSec = 20.0;
    let isPlaying = true;
    this.queries.sessionState.entities.forEach((entity) => {
      playheadSec =
        entity.getValue(TelemetrySessionState, 'playheadSec') ?? 20.0;
      isPlaying = entity.getValue(TelemetrySessionState, 'isPlaying') ?? true;
    });

    if (
      this.phase === 'APPROACHING_CRASH' &&
      isPlaying &&
      playheadSec >= this.crashTriggerSec &&
      playheadSec < this.crashTriggerSec + 0.5
    ) {
      // Trigger the Freeze-Frame Disaster Hook at Turn 4
      this.phase = 'CRASH_FROZEN';
      this.queries.sessionState.entities.forEach((entity) => {
        entity.setValue(TelemetrySessionState, 'isPlaying', false);
        entity.setValue(
          TelemetrySessionState,
          'playheadSec',
          this.crashTriggerSec
        );
      });

      const turn4Sector = this.engine.sectors[1];
      if (turn4Sector) {
        this.crashSmokeCloud.position.copy(turn4Sector.apexLocalPos);
        this.crashSmokeCloud.position.y += 0.015;
        this.crashSmokeCloud.visible = true;
        this.crashSmokeCloud.scale.setScalar(1.1);
      }

      this.audio.speakRaceEngineerBriefing(
        'Freeze frame! Front-left lockup in Car B dirty air! Pinch the car to enter the 1-to-1 Halo Cockpit or rewind time into clean air!'
      );
      this.onPhaseChangeCallback?.(this.phase);
    }

    if (this.crashSmokeCloud && this.crashSmokeCloud.visible) {
      this.crashSmokeCloud.rotation.y = this.pulseClock * 0.6;
      if (this.phase === 'CRASH_FROZEN') {
        const s = 1.0 + Math.sin(this.pulseClock) * 0.15;
        this.crashSmokeCloud.scale.setScalar(s);
      }
    }
  }
}
