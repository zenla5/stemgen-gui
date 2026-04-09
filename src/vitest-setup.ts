import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock react-i18next to pass through translation keys in tests
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key;
      return Object.entries(params).reduce(
        (str, [k, v]) => str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
        key,
      );
    },
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  Trans: ({ children }: { children: unknown }) => children,
}));

// Define AudioContextState type for Web Audio API
type AudioContextState = 'suspended' | 'running' | 'closed';

// Mock Tauri API
vi.mock('@tauri-apps/api', () => ({
  invoke: vi.fn(),
  emit: vi.fn(),
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Web Audio API
class MockAudioContext {
  createMediaElementSource = vi.fn();
  createAnalyser = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteFrequencyData: vi.fn(),
    fftSize: 2048,
  }));
  decodeAudioData = vi.fn();
  destination: AudioDestinationNode = {} as AudioDestinationNode;
  sampleRate = 44100;
  state: AudioContextState = 'running';
  currentTime = 0;
  resume = vi.fn();
  suspend = vi.fn();
  close = vi.fn();
}

class MockMediaElement {
  src = '';
  load = vi.fn();
  play = vi.fn();
  pause = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

global.AudioContext = MockAudioContext as unknown as typeof AudioContext;
(global as Record<string, unknown>)['AudioBufferSourceNode'] = {};
(global as Record<string, unknown>)['MediaElementAudioSourceNode'] = MockMediaElement;
(global as Record<string, unknown>)['HTMLAudioElement'] = MockMediaElement;

// Mock HTMLMediaElement methods
Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
  get: () => 180,
});
Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
  get: () => 0,
  set: () => {},
});
