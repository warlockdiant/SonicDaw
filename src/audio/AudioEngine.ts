import { ReverbType, generateIR } from '../utils/impulseResponse';
import { TrackEffects, PRESETS } from '../utils/presets';
import { audioBufferToWav, audioBufferToMp3 } from '../utils/audioExport';

const gateWorkletCode = `
class GateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: 0.0, minValue: 0, maxValue: 1 },
      { name: 'attackTime', defaultValue: 0.01, minValue: 0.001, maxValue: 1 },
      { name: 'releaseTime', defaultValue: 0.1, minValue: 0.001, maxValue: 2 }
    ];
  }
  constructor() { super(); this.envelope = 0; }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length) return true;
    
    const threshold = parameters.threshold[0];
    const attackTime = parameters.attackTime[0];
    const releaseTime = parameters.releaseTime[0];
    
    const sampleRate = 44100;
    const attackCoef = 1.0 - Math.exp(-1.0 / (attackTime * sampleRate));
    const releaseCoef = 1.0 - Math.exp(-1.0 / (releaseTime * sampleRate));
    
    for (let channel = 0; channel < input.length; ++channel) {
      const inCh = input[channel];
      const outCh = output[channel];
      for (let i = 0; i < inCh.length; ++i) {
        const abs = Math.abs(inCh[i]);
        if (abs > threshold) {
          this.envelope += attackCoef * (1.0 - this.envelope);
        } else {
          this.envelope += releaseCoef * (0.0 - this.envelope);
        }
        outCh[i] = inCh[i] * this.envelope;
      }
    }
    return true;
  }
}
registerProcessor('gate-processor', GateProcessor);
`;

export interface TrackData {
  id: string;
  name: string;
  buffer: AudioBuffer;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  fadeIn: number;
  fadeOut: number;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  effects: TrackEffects;
}

interface TrackNodes {
  source: AudioBufferSourceNode;
  fadeNode: GainNode;
  eqLow?: BiquadFilterNode;
  eqMid?: BiquadFilterNode;
  eqHigh?: BiquadFilterNode;
  compressor?: DynamicsCompressorNode;
  delayTime?: DelayNode;
  delayFeedback?: GainNode;
  delayMix?: GainNode;
  reverbMix?: GainNode;
  gainRider?: DynamicsCompressorNode;
  deNoise?: AudioWorkletNode;
  deBreath?: AudioWorkletNode;
  panner?: StereoPannerNode;
  trackGain: GainNode;
  allNodes: AudioNode[];
}

export class AudioEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  limiter: DynamicsCompressorNode;
  
  tracks: Map<string, TrackData> = new Map();
  
  private activeTrackNodes: Map<string, TrackNodes> = new Map();
  
  isPlaying = false;
  startTime = 0;
  pauseTime = 0;
  
  masterVolume = 1;
  
  private workletLoaded = false;
  
  onTimeUpdate?: (time: number) => void;
  onStateChange?: () => void;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.limiter = this.ctx.createDynamicsCompressor();
    
    this.limiter.threshold.value = -0.5;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;
    this.limiter.knee.value = 0;

    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
    
    this.initWorklet();
    
    const loop = () => {
      if (this.isPlaying && this.onTimeUpdate) {
        this.onTimeUpdate(this.getCurrentTime());
      }
      requestAnimationFrame(loop);
    };
    loop();
  }

  async initWorklet() {
    try {
      const blob = new Blob([gateWorkletCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      await this.ctx.audioWorklet.addModule(url);
      this.workletLoaded = true;
    } catch (e) {
      console.error("Failed to load gate worklet", e);
    }
  }

  getCurrentTime() {
    if (this.isPlaying) {
      return this.pauseTime + (this.ctx.currentTime - this.startTime);
    }
    return this.pauseTime;
  }

  getDuration() {
    let max = 0;
    for (const track of this.tracks.values()) {
      const end = track.startTime + (track.trimEnd - track.trimStart);
      if (end > max) max = end;
    }
    return max;
  }

  async loadTrack(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    
    const id = Math.random().toString(36).substring(7);
    const track: TrackData = {
      id,
      name: file.name,
      buffer: audioBuffer,
      startTime: 0,
      trimStart: 0,
      trimEnd: audioBuffer.duration,
      fadeIn: 0,
      fadeOut: 0,
      color: '#00f0ff',
      volume: 1,
      pan: 0,
      muted: false,
      solo: false,
      effects: JSON.parse(JSON.stringify(PRESETS.default))
    };
    
    this.tracks.set(id, track);
    this.notify();
    return id;
  }

  removeTrack(id: string) {
    this.tracks.delete(id);
    if (this.isPlaying) {
      this.pause();
      this.play();
    } else {
      this.notify();
    }
  }

  normalizeTrack(id: string) {
    const track = this.tracks.get(id);
    if (!track) return;

    let peak = 0;
    const buffer = track.buffer;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }

    if (peak > 0 && peak !== 1.0) {
      const gainRequired = 1.0 / peak;
      const newBuffer = this.ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        const newData = newBuffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          newData[i] = data[i] * gainRequired;
        }
      }
      
      this.updateTrack(id, { buffer: newBuffer });
    }
  }

  splitTrack(id: string, atTime: number) {
    const track = this.tracks.get(id);
    if (!track) return;

    const trackTime = atTime - track.startTime;
    const bufferTime = track.trimStart + trackTime;
    
    if (bufferTime <= track.trimStart || bufferTime >= track.trimEnd) return;

    const newId = Math.random().toString(36).substring(7);
    const newTrack: TrackData = {
      ...track,
      id: newId,
      name: `${track.name} (Part 2)`,
      startTime: atTime,
      trimStart: bufferTime,
      effects: JSON.parse(JSON.stringify(track.effects))
    };

    track.trimEnd = bufferTime;

    this.tracks.set(newId, newTrack);

    if (this.isPlaying) {
      this.pause();
      this.play();
    } else {
      this.notify();
    }
  }

  updateTrack(id: string, updates: Partial<TrackData>) {
    const track = this.tracks.get(id);
    if (!track) return;
    
    const oldTrack = { ...track, effects: JSON.parse(JSON.stringify(track.effects)) };
    Object.assign(track, updates);
    
    if (this.isPlaying) {
      // Check if we need to rebuild the graph (timing or routing changes)
      const needsRebuild = 
        updates.buffer !== undefined ||
        updates.startTime !== undefined ||
        updates.trimStart !== undefined ||
        updates.trimEnd !== undefined ||
        updates.fadeIn !== undefined ||
        updates.fadeOut !== undefined ||
        updates.muted !== undefined ||
        updates.solo !== undefined ||
        (updates.effects && (
          updates.effects.eq.enabled !== oldTrack.effects.eq.enabled ||
          updates.effects.compressor.enabled !== oldTrack.effects.compressor.enabled ||
          updates.effects.delay.enabled !== oldTrack.effects.delay.enabled ||
          updates.effects.reverb.enabled !== oldTrack.effects.reverb.enabled ||
          updates.effects.reverb.type !== oldTrack.effects.reverb.type ||
          updates.effects.gainRider.enabled !== oldTrack.effects.gainRider.enabled ||
          updates.effects.gainRider.target !== oldTrack.effects.gainRider.target
        ));

      if (needsRebuild) {
        this.pause();
        this.play();
      } else {
        // Real-time parameter update
        const nodes = this.activeTrackNodes.get(id);
        if (nodes) {
          if (updates.volume !== undefined) nodes.trackGain.gain.value = updates.volume;
          if (updates.pan !== undefined && nodes.panner) nodes.panner.pan.value = updates.pan;
          
          if (updates.effects) {
            if (nodes.eqLow) nodes.eqLow.gain.value = updates.effects.eq.low;
            if (nodes.eqMid) nodes.eqMid.gain.value = updates.effects.eq.mid;
            if (nodes.eqHigh) nodes.eqHigh.gain.value = updates.effects.eq.high;
            
            if (nodes.compressor) {
              nodes.compressor.threshold.value = updates.effects.compressor.threshold;
              nodes.compressor.ratio.value = updates.effects.compressor.ratio;
            }
            
            if (nodes.delayTime) nodes.delayTime.delayTime.value = updates.effects.delay.time;
            if (nodes.delayFeedback) nodes.delayFeedback.gain.value = updates.effects.delay.feedback;
            if (nodes.delayMix) nodes.delayMix.gain.value = updates.effects.delay.mix;
            
            if (nodes.reverbMix) nodes.reverbMix.gain.value = updates.effects.reverb.mix;
          }
        }
        this.notify();
      }
    } else {
      this.notify();
    }
  }

  setMasterVolume(vol: number) {
    this.masterVolume = vol;
    this.masterGain.gain.value = vol;
    this.notify();
  }

  private stopNodes() {
    for (const nodes of this.activeTrackNodes.values()) {
      try { nodes.source.stop(); } catch(e) {}
      try { nodes.source.disconnect(); } catch(e) {}
      for (const node of nodes.allNodes) {
        try { node.disconnect(); } catch(e) {}
      }
    }
    this.activeTrackNodes.clear();
  }

  play() {
    if (this.isPlaying) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    
    this.stopNodes();
    
    this.startTime = this.ctx.currentTime;
    this.isPlaying = true;
    
    const anySolo = Array.from(this.tracks.values()).some(t => t.solo);

    for (const track of this.tracks.values()) {
      if (track.muted) continue;
      if (anySolo && !track.solo) continue;
      
      this.buildAndStartTrackGraph(this.ctx, this.masterGain, track, this.pauseTime);
    }
    
    if (this.activeTrackNodes.size === 0) {
      this.stop();
    } else {
      this.notify();
    }
  }

  pause() {
    if (!this.isPlaying) return;
    this.pauseTime += (this.ctx.currentTime - this.startTime);
    this.isPlaying = false;
    this.stopNodes();
    this.notify();
  }

  stop() {
    this.isPlaying = false;
    this.pauseTime = 0;
    this.stopNodes();
    if (this.onTimeUpdate) this.onTimeUpdate(0);
    this.notify();
  }

  seek(time: number) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.pauseTime = Math.max(0, Math.min(time, this.getDuration()));
    if (this.onTimeUpdate) this.onTimeUpdate(this.pauseTime);
    if (wasPlaying) this.play();
  }

  private buildAndStartTrackGraph(ctx: BaseAudioContext, destination: AudioNode, track: TrackData, currentTimelineTime: number, isOffline: boolean = false) {
    let playWhen = 0;
    let bufferOffset = track.trimStart;
    let durationToPlay = track.trimEnd - track.trimStart;

    if (currentTimelineTime < track.startTime) {
      playWhen = track.startTime - currentTimelineTime;
    } else {
      playWhen = 0;
      const timePassedInTrack = currentTimelineTime - track.startTime;
      bufferOffset += timePassedInTrack;
      durationToPlay -= timePassedInTrack;
    }

    if (durationToPlay <= 0) {
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    
    let currentNode: AudioNode = source;
    const allNodes: AudioNode[] = [];
    const trackNodes: Partial<TrackNodes> = { source, allNodes };

    // Fades
    const fadeNode = ctx.createGain();
    trackNodes.fadeNode = fadeNode;
    const startCtxTime = ctx.currentTime + playWhen;
    
    fadeNode.gain.value = 1;
    
    if (track.fadeIn > 0 || track.fadeOut > 0) {
      fadeNode.gain.setValueAtTime(1, startCtxTime);
      
      const timeInTrack = Math.max(0, currentTimelineTime - track.startTime);
      const trackDuration = track.trimEnd - track.trimStart;
      
      if (track.fadeIn > 0 && timeInTrack < track.fadeIn) {
        const fadeProgress = timeInTrack / track.fadeIn;
        fadeNode.gain.setValueAtTime(fadeProgress, startCtxTime);
        fadeNode.gain.linearRampToValueAtTime(1, startCtxTime + (track.fadeIn - timeInTrack));
      }
      
      if (track.fadeOut > 0) {
        const fadeOutStart = trackDuration - track.fadeOut;
        if (timeInTrack < trackDuration) {
          const timeUntilFadeOut = fadeOutStart - timeInTrack;
          if (timeUntilFadeOut > 0) {
            fadeNode.gain.setValueAtTime(1, startCtxTime + timeUntilFadeOut);
            fadeNode.gain.linearRampToValueAtTime(0, startCtxTime + timeUntilFadeOut + track.fadeOut);
          } else {
            const fadeProgress = -timeUntilFadeOut / track.fadeOut;
            fadeNode.gain.setValueAtTime(1 - fadeProgress, startCtxTime);
            fadeNode.gain.linearRampToValueAtTime(0, startCtxTime + track.fadeOut - (-timeUntilFadeOut));
          }
        }
      }
    }
    
    currentNode.connect(fadeNode);
    currentNode = fadeNode;
    allNodes.push(fadeNode);

    // De-Noise
    if (track.effects.deNoise && track.effects.deNoise.enabled && this.workletLoaded) {
      const deNoise = new AudioWorkletNode(ctx, 'gate-processor');
      // amount 0-100 -> threshold 0 to 0.01 (-40dB)
      const threshold = (track.effects.deNoise.amount / 100) * 0.01;
      deNoise.parameters.get('threshold')!.value = threshold;
      deNoise.parameters.get('attackTime')!.value = 0.01; // 10ms
      deNoise.parameters.get('releaseTime')!.value = 0.2; // 200ms
      
      trackNodes.deNoise = deNoise;
      currentNode.connect(deNoise);
      currentNode = deNoise;
      allNodes.push(deNoise);
    }

    // De-Breath
    if (track.effects.deBreath && track.effects.deBreath.enabled && this.workletLoaded) {
      const deBreath = new AudioWorkletNode(ctx, 'gate-processor');
      // amount 0-100 -> threshold 0 to 0.05 (-26dB)
      const threshold = (track.effects.deBreath.amount / 100) * 0.05;
      deBreath.parameters.get('threshold')!.value = threshold;
      deBreath.parameters.get('attackTime')!.value = 0.005; // 5ms
      deBreath.parameters.get('releaseTime')!.value = 0.1; // 100ms
      
      trackNodes.deBreath = deBreath;
      currentNode.connect(deBreath);
      currentNode = deBreath;
      allNodes.push(deBreath);
    }

    // EQ
    if (track.effects.eq.enabled) {
      const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 320; low.gain.value = track.effects.eq.low;
      const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.5; mid.gain.value = track.effects.eq.mid;
      const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 3200; high.gain.value = track.effects.eq.high;
      
      trackNodes.eqLow = low;
      trackNodes.eqMid = mid;
      trackNodes.eqHigh = high;

      currentNode.connect(low); low.connect(mid); mid.connect(high);
      currentNode = high;
      allNodes.push(low, mid, high);
    }

    // Compressor
    if (track.effects.compressor.enabled) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = track.effects.compressor.threshold;
      comp.ratio.value = track.effects.compressor.ratio;
      trackNodes.compressor = comp;
      currentNode.connect(comp);
      currentNode = comp;
      allNodes.push(comp);
    }

    // Delay & Reverb (Parallel to Dry)
    const dryGain = ctx.createGain();
    currentNode.connect(dryGain);
    
    const wetMix = ctx.createGain();
    
    if (track.effects.delay.enabled && track.effects.delay.mix > 0) {
      const delay = ctx.createDelay(5.0); delay.delayTime.value = track.effects.delay.time;
      const feedback = ctx.createGain(); feedback.gain.value = track.effects.delay.feedback;
      const delayGain = ctx.createGain(); delayGain.gain.value = track.effects.delay.mix;
      
      trackNodes.delayTime = delay;
      trackNodes.delayFeedback = feedback;
      trackNodes.delayMix = delayGain;

      currentNode.connect(delay);
      delay.connect(feedback); feedback.connect(delay);
      delay.connect(delayGain); delayGain.connect(wetMix);
      allNodes.push(delay, feedback, delayGain);
    }

    if (track.effects.reverb.enabled && track.effects.reverb.mix > 0) {
      const convolver = ctx.createConvolver();
      convolver.buffer = generateIR(ctx, track.effects.reverb.type);
      const reverbGain = ctx.createGain(); reverbGain.gain.value = track.effects.reverb.mix;
      
      trackNodes.reverbMix = reverbGain;

      currentNode.connect(convolver);
      convolver.connect(reverbGain); reverbGain.connect(wetMix);
      allNodes.push(convolver, reverbGain);
    }

    // Combine Dry and Wet
    const combinedGain = ctx.createGain();
    dryGain.connect(combinedGain);
    wetMix.connect(combinedGain);
    allNodes.push(dryGain, wetMix, combinedGain);
    currentNode = combinedGain;

    // Gain Rider
    if (track.effects.gainRider && track.effects.gainRider.enabled) {
      const gainRider = ctx.createDynamicsCompressor();
      const target = track.effects.gainRider.target; // e.g. -14 dB
      
      // Leveler settings
      const threshold = -36;
      const ratio = 4;
      gainRider.threshold.value = threshold;
      gainRider.ratio.value = ratio;
      gainRider.attack.value = 0.01;
      gainRider.release.value = 0.5;
      gainRider.knee.value = 12;
      
      // Calculate makeup gain to reach the target
      // A 0dB signal gets compressed to: threshold + (0 - threshold) / ratio
      const compressedMax = threshold + (0 - threshold) / ratio;
      const makeupDb = target - compressedMax;
      
      const makeupGain = ctx.createGain();
      makeupGain.gain.value = Math.pow(10, makeupDb / 20);

      // Limiter to catch peaks from the makeup gain
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1.0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      limiter.knee.value = 0;

      trackNodes.gainRider = gainRider;
      currentNode.connect(gainRider);
      gainRider.connect(makeupGain);
      makeupGain.connect(limiter);
      currentNode = limiter;
      allNodes.push(gainRider, makeupGain, limiter);
    }

    // Panner
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = track.pan;
      trackNodes.panner = panner;
      currentNode.connect(panner);
      currentNode = panner;
      allNodes.push(panner);
    }

    // Track Volume
    const trackGain = ctx.createGain();
    trackGain.gain.value = track.volume;
    trackNodes.trackGain = trackGain;
    currentNode.connect(trackGain);
    trackGain.connect(destination);
    allNodes.push(trackGain);

    source.start(startCtxTime, bufferOffset, durationToPlay);
    
    if (!isOffline) {
      this.activeTrackNodes.set(track.id, trackNodes as TrackNodes);
      
      source.onended = () => {
        const currentNodes = this.activeTrackNodes.get(track.id);
        if (currentNodes && currentNodes.source === source) {
          this.activeTrackNodes.delete(track.id);
          if (this.activeTrackNodes.size === 0 && this.isPlaying) {
            this.stop();
          }
        }
      };
    }
  }

  async exportAudio(isRadioExport: boolean = false, format: 'wav' | 'mp3' = 'wav', mode: 'mixdown' | 'separate' = 'mixdown'): Promise<{ name: string, blob: Blob } | { name: string, blob: Blob }[] | null> {
    const duration = this.getDuration();
    if (duration === 0) return null;

    const anySolo = Array.from(this.tracks.values()).some(t => t.solo);
    const tracksToExport = Array.from(this.tracks.values()).filter(t => !t.muted && (!anySolo || t.solo));
    
    if (tracksToExport.length === 0) return null;

    const renderTrack = async (track: TrackData | null): Promise<{ name: string, blob: Blob }> => {
      const offlineCtx = new OfflineAudioContext(2, 44100 * duration, 44100);
      
      if (this.workletLoaded) {
        try {
          const blob = new Blob([gateWorkletCode], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          await offlineCtx.audioWorklet.addModule(url);
        } catch (e) {
          console.error("Failed to load gate worklet in offline context", e);
        }
      }
      
      const offlineMaster = offlineCtx.createGain();
      offlineMaster.gain.value = this.masterVolume * (isRadioExport ? 0.89 : 1.0);
      
      const offlineLimiter = offlineCtx.createDynamicsCompressor();
      offlineLimiter.threshold.value = -0.5;
      offlineLimiter.ratio.value = 20;
      offlineLimiter.attack.value = 0.001;
      offlineLimiter.release.value = 0.1;
      offlineLimiter.knee.value = 0;

      offlineMaster.connect(offlineLimiter);
      offlineLimiter.connect(offlineCtx.destination);

      if (track === null) {
        // Mixdown: render all tracks
        for (const t of tracksToExport) {
          this.buildAndStartTrackGraph(offlineCtx, offlineMaster, t, 0, true);
        }
      } else {
        // Separate: render single track
        this.buildAndStartTrackGraph(offlineCtx, offlineMaster, track, 0, true);
      }

      const renderedBuffer = await offlineCtx.startRendering();
      const blob = format === 'mp3' ? audioBufferToMp3(renderedBuffer) : audioBufferToWav(renderedBuffer);
      const name = track === null ? `SonicWeb_Mixdown.${format}` : `${track.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${format}`;
      
      return { name, blob };
    };

    if (mode === 'mixdown') {
      return await renderTrack(null);
    } else {
      const results = [];
      for (const track of tracksToExport) {
        results.push(await renderTrack(track));
      }
      return results;
    }
  }

  private notify() {
    if (this.onStateChange) this.onStateChange();
  }
}
