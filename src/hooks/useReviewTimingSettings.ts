import { useEffect, useState } from 'react';
import type { AppSettings } from '../types';
import { normalizeReviewDelayMs, normalizeReviewTimeoutMs, secondsToTimingMs, timingMsToSeconds } from '../lib/reviewTiming';

type UseReviewTimingSettingsArgs = {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
};

export function useReviewTimingSettings({ settings, onSettingsChange }: UseReviewTimingSettingsArgs) {
  const proactiveDelaySeconds = timingMsToSeconds(settings.proactiveDelayMs, settings.proactiveDelayMs);
  const proactiveTimeoutSeconds = timingMsToSeconds(settings.proactiveCooldownMs, settings.proactiveCooldownMs);
  const [draftDelaySeconds, setDraftDelaySeconds] = useState(String(proactiveDelaySeconds));
  const [draftTimeoutSeconds, setDraftTimeoutSeconds] = useState(String(proactiveTimeoutSeconds));

  useEffect(() => {
    setDraftDelaySeconds(String(proactiveDelaySeconds));
    setDraftTimeoutSeconds(String(proactiveTimeoutSeconds));
  }, [proactiveDelaySeconds, proactiveTimeoutSeconds]);

  const resetDraft = () => {
    setDraftDelaySeconds(String(proactiveDelaySeconds));
    setDraftTimeoutSeconds(String(proactiveTimeoutSeconds));
  };

  const saveReviewTiming = () => {
    onSettingsChange({
      ...settings,
      proactiveDelayMs: secondsToTimingMs(Number(draftDelaySeconds), settings.proactiveDelayMs),
      proactiveCooldownMs: secondsToTimingMs(Number(draftTimeoutSeconds), settings.proactiveCooldownMs),
    });
  };

  return {
    proactiveDelayMs: normalizeReviewDelayMs(settings.proactiveDelayMs),
    proactiveCooldownMs: normalizeReviewTimeoutMs(settings.proactiveCooldownMs),
    proactiveDelaySeconds,
    proactiveTimeoutSeconds,
    draftDelaySeconds,
    draftTimeoutSeconds,
    updateDraftDelaySeconds: setDraftDelaySeconds,
    updateDraftTimeoutSeconds: setDraftTimeoutSeconds,
    resetDraft,
    saveReviewTiming,
  };
}
