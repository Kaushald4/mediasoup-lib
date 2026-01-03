/**
 * Track published message handler
 */

import { BaseHandler } from './BaseHandler';
import type { HandlerContext } from './types';

export class TrackPublishedHandler extends BaseHandler {
  public readonly type = 'track_published';

  public handle(context: HandlerContext, message: any): void {
    const client = context.client as any;

    const participant = client.participants.get(message.participantSid);
    if (participant) {
      // Update participant with new track
      const info = participant.getInfo();
      info.tracks.push(message.track);
      participant.updateInfo(info);

      // Emit track published event
      this.emit(context, 'track-published', { publication: message.track, participant });

      // Auto-subscribe if enabled
      if (client.options.autoSubscribe !== false) {
        // Initialize WebRTC if not already initialized
        if (!client.isWebRTCInitialized) {
          client.initializeWebRTC().then(() => {
            // Subscribe to the new track
            client
              .subscribeToTrack(message.track.sid)
              .then(() => console.log(`Auto-subscribed to track ${message.track.sid}`))
              .catch((error: Error) => console.error('Failed to auto-subscribe to track:', error));
          });
        } else {
          // Subscribe to the new track
          client
            .subscribeToTrack(message.track.sid)
            .then(() => console.log(`Auto-subscribed to track ${message.track.sid}`))
            .catch((error: Error) => console.error('Failed to auto-subscribe to track:', error));
        }
      }
    }
  }
}
