# OpenChat — Implementation Progress

> Last updated: 2026-03-29
> Tests: 154/154 passing

---

## Plan 1 — Foundation
Status: ✅ done
Branch: feat/plan-1-foundation (merged: ac3c25c)
Summary: Project scaffold (Electron + Vite + React + TS), SQLite layer, LM Studio HTTP client, Express backend with conversations API, Electron main process + backend spawner, React frontend layout + API client, Clear Dark theme CSS.

Tasks:
- [x] T-1 Project scaffold
- [x] T-2 SQLite database layer
- [x] T-3 LM Studio HTTP client
- [x] T-4 Express backend — conversations API
- [x] T-5 Electron main process — window + backend spawner
- [x] T-6 React frontend — layout + API client
- [x] T-7 Global CSS reset and Clear Dark theme

---

## Plan 2 — Chat Streaming
Status: ✅ done
Branch: feat/plan-2-chat-streaming (merged into main)
Summary: Backend SSE streaming endpoint, PATCH model route, token utilities, api-client SSE, MessageBubble, ContextBar, ModelSelector, TopBar, ChatArea full implementation with streaming.

Tasks:
- [x] T-1 Backend: persist messages and expose PATCH model
- [x] T-2 Backend: SSE chat streaming endpoint
- [x] T-3 Frontend: token utility (src/renderer/lib/tokens.ts)
- [x] T-4 Frontend: api-client extensions (streamChat, SSE parsing)
- [x] T-5 Frontend: MessageBubble and ContextBar components
- [x] T-6 Frontend: ModelSelector and TopBar components
- [x] T-7 Frontend: ChatArea full implementation

---

## Plan 3 — Model Routing
Status: ✅ done
Branch: feat/plan-3-model-routing (merged into main)
Summary: Parameter-count parser, ModelRouter with full decision tree (coding classifier, size ranking, LLM fallback), wired into chat route with 30s cache, RoutingWarningBanner in renderer.

Tasks:
- [x] T-1 Parameter-count parser (src/backend/model-param-parser.ts)
- [x] T-2 ModelRouter core logic (src/backend/model-router.ts)
- [x] T-3 Wire ModelRouter into the chat route
- [x] T-4 Routing warning banner (src/renderer/components/RoutingWarningBanner.tsx)

Post-merge fixes on main:
- Smart LM Studio status polling (9daf876)
- Abort only on premature close (a8d1571)
- Poll models every 10 min instead of 30s (42203e0)

---

## Plan 4 — Context Management
Status: ✅ done
Branch: main (all commits landed directly after plan-3 merge)
Summary: DB schema extensions (context_window, auto_compact_threshold, auto_compact_enabled, exact_tokens), PATCH/fork/promote routes, compaction backend, temp session store, manual compaction UI, auto-compaction with toast, fork from message, exact token wire-up.

Tasks:
- [x] T-1 Database schema extensions (exact_tokens, context fields)
- [x] T-2 Backend: PATCH, fork, promote routes
- [x] T-3 Backend: compaction route (POST /api/conversations/:id/compact)
- [x] T-4 Temporary session store (src/renderer/temp-session-store.ts)
- [x] T-5 Context window metadata from /v1/models
- [x] T-6 Sidebar: temp session display and "Save conversation"
- [x] T-7 Token badge per message bubble
- [x] T-8 Context bar in top bar
- [x] T-9 Manual compaction flow (4-state button)
- [x] T-10 Auto-compaction with 5-second countdown toast (CompactToast.tsx)
- [x] T-11 Fork conversation (⑂ button on message hover)
- [x] T-12 Exact token count wire-up after stream

---

## Plan 5 — Files & Web Search
Status: ✅ done
Branch: feat/plan-5-files-web (merged: d157158)
Summary: File drag-and-drop (text/PDF/image), attachment processing via POST /api/files/process, web search (Brave+Tavily fallback) via POST /api/search, settings API + SettingsModal for API keys, AttachmentChip + FileBlock + SourcesBlock components, manual 🌐 search button, automatic tool calling search, openExternal IPC for URLs.

Tasks:
- [x] T-1 Install dependencies and extend DB schema for settings
- [x] T-2 Backend: file processing service
- [x] T-3 Backend: web search service
- [x] T-4 Settings UI for API keys
- [x] T-5 Renderer: drag-and-drop and attachment chips
- [x] T-6 Renderer: file content in message thread
- [x] T-7 Manual web search (🌐 button)
- [x] T-8 Automatic web search via tool calling

---

## Plan 6 — System Integrations
Status: ✅ done
Branch: feat/plan-6-system-integrations (merged: 2ed4cab)
Summary: Permissions DB layer (shell/applescript allowlists), settings API (permissions CRUD + GET/PATCH), SystemExecutor service (spawn + SIGTERM/SIGKILL + AsyncIterable), system routes (POST /api/system/shell + applescript with minimatch allowlist, 202 confirmation gate, SSE streaming), renderer API client extensions (runShell, runAppleScript, permissions helpers), ConfirmationModal, ShellBlock, AppleScriptBlock components with streaming output, LLM output parser in MessageBubble (fenced shell/applescript/shortcuts blocks → interactive components), Permissions UI in SettingsModal.

Tasks:
- [x] T-1 Permissions persistence (DB layer)
- [x] T-2 Settings API for permissions
- [x] T-3 SystemExecutor service
- [x] T-4 System execution routes + allowlist enforcement
- [x] T-5 Renderer API client extensions
- [x] T-6 ConfirmationModal component
- [x] T-7 ShellBlock component
- [x] T-8 AppleScriptBlock component
- [x] T-9 LLM output parser and ChatArea integration
- [x] T-10 Settings panel: Permissions UI

---

## Plan 7 — Settings & Polish
Status: ⬜ todo
Branch: not started
Summary: Settings persistence, LM Studio reconnect manager, real-time status SSE, offline banner, conversation search, token badges in sidebar, settings modal UI, packaging as .dmg.

Tasks:
- [ ] T-1 Settings persistence layer
- [ ] T-2 Settings API route
- [ ] T-3 LM Studio reconnect manager
- [ ] T-4 Conversation search and token-total API
- [ ] T-5 Real-time status in the renderer (SSE subscription)
- [ ] T-6 Offline banner and stream abort
- [ ] T-7 Token badges in sidebar
- [ ] T-8 Settings modal UI
- [ ] T-9 LM Studio URL consumed live
- [ ] T-10 Conversation search in the renderer
- [ ] T-11 Packaging as .dmg
