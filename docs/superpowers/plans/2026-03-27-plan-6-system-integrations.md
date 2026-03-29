# OpenChat — Plan 6: System Integrations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow the LLM to propose and execute shell commands and AppleScript/Shortcuts scripts from within the chat, with explicit user confirmation and a persistent allowlist that skips confirmation for trusted patterns.

**Architecture:** A new `SystemExecutor` service in the Express backend exposes two SSE routes (shell and AppleScript execution), streaming stdout/stderr back to the renderer. Permissions (allowlists and execution settings) are stored in the existing SQLite `settings` table. The renderer detects fenced `shell` and `applescript` blocks in LLM output and replaces them with interactive `ShellBlock` / `AppleScriptBlock` components.

**Tech Stack:** Node.js built-in `child_process.spawn`, `minimatch` (glob matching for shell allowlist — add as prod dependency), existing stack.

---

## File Map

```
src/
  backend/
    db.ts                          — add permissions table + CRUD helpers
    system-executor.ts             — spawn shell / osascript, stream output, SIGTERM/SIGKILL
    routes/
      system.ts                    — POST /api/system/shell, POST /api/system/applescript
      settings.ts                  — extend: permissions CRUD endpoints
    index.ts                       — mount system router
  renderer/
    api-client.ts                  — add runShell, runAppleScript, permissions API methods
    components/
      ChatArea.tsx                 — parse LLM output for code blocks, render Shell/AppleScript blocks
      ShellBlock.tsx               — shell proposal + Run/Stop/output display
      AppleScriptBlock.tsx         — applescript proposal + Run/Stop/output display
      ConfirmationModal.tsx        — one-time confirmation dialog with allowlist option
      Settings.tsx                 — extend: Permissions panel (allowlists, working dir, timeout)
tests/
  backend/
    system-executor.test.ts        — spawn, timeout, SIGTERM/SIGKILL, stderr
    system-routes.test.ts          — allowlist match, requiresConfirmation, confirmed bypass
package.json                        — add minimatch
```

---

## T-1 — Permissions persistence (DB layer)

**Complexity:** S
**Depends on:** none

Add a `permissions` table: `id INTEGER PRIMARY KEY`, `type TEXT` (`shell` | `applescript`), `pattern TEXT`, `created_at TEXT`. Add `getSetting` / `setSetting` to `db.ts` if not already present (may overlap with Plan 5 T-1 — skip if already done). Add helpers: `listPermissions(type)`, `addPermission(type, pattern)`, `removePermission(id)`. Sensible defaults: `shell_working_dir` = user home, `shell_timeout_ms` = 30000, `applescript_timeout_ms` = 10000. All migrations use `IF NOT EXISTS` guards.

- `src/backend/db.ts` — permissions table migration and five helper methods

**Done when:**
- `listPermissions('shell')` returns rows after `addPermission('shell', 'git *')`
- `removePermission(id)` deletes the row
- `getSetting('shell_timeout_ms')` returns `30000` on a fresh DB

---

## T-2 — Settings API for permissions

**Complexity:** S
**Depends on:** T-1

Extend `src/backend/routes/settings.ts` (or create if Plan 5 didn't) with: `GET /api/settings/permissions?type=shell|applescript`, `POST /api/settings/permissions` with body `{ type, pattern }`, `DELETE /api/settings/permissions/:id`. Also `GET /api/settings` and `PATCH /api/settings/:key` if not already present.

- `src/backend/routes/settings.ts` — permissions CRUD endpoints
- `src/backend/index.ts` — mount if not already

**Done when:**
- POST + GET + DELETE round-trip tested via supertest against a test DB
- `GET /api/settings` returns `shell_working_dir` and `shell_timeout_ms`

---

## T-3 — SystemExecutor service

**Complexity:** L
**Depends on:** T-1

`SystemExecutor` exports two methods: `executeShell({ command, workingDir, timeoutMs }, signal)` and `executeAppleScript({ script, timeoutMs }, signal)`. Both return an `AsyncIterable<{ type: 'stdout' | 'stderr' | 'exit', data: string }>`. Shell uses `spawn('sh', ['-c', command], { cwd })`. AppleScript uses `spawn('osascript', ['-e', script])`. On `AbortSignal` fire: send `SIGTERM`; if the process has not exited within 2 seconds, send `SIGKILL`. Timeout fires identically. Neither method checks allowlists — that is the route's responsibility.

- `src/backend/system-executor.ts` — new file
- `tests/backend/system-executor.test.ts` — stdout order, stderr tagging, exit event, SIGTERM/SIGKILL sequence, timeout

**Done when:**
- `echo` commands produce `stdout` events in order
- `cat /dev/stderr` produces `stderr` events
- A `sleep 60` killed by AbortSignal produces an `exit` event with non-zero code
- SIGKILL fires within 2.5 seconds of SIGTERM if process does not exit

---

## T-4 — System execution routes + allowlist enforcement

**Complexity:** M
**Depends on:** T-2, T-3

`POST /api/system/shell` and `POST /api/system/applescript` SSE endpoints. Each checks the allowlist first: for shell, use `minimatch` against each glob pattern; for AppleScript, check the app name against the allowlist. If no match: respond `{ requiresConfirmation: true }` with HTTP 202 before streaming. If re-sent with `{ confirmed: true }`: bypass allowlist and stream. Streaming: create `AbortController`, iterate `SystemExecutor`, emit SSE events. On client disconnect: `controller.abort()`. Add `minimatch` to `package.json`.

- `src/backend/routes/system.ts` — two SSE route handlers
- `src/backend/index.ts` — mount system router
- `tests/backend/system-routes.test.ts` — allowlisted command streams; unlisted returns 202; confirmed streams; disconnect aborts

**Done when:**
- Allowlisted command streams without 202
- Unlisted command returns 202 with `requiresConfirmation: true`
- `confirmed: true` request streams regardless of allowlist
- Client disconnect aborts the spawned process

---

## T-5 — Renderer API client extensions

**Complexity:** S
**Depends on:** T-4

Add to `api-client.ts`: `runShell(command, confirmed?, signal?)` and `runAppleScript(script, confirmed?, signal?)` as async generators yielding `{ type, data }` events (using the same fetch/ReadableStream SSE reading pattern as `streamChat`). Also: `listPermissions(type)`, `addPermission(type, pattern)`, `removePermission(id)`, `getSettings()`, `updateSetting(key, value)`.

- `src/renderer/api-client.ts` — add all seven methods

**Done when:**
- TypeScript compiles without errors
- `runShell` and `runAppleScript` accept `AbortSignal` and yield the correct union type

---

## T-6 — ConfirmationModal component

**Complexity:** S
**Depends on:** none (pure UI)

Modal overlay with: command/script in a monospace block, "This will execute code on your system" warning, "Add to allowlist" checkbox (pre-ticked), "Cancel" / "Run" buttons. Props: `type: 'shell' | 'applescript'`, `command: string`, `onConfirm(addToAllowlist: boolean)`, `onCancel()`. Escape key triggers `onCancel`.

- `src/renderer/components/ConfirmationModal.tsx` — new file

**Done when:**
- "Run" calls `onConfirm(true)` when checkbox is ticked, `onConfirm(false)` otherwise
- "Cancel" and Escape both call `onCancel`
- Component is styled consistent with the dark theme

---

## T-7 — ShellBlock component

**Complexity:** M
**Depends on:** T-5, T-6

`ShellBlock` receives `command: string` and manages its own execution state. Idle: styled `<pre>` with `$` prefix and "Run" button. On "Run": call `api.runShell(command)`. If `requiresConfirmation`, mount `ConfirmationModal`. On confirm: call `api.runShell(command, true)`; if `addToAllowlist`, call `api.addPermission('shell', command)`. Running: hide "Run", show "Stop"; stream stdout (primary colour) and stderr (amber `#ff9f0a`) into a scrollable output area. After exit: show exit code, re-enable "Run". Stop calls `abortController.abort()`.

- `src/renderer/components/ShellBlock.tsx` — new file

**Done when:**
- Allowlisted command streams without modal
- Unknown command shows confirmation modal
- "Stop" appears while running, disappears after exit
- stderr lines are amber
- Exit code displayed at end of output

---

## T-8 — AppleScriptBlock component

**Complexity:** M
**Depends on:** T-5, T-6

Structurally identical to `ShellBlock`. Header label reads "AppleScript" (or "Shortcut" for `shortcuts run` scripts). Confirmation modal passes `type='applescript'`. `addToAllowlist` calls `api.addPermission('applescript', appName)` where `appName` is extracted from the first `tell application "..."` match (or the shortcut name). Uses `api.runAppleScript` instead of `runShell`.

- `src/renderer/components/AppleScriptBlock.tsx` — new file

**Done when:**
- Same observable criteria as T-7 but for AppleScript
- "Add to allowlist" checkbox pre-fills the extracted app name in the modal label

---

## T-9 — LLM output parser and ChatArea integration

**Complexity:** M
**Depends on:** T-7, T-8

Parse assistant message content for fenced blocks tagged `shell`, `applescript`, or `shortcuts`. Split content into segments: plain text → rendered as before; `shell` → `<ShellBlock>`; `applescript`/`shortcuts` → `<AppleScriptBlock>`. Use a regex-based parser — no new markdown library needed. Untagged or unknown fenced blocks continue to render as plain code blocks.

- `src/renderer/components/ChatArea.tsx` — content parser and conditional block rendering

**Done when:**
- Assistant message with a `shell` block renders an interactive `ShellBlock`, not raw code
- Message with both prose and a `shell` block renders both correctly
- Plain messages with no fenced blocks are unaffected

---

## T-10 — Settings panel: Permissions UI

**Complexity:** M
**Depends on:** T-5

Add a Permissions section to `Settings.tsx` with: shell allowlist (glob pattern rows with remove button + add input); AppleScript allowlist (same pattern for app names); default working directory text input (saved on blur); shell command timeout number input. Fetch data on mount via `api.listPermissions` and `api.getSettings`. A gear icon in the sidebar footer opens the settings panel.

- `src/renderer/components/Settings.tsx` — Permissions section
- `src/renderer/components/App.tsx` — gear button + `showSettings` state

**Done when:**
- Adding a glob pattern and reopening settings shows it persisted
- Removing an entry deletes it immediately from list and DB
- Working directory change persists across panel close/reopen

---

## Parallelisation Guide

```
Track A (backend):    T-1 ──► T-2 ──► T-3 ──► T-4
Track B (UI):         T-6 (free) ──► T-7, T-8 (parallel) ──► T-9
Track C (settings):   T-5 (after T-4 types known) ──► T-10
```

T-6 can start immediately with no backend dependency. T-5 can be stubbed early (API contract is fixed above) and finalised after T-4 lands. T-7 and T-8 are independent of each other and can be built in parallel.

Two-engineer split:
- Engineer 1: T-1, T-2, T-3, T-4
- Engineer 2: T-6, T-5 (stub), T-7, T-8, T-9, T-10
