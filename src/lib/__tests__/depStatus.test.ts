import { describe, it, expect } from 'vitest';
import { getDepStatus } from '../depStatus';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getDepStatus', () => {
  // ── Test 1: Returns { status: 'ok' } for string 'available' ──

  it('returns ok for string "available"', () => {
    const result = getDepStatus('available');
    expect(result.status).toBe('ok');
    expect(result.message).toBe('Ready');
  });

  // ── Test 2: Returns { status: 'missing' } for an unrecognised string ──

  it('returns missing for unrecognised string', () => {
    const result = getDepStatus('unknown');
    expect(result.status).toBe('missing');
    expect(result.message).toBe('Not configured');
  });

  // ── Test 3: Returns { status: 'ok' } for { available: true } object variant ──

  it('returns ok for { available: true } object', () => {
    const result = getDepStatus({ available: true });
    expect(result.status).toBe('ok');
    expect(result.message).toBe('Ready');
  });

  // ── Test 4: Returns { status: 'missing' } for { missing: 'reason' } ──

  it('returns missing for { missing: "reason" }', () => {
    const result = getDepStatus({ missing: 'Python not found' });
    expect(result.status).toBe('missing');
    expect(result.message).toBe('Python not found');
  });

  // ── Test 5: Returns { status: 'warning' } for { warning: 'reason' } ──

  it('returns warning for { warning: "reason" }', () => {
    const result = getDepStatus({ warning: 'Old version detected' });
    expect(result.status).toBe('warning');
    expect(result.message).toBe('Old version detected');
  });

  // ── Test 6: Returns { status: 'warning' } for { unavailable: 'reason' } ──

  it('returns warning for { unavailable: "reason" }', () => {
    const result = getDepStatus({ unavailable: 'CUDA not available' });
    expect(result.status).toBe('warning');
    expect(result.message).toBe('CUDA not available');
  });

  // ── Test 7: Returns { status: 'missing' } for null / undefined ──

  it('returns missing for null', () => {
    const result = getDepStatus(null);
    expect(result.status).toBe('missing');
    expect(result.message).toBe('Not configured');
  });

  it('returns missing for undefined', () => {
    const result = getDepStatus(undefined);
    expect(result.status).toBe('missing');
    expect(result.message).toBe('Not configured');
  });

  // ── Test 8: successMsg is used as the message for the ok case ──

  it('uses successMsg as the message for ok case', () => {
    const result = getDepStatus('available', 'v3.12.0');
    expect(result.status).toBe('ok');
    expect(result.message).toBe('v3.12.0');
  });

  it('uses successMsg for object available variant', () => {
    const result = getDepStatus({ available: true }, 'Found and ready');
    expect(result.status).toBe('ok');
    expect(result.message).toBe('Found and ready');
  });

  // ── Test 9: Returns { status: 'warning', message: 'Unknown status' } for unknown object ──

  it('returns warning with "Unknown status" for unknown object', () => {
    const result = getDepStatus({ foo: 'bar' });
    expect(result.status).toBe('warning');
    expect(result.message).toBe('Unknown status');
  });

  // ── Test 10: Returns { status: 'missing' } for empty string ──

  it('returns missing for empty string', () => {
    const result = getDepStatus('');
    expect(result.status).toBe('missing');
    expect(result.message).toBe('Not configured');
  });
});