/**
 * Track muted message handler
 */

import { BaseHandler } from './BaseHandler';
import type { HandlerContext } from './types';

export class TrackMutedHandler extends BaseHandler {
  public readonly type = 'track_muted';

  public handle(context: HandlerContext, message: any): void {
    const client = context.client as any;

    const participant = client.participants.get(message.participantSid);
    if (participant) {
      participant.updateInfo(message.participant);
      const publication = participant.getTrack(message.trackSid);
      if (publication && publication.track) {
        this.emit(context, 'track-muted', { track: publication.track, participant });
      }
    }
  }
}
