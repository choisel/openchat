# OpenChat — Plan 2: Chat & Streaming

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up the full chat loop so a user can type a message, receive a streamed token-by-token response with a blinking cursor, stop generation at any time, and see live token counts per message and a context bar showing total context usage.

**Architecture:** The Express backend gains a `POST /api/chat/:conversationId` SSE endpoint that pipes LM Studio tokens directly to the renderer; the renderer consumes this stream via `fetch` with `ReadableStream`, accumulates tokens into a live assistant bubble, and uses a shared token-counting utility (4:1 character ratio, updated to exact API usage on stream end) to drive both per-message annotations and the context bar. The model selector is a controlled dropdown in the top bar that reads the `api.listModels()` result polled every 30 seconds and patches the conversation's `model` field on change.

**Tech Stack:** Electron 29, React 18, TypeScript 5, Express 4, better-sqlite3, Vitest — no new dependencies required.

---

## File Map

```
src/
  backend/
    db.ts                        — add updateMessageTokens helper
    routes/
      conversations.ts           — add PATCH /:id and POST /:id/messages
      lmstudio.ts                — add POST /api/chat/:conversationId SSE endpoint
  renderer/
    lib/
      tokens.ts                  — pure token estimation utilities
    api-client.ts                — add streamChat, sendMessage, updateConversationModel
    components/
      App.tsx                    — lift models state, 30s poll
      ChatArea.tsx               — replace stub with full chat implementation
      MessageBubble.tsx          — single message with token annotation
      TopBar.tsx                 — title, model selector, context bar, Stop button
      ContextBar.tsx             — visual progress bar with colour thresholds
      ModelSelector.tsx          — Auto + loaded model names dropdown
tests/
  backend/
    chat.test.ts                 — SSE endpoint: tokens, abort, persistence
    conversations.test.ts        — extend: PATCH model update, POST message
  renderer/
    tokens.test.ts               — estimateTokens, contextPercent, contextColor
```

---

## T-1 — Backend: persist messages and expose PATCH model

**Complexity:** S
**Depends on:** none

The conversations route currently has no way to update a conversation's model field and no route to persist a message from the client. Add `PATCH /api/conversations/:id` to allow updating `model` (and `name`), and `POST /api/conversations/:id/messages` to persist a message before or after a stream. Also add `updateMessageTokens(id, tokens)` to `db.ts` so the chat endpoint can correct token counts after the stream finishes with exact usage data.

- `src/backend/db.ts` — add `updateMessageTokens(id, tokens)` method
- `src/backend/routes/conversations.ts` — add PATCH /:id and POST /:id/messages routes
- `tests/backend/conversations.test.ts` — cover PATCH model update, POST message, token correction

**Done when:**
- `PATCH /api/conversations/:id` with `{ model: "phi-2" }` returns 200 with updated conversation
- `POST /api/conversations/:id/messages` with `{ role: "user", content: "hi", tokens: 0 }` returns 201 with the persisted message
- `updateMessageTokens` updates the tokens column; verifiable via `db.getMessages()`
- All new tests pass

---

## T-2 — Backend: SSE chat streaming endpoint

**Complexity:** M
**Depends on:** T-1

Add `POST /api/chat/:conversationId` to `lmstudio.ts`. The endpoint reads the conversation's model from DB (falls back to first loaded model if "auto"), loads full message history to build the LM Studio request, sets SSE headers, calls `lmClient.chatStream()` and emits each token as `data: {"type":"token","content":"..."}`, emits a final `data: {"type":"done","usage":{...}}` on completion, and handles client disconnect by aborting the upstream request via `AbortController`. On LM Studio error it emits `data: {"type":"error","message":"..."}`. After the done event, calls `db.updateMessageTokens()` if exact usage is available.

- `src/backend/routes/lmstudio.ts` — new POST /api/chat/:conversationId route
- `src/backend/index.ts` — pass `db` into `createLmStudioRouter` if not already
- `tests/backend/chat.test.ts` — SSE sequence with mocked LM Studio, abort, error path

**Done when:**
- `POST /api/chat/1` with a seeded conversation produces token events followed by a done event
- Client disconnect triggers AbortController (verified by spy on `lmClient.chatStream`)
- LM Studio 503 causes `{"type":"error"}` SSE event
- All tests pass

---

## T-3 — Frontend: token utility

**Complexity:** S
**Depends on:** none (parallel with T-1 and T-2)

Create `src/renderer/lib/tokens.ts` with three pure functions: `estimateTokens(text)` returns `Math.ceil(text.length / 4)`; `contextPercent(used, total)` returns a 0–100 clamped ratio; `contextColor(percent)` returns the design-spec colour (`#636366` below 70, `#ff9f0a` at 70–89, `#ff453a` at 90+).

- `src/renderer/lib/tokens.ts` — pure utility module
- `tests/renderer/tokens.test.ts` — boundary values at 69/70/89/90, MoE notation, unknown ids

**Done when:**
- `estimateTokens("hello world")` returns 3
- `contextColor(69)` → `#636366`, `contextColor(70)` → `#ff9f0a`, `contextColor(90)` → `#ff453a`
- All tests pass

---

## T-4 — Frontend: api-client extensions

**Complexity:** S
**Depends on:** T-1

Extend `api-client.ts` with: `sendMessage(conversationId, role, content, tokens)` → `POST /api/conversations/:id/messages`; `updateConversationModel(conversationId, model)` → `PATCH /api/conversations/:id`; `streamChat(conversationId, onToken, onDone, onError, signal)` that opens a `fetch` stream, reads SSE line by line, and dispatches to callbacks. `streamChat` accepts an `AbortSignal` for cancellation.

- `src/renderer/api-client.ts` — add sendMessage, updateConversationModel, streamChat

**Done when:**
- TypeScript compiles without errors
- `streamChat` signature accepts `AbortSignal` and `onDone` receives `{ usage?: { prompt_tokens, completion_tokens } }`
- `sendMessage` and `updateConversationModel` return typed `Message` and `Conversation`

---

## T-5 — Frontend: MessageBubble and ContextBar components

**Complexity:** S
**Depends on:** T-3

`MessageBubble` renders a single message: user messages right-aligned in `#2c2c2e` bubble; assistant messages left-aligned with model-name label above; small `#48484a` token annotation below each bubble; blinking cursor when `isStreaming` is true. `ContextBar` renders `Xk / Yk` text and a progress bar using `contextColor()` from T-3.

- `src/renderer/components/MessageBubble.tsx` — new component
- `src/renderer/components/ContextBar.tsx` — new component
- `src/renderer/styles/global.css` — add `@keyframes blink` cursor animation

**Done when:**
- User bubble is right-aligned, assistant bubble left-aligned with label — visually verifiable
- With `isStreaming={true}`, blinking cursor is visible
- Context bar turns amber at 70%, red at 90% — visually verifiable

---

## T-6 — Frontend: ModelSelector and TopBar components

**Complexity:** S
**Depends on:** T-4

`ModelSelector` is a `<select>` showing "Auto" first then loaded model ids; on change calls `api.updateConversationModel()` and raises `onModelChange`. `TopBar` composes: editable conversation title (double-click → edit, Enter/blur → save via PATCH), `ModelSelector`, `ContextBar`, and a "Stop" pill button (red border, visible only when `isStreaming`) that calls `onStop`.

- `src/renderer/components/ModelSelector.tsx` — new component
- `src/renderer/components/TopBar.tsx` — new component

**Done when:**
- Dropdown shows "Auto" plus each model from `api.listModels()` — verifiable with LM Studio running
- Changing model triggers `PATCH /api/conversations/:id` — verifiable via DevTools Network
- Stop button renders only while `isStreaming` is true

---

## T-7 — Frontend: ChatArea full implementation

**Complexity:** L
**Depends on:** T-2, T-4, T-5, T-6

Replace the stub `ChatArea` with the full implementation. Local state: `messages`, `streamingContent`, `isStreaming`, `abortController`, `usedTokens`, `contextWindow`. On send: persist user message via `sendMessage()`, append to local state, call `streamChat()`. On token: accumulate into `streamingContent`, update `usedTokens`. On done: persist assistant message with exact token count, clear `streamingContent`, set `isStreaming = false`. On error: show inline error, set `isStreaming = false`. Stop button calls `abortController.abort()`. Auto-scroll to bottom on each new token. On conversation switch: load messages from API and reset stream state. Pass `usedTokens` and `contextWindow` to `TopBar`.

- `src/renderer/components/ChatArea.tsx` — replace stub
- `src/renderer/components/App.tsx` — add 30s model poll, pass `models` to ChatArea

**Done when:**
- Typing a message and sending displays user bubble, then streams assistant response with blinking cursor
- Token annotation updates from estimate to exact count after stream ends
- Context bar `used / total` updates in real time
- Stop halts the stream, persists partial response, Stop button disappears
- Switching conversations loads correct history
- LM Studio offline mid-stream shows inline error without crashing

---

## Parallelisation Guide

```
Track A:  T-1 ──► T-2 ─────────────────────────────────────┐
Track B:  T-3 ──► T-5 ──────────────────────────────────── ►  T-7
Track C:  T-1 ──► T-4 ──► T-6 ──────────────────────────────┘
```

- T-1 and T-3 start immediately, in parallel
- T-2 starts after T-1; T-4 starts after T-1 (can overlap T-2)
- T-5 starts after T-3; T-6 starts after T-4
- T-7 waits for T-2, T-4, T-5, T-6
