/**
 * Unsubscribe from track handler
 */

import { CLIENT_EVENTS } from '@mediasoup-lib/shared';
import { BaseHandler } from './BaseHandler';
import type { HandlerContext } from './types';

export class UnsubscribeHandler extends BaseHandler {
  public readonly type = CLIENT_EVENTS.UNSUBSCRIBE;

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
      const { consumerId } = message;

      // Remove consumer
      participant.removeConsumer(consumerId);

      console.log(`Track unsubscribed: ${consumerId}`);
    } catch (error) {
      console.error('Failed to unsubscribe from track:', error);
    }
  }
}
