import { describe, it, expect } from 'vitest';
import {
  STEM_COLORS,
  STEM_DEFAULT_NAMES,
  NI_STEM_COLORS,
  DJ_SOFTWARE_PRESETS,
  AI_MODELS,
  SUPPORTED_AUDIO_FORMATS,
  SUPPORTED_FORMATS,
  QUALITY_PRESETS,
  OUTPUT_FORMATS,
  THEMES,
  DEVICE_OPTIONS,
  DEFAULT_PROCESSING_SETTINGS,
  KEYBOARD_SHORTCUTS,
  APP_VERSION,
  APP_INFO,
} from '../constants';

describe('constants', () => {
  describe('STEM_COLORS', () => {
    it('should have all stem types with valid hex colors', () => {
      expect(STEM_COLORS.drums).toMatch(/^#[0-9A-F]{6}$/i);
      expect(STEM_COLORS.bass).toMatch(/^#[0-9A-F]{6}$/i);
      expect(STEM_COLORS.other).toMatch(/^#[0-9A-F]{6}$/i);
      expect(STEM_COLORS.vocals).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should have distinct colors for each stem', () => {
      const colors = Object.values(STEM_COLORS);
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(colors.length);
    });
  });

  describe('STEM_DEFAULT_NAMES', () => {
    it('should have human-readable names for all stems', () => {
      expect(STEM_DEFAULT_NAMES.drums).toBe('Drums');
      expect(STEM_DEFAULT_NAMES.bass).toBe('Bass');
      expect(STEM_DEFAULT_NAMES.other).toBe('Other');
      expect(STEM_DEFAULT_NAMES.vocals).toBe('Vocals');
    });
  });

  describe('NI_STEM_COLORS', () => {
    it('should be an alias for STEM_COLORS', () => {
      expect(NI_STEM_COLORS).toBe(STEM_COLORS);
    });
  });

  describe('DJ_SOFTWARE_PRESETS', () => {
    it('should have 6 DJ software presets', () => {
      expect(DJ_SOFTWARE_PRESETS).toHaveLength(6);
    });

    it('should include traktor preset', () => {
      const traktor = DJ_SOFTWARE_PRESETS.find(p => p.id === 'traktor');
      expect(traktor).toBeDefined();
      expect(traktor?.codec).toBe('alac');
      expect(traktor?.stem_order).toEqual(['drums', 'bass', 'other', 'vocals']);
    });

    it('should include rekordbox preset', () => {
      const rekordbox = DJ_SOFTWARE_PRESETS.find(p => p.id === 'rekordbox');
      expect(rekordbox).toBeDefined();
      expect(rekordbox?.codec).toBe('aac');
    });

    it('should include serato preset with different order', () => {
      const serato = DJ_SOFTWARE_PRESETS.find(p => p.id === 'serato');
      expect(serato).toBeDefined();
      expect(serato?.stem_order).toEqual(['vocals', 'drums', 'bass', 'other']);
    });

    it('should include mixxx preset', () => {
      const mixxx = DJ_SOFTWARE_PRESETS.find(p => p.id === 'mixxx');
      expect(mixxx).toBeDefined();
      expect(mixxx?.codec).toBe('alac');
    });

    it('should include djay preset', () => {
      const djay = DJ_SOFTWARE_PRESETS.find(p => p.id === 'djay');
      expect(djay).toBeDefined();
      expect(djay?.codec).toBe('aac');
    });

    it('should include virtualdj preset', () => {
      const virtualdj = DJ_SOFTWARE_PRESETS.find(p => p.id === 'virtualdj');
      expect(virtualdj).toBeDefined();
      expect(virtualdj?.stem_order).toEqual(['vocals', 'drums', 'bass', 'other']);
    });
  });

  describe('AI_MODELS', () => {
    it('should have 4 AI models', () => {
      expect(AI_MODELS).toHaveLength(4);
    });

    it('should include demucs model', () => {
      const demucs = AI_MODELS.find(m => m.id === 'demucs');
      expect(demucs).toBeDefined();
      expect(demucs?.quality).toBe('draft');
      expect(demucs?.speed).toBe('fast');
    });

    it('should include bs_roformer model', () => {
      const bsRoformer = AI_MODELS.find(m => m.id === 'bs_roformer');
      expect(bsRoformer).toBeDefined();
      expect(bsRoformer?.quality).toBe('standard');
      expect(bsRoformer?.speed).toBe('medium');
    });

    it('should include htdemucs model', () => {
      const htdemucs = AI_MODELS.find(m => m.id === 'htdemucs');
      expect(htdemucs).toBeDefined();
      expect(htdemucs?.quality).toBe('standard');
      expect(htdemucs?.speed).toBe('slow');
    });

    it('should include htdemucs_ft model', () => {
      const htdemucsFt = AI_MODELS.find(m => m.id === 'htdemucs_ft');
      expect(htdemucsFt).toBeDefined();
      expect(htdemucsFt?.quality).toBe('master');
      expect(htdemucsFt?.speed).toBe('slow');
    });
  });

  describe('SUPPORTED_AUDIO_FORMATS', () => {
    it('should include common audio formats', () => {
      expect(SUPPORTED_AUDIO_FORMATS).toContain('mp3');
      expect(SUPPORTED_AUDIO_FORMATS).toContain('flac');
      expect(SUPPORTED_AUDIO_FORMATS).toContain('wav');
      expect(SUPPORTED_AUDIO_FORMATS).toContain('ogg');
      expect(SUPPORTED_AUDIO_FORMATS).toContain('m4a');
      expect(SUPPORTED_AUDIO_FORMATS).toContain('aac');
      expect(SUPPORTED_AUDIO_FORMATS).toContain('aiff');
      expect(SUPPORTED_AUDIO_FORMATS).toContain('wma');
      expect(SUPPORTED_AUDIO_FORMATS).toContain('opus');
    });
  });

  describe('SUPPORTED_FORMATS', () => {
    it('should be an alias for SUPPORTED_AUDIO_FORMATS', () => {
      expect(SUPPORTED_FORMATS).toBe(SUPPORTED_AUDIO_FORMATS);
    });
  });

  describe('QUALITY_PRESETS', () => {
    it('should have 3 quality presets', () => {
      expect(QUALITY_PRESETS).toHaveLength(3);
    });

    it('should include draft preset', () => {
      const draft = QUALITY_PRESETS.find(p => p.id === 'draft');
      expect(draft).toBeDefined();
      expect(draft?.model).toBe('demucs');
    });

    it('should include standard preset', () => {
      const standard = QUALITY_PRESETS.find(p => p.id === 'standard');
      expect(standard).toBeDefined();
      expect(standard?.model).toBe('bs_roformer');
    });

    it('should include master preset', () => {
      const master = QUALITY_PRESETS.find(p => p.id === 'master');
      expect(master).toBeDefined();
      expect(master?.model).toBe('htdemucs_ft');
    });
  });

  describe('OUTPUT_FORMATS', () => {
    it('should have 2 output formats', () => {
      expect(OUTPUT_FORMATS).toHaveLength(2);
    });

    it('should include ALAC format', () => {
      const alac = OUTPUT_FORMATS.find(f => f.id === 'alac');
      expect(alac).toBeDefined();
      expect(alac?.extension).toBe('.m4a');
    });

    it('should include AAC format', () => {
      const aac = OUTPUT_FORMATS.find(f => f.id === 'aac');
      expect(aac).toBeDefined();
      expect(aac?.extension).toBe('.m4a');
    });
  });

  describe('THEMES', () => {
    it('should have 3 theme options', () => {
      expect(THEMES).toHaveLength(3);
    });

    it('should include light, dark, and system themes', () => {
      expect(THEMES.map(t => t.id)).toContain('light');
      expect(THEMES.map(t => t.id)).toContain('dark');
      expect(THEMES.map(t => t.id)).toContain('system');
    });
  });

  describe('DEVICE_OPTIONS', () => {
    it('should have 3 device options', () => {
      expect(DEVICE_OPTIONS).toHaveLength(3);
    });

    it('should include cuda, mps, and cpu options', () => {
      expect(DEVICE_OPTIONS.map(d => d.id)).toContain('cuda');
      expect(DEVICE_OPTIONS.map(d => d.id)).toContain('mps');
      expect(DEVICE_OPTIONS.map(d => d.id)).toContain('cpu');
    });
  });

  describe('DEFAULT_PROCESSING_SETTINGS', () => {
    it('should have all required settings', () => {
      expect(DEFAULT_PROCESSING_SETTINGS.model).toBe('bs_roformer');
      expect(DEFAULT_PROCESSING_SETTINGS.device).toBe('cuda');
      expect(DEFAULT_PROCESSING_SETTINGS.outputFormat).toBe('alac');
      expect(DEFAULT_PROCESSING_SETTINGS.qualityPreset).toBe('standard');
      expect(DEFAULT_PROCESSING_SETTINGS.djPreset).toBe('traktor');
      expect(DEFAULT_PROCESSING_SETTINGS.cpuThreads).toBe(4);
      expect(DEFAULT_PROCESSING_SETTINGS.gpuEnabled).toBe(true);
      expect(DEFAULT_PROCESSING_SETTINGS.normalizeAudio).toBe(true);
      expect(DEFAULT_PROCESSING_SETTINGS.preserveOriginal).toBe(true);
    });
  });

  describe('KEYBOARD_SHORTCUTS', () => {
    it('should have all defined shortcuts', () => {
      expect(KEYBOARD_SHORTCUTS['ctrl+o']).toBe('Open file');
      expect(KEYBOARD_SHORTCUTS['ctrl+s']).toBe('Start processing');
      expect(KEYBOARD_SHORTCUTS['ctrl+b']).toBe('Toggle sidebar');
      expect(KEYBOARD_SHORTCUTS['ctrl+,']).toBe('Open settings');
      expect(KEYBOARD_SHORTCUTS['ctrl+q']).toBe('Quit application');
      expect(KEYBOARD_SHORTCUTS['1']).toBe('Go to Files');
      expect(KEYBOARD_SHORTCUTS['2']).toBe('Go to Queue');
      expect(KEYBOARD_SHORTCUTS['3']).toBe('Go to Mixer');
      expect(KEYBOARD_SHORTCUTS['4']).toBe('Go to Settings');
      expect(KEYBOARD_SHORTCUTS['space']).toBe('Play/Pause preview');
      expect(KEYBOARD_SHORTCUTS['delete']).toBe('Remove selected');
      expect(KEYBOARD_SHORTCUTS['escape']).toBe('Cancel current action');
    });
  });

  describe('APP_VERSION', () => {
    it('should be a valid version string', () => {
      expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('APP_INFO', () => {
    it('should have all required properties', () => {
      expect(APP_INFO.name).toBe('Stemgen-GUI');
      expect(APP_INFO.version).toBe(APP_VERSION);
      expect(APP_INFO.description).toBeTruthy();
      expect(APP_INFO.repository).toContain('github.com');
    });
  });
});
