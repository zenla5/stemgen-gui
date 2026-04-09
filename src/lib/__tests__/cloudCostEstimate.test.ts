import { describe, it, expect } from 'vitest';
import { estimateCost, getCostRangeDescription } from '../cloudCostEstimate';

describe('cloudCostEstimate', () => {
  describe('estimateCost', () => {
    it('returns fal cost for bs_roformer model', () => {
      const cost = estimateCost('fal', 'bs_roformer');
      expect(cost).toBe('~$0.05');
    });

    it('returns replicate cost for bs_roformer model', () => {
      const cost = estimateCost('replicate', 'bs_roformer');
      expect(cost).toBe('~$0.036');
    });

    it('returns fal cost for demucs model', () => {
      const cost = estimateCost('fal', 'demucs');
      expect(cost).toBe('~$0.01');
    });

    it('returns replicate cost for demucs model', () => {
      const cost = estimateCost('replicate', 'demucs');
      expect(cost).toBe('~$0.004');
    });

    it('returns fal cost for htdemucs model', () => {
      const cost = estimateCost('fal', 'htdemucs');
      expect(cost).toBe('~$0.02');
    });

    it('returns replicate cost for htdemucs model', () => {
      const cost = estimateCost('replicate', 'htdemucs');
      expect(cost).toBe('~$0.008');
    });

    it('returns fal cost for htdemucs_ft model', () => {
      const cost = estimateCost('fal', 'htdemucs_ft');
      expect(cost).toBe('~$0.03');
    });

    it('returns replicate cost for htdemucs_ft model', () => {
      const cost = estimateCost('replicate', 'htdemucs_ft');
      expect(cost).toBe('~$0.012');
    });

    it('returns default fal cost for unknown model', () => {
      const cost = estimateCost('fal', 'unknown_model');
      expect(cost).toBe('~$0.02');
    });

    it('returns default replicate cost for unknown model', () => {
      const cost = estimateCost('replicate', 'unknown_model');
      expect(cost).toBe('~$0.01');
    });

    it('handles case-insensitive model names', () => {
      expect(estimateCost('fal', 'HTDEMUCS')).toBe('~$0.02');
      expect(estimateCost('fal', 'HtDemucs')).toBe('~$0.02');
    });
  });

  describe('getCostRangeDescription', () => {
    it('returns fal cost range', () => {
      const desc = getCostRangeDescription('fal');
      expect(desc).toBe('$0.01–$0.05 per run');
    });

    it('returns replicate cost range', () => {
      const desc = getCostRangeDescription('replicate');
      expect(desc).toBe('$0.004–$0.036 per run');
    });
  });
});
