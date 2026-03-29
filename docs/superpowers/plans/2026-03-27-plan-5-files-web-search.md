# OpenChat — Plan 5: Files & Web Search

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add drag-and-drop file attachment (text, PDF, image) and two-mode web search (manual 🌐 button and automatic tool calling) so users can ground conversations in local documents and live web results.

**Architecture:** File processing lives entirely in the Express backend — a new `POST /api/files/process` route reads uploaded bytes, dispatches to a text/PDF/image handler, and returns structured attachment data. Web search is a second backend route (`POST /api/search`) wrapping Brave/Tavily with automatic provider selection; the LM Studio client's `chatStream` is extended to emit tool-call events so the renderer can intercept, execute, and re-inject search results before the final answer token stream begins.

**Tech Stack:** existing stack plus `pdf-parse` (PDF text extraction), `multer` (multipart upload middleware), `sharp` (image base64 encoding), `highlight.js` (syntax highlighting in renderer).

---

## File Map

```
src/
  backend/
    db.ts                     — add settings table (API keys, auto_search per conversation)
    file-processor.ts         — per-type processing: text, pdf-parse, base64 image
    search-client.ts          — Brave + Tavily clients with automatic fallback
    routes/
      files.ts                — POST /api/files/process — multipart upload handler
      search.ts               — POST /api/search — provider dispatcher
      settings.ts             — GET/PUT /api/settings (API keys, defaults)
    index.ts                  — mount new routes
  renderer/
    api-client.ts             — add processFile, search, getSettings, setSetting
    components/
      ChatArea.tsx            — drop zone, attachment chips, 🌐 button, sources display
      AttachmentChip.tsx      — chip with × button and type icon
      FileBlock.tsx           — collapsible syntax-highlighted code/PDF block
      SourcesBlock.tsx        — collapsible Sources block for web search results
      Settings.tsx            — extend: Web Search panel (Brave/Tavily keys)
tests/
  backend/
    file-processor.test.ts   — text, PDF, image, scanned-PDF cases
    search-client.test.ts    — Brave success, Brave fail → Tavily, no keys → error
package.json                  — add pdf-parse, multer, sharp, highlight.js
```

---

## T-1 — Install dependencies and extend DB schema for settings

**Complexity:** S
**Depends on:** none

Add `pdf-parse`, `multer`, `sharp` to `package.json`. Add a `settings` table to `db.ts` (key/value text pairs). Add `getSetting` / `setSetting` to the `Db` interface. Store Brave API key, Tavily API key, and a default `auto_search` value. Add `auto_search` boolean column to `conversations`. All migrations use `IF NOT EXISTS` guards.

- `src/backend/db.ts` — settings table migration + getSetting/setSetting
- `package.json` — add new dependencies

**Done when:**
- `npm install` resolves without errors
- `getSetting('brave_api_key')` returns `undefined` on fresh DB
- `setSetting('brave_api_key', 'x')` then `getSetting` returns `'x'`
- Existing DB tests still pass

---

## T-2 — Backend: file processing service

**Complexity:** M
**Depends on:** T-1

`processFile(filename, buffer, mimeType)` returns a typed `AttachmentData` object. Three dispatch paths: (1) text/code — decode UTF-8, detect language from extension, return `{ type: 'text', language, content }`; (2) PDF — call `pdf-parse`, return `{ type: 'pdf', content }` or `{ type: 'pdf-unreadable' }` if extracted text is empty; (3) image — encode as base64 data-URI, return `{ type: 'image', dataUrl, mimeType }`. Route `POST /api/files/process` uses `multer` memory storage, iterates uploaded files, returns JSON array of `AttachmentData`.

- `src/backend/file-processor.ts` — processing logic
- `src/backend/routes/files.ts` — Express route
- `src/backend/index.ts` — mount route
- `tests/backend/file-processor.test.ts` — all dispatch paths including empty-PDF

**Done when:**
- `.py` file → `{ type: 'text', language: 'python', content: '...' }`
- Multi-page PDF → extracted text
- Scanned/empty PDF → `{ type: 'pdf-unreadable' }`
- `.png` → `{ type: 'image', dataUrl: 'data:image/png;base64,...' }`
- All tests pass

---

## T-3 — Backend: web search service

**Complexity:** M
**Depends on:** T-1

`createSearchClient(braveKey?, tavilyKey?)` returns a `SearchClient` with `search(query): Promise<SearchResult[]>`. Strategy: try Brave first (`https://api.search.brave.com/res/v1/web/search`); on non-2xx or missing key, fall back to Tavily; if both absent/failing, throw `SearchUnavailableError`. Route `POST /api/search` reads keys from DB settings per request, instantiates the client, returns results. Each `SearchResult` = `{ title, url, snippet }`.

- `src/backend/search-client.ts` — provider logic with fallback
- `src/backend/routes/search.ts` — Express route
- `src/backend/index.ts` — mount route
- `tests/backend/search-client.test.ts` — Brave success, Brave fail → Tavily, both absent → 503

**Done when:**
- With Brave key: returns array of `{ title, url, snippet }` objects
- With Brave absent but Tavily present: Tavily results returned
- Both absent: route returns 503 with `{ error: 'Web search not configured' }`
- Unit tests pass with mocked fetch

---

## T-4 — Settings UI for API keys

**Complexity:** S
**Depends on:** T-1

Add `GET /api/settings` and `PUT /api/settings/:key` routes in a new `settings.ts` router. Extend `Settings.tsx` (or create it) with a "Web Search" panel containing two password-masked inputs for Brave and Tavily API keys and a per-conversation "Enable automatic web search" toggle. Settings save immediately on blur/change via the PUT route.

- `src/backend/routes/settings.ts` — GET + PUT routes
- `src/renderer/components/Settings.tsx` — Web Search panel
- `src/renderer/api-client.ts` — `getSettings()`, `setSetting(key, value)`

**Done when:**
- Entering a Brave API key and blurring the input persists it across app restarts
- `GET /api/settings` returns `{ brave_api_key: '...', tavily_api_key: null }` on a DB with only Brave set
- Settings panel opens without crashing

---

## T-5 — Renderer: drag-and-drop and attachment chips

**Complexity:** M
**Depends on:** T-2

`ChatArea` gains full-window drag-and-drop: `dragenter` shows a dashed-border overlay "Drop files here"; `drop` calls `api.processFile(files)` for each file and stores results in `attachments` state. Each attachment renders as an `AttachmentChip` — a pill with filename, type icon, and × to remove. Unreadable PDFs show an amber warning chip. Images attached to a non-vision model (detect by model id keywords: `vision`, `llava`, `bakllava`, `moondream`) show an amber warning inside the chip. Add `processFile(files: File[])` to `api-client.ts` using `FormData`.

- `src/renderer/components/ChatArea.tsx` — drop zone, attachment state
- `src/renderer/components/AttachmentChip.tsx` — chip component
- `src/renderer/api-client.ts` — `processFile(files)` method

**Done when:**
- Dragging a `.ts` file shows a chip labelled `file.ts`
- Dragging a scanned PDF shows amber warning chip
- × on a chip removes it
- Dragging a `.png` with a non-vision model shows amber vision warning

---

## T-6 — Renderer: file content in message thread

**Complexity:** M
**Depends on:** T-5

On send with attachments: text/code → inject fenced block with language label before user text; PDF → inject `[PDF: filename]` plain block; image → include base64 dataUrl as OpenAI vision content part. In the thread, code/PDF attachments render as `FileBlock` — a collapsible block with language label header, collapsed by default if content > 20 lines, syntax-highlighted via `highlight.js`. Clear `attachments` state after successful send.

- `src/renderer/components/ChatArea.tsx` — serialize attachments into send payload
- `src/renderer/components/FileBlock.tsx` — collapsible syntax-highlighted block
- `src/backend/lmstudio-client.ts` — extend message content type for vision content parts

**Done when:**
- Sending a `.py` file renders a collapsed Python block in the user bubble with syntax colour
- Block header expands/collapses content
- Sending an image to a vision model does not crash the stream
- Attachment chips clear after send

---

## T-7 — Manual web search (🌐 button)

**Complexity:** M
**Depends on:** T-3, T-5

Add 🌐 button to input toolbar. When active (highlighted), at send time: call `api.search(userText)` first, prepend results as a system-context block to the messages array, then proceed with normal chat stream. Render search results in the thread as `SourcesBlock` — collapsible block with rows of title, snippet, and clickable URL (`window.open`). If no API keys are configured, show inline amber warning "Web search not configured — add keys in Settings" and send without search. Add `search(query)` to `api-client.ts`.

- `src/renderer/components/ChatArea.tsx` — 🌐 button, pre-send search call
- `src/renderer/components/SourcesBlock.tsx` — collapsible sources display
- `src/renderer/api-client.ts` — `search(query)` method

**Done when:**
- With 🌐 active, search results are injected before LLM response
- `SourcesBlock` appears above assistant response with title/snippet/URL rows
- No API keys → amber warning, message sent without search
- 🌐 button highlights when active

---

## T-8 — Automatic web search via tool calling

**Complexity:** L
**Depends on:** T-3, T-7

Extend `lmstudio-client.ts` so `chatStream` accepts an optional `tools` parameter (OpenAI function-calling schema for `web_search`). Extend the SSE parser to detect `finish_reason: 'tool_calls'` and emit a `{ type: 'tool_call', name, arguments }` event. Handle the tool-call loop server-side in the chat route: when a tool call for `web_search` is received, call `SearchClient`, format results, append a `tool` role message, continue the stream with a second LLM call. Emit a special `{ type: 'sources', results }` SSE event before the second stream begins; the renderer uses this to render a `SourcesBlock` alongside the assistant bubble. Automatic tool calling activates only when `auto_search` is true for the conversation and the model name suggests tool support.

- `src/backend/lmstudio-client.ts` — tools parameter + tool_call event parsing
- `src/backend/routes/lmstudio.ts` — server-side tool-call loop
- `src/renderer/components/ChatArea.tsx` — handle sources event, render SourcesBlock
- `tests/backend/lmstudio-client.test.ts` — add tool-call SSE parsing test

**Done when:**
- A tool-calling model autonomously invokes `web_search` and a `SourcesBlock` appears without 🌐 button interaction
- `auto_search = false` on the conversation disables the tool entirely
- Non-tool-calling models are unaffected (no tools schema sent)

---

## Parallelisation Guide

```
Track A (files):   T-1 ──► T-2 ──► T-5 ──► T-6
Track B (search):  T-1 ──► T-3 ──► T-7 ──► T-8
                   T-1 ──► T-4  (can overlap T-3)
```

T-4 can start immediately after T-1. Tracks A and B are fully independent after T-1. They converge only at T-7 (which needs T-5 for the input toolbar layout). T-8 is the only large sequential task and should begin after T-7 is verified.

Two-engineer split:
- Engineer A: T-1, T-2, T-5, T-6
- Engineer B: T-3, T-4, then join for T-7 and T-8
