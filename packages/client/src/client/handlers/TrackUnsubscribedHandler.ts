/**
 * Track unsubscribed message handler
 */

import { BaseHandler } from './BaseHandler';
import type { HandlerContext } from './types';
import { RemoteTrack as RemoteTrackImpl } from '../RemoteTrack';

export class TrackUnsubscribedHandler extends BaseHandler {
  public readonly type = 'track_unsubscribed';

  public handle(context: HandlerContext, message: any): void {
    const client = context.client as any;

    const participant = client.participants.get(message.participantSid);
    if (participant) {
      const publication = participant.getTrack(message.trackSid);
      if (publication) {
        const track = publication.track;
        (publication as any).clearTrack();
        if (track) {
          (track as RemoteTrackImpl).emitUnsubscribed();
          this.emit(context, 'track-unsubscribed', { track, publication, participant });
        }
      }
    }
  }
}
