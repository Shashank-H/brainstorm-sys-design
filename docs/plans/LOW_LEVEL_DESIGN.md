# Low Level Design: Archimedes Agent

## 1. System overview

The app is a local-only desktop application composed of:

1. **Tauri shell** — desktop window, packaging boundary, future native storage/file APIs.
2. **React/Vite frontend** — all core UI and agent orchestration.
3. **Excalidraw canvas** — diagram editor embedded in the left pane.
4. **Agent panel** — persistent right pane for manual chat, image review, proactive comments, settings, and status.
5. **Ollama client** — local HTTP client targeting `http://localhost:11434` and model `gemma4:e4b`.
6. **Local persistence** — browser/Tauri webview local storage for diagrams, chat sessions, and settings.

No diagram or chat content is sent outside the configured local Ollama endpoint.

## 2. UI layout

```
+---------------------------------------------------------------+
| App shell                                                     |
| +--------------------------------------+--------------------+ |
| | Excalidraw canvas                    | Agent panel        | |
| |                                      | - status/settings  | |
| |                                      | - conversation     | |
| |                                      | - prompt box       | |
| |                                      | - Review button    | |
| |                                      | - auto-review      | |
| +--------------------------------------+--------------------+ |
+---------------------------------------------------------------+
```

Default split:

- Left canvas: flexible width, minimum 520px.
- Right agent panel: 380px, persistent.
- Full viewport height.

## 3. Core data models

### AppSettings

```ts
type AppSettings = {
  ollamaEndpoint: string; // default http://localhost:11434
  model: string;          // default gemma4:e4b
  temperature: number;    // default 0.3
  autoReview: boolean;    // default true
  proactiveDelayMs: number; // default 12000
  proactiveCooldownMs: number; // default 60000
};
```

### ChatMessage

```ts
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  kind?: 'chat' | 'manual-review' | 'proactive-review' | 'status' | 'error';
};
```

### DiagramSnapshot

```ts
type DiagramSnapshot = {
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  updatedAt: number;
};
```

### DiagramSummary

```ts
type DiagramSummary = {
  elementCount: number;
  textLabels: string[];
  arrows: Array<{ id: string; text?: string; startBoundElementId?: string; endBoundElementId?: string }>;
  groups: Record<string, number>;
  unlabeledElementCount: number;
  imageGeneratedAt: number;
};
```

## 4. Image export flow

Primary agent context is an image of the current diagram.

1. `DiagramCanvas` keeps the latest Excalidraw API instance and scene snapshot.
2. When review is requested, `diagramImage.ts` calls Excalidraw export utilities to produce a Blob.
3. The Blob is converted to base64 without a `data:image/png;base64,` prefix, matching Ollama image payload conventions.
4. The agent request includes:
   - system prompt
   - user message
   - diagram metadata summary
   - image base64 payload

Fallback:

- If image export fails, send structured summary only and surface a warning.
- If Ollama/model rejects image input, show a clear local-model limitation message.

## 5. Ollama client flow

Use Ollama local HTTP API.

Manual chat/review request shape:

```ts
POST /api/chat
{
  "model": "gemma4:e4b",
  "stream": true,
  "options": { "temperature": 0.3 },
  "messages": [
    { "role": "system", "content": "...architecture reviewer prompt..." },
    {
      "role": "user",
      "content": "Review this architecture diagram...\nMetadata: ...",
      "images": ["<base64 image>"]
    }
  ]
}
```

Streaming parser:

- Read `ReadableStream` chunks.
- Split newline-delimited JSON.
- Append `message.content` or `response` tokens to the active assistant message.
- Stop when `done: true` appears.

## 6. Agent behavior

The system prompt tells the model to:

- act as a collaborative architecture brainstorming partner;
- ask clarifying questions;
- identify assumptions, missing components, risks, bottlenecks, and tradeoffs;
- suggest improvements without being overconfident;
- keep proactive comments concise;
- reference visible diagram details when possible;
- admit uncertainty if the diagram/image is unclear.

## 7. Proactive review rules

Proactive review should feel helpful, not noisy.

Triggers:

- Excalidraw scene changed meaningfully.
- User has been inactive for `proactiveDelayMs`.
- Auto-review is enabled.

Guardrails:

- Do not run while another model request is active.
- Do not run if element count is too small, unless the user manually asks.
- Do not run more often than `proactiveCooldownMs`.
- Ignore tiny changes such as selection-only updates.
- Prefer one short question or observation rather than a full review.

## 8. Persistence

Use local storage keys:

- `archimedes-agent.settings.v1`
- `archimedes-agent.scene.v1`
- `archimedes-agent.chat.v1`

Persist:

- latest Excalidraw scene;
- chat history;
- settings;
- auto-review preferences.

## 9. Error handling

- Ollama unavailable: show "Cannot reach local Ollama at ..." with a suggestion to run `ollama serve`.
- Model missing: show suggestion to pull/run `gemma4:e4b`.
- Image unsupported: explain that the selected model may not support vision payloads and that the app can fallback to metadata-only review.
- Streaming interrupted: keep partial response and mark it as interrupted.

## 10. Verification checklist mapping

- Canvas usable: Excalidraw renders in Tauri/Vite.
- Image export: sample scene exports to PNG/WebP base64.
- Manual chat: prompt reaches Ollama and response streams.
- Manual review: image + metadata reaches model.
- Proactive review: triggers after inactivity and cooldown.
- Persistence: reload preserves scene, settings, chat.
