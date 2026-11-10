/**
 * Device profiles for every headset ApexPulse XR can run on.
 *
 * The game is pure WebXR, so any browser that exposes `navigator.xr` can play it.
 * These profiles only tune comfort and performance per device (layout, frame
 * rate, foveation, session mode). They never lock a device out.
 *
 * `meta-vr-glasses` follows the Meta VR Glasses ("Project Aero") PRD:
 *   - 5K micro-OLED (2412 x 2288 per eye), pancake lenses, auto-IPD
 *   - 95° H x 85° V hardware FoV (the IWER emulator uses a tighter, downward-biased
 *     74° x 68° visibility mask, so layout targets that stricter envelope)
 *   - 90 Hz baseline with dynamic scaling to 120 Hz
 *   - Eye + hand tracking only (no controllers), open-sided frame
 *   - Compute and battery live in a passively cooled puck, so we keep a thermal
 *     budget: eye-tracked foveation and 90 Hz whenever the scene is calm.
 */

export type DeviceProfileId =
  | 'meta-vr-glasses'
  | 'meta-quest-3'
  | 'meta-quest-pro'
  | 'meta-quest-2'
  | 'apple-vision-pro'
  | 'pico'
  | 'android-xr'
  | 'pcvr'
  | 'generic-webxr';

export type EmulatorDeviceKey =
  | 'metaVRGlasses'
  | 'metaQuest3'
  | 'metaQuestPro'
  | 'metaQuest2';

export interface DeviceProfile {
  id: DeviceProfileId;
  label: string;
  shortLabel: string;
  /** Usable horizontal / vertical FoV in degrees used for layout decisions. */
  fovHorizontalDeg: number;
  fovVerticalDeg: number;
  /** Frame rate used for calm scenes (Pit-Wall). */
  baselineFrameRate: number;
  /** Frame rate used for fast motion (1:1 Halo Cockpit duel). */
  boostFrameRate: number;
  /** 0 = off, 1 = max fixed / eye-tracked foveation. */
  foveation: number;
  /** WebXR framebuffer scale requested before the session starts. */
  framebufferScale: number;
  preferredSessionMode: 'immersive-ar' | 'immersive-vr';
  eyeTracking: boolean;
  handTracking: boolean;
  /** Multiplies every zone azimuth so the cockpit fits narrower FoVs. */
  layoutAzimuthScale: number;
  /** Added to every zone elevation (negative pushes content down). */
  layoutElevationOffsetDeg: number;
  /** IWER emulator config used when this profile is emulated on desktop. */
  emulatorDevice: EmulatorDeviceKey | null;
  notes: string;
}

export const DEVICE_PROFILES: Record<DeviceProfileId, DeviceProfile> = {
  'meta-vr-glasses': {
    id: 'meta-vr-glasses',
    label: 'Meta VR Glasses (Project Aero)',
    shortLabel: 'VR Glasses',
    fovHorizontalDeg: 74,
    fovVerticalDeg: 68,
    baselineFrameRate: 90,
    boostFrameRate: 120,
    foveation: 0.6,
    framebufferScale: 1.0,
    preferredSessionMode: 'immersive-ar',
    eyeTracking: true,
    handTracking: true,
    layoutAzimuthScale: 0.85,
    layoutElevationOffsetDeg: -4,
    emulatorDevice: 'metaVRGlasses',
    notes:
      '5K micro-OLED, 90 Hz baseline -> 120 Hz in the Halo duel, eye-tracked foveation to protect the passively cooled puck.',
  },
  'meta-quest-3': {
    id: 'meta-quest-3',
    label: 'Meta Quest 3 / 3S',
    shortLabel: 'Quest 3',
    fovHorizontalDeg: 110,
    fovVerticalDeg: 96,
    baselineFrameRate: 90,
    boostFrameRate: 120,
    foveation: 0.4,
    framebufferScale: 1.0,
    preferredSessionMode: 'immersive-ar',
    eyeTracking: false,
    handTracking: true,
    layoutAzimuthScale: 1.0,
    layoutElevationOffsetDeg: 0,
    emulatorDevice: 'metaQuest3',
    notes: 'Color passthrough MR with hand tracking.',
  },
  'meta-quest-pro': {
    id: 'meta-quest-pro',
    label: 'Meta Quest Pro',
    shortLabel: 'Quest Pro',
    fovHorizontalDeg: 106,
    fovVerticalDeg: 96,
    baselineFrameRate: 90,
    boostFrameRate: 90,
    foveation: 0.5,
    framebufferScale: 1.0,
    preferredSessionMode: 'immersive-ar',
    eyeTracking: true,
    handTracking: true,
    layoutAzimuthScale: 1.0,
    layoutElevationOffsetDeg: 0,
    emulatorDevice: 'metaQuestPro',
    notes: 'Eye tracking enables native gaze-dwell.',
  },
  'meta-quest-2': {
    id: 'meta-quest-2',
    label: 'Meta Quest 2',
    shortLabel: 'Quest 2',
    fovHorizontalDeg: 97,
    fovVerticalDeg: 93,
    baselineFrameRate: 72,
    boostFrameRate: 90,
    foveation: 0.7,
    framebufferScale: 0.9,
    preferredSessionMode: 'immersive-ar',
    eyeTracking: false,
    handTracking: true,
    layoutAzimuthScale: 1.0,
    layoutElevationOffsetDeg: 0,
    emulatorDevice: 'metaQuest2',
    notes: 'Lower render scale and higher foveation keep XR2 Gen 1 smooth.',
  },
  'apple-vision-pro': {
    id: 'apple-vision-pro',
    label: 'Apple Vision Pro (Safari)',
    shortLabel: 'Vision Pro',
    fovHorizontalDeg: 100,
    fovVerticalDeg: 90,
    baselineFrameRate: 90,
    boostFrameRate: 90,
    foveation: 0.3,
    framebufferScale: 1.0,
    preferredSessionMode: 'immersive-vr',
    eyeTracking: true,
    handTracking: true,
    layoutAzimuthScale: 1.0,
    layoutElevationOffsetDeg: 0,
    emulatorDevice: null,
    notes: 'Safari exposes immersive-vr with gaze + pinch (transient-pointer).',
  },
  pico: {
    id: 'pico',
    label: 'PICO 4 / 4 Ultra',
    shortLabel: 'PICO',
    fovHorizontalDeg: 105,
    fovVerticalDeg: 95,
    baselineFrameRate: 90,
    boostFrameRate: 90,
    foveation: 0.5,
    framebufferScale: 1.0,
    preferredSessionMode: 'immersive-ar',
    eyeTracking: false,
    handTracking: true,
    layoutAzimuthScale: 1.0,
    layoutElevationOffsetDeg: 0,
    emulatorDevice: null,
    notes: 'PICO Browser WebXR with passthrough.',
  },
  'android-xr': {
    id: 'android-xr',
    label: 'Android XR (Chrome)',
    shortLabel: 'Android XR',
    fovHorizontalDeg: 100,
    fovVerticalDeg: 90,
    baselineFrameRate: 90,
    boostFrameRate: 90,
    foveation: 0.4,
    framebufferScale: 1.0,
    preferredSessionMode: 'immersive-ar',
    eyeTracking: true,
    handTracking: true,
    layoutAzimuthScale: 1.0,
    layoutElevationOffsetDeg: 0,
    emulatorDevice: null,
    notes: 'Chrome on Android XR headsets.',
  },
  pcvr: {
    id: 'pcvr',
    label: 'PC VR (SteamVR / OpenXR)',
    shortLabel: 'PC VR',
    fovHorizontalDeg: 105,
    fovVerticalDeg: 100,
    baselineFrameRate: 90,
    boostFrameRate: 90,
    foveation: 0,
    framebufferScale: 1.0,
    preferredSessionMode: 'immersive-vr',
    eyeTracking: false,
    handTracking: false,
    layoutAzimuthScale: 1.0,
    layoutElevationOffsetDeg: 0,
    emulatorDevice: null,
    notes: 'Desktop Chrome/Edge with an OpenXR runtime; controllers act as hands.',
  },
  'generic-webxr': {
    id: 'generic-webxr',
    label: 'WebXR Headset',
    shortLabel: 'WebXR',
    fovHorizontalDeg: 90,
    fovVerticalDeg: 85,
    baselineFrameRate: 90,
    boostFrameRate: 90,
    foveation: 0.4,
    framebufferScale: 1.0,
    preferredSessionMode: 'immersive-vr',
    eyeTracking: false,
    handTracking: true,
    layoutAzimuthScale: 0.95,
    layoutElevationOffsetDeg: 0,
    emulatorDevice: null,
    notes: 'Conservative defaults for unknown headsets.',
  },
};

/** URL aliases accepted by `?device=` so invite links stay short. */
const DEVICE_ALIASES: Record<string, DeviceProfileId> = {
  aero: 'meta-vr-glasses',
  glasses: 'meta-vr-glasses',
  'vr-glasses': 'meta-vr-glasses',
  'meta-vr-glasses': 'meta-vr-glasses',
  quest3: 'meta-quest-3',
  'quest-3': 'meta-quest-3',
  'meta-quest-3': 'meta-quest-3',
  questpro: 'meta-quest-pro',
  'quest-pro': 'meta-quest-pro',
  'meta-quest-pro': 'meta-quest-pro',
  quest2: 'meta-quest-2',
  'quest-2': 'meta-quest-2',
  'meta-quest-2': 'meta-quest-2',
  visionpro: 'apple-vision-pro',
  'vision-pro': 'apple-vision-pro',
  pico: 'pico',
  androidxr: 'android-xr',
  'android-xr': 'android-xr',
  pcvr: 'pcvr',
  steamvr: 'pcvr',
};

export function resolveDeviceAlias(
  raw: string | null | undefined
): DeviceProfileId | null {
  if (!raw) return null;
  return DEVICE_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/** Best-effort detection of the physical headset from the browser environment. */
export function detectNativeHeadset(
  userAgent: string,
  maxTouchPoints: number,
  supportsAR: boolean
): DeviceProfileId {
  const ua = userAgent || '';
  if (/OculusBrowser|Quest/i.test(ua)) {
    if (/Quest Pro/i.test(ua)) return 'meta-quest-pro';
    if (/Quest 2/i.test(ua)) return 'meta-quest-2';
    return 'meta-quest-3';
  }
  if (/Pico/i.test(ua)) return 'pico';
  if (/Android/i.test(ua)) return 'android-xr';
  // visionOS Safari reports a Macintosh UA but exposes touch points.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 0) return 'apple-vision-pro';
  if (/Windows|Linux|Macintosh/i.test(ua) && !supportsAR) return 'pcvr';
  return 'generic-webxr';
}
