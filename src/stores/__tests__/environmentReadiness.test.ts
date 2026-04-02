import { describe, it, expect } from 'vitest';
import { computeEnvironmentReadiness } from '../appStore';
import type { EnvironmentValidation } from '@/lib/types';

const avail = { available: null };
const missing = (msg: string) => ({ missing: msg });
const unavail = (msg: string) => ({ unavailable: msg });

describe('computeEnvironmentReadiness', () => {
  it('returns all-false when given null', () => {
    const r = computeEnvironmentReadiness(null);
    expect(r.isReady).toBe(false);
    expect(r.pythonOk).toBe(false);
    expect(r.pytorchOk).toBe(false);
    expect(r.demucsOk).toBe(false);
    expect(r.ffmpegOk).toBe(false);
    expect(r.ffprobeOk).toBe(false);
    expect(r.sidecarOk).toBe(false);
    expect(r.gpuStatus).toBe('unknown');
  });

  it('marks isReady=true when all required fields are available', () => {
    const v: EnvironmentValidation = {
      isReady: true,
      python: avail,
      pythonVersion: '3.13.1',
      pytorch: avail,
      torchaudio: avail,
      demucs: avail,
      ffmpeg: avail,
      ffprobe: avail,
      sidecarScript: avail,
      warnings: [],
    };
    const r = computeEnvironmentReadiness(v);
    expect(r.isReady).toBe(true);
    expect(r.pythonOk).toBe(true);
    expect(r.pytorchOk).toBe(true);
    expect(r.demucsOk).toBe(true);
    expect(r.ffmpegOk).toBe(true);
    expect(r.ffprobeOk).toBe(true);
    expect(r.sidecarOk).toBe(true);
  });

  it('gpuStatus is "cuda" when CUDA is available', () => {
    const v: EnvironmentValidation = {
      isReady: true,
      python: avail,
      pythonVersion: '3.13.1',
      cuda: avail,
      warnings: [],
    };
    expect(computeEnvironmentReadiness(v).gpuStatus).toBe('cuda');
  });

  it('gpuStatus is "cpu" when CUDA is unavailable but Python is present', () => {
    const v: EnvironmentValidation = {
      isReady: true,
      python: avail,
      pythonVersion: '3.13.1',
      pytorch: avail,
      cuda: unavail('CUDA not available, will use CPU'),
      warnings: [],
    };
    expect(computeEnvironmentReadiness(v).gpuStatus).toBe('cpu');
  });

  it('does not block isReady when CUDA is unavailable', () => {
    const v: EnvironmentValidation = {
      isReady: true,
      python: avail,
      pytorch: avail,
      torchaudio: avail,
      demucs: avail,
      ffmpeg: avail,
      ffprobe: avail,
      sidecarScript: avail,
      cuda: unavail('CUDA not available, will use CPU'),
      warnings: [],
    };
    expect(computeEnvironmentReadiness(v).isReady).toBe(true);
  });

  it('isReady=false when any required dep is missing', () => {
    const v: EnvironmentValidation = {
      isReady: false,
      python: avail,
      pytorch: missing('PyTorch not installed'),
      demucs: avail,
      ffmpeg: avail,
      warnings: [],
    };
    const r = computeEnvironmentReadiness(v);
    expect(r.isReady).toBe(false);
    expect(r.pytorchOk).toBe(false);
  });

  it('summary and footer always agree on isReady', () => {
    const readyCases: EnvironmentValidation[] = [
      {
        isReady: true,
        python: avail,
        pytorch: avail,
        demucs: avail,
        ffmpeg: avail,
        ffprobe: avail,
        sidecarScript: avail,
        warnings: [],
      },
      { isReady: false, python: missing('not found'), warnings: [] },
    ];
    for (const v of readyCases) {
      const r = computeEnvironmentReadiness(v);
      expect(r.isReady).toBe(v.isReady);
    }
  });
});
