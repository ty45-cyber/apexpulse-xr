import {
  CatmullRomCurve3,
  createSystem,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TubeGeometry,
} from '@iwsdk/core';
import { SpatialDopplerAudio } from '../audio/SpatialDopplerAudio';
import { TelemetrySessionState } from '../components';
import {
  CircuitTelemetryEngine,
  SectorMetadata,
} from '../telemetry/CircuitTelemetryEngine';

export interface SpatialAIDirective {
  sectorId: string;
  headline: string;
  brakingDeltaMeters: number;
  apexSpeedDeltaKmh: number;
  recommendedAction: string;
  spokenBriefing: string;
}

export class SpatialAIRaceEngineerSystem extends createSystem({
  sessionState: { required: [TelemetrySessionState] },
}) {
  private telemetryEngine!: CircuitTelemetryEngine;
  private audioEngine!: SpatialDopplerAudio;
  private trackRoot!: Object3D;
  private deltaGhostGroup: Group | null = null;
  private apexBeaconMesh: Mesh | null = null;
  private pulseClock = 0;
  private onDirectiveCallback: ((directive: SpatialAIDirective) => void) | null =
    null;

  public bindRuntimeDependencies(
    engine: CircuitTelemetryEngine,
    audio: SpatialDopplerAudio,
    trackRoot: Object3D,
    apexBeaconMesh: Mesh,
    onDirective: (directive: SpatialAIDirective) => void
  ): void {
    this.telemetryEngine = engine;
    this.audioEngine = audio;
    this.trackRoot = trackRoot;
    this.apexBeaconMesh = apexBeaconMesh;
    this.onDirectiveCallback = onDirective;

    this.deltaGhostGroup = new Group();
    this.trackRoot.add(this.deltaGhostGroup);
  }

  public async analyzeSectorDeictic(sectorIndex: number): Promise<void> {
    if (!this.telemetryEngine || !this.deltaGhostGroup) return;

    const sector =
      this.telemetryEngine.sectors[sectorIndex] ??
      this.telemetryEngine.sectors[1];

    this.queries.sessionState.entities.forEach((entity) => {
      entity.setValue(TelemetrySessionState, 'activeSectorIndex', sector.index);
      entity.setValue(TelemetrySessionState, 'aiDeltaVisible', true);
      entity.setValue(
        TelemetrySessionState,
        'playheadSec',
        sector.uStart * this.telemetryEngine.lapDurationSec
      );
      entity.setValue(TelemetrySessionState, 'playbackRate', 0.45);
      entity.setValue(TelemetrySessionState, 'onboardingComplete', true);
    });

    this.rebuild3DDeltaGhostTubes(sector);

    const telemetryPayload = {
      sectorId: sector.id,
      sectorName: sector.name,
      carA: {
        brakingPointMetersBeforeApex: sector.carABrakingPointMeters,
        minApexSpeedKmh: sector.carAMinApexKmh,
      },
      carB: {
        brakingPointMetersBeforeApex: sector.carBBrakingPointMeters,
        minApexSpeedKmh: sector.carBMinApexKmh,
      },
    };

    const directive = await this.resolveSpatialAIDirective(
      sector,
      telemetryPayload
    );

    if (this.onDirectiveCallback) {
      this.onDirectiveCallback(directive);
    }

    this.audioEngine.speakRaceEngineerBriefing(directive.spokenBriefing);
  }

  private rebuild3DDeltaGhostTubes(sector: SectorMetadata): void {
    if (!this.deltaGhostGroup) return;

    while (this.deltaGhostGroup.children.length > 0) {
      const child = this.deltaGhostGroup.children[0] as Mesh;
      child.geometry?.dispose();
      this.deltaGhostGroup.remove(child);
    }

    const ptsA = this.telemetryEngine.buildSectorDeltaLinePoints(
      sector.index,
      0,
      36
    );
    const ptsB = this.telemetryEngine.buildSectorDeltaLinePoints(
      sector.index,
      1,
      36
    );

    const curveA = new CatmullRomCurve3(ptsA);
    const curveB = new CatmullRomCurve3(ptsB);

    const geoA = new TubeGeometry(curveA, 32, 0.0032, 8, false);
    const matA = new MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00a8ff,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });

    const geoB = new TubeGeometry(curveB, 32, 0.0028, 8, false);
    const matB = new MeshStandardMaterial({
      color: 0xff2a85,
      emissive: 0xd91b6b,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });

    this.deltaGhostGroup.add(new Mesh(geoA, matA));
    this.deltaGhostGroup.add(new Mesh(geoB, matB));

    if (this.apexBeaconMesh) {
      this.apexBeaconMesh.position.copy(sector.apexLocalPos);
      this.apexBeaconMesh.position.y += 0.025;
      this.apexBeaconMesh.visible = true;
    }
  }

  private async resolveSpatialAIDirective(
    sector: SectorMetadata,
    payload: unknown
  ): Promise<SpatialAIDirective> {
    const brakingDelta =
      sector.carBBrakingPointMeters - sector.carABrakingPointMeters;
    const apexDelta = sector.carAMinApexKmh - sector.carBMinApexKmh;

    const deterministicDirective: SpatialAIDirective = {
      sectorId: sector.id,
      headline: `${sector.name} — 3D Delta Ghost Active`,
      brakingDeltaMeters: brakingDelta,
      apexSpeedDeltaKmh: apexDelta,
      recommendedAction: sector.keyInsight,
      spokenBriefing: `${sector.name}. Car A brakes ${Math.abs(
        brakingDelta
      )} meters later than Car B, carrying ${Math.abs(
        apexDelta
      )} kilometers per hour delta at the apex.`,
    };

    const customEndpoint = import.meta.env.VITE_AI_RACE_ENGINEER_URL;
    if (!customEndpoint) {
      return deterministicDirective;
    }

    try {
      const res = await fetch(customEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return deterministicDirective;
      const data = (await res.json()) as Partial<SpatialAIDirective>;
      return {
        ...deterministicDirective,
        ...data,
      };
    } catch {
      return deterministicDirective;
    }
  }

  update(delta: number): void {
    this.pulseClock += delta * 4.5;
    if (this.apexBeaconMesh && this.apexBeaconMesh.visible) {
      const s = 1.0 + Math.sin(this.pulseClock) * 0.22;
      this.apexBeaconMesh.scale.set(s, s, s);
    }
  }
}