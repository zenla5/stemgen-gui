/**
 * Cloud cost estimation utility
 *
 * Provides approximate cost estimates for cloud inference providers
 * based on the selected model.
 */

// Cost ranges per run (USD)
const COST_TABLE: Record<string, { fal: string; replicate: string }> = {
  // BS-RoFormer models
  bs_roformer: { fal: '~$0.05', replicate: '~$0.036' },
  // Demucs models
  demucs: { fal: '~$0.01', replicate: '~$0.004' },
  htdemucs: { fal: '~$0.02', replicate: '~$0.008' },
  htdemucs_ft: { fal: '~$0.03', replicate: '~$0.012' },
  // Default fallback
  default: { fal: '~$0.02', replicate: '~$0.01' },
};

/**
 * Estimate the cost of a cloud inference job.
 *
 * @param provider - 'fal' or 'replicate'
 * @param model - The model ID being used
 * @returns A formatted cost string (e.g., "~$0.02")
 */
export function estimateCost(provider: 'fal' | 'replicate', model: string): string {
  const normalizedModel = model.toLowerCase();

  // Find the cost entry for this model
  const costEntry = COST_TABLE[normalizedModel] ?? COST_TABLE.default;

  return provider === 'fal' ? costEntry.fal : costEntry.replicate;
}

/**
 * Get the cost range description for a provider.
 *
 * @param provider - 'fal' or 'replicate'
 * @returns A description of the cost range
 */
export function getCostRangeDescription(provider: 'fal' | 'replicate'): string {
  if (provider === 'fal') {
    return '$0.01–$0.05 per run';
  }
  return '$0.004–$0.036 per run';
}
