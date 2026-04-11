/**
 * Shared dependency status parsing utility.
 *
 * Provides a discriminated-union parser for PackageStatus values returned
 * by the Rust backend's `validate_environment` command.
 */

import type { PackageStatus } from '@/lib/types';
import { hasPackageStatusKey, getPackageStatusValue } from '@/lib/types';

/** Possible dependency status values used in the UI. */
export type DepStatus = 'ok' | 'missing' | 'warning' | 'checking' | 'pending';

/**
 * Parse a PackageStatus discriminated union and return a normalized status
 * with an optional human-readable message.
 *
 * @param pkg - The PackageStatus value from the backend (string or object).
 * @param successMsg - Optional message to use when the dependency is available.
 * @returns An object with `status` and optional `message`.
 */
export function getDepStatus(
  pkg: PackageStatus | unknown,
  successMsg?: string
): { status: DepStatus; message?: string } {
  // Handle bare string form (Rust unit variant serializes as "available")
  if (typeof pkg === 'string') {
    if (pkg === 'available') return { status: 'ok', message: successMsg ?? 'Ready' };
    return { status: 'missing', message: 'Not configured' };
  }

  // Handle null/undefined
  if (!pkg || typeof pkg !== 'object') {
    return { status: 'missing', message: 'Not configured' };
  }

  // Handle object form (Rust tuple variants)
  if (hasPackageStatusKey(pkg, 'available')) {
    return { status: 'ok', message: successMsg ?? 'Ready' };
  }

  const unavailable = getPackageStatusValue(pkg, 'unavailable');
  if (unavailable !== undefined) return { status: 'warning', message: unavailable };

  const warning = getPackageStatusValue(pkg, 'warning');
  if (warning !== undefined) return { status: 'warning', message: warning };

  const missing = getPackageStatusValue(pkg, 'missing');
  if (missing !== undefined) return { status: 'missing', message: missing };

  return { status: 'warning', message: 'Unknown status' };
}