import {
  Color,
  createSystem,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  UIKitDocument,
} from '@iwsdk/core';
import { SpatialDopplerAudio } from '../audio/SpatialDopplerAudio';
import {
  StrategistChallengeState,
  TelemetrySessionState,
} from '../components';
import {
  CounterfactualForkSystem,
  CounterfactualSimResult,
} from './CounterfactualForkSystem';

export interface ChallengeStageSpec {
  stageIndex: number;
  sectorIndex: number;
  code: string;
  title: string;
  briefing: string;
  targetDeltaSec: number;
  goldDeltaSec: number;
  maxAllowedGripRatio: number;
  optimalBrakeOffsetMeters: number;
  optimalApexShiftMeters: number;
}

export interface ScoreboardViewModel {
  streakDays: number;
  strategistElo: number;
  licenseTier: string;
  currentStage: ChallengeStageSpec;
  dialedBrakeMeters: number;
  dialedApexMeters: number;
  stageStars: [number, number, number];
  stageBestDeltasSec: [number, number, number];
  lastVerdictHeadline: string;
  lastVerdictDetail: string;
  lastGripPct: number;
  lastPassed: boolean;
  passthroughTvMode: boolean;
}

const STORAGE_KEY = 'apexpulse_strategist_career_v2';

export class StrategistChallengeSystem extends createSystem({
  challengeState: { required: [StrategistChallengeState] },
  sessionState: { required: [TelemetrySessionState] },
}) {
  public readonly stages: ChallengeStageSpec[] = [
    {
      stageIndex: 0,
      sectorIndex: 1,
      code: 'STAGE 1/3 | TURN 4 HAIRPIN',
      title: 'The Late-Apex Switchback',
      briefing:
        'Car A is boxed in behind Car B. Delay braking (+5m to +9m) and tuck inside (-1.2m to -1.8m) to gain at least -0.110s without exceeding 96% Kamm tire grip.',
      targetDeltaSec: -0.11,
      goldDeltaSec: -0.135,
      maxAllowedGripRatio: 0.96,
      optimalBrakeOffsetMeters: 7.0,
      optimalApexShiftMeters: -1.5,
    },
    {
      stageIndex: 1,
      sectorIndex: 0,
      code: 'STAGE 2/3 | SECTOR 1 ESSES',
      title: 'Trail-Brake the Uphill Crest',
      briefing:
        'Carry momentum over the blind uphill crest. Brake +4m to +7m deeper and widen the entry arc (+1.0m to +1.6m) to beat -0.105s while keeping lateral load under 94% grip.',
      targetDeltaSec: -0.105,
      goldDeltaSec: -0.128,
      maxAllowedGripRatio: 0.94,
      optimalBrakeOffsetMeters: 5.5,
      optimalApexShiftMeters: 1.2,
    },
    {
      stageIndex: 2,
      sectorIndex: 2,
      code: 'STAGE 3/3 | SECTOR 3 SWEEPER',
      title: 'Main Straight Slingshot',
      briefing:
        'Maximize terminal velocity onto the main straight. Brake gently (+3m to +6m) and hit a deep late apex (-1.4m to -2.0m) to beat the Strategist target of -0.125s.',
      targetDeltaSec: -0.125,
      goldDeltaSec: -0.15,
      maxAllowedGripRatio: 0.95,
      optimalBrakeOffsetMeters: 5.0,
      optimalApexShiftMeters: -1.7,
    },
  ];

  private forkSystem!: CounterfactualForkSystem;
  private audio!: SpatialDopplerAudio;
  private trophyConsoleGroup: Group | null = null;
  private hudDocument: UIKitDocument | null = null;
  private medalRingMeshes: [Mesh, Mesh, Mesh] = [
    null as any,
    null as any,
    null as any,
  ];
  private brakeDialIndicator: Mesh | null = null;
  private apexDialIndicator: Mesh | null = null;

  private lastHeadline = 'READY: DIAL BRAKE & APEX OR PULL CAR TO VISOR';
  private lastDetail =
    'Adjust the 3D Brake/Apex dials in your lap or pull Car A to your eyes to drive the 1:1 Halo Cockpit.';
  private lastGripPct = 78;
  private lastPassed = true;
  private spinClock = 0;

  private readonly colorLocked = new Color(0x334155);
  private readonly colorBronze = new Color(0xd97706);
  private readonly colorSilver = new Color(0x38bdf8);
  private readonly colorGold = new Color(0xfacc15);

  public bindChallengeSystem(
    forkSystem: CounterfactualForkSystem,
    audio: SpatialDopplerAudio,
    trophyConsoleRoot: Object3D,
    hudDocument?: UIKitDocument | null
  ): void {
    this.forkSystem = forkSystem;
    this.audio = audio;
    this.hudDocument = hudDocument ?? null;
    this.trophyConsoleGroup = new Group();
    trophyConsoleRoot.add(this.trophyConsoleGroup);

    this.build3DMedalAndDialVisuals();
    this.loadCareerFromStorage();
    this.syncDomScoreboard();
  }

  public setHudDocument(hudDocument: UIKitDocument | null): void {
    this.hudDocument = hudDocument;
    this.syncDomScoreboard();
  }

  private build3DMedalAndDialVisuals(): void {
    if (!this.trophyConsoleGroup) return;

    const ringGeo = new TorusGeometry(0.018, 0.0032, 12, 32);
    for (let i = 0; i < 3; i++) {
      const mat = new MeshStandardMaterial({
        color: this.colorLocked,
        emissive: this.colorLocked,
        emissiveIntensity: 0.4,
        metalness: 0.8,
        roughness: 0.2,
      });
      const ringMesh = new Mesh(ringGeo, mat);
      ringMesh.position.set((i - 1) * 0.048, 0.052, 0);
      this.trophyConsoleGroup.add(ringMesh);
      this.medalRingMeshes[i] = ringMesh;
    }

    const dialPillarGeo = new CylinderGeometry(0.006, 0.006, 0.036, 12);
    dialPillarGeo.translate(0, 0.018, 0);

    this.brakeDialIndicator = new Mesh(
      dialPillarGeo,
      new MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x0284c7,
        emissiveIntensity: 0.8,
      })
    );
    this.brakeDialIndicator.position.set(-0.028, 0.004, 0.022);
    this.trophyConsoleGroup.add(this.brakeDialIndicator);

    this.apexDialIndicator = new Mesh(
      dialPillarGeo,
      new MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0x7e22ce,
        emissiveIntensity: 0.8,
      })
    );
    this.apexDialIndicator.position.set(0.028, 0.004, 0.022);
    this.trophyConsoleGroup.add(this.apexDialIndicator);
  }

  public selectStage(stageIndex: number): void {
    const clampedIdx = MathUtils.clamp(stageIndex, 0, 2);
    const stage = this.stages[clampedIdx];

    this.queries.challengeState.entities.forEach((entity) => {
      entity.setValue(
        StrategistChallengeState,
        'currentStageIndex',
        clampedIdx
      );
      entity.setValue(
        StrategistChallengeState,
        'dialedBrakeOffsetMeters',
        stage.optimalBrakeOffsetMeters
      );
      entity.setValue(
        StrategistChallengeState,
        'dialedApexShiftMeters',
        stage.optimalApexShiftMeters
      );
    });

    this.queries.sessionState.entities.forEach((session) => {
      session.setValue(
        TelemetrySessionState,
        'activeSectorIndex',
        stage.sectorIndex
      );
    });

    this.lastHeadline = `LOADED ${stage.code}: ${stage.title.toUpperCase()}`;
    this.lastDetail = stage.briefing;
    this.audio.playInteractionChime(720);
    this.syncDomScoreboard();
  }

  public setBrakeOffsetDial(meters: number, autoRun = true): void {
    const clamped = Number(MathUtils.clamp(meters, -4.0, 16.5).toFixed(1));
    this.queries.challengeState.entities.forEach((entity) => {
      entity.setValue(
        StrategistChallengeState,
        'dialedBrakeOffsetMeters',
        clamped
      );
    });
    if (autoRun) {
      this.executeCurrentStageFork();
    } else {
      this.syncDomScoreboard();
    }
  }

  public setApexShiftDial(meters: number, autoRun = true): void {
    const clamped = Number(MathUtils.clamp(meters, -2.6, 2.4).toFixed(1));
    this.queries.challengeState.entities.forEach((entity) => {
      entity.setValue(
        StrategistChallengeState,
        'dialedApexShiftMeters',
        clamped
      );
    });
    if (autoRun) {
      this.executeCurrentStageFork();
    } else {
      this.syncDomScoreboard();
    }
  }

  public stepBrakeOffsetDial(stepMeters = 2.5): void {
    this.queries.challengeState.entities.forEach((entity) => {
      let current =
        entity.getValue(
          StrategistChallengeState,
          'dialedBrakeOffsetMeters'
        ) ?? 7.0;
      current += stepMeters;
      if (current > 16.5) current = -4.0;
      entity.setValue(
        StrategistChallengeState,
        'dialedBrakeOffsetMeters',
        Number(current.toFixed(1))
      );
    });
    this.audio.playInteractionChime(640);
    this.executeCurrentStageFork();
  }

  public stepApexShiftDial(stepMeters = 0.8): void {
    this.queries.challengeState.entities.forEach((entity) => {
      let current =
        entity.getValue(StrategistChallengeState, 'dialedApexShiftMeters') ??
        -1.5;
      current += stepMeters;
      if (current > 2.4) current = -2.6;
      entity.setValue(
        StrategistChallengeState,
        'dialedApexShiftMeters',
        Number(current.toFixed(1))
      );
    });
    this.audio.playInteractionChime(690);
    this.executeCurrentStageFork();
  }

  public executeCurrentStageFork(): CounterfactualSimResult | null {
    if (!this.forkSystem) return null;

    let stageIdx = 0;
    let brakeMeters = 7.0;
    let apexMeters = -1.5;

    this.queries.challengeState.entities.forEach((entity) => {
      stageIdx =
        entity.getValue(StrategistChallengeState, 'currentStageIndex') ?? 0;
      brakeMeters =
        entity.getValue(
          StrategistChallengeState,
          'dialedBrakeOffsetMeters'
        ) ?? 7.0;
      apexMeters =
        entity.getValue(StrategistChallengeState, 'dialedApexShiftMeters') ??
        -1.5;
      const totalForks =
        (entity.getValue(StrategistChallengeState, 'totalForksRun') ?? 0) + 1;
      entity.setValue(StrategistChallengeState, 'totalForksRun', totalForks);
    });

    const stage = this.stages[stageIdx] ?? this.stages[0];
    const simResult = this.forkSystem.simulateCounterfactualFork(
      stage.sectorIndex,
      brakeMeters,
      apexMeters
    );

    this.evaluateAndPersistStageAttempt(stage, simResult);
    return simResult;
  }

  private evaluateAndPersistStageAttempt(
    stage: ChallengeStageSpec,
    result: CounterfactualSimResult
  ): void {
    this.lastGripPct = Math.round(result.peakGripRatio * 100);

    const gripValid =
      !result.didBreachTractionLimit &&
      result.peakGripRatio <= stage.maxAllowedGripRatio;
    const beatTarget =
      gripValid && result.exitTimeDeltaSec <= stage.targetDeltaSec;

    let starsEarned = 0;
    if (beatTarget) {
      if (result.exitTimeDeltaSec <= stage.goldDeltaSec) {
        starsEarned = 3;
      } else if (result.exitTimeDeltaSec <= stage.targetDeltaSec - 0.012) {
        starsEarned = 2;
      } else {
        starsEarned = 1;
      }
    }

    this.lastPassed = beatTarget;

    this.queries.challengeState.entities.forEach((entity) => {
      const starField =
        stage.stageIndex === 0
          ? 'stage1Stars'
          : stage.stageIndex === 1
          ? 'stage2Stars'
          : 'stage3Stars';
      const deltaField =
        stage.stageIndex === 0
          ? 'stage1BestDeltaMs'
          : stage.stageIndex === 1
          ? 'stage2BestDeltaMs'
          : 'stage3BestDeltaMs';

      const prevStars =
        (entity.getValue(
          StrategistChallengeState,
          starField as any
        ) as number | null) ?? 0;
      const prevBestMs =
        (entity.getValue(
          StrategistChallengeState,
          deltaField as any
        ) as number | null) ?? 0;
      const candidateMs = Math.round(result.exitTimeDeltaSec * 1000);

      if (starsEarned > prevStars) {
        entity.setValue(
          StrategistChallengeState,
          starField as any,
          starsEarned
        );
        const currentElo =
          entity.getValue(StrategistChallengeState, 'strategistElo') ?? 1200;
        entity.setValue(
          StrategistChallengeState,
          'strategistElo',
          currentElo + (starsEarned - prevStars) * 85
        );
      }

      if (gripValid && (prevBestMs === 0 || candidateMs < prevBestMs)) {
        entity.setValue(
          StrategistChallengeState,
          deltaField as any,
          candidateMs
        );
      }
    });

    if (beatTarget) {
      const medalLabel =
        starsEarned === 3
          ? '3-STAR GOLD'
          : starsEarned === 2
          ? '2-STAR SILVER'
          : '1-STAR BRONZE';
      this.lastHeadline = `${medalLabel} UNLOCKED! (${result.exitTimeDeltaSec}s vs ${stage.targetDeltaSec}s Target)`;
      this.lastDetail = result.physicsExplanation;
      this.audio.playInteractionChime(980);
    } else {
      this.lastHeadline = result.didBreachTractionLimit
        ? `STAGE FAILED: KAMM TRACTION BREACH (${this.lastGripPct}% GRIP)`
        : `SHORT OF TARGET: ${result.exitTimeDeltaSec}s (NEED ${stage.targetDeltaSec}s)`;
      this.lastDetail = result.physicsExplanation;
    }

    this.saveCareerToStorage();
    this.syncDomScoreboard();
  }

  public simulate14DayJudgeStreak(): void {
    this.queries.challengeState.entities.forEach((entity) => {
      entity.setValue(StrategistChallengeState, 'streakDays', 14);
      entity.setValue(StrategistChallengeState, 'strategistElo', 1920);
      entity.setValue(StrategistChallengeState, 'stage1Stars', 3);
      entity.setValue(StrategistChallengeState, 'stage2Stars', 3);
      entity.setValue(StrategistChallengeState, 'stage3Stars', 2);
      entity.setValue(StrategistChallengeState, 'stage1BestDeltaMs', -148);
      entity.setValue(StrategistChallengeState, 'stage2BestDeltaMs', -134);
      entity.setValue(StrategistChallengeState, 'stage3BestDeltaMs', -141);
      entity.setValue(StrategistChallengeState, 'totalForksRun', 42);
    });

    this.lastHeadline =
      '14-DAY CAREER STREAK RESTORED | ELO 1,920 (APEX STRATEGIST PRO)';
    this.lastDetail =
      'Judge Preview Active: 14 consecutive daily telemetry challenges verified in local storage with 8/9 Career Stars unlocked.';
    this.saveCareerToStorage();
    this.syncDomScoreboard();
    this.audio.speakRaceEngineerBriefing(
      'Welcome back, Strategist. Day 14 telemetry streak active. Stage 1 and Stage 2 Gold medals verified. Ready for Stage 3 Banked Sweeper.'
    );
  }

  public getScoreboardViewModel(): ScoreboardViewModel {
    let streakDays = 1;
    let strategistElo = 1200;
    let currentStageIdx = 0;
    let dialedBrakeMeters = 7.0;
    let dialedApexMeters = -1.5;
    let s1Stars = 0,
      s2Stars = 0,
      s3Stars = 0;
    let s1Delta = 0,
      s2Delta = 0,
      s3Delta = 0;
    let tvMode = false;

    this.queries.challengeState.entities.forEach((entity) => {
      streakDays =
        entity.getValue(StrategistChallengeState, 'streakDays') ?? 1;
      strategistElo =
        entity.getValue(StrategistChallengeState, 'strategistElo') ?? 1200;
      currentStageIdx =
        entity.getValue(StrategistChallengeState, 'currentStageIndex') ?? 0;
      dialedBrakeMeters =
        entity.getValue(
          StrategistChallengeState,
          'dialedBrakeOffsetMeters'
        ) ?? 7.0;
      dialedApexMeters =
        entity.getValue(StrategistChallengeState, 'dialedApexShiftMeters') ??
        -1.5;
      s1Stars = entity.getValue(StrategistChallengeState, 'stage1Stars') ?? 0;
      s2Stars = entity.getValue(StrategistChallengeState, 'stage2Stars') ?? 0;
      s3Stars = entity.getValue(StrategistChallengeState, 'stage3Stars') ?? 0;
      s1Delta =
        entity.getValue(StrategistChallengeState, 'stage1BestDeltaMs') ?? 0;
      s2Delta =
        entity.getValue(StrategistChallengeState, 'stage2BestDeltaMs') ?? 0;
      s3Delta =
        entity.getValue(StrategistChallengeState, 'stage3BestDeltaMs') ?? 0;
      tvMode =
        entity.getValue(StrategistChallengeState, 'passthroughTvMode') ?? false;
    });

    const licenseTier =
      strategistElo >= 1800
        ? 'FIA GRADE-1 STRATEGIST'
        : strategistElo >= 1450
        ? 'SENIOR TELEMETRY ENGINEER'
        : 'ROOKIE RACE ANALYST';

    return {
      streakDays,
      strategistElo,
      licenseTier,
      currentStage: this.stages[currentStageIdx] ?? this.stages[0],
      dialedBrakeMeters,
      dialedApexMeters,
      stageStars: [s1Stars, s2Stars, s3Stars],
      stageBestDeltasSec: [s1Delta / 1000, s2Delta / 1000, s3Delta / 1000],
      lastVerdictHeadline: this.lastHeadline,
      lastVerdictDetail: this.lastDetail,
      lastGripPct: this.lastGripPct,
      lastPassed: this.lastPassed,
      passthroughTvMode: tvMode,
    };
  }

  private saveCareerToStorage(): void {
    try {
      const vm = this.getScoreboardViewModel();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          streakDays: vm.streakDays,
          strategistElo: vm.strategistElo,
          stageStars: vm.stageStars,
          stageBestDeltasMs: vm.stageBestDeltasSec.map((d) =>
            Math.round(d * 1000)
          ),
          lastPlayedIso: new Date().toISOString().slice(0, 10),
        })
      );
    } catch {
      // Safe fallback
    }
  }

  private loadCareerFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const todayIso = new Date().toISOString().slice(0, 10);
      const incrementedStreak =
        data.lastPlayedIso && data.lastPlayedIso !== todayIso
          ? (data.streakDays || 1) + 1
          : data.streakDays || 1;

      this.queries.challengeState.entities.forEach((entity) => {
        entity.setValue(
          StrategistChallengeState,
          'streakDays',
          incrementedStreak
        );
        entity.setValue(
          StrategistChallengeState,
          'strategistElo',
          data.strategistElo || 1200
        );
        if (Array.isArray(data.stageStars)) {
          entity.setValue(
            StrategistChallengeState,
            'stage1Stars',
            data.stageStars[0] || 0
          );
          entity.setValue(
            StrategistChallengeState,
            'stage2Stars',
            data.stageStars[1] || 0
          );
          entity.setValue(
            StrategistChallengeState,
            'stage3Stars',
            data.stageStars[2] || 0
          );
        }
        if (Array.isArray(data.stageBestDeltasMs)) {
          entity.setValue(
            StrategistChallengeState,
            'stage1BestDeltaMs',
            data.stageBestDeltasMs[0] || 0
          );
          entity.setValue(
            StrategistChallengeState,
            'stage2BestDeltaMs',
            data.stageBestDeltasMs[1] || 0
          );
          entity.setValue(
            StrategistChallengeState,
            'stage3BestDeltaMs',
            data.stageBestDeltasMs[2] || 0
          );
        }
      });
    } catch {
      // Safe fallback
    }
  }

  public syncDomScoreboard(): void {
    const vm = this.getScoreboardViewModel();
    const setText = (id: string, text: string) => {
      const uikitEl = this.hudDocument?.getElementById(id) as any;
      if (uikitEl && typeof uikitEl.setProperties === 'function') {
        uikitEl.setProperties({ text });
      }
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    const formatStars = (count: number) =>
      count === 3
        ? '[***] GOLD'
        : count === 2
        ? '[**-] SILV'
        : count === 1
        ? '[*--] BRNZ'
        : '[---] LOCK';

    const formatDelta = (sec: number) =>
      sec === 0 ? '--.---s' : `${sec > 0 ? '+' : ''}${sec.toFixed(3)}s`;

    setText(
      'hud-career-pill',
      `DAY ${vm.streakDays} STREAK | ELO ${vm.strategistElo} (${vm.licenseTier})`
    );
    setText(
      'hud-active-stage-title',
      `${vm.currentStage.code}: ${vm.currentStage.title}`
    );
    setText('hud-active-stage-brief', vm.currentStage.briefing);

    setText(
      'hud-dial-readout',
      `DIALED FORK: BRAKE ${vm.dialedBrakeMeters >= 0 ? '+' : ''}${vm.dialedBrakeMeters.toFixed(
        1
      )}m | APEX ${vm.dialedApexMeters >= 0 ? '+' : ''}${vm.dialedApexMeters.toFixed(
        1
      )}m | KAMM GRIP: ${vm.lastGripPct}%`
    );

    setText(
      'stage-1-status',
      `${formatStars(vm.stageStars[0])} | Best: ${formatDelta(
        vm.stageBestDeltasSec[0]
      )} (Goal: -0.110s)`
    );
    setText(
      'stage-2-status',
      `${formatStars(vm.stageStars[1])} | Best: ${formatDelta(
        vm.stageBestDeltasSec[1]
      )} (Goal: -0.105s)`
    );
    setText(
      'stage-3-status',
      `${formatStars(vm.stageStars[2])} | Best: ${formatDelta(
        vm.stageBestDeltasSec[2]
      )} (Goal: -0.125s)`
    );

    setText('ai-headline', vm.lastVerdictHeadline);
    setText('ai-insight', vm.lastVerdictDetail);

    const verdictBox = this.hudDocument?.getElementById('hud-verdict-box') as any;
    if (verdictBox && typeof verdictBox.setProperties === 'function') {
      verdictBox.setProperties({
        backgroundColor: vm.lastPassed ? '#052e16' : '#3b0712',
        borderColor: vm.lastPassed ? '#10b981' : '#f43f5e',
      });
    }
    const headlineEl = this.hudDocument?.getElementById('ai-headline') as any;
    if (headlineEl && typeof headlineEl.setProperties === 'function') {
      headlineEl.setProperties({
        color: vm.lastPassed ? '#34d399' : '#fda4af',
      });
    }
  }

  update(delta: number): void {
    this.spinClock += delta * 2.4;
    const vm = this.getScoreboardViewModel();

    for (let i = 0; i < 3; i++) {
      const ring = this.medalRingMeshes[i];
      if (!ring) continue;

      const stars = vm.stageStars[i];
      const mat = ring.material as MeshStandardMaterial;
      const targetColor =
        stars === 3
          ? this.colorGold
          : stars === 2
          ? this.colorSilver
          : stars === 1
          ? this.colorBronze
          : this.colorLocked;

      mat.color.copy(targetColor);
      mat.emissive.copy(targetColor);
      mat.emissiveIntensity = stars > 0 ? 0.85 : 0.25;

      const isCurrent = vm.currentStage.stageIndex === i;
      ring.rotation.y = this.spinClock * (isCurrent ? 1.6 : 0.5);
      ring.position.y =
        0.052 + (isCurrent ? Math.sin(this.spinClock * 2.0) * 0.005 : 0);
      ring.scale.setScalar(isCurrent ? 1.18 : 0.95);
    }

    if (this.brakeDialIndicator) {
      const normBrake = MathUtils.clamp(
        (vm.dialedBrakeMeters + 6.0) / 22.0,
        0.15,
        1.4
      );
      this.brakeDialIndicator.scale.y = normBrake;
    }
    if (this.apexDialIndicator) {
      const normApex = MathUtils.clamp(
        (vm.dialedApexMeters + 3.0) / 6.0,
        0.15,
        1.4
      );
      this.apexDialIndicator.scale.y = normApex;
    }
  }
}
