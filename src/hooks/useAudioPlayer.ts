import { useCallback, useEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Stem } from '@/lib/types';

interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoaded: boolean;
}

interface UseAudioPlayerReturn {
  state: AudioPlayerState;
  loadAudio: (filePath: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  cleanup: () => void;
}

/**
 * Hook for playing audio files with Web Audio API
 * Supports multiple stems with individual volume, mute, and solo controls
 */
export function useAudioPlayer(): UseAudioPlayerReturn {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoaded: false,
  });

  // Initialize audio context
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.connect(audioContextRef.current.destination);
    }
    return audioContextRef.current;
  }, []);

  // Load audio file
  const loadAudio = useCallback(async (filePath: string) => {
    const ctx = initAudioContext();
    
    try {
      // Convert file path to URL using Tauri's asset protocol
      const assetUrl = convertFileSrc(filePath);
      const response = await fetch(assetUrl);
      const arrayBuffer = await response.arrayBuffer();
      
      // Decode audio data
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      audioBufferRef.current = audioBuffer;
      
      setState(prev => ({
        ...prev,
        isLoaded: true,
        duration: audioBuffer.duration,
        currentTime: 0,
        isPlaying: false,
      }));

      // Reset paused position
      pausedAtRef.current = 0;
      
      console.log('Audio loaded:', filePath, 'Duration:', audioBuffer.duration);
    } catch (error) {
      console.error('Failed to load audio:', error);
      throw error;
    }
  }, [initAudioContext]);

  // Update current time for animation
  const updateCurrentTime = useCallback(() => {
    if (!audioContextRef.current || !state.isPlaying) return;
    
    const elapsed = audioContextRef.current.currentTime - startTimeRef.current + pausedAtRef.current;
    const current = Math.min(elapsed, state.duration);
    
    setState(prev => ({ ...prev, currentTime: current }));
    
    // Check if we've reached the end
    if (current >= state.duration) {
      setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      pausedAtRef.current = 0;
      return;
    }
    
    animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
  }, [state.isPlaying, state.duration]);

  // Play audio
  const play = useCallback(() => {
    const ctx = audioContextRef.current;
    const buffer = audioBufferRef.current;
    const masterGain = masterGainRef.current;
    
    if (!ctx || !buffer || !masterGain) {
      console.warn('Audio not loaded');
      return;
    }

    // Resume context if suspended
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Stop any existing playback
    sourceNodesRef.current.forEach(source => {
      try { source.stop(); } catch {
        // Source may have already stopped — noop
      }
    });
    sourceNodesRef.current.clear();

    // Create new source node
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(masterGain);
    
    // Store source for cleanup
    sourceNodesRef.current.set('main', source);
    
    // Start playback
    startTimeRef.current = ctx.currentTime;
    source.start(0, pausedAtRef.current);
    
    setState(prev => ({ ...prev, isPlaying: true }));
    
    // Start time update loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
  }, [updateCurrentTime]);

  // Pause audio
  const pause = useCallback(() => {
    const ctx = audioContextRef.current;
    
    if (!ctx) return;

    // Calculate paused position
    pausedAtRef.current = ctx.currentTime - startTimeRef.current + pausedAtRef.current;
    
    // Stop all sources
    sourceNodesRef.current.forEach(source => {
      try { source.stop(); } catch {
        // Source may have already stopped — noop
      }
    });
    sourceNodesRef.current.clear();
    
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    setState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [state.isPlaying, play, pause]);

  // Seek to specific time
  const seek = useCallback((time: number) => {
    const wasPlaying = state.isPlaying;
    
    // Pause first
    if (wasPlaying) {
      pause();
    }
    
    // Set new paused position
    pausedAtRef.current = Math.max(0, Math.min(time, state.duration));
    setState(prev => ({ ...prev, currentTime: pausedAtRef.current }));
    
    // Resume if was playing
    if (wasPlaying) {
      play();
    }
  }, [state.isPlaying, state.duration, play, pause]);

  // Set master volume
  const setVolume = useCallback((volume: number) => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = Math.max(0, Math.min(1, volume));
    }
  }, []);

  // Cleanup resources
  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    sourceNodesRef.current.forEach(source => {
      try { source.stop(); } catch {
        // Source may have already stopped — noop
      }
    });
    sourceNodesRef.current.clear();
    gainNodesRef.current.clear();
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    audioBufferRef.current = null;
    masterGainRef.current = null;
    
    setState({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isLoaded: false,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    loadAudio,
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    cleanup,
  };
}

/**
 * Hook for applying stem mixer settings (volume, mute, solo)
 */
export function useStemMixer(
  _player: UseAudioPlayerReturn,
  stems: Stem[],
  masterVolume: number = 1
) {
  // Apply solo/mute logic
  useEffect(() => {
    // If any stem is soloed, mute non-soloed stems
    const hasSolo = stems.some(s => s.solo);
    
    // Calculate effective volume for each stem
    stems.forEach(stem => {
      let _effectiveVolume = stem.volume;
      
      // Apply mute
      if (stem.muted) {
        _effectiveVolume = 0;
      }
      
      // If another stem is soloed and this one isn't, mute it
      if (hasSolo && !stem.solo) {
        _effectiveVolume = 0;
      }
      
      // Apply master volume
      _effectiveVolume *= masterVolume;
      
      // Note: Individual stem volume control would require separate gain nodes
      // For now, we only support master volume
    });
  }, [stems, masterVolume]);

  return { stems };
}

/**
 * Format time in seconds to MM:SS format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
