import { useCallback, useEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { StemType, WaveformData } from '@/lib/types';

// State for the multi-stem player
export interface MultiStemPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoaded: boolean;
  loadingProgress: number;
  loadedStems: StemType[];
  isLoading: boolean;
}

// Return type for the hook
export interface UseMultiStemPlayerReturn {
  state: MultiStemPlayerState;
  loadStems: (stems: { type: StemType; path: string }[]) => Promise<void>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setMasterVolume: (volume: number) => void;
  setStemVolume: (stemType: StemType, volume: number) => void;
  setStemMuted: (stemType: StemType, muted: boolean) => void;
  setStemSolo: (stemType: StemType, solo: boolean) => void;
  stemWaveforms: Record<StemType, WaveformData | null>;
  cleanup: () => void;
}

// Stem types for iteration
const ALL_STEM_TYPES: StemType[] = ['drums', 'bass', 'other', 'vocals'];

/**
 * Load waveform data from an AudioBuffer
 */
function computeWaveformData(audioBuffer: AudioBuffer, pointsPerSecond = 100): WaveformData {
  const channelData = audioBuffer.getChannelData(0);
  const totalPoints = Math.ceil(audioBuffer.duration * pointsPerSecond);
  const samplesPerPoint = Math.floor(channelData.length / totalPoints);
  const points: { min: number; max: number; rms: number }[] = [];

  for (let i = 0; i < totalPoints; i++) {
    const start = i * samplesPerPoint;
    const end = Math.min(start + samplesPerPoint, channelData.length);

    let min = 0;
    let max = 0;
    let sum = 0;

    for (let j = start; j < end; j++) {
      const sample = channelData[j];
      if (sample < min) min = sample;
      if (sample > max) max = sample;
      sum += sample * sample;
    }

    const rms = Math.sqrt(sum / (end - start));
    points.push({ min, max, rms });
  }

  return {
    points,
    sample_rate: audioBuffer.sampleRate,
    duration_secs: audioBuffer.duration,
  };
}

/**
 * Hook for multi-stem audio playback with individual gain control.
 *
 * Loads multiple stem files, creates AudioBufferSourceNode per stem,
 * routes each through a GainNode, and mixes them to the master output.
 * Supports real-time volume, mute, and solo controls.
 */
export function useMultiStemPlayer(): UseMultiStemPlayerReturn {
  // Audio context and nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  // Audio buffers per stem
  const audioBuffersRef = useRef<Map<StemType, AudioBuffer>>(new Map());

  // Gain nodes per stem
  const gainNodesRef = useRef<Map<StemType, GainNode>>(new Map());

  // Active source nodes (for stopping playback)
  const sourceNodesRef = useRef<Map<StemType, AudioBufferSourceNode>>(new Map());

  // Playback state
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Solo/mute state per stem
  const soloStateRef = useRef<Set<StemType>>(new Set());
  const muteStateRef = useRef<Set<StemType>>(new Set());
  const volumeStateRef = useRef<Map<StemType, number>>(
    new Map(ALL_STEM_TYPES.map((t) => [t, 1] as [StemType, number]))
  );

  const [state, setState] = useState<MultiStemPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoaded: false,
    loadingProgress: 0,
    loadedStems: [],
    isLoading: false,
  });

  const [stemWaveforms, setStemWaveforms] = useState<Record<StemType, WaveformData | null>>({
    drums: null,
    bass: null,
    other: null,
    vocals: null,
  });

  // Initialize audio context
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.connect(audioContextRef.current.destination);

      // Create gain node per stem
      for (const stemType of ALL_STEM_TYPES) {
        const gainNode = audioContextRef.current.createGain();
        gainNode.connect(masterGainRef.current);
        gainNodesRef.current.set(stemType, gainNode);
      }
    }
    return audioContextRef.current;
  }, []);

  // Apply effective gain for a stem (considering mute, solo, and volume)
  const applyEffectiveGain = useCallback((stemType: StemType) => {
    const gainNode = gainNodesRef.current.get(stemType);
    if (!gainNode) return;

    const hasSolo = soloStateRef.current.size > 0;
    const isSoloed = soloStateRef.current.has(stemType);
    const isMuted = muteStateRef.current.has(stemType);
    const volume = volumeStateRef.current.get(stemType) ?? 1;

    let effectiveGain = volume;

    if (isMuted) {
      effectiveGain = 0;
    } else if (hasSolo && !isSoloed) {
      effectiveGain = 0;
    }

    gainNode.gain.value = effectiveGain;
  }, []);

  // Update current time for animation
  const updateCurrentTime = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !state.isPlaying) return;

    const elapsed = ctx.currentTime - startTimeRef.current + pausedAtRef.current;
    const current = Math.min(elapsed, state.duration);

    setState((prev) => ({ ...prev, currentTime: current }));

    if (current >= state.duration) {
      setState((prev) => ({
        ...prev,
        isPlaying: false,
        currentTime: 0,
      }));
      pausedAtRef.current = 0;
      return;
    }

    animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
  }, [state.isPlaying, state.duration]);

  // Load all stems
  const loadStems = useCallback(
    async (stems: { type: StemType; path: string }[]) => {
      const ctx = initAudioContext();

      // Resume context if suspended
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      setState((prev) => ({
        ...prev,
        isLoading: true,
        loadingProgress: 0,
        isLoaded: false,
        loadedStems: [],
      }));

      // Clear previous buffers
      audioBuffersRef.current.clear();

      const waveforms: Record<StemType, WaveformData | null> = {
        drums: null,
        bass: null,
        other: null,
        vocals: null,
      };

      const loadedCount = { value: 0 };
      const totalStems = stems.length;

      for (const stem of stems) {
        if (!stem.path) continue;

        try {
          const assetUrl = convertFileSrc(stem.path);
          const response = await fetch(assetUrl);

          if (!response.ok) {
            console.warn(`Failed to fetch stem ${stem.type}: ${response.status}`);
            continue;
          }

          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

          audioBuffersRef.current.set(stem.type, audioBuffer);
          waveforms[stem.type] = computeWaveformData(audioBuffer);
          loadedCount.value++;

          const progress = loadedCount.value / totalStems;

          setState((prev) => ({
            ...prev,
            loadingProgress: progress,
            loadedStems: Array.from(audioBuffersRef.current.keys()),
          }));
        } catch (error) {
          console.warn(`Failed to load stem ${stem.type}:`, error);
        }
      }

      // Calculate max duration across all stems
      let maxDuration = 0;
      for (const buffer of audioBuffersRef.current.values()) {
        if (buffer.duration > maxDuration) {
          maxDuration = buffer.duration;
        }
      }

      setStemWaveforms(waveforms);
      setState((prev) => ({
        ...prev,
        isLoaded: audioBuffersRef.current.size > 0,
        isLoading: false,
        loadingProgress: 1,
        duration: maxDuration,
        currentTime: 0,
        isPlaying: false,
      }));

      pausedAtRef.current = 0;
    },
    [initAudioContext]
  );

  // Stop all source nodes
  const stopAllSources = useCallback(() => {
    for (const source of sourceNodesRef.current.values()) {
      try {
        source.stop();
      } catch {
        // Source may have already stopped
      }
    }
    sourceNodesRef.current.clear();
  }, []);

  // Internal play handler
  const playInternal = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || audioBuffersRef.current.size === 0) return;

    // Resume context if suspended
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Stop any existing playback
    stopAllSources();

    // Create source node for each stem and connect to its gain node
    for (const [stemType, buffer] of audioBuffersRef.current) {
      const gainNode = gainNodesRef.current.get(stemType);
      if (!gainNode) continue;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      source.start(0, pausedAtRef.current);
      sourceNodesRef.current.set(stemType, source);
    }

    startTimeRef.current = ctx.currentTime;

    setState((prev) => ({ ...prev, isPlaying: true }));

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
  }, [stopAllSources, updateCurrentTime]);

  // Internal pause handler
  const pauseInternal = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    // Calculate paused position
    pausedAtRef.current = ctx.currentTime - startTimeRef.current + pausedAtRef.current;

    // Stop all sources
    stopAllSources();

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setState((prev) => ({ ...prev, isPlaying: false }));
  }, [stopAllSources]);

  // Play all stems simultaneously
  const play = playInternal;

  // Pause all stems
  const pause = pauseInternal;

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      pauseInternal();
    } else {
      playInternal();
    }
  }, [state.isPlaying, playInternal, pauseInternal]);

  // Seek to specific time (applies to all stems)
  const seek = useCallback(
    (time: number) => {
      const wasPlaying = state.isPlaying;

      if (wasPlaying) {
        pauseInternal();
      }

      pausedAtRef.current = Math.max(0, Math.min(time, state.duration));
      setState((prev) => ({ ...prev, currentTime: pausedAtRef.current }));

      if (wasPlaying) {
        playInternal();
      }
    },
    [state.isPlaying, state.duration, playInternal, pauseInternal]
  );

  // Set master volume
  const setMasterVolume = useCallback((volume: number) => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = Math.max(0, Math.min(1, volume));
    }
  }, []);

  // Set stem volume
  const setStemVolume = useCallback((stemType: StemType, volume: number) => {
    volumeStateRef.current.set(stemType, Math.max(0, Math.min(1, volume)));
    applyEffectiveGain(stemType);
  }, [applyEffectiveGain]);

  // Set stem muted
  const setStemMuted = useCallback(
    (stemType: StemType, muted: boolean) => {
      if (muted) {
        muteStateRef.current.add(stemType);
      } else {
        muteStateRef.current.delete(stemType);
      }
      applyEffectiveGain(stemType);
    },
    [applyEffectiveGain]
  );

  // Set stem solo
  const setStemSolo = useCallback(
    (stemType: StemType, solo: boolean) => {
      if (solo) {
        soloStateRef.current.add(stemType);
      } else {
        soloStateRef.current.delete(stemType);
      }
      // Reapply gain for all stems (solo affects all of them)
      for (const type of ALL_STEM_TYPES) {
        applyEffectiveGain(type);
      }
    },
    [applyEffectiveGain]
  );

  // Cleanup
  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    stopAllSources();

    audioBuffersRef.current.clear();
    gainNodesRef.current.clear();

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    masterGainRef.current = null;
    pausedAtRef.current = 0;

    setState({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isLoaded: false,
      loadingProgress: 0,
      loadedStems: [],
      isLoading: false,
    });

    setStemWaveforms({
      drums: null,
      bass: null,
      other: null,
      vocals: null,
    });
  }, [stopAllSources]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    loadStems,
    play,
    pause,
    togglePlay,
    seek,
    setMasterVolume,
    setStemVolume,
    setStemMuted,
    setStemSolo,
    stemWaveforms,
    cleanup,
  };
}
