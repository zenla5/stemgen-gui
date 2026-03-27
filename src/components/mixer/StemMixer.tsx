import { useState, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, Headphones, RefreshCw, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useMultiStemPlayer } from '@/hooks/useMultiStemPlayer';
import { StemWaveformDisplay } from '@/components/audio';
import { cn } from '@/lib/utils';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function StemMixer() {
  const {
    currentStems,
    updateStem,
    resetStemMixer,
    selectedFile,
  } = useAppStore();

  // Multi-stem audio player
  const player = useMultiStemPlayer();
  const [masterVolume, setMasterVolume] = useState(1);

  // Load all stems when currentStems have file paths
  useEffect(() => {
    const stemsWithPaths = currentStems
      .filter((stem) => stem.file_path)
      .map((stem) => ({
        type: stem.type,
        path: stem.file_path as string,
      }));

    if (stemsWithPaths.length > 0) {
      player.loadStems(stemsWithPaths);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStems]);

  // Apply master volume
  useEffect(() => {
    player.setMasterVolume(masterVolume);
  }, [masterVolume, player]);

  // Handle seek
  const handleSeek = useCallback(
    (time: number) => {
      player.seek(time);
    },
    [player]
  );

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    player.togglePlay();
  }, [player]);

  // Handle stem volume change
  const handleStemVolume = useCallback(
    (stemType: string, volume: number) => {
      player.setStemVolume(stemType as 'drums' | 'bass' | 'other' | 'vocals', volume);
      // Also update the store for persistence
      updateStem(stemType, { volume });
    },
    [player, updateStem]
  );

  // Handle stem mute
  const handleStemMute = useCallback(
    (stemType: string, muted: boolean) => {
      player.setStemMuted(stemType as 'drums' | 'bass' | 'other' | 'vocals', muted);
      updateStem(stemType, { muted });
    },
    [player, updateStem]
  );

  // Handle stem solo
  const handleStemSolo = useCallback(
    (stemType: string, solo: boolean) => {
      player.setStemSolo(stemType as 'drums' | 'bass' | 'other' | 'vocals', solo);
      updateStem(stemType, { solo });
    },
    [player, updateStem]
  );

  // Count loaded stems
  const loadedStemsCount = currentStems.filter(
    (s) => s.file_path && player.stemWaveforms[s.type]
  ).length;
  const hasStems = loadedStemsCount > 0;

  return (
    <div 
      className="flex h-full flex-col gap-6 p-4" 
      role="region" 
      aria-label="Stem Mixer"
      id="main-content"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stem Mixer</h2>
        <button
          onClick={resetStemMixer}
          className="flex items-center gap-2 rounded-md border border-muted px-3 py-1.5 text-sm hover:bg-muted/50"
          aria-label="Reset all stem mixer settings to default"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span>Reset</span>
        </button>
      </div>

      {/* Loading state */}
      {player.state.isLoading && (
        <div 
          className="flex items-center justify-center gap-3 py-8 text-muted-foreground"
          role="status"
          aria-live="polite"
          aria-label="Loading stems"
        >
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>
            Loading stems... {Math.round(player.state.loadingProgress * 100)}%
          </span>
        </div>
      )}

      {/* No stems loaded */}
      {!player.state.isLoading && !hasStems && (
        <div 
          className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground"
          role="status"
        >
          <div className="text-4xl" aria-hidden="true">🎵</div>
          <p className="text-center">
            Select a file and process it to generate stems.
            <br />
            Stems will appear here for mixing and preview.
          </p>
        </div>
      )}

      {/* Stem Cards */}
      {hasStems && (
        <div 
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          role="group"
          aria-label="Stem controls"
        >
          {currentStems.map((stem) => {
            const waveformData = player.stemWaveforms[stem.type];
            const hasWaveform = !!waveformData;

            return (
              <div
                key={stem.id}
                className="flex flex-col gap-3 rounded-lg border p-4 transition-all"
                style={{
                  borderColor: `${stem.color}40`,
                  backgroundColor: `${stem.color}08`,
                }}
                role="group"
                aria-label={`${stem.name} stem controls`}
              >
                {/* Stem header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: stem.color }}
                      aria-hidden="true"
                    />
                    <span className="font-medium">{stem.name}</span>
                  </div>
                  <div className="flex gap-1" role="group" aria-label={`${stem.name} controls`}>
                    <button
                      onClick={() => handleStemSolo(stem.id, !stem.solo)}
                      className={cn(
                        'rounded p-1 transition-colors',
                        stem.solo
                          ? 'bg-yellow-500/20 text-yellow-600'
                          : 'hover:bg-muted'
                      )}
                      aria-pressed={stem.solo}
                      aria-label={`Solo ${stem.name}`}
                      title="Solo"
                    >
                      <Headphones className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => handleStemMute(stem.id, !stem.muted)}
                      className={cn(
                        'rounded p-1 transition-colors',
                        stem.muted
                          ? 'bg-red-500/20 text-red-600'
                          : 'hover:bg-muted'
                      )}
                      aria-pressed={stem.muted}
                      aria-label={`${stem.muted ? 'Unmute' : 'Mute'} ${stem.name}`}
                      title="Mute"
                    >
                      {stem.muted ? (
                        <VolumeX className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Volume2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Mini waveform */}
                <StemWaveformDisplay
                  waveformData={waveformData}
                  currentTime={player.state.currentTime}
                  duration={player.state.duration}
                  color={stem.color}
                  height={32}
                  onSeek={hasWaveform ? handleSeek : undefined}
                />

                {/* Volume slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <label htmlFor={`volume-${stem.id}`} className="text-muted-foreground">
                      Volume
                    </label>
                    <span aria-hidden="true">{Math.round(stem.volume * 100)}%</span>
                  </div>
                  <input
                    id={`volume-${stem.id}`}
                    type="range"
                    min="0"
                    max="100"
                    value={stem.volume * 100}
                    onChange={(e) =>
                      handleStemVolume(stem.id, parseInt(e.target.value) / 100)
                    }
                    className="w-full accent-primary"
                    style={{
                      accentColor: stem.color,
                    }}
                    aria-label={`${stem.name} volume, ${Math.round(stem.volume * 100)}%`}
                  />
                </div>

                {/* File name */}
                {stem.file_path && (
                  <p className="truncate text-xs text-muted-foreground" aria-hidden="true">
                    {stem.file_path.split(/[/\\]/).pop()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Playback Controls */}
      {hasStems && (
        <div 
          className="mt-auto rounded-lg border bg-card p-4"
          role="region"
          aria-label="Playback controls"
        >
          <h3 className="mb-3 text-sm font-medium" id="playback-heading">Master Preview</h3>

          {/* Master Volume */}
          <div className="mb-4 flex items-center gap-3" role="group" aria-labelledby="master-volume-label">
            <Volume2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="master-volume" id="master-volume-label" className="sr-only">
              Master volume
            </label>
            <input
              id="master-volume"
              type="range"
              min="0"
              max="100"
              value={masterVolume * 100}
              onChange={(e) => setMasterVolume(parseInt(e.target.value) / 100)}
              className="flex-1 accent-primary"
              aria-label={`Master volume, ${Math.round(masterVolume * 100)}%`}
            />
            <span className="w-12 text-right text-sm" aria-hidden="true">
              {Math.round(masterVolume * 100)}%
            </span>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-4" role="group" aria-label="Transport controls">
            <button
              onClick={() => handleSeek(0)}
              className="rounded-md p-2 hover:bg-muted"
              aria-label="Restart playback"
              title="Restart"
            >
              <SkipBack className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              onClick={handlePlayPause}
              disabled={!hasStems}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              aria-label={player.state.isPlaying ? 'Pause' : 'Play'}
              aria-pressed={player.state.isPlaying}
              title={player.state.isPlaying ? 'Pause' : 'Play'}
            >
              {player.state.isPlaying ? (
                <Pause className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" aria-hidden="true" />
              )}
            </button>

            <button
              onClick={() => handleSeek(player.state.duration)}
              className="rounded-md p-2 hover:bg-muted"
              aria-label="Skip to end"
              title="Skip to end"
            >
              <SkipForward className="h-4 w-4" aria-hidden="true" />
            </button>

            {/* Time display */}
            <div 
              className="ml-auto flex items-center gap-2 font-mono text-sm"
              role="timer"
              aria-label={`Current time ${formatTime(player.state.currentTime)} of ${formatTime(player.state.duration)}`}
            >
              <span aria-hidden="true">{formatTime(player.state.currentTime)}</span>
              <span className="text-muted-foreground" aria-hidden="true">/</span>
              <span className="text-muted-foreground" aria-hidden="true">
                {formatTime(player.state.duration)}
              </span>
            </div>
          </div>

          {/* Playback progress bar */}
          <div 
            className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={player.state.duration > 0 
              ? Math.round((player.state.currentTime / player.state.duration) * 100)
              : 0}
            aria-valuetext={`Playback progress: ${Math.round((player.state.currentTime / player.state.duration) * 100)}%`}
            aria-label="Playback progress"
          >
            <div
              className="h-full bg-primary transition-all"
              style={{
                width:
                  player.state.duration > 0
                    ? `${(player.state.currentTime / player.state.duration) * 100}%`
                    : '0%',
              }}
            />
          </div>

          {/* Status */}
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {player.state.isLoaded
                ? `${loadedStemsCount}/4 stems loaded`
                : 'Loading...'}
            </span>
            {selectedFile && (
              <span
                className="truncate max-w-[200px]"
                title={selectedFile.name}
                aria-label={`Currently selected file: ${selectedFile.name}`}
              >
                {selectedFile.name}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
