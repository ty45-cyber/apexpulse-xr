import { createComponent, defineComponents, Types } from '@iwsdk/core';

/**
 * Enforces the 2-foot (0.58m) Airplane Seat Test spherical shell around the user.
 */
export const SeatedEnvelopeNode = createComponent('SeatedEnvelopeNode', {
  targetRadius: { type: Types.Float32, default: 0.40 },
  azimuthDeg: { type: Types.Float32, default: 0.0 },
  elevationDeg: { type: Types.Float32, default: -18.0 },
  minRadius: { type: Types.Float32, default: 0.28 },
  maxRadius: { type: Types.Float32, default: 0.58 },
  maxLateralMeters: { type: Types.Float32, default: 0.28 },
  springStiffness: { type: Types.Float32, default: 9.0 },
  faceUser: { type: Types.Boolean, default: true },
  isGrabbed: { type: Types.Boolean, default: false },
});

/**
 * Dual-path Controllerless interaction (Poke + DistanceGrab + Gaze-Dwell Accessibility).
 */
export const HandsFirstNode = createComponent('HandsFirstNode', {
  role: { type: Types.String, default: 'generic' },
  payloadId: { type: Types.Int32, default: 0 },
  allowPoke: { type: Types.Boolean, default: true },
  allowDirectGrab: { type: Types.Boolean, default: false },
  allowDistancePull: { type: Types.Boolean, default: false },
  returnToSlotOnRelease: { type: Types.Boolean, default: true },
  isHovered: { type: Types.Boolean, default: false },
  hoverTimeSec: { type: Types.Float32, default: 0.0 },
  interactionCount: { type: Types.Int32, default: 0 },
});

/**
 * Global singleton state for telemetry playback, onboarding, and AI overlay.
 */
export const TelemetrySessionState = createComponent('TelemetrySessionState', {
  playheadSec: { type: Types.Float32, default: 19.8 },
  lapDurationSec: { type: Types.Float32, default: 60.0 },
  playbackRate: { type: Types.Float32, default: 1.0 },
  isPlaying: { type: Types.Boolean, default: true },
  isScrubbing: { type: Types.Boolean, default: false },
  onboardingComplete: { type: Types.Boolean, default: false },
  selectedCarIndex: { type: Types.Int32, default: 0 },
  activeSectorIndex: { type: Types.Int32, default: 1 },
  aiDeltaVisible: { type: Types.Boolean, default: false },
  gazeDwellEnabled: { type: Types.Boolean, default: true },
  scenarioIndex: { type: Types.Int32, default: 0 },
});

/**
 * Attached to miniature 3D race car entities travelling along the lap spline.
 */
export const TelemetryCarNode = createComponent('TelemetryCarNode', {
  carIndex: { type: Types.Int32, default: 0 },
  speedKmh: { type: Types.Float32, default: 0.0 },
  brakePressureBar: { type: Types.Float32, default: 0.0 },
  throttlePct: { type: Types.Float32, default: 0.0 },
  lateralG: { type: Types.Float32, default: 0.0 },
  longitudinalG: { type: Types.Float32, default: 0.0 },
  gear: { type: Types.Int32, default: 1 },
  rpm: { type: Types.Float32, default: 8000 },
});

/**
 * Tracks the 3-Stage "Beat the Race Strategist" progression loop,
 * user-dialed counterfactual parameters, and persistent career metrics.
 */
export const StrategistChallengeState = createComponent(
  'StrategistChallengeState',
  {
    currentStageIndex: { type: Types.Int32, default: 0 },
    stage1Stars: { type: Types.Int32, default: 0 },
    stage2Stars: { type: Types.Int32, default: 0 },
    stage3Stars: { type: Types.Int32, default: 0 },
    stage1BestDeltaMs: { type: Types.Int32, default: 0 },
    stage2BestDeltaMs: { type: Types.Int32, default: 0 },
    stage3BestDeltaMs: { type: Types.Int32, default: 0 },
    dialedBrakeOffsetMeters: { type: Types.Float32, default: 7.0 },
    dialedApexShiftMeters: { type: Types.Float32, default: -1.5 },
    strategistElo: { type: Types.Int32, default: 1200 },
    streakDays: { type: Types.Int32, default: 1 },
    totalForksRun: { type: Types.Int32, default: 0 },
    passthroughTvMode: { type: Types.Boolean, default: false },
  }
);

export default defineComponents([
  SeatedEnvelopeNode,
  HandsFirstNode,
  TelemetrySessionState,
  TelemetryCarNode,
  StrategistChallengeState,
]);