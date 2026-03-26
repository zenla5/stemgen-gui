import { useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/hooks/useAudioPlayer';

interface WaveformDisplayProps {
  audioUrl?: string;
  audioPath?: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  className?: string;
  height?: number;
  waveColor?: string;
  progressColor?: string;
}

export function WaveformDisplay({
  audioUrl,
  audioPath,
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onSeek,
  className,
  height = 80,
  waveColor = '#4f46e5',
  progressColor = '#6366f1',
}: WaveformDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  
  // Build audio URL
  const audioSourceUrl = audioUrl || (audioPath ? `asset://localhost/${encodeURIComponent(audioPath)}` : undefined);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioSourceUrl) return;

    // Create WaveSurfer instance
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: waveColor,
      progressColor: progressColor,
      height: height,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      cursorWidth: 1,
      cursorColor: '#333',
      normalize: true,
      backend: 'WebAudio',
    });

    // Load audio
    wavesurfer.load(audioSourceUrl);

    wavesurfer.on('ready', () => {
      console.log('Waveform ready');
    });

    wavesurfer.on('error', (err) => {
      console.error('Waveform error:', err);
    });

    // Seek on click
    wavesurfer.on('click', (relativeX) => {
      const seekTime = relativeX * duration;
      onSeek(seekTime);
    });

    wavesurferRef.current = wavesurfer;

    // Cleanup
    return () => {
      wavesurfer.destroy();
      wavesurferRef.current = null;
    };
  }, [audioSourceUrl, height, waveColor, progressColor, duration, onSeek]);

  // Sync playback state with WaveSurfer
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;

    if (isPlaying) {
      ws.play();
    } else {
      ws.pause();
    }
  }, [isPlaying]);

  // Sync current time with WaveSurfer
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !duration) return;

    // Skip if difference is small (to avoid jitter)
    const currentProgress = ws.getCurrentTime();
    if (Math.abs(currentProgress - currentTime) > 0.1) {
      ws.seekTo(currentTime / duration);
    }
  }, [currentTime, duration]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      onPlayPause();
    } else if (e.key === 'ArrowLeft' || e.key === 'j') {
      e.preventDefault();
      onSeek(Math.max(0, currentTime - 5));
    } else if (e.key === 'ArrowRight' || e.key === 'l') {
      e.preventDefault();
      onSeek(Math.min(duration, currentTime + 5));
    }
  }, [onPlayPause, onSeek, currentTime, duration]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div 
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-card p-4',
        className
      )}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Waveform container */}
      <div 
        ref={containerRef} 
        className="w-full cursor-pointer"
        style={{ height: `${height}px` }}
      />
      
      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => onSeek(0)}
          className="rounded-md p-2 hover:bg-muted"
          title="Restart"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        
        <button
          onClick={onPlayPause}
          disabled={!audioSourceUrl}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </button>
        
        <button
          onClick={() => onSeek(duration)}
          className="rounded-md p-2 hover:bg-muted"
          title="Skip to end"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        
        {/* Time display */}
        <div className="ml-auto flex items-center gap-2 font-mono text-sm">
          <span>{formatTime(currentTime)}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{formatTime(duration)}</span>
        </div>
      </div>
      
      {/* Progress bar (fallback if waveform not loaded) */}
      {!audioSourceUrl && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div 
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Simple waveform display without WaveSurfer (fallback)
 */
export function SimpleWaveform({
  progress = 0,
  className,
}: {
  progress?: number;
  className?: string;
}) {
  return (
    <div 
      className={cn(
        'h-2 overflow-hidden rounded-full bg-muted',
        className
      )}
    >
      <div 
        className="h-full bg-primary transition-all duration-150"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
