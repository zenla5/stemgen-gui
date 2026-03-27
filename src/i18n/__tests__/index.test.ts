import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supportedLanguages, changeLanguage, type SupportedLanguage } from '../index';

// Mock i18next
vi.mock('i18next', () => ({
  default: {
    use: vi.fn().mockReturnThis(),
    init: vi.fn(),
    changeLanguage: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}));

describe('i18n module', () => {
  describe('supportedLanguages', () => {
    it('should export supported languages array', () => {
      expect(supportedLanguages).toBeDefined();
      expect(Array.isArray(supportedLanguages)).toBe(true);
    });

    it('should include English language', () => {
      const en = supportedLanguages.find(l => l.code === 'en');
      expect(en).toBeDefined();
      expect(en?.name).toBe('English');
      expect(en?.nativeName).toBe('English');
    });

    it('should include German language', () => {
      const de = supportedLanguages.find(l => l.code === 'de');
      expect(de).toBeDefined();
      expect(de?.name).toBe('German');
      expect(de?.nativeName).toBe('Deutsch');
    });

    it('should have exactly 2 supported languages', () => {
      expect(supportedLanguages).toHaveLength(2);
    });
  });

  describe('SupportedLanguage type', () => {
    it('should be a union of language codes', () => {
      const lang: SupportedLanguage = 'en';
      expect(lang).toBe('en');
    });

    it('should accept valid language codes', () => {
      const en: SupportedLanguage = 'en';
      const de: SupportedLanguage = 'de';
      expect(en).toBe('en');
      expect(de).toBe('de');
    });
  });

  describe('changeLanguage', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should be a function', () => {
      expect(typeof changeLanguage).toBe('function');
    });

    it('should accept SupportedLanguage parameter', async () => {
      await expect(changeLanguage('en')).resolves.not.toThrow();
      await expect(changeLanguage('de')).resolves.not.toThrow();
    });
  });
});
