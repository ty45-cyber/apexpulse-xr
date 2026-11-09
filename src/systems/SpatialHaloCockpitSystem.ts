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
  private macroSceneObjects: Object3D[] = [];
  private anchorEntity: any = null;
  private onDuelCompleteCallback:
    | ((duelTelemetry: HaloCockpitDuelTelemetry) => void)
    | null = null;

  private readonly haloRoot = new Group();
  private readonly yokeGroup = new Group();
  private readonly rivalCarGroup = new Group();
  private readonly speedCurbStrips: Mesh[] = [];
  private readonly racingChevrons: Mesh[] = [];
  private readonly shiftLightLeds: Mesh[] = [];
  private leftPaddleMesh: Mesh | null = null;
  private rightPaddleMesh: Mesh | null = null;
  private rivalRainLightMesh: Mesh | null = null;
  private ersBarMesh: Mesh | null = null;

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
    onDuelComplete: (duelTelemetry: HaloCockpitDuelTelemetry) => void,
    macroSceneObjects: Object3D[] = []
  ): void {
    this.audio = audio;
    this.trackTableGroup = trackTableGroup;
    this.macroSceneObjects = [trackTableGroup, ...macroSceneObjects];
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
      color: 0x0f172a,
      roughness: 0.26,
      metalness: 0.88,
    });

    const titaniumMat = new MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.22,
      metalness: 0.92,
    });

    // 1. FIA Titanium Halo Central Pillar, Cockpit Coaming & Curved Protection Arch
    const pillarGeo = new CylinderGeometry(0.0085, 0.012, 0.23, 18);
    const pillarMesh = new Mesh(pillarGeo, titaniumMat);
    pillarMesh.position.set(0, 0.052, -0.052);
    pillarMesh.rotation.x = 0.22;
    this.haloRoot.add(pillarMesh);

    const archGeo = new TorusGeometry(0.228, 0.012, 16, 48, Math.PI);
    const archMesh = new Mesh(archGeo, titaniumMat);
    archMesh.position.set(0, 0.148, 0.042);
    archMesh.rotation.x = Math.PI * 0.44;
    this.haloRoot.add(archMesh);

    // Dual Cyan Telemetry Accent Strips along Halo Arch & Nose Coaming
    const haloAccentGeo = new TorusGeometry(0.221, 0.0028, 10, 48, Math.PI);
    const cyanGlowMat = new MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.95,
    });
    const haloAccentMesh = new Mesh(haloAccentGeo, cyanGlowMat);
    haloAccentMesh.position.copy(archMesh.position);
    haloAccentMesh.rotation.copy(archMesh.rotation);
    this.haloRoot.add(haloAccentMesh);

    // Sculpted Nose Cone & Cockpit Tub Sills Framing the Driver's Field of View
    const noseCone = new Mesh(
      new BoxGeometry(0.088, 0.016, 0.19),
      new MeshStandardMaterial({
        color: 0x083344,
        emissive: 0x0e7490,
        emissiveIntensity: 0.35,
        metalness: 0.78,
        roughness: 0.24,
      })
    );
    noseCone.position.set(0, -0.068, -0.085);
    noseCone.rotation.x = 0.08;
    this.haloRoot.add(noseCone);

    // 2. Asphalt Circuit Surface + Streaming Clean-Air Racing Line Chevrons
    const asphaltDeck = new Mesh(
      new BoxGeometry(0.32, 0.004, 0.42),
      new MeshStandardMaterial({
        color: 0x090d16,
        roughness: 0.85,
        metalness: 0.15,
      })
    );
    asphaltDeck.position.set(0, -0.09, -0.07);
    this.haloRoot.add(asphaltDeck);

    const chevronGeo = new BoxGeometry(0.022, 0.002, 0.032);
    const chevronMat = new MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.75,
    });
    for (let k = 0; k < 6; k++) {
      const chev = new Mesh(chevronGeo, chevronMat);
      chev.position.set(-0.042, -0.086, 0.09 - k * 0.056);
      this.haloRoot.add(chev);
      this.racingChevrons.push(chev);
    }

    // 3. F1 Carbon-Fiber Air-Yoke Steering Wheel + OLED Telemetry Bezel + Rotary Encoders
    this.yokeGroup.position.set(0, -0.062, 0.078);
    this.haloRoot.add(this.yokeGroup);

    const yokeHub = new Mesh(new BoxGeometry(0.148, 0.072, 0.016), carbonMat);
    this.yokeGroup.add(yokeHub);

    // Central OLED Telemetry Display Screen & Live ERS Bar on Wheel Face
    const oledScreen = new Mesh(
      new BoxGeometry(0.086, 0.036, 0.004),
      new MeshStandardMaterial({
        color: 0x020617,
        emissive: 0x082f49,
        emissiveIntensity: 0.65,
        roughness: 0.15,
      })
    );
    oledScreen.position.set(0, -0.002, 0.009);
    this.yokeGroup.add(oledScreen);

    const ersBarGeo = new BoxGeometry(0.074, 0.006, 0.003);
    this.ersBarMesh = new Mesh(
      ersBarGeo,
      new MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 1.0,
      })
    );
    this.ersBarMesh.position.set(0, -0.013, 0.011);
    this.yokeGroup.add(this.ersBarMesh);

    // Rotary Thumb Encoders (Cyan Differential + Amber Brake Migration + Crimson Radio)
    const dialGeo = new CylinderGeometry(0.007, 0.007, 0.006, 14);
    dialGeo.rotateX(Math.PI * 0.5);
    const dialSpecs = [
      { x: -0.054, y: 0.012, color: 0x00f0ff },
      { x: 0.054, y: 0.012, color: 0xf59e0b },
      { x: 0.0, y: -0.026, color: 0xa855f7 },
    ];
    for (const d of dialSpecs) {
      const dial = new Mesh(
        dialGeo,
        new MeshStandardMaterial({
          color: d.color,
          emissive: d.color,
          emissiveIntensity: 0.75,
        })
      );
      dial.position.set(d.x, d.y, 0.01);
      this.yokeGroup.add(dial);
    }

    const gripGeo = new CylinderGeometry(0.011, 0.011, 0.086, 16);
    const gripMat = new MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.4,
    });
    const leftGrip = new Mesh(gripGeo, gripMat);
    leftGrip.position.set(-0.078, -0.004, 0.004);
    this.yokeGroup.add(leftGrip);

    const rightGrip = new Mesh(gripGeo, gripMat);
    rightGrip.position.set(0.078, -0.004, 0.004);
    this.yokeGroup.add(rightGrip);

    const paddleGeo = new BoxGeometry(0.028, 0.046, 0.006);
    const paddleMat = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.75,
      metalness: 0.85,
      roughness: 0.2,
    });
    this.leftPaddleMesh = new Mesh(paddleGeo, paddleMat);
    this.leftPaddleMesh.position.set(-0.058, 0.008, -0.014);
    this.yokeGroup.add(this.leftPaddleMesh);

    this.rightPaddleMesh = new Mesh(paddleGeo, paddleMat.clone());
    this.rightPaddleMesh.position.set(0.058, 0.008, -0.014);
    this.yokeGroup.add(this.rightPaddleMesh);

    const ledGeo = new SphereGeometry(0.0034, 10, 10);
    for (let i = 0; i < 10; i++) {
      const hex = i < 4 ? 0x10b981 : i < 7 ? 0xf59e0b : 0xf43f5e;
      const ledMat = new MeshStandardMaterial({
        color: hex,
        emissive: hex,
        emissiveIntensity: 1.0,
      });
      const led = new Mesh(ledGeo, ledMat);
      led.position.set(-0.045 + i * 0.01, 0.027, 0.011);
      this.yokeGroup.add(led);
      this.shiftLightLeds.push(led);
    }

    // 4. Multi-Part Rival Car B Ahead in 1:1 Perspective (Monocoque, Wings, Slick Tires & Blinking Rain Light)
    const rivalPaintMat = new MeshStandardMaterial({
      color: 0xff2a85,
      emissive: 0xd91b6b,
      emissiveIntensity: 0.6,
      metalness: 0.82,
      roughness: 0.22,
    });
    const rivalBody = new Mesh(
      new BoxGeometry(0.056, 0.02, 0.125),
      rivalPaintMat
    );
    this.rivalCarGroup.add(rivalBody);

    const rivalSidepods = new Mesh(
      new BoxGeometry(0.078, 0.014, 0.068),
      rivalPaintMat
    );
    rivalSidepods.position.set(0, -0.002, 0.006);
    this.rivalCarGroup.add(rivalSidepods);

    const rearWing = new Mesh(
      new BoxGeometry(0.082, 0.018, 0.014),
      carbonMat
    );
    rearWing.position.set(0, 0.018, 0.056);
    this.rivalCarGroup.add(rearWing);

    const frontWing = new Mesh(
      new BoxGeometry(0.086, 0.006, 0.018),
      carbonMat
    );
    frontWing.position.set(0, -0.008, -0.062);
    this.rivalCarGroup.add(frontWing);

    const wheelGeo = new CylinderGeometry(0.013, 0.013, 0.014, 14);
    wheelGeo.rotateZ(Math.PI * 0.5);
    const wheelMat = new MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.65,
    });
    const wheelCoords: [number, number][] = [
      [-0.042, -0.042],
      [0.042, -0.042],
      [-0.044, 0.044],
      [0.044, 0.044],
    ];
    for (const [wx, wz] of wheelCoords) {
      const w = new Mesh(wheelGeo, wheelMat);
      w.position.set(wx, -0.004, wz);
      this.rivalCarGroup.add(w);
    }

    this.rivalRainLightMesh = new Mesh(
      new SphereGeometry(0.0055, 12, 12),
      new MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xf43f5e,
        emissiveIntensity: 1.4,
      })
    );
    this.rivalRainLightMesh.position.set(0, 0.004, 0.065);
    this.rivalCarGroup.add(this.rivalRainLightMesh);

    this.rivalCarGroup.position.set(0, -0.032, -0.15);
    this.haloRoot.add(this.rivalCarGroup);

    // 5. Rushing Red-and-White FIA Apex Kerb Strips Framing the Braking Chute
    const curbGeo = new BoxGeometry(0.016, 0.0035, 0.038);
    for (let c = 0; c < 14; c++) {
      const isLeft = c % 2 === 0;
      const isRed = Math.floor(c / 2) % 2 === 0;
      const curbMat = new MeshStandardMaterial({
        color: isRed ? 0xf43f5e : 0xf8fafc,
        emissive: isRed ? 0x9f1239 : 0x475569,
        emissiveIntensity: 0.5,
      });
      const curb = new Mesh(curbGeo, curbMat);
      const laneIdx = Math.floor(c / 2);
      curb.position.set(
        isLeft ? -0.148 : 0.148,
        -0.086,
        0.09 - laneIdx * 0.046
      );
      this.haloRoot.add(curb);
      this.speedCurbStrips.push(curb);
    }
  }

  public setMacroSceneObjects(objects: Object3D[]): void {
    this.macroSceneObjects = [this.trackTableGroup, ...objects];
  }

  private setMacroSceneVisibility(visible: boolean): void {
    for (const obj of this.macroSceneObjects) {
      if (obj) obj.visible = visible;
    }
  }

  public enterFirstPersonHaloCockpit(): void {
    if (this.mode === 'FIRST_PERSON_HALO_COCKPIT') return;
    this.mode = 'FIRST_PERSON_HALO_COCKPIT';

    this.setMacroSceneVisibility(false);
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
    this.setMacroSceneVisibility(true);
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
      const dx = Math.max(
        0.08,
        Math.abs(this.rightHandPos.x - this.leftHandPos.x)
      );
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

    if (this.ersBarMesh) {
      this.ersBarMesh.scale.x = Math.max(0.08, this.telemetry.ersPct / 100);
    }

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
      mat.emissiveIntensity = Math.sin(this.flashClock * 2.2) > 0 ? 1.5 : 0.2;
    }

    // Stream Kerb Strips & Clean-Air Racing Chevrons Past Cockpit
    const streamSpeed = (this.telemetry.speedKmh / 300) * 0.68;
    for (const curb of this.speedCurbStrips) {
      curb.position.z += dt * streamSpeed;
      if (curb.position.z > 0.14) {
        curb.position.z -= 0.322;
      }
    }
    for (const chev of this.racingChevrons) {
      chev.position.z += dt * streamSpeed;
      if (chev.position.z > 0.14) {
        chev.position.z -= 0.336;
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
