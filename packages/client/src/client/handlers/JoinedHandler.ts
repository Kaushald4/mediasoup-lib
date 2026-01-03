/**
 * Joined message handler
 */

import type { ParticipantInfo } from '@mediasoup-lib/shared';
import type { TrackSubscribeOptions } from '../../types';
import { BaseHandler } from './BaseHandler';
import type { HandlerContext } from './types';
import { LocalParticipantImpl } from '../LocalParticipant';
import { RemoteParticipantImpl } from '../Participant';

export class JoinedHandler extends BaseHandler {
  public readonly type = 'joined';

  public handle(context: HandlerContext, message: any): void {
    const client = context.client as any;

    // Set room info and RTP capabilities
    client.roomInfo = message.room;
    client.rtpCapabilities = message.rtpCapabilities;

    // Create local participant
    client.localParticipant = new LocalParticipantImpl(message.participant);
    client.localParticipant.setPublishDataCallback(async (data: any, kind: any) => {
      client.send({
        type: 'data',
        kind,
        value: data,
      });
    });

    // Set camera/microphone callbacks
    client.localParticipant.setEnableCameraCallback(() => client.enableCamera());
    client.localParticipant.setDisableCameraCallback(() => client.disableCamera());
    client.localParticipant.setEnableMicrophoneCallback(() => client.enableMicrophone());
    client.localParticipant.setDisableMicrophoneCallback(() => client.disableMicrophone());

    this.emit(context, 'local-participant-joined', client.localParticipant);

    // Add existing participants
    message.otherParticipants.forEach((info: ParticipantInfo) => {
      const participant = new RemoteParticipantImpl(info);
      participant.setSubscribeCallback(
        async (sid: string, subscribed: boolean, options?: TrackSubscribeOptions) => {
          if (subscribed) {
            client.subscribeToTrack(sid, options);
          } else {
            client.unsubscribeFromTrack(sid);
          }
        }
      );
      client.participants.set(info.sid, participant);
      this.emit(context, 'participant-joined', participant);
    });

    // Auto-subscribe to all existing tracks if enabled
    if (client.options.autoSubscribe !== false) {
      // Initialize WebRTC first
      client
        .initializeWebRTC()
        .then(() => client.subscribeToAllTracks())
        .then(() => console.log('Auto-subscribed to all existing tracks'))
        .catch((error: Error) =>
          console.error('Failed to auto-subscribe to existing tracks:', error)
        );
    }
  }
}
