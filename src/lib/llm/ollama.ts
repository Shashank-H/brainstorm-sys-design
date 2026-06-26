import type { AppSettings } from '../../types';

export type OllamaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
};

export type StreamChatArgs = {
  settings: AppSettings;
  messages: OllamaMessage[];
  signal?: AbortSignal;
  onToken: (token: string) => void;
};

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

export async function streamOllamaChat({ settings, messages, signal, onToken }: StreamChatArgs) {
  const response = await fetch(`${normalizeEndpoint(settings.ollamaEndpoint)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: settings.model,
      stream: true,
      options: { temperature: settings.temperature },
      messages,
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

export type OllamaModelInfo = {
  name?: string;
  model?: string;
  capabilities?: string[];
};

export async function testOllamaConnection(settings: AppSettings): Promise<{ models: OllamaModelInfo[]; selectedModel?: OllamaModelInfo; supportsVision: boolean }> {
  const response = await fetch(`${normalizeEndpoint(settings.ollamaEndpoint)}/api/tags`);
  if (!response.ok) throw new Error(await parseOllamaError(response));
  const data = (await response.json()) as { models?: OllamaModelInfo[] };
  const models = data.models ?? [];
  const selectedModel = models.find((model) => model.name === settings.model || model.model === settings.model);
  const supportsVision = Boolean(selectedModel?.capabilities?.includes('vision'));
  return { models, selectedModel, supportsVision };
}
