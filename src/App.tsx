import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Square, Upload, Sliders, Activity, Mic2, Settings2, Download, Plus, Volume2, Trash2, Power, Scissors } from 'lucide-react';
import { AudioEngine, TrackData } from './audio/AudioEngine';
import { PRESETS, TrackEffects } from './utils/presets';
import { ReverbType } from './utils/impulseResponse';
import { TrackWaveform } from './components/TrackWaveform';

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [masterVolume, setMasterVolume] = useState(1);

  useEffect(() => {
    const engine = new AudioEngine();
    engineRef.current = engine;

    engine.onStateChange = () => {
      setTracks(Array.from(engine.tracks.values()));
      setIsPlaying(engine.isPlaying);
      setDuration(engine.getDuration());
    };

    engine.onTimeUpdate = (time) => {
      setCurrentTime(time);
    };

    return () => {
      engine.stop();
    };
  }, []);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && engineRef.current) {
      const id = await engineRef.current.loadTrack(file);
      setSelectedTrackId(id);
    }
  };

  const [isRadioExport, setIsRadioExport] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav');
  const [exportMode, setExportMode] = useState<'mixdown' | 'separate'>('mixdown');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!engineRef.current || tracks.length === 0) return;
    
    setIsExporting(true);
    try {
      const result = await engineRef.current.exportAudio(isRadioExport, exportFormat, exportMode);
      
      if (result) {
        if (Array.isArray(result)) {
          // It's an array of files (separate tracks)
          // We will use JSZip to zip them
          const JSZip = (await import('jszip')).default;
          const zip = new JSZip();
          result.forEach(file => {
            zip.file(file.name, file.blob);
          });
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `SonicWeb_Stems.zip`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          // It's a single file (mixdown)
          const url = URL.createObjectURL(result.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = result.name;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
      setShowExportModal(false);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Check console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  const updateTrack = (id: string, updates: Partial<TrackData>) => {
    if (engineRef.current) {
      engineRef.current.updateTrack(id, updates);
    }
  };

  const updateTrackEffect = (id: string, category: keyof TrackEffects, param: string, value: any) => {
    const track = tracks.find(t => t.id === id);
    if (!track) return;

    const newEffects = JSON.parse(JSON.stringify(track.effects));
    newEffects[category][param] = value;
    updateTrack(id, { effects: newEffects });
  };

  const applyPreset = (id: string, presetName: string) => {
    if (PRESETS[presetName]) {
      updateTrack(id, { effects: JSON.parse(JSON.stringify(PRESETS[presetName])) });
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !engineRef.current || duration === 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    engineRef.current.seek(percentage * duration);
  };

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  return (
    <div className="flex flex-col h-screen w-full bg-[#0d0e12] text-[#e2e8f0] font-sans overflow-hidden">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#16181d] border-b border-[#2a2d36] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#0080ff] flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.3)]">
            <Activity className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white">SonicWeb <span className="text-[#00f0ff] font-mono text-sm ml-1">DAW</span></h1>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="audio/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e2128] hover:bg-[#2a2d36] border border-[#2a2d36] rounded-md text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Track
          </button>
          <div className="flex items-center gap-2 ml-4">
            <input
              type="checkbox"
              id="radioExport"
              checked={isRadioExport}
              onChange={(e) => setIsRadioExport(e.target.checked)}
              className="w-4 h-4 rounded border-[#2a2d36] bg-[#1e2128] text-[#00f0ff] focus:ring-[#00f0ff] focus:ring-offset-[#16181d]"
            />
            <label htmlFor="radioExport" className="text-sm text-[#94a3b8] cursor-pointer">
              Radio Export (-14 LUFS approx)
            </label>
          </div>
          <button 
            onClick={() => setShowExportModal(true)}
            disabled={tracks.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-[#00f0ff] hover:bg-[#33f3ff] text-black rounded-md text-sm font-semibold transition-colors shadow-[0_0_10px_rgba(0,240,255,0.2)] disabled:opacity-50 disabled:shadow-none"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0">
        {/* Track Area */}
        <div className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-[#64748b] uppercase tracking-wider flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              Arrangement
            </h2>
          </div>
          
          <div className="w-full bg-[#16181d] border border-[#2a2d36] rounded-xl p-4 shadow-lg relative min-h-[200px] flex flex-col gap-2">
            {tracks.length === 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#16181d]/80 backdrop-blur-sm rounded-xl border border-dashed border-[#2a2d36]">
                <Activity className="w-12 h-12 text-[#64748b] mb-4 opacity-50" />
                <p className="text-[#64748b] font-medium">Add an audio track to begin</p>
              </div>
            )}
            
            {/* Timeline Ruler */}
            <div 
              ref={timelineRef}
              className="h-6 border-b border-[#2a2d36] mb-2 flex items-end pb-1 overflow-hidden opacity-50 relative cursor-pointer hover:opacity-100 transition-opacity"
              onClick={handleTimelineClick}
            >
              {Array.from({ length: Math.max(20, Math.ceil(duration / 10)) }).map((_, i) => (
                <div key={i} className="flex-1 border-l border-[#2a2d36] h-2 relative min-w-[50px] pointer-events-none">
                  <span className="absolute -top-4 -left-2 text-[10px] font-mono text-[#64748b]">{i * 10}s</span>
                </div>
              ))}
              {/* Playhead */}
              <div 
                className="absolute top-0 bottom-0 w-[1px] bg-[#ff00ff] z-20 pointer-events-none"
                style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              >
                <div className="w-2 h-2 bg-[#ff00ff] rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_10px_#ff00ff]"></div>
              </div>
            </div>

            {/* Tracks List */}
            {tracks.map((track, index) => (
              <div 
                key={track.id} 
                className={`flex h-24 bg-[#1e2128] border rounded-lg overflow-hidden transition-colors ${selectedTrackId === track.id ? 'border-[#00f0ff]' : 'border-[#2a2d36]'}`}
                onClick={() => setSelectedTrackId(track.id)}
              >
                {/* Track Header */}
                <div className="w-48 bg-[#16181d] border-r border-[#2a2d36] p-2 flex flex-col justify-between shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white truncate w-24">{track.name}</span>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); engineRef.current?.splitTrack(track.id, currentTime); }}
                        className="text-[#64748b] hover:text-[#00f0ff] p-1"
                        title="Split at Playhead"
                      >
                        <Scissors className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); engineRef.current?.removeTrack(track.id); }}
                        className="text-[#64748b] hover:text-red-500 p-1"
                        title="Delete Track"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }}
                      className={`w-6 h-6 rounded text-[10px] font-bold ${track.muted ? 'bg-red-500/20 text-red-500 border border-red-500/50' : 'bg-[#2a2d36] text-[#64748b]'}`}
                    >
                      M
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }}
                      className={`w-6 h-6 rounded text-[10px] font-bold ${track.solo ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50' : 'bg-[#2a2d36] text-[#64748b]'}`}
                    >
                      S
                    </button>
                    
                    <div className="flex-1 flex items-center gap-1">
                      <Volume2 className="w-3 h-3 text-[#64748b]" />
                      <input 
                        type="range" min="0" max="2" step="0.01" 
                        value={track.volume}
                        onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
                        className="w-full h-1"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Track Waveform Area */}
                <div className="flex-1 relative bg-[#0d0e12] overflow-hidden">
                  <TrackWaveform 
                    buffer={track.buffer} 
                    startTime={track.startTime}
                    trimStart={track.trimStart}
                    trimEnd={track.trimEnd}
                    fadeIn={track.fadeIn}
                    fadeOut={track.fadeOut}
                    currentTime={currentTime} 
                    duration={duration} 
                    color={track.color} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mixer / Effects Panel */}
        <div className="h-72 bg-[#16181d] border-t border-[#2a2d36] shrink-0 flex">
          {/* Master Channel Strip */}
          <div className="w-48 border-r border-[#2a2d36] p-4 flex flex-col bg-[#0d0e12]">
            <h3 className="text-xs font-bold text-[#64748b] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              Master
            </h3>
            
            <div className="flex-1 flex flex-col items-center justify-between">
              <div className="flex flex-col items-center gap-2 h-32">
                <span className="text-[10px] font-mono text-[#00f0ff]">VOL</span>
                <div className="flex-1 relative w-8 bg-[#16181d] rounded-full border border-[#2a2d36] flex justify-center py-2">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={masterVolume}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setMasterVolume(val);
                      engineRef.current?.setMasterVolume(val);
                    }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-1 -rotate-90 appearance-none bg-transparent cursor-pointer"
                    style={{ WebkitAppearance: 'none' }}
                  />
                  <div 
                    className="absolute w-6 h-3 bg-[#e2e8f0] rounded-sm pointer-events-none shadow-md border border-white/20"
                    style={{ bottom: `${(masterVolume / 2) * 100}%`, transform: 'translateY(50%)' }}
                  />
                </div>
              </div>
              
              <div className="w-full bg-[#1e2128] border border-[#2a2d36] rounded p-2 mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-red-400">LIMITER</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_red]"></div>
                </div>
                <span className="text-[9px] text-[#64748b] leading-tight block">Prevents clipping on export</span>
              </div>
            </div>
          </div>

          {/* Selected Track Effects Rack */}
          <div className="flex-1 p-4 flex flex-col overflow-hidden">
            {selectedTrack ? (
              <>
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    FX Rack: <span className="text-[#00f0ff]">{selectedTrack.name}</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#64748b]">Preset:</span>
                    <select 
                      className="bg-[#1e2128] border border-[#2a2d36] rounded px-2 py-1 text-xs text-white outline-none"
                      onChange={(e) => applyPreset(selectedTrack.id, e.target.value)}
                      defaultValue="default"
                    >
                      <option value="default">Default</option>
                      <option value="voz">Voz (Radio)</option>
                      <option value="locucion_pro">Locución Pro (Grave + Brillo)</option>
                      <option value="podcast_clear">Podcast Clear</option>
                      <option value="instrumental">Instrumental</option>
                      <option value="orquestal">Orquestal</option>
                      <option value="radio_host">Radio Host</option>
                      <option value="guitarra">Guitarra</option>
                      <option value="fix_ai">Fix AI</option>
                    </select>
                  </div>
                </div>

                <div className="flex-1 flex gap-4 overflow-x-auto pb-2">
                  
                  {/* Track Settings Module */}
                  <div className="w-64 shrink-0 bg-[#0d0e12] border border-[#2a2d36] rounded-lg p-4 flex flex-col transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Track Settings</h4>
                    </div>
                    
                    <div className="flex flex-col gap-3 mt-auto mb-auto">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">COLOR</span>
                        <input
                          type="color"
                          value={selectedTrack.color}
                          onChange={(e) => updateTrack(selectedTrack.id, { color: e.target.value })}
                          className="w-8 h-6 bg-transparent border-none cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">START</span>
                        <input
                          type="number" min="0" step="0.1"
                          value={selectedTrack.startTime}
                          onChange={(e) => updateTrack(selectedTrack.id, { startTime: parseFloat(e.target.value) || 0 })}
                          className="w-16 bg-[#1e2128] border border-[#2a2d36] rounded px-1 text-xs text-white text-right"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-4 text-left">s</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">TRIM L</span>
                        <input
                          type="number" min="0" max={selectedTrack.trimEnd} step="0.1"
                          value={selectedTrack.trimStart}
                          onChange={(e) => updateTrack(selectedTrack.id, { trimStart: parseFloat(e.target.value) || 0 })}
                          className="w-16 bg-[#1e2128] border border-[#2a2d36] rounded px-1 text-xs text-white text-right"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-4 text-left">s</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">TRIM R</span>
                        <input
                          type="number" min={selectedTrack.trimStart} max={selectedTrack.buffer.duration} step="0.1"
                          value={selectedTrack.trimEnd}
                          onChange={(e) => updateTrack(selectedTrack.id, { trimEnd: parseFloat(e.target.value) || selectedTrack.buffer.duration })}
                          className="w-16 bg-[#1e2128] border border-[#2a2d36] rounded px-1 text-xs text-white text-right"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-4 text-left">s</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">FADE IN</span>
                        <input
                          type="number" min="0" step="0.1"
                          value={selectedTrack.fadeIn}
                          onChange={(e) => updateTrack(selectedTrack.id, { fadeIn: parseFloat(e.target.value) || 0 })}
                          className="w-16 bg-[#1e2128] border border-[#2a2d36] rounded px-1 text-xs text-white text-right"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-4 text-left">s</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">FADE OUT</span>
                        <input
                          type="number" min="0" step="0.1"
                          value={selectedTrack.fadeOut}
                          onChange={(e) => updateTrack(selectedTrack.id, { fadeOut: parseFloat(e.target.value) || 0 })}
                          className="w-16 bg-[#1e2128] border border-[#2a2d36] rounded px-1 text-xs text-white text-right"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-4 text-left">s</span>
                      </div>
                    </div>
                  </div>

                  {/* De-Noise Module */}
                  <div className={`w-64 shrink-0 bg-[#0d0e12] border ${selectedTrack.effects.deNoise?.enabled ? 'border-[#ff00ff]/50' : 'border-[#2a2d36]'} rounded-lg p-4 flex flex-col transition-colors`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">De-Noise</h4>
                      <button 
                        onClick={() => updateTrackEffect(selectedTrack.id, 'deNoise', 'enabled', !(selectedTrack.effects.deNoise?.enabled ?? false))}
                        className={`w-6 h-4 rounded-full flex items-center px-0.5 transition-colors ${selectedTrack.effects.deNoise?.enabled ? 'bg-[#ff00ff]' : 'bg-[#2a2d36]'}`}
                      >
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${selectedTrack.effects.deNoise?.enabled ? 'translate-x-2' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                    
                    <div className={`flex flex-col gap-4 mt-auto mb-auto ${!(selectedTrack.effects.deNoise?.enabled ?? false) && 'opacity-50 pointer-events-none'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">AMOUNT</span>
                        <input
                          type="range" min="0" max="100" step="1"
                          value={selectedTrack.effects.deNoise?.amount ?? 50}
                          onChange={(e) => updateTrackEffect(selectedTrack.id, 'deNoise', 'amount', parseFloat(e.target.value))}
                          className="w-32"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-8 text-right">{selectedTrack.effects.deNoise?.amount ?? 50}%</span>
                      </div>
                    </div>
                  </div>

                  {/* De-Breath Module */}
                  <div className={`w-64 shrink-0 bg-[#0d0e12] border ${selectedTrack.effects.deBreath?.enabled ? 'border-[#ff00ff]/50' : 'border-[#2a2d36]'} rounded-lg p-4 flex flex-col transition-colors`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">De-Breath</h4>
                      <button 
                        onClick={() => updateTrackEffect(selectedTrack.id, 'deBreath', 'enabled', !(selectedTrack.effects.deBreath?.enabled ?? false))}
                        className={`w-6 h-4 rounded-full flex items-center px-0.5 transition-colors ${selectedTrack.effects.deBreath?.enabled ? 'bg-[#ff00ff]' : 'bg-[#2a2d36]'}`}
                      >
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${selectedTrack.effects.deBreath?.enabled ? 'translate-x-2' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                    
                    <div className={`flex flex-col gap-4 mt-auto mb-auto ${!(selectedTrack.effects.deBreath?.enabled ?? false) && 'opacity-50 pointer-events-none'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">AMOUNT</span>
                        <input
                          type="range" min="0" max="100" step="1"
                          value={selectedTrack.effects.deBreath?.amount ?? 50}
                          onChange={(e) => updateTrackEffect(selectedTrack.id, 'deBreath', 'amount', parseFloat(e.target.value))}
                          className="w-32"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-8 text-right">{selectedTrack.effects.deBreath?.amount ?? 50}%</span>
                      </div>
                    </div>
                  </div>

                  {/* EQ Module */}
                  <div className={`w-64 shrink-0 bg-[#0d0e12] border ${selectedTrack.effects.eq.enabled ? 'border-[#00f0ff]/50' : 'border-[#2a2d36]'} rounded-lg p-4 flex flex-col transition-colors`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Equalizer</h4>
                      <button 
                        onClick={() => updateTrackEffect(selectedTrack.id, 'eq', 'enabled', !selectedTrack.effects.eq.enabled)}
                        className={`w-6 h-4 rounded-full flex items-center px-0.5 transition-colors ${selectedTrack.effects.eq.enabled ? 'bg-[#00f0ff]' : 'bg-[#2a2d36]'}`}
                      >
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${selectedTrack.effects.eq.enabled ? 'translate-x-2' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                    
                    <div className={`flex-1 flex justify-between items-end gap-2 ${!selectedTrack.effects.eq.enabled && 'opacity-50 pointer-events-none'}`}>
                      {['low', 'mid', 'high'].map((band) => (
                        <div key={band} className="flex flex-col items-center gap-2">
                          <span className="text-[10px] font-mono text-[#64748b] uppercase">{band}</span>
                          <input
                            type="range" min="-24" max="24" step="0.1"
                            value={selectedTrack.effects.eq[band as keyof typeof selectedTrack.effects.eq]}
                            onChange={(e) => updateTrackEffect(selectedTrack.id, 'eq', band, parseFloat(e.target.value))}
                            className="w-16 -rotate-90 origin-center translate-y-6"
                          />
                          <span className="text-[10px] font-mono text-[#00f0ff] mt-12">
                            {selectedTrack.effects.eq[band as keyof typeof selectedTrack.effects.eq] > 0 ? '+' : ''}
                            {Number(selectedTrack.effects.eq[band as keyof typeof selectedTrack.effects.eq]).toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Compressor Module */}
                  <div className={`w-64 shrink-0 bg-[#0d0e12] border ${selectedTrack.effects.compressor.enabled ? 'border-[#ffaa00]/50' : 'border-[#2a2d36]'} rounded-lg p-4 flex flex-col transition-colors`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Compressor</h4>
                      <button 
                        onClick={() => updateTrackEffect(selectedTrack.id, 'compressor', 'enabled', !selectedTrack.effects.compressor.enabled)}
                        className={`w-6 h-4 rounded-full flex items-center px-0.5 transition-colors ${selectedTrack.effects.compressor.enabled ? 'bg-[#ffaa00]' : 'bg-[#2a2d36]'}`}
                      >
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${selectedTrack.effects.compressor.enabled ? 'translate-x-2' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                    
                    <div className={`flex flex-col gap-4 mt-auto mb-auto ${!selectedTrack.effects.compressor.enabled && 'opacity-50 pointer-events-none'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">THRESH</span>
                        <input
                          type="range" min="-60" max="0" step="1"
                          value={selectedTrack.effects.compressor.threshold}
                          onChange={(e) => updateTrackEffect(selectedTrack.id, 'compressor', 'threshold', parseFloat(e.target.value))}
                          className="w-32"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-8 text-right">{selectedTrack.effects.compressor.threshold}dB</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">RATIO</span>
                        <input
                          type="range" min="1" max="20" step="0.1"
                          value={selectedTrack.effects.compressor.ratio}
                          onChange={(e) => updateTrackEffect(selectedTrack.id, 'compressor', 'ratio', parseFloat(e.target.value))}
                          className="w-32"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-8 text-right">{selectedTrack.effects.compressor.ratio.toFixed(1)}:1</span>
                      </div>
                    </div>
                  </div>

                  {/* Reverb Module */}
                  <div className={`w-64 shrink-0 bg-[#0d0e12] border ${selectedTrack.effects.reverb.enabled ? 'border-[#00ff00]/50' : 'border-[#2a2d36]'} rounded-lg p-4 flex flex-col transition-colors`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Reverb</h4>
                      <button 
                        onClick={() => updateTrackEffect(selectedTrack.id, 'reverb', 'enabled', !selectedTrack.effects.reverb.enabled)}
                        className={`w-6 h-4 rounded-full flex items-center px-0.5 transition-colors ${selectedTrack.effects.reverb.enabled ? 'bg-[#00ff00]' : 'bg-[#2a2d36]'}`}
                      >
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${selectedTrack.effects.reverb.enabled ? 'translate-x-2' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                    
                    <div className={`flex flex-col gap-4 mt-auto mb-auto ${!selectedTrack.effects.reverb.enabled && 'opacity-50 pointer-events-none'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">TYPE</span>
                        <select 
                          className="bg-[#1e2128] border border-[#2a2d36] rounded px-2 py-1 text-xs text-white outline-none w-32"
                          value={selectedTrack.effects.reverb.type}
                          onChange={(e) => updateTrackEffect(selectedTrack.id, 'reverb', 'type', e.target.value)}
                        >
                          <option value="room">Room</option>
                          <option value="hall">Hall</option>
                          <option value="cathedral">Cathedral</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">MIX</span>
                        <input
                          type="range" min="0" max="1" step="0.01"
                          value={selectedTrack.effects.reverb.mix}
                          onChange={(e) => updateTrackEffect(selectedTrack.id, 'reverb', 'mix', parseFloat(e.target.value))}
                          className="w-32"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-8 text-right">
                          {Math.round(selectedTrack.effects.reverb.mix * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Delay Module */}
                  <div className={`w-64 shrink-0 bg-[#0d0e12] border ${selectedTrack.effects.delay.enabled ? 'border-[#ff00ff]/50' : 'border-[#2a2d36]'} rounded-lg p-4 flex flex-col transition-colors`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Delay</h4>
                      <button 
                        onClick={() => updateTrackEffect(selectedTrack.id, 'delay', 'enabled', !selectedTrack.effects.delay.enabled)}
                        className={`w-6 h-4 rounded-full flex items-center px-0.5 transition-colors ${selectedTrack.effects.delay.enabled ? 'bg-[#ff00ff]' : 'bg-[#2a2d36]'}`}
                      >
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${selectedTrack.effects.delay.enabled ? 'translate-x-2' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                    
                    <div className={`flex flex-col gap-4 ${!selectedTrack.effects.delay.enabled && 'opacity-50 pointer-events-none'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">TIME</span>
                        <input
                          type="range" min="0" max="1" step="0.01"
                          value={selectedTrack.effects.delay.time}
                          onChange={(e) => updateTrackEffect(selectedTrack.id, 'delay', 'time', parseFloat(e.target.value))}
                          className="w-32"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-8 text-right">{(selectedTrack.effects.delay.time * 1000).toFixed(0)}ms</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">FDBK</span>
                        <input
                          type="range" min="0" max="0.9" step="0.01"
                          value={selectedTrack.effects.delay.feedback}
                          onChange={(e) => updateTrackEffect(selectedTrack.id, 'delay', 'feedback', parseFloat(e.target.value))}
                          className="w-32"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-8 text-right">{Math.round(selectedTrack.effects.delay.feedback * 100)}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">MIX</span>
                        <input
                          type="range" min="0" max="1" step="0.01"
                          value={selectedTrack.effects.delay.mix}
                          onChange={(e) => updateTrackEffect(selectedTrack.id, 'delay', 'mix', parseFloat(e.target.value))}
                          className="w-32"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-8 text-right">{Math.round(selectedTrack.effects.delay.mix * 100)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Gain Rider Module */}
                  <div className={`w-64 shrink-0 bg-[#0d0e12] border ${selectedTrack.effects.gainRider.enabled ? 'border-[#ff0055]/50' : 'border-[#2a2d36]'} rounded-lg p-4 flex flex-col transition-colors`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Gain Rider</h4>
                      <button 
                        onClick={() => updateTrackEffect(selectedTrack.id, 'gainRider', 'enabled', !selectedTrack.effects.gainRider.enabled)}
                        className={`w-6 h-4 rounded-full flex items-center px-0.5 transition-colors ${selectedTrack.effects.gainRider.enabled ? 'bg-[#ff0055]' : 'bg-[#2a2d36]'}`}
                      >
                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${selectedTrack.effects.gainRider.enabled ? 'translate-x-2' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                    
                    <div className={`flex flex-col gap-4 mt-auto mb-auto ${!selectedTrack.effects.gainRider.enabled && 'opacity-50 pointer-events-none'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#64748b]">TARGET</span>
                        <input
                          type="range" min="-30" max="0" step="1"
                          value={selectedTrack.effects.gainRider.target}
                          onChange={(e) => updateTrackEffect(selectedTrack.id, 'gainRider', 'target', parseFloat(e.target.value))}
                          className="w-32"
                        />
                        <span className="text-[10px] font-mono text-[#e2e8f0] w-8 text-right">{selectedTrack.effects.gainRider.target}dB</span>
                      </div>
                    </div>
                  </div>

                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                <Sliders className="w-12 h-12 text-[#64748b] mb-4" />
                <p className="text-[#64748b] font-medium">Select a track to edit its effects</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Transport Controls */}
      <footer className="h-16 bg-[#16181d] border-t border-[#2a2d36] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-[#0d0e12] rounded-md border border-[#2a2d36] p-1">
            <button
              onClick={() => engineRef.current?.stop()}
              disabled={tracks.length === 0}
              className="p-2 text-[#64748b] hover:text-white disabled:opacity-50 transition-colors"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
            <button
              onClick={() => {
                if (isPlaying) engineRef.current?.pause();
                else engineRef.current?.play();
              }}
              disabled={tracks.length === 0}
              className="p-2 text-[#00f0ff] hover:text-[#33f3ff] disabled:opacity-50 transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </button>
          </div>
        </div>

        {/* Time Display */}
        <div className="flex items-center gap-4 bg-[#0d0e12] px-6 py-2 rounded-md border border-[#2a2d36] shadow-inner">
          <span className="font-mono text-xl text-[#00f0ff] tracking-wider">
            {formatTime(currentTime)}
          </span>
          <span className="text-[#64748b] font-mono">/</span>
          <span className="font-mono text-lg text-[#64748b] tracking-wider">
            {formatTime(duration)}
          </span>
        </div>
        
        <div className="w-[200px]"></div> {/* Spacer for balance */}
      </footer>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-[#16181d] border border-[#2a2d36] rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6">Export Audio</h2>
            
            <div className="space-y-6">
              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-3">Format</label>
                <div className="flex gap-4">
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${exportFormat === 'wav' ? 'bg-[#00f0ff]/10 border-[#00f0ff] text-[#00f0ff]' : 'border-[#2a2d36] text-[#94a3b8] hover:border-[#475569]'}`}>
                    <input type="radio" name="format" value="wav" checked={exportFormat === 'wav'} onChange={() => setExportFormat('wav')} className="hidden" />
                    <span className="font-semibold">WAV</span>
                    <span className="text-xs opacity-70">(Lossless)</span>
                  </label>
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${exportFormat === 'mp3' ? 'bg-[#00f0ff]/10 border-[#00f0ff] text-[#00f0ff]' : 'border-[#2a2d36] text-[#94a3b8] hover:border-[#475569]'}`}>
                    <input type="radio" name="format" value="mp3" checked={exportFormat === 'mp3'} onChange={() => setExportFormat('mp3')} className="hidden" />
                    <span className="font-semibold">MP3</span>
                    <span className="text-xs opacity-70">(Compressed)</span>
                  </label>
                </div>
              </div>

              {/* Mode Selection */}
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-3">Export Mode</label>
                <div className="flex gap-4">
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${exportMode === 'mixdown' ? 'bg-[#ff00ff]/10 border-[#ff00ff] text-[#ff00ff]' : 'border-[#2a2d36] text-[#94a3b8] hover:border-[#475569]'}`}>
                    <input type="radio" name="mode" value="mixdown" checked={exportMode === 'mixdown'} onChange={() => setExportMode('mixdown')} className="hidden" />
                    <span className="font-semibold">Mixdown</span>
                    <span className="text-xs opacity-70">(Single File)</span>
                  </label>
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${exportMode === 'separate' ? 'bg-[#ff00ff]/10 border-[#ff00ff] text-[#ff00ff]' : 'border-[#2a2d36] text-[#94a3b8] hover:border-[#475569]'}`}>
                    <input type="radio" name="mode" value="separate" checked={exportMode === 'separate'} onChange={() => setExportMode('separate')} className="hidden" />
                    <span className="font-semibold">Stems</span>
                    <span className="text-xs opacity-70">(ZIP File)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button 
                onClick={() => setShowExportModal(false)}
                disabled={isExporting}
                className="px-4 py-2 rounded-md text-sm font-medium text-[#94a3b8] hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-2 px-6 py-2 bg-[#00f0ff] hover:bg-[#33f3ff] text-black rounded-md text-sm font-bold transition-colors shadow-[0_0_10px_rgba(0,240,255,0.2)] disabled:opacity-50 disabled:shadow-none"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
