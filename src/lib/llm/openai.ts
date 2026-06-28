import type { AppSettings, LlmChatMessage } from '../../types';
import { BaseLlmProvider, type LlmModelOption, type StreamLlmChatArgs } from './base';

export type OpenAiModelInfo = {
  id?: string;
  object?: string;
};

function toModelOption(model: OpenAiModelInfo): LlmModelOption | null {
  if (!model.id) return null;
  return {
    value: model.id,
    label: model.id,
    metadata: model,
  };
}

function normalizeBaseUrl(endpoint: string) {
  return endpoint.replace(/\/+$/, '');
}

function authHeaders(settings: AppSettings): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = settings.apiKey.trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function parseOpenAiError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.error?.message || body?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function toOpenAiMessages(messages: LlmChatMessage[]) {
  return messages.map((message) => {
    if (!message.images?.length) {
      return { role: message.role, content: message.content };
    }

    return {
      role: message.role,
      content: [
        { type: 'text', text: message.content },
        ...message.images.map((image) => ({
          type: 'image_url',
          image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
        })),
      ],
    };
  });
}

type OpenAiChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  error?: { message?: string };
};

function extractOpenAiText(response: OpenAiChatCompletionResponse) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join('')
      .trim();
  }
  return '';
}

type OpenAiThinkingConfig = {
  /** OpenAI/GPT-5 style reasoning control. */
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
  /** OpenRouter-compatible reasoning control. */
  reasoning?: { effort?: 'low' | 'medium' | 'high'; exclude?: boolean; enabled?: boolean };
  /** OpenRouter/gateway hint to suppress returned reasoning blocks. */
  include_reasoning?: boolean;
};

function isOpenRouterEndpoint(endpoint: string) {
  return /openrouter\.ai/i.test(endpoint);
}

function supportsOpenAiReasoningEffort(model: string) {
  return /^(gpt-5|o\d|o[134]-|o4-|o3-)/i.test(model);
}

export class OpenAiCompatibleProvider extends BaseLlmProvider {
  readonly id = 'openai-compatible' as const;
  readonly name = 'OpenAI-compatible';
  readonly metadata = {
    id: this.id,
    label: this.name,
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresApiKey: true,
  } as const;

  private getThinkingConfig(settings: AppSettings): OpenAiThinkingConfig {
    if (isOpenRouterEndpoint(settings.endpoint)) {
      if (settings.thinkingLevel === 'off') {
        return { reasoning: { enabled: false, exclude: true }, include_reasoning: false };
      }

      return { reasoning: { effort: settings.thinkingLevel, exclude: true }, include_reasoning: false };
    }

    if (!supportsOpenAiReasoningEffort(settings.model)) return {};

    if (settings.thinkingLevel === 'off') return { reasoning_effort: 'minimal' };
    return { reasoning_effort: settings.thinkingLevel };
  }

  async streamChat({ settings, messages, signal, onToken }: StreamLlmChatArgs) {
    const baseUrl = normalizeBaseUrl(settings.endpoint);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(settings),
      signal,
      body: JSON.stringify({
        model: settings.model,
        stream: true,
        temperature: settings.temperature,
        ...this.getThinkingConfig(settings),
        messages: toOpenAiMessages(messages),
      }),
    });

    if (!response.ok) {
      const error = await parseOpenAiError(response);
      throw new Error(`OpenAI-compatible request failed: ${error}`);
    }
    if (!response.body) {
      throw new Error('OpenAI-compatible response did not include a stream.');
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
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice('data:'.length).trim();
        if (!data) continue;
        if (data === '[DONE]') return;

        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string | Array<{ type?: string; text?: string }> }; finish_reason?: string }>;
          error?: { message?: string };
        };
        if (json.error?.message) throw new Error(json.error.message);
        const content = json.choices?.[0]?.delta?.content;
        if (typeof content === 'string') {
          onToken(content);
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === 'text' && part.text) onToken(part.text);
          }
        }
      }
    }
  }

  async listModels(settings: AppSettings): Promise<LlmModelOption[]> {
    const baseUrl = normalizeBaseUrl(settings.endpoint);
    const response = await fetch(`${baseUrl}/models`, { headers: authHeaders(settings) });
    if (!response.ok) throw new Error(await parseOpenAiError(response));
    const data = (await response.json()) as { data?: OpenAiModelInfo[] };

    return (data.data ?? [])
      .map(toModelOption)
      .filter((model): model is LlmModelOption => Boolean(model))
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async testConnection(settings: AppSettings) {
    const baseUrl = normalizeBaseUrl(settings.endpoint);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(settings),
      body: JSON.stringify({
        model: settings.model,
        stream: false,
        temperature: Math.min(settings.temperature, 0.3),
        ...this.getThinkingConfig(settings),
        messages: [
          { role: 'system', content: 'Respond in one very brief sentence.' },
          { role: 'user', content: 'hi' },
        ],
      }),
    });

    if (!response.ok) {
      const error = await parseOpenAiError(response);
      throw new Error(`OpenAI-compatible chat completions test failed: ${error}`);
    }

    const data = (await response.json()) as OpenAiChatCompletionResponse;
    if (data.error?.message) throw new Error(data.error.message);
    const responseText = extractOpenAiText(data);
    if (!responseText) throw new Error('OpenAI-compatible chat completions test returned an empty response.');

    return {
      provider: this.id,
      providerName: this.name,
      supportsVision: true,
      visionSupportKnown: false,
      responseText,
    };
  }
}
