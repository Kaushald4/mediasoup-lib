/**
 * RoomClient - Main client class for connecting to a mediasoup room
 */

import type { RoomInfo, ParticipantInfo } from '@mediasoup-lib/shared';
import type {
  RoomClientOptions,
  RoomEvents,
  LocalParticipant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  TrackSubscribeOptions,
} from '../types';
import { ConnectionState } from '@mediasoup-lib/shared';
import { LocalParticipantImpl } from './LocalParticipant';
import { RemoteParticipantImpl } from './Participant';
import { RemoteTrack as RemoteTrackImpl } from './RemoteTrack';

/**
 * RoomClient - Main client class for connecting to a mediasoup room
 */
export class RoomClient {
  public readonly options: RoomClientOptions;

  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  private roomInfo: RoomInfo | null = null;
  private localParticipant: LocalParticipantImpl | null = null;
  private participants: Map<string, RemoteParticipantImpl> = new Map();

  private listeners: Map<keyof RoomEvents, Set<(data: unknown) => void>> = new Map();
  private pendingMessages: unknown[] = [];

  private sendTransport: any = null;
  private recvTransport: any = null;

  constructor(options: RoomClientOptions) {
    this.options = options;
  }

  /**
   * Connect to the room
   */
  async connect(): Promise<void> {
    try {
      // Connect WebSocket
      await this.connectWebSocket();

      // Send join message
      this.send({
        type: 'join',
        token: this.options.token,
      });

      this.emit('connection-state-changed', ConnectionState.Connected);
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Disconnect from the room
   */
  async disconnect(): Promise<void> {
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Clean up transports
    if (this.sendTransport) {
      await this.sendTransport.close();
      this.sendTransport = null;
    }
    if (this.recvTransport) {
      await this.recvTransport.close();
      this.recvTransport = null;
    }

    // Clean up participants
    this.participants.forEach((participant) => participant.removeAllListeners());
    this.participants.clear();

    // Clean up local participant
    if (this.localParticipant) {
      this.localParticipant.removeAllListeners();
      this.localParticipant = null;
    }

    this.emit('disconnected');
    this.emit('connection-state-changed', ConnectionState.Disconnected);
  }

  /**
   * Get room info
   */
  getRoomInfo(): RoomInfo | null {
    return this.roomInfo;
  }

  /**
   * Get local participant
   */
  getLocalParticipant(): LocalParticipant | null {
    return this.localParticipant;
  }

  /**
   * Get all participants
   */
  getParticipants(): RemoteParticipant[] {
    return Array.from(this.participants.values());
  }

  /**
   * Get participant by SID
   */
  getParticipant(sid: string): RemoteParticipant | null {
    return this.participants.get(sid) || null;
  }

  /**
   * Get participant by identity
   */
  getParticipantByIdentity(identity: string): RemoteParticipant | null {
    return Array.from(this.participants.values()).find((p) => p.identity === identity) || null;
  }

  /**
   * Subscribe to a track
   */
  async subscribeToTrack(
    sid: string,
    options?: TrackSubscribeOptions
  ): Promise<RemoteTrack | null> {
    const publication = this.findTrackPublication(sid);
    if (!publication) {
      throw new Error(`Track ${sid} not found`);
    }

    // Send subscribe message
    this.send({
      type: 'subscribe',
      trackSid: sid,
      options,
    });

    return publication.track;
  }

  /**
   * Unsubscribe from a track
   */
  async unsubscribeFromTrack(sid: string): Promise<void> {
    const publication = this.findTrackPublication(sid);
    if (!publication) {
      throw new Error(`Track ${sid} not found`);
    }

    // Send unsubscribe message
    this.send({
      type: 'unsubscribe',
      trackSid: sid,
    });
  }

  /**
   * Subscribe to all tracks
   */
  async subscribeToAllTracks(options?: TrackSubscribeOptions): Promise<void> {
    const promises: Promise<void>[] = [];

    this.participants.forEach((participant) => {
      participant.getTracks().forEach((track: RemoteTrackPublication) => {
        promises.push(
          this.subscribeToTrack(track.sid, options).then(() => {
            // Ignore result
          })
        );
      });
    });

    await Promise.all(promises);
  }

  /**
   * Unsubscribe from all tracks
   */
  async unsubscribeFromAllTracks(): Promise<void> {
    const promises: Promise<void>[] = [];

    this.participants.forEach((participant) => {
      participant.getTracks().forEach((track: RemoteTrackPublication) => {
        promises.push(this.unsubscribeFromTrack(track.sid));
      });
    });

    await Promise.all(promises);
  }

  /**
   * Send data to all participants
   */
  async sendData(data: unknown, kind: 'reliable' | 'lossy' = 'reliable'): Promise<void> {
    if (this.localParticipant) {
      await this.localParticipant.publishData(data, kind);
    }

    this.send({
      type: 'data',
      kind,
      value: data,
    });
  }

  /**
   * Add event listener
   */
  on<K extends keyof RoomEvents>(event: K, listener: RoomEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (data: unknown) => void);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof RoomEvents>(event: K, listener: RoomEvents[K]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(listener as (data: unknown) => void);
    }
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * Connect WebSocket
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.options.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onclose = () => {
        this.handleDisconnect();
      };

      this.ws.onerror = (error) => {
        reject(error);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
    });
  }

  /**
   * Handle WebSocket disconnect
   */
  private handleDisconnect(): void {
    this.emit('connection-state-changed', ConnectionState.Disconnected);

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.emit('connection-state-changed', ConnectionState.Reconnecting);

      setTimeout(() => {
        this.connect().catch((error) => {
          this.emit('error', error);
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      this.emit('disconnected');
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'joined':
        this.handleJoined(message);
        break;

      case 'participant-joined':
        this.handleParticipantJoined(message);
        break;

      case 'participant-left':
        this.handleParticipantLeft(message);
        break;

      case 'track-published':
        this.handleTrackPublished(message);
        break;

      case 'track-unpublished':
        this.handleTrackUnpublished(message);
        break;

      case 'track-subscribed':
        this.handleTrackSubscribed(message);
        break;

      case 'track-unsubscribed':
        this.handleTrackUnsubscribed(message);
        break;

      case 'track-muted':
        this.handleTrackMuted(message);
        break;

      case 'track-unmuted':
        this.handleTrackUnmuted(message);
        break;

      case 'data':
        this.handleData(message);
        break;

      case 'error':
        this.handleError(message);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * Handle joined message
   */
  private handleJoined(message: any): void {
    this.roomInfo = message.room;

    // Create local participant
    this.localParticipant = new LocalParticipantImpl(message.participant);
    this.localParticipant.setPublishDataCallback(async (data, kind) => {
      this.send({
        type: 'data',
        kind,
        value: data,
      });
    });

    this.emit('local-participant-joined', this.localParticipant);

    // Add existing participants
    message.participants.forEach((info: ParticipantInfo) => {
      const participant = new RemoteParticipantImpl(info);
      participant.setSubscribeCallback(
        async (sid: string, subscribed: boolean, options?: TrackSubscribeOptions) => {
          if (subscribed) {
            this.send({
              type: 'subscribe',
              trackSid: sid,
              options,
            });
          } else {
            this.send({
              type: 'unsubscribe',
              trackSid: sid,
            });
          }
        }
      );
      this.participants.set(info.sid, participant);
      this.emit('participant-joined', participant);
    });
  }

  /**
   * Handle participant joined message
   */
  private handleParticipantJoined(message: any): void {
    const participant = new RemoteParticipantImpl(message.participant);
    participant.setSubscribeCallback(
      async (sid: string, subscribed: boolean, options?: TrackSubscribeOptions) => {
        if (subscribed) {
          this.send({
            type: 'subscribe',
            trackSid: sid,
            options,
          });
        } else {
          this.send({
            type: 'unsubscribe',
            trackSid: sid,
          });
        }
      }
    );
    this.participants.set(message.participant.sid, participant);
    this.emit('participant-joined', participant);
  }

  /**
   * Handle participant left message
   */
  private handleParticipantLeft(message: any): void {
    const participant = this.participants.get(message.participantSid);
    if (participant) {
      participant.removeAllListeners();
      this.participants.delete(message.participantSid);
      this.emit('participant-left', participant);
    }
  }

  /**
   * Handle track published message
   */
  private handleTrackPublished(message: any): void {
    const participant = this.participants.get(message.participantSid);
    if (participant) {
      participant.updateInfo(message.participant);
    }
  }

  /**
   * Handle track unpublished message
   */
  private handleTrackUnpublished(message: any): void {
    const participant = this.participants.get(message.participantSid);
    if (participant) {
      participant.updateInfo(message.participant);
    }
  }

  /**
   * Handle track subscribed message
   */
  private handleTrackSubscribed(message: any): void {
    const participant = this.participants.get(message.participantSid);
    if (participant) {
      const publication = participant.getTrack(message.trackSid);
      if (publication && message.track) {
        const track = new RemoteTrackImpl(message.track, message.mediaTrack);
        (publication as any).setTrack(track);
        track.emitSubscribed();
        this.emit('track-subscribed', { track, publication, participant });
      }
    }
  }

  /**
   * Handle track unsubscribed message
   */
  private handleTrackUnsubscribed(message: any): void {
    const participant = this.participants.get(message.participantSid);
    if (participant) {
      const publication = participant.getTrack(message.trackSid);
      if (publication) {
        const track = publication.track;
        (publication as any).clearTrack();
        if (track) {
          (track as RemoteTrackImpl).emitUnsubscribed();
          this.emit('track-unsubscribed', { track, publication, participant });
        }
      }
    }
  }

  /**
   * Handle track muted message
   */
  private handleTrackMuted(message: any): void {
    const participant = this.participants.get(message.participantSid);
    if (participant) {
      participant.updateInfo(message.participant);
      const publication = participant.getTrack(message.trackSid);
      if (publication && publication.track) {
        this.emit('track-muted', { track: publication.track, participant });
      }
    }
  }

  /**
   * Handle track unmuted message
   */
  private handleTrackUnmuted(message: any): void {
    const participant = this.participants.get(message.participantSid);
    if (participant) {
      participant.updateInfo(message.participant);
      const publication = participant.getTrack(message.trackSid);
      if (publication && publication.track) {
        this.emit('track-unmuted', { track: publication.track, participant });
      }
    }
  }

  /**
   * Handle data message
   */
  private handleData(message: any): void {
    const participant = this.participants.get(message.participantSid);
    if (participant) {
      this.emit('data-received', { data: message.data, participant });
    }
  }

  /**
   * Handle error message
   */
  private handleError(message: any): void {
    this.emit('error', new Error(message.error || 'Unknown error'));
  }

  /**
   * Send message via WebSocket
   */
  private send(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.pendingMessages.push(message);
    }
  }

  /**
   * Find track publication by SID
   */
  private findTrackPublication(sid: string): RemoteTrackPublication | null {
    for (const participant of this.participants.values()) {
      const publication = participant.getTrack(sid);
      if (publication) {
        return publication;
      }
    }
    return null;
  }

  /**
   * Emit event
   */
  private emit<K extends keyof RoomEvents>(event: K, data?: unknown): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in ${String(event)} listener:`, error);
        }
      });
    }
  }
}
