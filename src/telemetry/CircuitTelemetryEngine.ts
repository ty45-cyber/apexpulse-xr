import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  MathUtils,
  Vector3,
} from '@iwsdk/core';

export interface CarKinematicSnapshot {
  normalizedProgress: number;
  localPos: Vector3;
  tangent: Vector3;
  speedKmh: number;
  brakePressureBar: number;
  throttlePct: number;
  lateralG: number;
  longitudinalG: number;
  gear: number;
  rpm: number;
  tireTempsC: [number, number, number, number];
}

export interface SectorMetadata {
  index: number;
  id: string;
  name: string;
  uStart: number;
  uApex: number;
  uEnd: number;
  apexLocalPos: Vector3;
  carABrakingPointMeters: number;
  carBBrakingPointMeters: number;
  carAMinApexKmh: number;
  carBMinApexKmh: number;
  keyInsight: string;
}

export class CircuitTelemetryEngine {
  public readonly curve: CatmullRomCurve3;
  public readonly sectors: SectorMetadata[] = [];
  public readonly lapDurationSec = 60.0;

  private readonly scratchPoint = new Vector3();
  private readonly scratchTangent = new Vector3();
  private readonly scratchNormal = new Vector3();
  private readonly scratchBinormal = new Vector3();
  private readonly upVec = new Vector3(0, 1, 0);

  constructor() {
    const controlPoints = [
      new Vector3(-0.18, 0.00, 0.09),
      new Vector3(0.02, 0.00, 0.10),
      new Vector3(0.19, 0.01, 0.08),
      new Vector3(0.22, 0.03, 0.01),
      new Vector3(0.14, 0.04, -0.06),
      new Vector3(0.04, 0.02, -0.02),
      new Vector3(-0.04, 0.00, -0.11),
      new Vector3(-0.14, -0.01, -0.12),
      new Vector3(-0.21, 0.01, -0.05),
      new Vector3(-0.12, 0.03, 0.01),
      new Vector3(-0.22, 0.02, 0.04),
      new Vector3(-0.21, 0.00, 0.08),
    ];

    this.curve = new CatmullRomCurve3(controlPoints, true, 'centripetal', 0.5);
    this.initSectors();
  }

  private initSectors(): void {
    const rawSectors = [
      {
        index: 0,
        id: 'T1_T3_ESSES',
        name: 'Sector 1: Uphill Aero Esses',
        uStart: 0.12,
        uApex: 0.24,
        uEnd: 0.30,
        carABrakingPointMeters: 68,
        carBBrakingPointMeters: 79,
        carAMinApexKmh: 184,
        carBMinApexKmh: 176,
        keyInsight:
          'Car A carries +8 km/h minimum speed through the uphill crest by trail-braking 11m deeper into Turn 2, generating 3.9G lateral load on the front-left tire.',
      },
      {
        index: 1,
        id: 'T4_HAIRPIN',
        name: 'Turn 4: Late-Braking Hairpin Duel',
        uStart: 0.31,
        uApex: 0.37,
        uEnd: 0.45,
        carABrakingPointMeters: 92,
        carBBrakingPointMeters: 108,
        carAMinApexKmh: 96,
        carBMinApexKmh: 89,
        keyInsight:
          'Overtake Decider: Car A delays peak 124 bar braking by 16 meters on the inside line, sacrificing 4 km/h mid-corner exit to seal the pass before apex.',
      },
      {
        index: 2,
        id: 'T6_SWEEPER',
        name: 'Sector 3: High-G Banked Sweeper',
        uStart: 0.68,
        uApex: 0.78,
        uEnd: 0.88,
        carABrakingPointMeters: 44,
        carBBrakingPointMeters: 52,
        carAMinApexKmh: 212,
        carBMinApexKmh: 218,
        keyInsight:
          'Car B square-offs the entry to get on full throttle 0.28s earlier, recovering 6 km/h terminal velocity down the main straight despite higher rear tire slip.',
      },
    ];

    for (const s of rawSectors) {
      const apexLocalPos = this.curve.getPointAt(s.uApex);
      this.sectors.push({
        ...s,
        apexLocalPos,
      });
    }
  }

  public evaluateCarState(
    carIndex: number,
    timeSec: number,
    scenarioIndex: number,
    out: CarKinematicSnapshot
  ): CarKinematicSnapshot {
    const wrappedTime =
      ((timeSec % this.lapDurationSec) + this.lapDurationSec) %
      this.lapDurationSec;
    const baseU = wrappedTime / this.lapDurationSec;

    const scenarioMultiplier = 1.0 + scenarioIndex * 0.15;
    let phaseOffset = 0;
    if (carIndex === 1) {
      phaseOffset =
        0.008 *
        Math.cos((baseU - 0.37) * Math.PI * 2.0) *
        scenarioMultiplier;
    }

    const u = (((baseU + phaseOffset) % 1.0) + 1.0) % 1.0;
    out.normalizedProgress = u;

    this.curve.getPointAt(u, out.localPos);
    this.curve.getTangentAt(u, out.tangent).normalize();

    this.scratchBinormal.crossVectors(out.tangent, this.upVec).normalize();
    const duelProximity = Math.exp(-Math.pow((u - 0.37) / 0.08, 2));
    const laneOffset =
      (carIndex === 0 ? -0.007 : 0.007) * (0.4 + 0.6 * duelProximity);
    out.localPos.addScaledVector(this.scratchBinormal, laneOffset);
    out.localPos.y += 0.004;

    const uNext = (u + 0.005) % 1.0;
    this.curve.getTangentAt(uNext, this.scratchTangent).normalize();
    const curvature = out.tangent.distanceTo(this.scratchTangent) / 0.005;

    const rawTargetSpeed = MathUtils.clamp(
      322 - curvature * 29.5 + (carIndex === 0 ? 3.5 : -2.0) * duelProximity,
      88,
      320
    );
    out.speedKmh = rawTargetSpeed;

    const uBrakeLookahead = (u + 0.025) % 1.0;
    this.curve.getTangentAt(uBrakeLookahead, this.scratchNormal).normalize();
    const upcomingCurvature =
      this.scratchTangent.distanceTo(this.scratchNormal) / 0.005;

    const brakingDemand = MathUtils.clamp(
      (upcomingCurvature - curvature * 0.45 - 1.8) * 32.0,
      0,
      130
    );
    out.brakePressureBar =
      carIndex === 0
        ? MathUtils.clamp(brakingDemand * 1.12, 0, 128)
        : MathUtils.clamp(brakingDemand * 0.94, 0, 114);

    out.throttlePct =
      out.brakePressureBar > 12
        ? 0
        : MathUtils.clamp(100 - curvature * 9.5, 18, 100);

    const speedMs = out.speedKmh / 3.6;
    out.lateralG = MathUtils.clamp(
      (curvature * speedMs * speedMs) / 1450,
      0.1,
      4.6
    );
    out.longitudinalG =
      out.brakePressureBar > 10
        ? -(out.brakePressureBar / 128) * 4.8
        : (out.throttlePct / 100) * 1.6;

    out.gear = MathUtils.clamp(Math.floor((out.speedKmh - 50) / 34) + 1, 1, 8);
    const gearMinSpeed = 50 + (out.gear - 1) * 34;
    const gearFraction = MathUtils.clamp(
      (out.speedKmh - gearMinSpeed) / 34,
      0,
      1
    );
    out.rpm = Math.round(7800 + gearFraction * 4300);

    const baseTemp = 88 + out.lateralG * 4.5 + (out.brakePressureBar / 128) * 14;
    out.tireTempsC[0] = Math.round(baseTemp + (carIndex === 0 ? 5 : 2));
    out.tireTempsC[1] = Math.round(baseTemp + 3);
    out.tireTempsC[2] = Math.round(baseTemp - 2);
    out.tireTempsC[3] = Math.round(baseTemp - 1);

    return out;
  }

  public buildTrackRibbonGeometry(
    segments = 240,
    trackHalfWidth = 0.015
  ): BufferGeometry {
    const geometry = new BufferGeometry();
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const normals = new Float32Array((segments + 1) * 2 * 3);
    const colors = new Float32Array((segments + 1) * 2 * 3);
    const indices: number[] = [];

    const colorFast = new Color(0x0ea5e9);
    const colorMid = new Color(0x10b981);
    const colorBrake = new Color(0xf43f5e);
    const vertexColor = new Color();
    const snap: CarKinematicSnapshot = {
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

    for (let i = 0; i <= segments; i++) {
      const u = (i % segments) / segments;
      this.curve.getPointAt(u, this.scratchPoint);
      this.curve.getTangentAt(u, this.scratchTangent).normalize();
      this.scratchBinormal
        .crossVectors(this.scratchTangent, this.upVec)
        .normalize();

      this.evaluateCarState(0, u * this.lapDurationSec, 0, snap);
      const brakeRatio = MathUtils.clamp(snap.brakePressureBar / 95, 0, 1);
      if (brakeRatio > 0.25) {
        vertexColor.lerpColors(colorMid, colorBrake, brakeRatio);
      } else {
        const speedRatio = MathUtils.clamp((snap.speedKmh - 100) / 210, 0, 1);
        vertexColor.lerpColors(colorMid, colorFast, speedRatio);
      }

      const idx = i * 6;
      positions[idx] = this.scratchPoint.x - this.scratchBinormal.x * trackHalfWidth;
      positions[idx + 1] = this.scratchPoint.y;
      positions[idx + 2] = this.scratchPoint.z - this.scratchBinormal.z * trackHalfWidth;
      positions[idx + 3] = this.scratchPoint.x + this.scratchBinormal.x * trackHalfWidth;
      positions[idx + 4] = this.scratchPoint.y;
      positions[idx + 5] = this.scratchPoint.z + this.scratchBinormal.z * trackHalfWidth;

      normals[idx] = 0;
      normals[idx + 1] = 1;
      normals[idx + 2] = 0;
      normals[idx + 3] = 0;
      normals[idx + 4] = 1;
      normals[idx + 5] = 0;

      colors[idx] = vertexColor.r;
      colors[idx + 1] = vertexColor.g;
      colors[idx + 2] = vertexColor.b;
      colors[idx + 3] = vertexColor.r;
      colors[idx + 4] = vertexColor.g;
      colors[idx + 5] = vertexColor.b;

      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  public buildSectorDeltaLinePoints(
    sectorIndex: number,
    carIndex: number,
    samples = 36
  ): Vector3[] {
    const sector = this.sectors[sectorIndex] ?? this.sectors[1];
    const pts: Vector3[] = [];
    const snap: CarKinematicSnapshot = {
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

    for (let i = 0; i <= samples; i++) {
      const tNorm = i / samples;
      const u = MathUtils.lerp(sector.uStart, sector.uEnd, tNorm);
      this.evaluateCarState(carIndex, u * this.lapDurationSec, 0, snap);
      pts.push(
        new Vector3(
          snap.localPos.x,
          snap.localPos.y + 0.012 + (carIndex === 0 ? 0.003 : 0),
          snap.localPos.z
        )
      );
    }
    return pts;
  }

  public sculptCornerAndRebuildRibbon(
    sectorIndex: number,
    newLocalPos: Vector3,
    ribbonGeometry: BufferGeometry,
    segments = 240,
    trackHalfWidth = 0.015
  ): void {
    const controlPointMap = [3, 7, 9];
    const cpIdx = controlPointMap[sectorIndex] ?? 7;

    this.curve.points[cpIdx].set(
      MathUtils.clamp(newLocalPos.x, -0.22, 0.22),
      MathUtils.clamp(newLocalPos.y, -0.02, 0.06),
      MathUtils.clamp(newLocalPos.z, -0.14, 0.14)
    );
    this.curve.updateArcLengths();

    const sector = this.sectors[sectorIndex];
    if (sector) {
      this.curve.getPointAt(sector.uApex, sector.apexLocalPos);
      const uPrev = (sector.uApex - 0.02 + 1.0) % 1.0;
      const uNext = (sector.uApex + 0.02) % 1.0;
      const t1 = this.curve.getTangentAt(uPrev);
      const t2 = this.curve.getTangentAt(uNext);
      const newCurvature = t1.distanceTo(t2) / 0.04;
      sector.carABrakingPointMeters = Math.round(
        MathUtils.clamp(45 + newCurvature * 38, 40, 135)
      );
      sector.carBBrakingPointMeters = sector.carABrakingPointMeters + 14;
    }

    const posAttr = ribbonGeometry.getAttribute('position') as BufferAttribute;
    const colAttr = ribbonGeometry.getAttribute('color') as BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    const colorFast = new Color(0x0ea5e9);
    const colorMid = new Color(0x10b981);
    const colorBrake = new Color(0xf43f5e);
    const vertexColor = new Color();
    const snap: CarKinematicSnapshot = {
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

    for (let i = 0; i <= segments; i++) {
      const u = (i % segments) / segments;
      this.curve.getPointAt(u, this.scratchPoint);
      this.curve.getTangentAt(u, this.scratchTangent).normalize();
      this.scratchBinormal
        .crossVectors(this.scratchTangent, this.upVec)
        .normalize();

      this.evaluateCarState(0, u * this.lapDurationSec, 0, snap);
      const brakeRatio = MathUtils.clamp(snap.brakePressureBar / 95, 0, 1);
      if (brakeRatio > 0.25) {
        vertexColor.lerpColors(colorMid, colorBrake, brakeRatio);
      } else {
        const speedRatio = MathUtils.clamp((snap.speedKmh - 100) / 210, 0, 1);
        vertexColor.lerpColors(colorMid, colorFast, speedRatio);
      }

      const idx = i * 6;
      posArr[idx] = this.scratchPoint.x - this.scratchBinormal.x * trackHalfWidth;
      posArr[idx + 1] = this.scratchPoint.y;
      posArr[idx + 2] = this.scratchPoint.z - this.scratchBinormal.z * trackHalfWidth;
      posArr[idx + 3] = this.scratchPoint.x + this.scratchBinormal.x * trackHalfWidth;
      posArr[idx + 4] = this.scratchPoint.y;
      posArr[idx + 5] = this.scratchPoint.z + this.scratchBinormal.z * trackHalfWidth;

      colArr[idx] = vertexColor.r;
      colArr[idx + 1] = vertexColor.g;
      colArr[idx + 2] = vertexColor.b;
      colArr[idx + 3] = vertexColor.r;
      colArr[idx + 4] = vertexColor.g;
      colArr[idx + 5] = vertexColor.b;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    try {
      const serialized = this.curve.points.map((p) => [
        Number(p.x.toFixed(4)),
        Number(p.y.toFixed(4)),
        Number(p.z.toFixed(4)),
      ]);
      localStorage.setItem(
        'apexpulse_custom_circuit_v1',
        JSON.stringify(serialized)
      );
    } catch {
      // Safe fallback
    }
  }
}