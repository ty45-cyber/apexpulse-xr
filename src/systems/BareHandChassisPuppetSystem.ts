import {
  BoxGeometry,
  Color,
  createSystem,
  Euler,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  Vector3,
} from '@iwsdk/core';
import {
  StrategistChallengeState,
  TelemetrySessionState,
} from '../components';
import { AeroGameTheoryDuelSystem } from './AeroGameTheoryDuelSystem';

export interface ChassisWeightTransferState {
  palmPitchDeg: number;
  palmRollDeg: number;
  frontAxleLoadPct: number;
  outerTireSaturationRatio: number;
  ersPinchActive: boolean;
  pseudoHapticIntensity: number;
}

export class BareHandChassisPuppetSystem extends createSystem({
  sessionState: { required: [TelemetrySessionState] },
  challengeState: { required: [StrategistChallengeState] },
}) {
  private aeroDuelSystem!: AeroGameTheoryDuelSystem;
  private explodedBayRoot!: Object3D;
  private chassisHologramGroup = new Group();
  private chassisPlateMesh: Mesh | null = null;

  private readonly contactPatchRings: [Mesh, Mesh, Mesh, Mesh] = [
    null as any,
    null as any,
    null as any,
    null as any,
  ];

  private audioCtx: AudioContext | null = null;
  private tireScrubGain: GainNode | null = null;
  private tireScrubFilter: BiquadFilterNode | null = null;
  private tireScrubPanner: PannerNode | null = null;

  private readonly handWorldPos = new Vector3();
  private readonly handWorldQuat = new Quaternion();
  private readonly handEuler = new Euler(0, 0, 0, 'YXZ');
  private readonly jitterOffset = new Vector3();

  private isPuppetModeActive = false;
  private ersPinchHeld = false;
  private hapticPhase = 0;
  private lastRadioCalloutTime = 0;

  private readonly colorOptimalPatch = new Color(0x00f0ff);
  private readonly colorOverloadedPatch = new Color(0xf43f5e);

  public readonly liveChassisState: ChassisWeightTransferState = {
    palmPitchDeg: 0,
    palmRollDeg: 0,
    frontAxleLoadPct: 48,
    outerTireSaturationRatio: 0.65,
    ersPinchActive: false,
    pseudoHapticIntensity: 0,
  };

  public bindChassisPuppet(
    aeroDuelSystem: AeroGameTheoryDuelSystem,
    explodedBayRoot: Object3D
  ): void {
    this.aeroDuelSystem = aeroDuelSystem;
    this.explodedBayRoot = explodedBayRoot;

    this.buildContactPatchHologram();
  }

  private buildContactPatchHologram(): void {
    const patchOffsets: [number, number][] = [
      [-0.028, -0.028], // FL
      [0.028, -0.028],  // FR
      [-0.028, 0.028],  // RL
      [0.028, 0.028],   // RR
    ];

    const ringGeo = new RingGeometry(0.011, 0.017, 24);
    ringGeo.rotateX(-Math.PI * 0.5);

    for (let i = 0; i < 4; i++) {
      const mat = new MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 0.75,
        transparent: true,
        opacity: 0.85,
        side: 2,
      });
      const ring = new Mesh(ringGeo, mat);
      ring.position.set(patchOffsets[i][0], 0.007, patchOffsets[i][1]);
      this.chassisHologramGroup.add(ring);
      this.contactPatchRings[i] = ring;
    }

    const chassisGeo = new BoxGeometry(0.032, 0.005, 0.056);
    const chassisMat = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.65,
      roughness: 0.25,
      metalness: 0.8,
    });
    this.chassisPlateMesh = new Mesh(chassisGeo, chassisMat);
    this.chassisPlateMesh.position.set(0, 0.022, 0);
    this.chassisHologramGroup.add(this.chassisPlateMesh);

    this.explodedBayRoot.add(this.chassisHologramGroup);
  }

  private ensureScrubAudio(): void {
    if (this.audioCtx) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.audioCtx = new AudioCtx();
      const osc = this.audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 185;

      this.tireScrubFilter = this.audioCtx.createBiquadFilter();
      this.tireScrubFilter.type = 'bandpass';
      this.tireScrubFilter.frequency.value = 640;
      this.tireScrubFilter.Q.value = 3.5;

      this.tireScrubGain = this.audioCtx.createGain();
      this.tireScrubGain.gain.value = 0.0;

      this.tireScrubPanner = this.audioCtx.createPanner();
      this.tireScrubPanner.panningModel = 'HRTF';
      this.tireScrubPanner.positionX.value = -0.18;
      this.tireScrubPanner.positionY.value = 1.05;
      this.tireScrubPanner.positionZ.value = -0.35;

      osc.connect(this.tireScrubFilter);
      this.tireScrubFilter.connect(this.tireScrubGain);
      this.tireScrubGain.connect(this.tireScrubPanner);
      this.tireScrubPanner.connect(this.audioCtx.destination);
      osc.start();
    } catch {
      // Safe fallback if audio context is blocked before gesture
    }
  }

  public setPalmPuppetMode(active: boolean, announce = false): void {
    this.isPuppetModeActive = active;
    if (active) {
      this.ensureScrubAudio();
    } else if (this.tireScrubGain && this.audioCtx) {
      this.tireScrubGain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.05);
    }

    if (announce) {
      this.triggerAdversarialPitRadio(
        'ENGINEER_LEFT',
        active
          ? 'Bare-hand chassis puppet online. Pitch palm forward to load front axle; roll palm to shift clean-air apex.'
          : 'Chassis puppet standby.'
      );
    }
  }

  public triggerAdversarialPitRadio(
    channel: 'ENGINEER_LEFT' | 'RIVAL_RIGHT',
    message: string
  ): void {
    const nowMs = performance.now();
    if (nowMs - this.lastRadioCalloutTime < 1400) return;
    this.lastRadioCalloutTime = nowMs;

    this.ensureScrubAudio();
    if (this.audioCtx) {
      const beepOsc = this.audioCtx.createOscillator();
      const beepGain = this.audioCtx.createGain();
      const panner = this.audioCtx.createStereoPanner();
      panner.pan.value = channel === 'ENGINEER_LEFT' ? -0.75 : 0.75;

      beepOsc.type = 'sine';
      beepOsc.frequency.value = channel === 'ENGINEER_LEFT' ? 1040 : 740;
      beepGain.gain.setValueAtTime(0.06, this.audioCtx.currentTime);
      beepGain.gain.exponentialRampToValueAtTime(
        0.001,
        this.audioCtx.currentTime + 0.09
      );

      beepOsc.connect(beepGain);
      beepGain.connect(panner);
      panner.connect(this.audioCtx.destination);
      beepOsc.start();
      beepOsc.stop(this.audioCtx.currentTime + 0.095);
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(message);
      utt.rate = channel === 'ENGINEER_LEFT' ? 1.08 : 1.14;
      utt.pitch = channel === 'ENGINEER_LEFT' ? 1.02 : 0.84;
      window.speechSynthesis.speak(utt);
    }
  }

  update(delta: number): void {
    if (!this.explodedBayRoot) return;
    const dt = Math.min(delta, 0.1);
    this.hapticPhase += dt * 42.0;

    let pitchDeg = 0;
    let rollDeg = 0;
    const xrSessionActive = Boolean(this.world.session);
    const rightGrip = this.world.player?.gripSpaces?.right;

    if (xrSessionActive && rightGrip && this.isPuppetModeActive) {
      rightGrip.getWorldPosition(this.handWorldPos);
      rightGrip.getWorldQuaternion(this.handWorldQuat);
      this.handEuler.setFromQuaternion(this.handWorldQuat, 'YXZ');

      pitchDeg = MathUtils.clamp(MathUtils.radToDeg(this.handEuler.x), -28, 28);
      rollDeg = MathUtils.clamp(MathUtils.radToDeg(this.handEuler.z), -35, 35);

      const mappedBrake = Number(
        MathUtils.clamp(6.5 - pitchDeg * 0.25, -4.0, 15.0).toFixed(1)
      );
      const mappedApex = Number(
        MathUtils.clamp(-rollDeg * 0.065, -2.5, 2.5).toFixed(1)
      );

      this.queries.challengeState.entities.forEach((entity) => {
        entity.setValue(
          StrategistChallengeState,
          'dialedBrakeOffsetMeters',
          mappedBrake
        );
        entity.setValue(
          StrategistChallengeState,
          'dialedApexShiftMeters',
          mappedApex
        );
      });
    } else {
      // Derive chassis pitch & roll from dialed counterfactual state on desktop / passive mode
      let brakeMeters = 7.0;
      let apexMeters = -1.5;
      this.queries.challengeState.entities.forEach((entity) => {
        brakeMeters =
          entity.getValue(
            StrategistChallengeState,
            'dialedBrakeOffsetMeters'
          ) ?? 7.0;
        apexMeters =
          entity.getValue(StrategistChallengeState, 'dialedApexShiftMeters') ??
          -1.5;
      });
      pitchDeg = MathUtils.clamp(-(brakeMeters - 5.0) * 1.9, -24, 18);
      rollDeg = MathUtils.clamp(-apexMeters * 11.5, -32, 32);
    }

    const frontLoadPct = MathUtils.clamp(50 - pitchDeg * 0.68, 34, 72);
    const saturation = MathUtils.clamp(
      0.56 + Math.abs(rollDeg) * 0.013 + Math.abs(pitchDeg) * 0.009,
      0.25,
      1.32
    );
    const hapticIntensity = MathUtils.clamp((saturation - 0.9) * 2.4, 0, 1.0);

    this.liveChassisState.palmPitchDeg = Number(pitchDeg.toFixed(1));
    this.liveChassisState.palmRollDeg = Number(rollDeg.toFixed(1));
    this.liveChassisState.frontAxleLoadPct = Math.round(frontLoadPct);
    this.liveChassisState.outerTireSaturationRatio = Number(
      saturation.toFixed(2)
    );
    this.liveChassisState.ersPinchActive = this.ersPinchHeld;
    this.liveChassisState.pseudoHapticIntensity = Number(
      hapticIntensity.toFixed(2)
    );

    if (this.chassisPlateMesh) {
      this.chassisPlateMesh.rotation.x = MathUtils.degToRad(pitchDeg * 0.45);
      this.chassisPlateMesh.rotation.z = MathUtils.degToRad(rollDeg * 0.45);
    }

    const frontScale = frontLoadPct / 50;
    const rearScale = (100 - frontLoadPct) / 50;
    const leftBias = 1.0 + MathUtils.clamp(rollDeg / 35, -0.35, 0.35);
    const rightBias = 1.0 - MathUtils.clamp(rollDeg / 35, -0.35, 0.35);
    const patchLoads = [
      frontScale * leftBias,
      frontScale * rightBias,
      rearScale * leftBias,
      rearScale * rightBias,
    ];

    for (let i = 0; i < 4; i++) {
      const ring = this.contactPatchRings[i];
      if (!ring) continue;
      const load = MathUtils.clamp(patchLoads[i], 0.45, 1.55);
      ring.scale.setScalar(load);

      const mat = ring.material as MeshStandardMaterial;
      const overloadT = MathUtils.clamp((load - 0.9) / 0.5, 0, 1);
      mat.color.lerpColors(
        this.colorOptimalPatch,
        this.colorOverloadedPatch,
        overloadT
      );
      mat.emissive.copy(mat.color);
    }

    if (hapticIntensity > 0.02) {
      const amp = hapticIntensity * 0.0024;
      this.jitterOffset.set(
        Math.sin(this.hapticPhase) * amp,
        Math.cos(this.hapticPhase * 1.3) * amp * 0.7,
        0
      );
      this.chassisHologramGroup.position.copy(this.jitterOffset);

      if (xrSessionActive && this.isPuppetModeActive) {
        this.world.input?.xr?.visualAdapters?.hand?.right?.applyVisualOffsetWorld?.(
          this.jitterOffset
        );
      }

      if (this.tireScrubGain && this.tireScrubFilter && this.audioCtx) {
        this.tireScrubGain.gain.setTargetAtTime(
          hapticIntensity * 0.035,
          this.audioCtx.currentTime,
          0.03
        );
        this.tireScrubFilter.frequency.setTargetAtTime(
          520 + hapticIntensity * 680,
          this.audioCtx.currentTime,
          0.03
        );
      }
    } else {
      this.chassisHologramGroup.position.set(0, 0, 0);
      if (this.tireScrubGain && this.audioCtx) {
        this.tireScrubGain.gain.setTargetAtTime(
          0,
          this.audioCtx.currentTime,
          0.05
        );
      }
    }
  }
}
