# OpenChat — Plan 3: Model Routing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the intelligent routing logic behind "Auto" mode so that when multiple models are loaded in LM Studio, the right model is selected automatically for each message.

**Architecture:** A new `ModelRouter` service lives entirely in the Express backend and is injected into the chat route from Plan 2. It consumes the already-cached model list, applies name-based classification for the two-model case, and delegates to a live one-shot LLM call for the ambiguous two-model and three-plus-model cases. Routing failures fall back silently up to a threshold, after which the renderer displays a warning banner sourced from a new `/api/lmstudio/routing-health` endpoint.

**Tech Stack:** Electron 29, React 18, TypeScript 5, Express 4, Vitest — no new dependencies.

---

## File Map

```
src/
  backend/
    model-param-parser.ts        — heuristic param-count extraction from model id
    model-router.ts              — ModelRouter class, all routing decision logic
    routes/
      lmstudio.ts                — extend: GET /routing-health; wire ModelRouter into chat POST
    index.ts                     — instantiate ModelRouter, inject into router
  renderer/
    api-client.ts                — add getRoutingHealth()
    components/
      App.tsx                    — poll routing-health, pass banner state down
      RoutingWarningBanner.tsx   — dismissible yellow banner on 3+ consecutive failures
tests/
  backend/
    model-param-parser.test.ts   — unit tests for param-count heuristic
    model-router.test.ts         — unit tests for all routing branches + fallback logic
```

---

## T-1 — Parameter-count parser

**Complexity:** S
**Depends on:** none

Build a pure function `parseParamCount(modelId: string): number` that extracts a numeric parameter count (in billions) from a model id string. Match patterns like `7b`, `8x7b` (→ 56B via multiplication), `6.7b`, `2b`, `70b` (case-insensitive). Return `Infinity` for unrecognised ids so they sort last when looking for the smallest model and first when looking for the largest.

- `src/backend/model-param-parser.ts` — exports `parseParamCount`
- `tests/backend/model-param-parser.test.ts` — covers phi-2, mixtral-8x7b, deepseek-coder-6.7b, llama-3-70b, unknown-model, MoE multiplication

**Done when:**
- At least 8 representative model ids are covered by tests
- `8x7b` → 56, `6.7b` → 6.7, unknown → `Infinity`
- All tests pass

---

## T-2 — ModelRouter core logic

**Complexity:** L
**Depends on:** T-1

`ModelRouter` is a class with a single async method `resolveModel(userMessage, loadedModels)` implementing the full decision tree:

- **1 model:** return it directly
- **2 models, unambiguous:** name-based coding classification (keywords: `code`, `coder`, `starcoder`, `codellama`, `deepseek-coder`, `wizardcoder`). If exactly one model matches and the user message looks like a coding question → route to it; otherwise route to the other.
- **2 models, ambiguous:** send a one-shot prompt to the smallest model (by `parseParamCount`) containing both names; return the model named in the response.
- **3+ models:** smallest model is the router. One-shot prompt with user message + non-router model names; parse response for an exact model name. Fallback: return largest non-router model.
- **Fallback path:** increment an internal `consecutiveFailures` counter; reset to zero on success. Expose via `getConsecutiveFailures()`.

Router timeout is 5 seconds (AbortSignal). A `callRouter` internal helper wraps `lmClient.chatStream` into a single aggregated string.

- `src/backend/model-router.ts` — `ModelRouter` class
- `tests/backend/model-router.test.ts` — all branches with mocked `LmStudioClient`

**Done when:**
- All 6 routing branches are covered by tests (0 models error, 1 model direct, 2 unambiguous, 2 ambiguous mocked, 3+ success mocked, 3+ fallback on timeout and bad response)
- Timeout path triggers fallback and increments counter
- Invalid model name in response triggers fallback
- Counter resets to zero after one successful routing call

---

## T-3 — Wire ModelRouter into the chat route

**Complexity:** M
**Depends on:** T-2

When `model` is `"auto"` in `POST /api/chat/:conversationId`, call `modelRouter.resolveModel(userMessage, loadedModels)` before forwarding to LM Studio. Cache the `listModels()` result for 30 seconds in-memory (timestamp + value) so the router never adds latency on back-to-back messages. Add `GET /api/lmstudio/routing-health` returning `{ consecutiveFailures: number }`. Manual model selection (non-"auto") bypasses the router entirely.

- `src/backend/routes/lmstudio.ts` — routing logic in chat POST when model is "auto"; new /routing-health GET
- `src/backend/index.ts` — instantiate `ModelRouter`, pass to router factory

**Done when:**
- Sending a chat message with `model: "auto"` resolves to a concrete model id before the LM Studio call
- `GET /api/lmstudio/routing-health` returns `{ consecutiveFailures: N }`
- Non-auto model selection is unaffected

---

## T-4 — Routing warning banner in the renderer

**Complexity:** S
**Depends on:** T-3

`App.tsx` polls `GET /api/lmstudio/routing-health` every 30 seconds. When `consecutiveFailures >= 3`, render `RoutingWarningBanner` above the chat area. The banner is dismissible (local `dismissed` state, reset when count drops below 3). Banner text: "Auto routing is struggling — responses may use a fallback model. You can pin a model in the conversation settings."

- `src/renderer/components/RoutingWarningBanner.tsx` — new dismissible banner
- `src/renderer/components/App.tsx` — polling effect, conditional render
- `src/renderer/api-client.ts` — add `getRoutingHealth()`

**Done when:**
- Banner appears when `consecutiveFailures >= 3` (testable by making the router always fail)
- Banner absent when `consecutiveFailures < 3`
- Dismiss hides the banner without reloading
- Banner reappears if failures continue past the next poll

---

## Parallelisation Guide

```
T-1 (parser, S)
  └── T-2 (router logic, L)
        └── T-3 (wiring, M)
              └── T-4 (banner UI, S)
```

T-4 can be stubbed and started alongside T-3 since the API contract is defined above. Long pole is T-2 — begin immediately after T-1 lands.
