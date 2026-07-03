import { INegotiationRepository, defaultRepository } from '../../db/repository';

export interface GuardrailCheckResult {
  allowed: boolean;
  reason?: string;
}

export class NegotiationGuardrails {
  private repo: INegotiationRepository;

  // v1 Scope allowlist keywords & forbidden legal/fault concepts (§6)
  private allowedTopics = [
    'bill', 'split', 'dinner', 'uber', 'cost', 'expense', 'rent share',
    'schedule', 'date', 'time', 'meeting', 'trip', 'budget', 'vacation', 'event'
  ];

  private forbiddenKeywords = [
    'lease term', 'tenant', 'landlord', 'evict', 'fault', 'sue', 'legal',
    'attorney', 'lawyer', 'contract breach', 'damage', 'liability', 'court',
    'custody', 'alimony', 'penalty', 'forfeit'
  ];

  constructor(repo = defaultRepository) {
    this.repo = repo;
  }

  /**
   * §6 Rate limit: max 3 active/recent sessions per user-pair per 7 days.
   */
  async checkRateLimit(humanAId: string, humanBId: string): Promise<GuardrailCheckResult> {
    // In our repository, check all sessions where both humanA and humanB participated within last 7 days
    // For simplicity and robust in-memory checking:
    const now = new Date().getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    
    // Get all sessions
    // To check without adding complex repository queries, we can inspect participants
    let recentSessionCount = 0;
    // We can track timestamps per pair
    const pairKey = [humanAId, humanBId].sort().join(':');
    const timestamps = (NegotiationGuardrails.rateLimitTracker.get(pairKey) || []).filter(t => (now - t) < sevenDaysMs);
    
    if (timestamps.length >= 3) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded: maximum 3 negotiation sessions per user-pair per 7 days (§6). Prevents passive-aggressive spam.',
      };
    }

    return { allowed: true };
  }

  async recordSessionCreation(humanAId: string, humanBId: string): Promise<void> {
    const pairKey = [humanAId, humanBId].sort().join(':');
    const now = new Date().getTime();
    const timestamps = NegotiationGuardrails.rateLimitTracker.get(pairKey) || [];
    timestamps.push(now);
    NegotiationGuardrails.rateLimitTracker.set(pairKey, timestamps);
  }

  /**
   * §6 Scope allowlist: v1 topics allowed are bill-splitting, scheduling/date-picking, simple budget agreement.
   * Rejects legal terms, lease disputes, or fault disputes.
   */
  checkScopeAllowlist(topic: string, sharedFacts: Record<string, any> = {}): GuardrailCheckResult {
    const textToScan = `${topic} ${JSON.stringify(sharedFacts)}`.toLowerCase();

    // Check forbidden legal / fault terms first
    for (const forbidden of this.forbiddenKeywords) {
      if (textToScan.includes(forbidden)) {
        return {
          allowed: false,
          reason: `Scope violation: detected legal/fault term '${forbidden}'. v1 is strictly for non-binding daily recommendations and rejects legal or dispute mediation (§6). Route to human legal review.`,
        };
      }
    }

    // Check allowlist match
    const matchesAllowlist = this.allowedTopics.some(allowed => textToScan.includes(allowed));
    if (!matchesAllowlist) {
      // If it doesn't clearly match bill split, date picking, or budget, reject or flag
      return {
        allowed: false,
        reason: `Scope violation: topic '${topic}' does not match v1 allowlisted topics (bill-splitting, scheduling/date-picking, simple budget agreement) (§6).`,
      };
    }

    return { allowed: true };
  }

  // Static tracker for rate limit testing across instances
  private static rateLimitTracker: Map<string, number[]> = new Map();

  static resetTracker(): void {
    NegotiationGuardrails.rateLimitTracker.clear();
  }
}

export const defaultGuardrails = new NegotiationGuardrails();
