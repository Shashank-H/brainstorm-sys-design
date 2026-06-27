# Plan: Tauri diagramming app with local architecture brainstorming assistant

## Context

Build a desktop Tauri app for creating system-design and architecture diagrams. The main workspace should be an Excalidraw-style canvas, while a right-side assistant panel connects to a local local vision model and comments on the diagram, asks clarifying questions, points out tradeoffs, and helps the user brainstorm.

Initial repo scan: this repository is currently empty apart from `.git`, so this plan assumes a new app scaffold.

Excalidraw feasibility: yes, we can use Excalidraw as the base canvas inside Tauri by embedding the React package `@excalidraw/excalidraw` in a Tauri + Vite + React frontend. The current npm package is MIT-licensed and exports a React component. The older `excalidraw` package appears outdated; the plan should use `@excalidraw/excalidraw`.

## Approach

Use Tauri for the desktop shell, React/Vite for the UI, `@excalidraw/excalidraw` for the diagram canvas, and a right-side agent panel focused on understanding the diagram visually and proactively brainstorming with the user.

Recommended local model integration for the first version:

- Use Ollama only, targeting the local model tag `gemma4:e4b`.
- Keep the model client abstract enough to later support llama.cpp, LM Studio, or a custom local server.
- Make image understanding the primary input path: export the current Excalidraw canvas/scene to an image, send that image to Ollama with the user's prompt and agent instructions, and use structured Excalidraw scene data only as supporting context.
- Verify early that `gemma4:e4b` in Ollama accepts image inputs through the local API. If it does not, the app can still use Excalidraw, Tauri, and Ollama, but true image-based review would require either a vision-capable local model/tag or a fallback to structured-scene analysis.

## Files to modify

This repo is empty, so implementation will create a new project structure. Expected critical files:

- `package.json` — frontend scripts and dependencies.
- `src/` — React app source.
- `src/App.tsx` — main shell layout: canvas left, assistant right.
- `src/components/DiagramCanvas.tsx` — Excalidraw wrapper, scene-change handling, and export hooks.
- `src/components/AssistantPanel.tsx` — proactive agent UI, chat, suggestions, and streaming responses.
- `src/lib/diagramImage.ts` — export the current Excalidraw scene to an image/base64 payload for Ollama vision requests.
- `src/lib/diagramSummary.ts` — convert Excalidraw scene data into supporting metadata for the model.
- `src/lib/llm/` — local model provider interface and Ollama implementation for `gemma4:e4b`.
- `src-tauri/` — Tauri Rust app shell and permissions/capabilities.
- `src-tauri/tauri.conf.json` — app metadata, window config, security settings.

## Reuse

No reusable local code exists yet. External reuse:

- `@excalidraw/excalidraw` — embedded React diagram editor.
- Tauri — desktop app shell.
- Ollama local API for `gemma4:e4b`, using image-capable chat/generate requests if supported by the installed model.

## Steps

- [x] Scaffold a new Tauri + Vite + React + TypeScript app.
- [x] Add `@excalidraw/excalidraw` and render it in a full-height canvas container.
- [x] Create a two-pane layout with the Excalidraw canvas on the left and a persistent agent panel on the right.
- [x] Connect to local Ollama at the configured localhost endpoint and default the model setting to `gemma4:e4b`.
- [x] Build an Ollama client that supports streaming responses and image payloads.
- [x] Verify `gemma4:e4b` image-input behavior with a small exported test image before building the full agent flow. Result: image understanding works through Ollama `/api/chat` with real PNG payloads; documented in `OLLAMA_IMAGE_TEST.md`.
- [x] Implement `diagramImage` to export the current Excalidraw scene/canvas to PNG or WebP and convert it to the payload format Ollama expects.
- [x] Store diagram scene state locally and debounce scene-change events.
- [x] Implement lightweight `diagramSummary` metadata as secondary context: visible text labels, arrows/connectors, element count, groups, and obvious unlabeled components.
- [x] Implement manual "Review diagram" mode that sends the latest diagram image plus optional metadata to the agent.
- [x] Implement proactive mode: after drawing inactivity or meaningful scene changes, the model reviews the latest image and comments or asks a question when useful.
- [x] Add guardrails so proactive comments are rate-limited, non-spammy, and do not interrupt every small drawing action.
- [x] Prompt the model to behave as a brainstorming architecture reviewer: ask questions, identify assumptions, note risks, suggest improvements, and avoid overconfident claims.
- [x] Add local persistence for diagrams, chat sessions, agent settings, and proactive-review preferences.
- [x] Add app settings for Ollama endpoint, model name (`gemma4:e4b` by default), temperature, auto-review toggle, and privacy/local-only messaging.
- [ ] Package/test the Tauri desktop app. Blocked locally: Rust/Cargo is not installed in this environment.

## Verification

- [x] Run the React dev server and confirm the Vite app serves successfully. Full Tauri runtime check is blocked until Rust/Cargo is installed.
- [x] Create a sample architecture diagram and verify it exports to an image correctly. A generated PNG sample was created at `/tmp/sample_arch_diagram.png` for Ollama image testing; in-app Excalidraw export path is implemented and build-checked.
- [x] Connect to local Ollama with model `gemma4:e4b` and confirm manual chat works. Confirmed through HTTP API image/chat request.
- [x] Confirm `gemma4:e4b` can analyze a diagram image through Ollama; if not, document the limitation and switch to a vision-capable local model or structured-scene fallback. Confirmed working and documented in `OLLAMA_IMAGE_TEST.md`.
- [x] Confirm streaming responses render incrementally in the assistant panel by implementation and TypeScript build.
- [x] Confirm the assistant can review a diagram image and ask relevant system-design questions. Confirmed with a sample architecture PNG: model asked auth/data-consistency questions and identified latency/rate-limiting risks.
- [x] Confirm proactive review triggers only after meaningful changes/inactivity and does not spam the user by implementation guardrails.
- [x] Test offline behavior and clear error messaging when the local Ollama endpoint is unavailable by implementation.
- [x] Confirm diagrams and chats persist locally and do not leave the machine by implementation.

## Resolved decisions

- Runtime: Ollama only, running locally.
- Model: `gemma4:e4b`.
- Primary agent input: image understanding of the current diagram.
- Secondary agent input: structured Excalidraw metadata where useful.
- Interaction style: both manual review and proactive agent comments/questions.
- MVP focus: the agent experience; Excalidraw already covers the core diagramming experience.
