<p align="center">
  <img src="https://img.shields.io/badge/shapes.inc-Delegated_Negotiation-9b6bff?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMiAxNWwtNS01IDEuNDEtMS40MUwxMCAxNC4xN2w3LjU5LTcuNTlMMTkgOGwtOSA5eiIvPjwvc3ZnPg==&logoColor=white" alt="Shapes.inc" />
  <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/React_18-Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Tests-23%2F23_Passing-4ade80?style=for-the-badge&logo=vitest&logoColor=white" alt="Tests" />
</p>

<br/>

<h1 align="center">
  ⚡ Shape vs Shape
  <br/>
  <sub>Delegated Negotiation Engine</sub>
</h1>

<p align="center">
  <strong>Two AI shapes. Two humans. One visible negotiation thread.</strong>
  <br/>
  <em>Your shape advocates for you with constraints you set — floor, ceiling, priorities — <br/>and neither shape ever sees the other side's private terms.</em>
</p>

<br/>

<p align="center">
  <code>🟣 Shape A proposes $50</code>&nbsp;&nbsp;→&nbsp;&nbsp;<code>🔵 Shape B counters $70</code>&nbsp;&nbsp;→&nbsp;&nbsp;<code>🟣 Shape A meets at $58</code>&nbsp;&nbsp;→&nbsp;&nbsp;<code>🔵 Shape B accepts $60</code>&nbsp;&nbsp;→&nbsp;&nbsp;<strong>✅ Converged</strong>
</p>

---

## 🧠 What Is This?

You and a friend need to split a bill, pick a date, or agree on a trip budget. Instead of awkward back-and-forth, you each tell your AI **shape** what you actually want — your floor, your ceiling, your priorities — and then sit back and watch.

Your shapes negotiate **in a visible, spectator-friendly sub-thread**. They advocate for you genuinely, converge toward a deal both humans would actually ratify, or — if the gap is truly unbridgeable — flag an **impasse** with a plain-language explanation of where you actually disagree.

**This is not automation.** Nothing moves money, books anything, or writes to your calendar. v1 is pure **recommendation + transcript**. Both humans Accept, Counter, or Ignore.

> **Codename:** `negotiate`  
> **Prefix convention:** All routes, tables, and env vars use `negotiate_` / `NEGOTIATE_`

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite + Tailwind)        │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────────┐   │
│  │ HeaderBar│ │ GapMeter │ │Transcript │ │ ResolutionCard   │   │
│  │ (avatars)│ │(animated)│ │ (L/R alt) │ │(Accept/Counter)  │   │
│  └──────────┘ └──────────┘ └───────────┘ └──────────────────┘   │
│  ┌────────────────────┐  ┌───────────────────────────────────┐   │
│  │ ConstraintModal    │  │ NudgeReactions (own-side only)    │   │
│  │ (slider, no text)  │  │ (emoji → private shape signal)   │   │
│  └────────────────────┘  └───────────────────────────────────┘   │
└────────────────────────────┬─────────────────────────────────────┘
                             │ REST + SSE
┌────────────────────────────▼─────────────────────────────────────┐
│                        Backend (Express + TypeScript)             │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              negotiation-orchestrator                        │  │
│  │  Session lifecycle · Consent flow · Turn sequencing          │  │
│  │  Convergence/Impasse/Timeout detection                       │  │
│  └─────────────┬───────────────────────────────┬───────────────┘  │
│                │                               │                  │
│  ┌─────────────▼──────────────┐  ┌─────────────▼──────────────┐  │
│  │  negotiation-llm-service   │  │  negotiation-notify-service │  │
│  │  buildContext() [ISOLATED] │  │  Consent cards · Resolution │  │
│  │  System prompt (§5.4)      │  │  DMs · Event emitter        │  │
│  │  Sanity check (§5.5)       │  └────────────────────────────┘  │
│  │  OpenRouter API            │                                   │
│  └────────────────────────────┘                                   │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │   Guardrails      │  │    TurnLock       │  │  DTO Layer     │  │
│  │ Rate limit (3/7d) │  │ Redis / InMemory  │  │ Private fields │  │
│  │ Scope allowlist   │  │ Strict alternation│  │ NEVER exposed  │  │
│  └──────────────────┘  └──────────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         │                    │
    ┌────▼────┐          ┌────▼────┐
    │Postgres │          │  Redis  │
    │Sessions │          │  Locks  │
    │Turns    │          │  Pub/Sub│
    │Constraints│        └─────────┘
    └─────────┘
```

---

## 🔒 The One Rule That Cannot Break

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Shape A's LLM context must NEVER contain Shape B's       │
│   private floor / ceiling / priority weights.               │
│                                                             │
│   This is enforced at the DATA-ACCESS LAYER with runtime    │
│   ConstraintIsolationError throws — not just prompt         │
│   discipline, not just convention.                          │
│                                                             │
│   5 tests verify this. It cannot silently regress.          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**

```typescript
// repository.getPrivateConstraints() — the only gate to private data
async getPrivateConstraints(sessionId, participantId, requestingShapeId, currentContextShapeId?) {
  // Rule 1: Requesting shape must own the constraints
  if (participant.shape_id !== requestingShapeId)
    throw new ConstraintIsolationError(/* ... */);

  // Rule 2: If building LLM context for a different shape, BLOCK
  if (currentContextShapeId && currentContextShapeId !== participant.shape_id)
    throw new ConstraintIsolationError(/* ... */);
}
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- (Optional) Docker for Postgres + Redis

### 1. Clone & Install

```bash
git clone https://github.com/THRISHAL12345/shapes.inc_feat.git
cd shapes.inc_feat
npm install
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
OPENROUTER_API_KEY=your_openrouter_key_here   # Required for live LLM turns
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/negotiate_db
REDIS_URL=redis://localhost:6379
```

### 3. Start Infrastructure (Optional — for Postgres/Redis)

```bash
docker compose up -d
```

### 4. Run Tests

```bash
npm test
```

```
 ✓ src/db/__tests__/repository.test.ts              (2 tests)
 ✓ src/services/guardrails/__tests__/guardrails.test.ts  (3 tests)
 ✓ src/services/llm/__tests__/constraint-isolation.test.ts  (3 tests)
 ✓ src/services/llm/__tests__/llmService.test.ts     (2 tests)
 ✓ src/services/orchestrator/__tests__/orchestrator.test.ts  (4 tests)
 ✓ src/api/__tests__/routes.test.ts                  (5 tests)
 ✓ src/e2e/__tests__/negotiation.e2e.test.ts         (4 tests)

 Test Files  7 passed (7)
      Tests  23 passed (23)
```

### 5. Run Backend

```bash
cd backend && npm run dev
```

### 6. Run Frontend

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` — you'll see the interactive spectator UI with three demo scenarios.

---

## 🎯 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/negotiate/sessions` | Create session + send consent request |
| `POST` | `/api/negotiate/sessions/:id/consent` | Accept or decline negotiation |
| `POST` | `/api/negotiate/sessions/:id/constraints` | Submit private floor/ceiling/priorities |
| `GET` | `/api/negotiate/sessions/:id` | Session + public transcript (⚠️ no private data) |
| `GET` | `/api/negotiate/sessions/:id/stream` | SSE live turn stream |
| `POST` | `/api/negotiate/sessions/:id/turn` | Trigger next AI negotiation turn |
| `POST` | `/api/negotiate/sessions/:id/resolve` | Human accepts / counters / ignores |
| `POST` | `/api/negotiate/sessions/:id/react` | Own-side emoji nudge reaction |

> **Security:** The `GET /sessions/:id` response is built with a **response DTO** that explicitly constructs the output — private constraint fields (`floor_value`, `ceiling_value`, `priority_weights`) are never included, not even stripped post-hoc.

---

## 🎨 Design System

The entire UI runs on centralized design tokens. **Zero hardcoded hex values in any component.**

```css
:root {
  --shapes-bg-void: #0b0713;           /* deepest background */
  --shapes-bg-surface: #150f24;        /* cards, panels */
  --shapes-bg-surface-raised: #1e1533; /* modals, elevated cards */

  --shapes-violet-500: #9b6bff;        /* primary brand accent */
  --shapes-cyan-400: #5ce1e6;          /* counterparty accent */

  --shapes-success: #4ade80;           /* convergence */
  --shapes-danger: #f87171;            /* impasse / large gap */

  --shapes-glow: 0 0 24px rgba(155, 107, 255, 0.25);
}
```

Want a different theme? Change one file. Everything follows.

---

## 🧪 Test Coverage Map

| Layer | File | What It Verifies |
|-------|------|-----------------|
| **Data** | `repository.test.ts` | Session/participant CRUD, **constraint isolation throws** |
| **Isolation** | `constraint-isolation.test.ts` | Deep object inspection for cross-shape leaks, forbidden string detection, cross-context DB fetch rejection |
| **LLM** | `llmService.test.ts` | Turn generation, **bad-faith $0 ask detection** (§5.5) |
| **Orchestrator** | `orchestrator.test.ts` | Full lifecycle (initiate → consent → active → converge), consent decline → expire, turn alternation, **concurrent lock rejection** |
| **API** | `routes.test.ts` | DTO private field stripping, consent handling, **emoji reaction security** |
| **E2E** | `negotiation.e2e.test.ts` | Happy-path convergence, **3 distinct impasse fixtures** (bill-split gap, scheduling conflict, budget priority clash) |

---

## 🛡️ Guardrails

| Guardrail | Implementation | Why |
|-----------|---------------|-----|
| **Rate limit** | Max 3 sessions per user-pair per 7 days | Prevents "my shape already messaged your shape about the money you owe me" passive-aggressive spam |
| **Scope allowlist** | Bill-splitting, scheduling, simple budget only | v1 is not equipped for lease terms, fault disputes, or legal language — route those to human review |
| **Sanity check** | Pre-session LLM call flags obvious bad-faith asks | Catches "$0 for a mandatory shared cost" before the session activates |
| **Turn lock** | Redis `SET NX PX` / InMemory mutex | Strict alternation — no concurrent or out-of-order turns |
| **Nudge isolation** | Emoji reactions visible only to own shape | Your 👍 on your shape's offer is a private signal, never shown to the other side |

---

## 📁 Project Structure

```
shapes.inc_feat/
├── AGENTS.md                    # The operating manual — this file wins
├── docker-compose.yml           # Postgres 16 + Redis 7
├── package.json                 # Workspace root
│
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # Express app entry
│       ├── db/
│       │   ├── types.ts         # Session, Participant, Turn, Resolution types
│       │   ├── schema.sql       # Postgres DDL (§4)
│       │   ├── repository.ts    # InMemory repo with isolation enforcement
│       │   └── pg-repository.ts # Production Postgres repo
│       ├── api/
│       │   ├── routes.ts        # REST + SSE endpoints (DI factory)
│       │   └── dto.ts           # Response DTO — private fields EXCLUDED
│       ├── services/
│       │   ├── orchestrator/    # Session lifecycle, turn sequencing
│       │   ├── llm/             # buildContext, system prompt, OpenRouter
│       │   ├── lock/            # ITurnLock (Redis + InMemory)
│       │   ├── notify/          # Consent cards, resolution DMs
│       │   └── guardrails/      # Rate limits, scope allowlist
│       └── e2e/
│           └── __tests__/       # Full lifecycle E2E tests
│
└── frontend/
    ├── index.html
    ├── tailwind.config.js       # Tokens via CSS vars only
    ├── vite.config.ts
    └── src/
        ├── index.css            # §7.1 design tokens (single source)
        ├── App.tsx              # 3-scenario interactive demo
        └── components/
            ├── HeaderBar.tsx        # Mirror-image avatars + status pill
            ├── GapMeter.tsx         # Animated convergence bar
            ├── TranscriptView.tsx   # L/R alternating offer cards
            ├── ConstraintModal.tsx  # Slider inputs, no free text
            ├── ResolutionCard.tsx   # Accept / Counter / Ignore
            └── NudgeReactions.tsx   # Own-side emoji reactions
```

---

## 🔮 What v1 Explicitly Does NOT Do

These are intentional scope walls, not TODOs:

- ❌ Move money (no Stripe, no Venmo, no nothing)
- ❌ Write to calendars or booking systems
- ❌ Handle lease terms, fault disputes, or anything with legal language
- ❌ Allow standing/blanket negotiation permissions between users
- ❌ Let shapes silently change constraint weights based on past outcomes
- ❌ Natural language negotiation intent detection (slash-command only)

---

## 📜 License

ISC

---

<p align="center">
  <br/>
  <strong>Built for the shapes that negotiate so you don't have to.</strong>
  <br/>
  <sub>Shapes.inc — Delegated Negotiation Feature · 2026</sub>
</p>
