import { DEFAULT_SETTINGS } from '../types';

export const MIN_REVIEW_TIMING_MS = 1_000;
export const MAX_REVIEW_TIMING_MS = 300_000;

export function clampReviewTimingMs(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), MIN_REVIEW_TIMING_MS), MAX_REVIEW_TIMING_MS);
}

export function normalizeReviewDelayMs(value: number) {
  return clampReviewTimingMs(value, DEFAULT_SETTINGS.proactiveDelayMs);
}

export function normalizeReviewTimeoutMs(value: number) {
  return clampReviewTimingMs(value, DEFAULT_SETTINGS.proactiveCooldownMs);
}

export function timingMsToSeconds(value: number, fallback: number) {
  return clampReviewTimingMs(value, fallback) / 1_000;
}

export function secondsToTimingMs(value: number, fallback: number) {
  return clampReviewTimingMs(value * 1_000, fallback);
}
