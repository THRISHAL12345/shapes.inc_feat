import { TurnItem } from '../components/TranscriptView';

export interface CreateSessionPayload {
  topic: string;
  sharedFacts: Record<string, any>;
  initiatorHumanId: string;
  initiatorShapeId: string;
  counterpartyHumanId: string;
  counterpartyShapeId: string;
  initiatorFloor: Record<string, any>;
  initiatorCeiling: Record<string, any>;
  initiatorPriorities?: Record<string, any>;
  visibility?: 'participants_only' | 'participants_and_groups';
  maxTurns?: number;
}

export interface ConsentPayload {
  participantId: string;
  accept: boolean;
  floor?: Record<string, any>;
  ceiling?: Record<string, any>;
  priorities?: Record<string, any>;
}

export interface ResolvePayload {
  humanId: string;
  action: 'accept' | 'counter' | 'ignore';
  counterOffer?: Record<string, any>;
}

export interface SessionResponse {
  id: string;
  topic: string;
  shared_facts: Record<string, any>;
  status: string;
  visibility: string;
  max_turns: number;
  participants: Array<{
    id: string;
    human_id: string;
    shape_id: string;
    role: string;
    consent_status: string;
  }>;
  turns?: TurnItem[];
  resolution?: Record<string, any> | null;
}

const BASE_URL = '/api/negotiate';

export async function createSession(payload: CreateSessionPayload): Promise<SessionResponse> {
  const res = await fetch(`${BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getSession(sessionId: string): Promise<SessionResponse> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function submitConsent(sessionId: string, payload: ConsentPayload): Promise<SessionResponse> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/consent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function triggerTurn(sessionId: string): Promise<SessionResponse> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/turn`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function resolveSession(sessionId: string, payload: ResolvePayload): Promise<{ status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function submitReaction(sessionId: string, shapeId: string, emoji: string): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shapeId, emoji }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function subscribeToSessionStream(
  sessionId: string,
  onEvent: (event: { type: string; data: any }) => void,
  onError?: (err: any) => void
): () => void {
  const eventSource = new EventSource(`${BASE_URL}/sessions/${sessionId}/stream`);

  const handleMessage = (e: MessageEvent, type: string) => {
    try {
      const data = JSON.parse(e.data);
      onEvent({ type, data });
    } catch (err) {
      console.error('Failed to parse SSE data:', err);
    }
  };

  eventSource.addEventListener('consent', (e) => handleMessage(e, 'consent'));
  eventSource.addEventListener('turn', (e) => handleMessage(e, 'turn'));
  eventSource.addEventListener('resolved', (e) => handleMessage(e, 'resolved'));

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    eventSource.close();
  };
}
