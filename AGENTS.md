# AGENTS.md — "Shape vs Shape" Delegated Negotiation Feature

> This file is the operating manual for any AI coding agent (Claude Code, Cursor,
> Devin, etc.) working on this feature. Read it fully before writing code.
> If a decision here conflicts with a ticket, this file wins unless the ticket
> explicitly says "overrides AGENTS.md."

---

## 0. What we're building, in one paragraph

Two users, each with their own persistent AI "shape," delegate a real-world
negotiation (splitting a bill, picking a date, agreeing a trip budget) to their
shapes. The shapes negotiate each other in a **visible, spectator-friendly
sub-thread**, using private constraints their own human set (a floor/ceiling
never shown to the other shape), and converge on a **non-binding recommendation**
that both humans can accept, counter, or override. This is not an automation
that moves money or books anything — v1 is pure recommendation + transcript.

Codename in this repo: `negotiate`. All routes, tables, and env vars are
prefixed `negotiate_` / `NEGOTIATE_`.

---

## 1. Non-negotiables (pun intended)

These are hard constraints. An agent should refuse to "simplify past" these,
even under time pressure:

1. **Constraint isolation is absolute.** Shape A's LLM context must never
   contain Shape B's private floor/ceiling/priority weights, and vice versa.
   This is enforced at the data-access layer, not just prompt discipline —
   see §5.2.
2. **Consent before spawn, every time.** No negotiation session starts without
   an explicit accept from the second human. No standing/blanket permission in
   v1, even if the same two people negotiated last week.
3. **Nothing executes.** No payments, no calendar writes, no bookings. Output
   is a recommendation object. This is a hard scope wall for v1 — do not let a
   ticket sneak in a "quick Stripe integration."
4. **Every AI turn is logged verbatim** in an append-only transcript table.
   Users must always be able to see exactly what their shape said and why.
5. **Impasse is a valid, first-class outcome**, not an error state. Design for
   it from the schema up.

---

## 2. Tech stack assumptions

Adjust if the host repo differs, but default to:

- **Backend:** Node.js (TypeScript), Fastify or Express
- **DB:** Postgres (negotiation state, transcripts), Redis (session locks,
  turn-taking pub/sub)
- **LLM calls:** Anthropic Messages API, model `claude-sonnet-4-6` for
  negotiation turns, cheaper/faster model acceptable for the consent-request
  copy and impasse summaries
- **Realtime:** WebSocket or SSE for the live sub-thread (spectators watch
  turns stream in)
- **Frontend:** React + Tailwind, matching design tokens in §7

If the existing shapes.inc codebase uses something else, conform to the
existing stack — do not introduce a second framework for this feature alone.

---

## 3. User flow (implement in this order)

### 3.1 Initiation
- User A, inside an existing chat with their shape, expresses negotiation
  intent (either explicit slash-command `/negotiate @userB <topic>` or
  detected naturally — natural-language detection is a stretch goal, ship
  slash-command first).
- Shape A extracts: topic, shared facts (amount, dates, headcount — whatever's
  in the visible chat already), and asks User A privately for their
  floor/ceiling and priority (fast form, not open text — see §7.3 for the
  widget).

### 3.2 Consent
- Shape A's backend creates a `NegotiationSession` in `pending_consent`.
- Shape B receives a DM-style card: topic, shared facts, **no mention of A's
  floor/ceiling**, and Accept / Decline / "Let me set my terms first" actions.
- On Accept, Shape B is walked through the same private constraint capture
  User A did.
- On Decline or timeout (default 24h), session status → `expired`. Shape A
  tells User A plainly, no guilt-tripping copy.

### 3.3 Negotiation loop
- Session → `active`. A sub-thread is created, visible to both users (and,
  per settings, their shared friend group — see §6 visibility levels).
- Turn-taking is strict alternation, server-enforced (§5.3), not
  first-to-respond.
- Each turn: shape calls the LLM with its own private context, produces an
  `offer` + `rationale`, posts to the transcript, updates the live "gap
  meter."
- Loop ends on: **convergence** (both shapes' current offers are within a
  tolerance band, or one accepts the other's offer), **impasse** (a shape
  flags no further movement is possible within its constraints), or
  **timeout** (max turns, default 12, configurable).

### 3.4 Resolution
- On convergence: generate a summary card (terms, confidence, which
  constraints were binding) and DM both users independently.
- On impasse: generate a plain-language "here's actually where you disagree"
  summary — this is often more useful than a forced deal. Do not have the
  shape pretend to be neutral; each shape's DM to its own human can note where
  it thinks its human should flex, if asked.
- Users can Accept, Counter (manually, outside the AI loop), or Ignore. Log
  the resolution outcome for future tuning of the shapes' negotiation
  posture — do not use it to silently change constraint weights without
  telling the user.

---

## 4. Data model

```sql
-- Core session
CREATE TABLE negotiate_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  shared_facts JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN (
    'pending_consent', 'active', 'converged', 'impasse', 'expired', 'timeout'
  )),
  visibility TEXT NOT NULL DEFAULT 'participants_and_groups'
    CHECK (visibility IN ('participants_only', 'participants_and_groups')),
  max_turns INT NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- One row per human/shape pair in the session
CREATE TABLE negotiate_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES negotiate_sessions(id),
  human_id UUID NOT NULL,
  shape_id UUID NOT NULL,
  role TEXT NOT NULL, -- e.g. 'initiator', 'counterparty'
  consent_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (consent_status IN ('pending', 'accepted', 'declined')),
  UNIQUE(session_id, human_id)
);

-- PRIVATE constraints — row-level security keyed to owning shape only.
-- Never joined into a query that also touches the other participant's row
-- in the same application code path. See §5.2.
CREATE TABLE negotiate_private_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES negotiate_sessions(id),
  participant_id UUID NOT NULL REFERENCES negotiate_participants(id),
  floor_value JSONB NOT NULL,
  ceiling_value JSONB NOT NULL,
  priority_weights JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only, visible transcript
CREATE TABLE negotiate_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES negotiate_sessions(id),
  participant_id UUID NOT NULL REFERENCES negotiate_participants(id),
  turn_number INT NOT NULL,
  offer JSONB NOT NULL,
  rationale TEXT NOT NULL,
  gap_after JSONB, -- computed gap metric snapshot for the live meter
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, turn_number)
);

CREATE TABLE negotiate_resolutions (
  session_id UUID PRIMARY KEY REFERENCES negotiate_sessions(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('converged', 'impasse', 'timeout')),
  final_terms JSONB,
  confidence NUMERIC,
  divergence_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Agent instruction:** when writing the data-access layer, put
`negotiate_private_constraints` behind a repository method that takes a
`shapeId` and throws if called from a code path currently building context
for a *different* `shapeId`'s LLM call. Add a lint rule or code comment
trail, not just convention — this is the one thing that must not regress in a
future refactor.

---

## 5. Backend architecture

### 5.1 Service boundaries
- `negotiation-orchestrator` — owns session lifecycle, turn sequencing,
  timeouts.
- `negotiation-llm-service` — the *only* service allowed to build prompts and
  call the Anthropic API for negotiation turns. Takes `(sessionId,
  participantId)`, returns `{offer, rationale}`. It fetches shared_facts +
  that participant's own private constraints + full turn history — nothing
  else.
- `negotiation-notify-service` — handles consent requests, resolution DMs.

Keep these as separate modules even in a monolith. The isolation in §1.1 is
much easier to audit if `negotiation-llm-service` is the single choke point
for anything touching an LLM call.

### 5.2 Constraint isolation implementation
```ts
// negotiation-llm-service/buildContext.ts
async function buildTurnContext(sessionId: string, participantId: string) {
  const session = await getSession(sessionId);
  const history = await getVisibleTurns(sessionId); // both sides, public
  const ownConstraints = await getPrivateConstraints(sessionId, participantId);
  // NOTE: do not add a "getOtherParticipantConstraints" call here, ever.
  // If a future feature needs cross-visibility (e.g. a debug/admin view),
  // it must live in a completely separate, explicitly-named admin path,
  // never inside buildTurnContext.
  return {
    topic: session.topic,
    sharedFacts: session.shared_facts,
    ownFloor: ownConstraints.floor_value,
    ownCeiling: ownConstraints.ceiling_value,
    ownPriorities: ownConstraints.priority_weights,
    turnHistory: history,
  };
}
```

### 5.3 Turn sequencing
- Use a Redis lock keyed by `session_id` to guarantee strict alternation —
  reject any turn submission attempt that's out of order rather than trusting
  client-side sequencing.
- Each turn generation is a single LLM call. Do not let a shape "see" the
  result of its own call before committing it — no silent retries that let
  the model second-guess itself invisibly; if a turn is regenerated, log the
  discarded attempt too (transparency over tidiness).

### 5.4 System prompt for negotiation turns (starting point — tune, don't skip)

```
You are {shape_name}, negotiating on behalf of {human_name} in a visible
group-chat negotiation. The other party is also an AI shape, negotiating for
their own human.

Topic: {topic}
Shared facts (visible to both sides): {shared_facts}
Your human's floor: {own_floor}
Your human's ceiling: {own_ceiling}
Your human's priorities, in order: {own_priorities}

Turn history so far (all turns, both sides):
{turn_history}

Rules:
- Advocate genuinely for your human's stated interests.
- You are optimizing for a deal both humans would actually ratify, not for
  "winning" the exchange. A technically-better number that damages the
  friendship is a failed negotiation.
- Never reveal or guess at the other side's floor/ceiling as if you knew it;
  you don't have that information and shouldn't pretend to.
- If you believe your human's stated floor is unreasonable given the shared
  facts, you already flagged that privately before this session started —
  don't relitigate it mid-negotiation, just work within it.
- Respond with a concrete offer plus a short (2-3 sentence) rationale a
  spectator could understand.
- If you see no further room to move without breaching your ceiling/floor,
  say so plainly and flag impasse rather than making a token move.

Output format: JSON {"offer": {...}, "rationale": "...", "flag_impasse": bool}
```

### 5.5 Pre-session sanity check
Before a session can leave `pending_consent`, run each human's stated
floor/ceiling through a lightweight LLM call (same model, cheap) that checks
for obvious bad-faith asks against the shared facts (e.g., "pay $0 of a
mandatory shared cost"). If flagged, the shape raises it with its own human
**privately, before the session activates** — never surface this check to the
other party.

---

## 6. Visibility & guardrails

- `visibility = participants_and_groups` is the default: the sub-thread is
  visible to both users' shared chat context, muted by default (no push spam
  per turn, one push on resolution).
- Rate limit: max 3 active sessions per user-pair per 7 days, to prevent this
  becoming a passive-aggressive weapon ("my shape already messaged your
  shape about the money you owe me" spam).
- Scope allowlist for v1 topics: bill-splitting, scheduling/date-picking,
  simple budget agreement. Reject/route-to-human anything tagged as
  lease terms, "fault" disputes, or anything with legal language detected —
  that's a v2+ decision requiring actual legal review, not a prompt tweak.
- Reaction "nudges": each human can emoji-react to their **own** shape's
  offers mid-negotiation; that reaction is appended to that shape's next
  context as a soft signal, never shown to the other side.

---

## 7. Frontend — visual spec (Shapes.inc dark theme)

> Color values below are a best-effort dark-purple/violet system consistent
> with shapes.inc's visual identity. Treat every hex as a named token, not a
> hardcoded literal, so a design-token swap is a one-file change.

### 7.1 Design tokens

```css
:root {
  /* Backgrounds */
  --shapes-bg-void: #0b0713;        /* deepest background, app shell */
  --shapes-bg-surface: #150f24;     /* cards, panels */
  --shapes-bg-surface-raised: #1e1533; /* modals, elevated cards */
  --shapes-bg-hover: #271c40;

  /* Purple/violet brand ramp */
  --shapes-violet-100: #efe7ff;
  --shapes-violet-300: #c9aeff;
  --shapes-violet-500: #9b6bff;   /* primary brand accent */
  --shapes-violet-700: #6f3fd6;
  --shapes-violet-900: #3a1f73;

  /* Secondary accent — for "shape B" side / contrast */
  --shapes-cyan-400: #5ce1e6;

  /* Semantic */
  --shapes-success: #4ade80;
  --shapes-warning: #fbbf24;
  --shapes-danger: #f87171;

  /* Text */
  --shapes-text-primary: #f5f2fb;
  --shapes-text-secondary: #b8aed1;
  --shapes-text-muted: #7a6f96;

  /* Borders */
  --shapes-border-subtle: rgba(155, 107, 255, 0.15);
  --shapes-border-strong: rgba(155, 107, 255, 0.4);

  /* Radii / spacing (match existing shapes.inc rounded, soft-glow aesthetic) */
  --shapes-radius-sm: 8px;
  --shapes-radius-md: 14px;
  --shapes-radius-lg: 24px;
  --shapes-glow: 0 0 24px rgba(155, 107, 255, 0.25);
}
```

### 7.2 Negotiation sub-thread UI spec

Layout: full-width panel embedded in the chat, distinct from normal message
bubbles so it visually reads as "a different kind of event."

- **Header bar:** topic title, both shapes' avatars facing each other
  (mirror-image layout, left = initiator's shape in `--shapes-violet-500`,
  right = counterparty's shape in `--shapes-cyan-400`), status pill
  (Pending / Live / Converged / Impasse) with a soft pulsing glow while live.
- **Gap meter:** horizontal bar between the two avatars, animates as offers
  come in — label like "$340 apart → $60 apart," color interpolates from
  `--shapes-danger` toward `--shapes-success` as gap closes.
- **Transcript:** alternating offer cards, left-aligned for initiator's
  shape, right-aligned for counterparty's shape, each card = offer headline +
  rationale in `--shapes-text-secondary`, timestamp in `--shapes-text-muted`.
  Card background `--shapes-bg-surface`, border `--shapes-border-subtle`,
  `--shapes-radius-md`.
- **Own-side nudge reactions:** small emoji reaction row under only *your*
  shape's cards (never under the other shape's cards), subtle, no counts
  shown publicly.
- **Resolution card:** on convergence/impasse, a distinct
  `--shapes-bg-surface-raised` card with `--shapes-glow`, big terms summary,
  Accept / Counter / Ignore buttons using `--shapes-violet-500` as primary
  CTA fill.

### 7.3 Private constraint capture widget

Short, structured, never open free-text for the numeric floor/ceiling
(reduces prompt-injection surface and keeps the sanity-check in §5.5
tractable): stepper/slider inputs for numeric asks, single-select for
priority ranking. Style: modal on `--shapes-bg-surface-raised`, inputs with
`--shapes-border-strong` focus rings in `--shapes-violet-500`.

---

## 8. API surface (draft — align with existing shapes.inc API conventions)

```
POST   /api/negotiate/sessions                 create + send consent request
POST   /api/negotiate/sessions/:id/consent      accept/decline
POST   /api/negotiate/sessions/:id/constraints  submit private floor/ceiling
GET    /api/negotiate/sessions/:id              session + public transcript
GET    /api/negotiate/sessions/:id/stream       SSE/WS live turns
POST   /api/negotiate/sessions/:id/resolve      user accepts/counters/ignores
POST   /api/negotiate/sessions/:id/react        own-side nudge reaction
```

All private-constraint fields are explicitly excluded from the `GET
/sessions/:id` response schema — enforce with a response DTO, not
post-hoc field stripping.

---

## 9. Build order for the agent

1. Schema + migrations (§4)
2. `negotiation-llm-service` with constraint isolation (§5.2, §5.4) — write
   the isolation test **first**: assert that context built for participant A
   never contains any key from participant B's constraints table, even via
   deep object inspection.
3. Orchestrator: session lifecycle, consent flow, turn-locking (§5.3)
4. Resolution + notify service
5. API layer (§8)
6. Frontend: design tokens (§7.1) → transcript view (read-only, seeded with
   fixture data) → live streaming → constraint capture widget → resolution
   card
7. Guardrails pass: rate limits, scope allowlist, sanity-check LLM call (§5.5,
   §6)
8. End-to-end test: two fixture users, full happy path to convergence, and a
   second run forced to impasse

## 10. Definition of done for v1

- [ ] Isolation test passing and part of CI, not just written once
- [ ] Consent required and enforced server-side (not just hidden in UI)
- [ ] Full transcript persisted and user-visible for every past session
- [ ] Impasse path produces a genuinely useful plain-language summary, tested
      with at least 3 distinct scenario fixtures
- [ ] No code path that writes to payments/calendar/booking systems
- [ ] Rate limits and scope allowlist enforced server-side
- [ ] Design tokens centralized in one file, zero hardcoded hex values in
      components
