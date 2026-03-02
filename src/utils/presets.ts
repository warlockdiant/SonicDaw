import { ReverbType } from './impulseResponse';

export interface TrackEffects {
  eq: { enabled: boolean; low: number; mid: number; high: number; };
  compressor: { enabled: boolean; threshold: number; ratio: number; };
  delay: { enabled: boolean; time: number; feedback: number; mix: number; };
  reverb: { enabled: boolean; mix: number; type: ReverbType; };
  gainRider: { enabled: boolean; target: number; };
  deNoise?: { enabled: boolean; amount: number; };
  deBreath?: { enabled: boolean; amount: number; };
}

export const PRESETS: Record<string, TrackEffects> = {
  default: {
    eq: { enabled: false, low: 0, mid: 0, high: 0 },
    compressor: { enabled: false, threshold: -24, ratio: 4 },
    delay: { enabled: false, time: 0.3, feedback: 0.3, mix: 0 },
    reverb: { enabled: false, mix: 0, type: 'room' },
    gainRider: { enabled: false, target: -14 },
    deNoise: { enabled: false, amount: 50 },
    deBreath: { enabled: false, amount: 50 },
  },
  voz: {
    eq: { enabled: true, low: -2, mid: 3, high: 5 },
    compressor: { enabled: true, threshold: -18, ratio: 4 },
    delay: { enabled: false, time: 0.2, feedback: 0.2, mix: 0 },
    reverb: { enabled: true, mix: 0.15, type: 'room' },
    gainRider: { enabled: false, target: -14 },
    deNoise: { enabled: true, amount: 40 },
    deBreath: { enabled: true, amount: 30 },
  },
  instrumental: {
    eq: { enabled: true, low: 3, mid: -2, high: 2 },
    compressor: { enabled: true, threshold: -24, ratio: 2.5 },
    delay: { enabled: false, time: 0.3, feedback: 0.3, mix: 0 },
    reverb: { enabled: true, mix: 0.25, type: 'hall' },
    gainRider: { enabled: false, target: -14 },
    deNoise: { enabled: false, amount: 50 },
    deBreath: { enabled: false, amount: 50 },
  },
  orquestal: {
    eq: { enabled: true, low: 2, mid: 0, high: 2 },
    compressor: { enabled: true, threshold: -30, ratio: 1.5 },
    delay: { enabled: false, time: 0.4, feedback: 0.2, mix: 0 },
    reverb: { enabled: true, mix: 0.45, type: 'cathedral' },
    gainRider: { enabled: false, target: -14 },
    deNoise: { enabled: false, amount: 50 },
    deBreath: { enabled: false, amount: 50 },
  },
  radio_host: {
    eq: { enabled: true, low: 4, mid: 1, high: 3 },
    compressor: { enabled: true, threshold: -14, ratio: 6 },
    delay: { enabled: false, time: 0.1, feedback: 0.1, mix: 0 },
    reverb: { enabled: false, mix: 0, type: 'room' },
    gainRider: { enabled: true, target: -14 },
    deNoise: { enabled: true, amount: 60 },
    deBreath: { enabled: true, amount: 40 },
  },
  guitarra: {
    eq: { enabled: true, low: -3, mid: 4, high: 2 },
    compressor: { enabled: true, threshold: -20, ratio: 3 },
    delay: { enabled: true, time: 0.3, feedback: 0.2, mix: 0.1 },
    reverb: { enabled: true, mix: 0.2, type: 'room' },
    gainRider: { enabled: false, target: -14 },
    deNoise: { enabled: false, amount: 50 },
    deBreath: { enabled: false, amount: 50 },
  },
  fix_ai: {
    eq: { enabled: true, low: 2, mid: -2, high: 3 },
    compressor: { enabled: true, threshold: -24, ratio: 3 },
    delay: { enabled: false, time: 0.3, feedback: 0.3, mix: 0 },
    reverb: { enabled: true, mix: 0.05, type: 'room' },
    gainRider: { enabled: true, target: -14 },
    deNoise: { enabled: true, amount: 50 },
    deBreath: { enabled: true, amount: 50 },
  },
  locucion_pro: {
    eq: { enabled: true, low: 4, mid: -1, high: 5 },
    compressor: { enabled: true, threshold: -20, ratio: 4 },
    delay: { enabled: false, time: 0.1, feedback: 0.1, mix: 0 },
    reverb: { enabled: true, mix: 0.08, type: 'room' },
    gainRider: { enabled: true, target: -14 },
    deNoise: { enabled: true, amount: 45 },
    deBreath: { enabled: true, amount: 35 },
  },
  podcast_clear: {
    eq: { enabled: true, low: 2, mid: 2, high: 4 },
    compressor: { enabled: true, threshold: -18, ratio: 3.5 },
    delay: { enabled: false, time: 0.1, feedback: 0.1, mix: 0 },
    reverb: { enabled: false, mix: 0, type: 'room' },
    gainRider: { enabled: true, target: -16 },
    deNoise: { enabled: true, amount: 50 },
    deBreath: { enabled: true, amount: 40 },
  }
};
