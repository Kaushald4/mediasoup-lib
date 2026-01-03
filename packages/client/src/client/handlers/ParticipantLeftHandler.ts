/**
 * Participant left message handler
 */

import { BaseHandler } from './BaseHandler';
import type { HandlerContext } from './types';

export class ParticipantLeftHandler extends BaseHandler {
  public readonly type = 'participant_left';

  public handle(context: HandlerContext, message: any): void {
    const client = context.client as any;

    const participant = client.participants.get(message.participantSid);
    if (participant) {
      participant.removeAllListeners();
      client.participants.delete(message.participantSid);
      this.emit(context, 'participant-left', participant);
    }
  }
}
