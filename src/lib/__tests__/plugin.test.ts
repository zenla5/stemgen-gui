import { describe, it, expect, beforeEach } from 'vitest';
import {
  BUILT_IN_FORMATS,
  PluginManagerImpl,
  getPluginManager,
} from '@/lib/plugin';

describe('Plugin System', () => {
  describe('BUILT_IN_FORMATS', () => {
    it('should have exactly 6 built-in formats', () => {
      expect(BUILT_IN_FORMATS).toHaveLength(6);
    });

    it('should include NI Stem format', () => {
      const niStem = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'ni-stem');
      expect(niStem).toBeDefined();
      expect(niStem?.manifest.name).toBe('NI Stem');
      expect(niStem?.hasMasterTrack).toBe(true);
      expect(niStem?.metadataAtomName).toBe('NI stem metadata v1.0');
    });

    it('should include Pioneer DJ format', () => {
      const pioneer = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'pioneer-stem');
      expect(pioneer).toBeDefined();
      expect(pioneer?.manifest.name).toBe('Pioneer DJ');
      expect(pioneer?.hasMasterTrack).toBe(false);
    });

    it('should include Serato DJ format', () => {
      const serato = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'serato-stem');
      expect(serato).toBeDefined();
      expect(serato?.manifest.name).toBe('Serato DJ');
      expect(serato?.stems[0].type).toBe('vocals');
    });

    it('should include Mixxx format', () => {
      const mixxx = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'mixxx-stem');
      expect(mixxx).toBeDefined();
      expect(mixxx?.manifest.author).toBe('Mixxx Community');
      expect(mixxx?.exportSettings.codec).toBe('alac');
    });

    it('should include djay Pro format', () => {
      const djay = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'djay-stem');
      expect(djay).toBeDefined();
      expect(djay?.manifest.author).toBe('Algoriddim');
    });

    it('should include VirtualDJ format', () => {
      const virtualdj = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'virtualdj-stem');
      expect(virtualdj).toBeDefined();
      expect(virtualdj?.manifest.author).toBe('Atomix VirtualDJ');
      expect(virtualdj?.stems[0].type).toBe('vocals');
    });

    it('should have valid manifest for each format', () => {
      BUILT_IN_FORMATS.forEach((format) => {
        expect(format.manifest.id).toBeTruthy();
        expect(format.manifest.name).toBeTruthy();
        expect(format.manifest.version).toBeTruthy();
        expect(format.manifest.author).toBeTruthy();
        expect(format.manifest.description).toBeTruthy();
      });
    });

    it('should have 4 stems for each format', () => {
      BUILT_IN_FORMATS.forEach((format) => {
        expect(format.stems).toHaveLength(4);
        const types = format.stems.map((s) => s.type);
        expect(types).toContain('drums');
        expect(types).toContain('bass');
        expect(types).toContain('other');
        expect(types).toContain('vocals');
      });
    });

    it('should have valid export settings for each format', () => {
      BUILT_IN_FORMATS.forEach((format) => {
        expect(format.exportSettings.codec).toBeTruthy();
        expect(format.exportSettings.sampleRate).toBe(44100);
        expect(format.exportSettings.channels).toBe(2);
      });
    });

    it('should have valid colors for each stem', () => {
      BUILT_IN_FORMATS.forEach((format) => {
        format.stems.forEach((stem) => {
          expect(stem.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        });
      });
    });
  });

  describe('PluginManagerImpl', () => {
    let manager: PluginManagerImpl;

    beforeEach(() => {
      manager = new PluginManagerImpl();
    });

    it('should get built-in formats', () => {
      const formats = manager.getBuiltInFormats();
      expect(formats).toHaveLength(6);
    });

    it('should return empty array for loaded plugins initially', () => {
      const plugins = manager.getLoadedPlugins();
      expect(plugins).toHaveLength(0);
    });

    it('should return undefined for non-existent plugin', () => {
      const plugin = manager.getPlugin('non-existent');
      expect(plugin).toBeUndefined();
    });
  });

  describe('getPluginManager singleton', () => {
    it('should return same instance', () => {
      const manager1 = getPluginManager();
      const manager2 = getPluginManager();
      expect(manager1).toBe(manager2);
    });
  });

  describe('Stem types', () => {
    it('should have standard stem order for NI/Pioneer', () => {
      const niStem = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'ni-stem');
      const pioneer = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'pioneer-stem');
      expect(niStem?.stems[0].type).toBe('drums');
      expect(niStem?.stems[1].type).toBe('bass');
      expect(niStem?.stems[2].type).toBe('other');
      expect(niStem?.stems[3].type).toBe('vocals');
      expect(pioneer?.stems[0].type).toBe('drums');
      expect(pioneer?.stems[1].type).toBe('bass');
    });

    it('should have vocals-first order for Serato/VirtualDJ', () => {
      const serato = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'serato-stem');
      const virtualdj = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'virtualdj-stem');
      expect(serato?.stems[0].type).toBe('vocals');
      expect(virtualdj?.stems[0].type).toBe('vocals');
    });
  });

  describe('Codec support', () => {
    it('should use ALAC for lossless formats', () => {
      const mixxx = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'mixxx-stem');
      expect(mixxx?.exportSettings.codec).toBe('alac');
    });

    it('should use AAC for compressed formats', () => {
      const niStem = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'ni-stem');
      expect(niStem?.exportSettings.codec).toBe('aac');
    });

    it('should have appropriate bitrates', () => {
      const niStem = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'ni-stem');
      expect(niStem?.exportSettings.bitrate).toBe(320);
      const pioneer = BUILT_IN_FORMATS.find((f) => f.manifest.id === 'pioneer-stem');
      expect(pioneer?.exportSettings.bitrate).toBe(256);
    });
  });
});
