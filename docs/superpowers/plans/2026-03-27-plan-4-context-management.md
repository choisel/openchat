# OpenChat — Plan 4: Context Management

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add temporary sessions (in-memory only, promotable to persistent), exact token tracking per message, a context bar, manual and auto-compaction with a summarization prompt, and conversation forking from any message point.

**Architecture:** Temporary sessions live entirely in a React-side in-memory store keyed by a `tmp-` prefixed string ID, never touching the Express backend; promotion flushes them to SQLite via existing routes. Compaction is a new backend route that calls the LM Studio chat endpoint, mutates messages in SQLite, and returns the updated message list; the frontend orchestrates the 5-second toast logic. Forking is a single backend route that bulk-inserts copied messages into a new conversation row.

**Tech Stack:** Existing stack only — no new runtime dependencies.

---

## File Map

```
src/
  backend/
    db.ts                          — add context_window, auto_compact_threshold, auto_compact_enabled columns;
                                     updateMessageTokens helper; addCompactedMarker; forkConversation; updateConversation
    lmstudio-client.ts             — add non-streaming summarize(prompt, model, signal) method
    routes/
      conversations.ts             — add PATCH /:id, POST /:id/compact, POST /:id/fork, POST /promote
      lmstudio.ts                  — extend GET /models to pass through context_length metadata
  renderer/
    temp-session-store.ts          — in-memory TempSession map + useTempSessions hook
    api-client.ts                  — add compactConversation, forkConversation, promoteSession,
                                     updateConversation, updateMessageTokens
    components/
      App.tsx                      — wire temp sessions into selected state; promote flow
      Sidebar.tsx                  — ⚡ icon + italic for temp sessions; "Save conversation" action
      ChatArea.tsx                 — context bar; Compact button; Fork action; auto-compact toast
      CompactToast.tsx             — 5-second countdown toast with Cancel button
tests/
  backend/
    db.test.ts                     — extend: new schema fields, helpers
    conversations.test.ts          — extend: PATCH, compact, fork, promote routes
    compaction.test.ts             — compaction success, timeout, HTTP error paths
```

---

## T-1 — Database schema extensions

**Complexity:** S
**Depends on:** none

Add three columns to `conversations`: `context_window INTEGER DEFAULT 4096`, `auto_compact_threshold REAL DEFAULT 0.8`, `auto_compact_enabled INTEGER DEFAULT 1`. Add `exact_tokens INTEGER` (nullable) to `messages` to distinguish confirmed API counts from estimates. Add helpers: `addCompactedMarker(conversationId, summaryMessageCount)` inserts a `role='system'` marker row; `updateMessageTokens(id, exact)` writes `exact_tokens`; `forkConversation(id, fromMessageId)` creates a new conversation and bulk-inserts messages up to the given id; `updateConversation(id, fields)` for PATCH support. All migrations use `ALTER TABLE … ADD COLUMN IF NOT EXISTS` guards.

- `src/backend/db.ts` — schema migration and new helpers

**Done when:**
- New db.test.ts assertions pass covering all columns and helpers
- Existing tests are unaffected

---

## T-2 — Backend: PATCH, fork, promote routes

**Complexity:** S
**Depends on:** T-1

`PATCH /api/conversations/:id` updates any subset of `{ name, model, context_window, auto_compact_threshold, auto_compact_enabled }`. `POST /api/conversations/:id/fork` with `{ fromMessageId }` creates a new conversation inheriting model and auto-compact settings with all messages up to and including the given id; returns the new conversation. `POST /api/conversations/promote` accepts `{ name, model, messages[] }` from an in-memory session and creates a persistent conversation; returns the new conversation with id.

- `src/backend/routes/conversations.ts` — three new route handlers
- `tests/backend/conversations.test.ts` — one test per route

**Done when:**
- PATCH with `{ name: "renamed" }` returns 200 with updated name
- Fork returns 201 with a new conversation id and correct message count
- Promote returns 201 with a fresh persistent conversation

---

## T-3 — Backend: compaction route

**Complexity:** M
**Depends on:** T-1

`POST /api/conversations/:id/compact` reads the message list, builds the summarization prompt, calls `lmstudio-client.summarize()` with a 30-second AbortSignal. On success: deletes all but the last `keep` messages (default 4), inserts the summary at the head, inserts the `[Compacted — N messages summarized]` marker, returns `{ messages: Message[] }`. On timeout or HTTP error: returns 422 with `{ error: "compaction_failed" }` leaving the DB untouched. Add `summarize(prompt, model, signal)` to `LmStudioClient` — non-streaming POST to `/v1/chat/completions` that resolves to the content string.

- `src/backend/lmstudio-client.ts` — `summarize` method
- `src/backend/routes/conversations.ts` — `POST /:id/compact` handler
- `tests/backend/compaction.test.ts` — success, timeout (mocked), HTTP error paths

**Done when:**
- Compact on 10 messages returns summary + last 4 + marker (7 total rows)
- Compact when LM Studio returns 500 → 422, DB unchanged
- Compact on timeout → 422, DB unchanged

---

## T-4 — Temporary session store

**Complexity:** S
**Depends on:** none (parallel)

`TempSessionStore` is a singleton `Map<string, TempSession>`. A `TempSession` has `id` (format `tmp-<uuid>`), `name`, `model`, `messages[]`, `createdAt`. Methods: `create()`, `get(id)`, `addMessage(id, msg)`, `updateLastMessageTokens(id, exact)`, `delete(id)`, `promote(id)` returns `{ name, model, messages }`. Never serialised to disk. `useTempSessions()` hook provides reactive access via `useState` triggered by store mutations.

- `src/renderer/temp-session-store.ts` — store singleton + React context + hook

**Done when:**
- `create()` + `get(id)` returns session with same id
- `addMessage` appends to messages array
- `promote()` returns correct payload
- No network call is made at any point

---

## T-5 — Context window metadata from /v1/models

**Complexity:** S
**Depends on:** none (parallel)

LM Studio's model objects include `context_length`. Add `context_length?: number` to `LmModel` in `lmstudio-client.ts`. Pass it through in the `/api/lmstudio/models` route (no logic change). Update the renderer's `LmModel` type. The frontend uses this as the context bar denominator, falling back to the conversation's `context_window` setting if absent.

- `src/backend/lmstudio-client.ts` — add field to LmModel type
- `src/renderer/api-client.ts` — update LmModel type

**Done when:**
- `GET /api/lmstudio/models` includes `context_length` when LM Studio provides it
- TypeScript compiles without errors

---

## T-6 — Sidebar: temp session display and "Save conversation"

**Complexity:** S
**Depends on:** T-4

Sidebar renders both persistent conversations and temp sessions. Temp sessions show with ⚡ prefix and italic font. Each temp session entry has a "Save conversation" context-menu action that calls `store.promote(id)` then `api.promoteSession(payload)` and switches selection to the new persistent id. Add a "New temp session" button (⚡) alongside the existing "+ New conversation" button.

- `src/renderer/components/Sidebar.tsx` — temp entry rendering, ⚡ button, promote action
- `src/renderer/components/App.tsx` — split new-conversation handlers; wire `useTempSessions`

**Done when:**
- Creating a temp session shows it with ⚡ and italic name
- "Save conversation" produces a new persistent entry and removes the temp entry
- Persistent conversations are unaffected

---

## T-7 — Token badge per message bubble

**Complexity:** S
**Depends on:** T-1, T-4

Each bubble shows `exact_tokens` if present, else `tokens` (estimate), as small `#48484a` 11px text aligned to the same side as the bubble. During streaming: annotation updates live as `Math.ceil(content.length / 4)`. After stream completes and `updateMessageTokens` is called, bubble re-renders with the exact count. Same pattern for temp sessions via `store.updateLastMessageTokens`.

- `src/renderer/components/ChatArea.tsx` — token annotation in bubble render; live estimate during stream

**Done when:**
- Each bubble shows a token count after send
- Count updates in real time during streaming
- After stream: count reflects exact API usage value (or estimate if usage absent)

---

## T-8 — Context bar in top bar

**Complexity:** S
**Depends on:** T-5, T-7

Top bar shows `Xk / Yk` with a colour-coded progress bar. `used` = sum of all message tokens for the current conversation (preferring `exact_tokens`). `window` = `context_length` from loaded model metadata if available, else conversation's `context_window`. Colour: grey below 70%, amber 70–89%, red 90–100%. Numbers formatted as `Xk` (÷1000, one decimal, drop `.0`). Recalculated on every messages change. Works for both persistent and temp sessions.

- `src/renderer/components/ChatArea.tsx` — context bar render and colour logic

**Done when:**
- Top bar shows correct `Xk / Yk` with colour-coded bar
- Updates after each message send or stream completion
- Switches to amber at 70%, red at 90%

---

## T-9 — Manual compaction flow

**Complexity:** M
**Depends on:** T-3, T-8

A "Compact" button in the top bar with four states: `idle`, `queued` (clicked during stream — shows clock icon), `running` (shows spinner), `error`. Clicking while idle calls `POST /api/conversations/:id/compact`. On success: replace message list, recalculate context bar. On failure: show non-blocking "Compaction failed — conversation unchanged" error banner. Clicking while streaming: transitions to `queued`, fires automatically when stream's `onComplete` fires. Clicking again while `queued` cancels the queue.

- `src/renderer/components/ChatArea.tsx` — Compact button state machine, queue logic
- `src/renderer/api-client.ts` — `compactConversation(id, keep?)`

**Done when:**
- Compact replaces message list on success
- Compact during stream → queued → fires after stream ends
- Failed compact shows error banner; message list unchanged
- Context bar updates after successful compaction

---

## T-10 — Auto-compaction with toast

**Complexity:** M
**Depends on:** T-9, T-8

After each stream completion, evaluate `usedTokens / contextWindow >= threshold`. If true and `auto_compact_enabled`, mount `CompactToast` — a 5-second countdown at the bottom of the message area with "Auto-compacting in 5s…" and "Cancel". On cancel: unmount, set `autoCompactArmedThisStream = true` (prevents re-arming same stream cycle). On new message sent while toast visible: unmount toast, cancel compaction. On countdown expiry with no cancellation: fire compaction via T-9 flow. Auto-compact toggle in top bar calls `PATCH /api/conversations/:id` to persist the `auto_compact_enabled` change.

- `src/renderer/components/CompactToast.tsx` — countdown toast with Cancel
- `src/renderer/components/ChatArea.tsx` — threshold evaluation, toast mounting, cancel-on-new-message, toggle

**Done when:**
- Toast appears after stream pushing usage above 80%
- Cancel dismisses toast without compacting
- New message while toast visible dismisses toast
- Countdown expiry triggers compaction via T-9
- Does not re-arm within same stream cycle after cancellation

---

## T-11 — Fork conversation

**Complexity:** M
**Depends on:** T-2

Each message bubble has a "Fork" hover icon and right-click context menu entry. Clicking calls `POST /api/conversations/:id/fork` with `fromMessageId`, receives new conversation, loads its messages, sets it as selected. New conversation appears at top of sidebar (ordered by `updated_at DESC`). Both conversations are fully independent. Forking from a temp session first calls `promoteSession` to create a persistent intermediate, then forks it.

- `src/renderer/components/ChatArea.tsx` — hover icon, context menu, fork handler
- `src/renderer/api-client.ts` — `forkConversation(id, fromMessageId)`

**Done when:**
- Right-clicking a message shows "Fork"
- Fork creates a new conversation in the sidebar with all messages up to and including that message
- Original conversation is unchanged
- Fork from temp session results in a new persistent conversation

---

## T-12 — Exact token count wire-up

**Complexity:** S
**Depends on:** T-1, T-4, T-7

After `chatStream` resolves: write `usage.prompt_tokens` to the user message and `usage.completion_tokens` to the assistant message via `PATCH /api/conversations/:id/messages/:msgId/tokens`. For temp sessions: write via `store.updateLastMessageTokens`. Update local message state so token badges (T-7) immediately reflect exact values. If `usage` is absent, leave estimate as-is — no error thrown.

- `src/backend/routes/conversations.ts` — add `PATCH /:id/messages/:msgId/tokens`
- `src/renderer/components/ChatArea.tsx` — post-stream `updateMessageTokens` calls
- `src/renderer/api-client.ts` — `updateMessageTokens(conversationId, messageId, exact)`

**Done when:**
- After stream with `usage` data, both user and assistant token badges switch to exact integers
- After stream without `usage` data, badges remain as estimates without error

---

## Parallelisation Guide

```
Track A (backend):      T-1 ──► T-2 ──► T-3 ──► T-12
Track B (renderer):     T-4 ──► T-6
Track C (metadata+UI):  T-5 (free) ──► T-7 ──► T-8
Integration:            [all tracks] ──► T-9 ──► T-10 ──► T-11
```

Two-developer split:
- Dev 1: T-1, T-2, T-3, T-5, T-12 (all backend)
- Dev 2: T-4, T-6, T-7, T-8 (renderer foundation)
- Both converge on T-9, T-10, T-11
