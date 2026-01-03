/**
 * Unpublish track handler
 */

import { CLIENT_EVENTS } from '@mediasoup-lib/shared';
import { BaseHandler } from './BaseHandler';
import type { HandlerContext } from './types';

export class UnpublishHandler extends BaseHandler {
  public readonly type = CLIENT_EVENTS.UNPUBLISH;

  public async handle(context: HandlerContext, message: any): Promise<void> {
    if (!this.validateParticipant(context)) {
      return;
    }

    const room = this.getRoom(context);
    if (!room) {
      return;
    }

    const participant = this.getParticipant(context);
    if (!participant) {
      return;
    }

    try {
      const { producerId, trackSid } = message;

      // Remove producer
      participant.removeProducer(producerId);

      // Notify other participants
      context.broadcast(
        room,
        {
          type: 'track_unpublished',
          participantSid: participant.sid,
          trackSid,
        },
        context.ws.socketId
      );

      console.log(`Track unpublished: ${trackSid}`);
    } catch (error) {
      console.error('Failed to unpublish track:', error);
    }
  }
}
