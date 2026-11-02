import {
  Color,
  createSystem,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Pressed,
  Transform,
  Vector3,
} from '@iwsdk/core';
import { SpatialDopplerAudio } from '../audio/SpatialDopplerAudio';
import {
  TelemetryCarNode,
  TelemetrySessionState,
} from '../components';
import {
  CarKinematicSnapshot,
  CircuitTelemetryEngine,
} from '../telemetry/CircuitTelemetryEngine';

export interface TelemetryVisualRefs {
  trackRoot: Object3D;
  scrubberPlayheadMesh: Mesh;
  scrubberBarWidthMeters: number;
  carBrakeVectors: [Mesh, Mesh];
  carLatGVectors: [Mesh, Mesh];
  explodedBayTireMeshes: [Mesh, Mesh, Mesh, Mesh];
  explodedBayBrakeBar: Mesh;
  explodedBayThrottleBar: Mesh;
  onHudMetricsUpdate?: (
    snapA: CarKinematicSnapshot,
    snapB: CarKinematicSnapshot,
    playheadSec: number,
    selectedCarIndex: number
  ) => void;
}

export class TelemetryScrubSystem extends createSystem({
  sessionState: { required: [TelemetrySessionState] },
  carNodes: { required: [Transform, TelemetryCarNode] },
}) {
  private telemetryEngine!: CircuitTelemetryEngine;
  private audioEngine!: SpatialDopplerAudio;
  private refs: TelemetryVisualRefs | null = null;

  private readonly snapA: CarKinematicSnapshot = {
    normalizedProgress: 0,
    localPos: new Vector3(),
    tangent: new Vector3(),
    speedKmh: 0,
    brakePressureBar: 0,
    throttlePct: 0,
    lateralG: 0,
    longitudinalG: 0,
    gear: 1,
    rpm: 8000,
    tireTempsC: [90, 90, 90, 90],
  };

  private readonly snapB: CarKinematicSnapshot = {
    normalizedProgress: 0,
    localPos: new Vector3(),
    tangent: new Vector3(),
    speedKmh: 0,
    brakePressureBar: 0,
    throttlePct: 0,
    lateralG: 0,
    longitudinalG: 0,
    gear: 1,
    rpm: 8000,
    tireTempsC: [90, 90, 90, 90],
  };

  private readonly lookTarget = new Vector3();
  private readonly worldAudioPos = new Vector3();
  private readonly colorCool = new Color(0x0ea5e9);
  private readonly colorOptimal = new Color(0x10b981);
  private readonly colorHot = new Color(0xf43f5e);

  public bindRuntimeDependencies(
    engine: CircuitTelemetryEngine,
    audio: SpatialDopplerAudio,
    refs: TelemetryVisualRefs
  ): void {
    this.telemetryEngine = engine;
    this.audioEngine = audio;
    this.refs = refs;
  }

  public scrubToNormalizedFraction(fraction: number): void {
    const clamped = MathUtils.clamp(fraction, 0, 0.999);
    this.queries.sessionState.entities.forEach((entity) => {
      const duration =
        entity.getValue(TelemetrySessionState, 'lapDurationSec') ?? 60.0;
      entity.setValue(
        TelemetrySessionState,
        'playheadSec',
        clamped * duration
      );
      if (!entity.getValue(TelemetrySessionState, 'onboardingComplete')) {
        entity.setValue(TelemetrySessionState, 'onboardingComplete', true);
        entity.setValue(TelemetrySessionState, 'playbackRate', 1.0);
      }
    });
    this.audioEngine?.playInteractionChime(540 + clamped * 320);
  }

  update(delta: number): void {
    if (!this.telemetryEngine || !this.refs) return;

    let playheadSec = 19.8;
    let lapDurationSec = 60.0;
    let playbackRate = 1.0;
    let isPlaying = true;
    let selectedCarIndex = 0;
    let scenarioIndex = 0;

    this.queries.sessionState.entities.forEach((stateEntity) => {
      playheadSec =
        stateEntity.getValue(TelemetrySessionState, 'playheadSec') ?? 19.8;
      lapDurationSec =
        stateEntity.getValue(TelemetrySessionState, 'lapDurationSec') ?? 60.0;
      playbackRate =
        stateEntity.getValue(TelemetrySessionState, 'playbackRate') ?? 1.0;
      isPlaying =
        stateEntity.getValue(TelemetrySessionState, 'isPlaying') ?? true;
      selectedCarIndex =
        stateEntity.getValue(TelemetrySessionState, 'selectedCarIndex') ?? 0;
      scenarioIndex =
        stateEntity.getValue(TelemetrySessionState, 'scenarioIndex') ?? 0;

      if (isPlaying) {
        playheadSec = (playheadSec + delta * playbackRate) % lapDurationSec;
        stateEntity.setValue(TelemetrySessionState, 'playheadSec', playheadSec);
      }
    });

    this.telemetryEngine.evaluateCarState(
      0,
      playheadSec,
      scenarioIndex,
      this.snapA
    );
    this.telemetryEngine.evaluateCarState(
      1,
      playheadSec,
      scenarioIndex,
      this.snapB
    );

    this.refs.trackRoot.updateMatrixWorld();

    this.queries.carNodes.entities.forEach((carEntity) => {
      const carObj = carEntity.object3D;
      if (!carObj) return;

      const idx = carEntity.getValue(TelemetryCarNode, 'carIndex') ?? 0;
      const snap = idx === 0 ? this.snapA : this.snapB;

      // Allow user to physically pull Car A toward visor (< 0.24m) when grabbed
      if (!carEntity.hasComponent(Pressed)) {
        carObj.position.copy(snap.localPos);
        this.lookTarget.copy(snap.localPos).add(snap.tangent);
        this.refs!.trackRoot.localToWorld(this.lookTarget);
        carObj.lookAt(this.lookTarget);
      }

      carEntity.setValue(TelemetryCarNode, 'speedKmh', snap.speedKmh);
      carEntity.setValue(
        TelemetryCarNode,
        'brakePressureBar',
        snap.brakePressureBar
      );
      carEntity.setValue(TelemetryCarNode, 'throttlePct', snap.throttlePct);
      carEntity.setValue(TelemetryCarNode, 'lateralG', snap.lateralG);
      carEntity.setValue(TelemetryCarNode, 'gear', snap.gear);
      carEntity.setValue(TelemetryCarNode, 'rpm', snap.rpm);

      const brakeMesh = this.refs!.carBrakeVectors[idx];
      if (brakeMesh) {
        const brakeScale = MathUtils.clamp(
          snap.brakePressureBar / 120,
          0.05,
          1.4
        );
        brakeMesh.scale.set(1, 1, brakeScale);
        brakeMesh.visible = snap.brakePressureBar > 8;
      }

      const latGMesh = this.refs!.carLatGVectors[idx];
      if (latGMesh) {
        const gScale = MathUtils.clamp(snap.lateralG / 4.0, 0.1, 1.3);
        latGMesh.scale.set(gScale, 1, 1);
      }

      if (idx === selectedCarIndex && this.audioEngine) {
        carObj.getWorldPosition(this.worldAudioPos);
        this.audioEngine.updateLeadCarSpatialAudio(
          this.worldAudioPos,
          snap.rpm,
          playbackRate
        );
      }
    });

    const progress = playheadSec / lapDurationSec;
    const halfWidth = this.refs.scrubberBarWidthMeters * 0.5;
    this.refs.scrubberPlayheadMesh.position.x = MathUtils.lerp(
      -halfWidth,
      halfWidth,
      progress
    );

    const inspectedSnap = selectedCarIndex === 0 ? this.snapA : this.snapB;
    for (let i = 0; i < 4; i++) {
      const tireMesh = this.refs.explodedBayTireMeshes[i];
      const tempC = inspectedSnap.tireTempsC[i];
      const tempRatio = MathUtils.clamp((tempC - 82) / 30, 0, 1);
      const mat = tireMesh.material as MeshStandardMaterial;

      if (tempRatio < 0.5) {
        mat.color.lerpColors(this.colorCool, this.colorOptimal, tempRatio * 2);
      } else {
        mat.color.lerpColors(
          this.colorOptimal,
          this.colorHot,
          (tempRatio - 0.5) * 2
        );
      }
      mat.emissive.copy(mat.color).multiplyScalar(0.35);
      tireMesh.scale.y = 0.85 + tempRatio * 0.45;
    }

    this.refs.explodedBayBrakeBar.scale.y = MathUtils.clamp(
      inspectedSnap.brakePressureBar / 125,
      0.04,
      1.0
    );
    this.refs.explodedBayThrottleBar.scale.y = MathUtils.clamp(
      inspectedSnap.throttlePct / 100,
      0.04,
      1.0
    );

    if (this.refs.onHudMetricsUpdate) {
      this.refs.onHudMetricsUpdate(
        this.snapA,
        this.snapB,
        playheadSec,
        selectedCarIndex
      );
    }
  }
}
