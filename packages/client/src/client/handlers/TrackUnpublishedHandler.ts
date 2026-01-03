/**
 * Track unpublished message handler
 */

import { BaseHandler } from './BaseHandler';
import type { HandlerContext } from './types';

export class TrackUnpublishedHandler extends BaseHandler {
  public readonly type = 'track_unpublished';

  public handle(context: HandlerContext, message: any): void {
    const client = context.client as any;

    const participant = client.participants.get(message.participantSid);
    if (participant) {
      // Get the publication before removing it
      const publication = participant.getTrack(message.trackSid);

      // Remove the track from participant's tracks map
      (participant as any).tracks.delete(message.trackSid);

      // Emit track-unpublished event
      if (publication) {
        (publication as any).clearTrack();
        this.emit(context, 'track-unpublished', { publication, participant });
      }

      console.log(
        `Track unpublished: ${message.trackSid} from participant ${participant.identity}`
      );
    }
  }
}
