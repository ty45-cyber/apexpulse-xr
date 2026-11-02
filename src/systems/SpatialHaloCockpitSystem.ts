import {
  BoxGeometry,
  CylinderGeometry,
  createSystem,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Pressed,
  SphereGeometry,
  TorusGeometry,
  Transform,
  Vector3,
} from '@iwsdk/core';
import { SpatialDopplerAudio } from '../audio/SpatialDopplerAudio';
import {
  StrategistChallengeState,
  TelemetryCarNode,
  TelemetrySessionState,
} from '../components';

export type CockpitScaleMode = 'MACRO_PIT_WALL' | 'FIRST_PERSON_HALO_COCKPIT';
export type PaddleShiftDirection = 'DOWNSHIFT_LEFT' | 'UPSHIFT_RIGHT';

export interface HaloCockpitDuelTelemetry {
  steerAngleDeg: number;
  gear: number;
  speedKmh: number;
  rpm: number;
  ersPct: number;
  duelElapsedSec: number;
  gapToRivalMeters: number;
  didPassRival: boolean;
}

export class SpatialHaloCockpitSystem extends createSystem({
  sessionState: { required: [TelemetrySessionState] },
  challengeState: { required: [StrategistChallengeState] },
  carNodes: { required: [Transform, TelemetryCarNode] },
}) {
  public mode: CockpitScaleMode = 'MACRO_PIT_WALL';

  public readonly telemetry: HaloCockpitDuelTelemetry = {
    steerAngleDeg: 0,
    gear: 7,
    speedKmh: 294,
    rpm: 11400,
    ersPct: 86,
    duelElapsedSec: 0,
    gapToRivalMeters: 9.5,
    didPassRival: false,
  };

  private audio!: SpatialDopplerAudio;
  private trackTableGroup!: Object3D;
  private anchorEntity: any = null;
  private onDuelCompleteCallback:
    | ((duelTelemetry: HaloCockpitDuelTelemetry) => void)
    | null = null;

  private readonly haloRoot = new Group();
  private readonly yokeGroup = new Group();
  private readonly rivalCarGroup = new Group();
  private readonly speedCurbStrips: Mesh[] = [];
  private readonly shiftLightLeds: Mesh[] = [];
  private leftPaddleMesh: Mesh | null = null;
  private rightPaddleMesh: Mesh | null = null;
  private rivalRainLightMesh: Mesh | null = null;

  private readonly duelDurationSec = 7.5;
  private paddleLeftRecoil = 0;
  private paddleRightRecoil = 0;
  private flashClock = 0;

  private readonly headWorldPos = new Vector3();
  private readonly carWorldPos = new Vector3();
  private readonly leftHandPos = new Vector3();
  private readonly rightHandPos = new Vector3();
  private readonly engineSoundWorldPos = new Vector3();

  public bindHaloCockpit(
    audio: SpatialDopplerAudio,
    trackTableGroup: Object3D,
    haloCockpitAnchorEntity: any,
    onDuelComplete: (duelTelemetry: HaloCockpitDuelTelemetry) => void
  ): void {
    this.audio = audio;
    this.trackTableGroup = trackTableGroup;
    this.anchorEntity = haloCockpitAnchorEntity;
    this.onDuelCompleteCallback = onDuelComplete;

    this.buildFirstPersonHaloGeometry();
    if (this.anchorEntity?.object3D) {
      this.anchorEntity.object3D.add(this.haloRoot);
    }
    this.haloRoot.visible = false;
  }

  private buildFirstPersonHaloGeometry(): void {
    const carbonMat = new MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.28,
      metalness: 0.85,
    });

    // 1. FIA Titanium Halo Central Pillar & Curved Upper Protection Arch (scaled cleanly inside 0.56m seated envelope)
    const pillarGeo = new CylinderGeometry(0.008, 0.011, 0.22, 16);
    const pillarMesh = new Mesh(pillarGeo, carbonMat);
    pillarMesh.position.set(0, 0.05, -0.05);
    pillarMesh.rotation.x = 0.22;
    this.haloRoot.add(pillarMesh);

    const archGeo = new TorusGeometry(0.22, 0.011, 14, 42, Math.PI);
    const archMesh = new Mesh(archGeo, carbonMat);
    archMesh.position.set(0, 0.145, 0.04);
    archMesh.rotation.x = Math.PI * 0.44;
    this.haloRoot.add(archMesh);

    // Subtle Cyan HUD Framing Trim along Halo Arch
    const haloAccentGeo = new TorusGeometry(0.214, 0.0025, 10, 42, Math.PI);
    const haloAccentMesh = new Mesh(
      haloAccentGeo,
      new MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 0.85,
      })
    );
    haloAccentMesh.position.copy(archMesh.position);
    haloAccentMesh.rotation.copy(archMesh.rotation);
    this.haloRoot.add(haloAccentMesh);

    // 2. F1 Carbon-Fiber Air-Yoke Steering Wheel + 10 Shift-Light LEDs + Pinch Paddles
    this.yokeGroup.position.set(0, -0.065, 0.075);
    this.haloRoot.add(this.yokeGroup);

    const yokeHub = new Mesh(new BoxGeometry(0.14, 0.068, 0.016), carbonMat);
    this.yokeGroup.add(yokeHub);

    const gripGeo = new CylinderGeometry(0.01, 0.01, 0.082, 14);
    const gripMat = new MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.35,
    });
    const leftGrip = new Mesh(gripGeo, gripMat);
    leftGrip.position.set(-0.074, -0.004, 0.004);
    this.yokeGroup.add(leftGrip);

    const rightGrip = new Mesh(gripGeo, gripMat);
    rightGrip.position.set(0.074, -0.004, 0.004);
    this.yokeGroup.add(rightGrip);

    const paddleGeo = new BoxGeometry(0.026, 0.044, 0.006);
    const paddleMat = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      metalness: 0.8,
      roughness: 0.2,
    });
    this.leftPaddleMesh = new Mesh(paddleGeo, paddleMat);
    this.leftPaddleMesh.position.set(-0.056, 0.008, -0.014);
    this.yokeGroup.add(this.leftPaddleMesh);

    this.rightPaddleMesh = new Mesh(paddleGeo, paddleMat.clone());
    this.rightPaddleMesh.position.set(0.056, 0.008, -0.014);
    this.yokeGroup.add(this.rightPaddleMesh);

    const ledGeo = new SphereGeometry(0.0032, 10, 10);
    for (let i = 0; i < 10; i++) {
      const hex = i < 4 ? 0x10b981 : i < 7 ? 0xf43f5e : 0x38bdf8;
      const ledMat = new MeshStandardMaterial({
        color: hex,
        emissive: hex,
        emissiveIntensity: 0.9,
      });
      const led = new Mesh(ledGeo, ledMat);
      led.position.set(-0.045 + i * 0.01, 0.026, 0.01);
      this.yokeGroup.add(led);
      this.shiftLightLeds.push(led);
    }

    // 3. Rival Car B Ahead in 1:1 Perspective (with blinking FIA Rain Light)
    const rivalBody = new Mesh(
      new BoxGeometry(0.068, 0.024, 0.12),
      new MeshStandardMaterial({
        color: 0xff2a85,
        emissive: 0xd91b6b,
        emissiveIntensity: 0.55,
        metalness: 0.8,
        roughness: 0.25,
      })
    );
    this.rivalCarGroup.add(rivalBody);

    const rearWing = new Mesh(
      new BoxGeometry(0.078, 0.018, 0.012),
      carbonMat
    );
    rearWing.position.set(0, 0.018, 0.052);
    this.rivalCarGroup.add(rearWing);

    this.rivalRainLightMesh = new Mesh(
      new SphereGeometry(0.0055, 12, 12),
      new MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xf43f5e,
        emissiveIntensity: 1.2,
      })
    );
    this.rivalRainLightMesh.position.set(0, 0.004, 0.062);
    this.rivalCarGroup.add(this.rivalRainLightMesh);

    this.rivalCarGroup.position.set(0, -0.03, -0.14);
    this.haloRoot.add(this.rivalCarGroup);

    // 4. Rushing Apex Kerb Strips Framing the Braking Chute
    const curbGeo = new BoxGeometry(0.014, 0.003, 0.036);
    for (let c = 0; c < 12; c++) {
      const isLeft = c % 2 === 0;
      const isRed = Math.floor(c / 2) % 2 === 0;
      const curbMat = new MeshStandardMaterial({
        color: isRed ? 0xf43f5e : 0xf8fafc,
        emissive: isRed ? 0x9f1239 : 0x334155,
        emissiveIntensity: 0.45,
      });
      const curb = new Mesh(curbGeo, curbMat);
      const laneIdx = Math.floor(c / 2);
      curb.position.set(
        isLeft ? -0.145 : 0.145,
        -0.085,
        0.08 - laneIdx * 0.048
      );
      this.haloRoot.add(curb);
      this.speedCurbStrips.push(curb);
    }
  }

  public enterFirstPersonHaloCockpit(): void {
    if (this.mode === 'FIRST_PERSON_HALO_COCKPIT') return;
    this.mode = 'FIRST_PERSON_HALO_COCKPIT';

    if (this.trackTableGroup) {
      this.trackTableGroup.visible = false;
    }
    this.haloRoot.visible = true;

    this.telemetry.duelElapsedSec = 0;
    this.telemetry.gear = 7;
    this.telemetry.speedKmh = 296;
    this.telemetry.rpm = 11650;
    this.telemetry.ersPct = 92;
    this.telemetry.steerAngleDeg = -12;
    this.telemetry.gapToRivalMeters = 9.5;
    this.telemetry.didPassRival = false;
    this.setAirYokeSteerAngleDeg(-12);

    this.audio?.playInteractionChime(940);
    this.audio?.speakRaceEngineerBriefing(
      'Halo visor sealed! One-to-one Turn 4 overtake active. Downshift into hairpin and steer inside clean air!'
    );
  }

  public exitToMacroPitWall(): void {
    if (this.mode === 'MACRO_PIT_WALL') return;
    this.mode = 'MACRO_PIT_WALL';

    this.haloRoot.visible = false;
    if (this.trackTableGroup) {
      this.trackTableGroup.visible = true;
    }
    this.audio?.playInteractionChime(640);
  }

  public triggerPaddleShift(direction: PaddleShiftDirection): void {
    if (direction === 'DOWNSHIFT_LEFT') {
      this.telemetry.gear = Math.max(1, this.telemetry.gear - 1);
      this.telemetry.rpm = Math.min(12400, this.telemetry.rpm + 950);
      this.paddleLeftRecoil = 1.0;
      this.audio?.playInteractionChime(580);
    } else {
      this.telemetry.gear = Math.min(8, this.telemetry.gear + 1);
      this.telemetry.rpm = Math.max(8200, this.telemetry.rpm - 1100);
      this.paddleRightRecoil = 1.0;
      this.audio?.playInteractionChime(820);
    }
  }

  public setAirYokeSteerAngleDeg(angleDeg: number): void {
    const clamped = MathUtils.clamp(angleDeg, -65, 65);
    this.telemetry.steerAngleDeg = Number(clamped.toFixed(1));
    this.yokeGroup.rotation.z = -MathUtils.degToRad(clamped);
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.1);
    this.flashClock += dt * 10.0;

    const xrCamera = this.world.renderer?.xr?.isPresenting
      ? this.world.renderer.xr.getCamera()
      : this.world.camera;
    if (xrCamera) {
      xrCamera.getWorldPosition(this.headWorldPos);
    }

    // Check if user pulled Car A toward visor (< 0.24m) while in Macro Pit-Wall mode
    if (this.mode === 'MACRO_PIT_WALL' && xrCamera) {
      this.queries.carNodes.entities.forEach((carEntity) => {
        const idx = carEntity.getValue(TelemetryCarNode, 'carIndex');
        if (idx === 0 && carEntity.hasComponent(Pressed) && carEntity.object3D) {
          carEntity.object3D.getWorldPosition(this.carWorldPos);
          if (this.carWorldPos.distanceTo(this.headWorldPos) < 0.24) {
            this.enterFirstPersonHaloCockpit();
          }
        }
      });
      return;
    }

    if (this.mode !== 'FIRST_PERSON_HALO_COCKPIT') return;

    // Bare-hand Two-Hand Air-Yoke Steering when XR session is active
    if (this.world.session && this.world.player) {
      this.world.player.gripSpaces.left.getWorldPosition(this.leftHandPos);
      this.world.player.gripSpaces.right.getWorldPosition(this.rightHandPos);
      const dy = this.leftHandPos.y - this.rightHandPos.y;
      const dx = Math.max(0.08, Math.abs(this.rightHandPos.x - this.leftHandPos.x));
      const handSteerDeg = MathUtils.radToDeg(Math.atan2(dy, dx));
      this.setAirYokeSteerAngleDeg(handSteerDeg);
    }

    // Advance the 7.5s First-Person Overtake Duel
    this.telemetry.duelElapsedSec += dt;
    const progress = MathUtils.clamp(
      this.telemetry.duelElapsedSec / this.duelDurationSec,
      0,
      1.0
    );

    // Kinematic speed profile through Turn 4 Braking -> Apex -> Exit Slingshot
    const apexDip = Math.exp(-Math.pow((progress - 0.46) / 0.2, 2));
    this.telemetry.speedKmh = Math.round(298 - apexDip * 194 + progress * 18);
    this.telemetry.ersPct = Math.max(12, Math.round(92 - progress * 58));

    const targetRpm = 8400 + ((this.telemetry.speedKmh % 42) / 42) * 3800;
    this.telemetry.rpm = Math.round(
      MathUtils.lerp(this.telemetry.rpm, targetRpm, Math.min(1, dt * 6.5))
    );

    // Update Shift-Light LEDs
    const activeLeds = Math.round(
      MathUtils.clamp((this.telemetry.rpm - 8200) / 4000, 0, 1) *
        this.shiftLightLeds.length
    );
    for (let i = 0; i < this.shiftLightLeds.length; i++) {
      this.shiftLightLeds[i].visible = i < activeLeds;
    }

    // Animate Paddle Shift Recoil
    this.paddleLeftRecoil = Math.max(0, this.paddleLeftRecoil - dt * 6.0);
    this.paddleRightRecoil = Math.max(0, this.paddleRightRecoil - dt * 6.0);
    if (this.leftPaddleMesh) {
      this.leftPaddleMesh.position.z = -0.014 + this.paddleLeftRecoil * 0.008;
    }
    if (this.rightPaddleMesh) {
      this.rightPaddleMesh.position.z = -0.014 + this.paddleRightRecoil * 0.008;
    }

    // Animate Rival Car B Relative Position as User Dives Inside Clean Air
    const steerLaneOffset = -(this.telemetry.steerAngleDeg / 65) * 0.085;
    this.telemetry.gapToRivalMeters = Number(
      MathUtils.lerp(9.5, -3.2, progress).toFixed(1)
    );
    this.telemetry.didPassRival = this.telemetry.gapToRivalMeters < 0;

    this.rivalCarGroup.position.x = MathUtils.clamp(
      0.038 + steerLaneOffset,
      -0.11,
      0.11
    );
    this.rivalCarGroup.position.z = MathUtils.lerp(-0.16, 0.09, progress);

    if (this.rivalRainLightMesh) {
      const mat = this.rivalRainLightMesh.material as MeshStandardMaterial;
      mat.emissiveIntensity = Math.sin(this.flashClock * 2.2) > 0 ? 1.4 : 0.2;
    }

    // Stream Kerb Strips Past Cockpit
    const streamSpeed = (this.telemetry.speedKmh / 300) * 0.65;
    for (const curb of this.speedCurbStrips) {
      curb.position.z += dt * streamSpeed;
      if (curb.position.z > 0.14) {
        curb.position.z -= 0.288;
      }
    }

    // Update Spatial Doppler Audio from Cockpit Engine Position
    if (this.anchorEntity?.object3D && this.audio) {
      this.anchorEntity.object3D.getWorldPosition(this.engineSoundWorldPos);
      this.audio.updateLeadCarSpatialAudio(
        this.engineSoundWorldPos,
        this.telemetry.rpm,
        1.15
      );
    }

    // Complete the 7.5s Overtake Duel and Credit the Strategist Stage
    if (this.telemetry.duelElapsedSec >= this.duelDurationSec) {
      const snapshot: HaloCockpitDuelTelemetry = { ...this.telemetry };
      this.exitToMacroPitWall();
      this.onDuelCompleteCallback?.(snapshot);
    }
  }
}
