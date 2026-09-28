import { Injectable, signal, Signal } from '@angular/core';
import { DEFAULT_SETTINGS, QuoteWeaveSettings } from '../models/quote-weave.models';

const SETTINGS_STORAGE_KEY = 'quote-weave-settings';
const VALID_SPEEDS: ReadonlyArray<number> = [25, 50, 80];

@Injectable()
export class QuoteSettingsService {
  private readonly _settings = signal<QuoteWeaveSettings>({ ...DEFAULT_SETTINGS });

  readonly settings: Signal<QuoteWeaveSettings> = this._settings.asReadonly();

  constructor() {
    this.load();
  }

  setTypingSpeed(ms: number): void {
    if (!VALID_SPEEDS.includes(ms)) return;
    this._settings.update((s) => ({ ...s, typingSpeedMs: ms }));
    this.save();
  }

  setAutoAdvance(enabled: boolean): void {
    this._settings.update((s) => ({ ...s, autoAdvance: enabled }));
    this.save();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      const settings = this.parseSettings(parsed);
      if (settings) {
        this._settings.set(settings);
      }
    } catch {
      // Corrupt data or storage unavailable — keep defaults
    }
  }

  private save(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this._settings()));
    } catch {
      // localStorage unavailable — silently ignore
    }
  }

  private parseSettings(val: unknown): QuoteWeaveSettings | null {
    if (typeof val !== 'object' || val === null) return null;
    const obj = val as Record<string, unknown>;
    const valid =
      typeof obj['typingSpeedMs'] === 'number' &&
      VALID_SPEEDS.includes(obj['typingSpeedMs']) &&
      typeof obj['autoAdvance'] === 'boolean';
    if (!valid) return null;

    // Rebuild the object so old decorative settings (notably particlesEnabled)
    // migrate away instead of lingering in newly saved preferences.
    return {
      typingSpeedMs: obj['typingSpeedMs'] as number,
      autoAdvance: obj['autoAdvance'] as boolean,
    };
  }
}
