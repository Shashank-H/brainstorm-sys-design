import type { AppSettings } from '../types';

export function settingsValidationKey(settings: AppSettings) {
  return [settings.provider, settings.endpoint, settings.model, settings.apiKey, settings.temperature, settings.thinkingLevel].join('\u001f');
}
