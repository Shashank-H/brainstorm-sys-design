import type { ClipboardEvent, KeyboardEvent } from 'react';
import type { AppSettings } from '../types';

type UseMaskedApiKeyInputArgs = {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
};

function getSelection(input: HTMLInputElement) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  return { start, end };
}

function replaceRange(value: string, start: number, end: number, replacement: string) {
  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}

export function useMaskedApiKeyInput({ settings, onSettingsChange }: UseMaskedApiKeyInputArgs) {
  const displayValue = settings.apiKey ? '*'.repeat(settings.apiKey.length) : '';

  const updateApiKey = (apiKey: string, input?: HTMLInputElement, caretPosition?: number) => {
    onSettingsChange({ ...settings, apiKey });

    if (input && typeof caretPosition === 'number') {
      window.requestAnimationFrame(() => {
        input.setSelectionRange(caretPosition, caretPosition);
      });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const { start, end } = getSelection(input);

    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === 'Backspace') {
      event.preventDefault();
      const deleteStart = start === end ? Math.max(0, start - 1) : start;
      const nextValue = replaceRange(settings.apiKey, deleteStart, end, '');
      updateApiKey(nextValue, input, deleteStart);
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      const deleteEnd = start === end ? Math.min(settings.apiKey.length, end + 1) : end;
      const nextValue = replaceRange(settings.apiKey, start, deleteEnd, '');
      updateApiKey(nextValue, input, start);
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      const nextValue = replaceRange(settings.apiKey, start, end, event.key);
      updateApiKey(nextValue, input, start + event.key.length);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) return;

    const input = event.currentTarget;
    const { start, end } = getSelection(input);
    const nextValue = replaceRange(settings.apiKey, start, end, pastedText);
    updateApiKey(nextValue, input, start + pastedText.length);
  };

  const onChange = () => {
    // Input updates are handled in key/paste events so the real key never needs
    // to be rendered into a browser password field.
  };

  return {
    displayValue,
    onKeyDown,
    onPaste,
    onChange,
  };
}
