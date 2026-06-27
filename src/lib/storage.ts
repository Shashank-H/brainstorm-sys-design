import { DEFAULT_SETTINGS, type AppSettings, type ChatMessage, type DiagramSnapshot } from '../types';

const SETTINGS_KEY = 'archimedes-agent.settings.v1';
const SCENE_KEY = 'archimedes-agent.scene.v1';
const CHAT_KEY = 'archimedes-agent.chat.v1';
const LEGACY_SETTINGS_KEY = 'gemma-diagram.settings.v1';
const LEGACY_SCENE_KEY = 'gemma-diagram.scene.v1';
const LEGACY_CHAT_KEY = 'gemma-diagram.chat.v1';

function readJson<T>(key: string, fallback: T, legacyKey?: string): T {
  try {
    const raw = localStorage.getItem(key) ?? (legacyKey ? localStorage.getItem(legacyKey) : null);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);

    // Arrays must stay arrays. Spreading an array into an object turns
    // chat history into {0: ..., 1: ...}, which breaks messages.map().
    if (Array.isArray(fallback)) {
      return (Array.isArray(parsed) ? parsed : fallback) as T;
    }

    if (fallback && typeof fallback === 'object' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...fallback, ...parsed } as T;
    }

    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getBrowserTheme(): AppSettings['theme'] {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return DEFAULT_SETTINGS.theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function loadSettings(): AppSettings {
  return readJson<AppSettings>(SETTINGS_KEY, { ...DEFAULT_SETTINGS, theme: getBrowserTheme() }, LEGACY_SETTINGS_KEY);
}

export function saveSettings(settings: AppSettings) {
  writeJson(SETTINGS_KEY, settings);
}

export function loadScene(): DiagramSnapshot | null {
  return readJson<DiagramSnapshot | null>(SCENE_KEY, null, LEGACY_SCENE_KEY);
}

export function saveScene(snapshot: DiagramSnapshot) {
  writeJson(SCENE_KEY, snapshot);
}

export function loadChat(): ChatMessage[] {
  return readJson<ChatMessage[]>(CHAT_KEY, [], LEGACY_CHAT_KEY);
}

export function saveChat(messages: ChatMessage[]) {
  writeJson(CHAT_KEY, messages);
}
