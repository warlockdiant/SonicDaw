import { Mp3Encoder } from 'lamejs';
import MPEGMode from 'lamejs/src/js/MPEGMode.js';
import BitStream from 'lamejs/src/js/BitStream.js';

// lamejs has a bug where MPEGMode and BitStream are not defined in some files when used via CommonJS
if (typeof window !== 'undefined') {
  (window as any).MPEGMode = MPEGMode;
  (window as any).BitStream = BitStream;
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const result = new Float32Array(buffer.length * numChannels);
  
  // Interleave channels
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < buffer.length; i++) {
      result[i * 2] = left[i];
      result[i * 2 + 1] = right[i];
    }
  } else {
    result.set(buffer.getChannelData(0));
  }

  const dataLength = result.length * (bitDepth / 8);
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < result.length; i++) {
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

export function audioBufferToMp3(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const mp3encoder = new Mp3Encoder(numChannels, sampleRate, 128); // 128kbps
  const mp3Data: Int8Array[] = [];

  const left = buffer.getChannelData(0);
  const right = numChannels > 1 ? buffer.getChannelData(1) : left;

  const sampleBlockSize = 1152; // multiple of 576
  const leftChunk = new Int16Array(sampleBlockSize);
  const rightChunk = new Int16Array(sampleBlockSize);

  for (let i = 0; i < buffer.length; i += sampleBlockSize) {
    const end = Math.min(i + sampleBlockSize, buffer.length);
    const length = end - i;

    for (let j = 0; j < length; j++) {
      // Convert Float32 to Int16
      let l = left[i + j] * 0x7FFF;
      let r = right[i + j] * 0x7FFF;
      
      // Clamp
      l = Math.max(-32768, Math.min(32767, l));
      r = Math.max(-32768, Math.min(32767, r));

      leftChunk[j] = l;
      rightChunk[j] = r;
    }

    let mp3buf;
    if (numChannels === 2) {
      mp3buf = mp3encoder.encodeBuffer(leftChunk.subarray(0, length), rightChunk.subarray(0, length));
    } else {
      mp3buf = mp3encoder.encodeBuffer(leftChunk.subarray(0, length));
    }

    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }

  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
}
