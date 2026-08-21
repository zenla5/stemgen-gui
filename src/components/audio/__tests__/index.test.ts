import { describe, it, expect } from 'vitest';
import { WaveformDisplay, SimpleWaveform, StemWaveformDisplay } from '../index';
import {
  WaveformDisplay as WaveformDisplaySrc,
  SimpleWaveform as SimpleWaveformSrc,
} from '../WaveformDisplay';
import { StemWaveformDisplay as StemWaveformDisplaySrc } from '../StemWaveformDisplay';

describe('audio index barrel', () => {
  it('re-exports WaveformDisplay', () => {
    expect(WaveformDisplay).toBe(WaveformDisplaySrc);
  });

  it('re-exports SimpleWaveform', () => {
    expect(SimpleWaveform).toBe(SimpleWaveformSrc);
  });

  it('re-exports StemWaveformDisplay', () => {
    expect(StemWaveformDisplay).toBe(StemWaveformDisplaySrc);
  });
});
