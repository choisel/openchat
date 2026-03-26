# OpenChat — Design Specification
**Date:** 2026-03-26
**Status:** Approved

---

## Overview

OpenChat is a macOS desktop application that provides a Claude-like chat interface for interacting with local LLMs served by LM Studio. It features intelligent model routing, context management, file handling, web search, and system integrations.

---

## 1. Platform & Technology Stack

- **Platform:** Electron (macOS desktop app, distributable as .dmg)
- **Frontend:** React + TypeScript
- **Backend:** Express + TypeScript (spawned as child process by the Electron main process)
- **Database:** SQLite via `better-sqlite3` (conversations, settings, history)
- **Streaming:** Server-Sent Events (SSE) for LLM token streaming
- **LM Studio integration:** OpenAI-compatible REST API at `localhost:1234`

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Electron App                       │
│                                                     │
│  ┌─────────────────┐     ┌──────────────────────┐  │
│  │  Main Process   │     │  Renderer Process    │  │
│  │  (Node.js)      │◄───►│  (React frontend)    │  │
│  │                 │ IPC │                      │  │
│  │  - Window mgmt  │     │  - Chat UI           │  │
│  │  - App lifecycle│     │  - Sidebar           │  │
│  │  - Tray/menubar │     │  - File drag & drop  │  │
│  └────────┬────────┘     │  - Context bar       │  │
│           │              └──────────┬───────────┘  │
│           │ spawn                   │ HTTP/SSE      │
│           ▼                         │               │
│  ┌─────────────────┐               │               │
│  │  Express Server │◄──────────────┘               │
│  │  (localhost)    │                               │
│  │                 │                               │
│  │  - LLM Router   │                               │
│  │  - LM Studio    │                               │
│  │    proxy        │                               │
│  │  - File handler │                               │
│  │  - Web search   │                               │
│  │  - Shell/AS     │                               │
│  │    executor     │                               │
│  └────────┬────────┘                               │
└───────────┼─────────────────────────────────────────┘
            │
            ▼
    ┌───────────────┐
    │   LM Studio   │
    │  OpenAI API   │
    │  :1234        │
    └───────────────┘
```

The Express backend runs on a dynamically assigned localhost port. The Electron main process spawns it at startup, communicates the port to the renderer via IPC. The renderer consumes the backend exclusively via HTTP/SSE.

**Backend startup failure:** If the Express server fails to start (port conflict, crash), the main process shows a fatal error dialog and exits the app.

---

## 3. Conversation Management

- **Multiple conversations** with persistent history stored in SQLite
- Each conversation stores: name, creation date, assigned model or "auto", message history, settings (auto-compact threshold, etc.)
- **Temporary sessions:** created with one click, stored in memory only, not persisted to SQLite, discarded on close. Displayed in the sidebar with a ⚡ icon and italic name. Cannot be recovered after a crash. Can be promoted to a persistent conversation via a "Save conversation" action.
- Conversations listed in sidebar with current token count badge
- Search across conversation titles and content

---

## 4. Intelligent Model Routing

### Discovery
The app polls LM Studio every 30 seconds to discover loaded models via `GET /v1/models`. The list updates dynamically. Model metadata (parameter count, name) is stored locally for routing decisions.

### Model selector
Located in the **top bar**, per-conversation level. Options:
- **Auto** — routing logic applies (default)
- **[model name]** — manual override, routing bypassed for this conversation

### Routing logic by model count

| Models loaded | Behavior |
|---|---|
| 1 | Direct — use the only available model, no routing |
| 2 | Heuristic — see below |
| 3 | Router pattern — smallest model acts as router |
| 4+ | Extended routing — router selects from the full pool |

### 2-model heuristic
1. **Name-based classification:** Check model names against known keywords:
   - Coding model keywords: `code`, `coder`, `starcoder`, `codellama`, `deepseek-coder`, `wizardcoder`
   - General/instruct keywords: everything else
   - If exactly one model matches coding keywords and the other does not → route coding questions to the coding model, all others to the general model
   - If both models match coding keywords, or neither does → fall through to step 2
2. **No recognizable pattern (or ambiguous):** The smallest model (by parameter count from metadata) receives the user's message and both model names/descriptions, then returns the name of the most appropriate model. This is a one-shot call that returns a model name, subject to the same router failure handling as the 3-model case.

### 3+ model router protocol
The router (smallest model) receives:
- The user's message (current turn only, not full history)
- The list of available non-router model names

It responds with a single string: the exact name of the model to use.

**Router failure handling:**
- If the response is not a valid model name from the current list → fall back to the largest available non-router model
- If the router times out (>5s) → same fallback
- If the named model is no longer loaded → fall back to the largest available model
- All fallbacks are silent (no user notification unless it happens 3+ times in a row, then show a warning)

---

## 5. Context Management

### Token counting
- **User messages:** token count estimated immediately at send time using a 4:1 character-to-token ratio. After the model responds, the estimate is updated to the exact `usage.prompt_tokens` value from the API response.
- **Assistant messages (streaming):** estimated in real-time using the 4:1 ratio as tokens arrive. Updated to the exact `usage.completion_tokens` value from the final SSE `[DONE]` event if LM Studio includes usage data.
- **Context window size** (denominator in context bar): retrieved from `/v1/models` metadata; if unavailable, defaults to a user-configurable value in Settings (default: 4096).

### A — Context bar
Real-time visual indicator in the top bar: `12k / 32k` with a progress bar.
- 0–69%: neutral grey
- 70–89%: amber
- 90–100%: red

### B — Manual compaction
"Compact" button in the top bar. Flow:
1. App sends a summarization prompt to the current model: "Summarize the following conversation history into a dense, structured summary preserving all key facts, decisions, and context: [history]"
2. On success: summary replaces all messages except the last 4 (configurable in Settings). A `[Compacted — N messages summarized]` marker is inserted.
3. On failure (timeout >30s, or HTTP error from LM Studio): original messages are preserved unchanged. An error notification is shown: "Compaction failed — conversation unchanged."
4. Compaction does not fire while a response is streaming. If triggered during streaming, it queues and fires after the stream completes.

### C — Auto-compaction
Triggers when context usage exceeds a configurable threshold (default: 80%, configurable per conversation in Settings).
- User receives an in-app toast notification 5 seconds before it fires, with a "Cancel" option
- If a new message is sent during the 5-second window, the queued compaction is cancelled (the new stream will re-evaluate the threshold when it completes — but will not re-arm within the same stream cycle to avoid a toast loop once above threshold)
- Does not trigger mid-stream — waits for current generation to finish
- Can be disabled per conversation
- Uses the same compaction flow as manual compaction (B), including same failure handling

### D — Tokens per message
Each message bubble shows its token cost as small grey text below it. Streaming messages show a live-updating estimate; final count shown after stream completes.

### E — Conversation fork
Any message has a "Fork" action (hover → right-click menu). Creates a new **persistent** conversation branching from that message point, copying all prior history. If forked from a temporary session, the content is promoted to a persistent conversation (the parent temporary session is unaffected and remains temporary). The forked conversation inherits:
- Model assignment (Auto or manual) from the parent
- Auto-compact enabled/disabled state
- Auto-compact threshold
Both conversations are fully independent after the fork.

---

## 6. File Handling (Drag & Drop)

### Supported inputs
- **Text/code files** (txt, md, py, js, ts, json, yaml, etc.) — content inserted inline with language label and syntax highlighting
- **PDFs** — text extracted via `pdf-parse` npm library. If extraction returns empty content (scanned/image-only PDF), show a warning: "Could not extract text from this PDF (possibly scanned). Try an image-capable model." Do not insert empty content silently.
- **Images** — sent as vision input if the active model supports it (detected from model metadata). If the model does not support vision, show a warning and offer to describe the image via a vision-capable model if one is loaded.
- **Multiple files** — all dropped at once, each processed and attached as separate chips above the input before sending

### UI
- Input area accepts file drops at any time (full-window drop zone activates on drag-over)
- Attached files appear as chips above the input before sending, with a × to remove
- Code files render with language label and collapsible syntax-highlighted block in the message thread

---

## 7. Web Search

### Providers
- **Primary: Brave Search API** — used for most queries (fast, predictable, API key required, configured in Settings)
- **Fallback/complex: Tavily API** — used when Brave fails or when the router LLM classifies the query as requiring deep research context (API key configured in Settings)
- Provider selection is automatic and transparent to the user; both API keys are optional (web search is disabled if neither is configured)

### Manual mode
A 🌐 button in the input toolbar triggers a web search. Results are injected into the context before the LLM responds.

### Automatic mode (tool calling)
When the active model supports tool/function calling, web search is registered as a tool. The model decides when to invoke it. Results appear inline as a collapsible "Sources" block in the message thread.

Both modes active by default. Automatic mode can be toggled per conversation.

---

## 8. System Integrations

All integrations require explicit user confirmation before first execution. Confirmed commands/apps can be added to a permissions allowlist.

### Shell commands
- The LLM proposes shell commands in a distinct styled block with a "Run" button
- Working directory: user's home directory by default; configurable in Settings
- Timeout: 30 seconds by default; configurable in Settings
- stdout and stderr are both streamed back into the conversation, visually differentiated (stderr in amber)
- A "Stop" button cancels the running process (SIGTERM, then SIGKILL after 2s)
- Permissions: allowlist of glob patterns (e.g., `git *`, `npm *`) that skip confirmation

### AppleScript / macOS Shortcuts
- Same confirmation and allowlist pattern as shell commands
- Allowlist entries are app names (e.g., "Finder", "Calendar")
- Timeout: 10 seconds

### Permissions UI
A dedicated "Permissions" panel in Settings lists:
- Shell command allowlist (glob patterns, with add/remove)
- AppleScript app allowlist (app names, with add/remove)
- Default working directory for shell commands
- Shell command timeout

---

## 9. UI Design

### Theme
Clear Dark — macOS-native dark palette:
- Background: `#1c1c1e`
- Surfaces: `#2c2c2e`
- Elevated surfaces: `#3a3a3c`
- Primary text: `#e5e5ea`
- Secondary text: `#8e8e93`
- Muted text: `#48484a`
- Accent: `#636366` (no purple/violet)
- Success/connected: `#32d74b`
- Warning: `#ff9f0a`
- Error: `#ff453a`

### Layout
- **Left sidebar** (220px fixed): conversation list with token badge, search bar, LM Studio status, settings link
- **Top bar**: conversation name (editable on double-click), model selector dropdown (Auto / model names), context bar, Compact + Fork buttons
- **Message area**: user messages right-aligned in `#2c2c2e` bubble; assistant messages left-aligned with avatar and model name label above
- **Input area** (style Claude):
  - Rounded rectangle, `#2c2c2e` background
  - Top: textarea with placeholder "Message..."
  - Bottom row left: `+` button → opens tool picker (file upload, web search toggle, shell, AppleScript)
  - Bottom row right: send button (↑)

### Streaming
Responses stream token by token with a blinking cursor. A "Stop" button appears in the top bar during generation (sends abort signal to the SSE connection).

### Token annotations
Small `#48484a` text below each message bubble: `124 tokens` (user) / `486 tokens` (assistant).

### UI language
All UI strings in English.

---

## 10. Settings

Accessible from sidebar bottom link. Panels:

| Panel | Contents |
|---|---|
| General | App language, default model selector value, temp session auto-save prompt |
| LM Studio | API base URL (default: `http://localhost:1234`), polling interval |
| Web Search | Brave API key, Tavily API key |
| Context | Default auto-compact threshold (%), messages preserved after compaction |
| Permissions | Shell allowlist, AppleScript allowlist, working directory, shell timeout |
| About | Version, links |

---

## 11. LM Studio Connection

- Status indicator in sidebar bottom: green dot (connected), red dot (unreachable)
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Model list refreshed every 30 seconds
- If LM Studio goes offline mid-conversation: banner shown, pending requests cancelled gracefully with error message in thread

---

## 12. Git Workflow

The project uses git from day one. A commit is made after each coherent, working increment — enough code to be meaningful and testable, small enough to be reviewable in one sitting. No micro-commits, no waiting for full features.

---

## 13. Out of Scope (v1)

- Voice input (not included in v1)
- File browser / project tree (planned for v2)
- Mobile / web deployment
- Multi-user / shared conversations
- Plugin system
- Cloud sync of conversations
