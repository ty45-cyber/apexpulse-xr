// src/index.ts
import {
  AmbientLight,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  PokeInteractable,
  RayInteractable,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  UIKitMLAsset,
  Vector3,
  World,
} from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { SpatialDopplerAudio } from './audio/SpatialDopplerAudio';
import { BroadcastCockpitOverlay } from './ui/BroadcastCockpitOverlay';
import {
  HandsFirstNode,
  SeatedEnvelopeNode,
  StrategistChallengeState,
  TelemetryCarNode,
  TelemetrySessionState,
} from './components';
import { AeroGameTheoryDuelSystem } from './systems/AeroGameTheoryDuelSystem';
import { BareHandChassisPuppetSystem } from './systems/BareHandChassisPuppetSystem';
import { CounterfactualForkSystem } from './systems/CounterfactualForkSystem';
import { HandsFirstInteractionSystem } from './systems/HandsFirstInteractionSystem';
import { SeatedCockpitSystem } from './systems/SeatedCockpitSystem';
import { SpatialAIRaceEngineerSystem } from './systems/SpatialAIRaceEngineerSystem';
import { SpatialHaloCockpitSystem } from './systems/SpatialHaloCockpitSystem';
import { StrategistChallengeSystem } from './systems/StrategistChallengeSystem';
import { TelemetryScrubSystem } from './systems/TelemetryScrubSystem';
import { TimeLoopAndEnvironmentSystem } from './systems/TimeLoopAndEnvironmentSystem';
import { WinnerPolishSystem } from './systems/WinnerPolishSystem';
import { CircuitTelemetryEngine } from './telemetry/CircuitTelemetryEngine';

async function bootstrapApexPulseXR() {
  const container = document.getElementById('scene-container') as HTMLDivElement;
  if (!container) {
    throw new Error('Missing #scene-container in index.html');
  }

  // ============================================================================
  // 1. INITIALIZE IWSDK WORLD & DETERMINISTIC PHYSICS / AUDIO KERNELS
  // ============================================================================
  const world = await World.create(container, projectOptions);
  const telemetryEngine = new CircuitTelemetryEngine();
  const audioEngine = new SpatialDopplerAudio();

  // ============================================================================
  // 2. REGISTER ALL 11 ZERO-ALLOCATION ECS SYSTEMS
  // ============================================================================
  world
    .registerSystem(SeatedCockpitSystem)
    .registerSystem(HandsFirstInteractionSystem)
    .registerSystem(TelemetryScrubSystem)
    .registerSystem(SpatialAIRaceEngineerSystem)
    .registerSystem(CounterfactualForkSystem)
    .registerSystem(StrategistChallengeSystem)
    .registerSystem(AeroGameTheoryDuelSystem)
    .registerSystem(BareHandChassisPuppetSystem)
    .registerSystem(TimeLoopAndEnvironmentSystem)
    .registerSystem(SpatialHaloCockpitSystem)
    .registerSystem(WinnerPolishSystem);

  const cockpitSystem = world.getSystem(SeatedCockpitSystem)!;
  const interactionSystem = world.getSystem(HandsFirstInteractionSystem)!;
  const scrubSystem = world.getSystem(TelemetryScrubSystem)!;
  const aiSystem = world.getSystem(SpatialAIRaceEngineerSystem)!;
  const counterfactualSystem = world.getSystem(CounterfactualForkSystem)!;
  const challengeSystem = world.getSystem(StrategistChallengeSystem)!;
  const aeroDuelSystem = world.getSystem(AeroGameTheoryDuelSystem)!;
  const chassisPuppetSystem = world.getSystem(BareHandChassisPuppetSystem)!;
  const timeLoopSystem = world.getSystem(TimeLoopAndEnvironmentSystem)!;
  const haloCockpitSystem = world.getSystem(SpatialHaloCockpitSystem)!;
  const winnerPolishSystem = world.getSystem(WinnerPolishSystem)!;

  // ============================================================================
  // 3. CREATE GLOBAL SINGLETON SESSION & CHALLENGE STATE ENTITY
  // ============================================================================
  const sessionEntity = world.createEntity();
  sessionEntity.addComponent(TelemetrySessionState, {
    playheadSec: 19.8, // Boots 3.0s before the Turn 4 dirty-air lockup freeze-frame
    lapDurationSec: telemetryEngine.lapDurationSec,
    playbackRate: 1.0,
    isPlaying: true,
    isScrubbing: false,
    onboardingComplete: false,
    selectedCarIndex: 0,
    activeSectorIndex: 1,
    aiDeltaVisible: false,
    gazeDwellEnabled: true, // 650ms Eyes-Only Accessibility Forward mode active
    scenarioIndex: 0,
  });

  sessionEntity.addComponent(StrategistChallengeState, {
    currentStageIndex: 0,
    stage1Stars: 0,
    stage2Stars: 0,
    stage3Stars: 0,
    stage1BestDeltaMs: 0,
    stage2BestDeltaMs: 0,
    stage3BestDeltaMs: 0,
    dialedBrakeOffsetMeters: 7.0,
    dialedApexShiftMeters: -1.5,
    strategistElo: 1200,
    streakDays: 1,
    totalForksRun: 0,
    passthroughTvMode: false,
  });

  // ============================================================================
  // 4. MIXED REALITY KEY LIGHTING & SPATIAL UIKITML SCOREBOARD HUD
  // ============================================================================
  world.createTransformEntity(new AmbientLight(0xffffff, 0.95));
  const keyLight = new DirectionalLight(0x38bdf8, 1.75);
  keyLight.position.set(0.45, 1.9, 0.65);
  world.createTransformEntity(keyLight);

  const cyanFillLight = new PointLight(0x00f0ff, 0.85, 2.4);
  cyanFillLight.position.set(-0.42, 1.38, -0.22);
  world.createTransformEntity(cyanFillLight);

  const magentaRimLight = new PointLight(0xff2a85, 0.65, 2.4);
  magentaRimLight.position.set(0.42, 1.35, -0.28);
  world.createTransformEntity(magentaRimLight);

  let hudAsset: UIKitMLAsset | null = null;
  try {
    hudAsset = await world.assets.instantiate<UIKitMLAsset>('apexpulse-hud');
    hudAsset.document.setTargetDimensions(0.35, 0.205);
    const hudEntity = world.createTransformEntity(hudAsset);
    hudEntity.addComponent(SeatedEnvelopeNode, {
      targetRadius: 0.51,
      azimuthDeg: 0,
      elevationDeg: 1.5,
      minRadius: 0.34,
      maxRadius: 0.58,
      maxLateralMeters: 0.28,
      springStiffness: 9.0,
      faceUser: true,
    });
    hudEntity.addComponent(RayInteractable);
    hudEntity.addComponent(PokeInteractable);
  } catch (err) {
    console.warn('[ApexPulse XR] Spatial HUD panel fallback:', err);
  }

  // ============================================================================
  // 5. ZONE 1: MACRO PIT-WALL CIRCUIT DIORAMA (r = 0.38m, az = 0°, el = -22°)
  // ============================================================================
  const trackTableGroup = new Group();
  const trackRibbonGeo = telemetryEngine.buildTrackRibbonGeometry(240, 0.015);
  const trackRibbonMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.24,
    metalness: 0.48,
  });
  const trackRibbonMesh = new Mesh(trackRibbonGeo, trackRibbonMat);
  trackTableGroup.add(trackRibbonMesh);

  // Carbon-fiber base ring & concentric holographic telemetry deck framing the 0.44m diorama
  const baseRingGeo = new TorusGeometry(0.225, 0.0035, 14, 72);
  baseRingGeo.rotateX(Math.PI * 0.5);
  const baseRingMesh = new Mesh(
    baseRingGeo,
    new MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x082f49,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.8,
    })
  );
  baseRingMesh.position.y = -0.018;
  trackTableGroup.add(baseRingMesh);

  const holoFloorGeo = new RingGeometry(0.11, 0.222, 64);
  holoFloorGeo.rotateX(-Math.PI * 0.5);
  const holoFloorMesh = new Mesh(
    holoFloorGeo,
    new MeshStandardMaterial({
      color: 0x061326,
      emissive: 0x0284c7,
      emissiveIntensity: 0.14,
      transparent: true,
      opacity: 0.42,
      roughness: 0.2,
    })
  );
  holoFloorMesh.position.y = -0.0185;
  trackTableGroup.add(holoFloorMesh);

  // Start/Finish Telemetry Gantry Arch at u = 0
  const startPt = telemetryEngine.curve.getPointAt(0);
  const gantryArch = new Mesh(
    new TorusGeometry(0.016, 0.0018, 10, 24, Math.PI),
    new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.9,
    })
  );
  gantryArch.position.set(startPt.x, startPt.y + 0.002, startPt.z);
  gantryArch.rotation.y = Math.PI * 0.48;
  trackTableGroup.add(gantryArch);

  // Pulsing Emerald AI Apex Beacon
  const apexBeaconGeo = new ConeGeometry(0.01, 0.024, 16);
  apexBeaconGeo.rotateX(Math.PI);
  const apexBeaconMesh = new Mesh(
    apexBeaconGeo,
    new MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.9,
    })
  );
  apexBeaconMesh.visible = false;
  trackTableGroup.add(apexBeaconMesh);

  const trackTableEntity = world.createTransformEntity(trackTableGroup);
  trackTableEntity.addComponent(SeatedEnvelopeNode, {
    targetRadius: 0.38,
    azimuthDeg: 0,
    elevationDeg: -22,
    minRadius: 0.28,
    maxRadius: 0.58,
    maxLateralMeters: 0.28,
    springStiffness: 9.5,
    faceUser: false,
  });

  // Spawn 3 Interactive & Sculptable Sector Beacons (Turn 2, Turn 4 Hairpin, Turn 6)
  const sectorBeaconGeo = new SphereGeometry(0.011, 16, 16);
  const sectorBeaconMeshes: Mesh[] = [];

  for (const sector of telemetryEngine.sectors) {
    const beaconMesh = new Mesh(
      sectorBeaconGeo,
      new MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.7,
      })
    );
    beaconMesh.position.copy(sector.apexLocalPos);
    beaconMesh.position.y += 0.016;
    trackTableGroup.add(beaconMesh);
    sectorBeaconMeshes.push(beaconMesh);

    const beaconEntity = world.createTransformEntity(beaconMesh, {
      parent: trackTableEntity,
    });
    beaconEntity.addComponent(HandsFirstNode, {
      role: 'sector',
      payloadId: sector.index,
      allowPoke: true,
      allowDirectGrab: true, // Enables Tiny Golf / Inkphony live 3D corner sculpting
      allowDistancePull: false,
    });
  }

  // Spawn Sculpted Miniature F1 Race Cars (Car A: Cyan #00f0ff, Car B: Magenta #ff2a85)
  const carBodyGeo = new BoxGeometry(0.01, 0.005, 0.028);
  const carSidepodGeo = new BoxGeometry(0.015, 0.004, 0.014);
  const carFrontWingGeo = new BoxGeometry(0.017, 0.0018, 0.004);
  const carRearWingGeo = new BoxGeometry(0.016, 0.0045, 0.0035);
  const carWheelGeo = new CylinderGeometry(0.003, 0.003, 0.0032, 10);
  carWheelGeo.rotateZ(Math.PI * 0.5);
  const carDarkMat = new MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.4,
    metalness: 0.75,
  });

  const brakeVecGeo = new BoxGeometry(0.004, 0.004, 0.022);
  brakeVecGeo.translate(0, 0.006, -0.015);
  const latGVecGeo = new ConeGeometry(0.004, 0.02, 8);
  latGVecGeo.rotateZ(-Math.PI * 0.5);
  latGVecGeo.translate(0.012, 0.005, 0);

  const carBrakeVectors: [Mesh, Mesh] = [null as any, null as any];
  const carLatGVectors: [Mesh, Mesh] = [null as any, null as any];
  const carEntities: any[] = [];
  const carColors = [0x00f0ff, 0xff2a85];

  for (let i = 0; i < 2; i++) {
    const carGroup = new Group();
    const liveryMat = new MeshStandardMaterial({
      color: carColors[i],
      emissive: carColors[i],
      emissiveIntensity: 0.55,
      roughness: 0.2,
      metalness: 0.82,
    });
    const carMesh = new Mesh(carBodyGeo, liveryMat);
    carMesh.position.y = 0.002;
    carGroup.add(carMesh);

    const sidepods = new Mesh(carSidepodGeo, liveryMat);
    sidepods.position.set(0, 0.0015, -0.001);
    carGroup.add(sidepods);

    const fWing = new Mesh(carFrontWingGeo, carDarkMat);
    fWing.position.set(0, 0.0005, 0.014);
    carGroup.add(fWing);

    const rWing = new Mesh(carRearWingGeo, carDarkMat);
    rWing.position.set(0, 0.005, -0.013);
    carGroup.add(rWing);

    const wheelOffsets: [number, number][] = [
      [-0.0085, 0.009],
      [0.0085, 0.009],
      [-0.0088, -0.009],
      [0.0088, -0.009],
    ];
    for (const [wx, wz] of wheelOffsets) {
      const wheel = new Mesh(carWheelGeo, carDarkMat);
      wheel.position.set(wx, 0.0015, wz);
      carGroup.add(wheel);
    }

    const brakeMesh = new Mesh(
      brakeVecGeo,
      new MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xf43f5e,
        emissiveIntensity: 0.9,
      })
    );
    carGroup.add(brakeMesh);
    carBrakeVectors[i] = brakeMesh;

    const latGMesh = new Mesh(
      latGVecGeo,
      new MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xeab308,
        emissiveIntensity: 0.8,
      })
    );
    carGroup.add(latGMesh);
    carLatGVectors[i] = latGMesh;

    trackTableGroup.add(carGroup);

    const carEntity = world.createTransformEntity(carGroup, {
      parent: trackTableEntity,
    });
    carEntity.addComponent(TelemetryCarNode, { carIndex: i });
    carEntity.addComponent(HandsFirstNode, {
      role: 'car',
      payloadId: i,
      allowPoke: true,
      allowDirectGrab: true, // Pulling Car A toward your eyes (< 0.24m) snaps into 1:1 Halo Cockpit!
      allowDistancePull: false,
    });
    carEntities.push(carEntity);
  }

  // ============================================================================
  // 6. ZONE 2: SPATIAL SCRUBBING RIBBON (r = 0.34m, az = 0°, el = -27°)
  // ============================================================================
  const scrubberGroup = new Group();
  const scrubberWidth = 0.32;
  const scrubberBarMesh = new Mesh(
    new BoxGeometry(scrubberWidth, 0.012, 0.012),
    new MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.6,
    })
  );
  scrubberGroup.add(scrubberBarMesh);

  const scrubberPlayheadMesh = new Mesh(
    new SphereGeometry(0.014, 20, 20),
    new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.85,
    })
  );
  scrubberGroup.add(scrubberPlayheadMesh);

  const scrubberEntity = world.createTransformEntity(scrubberGroup);
  scrubberEntity.addComponent(SeatedEnvelopeNode, {
    targetRadius: 0.34,
    azimuthDeg: 0,
    elevationDeg: -27,
    minRadius: 0.28,
    maxRadius: 0.58,
    maxLateralMeters: 0.28,
    springStiffness: 10.0,
    faceUser: true,
  });

  const segCount = 10;
  const segGeo = new BoxGeometry(scrubberWidth / segCount, 0.024, 0.024);
  for (let s = 0; s < segCount; s++) {
    const segMesh = new Mesh(
      segGeo,
      new MeshStandardMaterial({ transparent: true, opacity: 0.0 })
    );
    segMesh.position.x =
      -scrubberWidth * 0.5 + ((s + 0.5) * scrubberWidth) / segCount;
    scrubberGroup.add(segMesh);

    const segEntity = world.createTransformEntity(segMesh, {
      parent: scrubberEntity,
    });
    segEntity.addComponent(HandsFirstNode, {
      role: 'scrubber',
      payloadId: s,
      allowPoke: true,
      allowDirectGrab: false,
      allowDistancePull: false,
    });
  }

  // ============================================================================
  // 7. ZONE 3: EXPLODED TELEMETRY BAY + KAMM DOME + CONTACT PATCHES (az = -24°)
  // ============================================================================
  const bayGroup = new Group();
  bayGroup.add(
    new Mesh(
      new CylinderGeometry(0.065, 0.07, 0.01, 24),
      new MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.3,
        metalness: 0.7,
      })
    )
  );

  const tireGeo = new CylinderGeometry(0.012, 0.012, 0.026, 16);
  const tireOffsets: [number, number][] = [
    [-0.028, -0.028], // FL
    [0.028, -0.028],  // FR
    [-0.028, 0.028],  // RL
    [0.028, 0.028],   // RR
  ];
  const explodedBayTireMeshes: [Mesh, Mesh, Mesh, Mesh] = [
    null as any,
    null as any,
    null as any,
    null as any,
  ];

  for (let t = 0; t < 4; t++) {
    const tMesh = new Mesh(
      tireGeo,
      new MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 })
    );
    tMesh.position.set(tireOffsets[t][0], 0.02, tireOffsets[t][1]);
    bayGroup.add(tMesh);
    explodedBayTireMeshes[t] = tMesh;
  }

  const pedalBarGeo = new BoxGeometry(0.012, 0.055, 0.012);
  pedalBarGeo.translate(0, 0.0275, 0);
  const explodedBayBrakeBar = new Mesh(
    pedalBarGeo,
    new MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 0.6,
    })
  );
  explodedBayBrakeBar.position.set(-0.01, 0.008, 0);
  bayGroup.add(explodedBayBrakeBar);

  const explodedBayThrottleBar = new Mesh(
    pedalBarGeo,
    new MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.6,
    })
  );
  explodedBayThrottleBar.position.set(0.01, 0.008, 0);
  bayGroup.add(explodedBayThrottleBar);

  const bayEntity = world.createTransformEntity(bayGroup);
  bayEntity.addComponent(SeatedEnvelopeNode, {
    targetRadius: 0.42,
    azimuthDeg: -24,
    elevationDeg: -14,
    minRadius: 0.28,
    maxRadius: 0.58,
    maxLateralMeters: 0.28,
    springStiffness: 8.5,
    faceUser: true,
  });
  bayEntity.addComponent(HandsFirstNode, {
    role: 'inspection-bay',
    payloadId: 0,
    allowPoke: true,
    allowDirectGrab: false,
    allowDistancePull: true, // Summonable to 34cm in front of lap via DistanceGrabbable
    returnToSlotOnRelease: true,
  });

  // ============================================================================
  // 8. ZONE 4: EMBODIED AI DRONE & STRATEGIST CHALLENGE CONSOLE (az = +24°)
  // ============================================================================
  const aiDroneGroup = new Group();
  const aiCoreMesh = new Mesh(
    new SphereGeometry(0.024, 24, 24),
    new MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.6,
    })
  );
  aiDroneGroup.add(aiCoreMesh);

  const aiDroneEntity = world.createTransformEntity(aiDroneGroup);
  aiDroneEntity.addComponent(SeatedEnvelopeNode, {
    targetRadius: 0.44,
    azimuthDeg: 24,
    elevationDeg: -6,
    minRadius: 0.28,
    maxRadius: 0.58,
    maxLateralMeters: 0.28,
    springStiffness: 9.0,
    faceUser: true,
  });
  aiDroneEntity.addComponent(HandsFirstNode, {
    role: 'ai-trigger',
    payloadId: 1,
    allowPoke: true,
    allowDistancePull: true,
    returnToSlotOnRelease: true,
  });

  // 3-Stage Strategist Challenge Console + Tactile Control Pucks (az = +24°, el = -20°)
  const strategistConsoleGroup = new Group();
  strategistConsoleGroup.add(
    new Mesh(
      new CylinderGeometry(0.072, 0.078, 0.01, 24),
      new MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.3,
        metalness: 0.7,
      })
    )
  );

  const strategistConsoleEntity = world.createTransformEntity(
    strategistConsoleGroup
  );
  strategistConsoleEntity.addComponent(SeatedEnvelopeNode, {
    targetRadius: 0.38,
    azimuthDeg: 24,
    elevationDeg: -20,
    minRadius: 0.28,
    maxRadius: 0.58,
    maxLateralMeters: 0.28,
    springStiffness: 9.0,
    faceUser: true,
  });
  strategistConsoleEntity.addComponent(HandsFirstNode, {
    role: 'strategist-console',
    payloadId: 0,
    allowPoke: true,
    allowDistancePull: true,
    returnToSlotOnRelease: true,
  });

  // 4 Micro-Pucks: Brake Dial, Apex Dial, 14-Day Judge Streak, and 1:1 Halo Helmet Toggle
  const puckSpecs = [
    { role: 'dial-brake', x: -0.036, z: -0.016, color: 0x00f0ff },
    { role: 'dial-apex', x: 0.036, z: -0.016, color: 0xa855f7 },
    { role: 'judge-streak', x: -0.022, z: 0.032, color: 0xfacc15 },
    { role: 'toggle-helmet', x: 0.022, z: 0.032, color: 0x10b981 },
  ];

  const microPuckGeo = new CylinderGeometry(0.015, 0.017, 0.012, 20);
  for (const spec of puckSpecs) {
    const puckMesh = new Mesh(
      microPuckGeo,
      new MeshStandardMaterial({
        color: spec.color,
        emissive: spec.color,
        emissiveIntensity: 0.65,
        roughness: 0.25,
      })
    );
    puckMesh.position.set(spec.x, 0.012, spec.z);
    strategistConsoleGroup.add(puckMesh);

    const puckEntity = world.createTransformEntity(puckMesh, {
      parent: strategistConsoleEntity,
    });
    puckEntity.addComponent(HandsFirstNode, {
      role: spec.role,
      payloadId: 0,
      allowPoke: true,
      allowDirectGrab: false,
      allowDistancePull: false,
    });
  }

  // Dedicated Controllerless Recenter Cockpit Puck (r = 0.35m, az = -16°, el = -26°)
  const recenterMesh = new Mesh(
    new CylinderGeometry(0.024, 0.026, 0.012, 24),
    new MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.3,
      metalness: 0.6,
    })
  );
  recenterMesh.rotation.x = Math.PI * 0.35;
  const recenterEntity = world.createTransformEntity(recenterMesh);
  recenterEntity.addComponent(SeatedEnvelopeNode, {
    targetRadius: 0.35,
    azimuthDeg: -16,
    elevationDeg: -26,
    minRadius: 0.28,
    maxRadius: 0.58,
    maxLateralMeters: 0.28,
    faceUser: false,
  });
  recenterEntity.addComponent(HandsFirstNode, {
    role: 'recenter',
    payloadId: 0,
    allowPoke: true,
  });

  // ============================================================================
  // 9. ZONE 5: 1:1 FIRST-PERSON SEATED FIA HALO COCKPIT ANCHOR (r = 0.42m, el = -4°)
  // ============================================================================
  const haloCockpitAnchorGroup = new Group();
  const haloCockpitAnchorEntity = world.createTransformEntity(
    haloCockpitAnchorGroup
  );
  haloCockpitAnchorEntity.addComponent(SeatedEnvelopeNode, {
    targetRadius: 0.42,
    azimuthDeg: 0,
    elevationDeg: -4,
    minRadius: 0.28,
    maxRadius: 0.58,
    maxLateralMeters: 0.28,
    springStiffness: 11.0,
    faceUser: true,
  });

  // ============================================================================
  // 10. BIND ALL SYSTEMS TOGETHER
  // ============================================================================
  scrubSystem.bindRuntimeDependencies(telemetryEngine, audioEngine, {
    trackRoot: trackTableGroup,
    scrubberPlayheadMesh,
    scrubberBarWidthMeters: scrubberWidth,
    carBrakeVectors,
    carLatGVectors,
    explodedBayTireMeshes,
    explodedBayBrakeBar,
    explodedBayThrottleBar,
  });

  aiSystem.bindRuntimeDependencies(
    telemetryEngine,
    audioEngine,
    trackTableGroup,
    apexBeaconMesh,
    (directive) => {
      winnerPolishSystem.triggerDroneExcitementPulse();
      console.info('[Spatial AI Race Engineer]', directive.headline);
    }
  );

  counterfactualSystem.bindCounterfactualEngine(
    telemetryEngine,
    audioEngine,
    trackTableGroup,
    bayGroup,
    (simResult) => {
      console.info(
        '[Counterfactual Multiverse Verdict]',
        simResult.verdictHeadline
      );
    }
  );

  challengeSystem.bindChallengeSystem(
    counterfactualSystem,
    audioEngine,
    strategistConsoleGroup,
    hudAsset?.document ?? null
  );

  aeroDuelSystem.bindAeroDuelEngine(
    telemetryEngine,
    counterfactualSystem,
    audioEngine,
    trackTableGroup,
    (duelVerdict) => {
      console.info('[Aero Game-Theory Duel]', duelVerdict.tacticalSummary);
    }
  );

  chassisPuppetSystem.bindChassisPuppet(aeroDuelSystem, bayGroup);

  timeLoopSystem.bindUnifiedWedge(
    telemetryEngine,
    aeroDuelSystem,
    audioEngine,
    trackTableEntity,
    trackTableGroup,
    (phase, verdict) => {
      console.info(
        '[Time-Loop Phase]',
        phase,
        verdict?.netOvertakeDeltaSec ?? ''
      );
    }
  );

  let broadcastOverlay: BroadcastCockpitOverlay | null = null;

  haloCockpitSystem.bindHaloCockpit(
    audioEngine,
    trackTableGroup,
    haloCockpitAnchorEntity,
    (duelTelemetry) => {
      // When the 7.5s First-Person Halo Cockpit Overtake completes, credit the Strategist Stage!
      const res = challengeSystem.executeCurrentStageFork();
      console.info('[1:1 Halo Cockpit Duel Complete]', duelTelemetry);
      broadcastOverlay?.showToast(
        '1:1 HALO OVERTAKE SEALED!',
        res
          ? `${res.verdictHeadline} — Terminal speed ${duelTelemetry.speedKmh} km/h in Gear ${duelTelemetry.gear}.`
          : `Overtake completed at ${duelTelemetry.speedKmh} km/h!`,
        'success',
        5500
      );
    },
    [
      scrubberGroup,
      bayGroup,
      aiDroneGroup,
      strategistConsoleGroup,
      recenterMesh,
      ...(hudAsset ? [hudAsset] : []),
    ]
  );

  winnerPolishSystem.bindWinnerUpgrades(telemetryEngine, audioEngine, {
    trackRoot: trackTableGroup,
    trackRibbonGeometry: trackRibbonGeo,
    carObjects: [carEntities[0].object3D!, carEntities[1].object3D!],
    explodedBayRoot: bayGroup,
    aiDroneRoot: aiDroneGroup,
    sectorBeaconMeshes,
    onVoiceIntentResolved: (intent, sectorIdx = 1) => {
      if (intent === 'analyze-sector') {
        challengeSystem.selectStage(
          sectorIdx === 1 ? 0 : sectorIdx === 0 ? 1 : 2
        );
        aeroDuelSystem.evaluateAeroGameTheoryDuel();
        aiSystem.analyzeSectorDeictic(sectorIdx);
      }
    },
  });

  // ============================================================================
  // 11. ROUTE CONTROLLERLESS HANDS-FIRST & GAZE-DWELL ACTIVATIONS
  // ============================================================================
  interactionSystem.setActivationHandler((role, payloadId, entity) => {
    audioEngine.unlockAndStart();

    switch (role) {
      case 'car': {
        sessionEntity.setValue(
          TelemetrySessionState,
          'selectedCarIndex',
          payloadId
        );
        sessionEntity.setValue(
          TelemetrySessionState,
          'onboardingComplete',
          true
        );

        // If time-loop is frozen at the Turn 4 lockup, pinching the car starts the Elastic Rewind
        // or enters the 1:1 First-Person Halo Cockpit!
        if (timeLoopSystem.phase === 'CRASH_FROZEN') {
          const worldPos = new Vector3();
          entity?.object3D?.getWorldPosition(worldPos);
          timeLoopSystem.beginElasticCrashRewind(worldPos);
          timeLoopSystem.releaseElasticSlingshot();
          challengeSystem.executeCurrentStageFork();
        } else {
          haloCockpitSystem.enterFirstPersonHaloCockpit();
        }
        break;
      }
      case 'toggle-helmet': {
        if (haloCockpitSystem.mode === 'FIRST_PERSON_HALO_COCKPIT') {
          haloCockpitSystem.exitToMacroPitWall();
        } else {
          haloCockpitSystem.enterFirstPersonHaloCockpit();
        }
        break;
      }
      case 'scrubber': {
        const fraction = (payloadId + 0.5) / segCount;
        scrubSystem.scrubToNormalizedFraction(fraction);
        break;
      }
      case 'sector': {
        const stageIdx = payloadId === 1 ? 0 : payloadId === 0 ? 1 : 2;
        challengeSystem.selectStage(stageIdx);
        aeroDuelSystem.evaluateAeroGameTheoryDuel();
        aiSystem.analyzeSectorDeictic(payloadId);
        break;
      }
      case 'ai-trigger': {
        winnerPolishSystem.triggerDroneExcitementPulse();
        const verdict = aeroDuelSystem.evaluateAeroGameTheoryDuel();
        aiSystem.analyzeSectorDeictic(payloadId);
        if (verdict.didSucceedOvertake) {
          chassisPuppetSystem.triggerAdversarialPitRadio(
            'ENGINEER_LEFT',
            `Clean air overtake verified! Delta ${verdict.netOvertakeDeltaSec} seconds.`
          );
        }
        break;
      }
      case 'inspection-bay': {
        chassisPuppetSystem.setPalmPuppetMode(true, true);
        aeroDuelSystem.evaluateAeroGameTheoryDuel();
        break;
      }
      case 'dial-brake': {
        challengeSystem.stepBrakeOffsetDial(2.5);
        aeroDuelSystem.evaluateAeroGameTheoryDuel();
        break;
      }
      case 'dial-apex': {
        challengeSystem.stepApexShiftDial(0.8);
        aeroDuelSystem.evaluateAeroGameTheoryDuel();
        break;
      }
      case 'judge-streak': {
        challengeSystem.simulate14DayJudgeStreak();
        winnerPolishSystem.triggerDroneExcitementPulse();
        break;
      }
      case 'recenter': {
        cockpitSystem.recenterToCurrentSeat();
        timeLoopSystem.toggleLiveTvAcousticSync();
        audioEngine.playInteractionChime(920);
        break;
      }
      default:
        audioEngine.playInteractionChime(660);
        break;
    }
  });

  // ============================================================================
  // 12. WIRE SPATIAL UIKITML & DOM SCOREBOARD BUTTONS + KEYBOARD SHORTCUTS
  // ============================================================================
  const bindActionButton = (id: string, handler: () => void) => {
    const uikitBtn = hudAsset?.document.getElementById(id) as any;
    if (uikitBtn && typeof uikitBtn.addEventListener === 'function') {
      uikitBtn.addEventListener('click', () => {
        audioEngine.unlockAndStart();
        handler();
      });
    }
    const domBtn = document.getElementById(id);
    if (domBtn) {
      domBtn.addEventListener('click', () => {
        audioEngine.unlockAndStart();
        handler();
      });
    }
  };

  bindActionButton('btn-next-stage', () => {
    const nextIdx =
      (challengeSystem.getScoreboardViewModel().currentStage.stageIndex + 1) % 3;
    challengeSystem.selectStage(nextIdx);
  });

  bindActionButton('btn-run-fork', () => {
    if (timeLoopSystem.phase === 'CRASH_FROZEN') {
      timeLoopSystem.releaseElasticSlingshot();
    }
    aeroDuelSystem.evaluateAeroGameTheoryDuel();
    const res = challengeSystem.executeCurrentStageFork();
    if (res) {
      broadcastOverlay?.showToast(
        res.verdictHeadline,
        res.physicsExplanation,
        res.didBreachTractionLimit ? 'danger' : 'success'
      );
    }
  });

  bindActionButton('btn-halo-cockpit', () => {
    if (haloCockpitSystem.mode === 'FIRST_PERSON_HALO_COCKPIT') {
      haloCockpitSystem.exitToMacroPitWall();
    } else {
      haloCockpitSystem.enterFirstPersonHaloCockpit();
    }
  });

  bindActionButton('btn-judge-streak', () => {
    challengeSystem.simulate14DayJudgeStreak();
    winnerPolishSystem.triggerDroneExcitementPulse();
  });

  // Desktop Seated Camera Look Controls (Right-drag to glance around Pit-Wall; [R] to reset)
  let camYawDeg = 0;
  let camPitchDeg = -19.3; // Matches lookAt [0, 1.11, -0.40] from [0, 1.25, 0]
  const applyDesktopCameraLook = () => {
    if (world.renderer?.xr?.isPresenting || !world.camera) return;
    const yawRad = MathUtils.degToRad(camYawDeg);
    const pitchRad = MathUtils.degToRad(camPitchDeg);
    const lookDist = 0.42;
    const tx = -Math.sin(yawRad) * Math.cos(pitchRad) * lookDist;
    const ty = 1.25 + Math.sin(pitchRad) * lookDist;
    const tz = -Math.cos(yawRad) * Math.cos(pitchRad) * lookDist;
    world.camera.position.set(0, 1.25, 0);
    world.camera.lookAt(tx, ty, tz);
  };
  const resetDesktopCameraLook = () => {
    camYawDeg = 0;
    camPitchDeg = -19.3;
    applyDesktopCameraLook();
  };

  container.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('pointermove', (ev) => {
    if ((ev.buttons & 2) === 2 && !world.renderer?.xr?.isPresenting) {
      camYawDeg = MathUtils.clamp(camYawDeg + ev.movementX * 0.12, -18, 18);
      camPitchDeg = MathUtils.clamp(
        camPitchDeg - ev.movementY * 0.12,
        -32,
        -4
      );
      applyDesktopCameraLook();
    }
  });

  broadcastOverlay = new BroadcastCockpitOverlay({
    world,
    sessionEntity,
    telemetryEngine,
    audioEngine,
    scrubSystem,
    challengeSystem,
    aeroDuelSystem,
    timeLoopSystem,
    haloCockpitSystem,
    winnerPolishSystem,
    onResetDesktopCamera: resetDesktopCameraLook,
  });

  // ============================================================================
  // 13. PARSE & APPLY DEEP-LINK / JUDGE INVITE URL PARAMETERS (?invite=judge...)
  // ============================================================================
  const params = new URLSearchParams(window.location.search);
  const inviteParam = params.get('invite') || params.get('judge');
  const stageParam = params.get('stage');
  const brakeParam = params.get('brake');
  const apexParam = params.get('apex');
  const modeParam = params.get('mode');

  if (
    inviteParam !== null ||
    stageParam !== null ||
    brakeParam !== null ||
    apexParam !== null ||
    modeParam !== null
  ) {
    if (inviteParam && inviteParam !== '0' && inviteParam !== 'false') {
      challengeSystem.simulate14DayJudgeStreak();
      winnerPolishSystem.triggerDroneExcitementPulse();
    }
    if (stageParam !== null) {
      const parsedStage = Number(stageParam);
      if (!Number.isNaN(parsedStage)) {
        const zeroBased = parsedStage >= 1 && parsedStage <= 3 ? parsedStage - 1 : parsedStage;
        challengeSystem.selectStage(zeroBased);
      }
    }
    if (brakeParam !== null && !Number.isNaN(Number(brakeParam))) {
      challengeSystem.setBrakeOffsetDial(Number(brakeParam), false);
    }
    if (apexParam !== null && !Number.isNaN(Number(apexParam))) {
      challengeSystem.setApexShiftDial(Number(apexParam), false);
    }
    aeroDuelSystem.evaluateAeroGameTheoryDuel();
    const forkRes = challengeSystem.executeCurrentStageFork();

    if (modeParam === 'halo' || modeParam === 'cockpit') {
      haloCockpitSystem.enterFirstPersonHaloCockpit();
    }

    const activeVm = challengeSystem.getScoreboardViewModel();
    console.info('[Judge Invite URL Verified]', {
      invite: inviteParam || 'custom',
      stage: activeVm.currentStage.stageIndex + 1,
      brakeMeters: activeVm.dialedBrakeMeters,
      apexMeters: activeVm.dialedApexMeters,
      strategistElo: activeVm.strategistElo,
      streakDays: activeVm.streakDays,
    });

    broadcastOverlay.showToast(
      `INVITE SESSION ACTIVE • ${activeVm.currentStage.code}`,
      forkRes
        ? `${forkRes.verdictHeadline} — Pre-loaded from invite link (ELO ${activeVm.strategistElo}).`
        : `14-Day Judge Career & Stage ${activeVm.currentStage.stageIndex + 1} pre-loaded from invite URL.`,
      'success',
      6000
    );
  }

  // Desktop Keyboard Shortcuts for rapid testing in Chrome / IWER Emulator:
  // [H] = Toggle 1:1 Halo Cockpit | [Q]/[E] = Left/Right Pinch Paddle Shift
  // [A]/[D] = Steer Air-Yoke Left/Right | [J] = 14-Day Judge Streak | [Space] = Execute Fork | [R] = Reset Cam
  window.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement) return;
    audioEngine.unlockAndStart();
    switch (ev.code) {
      case 'KeyH':
        if (haloCockpitSystem.mode === 'FIRST_PERSON_HALO_COCKPIT') {
          haloCockpitSystem.exitToMacroPitWall();
        } else {
          haloCockpitSystem.enterFirstPersonHaloCockpit();
        }
        break;
      case 'KeyQ':
        haloCockpitSystem.triggerPaddleShift('DOWNSHIFT_LEFT');
        break;
      case 'KeyE':
        haloCockpitSystem.triggerPaddleShift('UPSHIFT_RIGHT');
        break;
      case 'KeyA':
      case 'ArrowLeft':
        haloCockpitSystem.setAirYokeSteerAngleDeg(
          haloCockpitSystem.telemetry.steerAngleDeg - 8
        );
        break;
      case 'KeyD':
      case 'ArrowRight':
        haloCockpitSystem.setAirYokeSteerAngleDeg(
          haloCockpitSystem.telemetry.steerAngleDeg + 8
        );
        break;
      case 'KeyJ':
        challengeSystem.simulate14DayJudgeStreak();
        winnerPolishSystem.triggerDroneExcitementPulse();
        break;
      case 'KeyR':
        resetDesktopCameraLook();
        break;
      case 'Space':
        ev.preventDefault();
        if (timeLoopSystem.phase === 'CRASH_FROZEN') {
          timeLoopSystem.releaseElasticSlingshot();
        }
        aeroDuelSystem.evaluateAeroGameTheoryDuel();
        const res = challengeSystem.executeCurrentStageFork();
        if (res) {
          broadcastOverlay?.showToast(
            res.verdictHeadline,
            res.physicsExplanation,
            res.didBreachTractionLimit ? 'danger' : 'success'
          );
        }
        break;
    }
  });
}

bootstrapApexPulseXR().catch(console.error);
