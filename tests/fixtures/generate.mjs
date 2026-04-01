#!/usr/bin/env node
/**
 * Generate fixture audio files for binary E2E tests.
 * Requires ffmpeg to be installed and on PATH.
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, 'audio');

if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

console.log('Generating fixture audio files...');

// 2-second 44.1kHz mono WAV with 440Hz sine tone
execSync(
  `ffmpeg -y -f lavfi -i "sine=frequency=440:duration=2" -ar 44100 -ac 1 "${dir}/test-short.wav"`,
  { stdio: 'pipe' }
);
console.log('  ✓ test-short.wav');

// Corrupt WAV (truncated to first 100 bytes)
execSync(
  process.platform === 'win32'
    ? `powershell -Command "Get-Content '${dir}/test-short.wav' -AsByteStream -TotalCount 100 | Set-Content '${dir}/corrupt.wav' -AsByteStream"`
    : `head -c 100 "${dir}/test-short.wav" > "${dir}/corrupt.wav"`,
  { stdio: 'pipe' }
);
console.log('  ✓ corrupt.wav');

// Accented filename (copy of test-short.wav)
execSync(
  process.platform === 'win32'
    ? `copy /y "${dir}\\test-short.wav" "${dir}\\test-accented-eau.wav" >nul`
    : `cp "${dir}/test-short.wav" "${dir}/test-accented-eau.wav"`,
  { stdio: 'pipe' }
);
console.log('  ✓ test-accented-eau.wav');

console.log('Done.');
