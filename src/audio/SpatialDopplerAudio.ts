import { Vector3 } from '@iwsdk/core';

export class SpatialDopplerAudio {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private panner: PannerNode | null = null;
  private isUnlocked = false;

  public unlockAndStart(): void {
    if (this.isUnlocked) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.panner = this.ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 0.25;
    this.panner.maxDistance = 2.0;
    this.panner.rolloffFactor = 1.5;

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 110;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.04;

    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.panner);
    this.panner.connect(this.ctx.destination);

    this.engineOsc.start();
    this.isUnlocked = true;
  }

  public updateLeadCarSpatialAudio(
    worldPos: Vector3,
    rpm: number,
    playbackRate: number
  ): void {
    if (!this.isUnlocked || !this.ctx || !this.panner || !this.engineOsc) return;
    const now = this.ctx.currentTime;

    this.panner.positionX.setTargetAtTime(worldPos.x, now, 0.02);
    this.panner.positionY.setTargetAtTime(worldPos.y, now, 0.02);
    this.panner.positionZ.setTargetAtTime(worldPos.z, now, 0.02);

    const pitchHz = (rpm / 60) * 0.85 * Math.max(0.35, playbackRate);
    this.engineOsc.frequency.setTargetAtTime(pitchHz, now, 0.03);
  }

  public playInteractionChime(frequencyHz = 680): void {
    this.unlockAndStart();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequencyHz, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      frequencyHz * 1.35,
      this.ctx.currentTime + 0.075
    );

    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.085);
  }

  public speakRaceEngineerBriefing(text: string): void {
    this.playInteractionChime(880);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.06;
      utterance.pitch = 0.96;
      window.speechSynthesis.speak(utterance);
    }
  }
}