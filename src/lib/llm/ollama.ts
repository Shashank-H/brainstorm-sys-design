import type { AppSettings } from '../../types';
import { BaseLlmProvider, type LlmModelOption, type StreamLlmChatArgs } from './base';

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/\/+$/, '');
}

async function parseOllamaError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.error || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export type OllamaModelInfo = {
  name?: string;
  model?: string;
  capabilities?: string[];
};

function toModelOption(model: OllamaModelInfo): LlmModelOption | null {
  const value = model.name ?? model.model;
  if (!value) return null;
  return {
    value,
    label: value,
    supportsVision: Boolean(model.capabilities?.includes('vision')),
    metadata: model,
  };
}

type OllamaThinkingConfig = {
  think: false | 'low' | 'medium' | 'high';
};

export class OllamaProvider extends BaseLlmProvider {
  readonly id = 'ollama' as const;
  readonly name = 'Ollama';
  readonly metadata = {
    id: this.id,
    label: this.name,
    defaultEndpoint: 'http://localhost:11434',
    defaultModel: 'gemma4:e4b',
    requiresApiKey: false,
  } as const;

  private getThinkingConfig(settings: AppSettings): OllamaThinkingConfig {
    if (settings.thinkingLevel === 'off') return { think: false };
    return { think: settings.thinkingLevel };
  }

  async streamChat({ settings, messages, signal, onToken }: StreamLlmChatArgs) {
    const endpoint = normalizeEndpoint(settings.endpoint);
    const ollamaMessages = messages.map((message) => ({
      role: message.role,
      content: message.content,
      images: message.images?.map((image) => image.base64),
    }));

    const response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: settings.model,
        stream: true,
        ...this.getThinkingConfig(settings),
        options: { temperature: settings.temperature },
        messages: ollamaMessages,
      }),
    });

    if (!response.ok) {
      const error = await parseOllamaError(response);
      throw new Error(`Ollama request failed: ${error}`);
    }
    if (!response.body) {
      throw new Error('Ollama response did not include a stream.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const json = JSON.parse(trimmed) as { done?: boolean; message?: { content?: string }; response?: string; error?: string };
        if (json.error) throw new Error(json.error);
        const token = json.message?.content ?? json.response ?? '';
        if (token) onToken(token);
        if (json.done) return;
      }
    }
  }

  async listModels(settings: AppSettings): Promise<LlmModelOption[]> {
    const endpoint = normalizeEndpoint(settings.endpoint);
    const response = await fetch(`${endpoint}/api/tags`);
    if (!response.ok) throw new Error(await parseOllamaError(response));
    const data = (await response.json()) as { models?: OllamaModelInfo[] };

    return (data.models ?? [])
      .map(toModelOption)
      .filter((model): model is LlmModelOption => Boolean(model))
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async testConnection(settings: AppSettings) {
    const endpoint = normalizeEndpoint(settings.endpoint);
    const models = await this.listModels(settings);
    const selectedModel = models.find((model) => model.value === settings.model)?.metadata as OllamaModelInfo | undefined;

    const response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        stream: false,
        ...this.getThinkingConfig(settings),
        options: { temperature: settings.temperature },
        messages: [
          { role: 'system', content: 'Respond in one very brief sentence.' },
          { role: 'user', content: 'hi' },
        ],
      }),
    });

    if (!response.ok) {
      const error = await parseOllamaError(response);
      throw new Error(`Ollama chat test failed: ${error}`);
    }

    const data = (await response.json()) as { message?: { content?: string }; response?: string; error?: string };
    if (data.error) throw new Error(data.error);
    const responseText = (data.message?.content ?? data.response ?? '').trim();
    if (!responseText) throw new Error('Ollama chat test returned an empty response.');

    return {
      provider: this.id,
      providerName: this.name,
      supportsVision: Boolean(selectedModel?.capabilities?.includes('vision')),
      visionSupportKnown: true,
      selectedModel,
      responseText,
    };
  }
}
