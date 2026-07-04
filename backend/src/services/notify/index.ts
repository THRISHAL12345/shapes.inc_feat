import { EventEmitter } from 'events';
import { NegotiateSession, NegotiateParticipant, NegotiateResolution } from '../../db/types';

export interface ConsentRequestCard {
  sessionId: string;
  topic: string;
  sharedFacts: Record<string, any>;
  initiatorHumanId: string;
  initiatorShapeId: string;
  recipientHumanId: string;
  recipientShapeId: string;
}

export interface ResolutionNotifyCard {
  sessionId: string;
  outcome: string;
  finalTerms?: Record<string, any>;
  divergenceNotes?: string;
  participants: NegotiateParticipant[];
}

export interface TurnNotifyCard {
  sessionId: string;
  turnNumber: number;
  turn: any;
  participant?: any;
}

export class NegotiationNotifyService extends EventEmitter {
  private sentConsentCards: ConsentRequestCard[] = [];
  private sentResolutionCards: ResolutionNotifyCard[] = [];
  private sentTurnCards: TurnNotifyCard[] = [];

  async sendConsentRequest(card: ConsentRequestCard): Promise<void> {
    this.sentConsentCards.push(card);
    this.emit('consent_request', card);
    console.log(`[notify] Sent consent card to shape ${card.recipientShapeId} (human ${card.recipientHumanId}) for session ${card.sessionId}`);
  }

  async sendResolutionNotify(card: ResolutionNotifyCard): Promise<void> {
    this.sentResolutionCards.push(card);
    this.emit('resolution_notify', card);
    console.log(`[notify] Sent resolution card (${card.outcome}) for session ${card.sessionId}`);
  }

  async sendTurnNotify(card: TurnNotifyCard): Promise<void> {
    this.sentTurnCards.push(card);
    this.emit('turn_generated', card);
    console.log(`[notify] Sent turn notification for session ${card.sessionId} (turn ${card.turnNumber})`);
  }

  getSentConsentCards(): ConsentRequestCard[] {
    return this.sentConsentCards;
  }

  getSentResolutionCards(): ResolutionNotifyCard[] {
    return this.sentResolutionCards;
  }

  getSentTurnCards(): TurnNotifyCard[] {
    return this.sentTurnCards;
  }
}

export const defaultNotifyService = new NegotiationNotifyService();
