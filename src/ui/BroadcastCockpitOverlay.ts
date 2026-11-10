import { Vector3 } from '@iwsdk/core';
import { TelemetrySessionState } from '../components';
import { AeroGameTheoryDuelSystem } from '../systems/AeroGameTheoryDuelSystem';
import { SpatialHaloCockpitSystem } from '../systems/SpatialHaloCockpitSystem';
import { StrategistChallengeSystem } from '../systems/StrategistChallengeSystem';
import { TelemetryScrubSystem } from '../systems/TelemetryScrubSystem';
import { TimeLoopAndEnvironmentSystem } from '../systems/TimeLoopAndEnvironmentSystem';
import { WinnerPolishSystem } from '../systems/WinnerPolishSystem';
import {
  CarKinematicSnapshot,
  CircuitTelemetryEngine,
} from '../telemetry/CircuitTelemetryEngine';
import { SpatialDopplerAudio } from '../audio/SpatialDopplerAudio';
import { UniversalDeviceManager } from '../xr/UniversalDeviceManager';
import { DEVICE_PROFILES, DeviceProfileId } from '../xr/DeviceProfiles';

export interface BroadcastOverlayDeps {
  world: any;
  sessionEntity: any;
  telemetryEngine: CircuitTelemetryEngine;
  audioEngine: SpatialDopplerAudio;
  scrubSystem: TelemetryScrubSystem;
  challengeSystem: StrategistChallengeSystem;
  aeroDuelSystem: AeroGameTheoryDuelSystem;
  timeLoopSystem: TimeLoopAndEnvironmentSystem;
  haloCockpitSystem: SpatialHaloCockpitSystem;
  winnerPolishSystem: WinnerPolishSystem;
  onResetDesktopCamera: () => void;
}

export class BroadcastCockpitOverlay {
  private readonly deps: BroadcastOverlayDeps;
  private readonly root: HTMLDivElement;
  private readonly restoreBtn: HTMLButtonElement;

  private userHidden = false;
  private alertDismissedForFreeze = false;
  private transientToastUntilMs = 0;
  private transientToastTitle = '';
  private transientToastSub = '';
  private transientToastKind: 'info' | 'danger' | 'success' = 'info';

  // Cached DOM references
  private elModeBadge!: HTMLElement;
  private elLapClock!: HTMLElement;
  private elPhaseBadge!: HTMLElement;
  private elCareerBadge!: HTMLElement;
  private elFpsBadge!: HTMLElement;
  private elPuckBadge!: HTMLElement;
  private elDeviceBtnLabel!: HTMLElement;
  private elDeviceModal!: HTMLElement;
  private elDeviceChipsContainer!: HTMLElement;
  private elActiveProfileName!: HTMLElement;
  private elSpecDisplay!: HTMLElement;
  private elSpecPuck!: HTMLElement;
  private elSpecRefresh!: HTMLElement;
  private elSpecTemp!: HTMLElement;
  private elQrImage!: HTMLImageElement;
  private stageBtns: HTMLButtonElement[] = [];
  private stageStarSpans: HTMLElement[] = [];

  private elAlertWrap!: HTMLElement;
  private elAlertBanner!: HTMLElement;
  private elAlertTitle!: HTMLElement;
  private elAlertSub!: HTMLElement;
  private elAlertActions!: HTMLElement;

  private elMacroDock!: HTMLElement;
  private elPlayBtn!: HTMLButtonElement;
  private elTimelineSlider!: HTMLInputElement;
  private elTelemetrySummary!: HTMLElement;
  private elBrakeVal!: HTMLElement;
  private elBrakeSlider!: HTMLInputElement;
  private elApexVal!: HTMLElement;
  private elApexSlider!: HTMLInputElement;
  private elGripVal!: HTMLElement;
  private elGripFill!: HTMLElement;

  private elVisorDock!: HTMLElement;
  private rpmLeds: HTMLElement[] = [];
  private elVisorGear!: HTMLElement;
  private elVisorSpeed!: HTMLElement;
  private elVisorRpm!: HTMLElement;
  private elVisorSteer!: HTMLElement;
  private elVisorErsVal!: HTMLElement;
  private elVisorErsFill!: HTMLElement;
  private elVisorGapVal!: HTMLElement;
  private elVisorProgressFill!: HTMLElement;

  private isScrubbingTimeline = false;
  private readonly scratchSnapshot: CarKinematicSnapshot = {
    normalizedProgress: 0,
    localPos: new Vector3(),
    tangent: new Vector3(),
    speedKmh: 240,
    brakePressureBar: 0,
    throttlePct: 100,
    lateralG: 0,
    longitudinalG: 0,
    gear: 6,
    rpm: 10500,
    tireTempsC: [92, 92, 90, 90],
  };

  constructor(deps: BroadcastOverlayDeps) {
    this.deps = deps;
    this.root = document.createElement('div');
    this.root.className = 'apx-overlay';

    this.restoreBtn = document.createElement('button');
    this.restoreBtn.className = 'apx-card apx-util-btn apx-hud-restore';
    this.restoreBtn.innerHTML = 'Show Pit-Wall HUD <span class="apx-kbd">Tab</span>';
    this.restoreBtn.addEventListener('click', () => this.toggleHudVisibility(false));

    this.buildMarkup();
    document.body.appendChild(this.root);
    document.body.appendChild(this.restoreBtn);
    this.startSyncLoop();
  }

  public showToast(
    title: string,
    subtitle: string,
    kind: 'info' | 'danger' | 'success' = 'success',
    durationMs = 4800
  ): void {
    this.transientToastTitle = title;
    this.transientToastSub = subtitle;
    this.transientToastKind = kind;
    this.transientToastUntilMs = performance.now() + durationMs;
  }

  public toggleHudVisibility(forceHidden?: boolean): void {
    this.userHidden =
      forceHidden !== undefined ? forceHidden : !this.userHidden;
    this.root.classList.toggle('is-hidden', this.userHidden);
    this.restoreBtn.classList.toggle('is-visible', this.userHidden);
  }

  private buildMarkup(): void {
    this.root.innerHTML = `
      <div class="apx-top-bar">
        <div class="apx-card apx-brand-cluster">
          <div class="apx-brand-row">
            <div class="apx-logo">
              <span class="apx-pulse-dot"></span>
              <span>APEXPULSE XR</span>
            </div>
            <span class="apx-badge apx-badge-cyan" id="apx-mode-badge">MACRO PIT-WALL</span>
          </div>
          <div class="apx-meta-row">
            <span id="apx-lap-clock">LAP 00:19.80 / 01:00.00</span>
            <span>•</span>
            <span class="apx-badge apx-badge-emerald" id="apx-phase-badge">LIVE TELEMETRY</span>
          </div>
          <div class="apx-meta-row">
            <span class="apx-badge apx-badge-gold" id="apx-career-badge">DAY 1 STREAK • ELO 1200</span>
          </div>
          <div class="apx-meta-row apx-puck-row">
            <span class="apx-badge apx-badge-cyan" id="apx-fps-badge">90 FPS (DYNAMIC)</span>
            <span class="apx-badge apx-badge-emerald" id="apx-puck-badge">PUCK 38°C • XR2 GEN 3</span>
          </div>
        </div>

        <div class="apx-card apx-right-cluster">
          <button class="apx-stage-pill is-active" data-stage="0" title="Stage 1: Turn 4 Late-Apex Switchback">
            <span>S1 Hairpin</span>
            <span class="apx-stars" id="apx-s0-stars">☆☆☆</span>
          </button>
          <button class="apx-stage-pill" data-stage="1" title="Stage 2: Sector 1 Uphill Aero Esses">
            <span>S2 Crest</span>
            <span class="apx-stars" id="apx-s1-stars">☆☆☆</span>
          </button>
          <button class="apx-stage-pill" data-stage="2" title="Stage 3: Sector 3 Banked Sweeper">
            <span>S3 Sweeper</span>
            <span class="apx-stars" id="apx-s2-stars">☆☆☆</span>
          </button>
          <button class="apx-util-btn apx-btn-device" id="apx-btn-device" title="Active Headset Profile & Project Aero Specs">
            👓 <span id="apx-device-label">VR Glasses</span>
          </button>
          <button class="apx-util-btn apx-btn-qr" id="apx-btn-qr" title="Scan QR Code to Connect ANY VR Headset">
            📱 Connect Headset
          </button>
          <button class="apx-btn-enter-xr" id="apx-btn-enter-xr" title="Enter Immersive WebXR">
            Enter VR
          </button>
          <button class="apx-util-btn" id="apx-btn-scale" title="Expand or compact 3D tabletop circuit scale">2x Scale</button>
          <button class="apx-util-btn" id="apx-btn-streak" title="Simulate 14-Day Pro Strategist Career">14D Pro</button>
          <button class="apx-util-btn" id="apx-btn-invite" title="Copy Shareable Judge / Challenge Invite URL">Invite URL</button>
          <button class="apx-util-btn" id="apx-btn-reset-cam" title="Reset Desktop Camera Angle (R)">Reset Cam</button>
          <button class="apx-util-btn" id="apx-btn-hide-hud" title="Toggle 2D Broadcast Overlay (Tab)">HUD <span class="apx-kbd">Tab</span></button>
        </div>
      </div>

      <div class="apx-alert-wrap" id="apx-alert-wrap" style="display: none;">
        <div class="apx-alert-banner is-danger" id="apx-alert-banner">
          <div class="apx-alert-text">
            <div class="apx-alert-title" id="apx-alert-title">TURN 4 DIRTY-AIR LOCKUP AT 22.8s</div>
            <div class="apx-alert-sub" id="apx-alert-sub">Car A locked front-left in Car B's aero wake. Rewind &amp; launch a clean-air fork or take the wheel in 1:1 Halo mode!</div>
          </div>
          <div class="apx-alert-actions" id="apx-alert-actions">
            <button class="apx-btn-primary" id="apx-alert-fork-btn">Rewind &amp; Fork</button>
            <button class="apx-btn-halo" id="apx-alert-halo-btn">1:1 Halo Duel</button>
          </div>
        </div>
      </div>

      <!-- MACRO PIT-WALL INTERACTIVE DOCK -->
      <div class="apx-card apx-bottom-dock" id="apx-macro-dock">
        <div class="apx-dock-section">
          <div class="apx-section-head">
            <span>Lap Telemetry Timeline</span>
            <span class="apx-mono-val" id="apx-telemetry-summary">CAR A: 242 KM/H • G6 • 2.8G</span>
          </div>
          <div class="apx-transport-row">
            <button class="apx-icon-btn" id="apx-btn-play">Pause</button>
            <button class="apx-icon-btn" id="apx-btn-rewind-t4" title="Jump to 3.0s before Turn 4 Hairpin Duel">T4 Duel</button>
            <input type="range" class="apx-slider" id="apx-timeline-slider" min="0" max="60" step="0.05" value="19.8" />
          </div>
        </div>

        <div class="apx-dials-grid">
          <div class="apx-dock-section">
            <div class="apx-section-head">
              <span>Brake Offset</span>
              <span class="apx-mono-val" id="apx-brake-val">+7.0m</span>
            </div>
            <input type="range" class="apx-slider" id="apx-brake-slider" min="-4" max="16.5" step="0.5" value="7.0" />
          </div>

          <div class="apx-dock-section">
            <div class="apx-section-head">
              <span>Apex Line</span>
              <span class="apx-mono-val" id="apx-apex-val">-1.5m</span>
            </div>
            <input type="range" class="apx-slider" id="apx-apex-slider" min="-2.6" max="2.4" step="0.1" value="-1.5" />
          </div>

          <div class="apx-dock-section">
            <div class="apx-section-head">
              <span>Kamm Grip</span>
              <span class="apx-mono-val" id="apx-grip-val">89%</span>
            </div>
            <div class="apx-grip-meter">
              <div class="apx-grip-fill" id="apx-grip-fill"></div>
            </div>
          </div>
        </div>

        <div class="apx-cta-group">
          <button class="apx-btn-primary" id="apx-dock-fork-btn">
            <span>Run Fork</span>
            <span class="apx-kbd">Space</span>
          </button>
          <button class="apx-btn-halo" id="apx-dock-halo-btn">
            <span>1:1 Halo Cockpit</span>
            <span class="apx-kbd">H</span>
          </button>
        </div>
      </div>

      <!-- 1:1 FIRST-PERSON FIA HALO DRIVER VISOR DOCK -->
      <div class="apx-card apx-visor-dock" id="apx-visor-dock">
        <div class="apx-rpm-strip" id="apx-rpm-strip">
          ${Array.from({ length: 15 })
            .map(() => '<div class="apx-rpm-led"></div>')
            .join('')}
        </div>

        <div class="apx-visor-main">
          <div class="apx-gear-box">
            <span class="apx-gear-num" id="apx-visor-gear">7</span>
            <div class="apx-speed-stack">
              <span class="apx-speed-num" id="apx-visor-speed">296</span>
              <span class="apx-speed-unit">KM/H • <span id="apx-visor-rpm">11,650 RPM</span></span>
            </div>
          </div>

          <div class="apx-dock-section">
            <div class="apx-section-head">
              <span>ERS Hybrid Deploy</span>
              <span class="apx-mono-val" id="apx-visor-ers-val">92% • Yoke <span id="apx-visor-steer">-12°</span></span>
            </div>
            <div class="apx-grip-meter">
              <div class="apx-grip-fill" id="apx-visor-ers-fill" style="width: 92%;"></div>
            </div>
          </div>

          <div class="apx-dock-section">
            <div class="apx-section-head">
              <span>Turn 4 Overtake vs Car B</span>
              <span class="apx-mono-val" id="apx-visor-gap-val">+9.5m AHEAD</span>
            </div>
            <div class="apx-grip-meter">
              <div class="apx-grip-fill" id="apx-visor-progress-fill" style="width: 0%;"></div>
            </div>
          </div>

          <button class="apx-util-btn" id="apx-visor-exit-btn">
            Exit Visor <span class="apx-kbd">H</span>
          </button>
        </div>

        <div class="apx-visor-controls">
          <button class="apx-icon-btn" id="apx-visor-downshift">Downshift <span class="apx-kbd">Q</span></button>
          <button class="apx-icon-btn" id="apx-visor-steer-l">◄ Steer Inside <span class="apx-kbd">A</span></button>
          <button class="apx-icon-btn" id="apx-visor-steer-r">Steer Outside ► <span class="apx-kbd">D</span></button>
          <button class="apx-icon-btn" id="apx-visor-upshift">Upshift <span class="apx-kbd">E</span></button>
        </div>
      </div>

      <!-- UNIVERSAL HEADSET PAIRING & PROJECT AERO MODAL -->
      <div class="apx-modal-backdrop" id="apx-device-modal" style="display: none;">
        <div class="apx-device-modal-card">
          <div class="apx-modal-head">
            <div class="apx-modal-title">
              <span class="apx-pulse-dot"></span>
              <span>Universal WebXR &amp; Meta VR Glasses (Project Aero)</span>
            </div>
            <button class="apx-icon-btn apx-modal-close" id="apx-modal-close">✕ Close</button>
          </div>

          <div class="apx-modal-body">
            <div class="apx-modal-section">
              <div class="apx-section-head">
                <span>ACTIVE VR / MR DEVICE PROFILE</span>
                <span class="apx-mono-val" id="apx-active-profile-name">Meta VR Glasses (Project Aero)</span>
              </div>
              <div class="apx-device-chips-grid" id="apx-device-chips">
                <!-- Populated dynamically via device profiles -->
              </div>
            </div>

            <!-- Project Aero PRD Spotlight -->
            <div class="apx-modal-section apx-aero-specs-card">
              <div class="apx-section-head">
                <span>PROJECT AERO HARDWARE ARCHITECTURE (PRD COMPLIANT)</span>
                <span class="apx-badge apx-badge-cyan">SPRING 2027 • $1,299.99</span>
              </div>
              <div class="apx-specs-grid">
                <div class="apx-spec-item">
                  <span class="apx-spec-label">Display Subsystem</span>
                  <span class="apx-spec-val" id="apx-spec-display">5K Micro-OLED (2412x2288)</span>
                </div>
                <div class="apx-spec-item">
                  <span class="apx-spec-label">Compute Puck</span>
                  <span class="apx-spec-val" id="apx-spec-puck">Qualcomm XR2 Gen 3 • 12GB LPDDR5X</span>
                </div>
                <div class="apx-spec-item">
                  <span class="apx-spec-label">Dynamic Scaling</span>
                  <span class="apx-spec-val" id="apx-spec-refresh">90Hz Baseline ➔ 120Hz Halo Boost</span>
                </div>
                <div class="apx-spec-item">
                  <span class="apx-spec-label">Form Factor & Ergonomics</span>
                  <span class="apx-spec-val">≤100g • Open-Sided Frame</span>
                </div>
                <div class="apx-spec-item">
                  <span class="apx-spec-label">Natural Input Mode</span>
                  <span class="apx-spec-val">Hands + Eye Gaze (Zero Controllers)</span>
                </div>
                <div class="apx-spec-item">
                  <span class="apx-spec-label">Puck Thermals</span>
                  <span class="apx-spec-val" id="apx-spec-temp">38.2°C (Vapor Chamber Passive Cool)</span>
                </div>
              </div>
            </div>

            <!-- Instant Headset Pairing QR Code -->
            <div class="apx-modal-section apx-qr-pairing-box">
              <div class="apx-qr-preview-col">
                <img id="apx-qr-image" class="apx-qr-image" alt="Universal VR Pairing QR Code" />
              </div>
              <div class="apx-qr-info-col">
                <h4>Instant Multi-Device Connection</h4>
                <p>Put on <strong>Meta VR Glasses</strong>, <strong>Meta Quest 3/Pro</strong>, <strong>Apple Vision Pro</strong>, <strong>PICO</strong>, or any WebXR headset and point your browser or camera at this QR code. The session launches instantly with your active race stage and brake tuning.</p>
                <div class="apx-qr-actions">
                  <button class="apx-btn-primary" id="apx-btn-copy-deep-link">Copy Headset URL</button>
                  <button class="apx-btn-enter-xr" id="apx-btn-modal-enter-xr">Enter VR / AR</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Query elements
    this.elModeBadge = this.root.querySelector('#apx-mode-badge')!;
    this.elLapClock = this.root.querySelector('#apx-lap-clock')!;
    this.elPhaseBadge = this.root.querySelector('#apx-phase-badge')!;
    this.elCareerBadge = this.root.querySelector('#apx-career-badge')!;
    this.elFpsBadge = this.root.querySelector('#apx-fps-badge')!;
    this.elPuckBadge = this.root.querySelector('#apx-puck-badge')!;
    this.elDeviceBtnLabel = this.root.querySelector('#apx-device-label')!;

    this.elDeviceModal = this.root.querySelector('#apx-device-modal')!;
    this.elDeviceChipsContainer = this.root.querySelector('#apx-device-chips')!;
    this.elActiveProfileName = this.root.querySelector('#apx-active-profile-name')!;
    this.elSpecDisplay = this.root.querySelector('#apx-spec-display')!;
    this.elSpecPuck = this.root.querySelector('#apx-spec-puck')!;
    this.elSpecRefresh = this.root.querySelector('#apx-spec-refresh')!;
    this.elSpecTemp = this.root.querySelector('#apx-spec-temp')!;
    this.elQrImage = this.root.querySelector('#apx-qr-image') as HTMLImageElement;

    this.stageBtns = Array.from(this.root.querySelectorAll('.apx-stage-pill'));
    this.stageStarSpans = [
      this.root.querySelector('#apx-s0-stars')!,
      this.root.querySelector('#apx-s1-stars')!,
      this.root.querySelector('#apx-s2-stars')!,
    ];

    this.elAlertWrap = this.root.querySelector('#apx-alert-wrap')!;
    this.elAlertBanner = this.root.querySelector('#apx-alert-banner')!;
    this.elAlertTitle = this.root.querySelector('#apx-alert-title')!;
    this.elAlertSub = this.root.querySelector('#apx-alert-sub')!;
    this.elAlertActions = this.root.querySelector('#apx-alert-actions')!;

    this.elMacroDock = this.root.querySelector('#apx-macro-dock')!;
    this.elPlayBtn = this.root.querySelector('#apx-btn-play')!;
    this.elTimelineSlider = this.root.querySelector('#apx-timeline-slider')!;
    this.elTelemetrySummary = this.root.querySelector('#apx-telemetry-summary')!;
    this.elBrakeVal = this.root.querySelector('#apx-brake-val')!;
    this.elBrakeSlider = this.root.querySelector('#apx-brake-slider')!;
    this.elApexVal = this.root.querySelector('#apx-apex-val')!;
    this.elApexSlider = this.root.querySelector('#apx-apex-slider')!;
    this.elGripVal = this.root.querySelector('#apx-grip-val')!;
    this.elGripFill = this.root.querySelector('#apx-grip-fill')!;

    this.elVisorDock = this.root.querySelector('#apx-visor-dock')!;
    this.rpmLeds = Array.from(this.root.querySelectorAll('.apx-rpm-led'));
    this.elVisorGear = this.root.querySelector('#apx-visor-gear')!;
    this.elVisorSpeed = this.root.querySelector('#apx-visor-speed')!;
    this.elVisorRpm = this.root.querySelector('#apx-visor-rpm')!;
    this.elVisorSteer = this.root.querySelector('#apx-visor-steer')!;
    this.elVisorErsVal = this.root.querySelector('#apx-visor-ers-val')!;
    this.elVisorErsFill = this.root.querySelector('#apx-visor-ers-fill')!;
    this.elVisorGapVal = this.root.querySelector('#apx-visor-gap-val')!;
    this.elVisorProgressFill = this.root.querySelector('#apx-visor-progress-fill')!;

    this.wireInteractions();
  }

  private wireInteractions(): void {
    const unlock = () => this.deps.audioEngine.unlockAndStart();

    this.stageBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        unlock();
        const idx = Number(btn.dataset.stage ?? 0);
        this.deps.challengeSystem.selectStage(idx);
        this.deps.aeroDuelSystem.evaluateAeroGameTheoryDuel();
      });
    });

    this.root.querySelector('#apx-btn-scale')?.addEventListener('click', (e) => {
      unlock();
      const isExpanded = this.deps.winnerPolishSystem.toggleDioramaWrapScale();
      (e.currentTarget as HTMLButtonElement).textContent = isExpanded
        ? '1x Scale'
        : '2x Scale';
    });

    this.root.querySelector('#apx-btn-streak')?.addEventListener('click', () => {
      unlock();
      this.deps.challengeSystem.simulate14DayJudgeStreak();
      this.deps.winnerPolishSystem.triggerDroneExcitementPulse();
      this.showToast(
        '14-DAY CAREER STREAK RESTORED • ELO 1,920',
        '8/9 Strategist Gold & Silver medals loaded into persistent career telemetry.',
        'success'
      );
    });

    this.root.querySelector('#apx-btn-invite')?.addEventListener('click', () => {
      unlock();
      const vm = this.deps.challengeSystem.getScoreboardViewModel();
      const url = new URL(window.location.href);
      url.searchParams.set('invite', 'judge');
      url.searchParams.set('stage', String(vm.currentStage.stageIndex + 1));
      url.searchParams.set('brake', vm.dialedBrakeMeters.toFixed(1));
      url.searchParams.set('apex', vm.dialedApexMeters.toFixed(1));
      const inviteHref = url.toString();
      window.history.replaceState({}, '', inviteHref);
      navigator.clipboard?.writeText(inviteHref).catch(() => {});
      this.showToast(
        'JUDGE INVITE URL READY & COPIED',
        inviteHref,
        'success',
        5200
      );
    });

    this.root
      .querySelector('#apx-btn-reset-cam')
      ?.addEventListener('click', () => {
        unlock();
        this.deps.onResetDesktopCamera();
      });

    this.root
      .querySelector('#apx-btn-hide-hud')
      ?.addEventListener('click', () => {
        this.toggleHudVisibility(true);
      });

    // Alert banner CTAs
    this.root
      .querySelector('#apx-alert-fork-btn')
      ?.addEventListener('click', () => {
        unlock();
        this.alertDismissedForFreeze = true;
        this.deps.timeLoopSystem.releaseElasticSlingshot();
        const res = this.deps.challengeSystem.executeCurrentStageFork();
        if (res) {
          this.showToast(
            res.verdictHeadline,
            res.physicsExplanation,
            res.didBreachTractionLimit ? 'danger' : 'success'
          );
        }
      });

    this.root
      .querySelector('#apx-alert-halo-btn')
      ?.addEventListener('click', () => {
        unlock();
        this.alertDismissedForFreeze = true;
        this.deps.haloCockpitSystem.enterFirstPersonHaloCockpit();
      });

    // Timeline transport
    this.elPlayBtn.addEventListener('click', () => {
      unlock();
      const isPlaying =
        this.deps.sessionEntity.getValue(TelemetrySessionState, 'isPlaying') ??
        true;
      if (!isPlaying && this.deps.timeLoopSystem.phase === 'CRASH_FROZEN') {
        this.deps.timeLoopSystem.releaseElasticSlingshot();
      } else {
        this.deps.sessionEntity.setValue(
          TelemetrySessionState,
          'isPlaying',
          !isPlaying
        );
      }
    });

    this.root
      .querySelector('#apx-btn-rewind-t4')
      ?.addEventListener('click', () => {
        unlock();
        this.alertDismissedForFreeze = false;
        this.deps.timeLoopSystem.phase = 'APPROACHING_CRASH';
        this.deps.sessionEntity.setValue(
          TelemetrySessionState,
          'playheadSec',
          19.8
        );
        this.deps.sessionEntity.setValue(
          TelemetrySessionState,
          'playbackRate',
          1.0
        );
        this.deps.sessionEntity.setValue(
          TelemetrySessionState,
          'isPlaying',
          true
        );
      });

    this.elTimelineSlider.addEventListener('pointerdown', () => {
      this.isScrubbingTimeline = true;
    });
    window.addEventListener('pointerup', () => {
      this.isScrubbingTimeline = false;
    });
    this.elTimelineSlider.addEventListener('input', () => {
      unlock();
      const sec = Number(this.elTimelineSlider.value);
      this.deps.scrubSystem.scrubToNormalizedFraction(
        sec / this.deps.telemetryEngine.lapDurationSec
      );
      this.deps.sessionEntity.setValue(
        TelemetrySessionState,
        'isPlaying',
        true
      );
    });

    // Brake & Apex counterfactual sliders
    this.elBrakeSlider.addEventListener('input', () => {
      unlock();
      this.deps.challengeSystem.setBrakeOffsetDial(
        Number(this.elBrakeSlider.value),
        true
      );
      this.deps.aeroDuelSystem.evaluateAeroGameTheoryDuel();
    });

    this.elApexSlider.addEventListener('input', () => {
      unlock();
      this.deps.challengeSystem.setApexShiftDial(
        Number(this.elApexSlider.value),
        true
      );
      this.deps.aeroDuelSystem.evaluateAeroGameTheoryDuel();
    });

    // Primary Macro CTAs
    this.root
      .querySelector('#apx-dock-fork-btn')
      ?.addEventListener('click', () => {
        unlock();
        if (this.deps.timeLoopSystem.phase === 'CRASH_FROZEN') {
          this.deps.timeLoopSystem.releaseElasticSlingshot();
        }
        this.deps.aeroDuelSystem.evaluateAeroGameTheoryDuel();
        const res = this.deps.challengeSystem.executeCurrentStageFork();
        if (res) {
          this.showToast(
            res.verdictHeadline,
            res.physicsExplanation,
            res.didBreachTractionLimit ? 'danger' : 'success'
          );
        }
      });

    this.root
      .querySelector('#apx-dock-halo-btn')
      ?.addEventListener('click', () => {
        unlock();
        this.deps.haloCockpitSystem.enterFirstPersonHaloCockpit();
      });

    // 1:1 Visor controls
    this.root
      .querySelector('#apx-visor-exit-btn')
      ?.addEventListener('click', () => {
        unlock();
        this.deps.haloCockpitSystem.exitToMacroPitWall();
      });
    this.root
      .querySelector('#apx-visor-downshift')
      ?.addEventListener('click', () => {
        unlock();
        this.deps.haloCockpitSystem.triggerPaddleShift('DOWNSHIFT_LEFT');
      });
    this.root
      .querySelector('#apx-visor-upshift')
      ?.addEventListener('click', () => {
        unlock();
        this.deps.haloCockpitSystem.triggerPaddleShift('UPSHIFT_RIGHT');
      });
    this.root
      .querySelector('#apx-visor-steer-l')
      ?.addEventListener('click', () => {
        unlock();
        this.deps.haloCockpitSystem.setAirYokeSteerAngleDeg(
          this.deps.haloCockpitSystem.telemetry.steerAngleDeg - 8
        );
      });
    this.root
      .querySelector('#apx-visor-steer-r')
      ?.addEventListener('click', () => {
        unlock();
        this.deps.haloCockpitSystem.setAirYokeSteerAngleDeg(
          this.deps.haloCockpitSystem.telemetry.steerAngleDeg + 8
        );
      });

    // Tab shortcut to toggle 2D HUD cleanly
    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'Tab') {
        ev.preventDefault();
        this.toggleHudVisibility();
      }
    });

    // Device modal & multi-headset pairing
    this.root.querySelector('#apx-btn-device')?.addEventListener('click', () => {
      unlock();
      this.openDeviceModal();
    });
    this.root.querySelector('#apx-btn-qr')?.addEventListener('click', () => {
      unlock();
      this.openDeviceModal();
    });
    this.root.querySelector('#apx-modal-close')?.addEventListener('click', () => {
      this.closeDeviceModal();
    });
    this.elDeviceModal.addEventListener('click', (e) => {
      if (e.target === this.elDeviceModal) {
        this.closeDeviceModal();
      }
    });

    // Enter VR buttons
    const enterXRHandler = () => {
      unlock();
      this.closeDeviceModal();
      UniversalDeviceManager.getInstance().requestEnterXR().catch((err) => {
        this.showToast('WebXR Launch', String(err.message || err), 'danger');
      });
    };
    this.root.querySelector('#apx-btn-enter-xr')?.addEventListener('click', enterXRHandler);
    this.root.querySelector('#apx-btn-modal-enter-xr')?.addEventListener('click', enterXRHandler);

    // Copy Deep Link from modal
    this.root.querySelector('#apx-btn-copy-deep-link')?.addEventListener('click', () => {
      unlock();
      const vm = this.deps.challengeSystem.getScoreboardViewModel();
      const url = UniversalDeviceManager.getInstance().generateInviteUrl({
        stage: vm.currentStage.stageIndex,
        brake: Number(vm.dialedBrakeMeters.toFixed(1)),
        apex: Number(vm.dialedApexMeters.toFixed(1)),
      });
      navigator.clipboard?.writeText(url).catch(() => {});
      this.showToast('HEADSET INVITE URL COPIED', url, 'success', 5200);
    });

    // Build device selection chips
    this.renderDeviceChips();
    this.refreshModalContent();
  }

  private openDeviceModal(): void {
    this.elDeviceModal.style.display = 'flex';
    this.refreshModalContent();
  }

  private closeDeviceModal(): void {
    this.elDeviceModal.style.display = 'none';
  }

  private renderDeviceChips(): void {
    this.elDeviceChipsContainer.innerHTML = '';
    const currentId = UniversalDeviceManager.getInstance().currentProfile.id;

    for (const profile of Object.values(DEVICE_PROFILES)) {
      const chip = document.createElement('button');
      chip.className = `apx-device-chip ${profile.id === currentId ? 'is-active' : ''}`;
      chip.innerHTML = `
        <span>${profile.shortLabel}</span>
        <span class="apx-chip-sub">${profile.fovHorizontalDeg}°×${profile.fovVerticalDeg}° • ${profile.baselineFrameRate}Hz</span>
      `;
      chip.addEventListener('click', async () => {
        await UniversalDeviceManager.getInstance().setProfile(profile.id as DeviceProfileId);
        this.renderDeviceChips();
        this.refreshModalContent();
        this.showToast(
          'PROFILE ACTIVE: ' + profile.label,
          profile.notes,
          'success',
          4500
        );
      });
      this.elDeviceChipsContainer.appendChild(chip);
    }
  }

  private refreshModalContent(): void {
    const mgr = UniversalDeviceManager.getInstance();
    const p = mgr.currentProfile;
    const puck = mgr.getPuckTelemetry();

    this.elDeviceBtnLabel.textContent = p.shortLabel;
    this.elActiveProfileName.textContent = p.label;
    this.elSpecDisplay.textContent = puck.displayResolution;
    this.elSpecPuck.textContent = `${puck.processor} • ${puck.ram}`;
    this.elSpecRefresh.textContent = `${p.baselineFrameRate}Hz ➔ ${p.boostFrameRate}Hz Dynamic`;
    this.elSpecTemp.textContent = `${puck.thermalPuckTempC}°C (${puck.isDynamic120HzActive ? 'Halo 120Hz Boost' : 'Vapor Chamber Passive'})`;

    const vm = this.deps.challengeSystem.getScoreboardViewModel();
    mgr.generateInviteQrCodeDataUrl({
      stage: vm.currentStage.stageIndex,
      brake: Number(vm.dialedBrakeMeters.toFixed(1)),
      apex: Number(vm.dialedApexMeters.toFixed(1)),
    }).then((dataUrl) => {
      this.elQrImage.src = dataUrl;
    }).catch(console.warn);
  }

  private startSyncLoop(): void {
    const tick = () => {
      this.syncFrame();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private syncFrame(): void {
    // Auto-hide 2D overlay while inside immersive WebXR headset session
    const inXR = Boolean(this.deps.world.renderer?.xr?.isPresenting);
    if (inXR) {
      this.root.classList.add('is-hidden');
      this.restoreBtn.classList.remove('is-visible');
      return;
    }
    if (!this.userHidden) {
      this.root.classList.remove('is-hidden');
    }

    const isHalo =
      this.deps.haloCockpitSystem.mode === 'FIRST_PERSON_HALO_COCKPIT';
    const vm = this.deps.challengeSystem.getScoreboardViewModel();
    const playhead =
      this.deps.sessionEntity.getValue(TelemetrySessionState, 'playheadSec') ??
      0;
    const isPlaying =
      this.deps.sessionEntity.getValue(TelemetrySessionState, 'isPlaying') ??
      true;
    const phase = this.deps.timeLoopSystem.phase;

    if (phase !== 'CRASH_FROZEN') {
      this.alertDismissedForFreeze = false;
    }

    // Header badges
    this.elModeBadge.textContent = isHalo
      ? '1:1 FIA HALO VISOR'
      : 'MACRO PIT-WALL';
    this.elModeBadge.className = `apx-badge ${
      isHalo ? 'apx-badge-emerald' : 'apx-badge-cyan'
    }`;

    this.elLapClock.textContent = `LAP 00:${playhead
      .toFixed(2)
      .padStart(5, '0')} / 01:00.00`;

    if (isHalo) {
      this.elPhaseBadge.textContent = '1:1 OVERTAKE DUEL';
      this.elPhaseBadge.className = 'apx-badge apx-badge-emerald';
    } else if (phase === 'CRASH_FROZEN') {
      this.elPhaseBadge.textContent = 'T4 LOCKUP FROZEN';
      this.elPhaseBadge.className = 'apx-badge apx-badge-crimson';
    } else if (
      phase === 'COUNTERFACTUAL_LAUNCHED' ||
      phase === 'OVERTAKE_SAVED'
    ) {
      this.elPhaseBadge.textContent = 'CLEAN-AIR SLINGSHOT';
      this.elPhaseBadge.className = 'apx-badge apx-badge-cyan';
    } else {
      this.elPhaseBadge.textContent = isPlaying ? 'LIVE REPLAY' : 'PAUSED';
      this.elPhaseBadge.className = 'apx-badge apx-badge-emerald';
    }

    this.elCareerBadge.textContent = `DAY ${vm.streakDays} STREAK • ELO ${vm.strategistElo} (${vm.licenseTier})`;

    // Dynamic Frame Rate & Puck Telemetry (Project Aero PRD integration)
    const puckTel = UniversalDeviceManager.getInstance().getPuckTelemetry();
    this.elFpsBadge.textContent = `${puckTel.targetFps} FPS (${
      puckTel.isDynamic120HzActive ? 'HALO 120Hz BOOST' : 'DYNAMIC 90Hz'
    })`;
    this.elFpsBadge.className = `apx-badge ${
      puckTel.isDynamic120HzActive ? 'apx-badge-cyan' : 'apx-badge-emerald'
    }`;
    this.elPuckBadge.textContent = `PUCK ${puckTel.thermalPuckTempC}°C • XR2 GEN 3`;

    // Stage pills
    for (let i = 0; i < 3; i++) {
      this.stageBtns[i]?.classList.toggle(
        'is-active',
        vm.currentStage.stageIndex === i
      );
      const stars = vm.stageStars[i] ?? 0;
      if (this.stageStarSpans[i]) {
        this.stageStarSpans[i].textContent =
          '★'.repeat(stars) + '☆'.repeat(3 - stars);
      }
    }

    // Alert banner logic
    const now = performance.now();
    if (!isHalo && phase === 'CRASH_FROZEN' && !this.alertDismissedForFreeze) {
      this.elAlertWrap.style.display = 'block';
      this.elAlertBanner.className = 'apx-alert-banner is-danger';
      this.elAlertTitle.textContent =
        'TURN 4 DIRTY-AIR LOCKUP AT 22.8s — CAR A FRONT-LEFT SLIDE!';
      this.elAlertSub.textContent =
        'Pinch Car A in 3D, click Rewind & Fork to launch a clean-air switchback, or step into the 1:1 Halo Cockpit.';
      this.elAlertActions.style.display = 'flex';
    } else if (now < this.transientToastUntilMs) {
      this.elAlertWrap.style.display = 'block';
      this.elAlertBanner.className = `apx-alert-banner ${
        this.transientToastKind === 'danger'
          ? 'is-danger'
          : this.transientToastKind === 'success'
          ? 'is-success'
          : ''
      }`;
      this.elAlertTitle.textContent = this.transientToastTitle;
      this.elAlertSub.textContent = this.transientToastSub;
      this.elAlertActions.style.display = 'none';
    } else {
      this.elAlertWrap.style.display = 'none';
    }

    // Swap Bottom Dock between Macro Pit-Wall and 1:1 Driver Visor
    this.elMacroDock.style.display = isHalo ? 'none' : 'grid';
    this.elVisorDock.classList.toggle('is-active', isHalo);

    if (!isHalo) {
      this.elPlayBtn.textContent = isPlaying ? 'Pause' : 'Play';
      if (!this.isScrubbingTimeline) {
        this.elTimelineSlider.value = playhead.toFixed(2);
      }

      const sampleA = this.deps.telemetryEngine.evaluateCarState(
        0,
        playhead,
        0,
        this.scratchSnapshot
      );
      this.elTelemetrySummary.textContent = `CAR A: ${Math.round(
        sampleA.speedKmh
      )} KM/H • G${sampleA.gear} • ${Math.abs(sampleA.lateralG).toFixed(1)}G`;

      this.elBrakeVal.textContent = `${
        vm.dialedBrakeMeters >= 0 ? '+' : ''
      }${vm.dialedBrakeMeters.toFixed(1)}m`;
      if (document.activeElement !== this.elBrakeSlider) {
        this.elBrakeSlider.value = String(vm.dialedBrakeMeters);
      }

      this.elApexVal.textContent = `${
        vm.dialedApexMeters >= 0 ? '+' : ''
      }${vm.dialedApexMeters.toFixed(1)}m`;
      if (document.activeElement !== this.elApexSlider) {
        this.elApexSlider.value = String(vm.dialedApexMeters);
      }

      this.elGripVal.textContent = `${vm.lastGripPct}%`;
      const gripWidth = Math.min(100, Math.max(8, vm.lastGripPct));
      this.elGripFill.style.width = `${gripWidth}%`;
      this.elGripFill.style.background =
        vm.lastGripPct > 96
          ? 'linear-gradient(90deg, #f59e0b, #f43f5e)'
          : 'linear-gradient(90deg, #10b981, #38bdf8)';
    } else {
      const t = this.deps.haloCockpitSystem.telemetry;
      this.elVisorGear.textContent = String(t.gear);
      this.elVisorSpeed.textContent = String(t.speedKmh);
      this.elVisorRpm.textContent = `${t.rpm.toLocaleString()} RPM`;
      this.elVisorSteer.textContent = `${
        t.steerAngleDeg >= 0 ? '+' : ''
      }${t.steerAngleDeg.toFixed(0)}°`;
      this.elVisorErsVal.innerHTML = `${t.ersPct}% • Yoke <span id="apx-visor-steer">${
        t.steerAngleDeg >= 0 ? '+' : ''
      }${t.steerAngleDeg.toFixed(0)}°</span>`;
      this.elVisorErsFill.style.width = `${t.ersPct}%`;

      if (t.didPassRival) {
        this.elVisorGapVal.textContent = `OVERTAKE SEALED (${Math.abs(
          t.gapToRivalMeters
        ).toFixed(1)}m CLEAR!)`;
        this.elVisorGapVal.style.color = '#34d399';
      } else {
        this.elVisorGapVal.textContent = `+${t.gapToRivalMeters.toFixed(
          1
        )}m TO CAR B`;
        this.elVisorGapVal.style.color = '#f8fafc';
      }

      const pct = Math.min(100, Math.round((t.duelElapsedSec / 7.5) * 100));
      this.elVisorProgressFill.style.width = `${pct}%`;

      const litCount = Math.round(
        Math.max(0, Math.min(1, (t.rpm - 8200) / 4000)) * this.rpmLeds.length
      );
      for (let i = 0; i < this.rpmLeds.length; i++) {
        const led = this.rpmLeds[i];
        if (i < litCount) {
          const c =
            i < 5 ? '#10b981' : i < 10 ? '#f59e0b' : i < 13 ? '#f43f5e' : '#00f0ff';
          led.style.background = c;
          led.style.boxShadow = `0 0 8px ${c}`;
        } else {
          led.style.background = 'rgba(30, 41, 59, 0.8)';
          led.style.boxShadow = 'none';
        }
      }
    }
  }
}
