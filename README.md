# OpenChat

Interface de chat locale pour LLM, construite avec Electron. Se connecte à [LM Studio](https://lmstudio.ai) et expose toutes les fonctionnalités avancées de gestion de contexte : compaction, fork de conversation, routing automatique de modèle, sessions temporaires.

---

## Architecture

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560" font-family="ui-monospace, 'SF Mono', monospace" font-size="12">
  <!-- Background -->
  <rect width="900" height="560" fill="#1c1c1e"/>

  <!-- === ELECTRON PROCESS === -->
  <rect x="20" y="20" width="860" height="520" rx="12" fill="none" stroke="#48484a" stroke-width="1.5" stroke-dasharray="6,3"/>
  <text x="40" y="42" fill="#636366" font-size="11" letter-spacing="1">ELECTRON PROCESS</text>

  <!-- === MAIN PROCESS === -->
  <rect x="40" y="55" width="200" height="130" rx="8" fill="#2c2c2e" stroke="#48484a" stroke-width="1"/>
  <text x="140" y="76" fill="#aeaeb2" font-size="11" text-anchor="middle" letter-spacing="0.5">MAIN PROCESS</text>
  <rect x="60" y="86" width="160" height="28" rx="5" fill="#3a3a3c"/>
  <text x="140" y="105" fill="#e5e5ea" font-size="11" text-anchor="middle">main/index.ts</text>
  <rect x="60" y="122" width="160" height="28" rx="5" fill="#3a3a3c"/>
  <text x="140" y="141" fill="#e5e5ea" font-size="11" text-anchor="middle">backend-spawner.ts</text>
  <rect x="60" y="158" width="160" height="18" rx="4" fill="#3a3a3c"/>
  <text x="140" y="171" fill="#636366" font-size="10" text-anchor="middle">ipc-handlers.ts</text>

  <!-- === RENDERER PROCESS === -->
  <rect x="280" y="55" width="380" height="300" rx="8" fill="#2c2c2e" stroke="#48484a" stroke-width="1"/>
  <text x="470" y="76" fill="#aeaeb2" font-size="11" text-anchor="middle" letter-spacing="0.5">RENDERER PROCESS (React)</text>

  <!-- App.tsx -->
  <rect x="300" y="86" width="340" height="32" rx="5" fill="#1c3a5e" stroke="#0a84ff" stroke-width="1"/>
  <text x="470" y="107" fill="#0a84ff" font-size="11" text-anchor="middle">App.tsx — état global, modèles, routing health</text>

  <!-- Sidebar + ChatArea -->
  <rect x="300" y="128" width="155" height="110" rx="5" fill="#3a3a3c"/>
  <text x="377" y="147" fill="#e5e5ea" font-size="11" text-anchor="middle">Sidebar.tsx</text>
  <text x="377" y="163" fill="#636366" font-size="10" text-anchor="middle">conversations</text>
  <text x="377" y="177" fill="#636366" font-size="10" text-anchor="middle">sessions temp ⚡</text>
  <text x="377" y="191" fill="#636366" font-size="10" text-anchor="middle">création / sélection</text>
  <text x="377" y="205" fill="#636366" font-size="10" text-anchor="middle">bouton Save</text>
  <text x="377" y="221" fill="#636366" font-size="10" text-anchor="middle">promote → persistant</text>

  <rect x="465" y="128" width="175" height="110" rx="5" fill="#3a3a3c"/>
  <text x="552" y="147" fill="#e5e5ea" font-size="11" text-anchor="middle">ChatArea.tsx</text>
  <text x="552" y="163" fill="#636366" font-size="10" text-anchor="middle">streaming SSE</text>
  <text x="552" y="177" fill="#636366" font-size="10" text-anchor="middle">compaction manuelle</text>
  <text x="552" y="191" fill="#636366" font-size="10" text-anchor="middle">auto-compaction toast</text>
  <text x="552" y="205" fill="#636366" font-size="10" text-anchor="middle">fork de message ⑂</text>
  <text x="552" y="221" fill="#636366" font-size="10" text-anchor="middle">barre contexte</text>

  <!-- Sub-components -->
  <rect x="300" y="248" width="340" height="24" rx="4" fill="#3a3a3c"/>
  <text x="470" y="264" fill="#636366" font-size="10" text-anchor="middle">TopBar · ContextBar · MessageBubble · CompactToast · RoutingWarningBanner</text>

  <!-- api-client + store -->
  <rect x="300" y="282" width="160" height="58" rx="5" fill="#3a2a1c" stroke="#ff9f0a" stroke-width="1"/>
  <text x="380" y="300" fill="#ff9f0a" font-size="10" text-anchor="middle">api-client.ts</text>
  <text x="380" y="315" fill="#636366" font-size="10" text-anchor="middle">fetch → Express</text>
  <text x="380" y="329" fill="#636366" font-size="10" text-anchor="middle">SSE ReadableStream</text>

  <rect x="470" y="282" width="170" height="58" rx="5" fill="#3a2a1c" stroke="#ff9f0a" stroke-width="1"/>
  <text x="555" y="300" fill="#ff9f0a" font-size="10" text-anchor="middle">temp-session-store.ts</text>
  <text x="555" y="315" fill="#636366" font-size="10" text-anchor="middle">singleton in-memory</text>
  <text x="555" y="329" fill="#636366" font-size="10" text-anchor="middle">pub/sub React hook</text>

  <!-- === BACKEND PROCESS === -->
  <rect x="40" y="230" width="200" height="260" rx="8" fill="#2c2c2e" stroke="#48484a" stroke-width="1"/>
  <text x="140" y="251" fill="#aeaeb2" font-size="11" text-anchor="middle" letter-spacing="0.5">BACKEND (Node/Express)</text>

  <rect x="60" y="260" width="160" height="28" rx="5" fill="#1c3a2a" stroke="#30d158" stroke-width="1"/>
  <text x="140" y="279" fill="#30d158" font-size="10" text-anchor="middle">POST /api/chat/:id  SSE</text>

  <rect x="60" y="296" width="160" height="50" rx="5" fill="#3a3a3c"/>
  <text x="140" y="314" fill="#e5e5ea" font-size="10" text-anchor="middle">routes/conversations.ts</text>
  <text x="140" y="329" fill="#636366" font-size="9" text-anchor="middle">CRUD · fork · compact</text>
  <text x="140" y="342" fill="#636366" font-size="9" text-anchor="middle">promote · tokens PATCH</text>

  <rect x="60" y="354" width="160" height="36" rx="5" fill="#3a3a3c"/>
  <text x="140" y="371" fill="#e5e5ea" font-size="10" text-anchor="middle">routes/lmstudio.ts</text>
  <text x="140" y="384" fill="#636366" font-size="9" text-anchor="middle">models · status · cache 30s</text>

  <rect x="60" y="398" width="160" height="36" rx="5" fill="#3a3a3c"/>
  <text x="140" y="415" fill="#e5e5ea" font-size="10" text-anchor="middle">model-router.ts</text>
  <text x="140" y="428" fill="#636366" font-size="9" text-anchor="middle">auto-routing · fallback</text>

  <rect x="60" y="442" width="160" height="36" rx="5" fill="#3a3a3c"/>
  <text x="140" y="459" fill="#e5e5ea" font-size="10" text-anchor="middle">db.ts (better-sqlite3)</text>
  <text x="140" y="472" fill="#636366" font-size="9" text-anchor="middle">conversations · messages</text>

  <!-- === LM STUDIO === -->
  <rect x="700" y="55" width="160" height="100" rx="8" fill="#2c2c2e" stroke="#bf5af2" stroke-width="1"/>
  <text x="780" y="76" fill="#bf5af2" font-size="11" text-anchor="middle">LM STUDIO</text>
  <text x="780" y="98" fill="#636366" font-size="10" text-anchor="middle">OpenAI-compatible</text>
  <text x="780" y="113" fill="#636366" font-size="10" text-anchor="middle">POST /v1/chat/completions</text>
  <text x="780" y="128" fill="#636366" font-size="10" text-anchor="middle">stream: true</text>

  <!-- === SQLite === -->
  <rect x="700" y="200" width="160" height="80" rx="8" fill="#2c2c2e" stroke="#ff9f0a" stroke-width="1"/>
  <text x="780" y="221" fill="#ff9f0a" font-size="11" text-anchor="middle">SQLite</text>
  <text x="780" y="243" fill="#636366" font-size="10" text-anchor="middle">data/openchat.db</text>
  <text x="780" y="258" fill="#636366" font-size="10" text-anchor="middle">conversations</text>
  <text x="780" y="272" fill="#636366" font-size="10" text-anchor="middle">messages + exact_tokens</text>

  <!-- === ARROWS === -->
  <!-- Main → Backend (spawn) -->
  <line x1="140" y1="185" x2="140" y2="228" stroke="#48484a" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="148" y="212" fill="#636366" font-size="9">spawn</text>

  <!-- Main ↔ Renderer (contextBridge IPC) -->
  <line x1="240" y1="100" x2="278" y2="100" stroke="#48484a" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="243" y="96" fill="#636366" font-size="9">IPC</text>

  <!-- Renderer api-client → Backend -->
  <line x1="380" y1="340" x2="245" y2="340" stroke="#ff9f0a" stroke-width="1.5" stroke-dasharray="4,2" marker-end="url(#arrOrange)"/>
  <text x="278" y="333" fill="#ff9f0a" font-size="9">HTTP/SSE</text>

  <!-- Backend → LM Studio -->
  <line x1="698" y1="105" x2="224" y2="290" stroke="#bf5af2" stroke-width="1.5" stroke-dasharray="4,2" marker-end="url(#arrPurple)"/>

  <!-- Backend → SQLite -->
  <line x1="700" y1="240" x2="222" y2="460" stroke="#ff9f0a" stroke-width="1.5" stroke-dasharray="4,2" marker-end="url(#arrOrange)"/>

  <!-- Arrow markers -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#48484a"/>
    </marker>
    <marker id="arrOrange" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#ff9f0a"/>
    </marker>
    <marker id="arrPurple" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#bf5af2"/>
    </marker>
  </defs>

  <!-- Legend -->
  <rect x="40" y="505" width="820" height="28" rx="6" fill="#2c2c2e"/>
  <circle cx="60" cy="519" r="5" fill="#0a84ff"/>
  <text x="72" y="523" fill="#636366" font-size="10">orchestration React</text>
  <circle cx="200" cy="519" r="5" fill="#30d158"/>
  <text x="212" y="523" fill="#636366" font-size="10">streaming SSE</text>
  <circle cx="320" cy="519" r="5" fill="#ff9f0a"/>
  <text x="332" y="523" fill="#636366" font-size="10">HTTP + SQLite</text>
  <circle cx="440" cy="519" r="5" fill="#bf5af2"/>
  <text x="452" y="523" fill="#636366" font-size="10">LM Studio API</text>
  <circle cx="560" cy="519" r="5" fill="#636366"/>
  <text x="572" y="523" fill="#636366" font-size="10">IPC contextBridge</text>
</svg>

---

## Prérequis

- **Node.js** ≥ 20
- **LM Studio** ≥ 0.3 lancé avec le serveur local activé (port 1234 par défaut)
- Au moins un modèle chargé dans LM Studio

---

## Installation

```bash
git clone <repo>
cd openchat
npm install
```

---

## Lancer en développement

```bash
npm run dev
```

Electron démarre, spawn un serveur Express en backend, et charge l'interface React en renderer. Les trois processus (main, renderer, backend) se relancent automatiquement en cas de modification de fichiers.

---

## Lancer les tests

```bash
npm test
```

255 tests (backend Express + SQLite + renderer store).

---

## Utilisation

### Conversations

- **Nouvelle conversation** — bouton `+` dans la sidebar
- **Renommer** — double-clic sur le titre en haut
- **Sélectionner un modèle** — menu déroulant dans la topbar. Le mode `auto` choisit le modèle automatiquement selon le contenu du message et les modèles chargés dans LM Studio
- **Stopper une réponse** — bouton `Stop` (visible pendant le stream)

### Sessions temporaires

- **⚡ New temp session** — démarre une session sans persistance DB, utile pour tester sans polluer l'historique
- **Save** — promeut la session temporaire en conversation permanente

### Gestion du contexte

La barre de contexte (coin supérieur droit) affiche `tokens utilisés / fenêtre totale` :

| Couleur | Seuil |
|---------|-------|
| Gris    | < 70% |
| Amber   | 70–89% |
| Rouge   | ≥ 90% |

- **Compact** — résume les messages anciens via le LLM, conserve les 4 derniers, insère un marqueur `[Compacted]`. Pendant un stream : met en file d'attente et s'exécute automatiquement après.
- **Auto** (toggle vert dans la topbar) — déclenche automatiquement une compaction avec un toast de 5 secondes annulable dès que le seuil est atteint après un stream

### Fork de conversation

Survoler un message affiche le bouton **⑂ Fork**. Un clic crée une nouvelle conversation indépendante contenant tous les messages jusqu'à ce point. La conversation d'origine reste inchangée.

---

## Structure du projet

```
src/
├── main/           — processus Electron principal, spawn du backend
├── preload/        — contextBridge IPC
├── backend/        — serveur Express + SQLite
│   ├── db.ts               — helpers SQLite (better-sqlite3)
│   ├── lmstudio-client.ts  — client LM Studio (stream + summarize)
│   ├── model-router.ts     — routing automatique de modèle
│   └── routes/
│       ├── conversations.ts — CRUD, fork, compact, tokens
│       └── lmstudio.ts      — modèles, status, chat SSE
└── renderer/       — interface React
    ├── api-client.ts        — client HTTP/SSE vers le backend
    ├── temp-session-store.ts — store in-memory pub/sub
    └── components/
        ├── App.tsx
        ├── Sidebar.tsx
        ├── ChatArea.tsx
        ├── TopBar.tsx
        ├── ContextBar.tsx
        ├── MessageBubble.tsx
        ├── CompactToast.tsx
        └── RoutingWarningBanner.tsx

tests/
├── backend/        — supertest + vitest (Express + SQLite)
└── renderer/       — vitest (store, tokens)
```

---

## Variables d'environnement (backend)

| Variable | Défaut | Description |
|----------|--------|-------------|
| `LM_STUDIO_URL` | `http://localhost:1234` | URL du serveur LM Studio |
| `DB_PATH` | `data/openchat.db` | Chemin vers la base SQLite |
| `PORT` | `0` (auto) | Port du serveur Express |
