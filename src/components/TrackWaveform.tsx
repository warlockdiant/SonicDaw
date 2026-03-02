import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface TrackWaveformProps {
  buffer: AudioBuffer;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  fadeIn: number;
  fadeOut: number;
  currentTime: number;
  duration: number;
  color: string;
}

export const TrackWaveform: React.FC<TrackWaveformProps> = ({ 
  buffer, startTime, trimStart, trimEnd, fadeIn, fadeOut, currentTime, duration, color 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: color,
      progressColor: 'rgba(255, 255, 255, 0.5)',
      cursorColor: 'transparent',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 64,
      normalize: false,
      interact: false,
    });
    
    const channelData = buffer.getChannelData(0);
    const step = Math.ceil(channelData.length / 8000);
    const peaks = [];
    for (let i = 0; i < 8000; i++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const val = Math.abs(channelData[i * step + j] || 0);
        if (val > max) max = val;
      }
      peaks.push(max);
    }

    ws.load('', [peaks], buffer.duration);
    wsRef.current = ws;

    return () => {
      ws.destroy();
    };
  }, [buffer, color]);

  useEffect(() => {
    if (wsRef.current && buffer.duration > 0) {
      const trackTime = currentTime - startTime;
      const bufferTime = trimStart + trackTime;
      
      if (trackTime >= 0 && bufferTime <= trimEnd) {
        wsRef.current.seekTo(bufferTime / buffer.duration);
      } else if (trackTime < 0) {
        wsRef.current.seekTo(trimStart / buffer.duration);
      } else {
        wsRef.current.seekTo(trimEnd / buffer.duration);
      }
    }
  }, [currentTime, startTime, trimStart, trimEnd, buffer.duration]);

  const trackDuration = trimEnd - trimStart;
  const leftPercent = duration > 0 ? (startTime / duration) * 100 : 0;
  const widthPercent = duration > 0 ? (trackDuration / duration) * 100 : 100;

  const innerLeftPercent = -(trimStart / trackDuration) * 100;
  const innerWidthPercent = (buffer.duration / trackDuration) * 100;

  return (
    <div 
      className="absolute top-0 bottom-0 overflow-hidden border-x border-[#ffffff20]"
      style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
    >
      <div 
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{ left: `${innerLeftPercent}%`, width: `${innerWidthPercent}%` }}
      >
        <div ref={containerRef} className="w-full h-full" />
      </div>
      
      {/* Fade Overlays */}
      {fadeIn > 0 && (
        <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-[#0d0e12] to-transparent z-10" style={{ width: `${(fadeIn / trackDuration) * 100}%` }} />
      )}
      {fadeOut > 0 && (
        <div className="absolute top-0 bottom-0 right-0 bg-gradient-to-l from-[#0d0e12] to-transparent z-10" style={{ width: `${(fadeOut / trackDuration) * 100}%` }} />
      )}
    </div>
  );
};
