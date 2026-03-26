import { describe, it, expect } from 'vitest';
import {
  cn,
  formatBytes,
  formatDuration,
  formatPercent,
  formatSampleRate,
  generateId,
  slugify,
  truncate,
  isAudioFile,
  getFileExtension,
  getFileNameWithoutExtension,
} from '../utils';

describe('cn', () => {
  it('merges class names correctly', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    const condition = false;
    const result = cn('foo', condition && 'bar', 'baz');
    expect(result).toContain('foo');
    expect(result).toContain('baz');
    expect(result).not.toContain('bar');
  });
});

describe('formatBytes', () => {
  it('formats 0 bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('formats bytes correctly', () => {
    expect(formatBytes(512)).toBe('512 Bytes');
  });

  it('formats kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1572864)).toBe('1.5 MB');
  });

  it('formats gigabytes correctly', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });
});

describe('formatDuration', () => {
  it('formats seconds correctly', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(30)).toBe('0:30');
    expect(formatDuration(90)).toBe('1:30');
  });

  it('formats hours correctly', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7200)).toBe('2:00:00');
  });

  it('pads minutes and seconds with zero', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3605)).toBe('1:00:05');
  });
});

describe('formatPercent', () => {
  it('formats percentage correctly', () => {
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(0.5)).toBe('50.0%');
    expect(formatPercent(1)).toBe('100.0%');
  });

  it('handles decimal places', () => {
    expect(formatPercent(0.123, 2)).toBe('12.30%');
    expect(formatPercent(0.1234, 0)).toBe('12%');
  });
});

describe('formatSampleRate', () => {
  it('formats sample rate correctly', () => {
    expect(formatSampleRate(44100)).toBe('44.1 kHz');
    expect(formatSampleRate(48000)).toBe('48.0 kHz');
    expect(formatSampleRate(96000)).toBe('96.0 kHz');
  });
});

describe('generateId', () => {
  it('generates unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('contains timestamp and random part', () => {
    const id = generateId();
    expect(id).toMatch(/^\d+-[a-z0-9]+$/);
  });
});

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('Hello! @World#')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world');
  });

  it('trims whitespace', () => {
    expect(slugify('  hello  ')).toBe('hello');
  });

  it('handles multiple spaces', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });
});

describe('truncate', () => {
  it('returns original string if shorter than max', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long strings', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('isAudioFile', () => {
  it('returns true for supported audio formats', () => {
    expect(isAudioFile('song.mp3')).toBe(true);
    expect(isAudioFile('song.flac')).toBe(true);
    expect(isAudioFile('song.wav')).toBe(true);
    expect(isAudioFile('song.ogg')).toBe(true);
    expect(isAudioFile('song.m4a')).toBe(true);
    expect(isAudioFile('song.aac')).toBe(true);
    expect(isAudioFile('song.aiff')).toBe(true);
    expect(isAudioFile('song.aif')).toBe(true);
    expect(isAudioFile('song.wma')).toBe(true);
    expect(isAudioFile('song.opus')).toBe(true);
  });

  it('returns false for unsupported formats', () => {
    expect(isAudioFile('video.mp4')).toBe(false);
    expect(isAudioFile('image.jpg')).toBe(false);
    expect(isAudioFile('document.pdf')).toBe(false);
  });

  it('handles case-insensitive extensions', () => {
    expect(isAudioFile('song.MP3')).toBe(true);
    expect(isAudioFile('song.FLAC')).toBe(true);
  });
});

describe('getFileExtension', () => {
  it('extracts file extension', () => {
    expect(getFileExtension('song.mp3')).toBe('mp3');
    expect(getFileExtension('song.tar.gz')).toBe('gz');
  });

  it('returns filename as extension when no dot present', () => {
    expect(getFileExtension('song')).toBe('song');
  });
});

describe('getFileNameWithoutExtension', () => {
  it('removes extension', () => {
    expect(getFileNameWithoutExtension('song.mp3')).toBe('song');
    expect(getFileNameWithoutExtension('archive.tar.gz')).toBe('archive.tar');
  });

  it('returns filename if no extension', () => {
    expect(getFileNameWithoutExtension('song')).toBe('song');
  });
});
