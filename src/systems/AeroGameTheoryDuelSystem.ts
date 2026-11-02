import {
  Color,
  createSystem,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { SpatialDopplerAudio } from '../audio/SpatialDopplerAudio';
import {
  StrategistChallengeState,
  TelemetrySessionState,
} from '../components';
import {
  CarKinematicSnapshot,
  CircuitTelemetryEngine,
} from '../telemetry/CircuitTelemetryEngine';
import { CounterfactualForkSystem } from './CounterfactualForkSystem';

export type DefenderStrategy =
  | 'INSIDE_BLOCK'
  | 'MID_LINE_SQUEEZE'
  | 'OVER_UNDER_SWITCHBACK';

export interface GameTheoryDuelVerdict {
  attackerMove: string;
  defenderCounter: DefenderStrategy;
  wakeAlignmentPct: number;
  downforceLossPct: number;
  slipstreamTowKmh: number;
  ersBoostUsedPct: number;
  effectiveGripCeilingG: number;
  netOvertakeDeltaSec: number;
  didSucceedOvertake: boolean;
  shareableGhostCode: string;
  tacticalSummary: string;
}

export class AeroGameTheoryDuelSystem extends createSystem({
  sessionState: { required: [TelemetrySessionState] },
  challengeState: { required: [StrategistChallengeState] },
}) {
  private engine!: CircuitTelemetryEngine;
  private forkSystem!: CounterfactualForkSystem;
  private audio!: SpatialDopplerAudio;
  private trackRoot!: Object3D;

  private readonly wakeRingCount = 14;
  private readonly wakeRingMeshes: Mesh[] = [];
  private readonly wakeGroup = new Group();
  private readonly colorSlipstreamTow = new Color(0x10b981);
  private readonly colorDirtyAirVortex = new Color(0xf43f5e);

  private ersDeployRatio = 0.65;
  private multiplayerChannel: BroadcastChannel | null = null;
  private humanDefenderOverride: DefenderStrategy | null = null;

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
    tireTempsC: [95, 95, 95, 95],
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
    tireTempsC: [95, 95, 95, 95],
  };

  private readonly wakePos = new Vector3();
  private readonly lookAtPos = new Vector3();
  private flowClock = 0;

  private onDuelVerdictCallback:
    | ((verdict: GameTheoryDuelVerdict) => void)
    | null = null;

  public bindAeroDuelEngine(
    engine: CircuitTelemetryEngine,
    forkSystem: CounterfactualForkSystem,
    audio: SpatialDopplerAudio,
    trackRoot: Object3D,
    onVerdict: (verdict: GameTheoryDuelVerdict) => void
  ): void {
    this.engine = engine;
    this.forkSystem = forkSystem;
    this.audio = audio;
    this.trackRoot = trackRoot;
    this.onDuelVerdictCallback = onVerdict;

    this.buildVolumetricAeroWakeRings();
    this.initMultiplayerGhostBridge();
  }

  private buildVolumetricAeroWakeRings(): void {
    const ringGeo = new TorusGeometry(0.0085, 0.0014, 8, 20);
    for (let i = 0; i < this.wakeRingCount; i++) {
      const mat = new MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.75,
        transparent: true,
        opacity: 0.7 * (1.0 - i / this.wakeRingCount),
      });
      const mesh = new Mesh(ringGeo, mat);
      this.wakeGroup.add(mesh);
      this.wakeRingMeshes.push(mesh);
    }
    this.trackRoot.add(this.wakeGroup);
  }

  public evaluateAeroGameTheoryDuel(): GameTheoryDuelVerdict {
    let stageIdx = 0;
    let brakeOffsetMeters = 7.0;
    let apexShiftMeters = -1.5;

    this.queries.challengeState.entities.forEach((entity) => {
      stageIdx =
        entity.getValue(StrategistChallengeState, 'currentStageIndex') ?? 0;
      brakeOffsetMeters =
        entity.getValue(StrategistChallengeState, 'dialedBrakeOffsetMeters') ??
        7.0;
      apexShiftMeters =
        entity.getValue(StrategistChallengeState, 'dialedApexShiftMeters') ??
        -1.5;
    });

    const sectorIdx = stageIdx === 0 ? 1 : stageIdx === 1 ? 0 : 2;

    const defenderCounter =
      this.humanDefenderOverride ??
      this.solveMinimaxDefenderResponse(
        brakeOffsetMeters,
        apexShiftMeters,
        this.ersDeployRatio
      );

    const defenderLineMeters =
      defenderCounter === 'INSIDE_BLOCK'
        ? -1.4
        : defenderCounter === 'MID_LINE_SQUEEZE'
        ? -0.4
        : 1.1;

    const lateralSeparationMeters = Math.abs(
      apexShiftMeters - defenderLineMeters
    );
    const wakeSigma = 1.15;
    const wakeAlignment = Math.exp(
      -(lateralSeparationMeters * lateralSeparationMeters) /
        (2 * wakeSigma * wakeSigma)
    );

    const slipstreamTowKmh = Number((11.8 * wakeAlignment).toFixed(1));
    const downforceLossFraction = 0.24 * wakeAlignment;
    const effectiveGripCeilingG = Number(
      (4.15 * (1.0 - downforceLossFraction)).toFixed(2)
    );

    const dirtyAirBrakePenaltyMeters = downforceLossFraction * 18.5;
    const ersExitGainSec = this.ersDeployRatio * 0.048;

    const baseSim = this.forkSystem.simulateCounterfactualFork(
      sectorIdx,
      brakeOffsetMeters + dirtyAirBrakePenaltyMeters * 0.5,
      apexShiftMeters
    );

    const laneSqueezePenaltySec =
      lateralSeparationMeters < 0.55 ? 0.145 : 0.0;

    const netDeltaSec = Number(
      (
        baseSim.exitTimeDeltaSec -
        ersExitGainSec +
        laneSqueezePenaltySec
      ).toFixed(3)
    );
    const didWin =
      !baseSim.didBreachTractionLimit &&
      lateralSeparationMeters >= 0.55 &&
      netDeltaSec <= -0.105;

    const attackerMoveLabel =
      apexShiftMeters < -0.8
        ? 'Clean-Air Inside Dive'
        : apexShiftMeters > 0.8
        ? 'High-Line Aero Switchback'
        : 'Center-Wake Trail-Brake';

    const shareableGhostCode = this.encodeGhostChallengeUrl(
      stageIdx,
      brakeOffsetMeters,
      apexShiftMeters,
      this.ersDeployRatio,
      defenderCounter
    );

    const verdict: GameTheoryDuelVerdict = {
      attackerMove: attackerMoveLabel,
      defenderCounter,
      wakeAlignmentPct: Math.round(wakeAlignment * 100),
      downforceLossPct: Math.round(downforceLossFraction * 100),
      slipstreamTowKmh,
      ersBoostUsedPct: Math.round(this.ersDeployRatio * 100),
      effectiveGripCeilingG,
      netOvertakeDeltaSec: netDeltaSec,
      didSucceedOvertake: didWin,
      shareableGhostCode,
      tacticalSummary:
        lateralSeparationMeters < 0.55
          ? `GAME-THEORY BLOCK: Car B executed ${defenderCounter}, trapping you in ${Math.round(
              wakeAlignment * 100
            )}% dirty air (-${Math.round(
              downforceLossFraction * 100
            )}% front downforce). Pitch your hand wider into clean air!`
          : didWin
          ? `NASH EQUILIBRIUM BROKEN (${netDeltaSec}s)! You dodged Car B's ${defenderCounter} in clean air (${Math.round(
              downforceLossFraction * 100
            )}% wake loss) + ${Math.round(
              this.ersDeployRatio * 100
            )}% ERS deploy.`
          : baseSim.physicsExplanation,
    };

    this.multiplayerChannel?.postMessage({
      type: 'DUEL_FORK_UPDATE',
      verdict,
    });

    if (this.onDuelVerdictCallback) {
      this.onDuelVerdictCallback(verdict);
    }

    return verdict;
  }

  private solveMinimaxDefenderResponse(
    brakeOffsetMeters: number,
    apexShiftMeters: number,
    ersRatio: number
  ): DefenderStrategy {
    if (apexShiftMeters < -0.9 && brakeOffsetMeters < 6.5) {
      return 'INSIDE_BLOCK';
    }
    if (brakeOffsetMeters >= 9.0) {
      return 'OVER_UNDER_SWITCHBACK';
    }
    return ersRatio > 0.8 ? 'INSIDE_BLOCK' : 'MID_LINE_SQUEEZE';
  }

  public encodeGhostChallengeUrl(
    stageIdx: number,
    brakeM: number,
    apexM: number,
    ers: number,
    def: DefenderStrategy
  ): string {
    const payload = `${stageIdx}|${brakeM.toFixed(1)}|${apexM.toFixed(
      1
    )}|${ers.toFixed(2)}|${def[0]}`;
    try {
      const code = btoa(payload).replace(/=/g, '');
      window.history.replaceState(null, '', `#duel=${code}`);
      return code;
    } catch {
      return 'APX-GHOST-01';
    }
  }

  private initMultiplayerGhostBridge(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.multiplayerChannel = new BroadcastChannel('apexpulse_xr_duel_room');
      this.multiplayerChannel.onmessage = (ev) => {
        if (ev.data?.type === 'DEFENDER_STRATEGY_OVERRIDE') {
          this.humanDefenderOverride = ev.data.strategy as DefenderStrategy;
          this.audio.playInteractionChime(890);
          this.evaluateAeroGameTheoryDuel();
        }
      };
    }

    const hash = window.location.hash;
    if (hash.startsWith('#duel=')) {
      try {
        const raw = atob(hash.slice(6));
        const [st, br, ap, er] = raw.split('|');
        this.ersDeployRatio = parseFloat(er) || 0.7;
        this.queries.challengeState.entities.forEach((entity) => {
          entity.setValue(
            StrategistChallengeState,
            'currentStageIndex',
            parseInt(st, 10) || 0
          );
          entity.setValue(
            StrategistChallengeState,
            'dialedBrakeOffsetMeters',
            parseFloat(br) || 7.0
          );
          entity.setValue(
            StrategistChallengeState,
            'dialedApexShiftMeters',
            parseFloat(ap) || -1.5
          );
        });
      } catch {
        // Ignore malformed URL hash
      }
    }
  }

  update(delta: number): void {
    if (!this.engine) return;
    this.flowClock += delta * 3.8;

    let playheadSec = 19.8;
    let scenarioIdx = 0;
    this.queries.sessionState.entities.forEach((entity) => {
      playheadSec =
        entity.getValue(TelemetrySessionState, 'playheadSec') ?? 19.8;
      scenarioIdx =
        entity.getValue(TelemetrySessionState, 'scenarioIndex') ?? 0;
    });

    this.engine.evaluateCarState(0, playheadSec, scenarioIdx, this.snapA);
    this.engine.evaluateCarState(1, playheadSec, scenarioIdx, this.snapB);

    const isCorneringDirtyAir = this.snapB.lateralG > 1.85;
    this.trackRoot.updateMatrixWorld();

    for (let i = 0; i < this.wakeRingCount; i++) {
      const ring = this.wakeRingMeshes[i];
      const trailDelaySec =
        (i + (((this.flowClock % 1.0) + 1.0) % 1.0)) * 0.085;
      const sampleTime =
        (playheadSec - trailDelaySec + this.engine.lapDurationSec) %
        this.engine.lapDurationSec;

      this.engine.evaluateCarState(1, sampleTime, scenarioIdx, this.snapB);
      this.wakePos.copy(this.snapB.localPos);
      this.wakePos.y += 0.006;

      ring.position.copy(this.wakePos);
      this.lookAtPos.copy(this.wakePos).add(this.snapB.tangent);
      this.trackRoot.localToWorld(this.lookAtPos);
      ring.lookAt(this.lookAtPos);

      const expansion = 0.65 + (i / this.wakeRingCount) * 1.65;
      ring.scale.set(expansion, expansion * 0.75, 1.0);

      const mat = ring.material as MeshStandardMaterial;
      mat.color.copy(
        isCorneringDirtyAir
          ? this.colorDirtyAirVortex
          : this.colorSlipstreamTow
      );
      mat.emissive.copy(mat.color);
    }
  }
}
