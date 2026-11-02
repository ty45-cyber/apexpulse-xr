import {
  createSystem,
  MathUtils,
  Quaternion,
  Transform,
  Types,
  Vector3,
} from '@iwsdk/core';
import { SeatedEnvelopeNode } from '../components';

export class SeatedCockpitSystem extends createSystem(
  {
    envelopeNodes: { required: [Transform, SeatedEnvelopeNode] },
  },
  {
    yawDeadbandDeg: { type: Types.Float32, default: 20.0 },
    recenterLerpSpeed: { type: Types.Float32, default: 4.5 },
  }
) {
  private readonly headPos = new Vector3(0, 1.2, 0);
  private readonly headQuat = new Quaternion();
  private readonly forwardVec = new Vector3();
  private readonly cockpitOrigin = new Vector3(0, 1.2, 0);
  private cockpitYawRad = 0;
  private isInitialized = false;

  private readonly idealWorldPos = new Vector3();
  private readonly currentWorldPos = new Vector3();
  private readonly offsetFromHead = new Vector3();

  init(): void {
    const unsub = this.queries.envelopeNodes.subscribe('qualify', (entity) => {
      this.sampleHeadPose();
      this.snapEntityToIdealSlot(entity.object3D!, entity);
    });
    this.cleanupFuncs.push(unsub);
  }

  public recenterToCurrentSeat(): void {
    this.sampleHeadPose();
    this.cockpitOrigin.copy(this.headPos);
    this.cockpitYawRad = Math.atan2(-this.forwardVec.x, -this.forwardVec.z);
  }

  private sampleHeadPose(): void {
    const xrCamera = this.world.renderer?.xr?.isPresenting
      ? this.world.renderer.xr.getCamera()
      : this.world.camera;
    if (!xrCamera) return;

    xrCamera.getWorldPosition(this.headPos);
    xrCamera.getWorldQuaternion(this.headQuat);
    this.forwardVec.set(0, 0, -1).applyQuaternion(this.headQuat);

    if (!this.isInitialized && this.headPos.lengthSq() > 0.001) {
      this.cockpitOrigin.copy(this.headPos);
      this.cockpitYawRad = Math.atan2(-this.forwardVec.x, -this.forwardVec.z);
      this.isInitialized = true;
    }
  }

  private computeIdealSlotPosition(entity: any, out: Vector3): Vector3 {
    const r = MathUtils.clamp(
      entity.getValue(SeatedEnvelopeNode, 'targetRadius') ?? 0.4,
      entity.getValue(SeatedEnvelopeNode, 'minRadius') ?? 0.28,
      entity.getValue(SeatedEnvelopeNode, 'maxRadius') ?? 0.58
    );
    const azRad = MathUtils.degToRad(
      entity.getValue(SeatedEnvelopeNode, 'azimuthDeg') ?? 0
    );
    const elRad = MathUtils.degToRad(
      entity.getValue(SeatedEnvelopeNode, 'elevationDeg') ?? -18
    );

    const totalYaw = this.cockpitYawRad - azRad;
    const horizDist = r * Math.cos(elRad);

    out.set(
      this.cockpitOrigin.x - horizDist * Math.sin(totalYaw),
      this.cockpitOrigin.y + r * Math.sin(elRad),
      this.cockpitOrigin.z - horizDist * Math.cos(totalYaw)
    );
    return out;
  }

  private snapEntityToIdealSlot(obj3D: any, entity: any): void {
    this.computeIdealSlotPosition(entity, this.idealWorldPos);
    obj3D.position.copy(this.idealWorldPos);
    if (entity.getValue(SeatedEnvelopeNode, 'faceUser')) {
      obj3D.lookAt(this.cockpitOrigin.x, obj3D.position.y, this.cockpitOrigin.z);
    }
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.1);
    this.sampleHeadPose();

    this.cockpitOrigin.lerp(this.headPos, Math.min(1.0, dt * 6.0));

    const currentHeadYaw = Math.atan2(-this.forwardVec.x, -this.forwardVec.z);
    let yawDiff = currentHeadYaw - this.cockpitYawRad;
    yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));

    const deadbandRad = MathUtils.degToRad(this.config.yawDeadbandDeg.peek());
    if (Math.abs(yawDiff) > deadbandRad) {
      this.cockpitYawRad +=
        yawDiff * Math.min(1.0, dt * this.config.recenterLerpSpeed.peek() * 0.5);
    }

    this.queries.envelopeNodes.entities.forEach((entity) => {
      const obj3D = entity.object3D;
      if (!obj3D) return;

      const isGrabbed = entity.getValue(SeatedEnvelopeNode, 'isGrabbed') ?? false;
      const minR = entity.getValue(SeatedEnvelopeNode, 'minRadius') ?? 0.28;
      const maxR = entity.getValue(SeatedEnvelopeNode, 'maxRadius') ?? 0.58;
      const maxLat =
        entity.getValue(SeatedEnvelopeNode, 'maxLateralMeters') ?? 0.28;
      const stiffness =
        entity.getValue(SeatedEnvelopeNode, 'springStiffness') ?? 9.0;

      if (!isGrabbed) {
        this.computeIdealSlotPosition(entity, this.idealWorldPos);
        this.currentWorldPos.copy(obj3D.position);
        this.offsetFromHead.subVectors(this.currentWorldPos, this.cockpitOrigin);

        const dist = this.offsetFromHead.length();
        if (
          dist > maxR ||
          dist < minR ||
          Math.abs(this.offsetFromHead.x) > maxLat
        ) {
          const clampedDist = MathUtils.clamp(dist, minR, maxR);
          this.offsetFromHead.normalize().multiplyScalar(clampedDist);
          this.offsetFromHead.x = MathUtils.clamp(
            this.offsetFromHead.x,
            -maxLat,
            maxLat
          );
          this.idealWorldPos.addVectors(this.cockpitOrigin, this.offsetFromHead);
        }

        obj3D.position.lerp(
          this.idealWorldPos,
          Math.min(1.0, dt * stiffness)
        );

        if (entity.getValue(SeatedEnvelopeNode, 'faceUser')) {
          obj3D.lookAt(
            this.cockpitOrigin.x,
            obj3D.position.y,
            this.cockpitOrigin.z
          );
        }
      }
    });
  }
}
