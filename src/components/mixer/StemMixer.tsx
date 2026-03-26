import { useState, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, Headphones, RefreshCw } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { WaveformDisplay } from '@/components/audio';
import { cn } from '@/lib/utils';

export function StemMixer() {
  const { 
    currentStems, 
    updateStem, 
    resetStemMixer, 
    selectedFile,
  } = useAppStore();
  
  // Audio player state
  const player = useAudioPlayer();
  const [masterVolume, setMasterVolume] = useState(1);

  // Load audio when selected file changes
  useEffect(() => {
    if (selectedFile?.path) {
      player.loadAudio(selectedFile.path).catch(console.error);
    }
  }, [selectedFile?.path, player]);

  // Apply stem mixer settings
  useEffect(() => {
    // Apply master volume
    player.setVolume(masterVolume);
  }, [masterVolume, player]);

  // When stems change (from processing), update the current stems
  useEffect(() => {
    if (currentStems.some(s => s.file_path)) {
      // Stems have been processed, could switch to multi-track playback here
      console.log('Stems processed:', currentStems.filter(s => s.file_path).length);
    }
  }, [currentStems]);

  // Handle seek
  const handleSeek = useCallback((time: number) => {
    player.seek(time);
  }, [player]);

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    player.togglePlay();
  }, [player]);

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stem Mixer</h2>
        <button
          onClick={resetStemMixer}
          className="flex items-center gap-2 rounded-md border border-muted px-3 py-1.5 text-sm hover:bg-muted/50"
        >
          <RefreshCw className="h-4 w-4" />
          Reset
        </button>
      </div>

      {/* Stem Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {currentStems.map((stem) => (
          <div
            key={stem.id}
            className="flex flex-col gap-3 rounded-lg border p-4 transition-all"
            style={{ borderColor: `${stem.color}40`, backgroundColor: `${stem.color}08` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: stem.color }}
                />
                <span className="font-medium">{stem.name}</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => updateStem(stem.id, { solo: !stem.solo })}
                  className={cn(
                    'rounded p-1 transition-colors',
                    stem.solo
                      ? 'bg-yellow-500/20 text-yellow-600'
                      : 'hover:bg-muted'
                  )}
                  title="Solo"
                >
                  <Headphones className="h-4 w-4" />
                </button>
                <button
                  onClick={() => updateStem(stem.id, { muted: !stem.muted })}
                  className={cn(
                    'rounded p-1 transition-colors',
                    stem.muted
                      ? 'bg-red-500/20 text-red-600'
                      : 'hover:bg-muted'
                  )}
                  title="Mute"
                >
                  {stem.muted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Volume</span>
                <span>{Math.round(stem.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={stem.volume * 100}
                onChange={(e) =>
                  updateStem(stem.id, { volume: parseInt(e.target.value) / 100 })
                }
                className="w-full accent-primary"
                style={{
                  accentColor: stem.color,
                }}
              />
            </div>

            {stem.file_path && (
              <p className="truncate text-xs text-muted-foreground">
                {stem.file_path.split(/[/\\]/).pop()}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Preview Section */}
      <div className="mt-auto rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-medium">Preview</h3>
        
        {/* Master Volume */}
        <div className="mb-4 flex items-center gap-3">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <input
            type="range"
            min="0"
            max="100"
            value={masterVolume * 100}
            onChange={(e) => setMasterVolume(parseInt(e.target.value) / 100)}
            className="flex-1 accent-primary"
          />
          <span className="w-12 text-right text-sm">{Math.round(masterVolume * 100)}%</span>
        </div>
        
        {/* Waveform Display */}
        <WaveformDisplay
          audioPath={selectedFile?.path}
          isPlaying={player.state.isPlaying}
          currentTime={player.state.currentTime}
          duration={player.state.duration}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          height={60}
        />
        
        {/* Playback Status */}
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {player.state.isLoaded ? 'Ready' : 'Loading...'}
          </span>
          {selectedFile && (
            <span className="truncate max-w-[200px]" title={selectedFile.name}>
              {selectedFile.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
