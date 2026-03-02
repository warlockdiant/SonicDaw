export type ReverbType = 'room' | 'hall' | 'cathedral';

export function generateIR(ctx: BaseAudioContext, type: ReverbType): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  let duration = 1.0;
  let decay = 2.0;

  if (type === 'room') {
    duration = 0.6;
    decay = 6.0;
  } else if (type === 'hall') {
    duration = 2.5;
    decay = 2.5;
  } else if (type === 'cathedral') {
    duration = 5.0;
    decay = 1.2;
  }

  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = i / length;
    // Generate exponential decay noise
    left[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
    right[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
  }
  
  return impulse;
}
