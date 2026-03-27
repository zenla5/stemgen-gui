import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { StemWaveformDisplay } from '../StemWaveformDisplay';
import type { WaveformData } from '@/lib/types';

// Mock ResizeObserver
const mockResizeObserver = {
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
};
vi.stubGlobal('ResizeObserver', vi.fn(() => mockResizeObserver));

describe('StemWaveformDisplay', () => {
  const mockWaveformData: WaveformData = {
    points: [
      { min: -0.5, max: 0.5, rms: 0.3 },
      { min: -0.8, max: 0.7, rms: 0.5 },
      { min: -0.3, max: 0.4, rms: 0.2 },
      { min: -0.9, max: 0.8, rms: 0.6 },
      { min: -0.2, max: 0.3, rms: 0.15 },
    ],
    sample_rate: 44100,
    duration_secs: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<StemWaveformDisplay waveformData={mockWaveformData} />);
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('renders with default props', () => {
    const { container } = render(<StemWaveformDisplay waveformData={mockWaveformData} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('renders with null waveformData', () => {
    const { container } = render(<StemWaveformDisplay waveformData={null} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('renders with empty waveformData points', () => {
    const { container } = render(
      <StemWaveformDisplay waveformData={{ points: [], sample_rate: 44100, duration_secs: 10 }} />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('accepts custom height', () => {
    const { container } = render(
      <StemWaveformDisplay waveformData={mockWaveformData} height={64} />
    );
    const containerEl = container.querySelector('.w-full');
    expect(containerEl?.getAttribute('style')).toContain('height: 64px');
  });

  it('accepts custom color', () => {
    const { container } = render(
      <StemWaveformDisplay waveformData={mockWaveformData} color="#FF6B6B" />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('accepts custom className', () => {
    const { container } = render(
      <StemWaveformDisplay waveformData={mockWaveformData} className="custom-class" />
    );
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });

  it('calls onSeek when canvas is clicked', () => {
    const onSeek = vi.fn();
    const { container } = render(
      <StemWaveformDisplay
        waveformData={mockWaveformData}
        duration={100}
        onSeek={onSeek}
      />
    );
    const canvas = container.querySelector('canvas');
    if (canvas) {
      // Mock getBoundingClientRect
      const mockRect = { left: 0, top: 0, width: 500, height: 32 };
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(mockRect as DOMRect);

      fireEvent.click(canvas, { clientX: 250, clientY: 16 });
      expect(onSeek).toHaveBeenCalledWith(50); // 250/500 * 100
    }
  });

  it('clamps seek time to duration', () => {
    const onSeek = vi.fn();
    const { container } = render(
      <StemWaveformDisplay
        waveformData={mockWaveformData}
        duration={100}
        onSeek={onSeek}
      />
    );
    const canvas = container.querySelector('canvas');
    if (canvas) {
      const mockRect = { left: 0, top: 0, width: 500, height: 32 };
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(mockRect as DOMRect);

      // Click at position past width (edge case)
      fireEvent.click(canvas, { clientX: 600, clientY: 16 });
      expect(onSeek).toHaveBeenCalledWith(100); // Clamped to max
    }
  });

  it('clamps seek time to zero', () => {
    const onSeek = vi.fn();
    const { container } = render(
      <StemWaveformDisplay
        waveformData={mockWaveformData}
        duration={100}
        onSeek={onSeek}
      />
    );
    const canvas = container.querySelector('canvas');
    if (canvas) {
      const mockRect = { left: 0, top: 0, width: 500, height: 32 };
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(mockRect as DOMRect);

      // Click at negative position (edge case)
      fireEvent.click(canvas, { clientX: -10, clientY: 16 });
      expect(onSeek).toHaveBeenCalledWith(0); // Clamped to min
    }
  });

  it('does not call onSeek when duration is 0', () => {
    const onSeek = vi.fn();
    const { container } = render(
      <StemWaveformDisplay
        waveformData={mockWaveformData}
        duration={0}
        onSeek={onSeek}
      />
    );
    const canvas = container.querySelector('canvas');
    if (canvas) {
      fireEvent.click(canvas, { clientX: 250, clientY: 16 });
      expect(onSeek).not.toHaveBeenCalled();
    }
  });

  it('renders with different currentTime positions', () => {
    const { container } = render(
      <StemWaveformDisplay
        waveformData={mockWaveformData}
        currentTime={50}
        duration={100}
      />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('handles negative currentTime', () => {
    const { container } = render(
      <StemWaveformDisplay
        waveformData={mockWaveformData}
        currentTime={-5}
        duration={100}
      />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('sets up ResizeObserver', () => {
    render(
      <StemWaveformDisplay waveformData={mockWaveformData} />
    );
    // ResizeObserver should be set up
    expect(mockResizeObserver.observe).toHaveBeenCalled();
  });

  it('cleans up ResizeObserver on unmount', () => {
    const { unmount } = render(
      <StemWaveformDisplay waveformData={mockWaveformData} />
    );
    unmount();
    expect(mockResizeObserver.disconnect).toHaveBeenCalled();
  });
});
