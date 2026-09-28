import { TestBed } from '@angular/core/testing';
import { QuoteSettingsService } from './quote-settings.service';
import { DEFAULT_SETTINGS } from '../models/quote-weave.models';

const STORAGE_KEY = 'quote-weave-settings';

describe('QuoteSettingsService', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [QuoteSettingsService] });
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('initializes with DEFAULT_SETTINGS when storage is empty', () => {
    const service = TestBed.inject(QuoteSettingsService);
    expect(service.settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('hydrates reading settings and drops the retired particles preference', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ typingSpeedMs: 25, autoAdvance: false, particlesEnabled: false })
    );
    const service = TestBed.inject(QuoteSettingsService);
    expect(service.settings()).toEqual({
      typingSpeedMs: 25,
      autoAdvance: false,
    });
  });

  it('falls back to defaults when stored payload is corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json');
    const service = TestBed.inject(QuoteSettingsService);
    expect(service.settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults when stored payload has invalid shape', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ typingSpeedMs: 'fast' }));
    const service = TestBed.inject(QuoteSettingsService);
    expect(service.settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults when typingSpeedMs is outside the allowed set', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ typingSpeedMs: 999, autoAdvance: true, particlesEnabled: true })
    );
    const service = TestBed.inject(QuoteSettingsService);
    expect(service.settings().typingSpeedMs).toBe(DEFAULT_SETTINGS.typingSpeedMs);
  });

  it('persists typing speed updates', () => {
    const service = TestBed.inject(QuoteSettingsService);
    service.setTypingSpeed(80);
    expect(service.settings().typingSpeedMs).toBe(80);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual(service.settings());
  });

  it('rejects typing speeds outside the allowed set', () => {
    const service = TestBed.inject(QuoteSettingsService);
    service.setTypingSpeed(123);
    expect(service.settings().typingSpeedMs).toBe(DEFAULT_SETTINGS.typingSpeedMs);
  });

  it('persists auto-advance toggle', () => {
    const service = TestBed.inject(QuoteSettingsService);
    service.setAutoAdvance(false);
    expect(service.settings().autoAdvance).toBe(false);
  });

  it('does not throw when localStorage.setItem throws (quota exhausted)', () => {
    const service = TestBed.inject(QuoteSettingsService);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      expect(() => service.setAutoAdvance(false)).not.toThrow();
      expect(service.settings().autoAdvance).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
