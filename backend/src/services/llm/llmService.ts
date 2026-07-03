import OpenAI from 'openai';
import { INegotiationRepository, defaultRepository } from '../../db/repository';
import { buildTurnContext } from './buildContext';

export interface TurnResponse {
  offer: Record<string, any>;
  rationale: string;
  flag_impasse: boolean;
}

export interface SanityCheckResult {
  valid: boolean;
  reason?: string;
}

export class NegotiationLLMService {
  private openai: OpenAI | null = null;
  private model: string;

  constructor(apiKey?: string, model = 'anthropic/claude-3.5-sonnet') {
    const key = apiKey || process.env.OPENROUTER_API_KEY;
    if (key && key !== 'mock' && process.env.NODE_ENV !== 'test') {
      this.openai = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: key,
        defaultHeaders: {
          'HTTP-Referer': 'https://shapes.inc',
          'X-Title': 'Shapes.inc Delegated Negotiation',
        },
      });
    }
    this.model = model;
  }

  /**
   * Builds prompt per §5.4 and calls OpenRouter API (or mock generator in tests)
   */
  async generateTurn(
    sessionId: string,
    participantId: string,
    repo: INegotiationRepository = defaultRepository
  ): Promise<TurnResponse> {
    const context = await buildTurnContext(sessionId, participantId, repo);
    const participant = await repo.getParticipant(sessionId, participantId);
    if (!participant) throw new Error('Participant not found');

    const systemPrompt = `You are ${participant.shape_id}, negotiating on behalf of ${participant.human_id} in a visible group-chat negotiation. The other party is also an AI shape, negotiating for their own human.

Topic: ${context.topic}
Shared facts (visible to both sides): ${JSON.stringify(context.sharedFacts)}
Your human's floor: ${JSON.stringify(context.ownFloor)}
Your human's ceiling: ${JSON.stringify(context.ownCeiling)}
Your human's priorities, in order: ${JSON.stringify(context.ownPriorities)}

Turn history so far (all turns, both sides):
${JSON.stringify(context.turnHistory, null, 2)}

Rules:
- Advocate genuinely for your human's stated interests.
- You are optimizing for a deal both humans would actually ratify, not for "winning" the exchange. A technically-better number that damages the friendship is a failed negotiation.
- Never reveal or guess at the other side's floor/ceiling as if you knew it; you don't have that information and shouldn't pretend to.
- If you believe your human's stated floor is unreasonable given the shared facts, you already flagged that privately before this session started — don't relitigate it mid-negotiation, just work within it.
- Respond with a concrete offer plus a short (2-3 sentence) rationale a spectator could understand.
- If you see no further room to move without breaching your ceiling/floor, say so plainly and flag impasse rather than making a token move.

Output format: JSON {"offer": {...}, "rationale": "...", "flag_impasse": bool}`;

    // If running in test mode or without OpenRouter API key, return a deterministic mock response
    if (!this.openai) {
      return this.generateMockTurn(context, participant.role);
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate your next negotiation turn in strict JSON format.' },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenRouter API');
      }

      const parsed: TurnResponse = JSON.parse(content);
      return {
        offer: parsed.offer || {},
        rationale: parsed.rationale || 'Offer proposed based on constraints.',
        flag_impasse: Boolean(parsed.flag_impasse),
      };
    } catch (error) {
      // §5.3: Log any failed/discarded generation attempts verbatim for transparency
      console.error(`[negotiation-llm-service] Discarded generation attempt for shape ${participant.shape_id}:`, error);
      throw error;
    }
  }

  /**
   * §5.5 Pre-session sanity check:
   * Checks for obvious bad-faith asks against shared facts (e.g., pay $0 of shared cost).
   */
  async checkConstraintsSanity(
    sharedFacts: Record<string, any>,
    floor: Record<string, any>,
    ceiling: Record<string, any>
  ): Promise<SanityCheckResult> {
    if (!this.openai) {
      // Mock sanity check: check if floor/ceiling numbers are obviously negative or zero when total > 0
      const total = sharedFacts.total || sharedFacts.amount || 0;
      if (total > 0 && (floor.amount === 0 || ceiling.amount === 0)) {
        return { valid: false, reason: 'Bad-faith ask detected: proposing $0 for a mandatory shared cost.' };
      }
      return { valid: true };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'openai/gpt-4o-mini', // cheap/fast model per §5.5
        messages: [
          {
            role: 'system',
            content: `Analyze if these private negotiation constraints represent an obvious bad-faith ask against the shared facts (e.g. paying $0 of a shared expense). Return JSON {"valid": bool, "reason": "..."}`,
          },
          {
            role: 'user',
            content: `Shared facts: ${JSON.stringify(sharedFacts)}\nFloor: ${JSON.stringify(floor)}\nCeiling: ${JSON.stringify(ceiling)}`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || '{"valid": true}');
      return {
        valid: Boolean(parsed.valid),
        reason: parsed.reason,
      };
    } catch (err) {
      console.error('[negotiation-llm-service] Sanity check failed, defaulting to valid:', err);
      return { valid: true };
    }
  }

  private generateMockTurn(context: any, role: string): TurnResponse {
    const turnCount = context.turnHistory.length;
    // Simulate convergence after a few turns
    if (turnCount >= 4) {
      return {
        offer: { amount: 60, currency: 'USD' },
        rationale: `We agree to split evenly at $60, satisfying both humans' budget priorities.`,
        flag_impasse: false,
      };
    }

    const isInitiator = role === 'initiator';
    const amount = isInitiator ? 50 + turnCount * 5 : 70 - turnCount * 5;
    return {
      offer: { amount, currency: 'USD' },
      rationale: `${isInitiator ? 'Initiator' : 'Counterparty'} proposes $${amount} based on current priorities and remaining gap.`,
      flag_impasse: false,
    };
  }
}

export const defaultLLMService = new NegotiationLLMService();
