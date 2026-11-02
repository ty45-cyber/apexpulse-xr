import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  createSystem,
  Group,
  Line,
  LineBasicMaterial,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { SpatialDopplerAudio } from '../audio/SpatialDopplerAudio';
import { TelemetrySessionState } from '../components';
import {
  CarKinematicSnapshot,
  CircuitTelemetryEngine,
} from '../telemetry/CircuitTelemetryEngine';

export interface CounterfactualSimResult {
  forkId: string;
  sectorName: string;
  brakeOffsetMeters: number;
  apexLateralShiftMeters: number;
  peakGripRatio: number;
  didBreachTractionLimit: boolean;
  exitTimeDeltaSec: number;
  verdictHeadline: string;
  physicsExplanation: string;
}

export class CounterfactualForkSystem extends createSystem({
  sessionState: { required: [TelemetrySessionState] },
}) {
  private engine!: CircuitTelemetryEngine;
  private audio!: SpatialDopplerAudio;
  private trackRoot!: Object3D;
  private explodedBayRoot!: Object3D;

  private readonly forkSamples = 40;
  private forkTrajectoryLine!: Line;
  private ghostCarMesh!: Mesh;
  private lockupPlumeMesh!: Mesh;
  private isForkActive = false;
  private forkUStart = 0.31;
  private forkUEnd = 0.45;
  private currentForkPoints: Vector3[] = [];

  private kammDomeMesh!: Mesh;
  private kammVectorArrow!: Mesh;
  private readonly colorSafeGrip = new Color(0x10b981);
  private readonly colorEdgeGrip = new Color(0xf59e0b);
  private readonly colorOverLimit = new Color(0xf43f5e);

  private readonly scratchPos = new Vector3();
  private readonly scratchTan = new Vector3();
  private readonly scratchBinorm = new Vector3();
  private readonly scratchWorldLook = new Vector3();
  private readonly upVec = new Vector3(0, 1, 0);
  private readonly snapActual: CarKinematicSnapshot = {
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
    tireTempsC: [95, 95, 95, 95],
  };

  private onForkResultCallback:
    | ((result: CounterfactualSimResult) => void)
    | null = null;

  public bindCounterfactualEngine(
    engine: CircuitTelemetryEngine,
    audio: SpatialDopplerAudio,
    trackRoot: Object3D,
    explodedBayRoot: Object3D,
    onResult: (result: CounterfactualSimResult) => void
  ): void {
    this.engine = engine;
    this.audio = audio;
    this.trackRoot = trackRoot;
    this.explodedBayRoot = explodedBayRoot;
    this.onForkResultCallback = onResult;

    for (let i = 0; i <= this.forkSamples; i++) {
      this.currentForkPoints.push(new Vector3());
    }

    this.buildForkMultiverseVisuals();
    this.buildKammFrictionDomeVisuals();
  }

  private buildForkMultiverseVisuals(): void {
    const geo = new BufferGeometry();
    const positions = new Float32Array((this.forkSamples + 1) * 3);
    geo.setAttribute('position', new BufferAttribute(positions, 3));

    const mat = new LineBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.95,
    });

    this.forkTrajectoryLine = new Line(geo, mat);
    this.forkTrajectoryLine.visible = false;
    this.trackRoot.add(this.forkTrajectoryLine);

    const ghostGeo = new ConeGeometry(0.007, 0.026, 12);
    ghostGeo.rotateX(Math.PI * 0.5);
    const ghostMat = new MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xeab308,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.85,
    });
    this.ghostCarMesh = new Mesh(ghostGeo, ghostMat);
    this.ghostCarMesh.visible = false;
    this.trackRoot.add(this.ghostCarMesh);

    const plumeGeo = new SphereGeometry(0.012, 16, 16);
    const plumeMat = new MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 1.0,
      wireframe: true,
    });
    this.lockupPlumeMesh = new Mesh(plumeGeo, plumeMat);
    this.lockupPlumeMesh.visible = false;
    this.trackRoot.add(this.lockupPlumeMesh);
  }

  private buildKammFrictionDomeVisuals(): void {
    const domeGroup = new Group();
    domeGroup.position.set(0, 0.045, 0);

    const domeGeo = new SphereGeometry(
      0.048,
      20,
      12,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.5
    );
    const domeMat = new MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.35,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    });
    this.kammDomeMesh = new Mesh(domeGeo, domeMat);
    domeGroup.add(this.kammDomeMesh);

    const arrowGeo = new ConeGeometry(0.006, 0.046, 10);
    arrowGeo.translate(0, 0.023, 0);
    const arrowMat = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.9,
    });
    this.kammVectorArrow = new Mesh(arrowGeo, arrowMat);
    domeGroup.add(this.kammVectorArrow);

    this.explodedBayRoot.add(domeGroup);
  }

  public simulateCounterfactualFork(
    sectorIndex: number,
    brakeOffsetMeters: number,
    apexLateralShiftMeters: number
  ): CounterfactualSimResult {
    const sector =
      this.engine.sectors[sectorIndex] ?? this.engine.sectors[1];
    this.forkUStart = sector.uStart;
    this.forkUEnd = sector.uEnd;
    this.isForkActive = true;

    const entrySpeedDeltaKmh = brakeOffsetMeters * 1.45;
    const radiusMultiplier = MathUtils.clamp(
      1.0 + apexLateralShiftMeters * 0.065,
      0.72,
      1.35
    );

    const baseApexSpeedMs = sector.carAMinApexKmh / 3.6;
    const forkedApexSpeedMs =
      (sector.carAMinApexKmh + entrySpeedDeltaKmh * 0.55) / 3.6;

    const nominalRadiusMeters =
      (baseApexSpeedMs * baseApexSpeedMs) / (2.9 * 9.81);
    const forkedRadiusMeters = nominalRadiusMeters * radiusMultiplier;

    const requiredLatG =
      (forkedApexSpeedMs * forkedApexSpeedMs) / (forkedRadiusMeters * 9.81);
    const residualBrakeG =
      brakeOffsetMeters > 0 ? (brakeOffsetMeters / 18.0) * 2.1 : 0.4;

    const maxTireGripG = 4.15;
    const peakGripRatio =
      Math.sqrt(
        requiredLatG * requiredLatG + residualBrakeG * residualBrakeG
      ) / maxTireGripG;

    const didBreach = peakGripRatio > 1.0;

    const exitTimeDeltaSec = didBreach
      ? Number(((peakGripRatio - 1.0) * 1.85 + 0.32).toFixed(3))
      : Number(
          (
            -brakeOffsetMeters * 0.011 +
            Math.abs(apexLateralShiftMeters + 1.2) * 0.025 -
            0.08
          ).toFixed(3)
        );

    const posAttr = this.forkTrajectoryLine.geometry.getAttribute(
      'position'
    ) as BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i <= this.forkSamples; i++) {
      const tNorm = i / this.forkSamples;
      const u = MathUtils.lerp(this.forkUStart, this.forkUEnd, tNorm);
      this.engine.curve.getPointAt(u, this.scratchPos);
      this.engine.curve.getTangentAt(u, this.scratchTan).normalize();
      this.scratchBinorm.crossVectors(this.scratchTan, this.upVec).normalize();

      const bell = Math.sin(tNorm * Math.PI);
      let lateralWorldOffset = (apexLateralShiftMeters / 3.0) * 0.014 * bell;

      if (didBreach && tNorm > 0.45) {
        const skidSeverity = (tNorm - 0.45) * (peakGripRatio - 0.92) * 0.065;
        lateralWorldOffset += skidSeverity;
      }

      this.scratchPos.addScaledVector(this.scratchBinorm, lateralWorldOffset);
      this.scratchPos.y += 0.008;

      this.currentForkPoints[i].copy(this.scratchPos);
      const idx = i * 3;
      arr[idx] = this.scratchPos.x;
      arr[idx + 1] = this.scratchPos.y;
      arr[idx + 2] = this.scratchPos.z;
    }

    posAttr.needsUpdate = true;
    this.forkTrajectoryLine.visible = true;
    this.ghostCarMesh.visible = true;

    const lineMat = this.forkTrajectoryLine.material as LineBasicMaterial;
    lineMat.color.setHex(didBreach ? 0xf43f5e : 0xfacc15);

    if (didBreach) {
      this.lockupPlumeMesh.position.copy(
        this.currentForkPoints[Math.floor(this.forkSamples * 0.55)]
      );
      this.lockupPlumeMesh.visible = true;
    } else {
      this.lockupPlumeMesh.visible = false;
    }

    const result: CounterfactualSimResult = {
      forkId: `FORK_${sector.id}_${Date.now()}`,
      sectorName: sector.name,
      brakeOffsetMeters,
      apexLateralShiftMeters,
      peakGripRatio: Number(peakGripRatio.toFixed(2)),
      didBreachTractionLimit: didBreach,
      exitTimeDeltaSec,
      verdictHeadline: didBreach
        ? `TRACTION BREACH (${(peakGripRatio * 100).toFixed(0)}% Grip) | +${exitTimeDeltaSec}s Lost`
        : `COUNTERFACTUAL WIN (${(peakGripRatio * 100).toFixed(0)}% Grip) | ${exitTimeDeltaSec}s Gained!`,
      physicsExplanation: didBreach
        ? `Braking ${brakeOffsetMeters}m later exceeded Kamm's friction ellipse at apex (${requiredLatG.toFixed(
            1
          )}G lat + ${residualBrakeG.toFixed(
            1
          )}G brake), causing front-left lockup into the runoff.`
        : `Braking ${brakeOffsetMeters}m later with a ${apexLateralShiftMeters.toFixed(
            1
          )}m apex offset stayed inside the tire grip dome (${(
            peakGripRatio * 100
          ).toFixed(0)}%), sealing the overtake ${Math.abs(
            exitTimeDeltaSec
          )}s faster.`,
    };

    if (this.onForkResultCallback) {
      this.onForkResultCallback(result);
    }

    return result;
  }

  update(_delta: number): void {
    if (!this.engine) return;

    let playheadSec = 19.8;
    let lapDurationSec = 60.0;
    let selectedCarIdx = 0;

    this.queries.sessionState.entities.forEach((entity) => {
      playheadSec =
        entity.getValue(TelemetrySessionState, 'playheadSec') ?? 19.8;
      lapDurationSec =
        entity.getValue(TelemetrySessionState, 'lapDurationSec') ?? 60.0;
      selectedCarIdx =
        entity.getValue(TelemetrySessionState, 'selectedCarIndex') ?? 0;
    });

    if (this.isForkActive && this.ghostCarMesh.visible) {
      const uCurrent = (playheadSec / lapDurationSec) % 1.0;
      if (uCurrent >= this.forkUStart && uCurrent <= this.forkUEnd) {
        const localT =
          (uCurrent - this.forkUStart) / (this.forkUEnd - this.forkUStart);
        const exactIdx = localT * this.forkSamples;
        const idx0 = Math.floor(exactIdx);
        const idx1 = Math.min(this.forkSamples, idx0 + 1);
        const frac = exactIdx - idx0;

        this.ghostCarMesh.position.lerpVectors(
          this.currentForkPoints[idx0],
          this.currentForkPoints[idx1],
          frac
        );
        this.scratchWorldLook.copy(this.currentForkPoints[idx1]);
        this.trackRoot.localToWorld(this.scratchWorldLook);
        this.ghostCarMesh.lookAt(this.scratchWorldLook);
      }
    }

    this.engine.evaluateCarState(
      selectedCarIdx,
      playheadSec,
      0,
      this.snapActual
    );

    const maxGripG = 4.2;
    const normLat = MathUtils.clamp(
      this.snapActual.lateralG / maxGripG,
      -1.2,
      1.2
    );
    const normLong = MathUtils.clamp(
      this.snapActual.longitudinalG / maxGripG,
      -1.2,
      1.2
    );
    const combinedGripUsage = Math.sqrt(
      normLat * normLat + normLong * normLong
    );

    if (this.kammVectorArrow && this.kammDomeMesh) {
      this.kammVectorArrow.rotation.z = -normLat * 0.95;
      this.kammVectorArrow.rotation.x = normLong * 0.95;
      this.kammVectorArrow.scale.y = MathUtils.clamp(
        combinedGripUsage,
        0.2,
        1.35
      );

      const domeMat = this.kammDomeMesh.material as MeshStandardMaterial;
      if (combinedGripUsage < 0.8) {
        domeMat.color.copy(this.colorSafeGrip);
      } else if (combinedGripUsage <= 1.0) {
        domeMat.color.copy(this.colorEdgeGrip);
      } else {
        domeMat.color.copy(this.colorOverLimit);
      }
      domeMat.emissive.copy(domeMat.color).multiplyScalar(0.4);
    }
  }
}
