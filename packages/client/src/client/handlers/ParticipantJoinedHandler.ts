/**
 * Participant joined message handler
 */

import type { TrackSubscribeOptions } from '../../types';
import { BaseHandler } from './BaseHandler';
import type { HandlerContext } from './types';
import { RemoteParticipantImpl } from '../Participant';

export class ParticipantJoinedHandler extends BaseHandler {
  public readonly type = 'participant_joined';

  public handle(context: HandlerContext, message: any): void {
    const client = context.client as any;

    const participant = new RemoteParticipantImpl(message.participant);
    participant.setSubscribeCallback(
      async (sid: string, subscribed: boolean, options?: TrackSubscribeOptions) => {
        if (subscribed) {
          client.subscribeToTrack(sid, options);
        } else {
          client.unsubscribeFromTrack(sid);
        }
      }
    );
    client.participants.set(message.participant.sid, participant);
    this.emit(context, 'participant-joined', participant);
  }
}
