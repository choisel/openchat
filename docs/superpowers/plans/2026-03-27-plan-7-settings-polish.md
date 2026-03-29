# OpenChat — Plan 7: Settings & Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a fully-featured, shippable release of OpenChat by completing the settings panel, adding robust LM Studio reconnection with exponential backoff, conversation search with token badges, and producing a signed .dmg distributable.

**Architecture:** Settings are stored as key-value rows in the `settings` SQLite table (established in earlier plans), exposed via a settings API route, and surfaced in a modal panel mounted at the `App` root. The LM Studio reconnect loop runs in the backend, broadcasting status changes over a new SSE endpoint that replaces the renderer's polling. Packaging is electron-builder with a `build` key in `package.json`.

**Tech Stack:** electron-builder (already a devDependency), existing stack.

---

## File Map

```
src/
  backend/
    db.ts                          — extend: searchConversations, getTokenTotal
    settings-store.ts              — typed facade over db getSetting/setSetting
    lmstudio-reconnect.ts          — NEW: exponential-backoff reconnect loop + subscriber model
    routes/
      conversations.ts             — add GET ?q= search and GET /:id/token-total
      lmstudio.ts                  — add GET /status/stream SSE endpoint
      settings.ts                  — full CRUD: GET all, PATCH /:key (create if Plan 5/6 partial)
    index.ts                       — instantiate reconnect manager, pass to router factories
  main/
    index.ts                       — pass live lmStudioUrl from settings at spawn; IPC app version
    ipc-handlers.ts                — add get-app-version handler
  preload/
    index.ts                       — expose getAppVersion via contextBridge
  renderer/
    api-client.ts                  — add getSettings, updateSetting, subscribeToLmStatus,
                                     searchConversations, getTokenTotal
    components/
      App.tsx                      — connected state lifted here; showSettings toggle
      Sidebar.tsx                  — SSE status subscription; search input wired; token badges; Settings link
      ChatArea.tsx                 — offline banner; abort stream on disconnect
      settings/
        SettingsModal.tsx          — NEW: modal shell with panel nav
        PanelGeneral.tsx           — NEW
        PanelLmStudio.tsx          — NEW
        PanelWebSearch.tsx         — NEW
        PanelContext.tsx           — NEW
        PanelPermissions.tsx       — NEW
        PanelAbout.tsx             — NEW
assets/
  icon.png                         — 512×512 app icon (required by electron-builder)
tests/
  backend/
    settings-store.test.ts         — NEW
    lmstudio-reconnect.test.ts     — NEW
    conversations.test.ts          — extend: search and token-total
package.json                        — add electron-builder build config + build:dist script
```

---

## T-1 — Settings persistence layer (if not already complete)

**Complexity:** S
**Depends on:** none

Ensure the `settings` table exists in `db.ts` with a typed `SettingsStore` facade. All known keys must have typed getters/setters and `getOrDefault` semantics. Keys: `lmStudioUrl`, `lmStudioPollInterval`, `braveApiKey`, `tavilyApiKey`, `defaultModel`, `autoCompactThreshold`, `messagesPreservedAfterCompact`, `shellTimeout`, `shellWorkingDir`, `shellAllowlist`, `applescriptAllowlist`, `language`, `tempSessionAutoSavePrompt`. If already partially implemented in Plans 5/6, this task is an audit and gap-fill rather than a full rewrite.

- `src/backend/db.ts` — settings table DDL (idempotent)
- `src/backend/settings-store.ts` — typed facade
- `tests/backend/settings-store.test.ts` — round-trip for each key type, array serialisation for allowlists

**Done when:**
- All settings-store tests pass
- `settingsStore.get('lmStudioUrl')` returns `http://localhost:1234` on a fresh DB
- Setting and re-reading an array value (allowlist) round-trips correctly

---

## T-2 — Settings API route

**Complexity:** S
**Depends on:** T-1

Ensure `GET /api/settings` and `PATCH /api/settings/:key` are present (may already exist from Plans 5/6). `GET` returns the full settings object with all defaults filled in. `PATCH` validates against the known key list, responds 400 for unknown keys, 204 on success.

- `src/backend/routes/settings.ts` — GET + PATCH handlers
- `src/backend/index.ts` — mount if not already

**Done when:**
- `GET /api/settings` returns all known keys with defaults on a fresh DB
- `PATCH` with unknown key returns 400
- `PATCH` with valid key + `GET` reflects the change

---

## T-3 — LM Studio reconnect manager

**Complexity:** M
**Depends on:** T-1

`LmStudioReconnectManager` replaces the renderer's 30-second poll. It wraps `LmStudioClient.checkConnection()` with exponential backoff: 1s → 2s → 4s → 8s → 30s cap. On reconnect, resets to the configured poll interval. Refreshes the model list on each successful check. Accepts `getUrl: () => string` factory so the URL is always current. Exposes `subscribe(cb)` / `unsubscribe(cb)` / `currentStatus()`. Created once at backend startup and passed to the lmstudio router factory. The existing `GET /api/lmstudio/status` endpoint is kept for compatibility.

- `src/backend/lmstudio-reconnect.ts` — new file
- `src/backend/routes/lmstudio.ts` — new `GET /status/stream` SSE endpoint consuming the manager
- `src/backend/index.ts` — instantiate manager, pass to router
- `tests/backend/lmstudio-reconnect.test.ts` — backoff sequence, reconnect reset, subscriber events

**Done when:**
- After 3 consecutive failures the delay reaches 8s (not yet capped)
- On reconnect, delay resets to the base poll interval
- `GET /api/lmstudio/status/stream` sends an initial event within 100ms of connection
- All reconnect tests pass with mocked `checkConnection`

---

## T-4 — Conversation search and token-total API

**Complexity:** S
**Depends on:** none (parallel)

Add `GET /api/conversations?q=<query>` running case-insensitive `LIKE` search across `conversations.name` and `messages.content`; returns distinct matching conversation rows. Add `GET /api/conversations/:id/token-total` returning `{ total: number }` as the sum of all `tokens` values for that conversation. Add `searchConversations(query)` and `getTokenTotal(id)` to `db.ts`.

- `src/backend/db.ts` — `searchConversations` and `getTokenTotal` methods
- `src/backend/routes/conversations.ts` — `?q=` param handling and `/:id/token-total` route
- `tests/backend/conversations.test.ts` — search case-insensitive, token-total sum, empty result

**Done when:**
- A conversation named "Rust tips" with message content "ownership" is returned by `?q=ownership`
- `?q=RUST` matches case-insensitively
- `GET /:id/token-total` returns correct sum after multiple messages
- `?q=nomatch` returns `[]`

---

## T-5 — Real-time status in the renderer (SSE subscription)

**Complexity:** S
**Depends on:** T-3

Replace `Sidebar`'s `setInterval` poll with a persistent `EventSource` subscription to `/api/lmstudio/status/stream`. Add `subscribeToLmStatus(cb): () => void` to `api-client.ts` — creates an `EventSource`, calls `cb` on each message, returns a cleanup function. `Sidebar` calls this in a `useEffect` and uses the returned cleanup in the destructor. Both `connected` state and `models` list update from the stream payload.

- `src/renderer/api-client.ts` — `subscribeToLmStatus`
- `src/renderer/components/Sidebar.tsx` — replace `setInterval` with SSE subscription; pass `onStatusChange` prop up to `App`

**Done when:**
- Killing LM Studio causes the sidebar dot to turn red within the next reconnect cycle
- Restarting LM Studio causes it to turn green without an app restart

---

## T-6 — Offline banner and stream abort

**Complexity:** M
**Depends on:** T-5

Lift `connected` state to `App.tsx`. When `connected` transitions `true → false` while a response is streaming in `ChatArea`, abort the in-flight request and append "LM Studio went offline — response cancelled." to the thread. When `connected === false`, show an amber banner at the top of `ChatArea`: "LM Studio is unreachable — waiting to reconnect…". Banner disappears automatically when `connected` becomes `true` again.

- `src/renderer/components/App.tsx` — `connected` state; pass to `ChatArea`; receive `onStatusChange` from `Sidebar`
- `src/renderer/components/Sidebar.tsx` — accept and call `onStatusChange` prop
- `src/renderer/components/ChatArea.tsx` — offline banner; `useEffect` watching `connected` to abort stream

**Done when:**
- LM Studio going offline mid-stream stops the stream and adds error message in thread
- Banner appears on disconnect, disappears on reconnect — without page reload

---

## T-7 — Token badges in sidebar

**Complexity:** S
**Depends on:** T-4

Add a small grey token count badge to each conversation row. On load, fetch token totals for all conversations in parallel via `api.getTokenTotal(id)`. Store in `Record<number, number>` state. Format: raw integer if < 1000, `Xk` (one decimal, drop `.0`) if ≥ 1000. Refresh badge for the selected conversation after each message is sent. Add `getTokenTotal` to `api-client.ts`.

- `src/renderer/api-client.ts` — `getTokenTotal(conversationId)`
- `src/renderer/components/Sidebar.tsx` — fetch totals, render badge per row

**Done when:**
- Each row shows a numeric badge
- A conversation with 5200 tokens shows `5.2k`
- A conversation with 0 messages shows `0`

---

## T-8 — Settings modal UI

**Complexity:** L
**Depends on:** T-2

`SettingsModal` is a full-screen dark overlay (not a native window) with a left panel nav and right content area. Opens via a "Settings" link in the sidebar footer. Changes write immediately on blur/change via `PATCH /api/settings/:key` — no Save button. Fetch all settings on open.

Six panels per the design spec:
- **General:** default model (text input, default "auto"), temp session auto-save prompt toggle
- **LM Studio:** base URL (text input), polling interval (number, seconds, min 5)
- **Web Search:** Brave API key (password input), Tavily API key (password input)
- **Context:** auto-compact threshold (slider 50–100%), messages preserved after compaction (number, min 1)
- **Permissions:** shell allowlist (list + add/remove), AppleScript allowlist (list + add/remove), working directory (text), shell timeout (number, seconds)
- **About:** version string (from `window.electronAPI.getAppVersion()`), link to repository

- `src/renderer/components/settings/SettingsModal.tsx` — modal shell + nav
- `src/renderer/components/settings/Panel*.tsx` — six panel components
- `src/renderer/api-client.ts` — `getSettings()`, `updateSetting(key, value)`
- `src/renderer/components/App.tsx` — `showSettings` state, render modal
- `src/renderer/components/Sidebar.tsx` — "Settings" link calling `onOpenSettings`
- `src/preload/index.ts` — expose `getAppVersion`
- `src/main/ipc-handlers.ts` — register `get-app-version` returning `app.getVersion()`

**Done when:**
- All 6 panels render without error
- Changing LM Studio URL writes via PATCH and is visible on modal reopen
- PanelAbout shows version string (e.g. `0.1.0`)
- Shell allowlist: add and remove a pattern works

---

## T-9 — LM Studio URL consumed live

**Complexity:** S
**Depends on:** T-2, T-3

The `LmStudioReconnectManager` currently receives a static URL. Change its constructor to accept `getUrl: () => string`. Pass `() => settingsStore.get('lmStudioUrl')` from `index.ts`. The chat route's LM Studio client creation also reads the live URL. This means changing the URL in Settings and waiting one reconnect cycle takes effect without an app restart.

- `src/backend/lmstudio-reconnect.ts` — constructor takes `getUrl: () => string`
- `src/backend/routes/lmstudio.ts` — pass `getUrl` to client creation
- `src/backend/index.ts` — wire `settingsStore` into both

**Done when:**
- Unit test: mock `getUrl` returning different URLs on successive calls; assert the manager uses the new URL on the second attempt
- Changing the URL in the Settings panel takes effect without restarting the app

---

## T-10 — Conversation search in the renderer

**Complexity:** S
**Depends on:** T-4

Wire the existing search `<input>` in `Sidebar.tsx`. Debounce at 250ms. Empty query → show full list. Non-empty → call `api.searchConversations(query)` and show results. Add a clear button (×) when query is non-empty. Add `searchConversations(q)` to `api-client.ts`.

- `src/renderer/api-client.ts` — `searchConversations(q)`
- `src/renderer/components/Sidebar.tsx` — debounced effect, results state, clear button

**Done when:**
- Typing in search box filters list within 300ms
- Clearing the input restores full list
- No-match query shows empty list without error

---

## T-11 — Packaging as .dmg

**Complexity:** M
**Depends on:** none (run final validation after T-8)

Add a `build` key to `package.json` with: `appId`, `productName`, `copyright`, target `dmg` for macOS. Add a `build:dist` script: `electron-vite build && tsc --project tsconfig.backend.json && electron-builder`. Create `assets/icon.png` (512×512 placeholder). Configure electron-builder to include `out/` and exclude `src/`, `tests/`, `node_modules/.cache`.

- `package.json` — `build` configuration and `build:dist` script
- `assets/icon.png` — 512×512 placeholder icon

**Done when:**
- `npm run build:dist` completes without error
- A `.dmg` file is produced in `dist/`
- Mounting the `.dmg` and launching the app works end-to-end
- PanelAbout shows the version from `package.json`

---

## Parallelisation Guide

```
Track A:  T-1 ──► T-2 ──► T-9 (settings backend)
Track B:  T-3 ──► T-5 ──► T-6 (reconnect + real-time UI)
Track C:  T-4 ──► T-7, T-10 (search + badges, parallel)
Track D:  T-11 (free, validate last after T-8)
Converge: T-8 (settings UI, depends on T-2; panel components can be parallelised internally)
```

Two-developer split:
- Dev 1: T-1, T-2, T-9, T-4 then T-8 (panels)
- Dev 2: T-11, T-3, T-5, T-6 then T-7, T-10 + T-8 (modal shell)
