import {
  createSystem,
  DistanceGrabbable,
  MovementMode,
  OneHandGrabbable,
  PokeInteractable,
  RayInteractable,
  Transform,
  Vector3,
} from '@iwsdk/core';
import {
  HandsFirstNode,
  SeatedEnvelopeNode,
  TelemetrySessionState,
} from '../components';

export type NodeActivationCallback = (
  role: string,
  payloadId: number,
  entity: any
) => void;

export class HandsFirstInteractionSystem extends createSystem({
  interactiveNodes: { required: [Transform, HandsFirstNode] },
  sessionState: { required: [TelemetrySessionState] },
}) {
  private readonly hoverScale = new Vector3(1.12, 1.12, 1.12);
  private readonly activeScale = new Vector3(0.92, 0.92, 0.92);
  private readonly normalScale = new Vector3(1.0, 1.0, 1.0);
  private onActivateCallback: NodeActivationCallback | null = null;

  public setActivationHandler(cb: NodeActivationCallback): void {
    this.onActivateCallback = cb;
  }

  init(): void {
    const unsub = this.queries.interactiveNodes.subscribe(
      'qualify',
      (entity) => {
        const obj3D = entity.object3D;
        if (!obj3D) return;

        const allowPoke =
          entity.getValue(HandsFirstNode, 'allowPoke') ?? true;
        const allowDistancePull =
          entity.getValue(HandsFirstNode, 'allowDistancePull') ?? false;
        const allowDirectGrab =
          entity.getValue(HandsFirstNode, 'allowDirectGrab') ?? false;
        const returnToSlot =
          entity.getValue(HandsFirstNode, 'returnToSlotOnRelease') ?? true;

        if (!entity.hasComponent(RayInteractable)) {
          entity.addComponent(RayInteractable);
        }
        if (allowPoke && !entity.hasComponent(PokeInteractable)) {
          entity.addComponent(PokeInteractable);
        }

        if (allowDistancePull && !entity.hasComponent(DistanceGrabbable)) {
          entity.addComponent(DistanceGrabbable, {
            movementMode: MovementMode.MoveTowardsTarget,
            moveSpeedFactor: 0.2,
            targetPositionOffset: [0, 0.03, -0.34],
            targetQuaternionOffset: [0, 0, 0, 1],
            returnToOrigin: returnToSlot,
          });
        } else if (allowDirectGrab && !entity.hasComponent(OneHandGrabbable)) {
          entity.addComponent(OneHandGrabbable);
        }

        const onPointerEnter = () => {
          obj3D.scale.copy(this.hoverScale);
          entity.setValue(HandsFirstNode, 'isHovered', true);
          entity.setValue(HandsFirstNode, 'hoverTimeSec', 0);
        };

        const onPointerLeave = () => {
          obj3D.scale.copy(this.normalScale);
          entity.setValue(HandsFirstNode, 'isHovered', false);
          entity.setValue(HandsFirstNode, 'hoverTimeSec', 0);
          if (entity.hasComponent(SeatedEnvelopeNode)) {
            entity.setValue(SeatedEnvelopeNode, 'isGrabbed', false);
          }
        };

        const onPointerDown = () => {
          obj3D.scale.copy(this.activeScale);
          if (entity.hasComponent(SeatedEnvelopeNode)) {
            entity.setValue(SeatedEnvelopeNode, 'isGrabbed', true);
          }
          this.triggerEntityActivation(entity);
        };

        const onPointerUp = () => {
          obj3D.scale.copy(this.hoverScale);
          if (entity.hasComponent(SeatedEnvelopeNode)) {
            entity.setValue(SeatedEnvelopeNode, 'isGrabbed', false);
          }
        };

        obj3D.addEventListener('pointerenter', onPointerEnter);
        obj3D.addEventListener('pointerleave', onPointerLeave);
        obj3D.addEventListener('pointerdown', onPointerDown);
        obj3D.addEventListener('pointerup', onPointerUp);

        this.cleanupFuncs.push(() => {
          obj3D.removeEventListener('pointerenter', onPointerEnter);
          obj3D.removeEventListener('pointerleave', onPointerLeave);
          obj3D.removeEventListener('pointerdown', onPointerDown);
          obj3D.removeEventListener('pointerup', onPointerUp);
        });
      }
    );

    this.cleanupFuncs.push(unsub);
  }

  private triggerEntityActivation(entity: any): void {
    const role = entity.getValue(HandsFirstNode, 'role') ?? 'generic';
    const payloadId = entity.getValue(HandsFirstNode, 'payloadId') ?? 0;
    const count = entity.getValue(HandsFirstNode, 'interactionCount') ?? 0;
    entity.setValue(HandsFirstNode, 'interactionCount', count + 1);

    if (this.onActivateCallback) {
      this.onActivateCallback(role, payloadId, entity);
    }
  }

  update(delta: number): void {
    let gazeDwellEnabled = true;
    this.queries.sessionState.entities.forEach((stateEntity) => {
      gazeDwellEnabled =
        stateEntity.getValue(TelemetrySessionState, 'gazeDwellEnabled') ?? true;
    });

    if (!gazeDwellEnabled) return;

    this.queries.interactiveNodes.entities.forEach((entity) => {
      const isHovered = entity.getValue(HandsFirstNode, 'isHovered') ?? false;
      if (!isHovered) return;

      const hoverTime = entity.getValue(HandsFirstNode, 'hoverTimeSec') ?? 0;
      const nextHoverTime = hoverTime + delta;
      entity.setValue(HandsFirstNode, 'hoverTimeSec', nextHoverTime);

      if (nextHoverTime >= 0.65 && hoverTime < 0.65) {
        this.triggerEntityActivation(entity);
      }
    });
  }
}
