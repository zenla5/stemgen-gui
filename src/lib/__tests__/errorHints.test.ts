import { describe, it, expect } from 'vitest';
import { formatJobError } from '@/lib/errorHints';

describe('formatJobError', () => {
  it('appends Setup Wizard hint for "No module named" errors', () => {
    const result = formatJobError("No module named 'demucs'");
    expect(result).toContain('No module named');
    expect(result).toContain('Setup Wizard');
  });

  it('appends Setup Wizard hint for "Python not found" errors', () => {
    const result = formatJobError('Python not found. Please install Python 3.9 or later.');
    expect(result).toContain('Python not found');
    expect(result).toContain('Setup Wizard');
  });

  it('passes through arbitrary error strings without adding a hint', () => {
    const result = formatJobError('Separation process failed with exit code: 1');
    expect(result).toBe('Separation process failed with exit code: 1');
    expect(result).not.toContain('Setup Wizard');
  });

  it('appends Setup Wizard hint for ModuleNotFoundError', () => {
    const result = formatJobError('ModuleNotFoundError: No module named torch');
    expect(result).toContain('Setup Wizard');
  });

  it('is case-insensitive when matching keywords', () => {
    const result = formatJobError('ERROR: no module named DEMUCS');
    expect(result).toContain('Setup Wizard');
  });

  // TASK-015: Tests for soundfile keyword
  it('appends Setup Wizard hint for soundfile ModuleNotFoundError', () => {
    const result = formatJobError("ModuleNotFoundError: No module named 'soundfile'");
    expect(result).toContain('soundfile');
    expect(result).toContain('Setup Wizard');
  });

  it('appends Setup Wizard hint for soundfile ImportError', () => {
    const result = formatJobError("ImportError: cannot import name 'soundfile'");
    expect(result).toContain('Setup Wizard');
  });

  it('does not modify unrelated error strings', () => {
    const result = formatJobError('Network connection failed');
    expect(result).toBe('Network connection failed');
    expect(result).not.toContain('Setup Wizard');
  });

  it('still returns hint for demucs errors (regression guard)', () => {
    const result = formatJobError("ModuleNotFoundError: No module named 'demucs'");
    expect(result).toContain('demucs');
    expect(result).toContain('Setup Wizard');
  });
});
