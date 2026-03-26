import React, { useEffect, useRef, useCallback } from 'react';
import type { WaveformData } from '@/lib/types';
import { cn } from '@/lib/utils';

interface StemWaveformDisplayProps {
  waveformData: WaveformData | null;
  currentTime?: number;
  duration?: number;
  color?: string;
  height?: number;
  className?: string;
  onSeek?: (time: number) => void;
}

/**
 * Canvas-based waveform display for a single stem.
 *
 * Renders RMS/min/max bars from WaveformData computed from AudioBuffer.
 * Displays a playback cursor that moves with currentTime.
 */
export function StemWaveformDisplay({
  waveformData,
  currentTime = 0,
  duration = 0,
  color = '#4f46e5',
  height = 32,
  className,
  onSeek,
}: StemWaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Draw the waveform
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (!waveformData || waveformData.points.length === 0) {
      // Draw placeholder
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, rect.height / 2 - 1, rect.width, 2);
      return;
    }

    const points = waveformData.points;
    const barWidth = rect.width / points.length;
    const centerY = rect.height / 2;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const x = i * barWidth;

      // Normalize values (they're in -1 to 1 range typically)
      const rmsHeight = Math.max(2, Math.abs(point.rms) * rect.height);
      const maxHeight = Math.max(2, Math.abs(point.max - point.min) * rect.height);

      // Draw RMS bar (centered)
      ctx.fillStyle = color + '80'; // 50% opacity
      ctx.fillRect(
        x,
        centerY - rmsHeight / 2,
        Math.max(1, barWidth - 1),
        Math.max(1, rmsHeight)
      );

      // Draw min/max range
      ctx.fillStyle = color + '40'; // 25% opacity
      ctx.fillRect(
        x,
        centerY - maxHeight / 2,
        Math.max(1, barWidth - 1),
        Math.max(1, maxHeight)
      );
    }

    // Draw playback cursor
    if (duration > 0 && currentTime >= 0) {
      const cursorX = (currentTime / duration) * rect.width;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cursorX - 1, 0, 2, rect.height);

      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.strokeRect(cursorX - 1, 0, 2, rect.height);
    }
  }, [waveformData, currentTime, duration, color]);

  // Redraw when data or playback position changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      draw();
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [draw]);

  // Handle click to seek
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSeek || duration <= 0) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const relativeX = clickX / rect.width;
      const seekTime = relativeX * duration;

      onSeek(Math.max(0, Math.min(seekTime, duration)));
    },
    [onSeek, duration]
  );

  return (
    <div
      ref={containerRef}
      className={cn('w-full cursor-pointer rounded overflow-hidden', className)}
      style={{ height: `${height}px` }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ height: `${height}px` }}
        onClick={handleClick}
      />
    </div>
  );
}
