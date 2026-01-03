/**
 * RoomClient - Main client class for connecting to a mediasoup room
 *
 * Refactored to use the Command pattern with HandlerRegistry for better maintainability.
 */

import type { RoomInfo, TrackSource } from '@mediasoup-lib/shared';
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
import { LocalTrack as LocalTrackImpl } from './LocalTrack';
import { LocalTrackPublicationImpl } from './TrackPublication';
import { MediaManager } from '../media';
import { WebRTCManager } from '../webrtc/WebRTCManager';
import type { types } from 'mediasoup-client';
import { handlerRegistry } from './handlers';

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
  private rtpCapabilities: any = null;

  private listeners: Map<keyof RoomEvents, Set<(data: unknown) => void>> = new Map();
  private pendingMessages: unknown[] = [];

  // WebRTC and Media managers (internal)
  private mediaManager: MediaManager | null = null;
  private webRTCManager: WebRTCManager | null = null;
  private isWebRTCInitialized = false;

  // Track state
  private localAudioTrack: MediaStreamTrack | null = null;
  private localVideoTrack: MediaStreamTrack | null = null;
  private localAudioProducer: types.Producer | null = null;
  private localVideoProducer: types.Producer | null = null;

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
        room: this.options.room,
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
    // Stop local tracks
    this.stopLocalTracks();

    // Close WebRTC manager
    if (this.webRTCManager) {
      this.webRTCManager.close();
      this.webRTCManager = null;
    }

    // Stop media manager
    if (this.mediaManager) {
      this.mediaManager.stopAllTracks();
      this.mediaManager = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Clean up participants
    this.participants.forEach((participant) => participant.removeAllListeners());
    this.participants.clear();

    // Clean up local participant
    if (this.localParticipant) {
      this.localParticipant.removeAllListeners();
      this.localParticipant = null;
    }

    this.isWebRTCInitialized = false;

    this.emit('disconnected');
    this.emit('connection-state-changed', ConnectionState.Disconnected);
  }

  /**
   * Enable camera (video)
   */
  async enableCamera(): Promise<void> {
    if (!this.isWebRTCInitialized) {
      await this.initializeWebRTC();
    }

    if (!this.mediaManager || !this.webRTCManager || !this.localParticipant) {
      throw new Error('WebRTC not initialized');
    }

    // Create video track
    const videoTrack = await this.mediaManager.createVideoTrack();
    this.localVideoTrack = (videoTrack as any).mediaTrack;

    if (!this.localVideoTrack) {
      throw new Error('Failed to create video track');
    }

    // Publish via WebRTC manager first to get producer ID
    this.localVideoProducer = await this.webRTCManager.publishTrack(this.localVideoTrack, {
      source: 'camera',
    });

    // Use producer ID as the track SID for consistency
    const trackSid = this.localVideoProducer.id;

    // Create LocalTrack object
    const localTrack = new LocalTrackImpl(
      {
        sid: trackSid,
        kind: 'video' as any,
        source: 'camera' as TrackSource,
        muted: false,
      },
      this.localVideoTrack
    );

    // Create publication with producer ID as SID
    const publication = new LocalTrackPublicationImpl(
      {
        sid: trackSid,
        kind: 'video' as any,
        source: 'camera' as TrackSource,
        muted: false,
        simulcast: false,
      },
      'camera',
      localTrack
    );

    // Add to local participant
    (this.localParticipant as any).tracks.set(publication.sid, publication);

    console.log('Camera enabled, track SID:', trackSid);
  }

  /**
   * Disable camera (video)
   */
  async disableCamera(): Promise<void> {
    if (this.localVideoTrack) {
      this.localVideoTrack.stop();
      this.localVideoTrack = null;
    }

    if (this.localVideoProducer) {
      await this.webRTCManager?.unpublishTrack(this.localVideoProducer.id);
      // Remove the publication from local participant's tracks map
      if (this.localParticipant) {
        (this.localParticipant as any).tracks.delete(this.localVideoProducer.id);
      }
      this.localVideoProducer = null;
    }

    console.log('Camera disabled');
  }

  /**
   * Enable microphone (audio)
   */
  async enableMicrophone(): Promise<void> {
    if (!this.isWebRTCInitialized) {
      await this.initializeWebRTC();
    }

    if (!this.mediaManager || !this.webRTCManager || !this.localParticipant) {
      throw new Error('WebRTC not initialized');
    }

    // Create audio track
    const audioTrack = await this.mediaManager.createAudioTrack();
    this.localAudioTrack = (audioTrack as any).mediaTrack;

    if (!this.localAudioTrack) {
      throw new Error('Failed to create audio track');
    }

    // Publish via WebRTC manager first to get producer ID
    this.localAudioProducer = await this.webRTCManager.publishTrack(this.localAudioTrack, {
      source: 'microphone',
    });

    // Use producer ID as the track SID for consistency
    const trackSid = this.localAudioProducer.id;

    // Create LocalTrack object
    const localTrack = new LocalTrackImpl(
      {
        sid: trackSid,
        kind: 'audio' as any,
        source: 'microphone' as TrackSource,
        muted: false,
      },
      this.localAudioTrack
    );

    // Create publication with producer ID as SID
    const publication = new LocalTrackPublicationImpl(
      {
        sid: trackSid,
        kind: 'audio' as any,
        source: 'microphone' as TrackSource,
        muted: false,
        simulcast: false,
      },
      'microphone',
      localTrack
    );

    // Add to local participant
    (this.localParticipant as any).tracks.set(publication.sid, publication);

    console.log('Microphone enabled, track SID:', trackSid);
  }

  /**
   * Disable microphone (audio)
   */
  async disableMicrophone(): Promise<void> {
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }

    if (this.localAudioProducer) {
      await this.webRTCManager?.unpublishTrack(this.localAudioProducer.id);
      // Remove the publication from local participant's tracks map
      if (this.localParticipant) {
        (this.localParticipant as any).tracks.delete(this.localAudioProducer.id);
      }
      this.localAudioProducer = null;
    }

    console.log('Microphone disabled');
  }

  /**
   * Initialize WebRTC (internal)
   */
  private async initializeWebRTC(): Promise<void> {
    if (this.isWebRTCInitialized) {
      return;
    }

    if (!this.rtpCapabilities) {
      throw new Error('RTP capabilities not available. Wait for connection.');
    }

    // Initialize media manager
    this.mediaManager = new MediaManager();
    await this.mediaManager.initialize();

    // Initialize WebRTC manager
    this.webRTCManager = new WebRTCManager(this);
    await this.webRTCManager.initialize(this.rtpCapabilities);

    // Create send and receive transports
    await this.webRTCManager.createSendTransport();
    await this.webRTCManager.createRecvTransport();

    this.isWebRTCInitialized = true;
    console.log('WebRTC initialized');
  }

  /**
   * Stop local tracks
   */
  private stopLocalTracks(): void {
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }
    if (this.localVideoTrack) {
      this.localVideoTrack.stop();
      this.localVideoTrack = null;
    }
    this.localAudioProducer = null;
    this.localVideoProducer = null;

    // Clear local participant tracks
    if (this.localParticipant) {
      (this.localParticipant as any).tracks.clear();
    }
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
    _options?: TrackSubscribeOptions
  ): Promise<RemoteTrack | null> {
    console.log('subscribeToTrack called with sid:', sid);
    const publication = this.findTrackPublication(sid);
    if (!publication) {
      console.error(`Track ${sid} not found in publications`);
      throw new Error(`Track ${sid} not found`);
    }

    if (!this.webRTCManager) {
      throw new Error('WebRTC not initialized');
    }

    // Subscribe via WebRTC manager
    const consumer = await this.webRTCManager.subscribeToTrack(sid);
    console.log('Consumer created:', consumer.id, 'track:', consumer.track, 'kind:', consumer.kind);

    // Check if consumer track exists
    if (!consumer.track) {
      console.error('Consumer track is null or undefined!', consumer.id);
      return null;
    }

    // Create remote track from consumer - use producerId (sid) as track SID, not consumer ID
    const track = new RemoteTrackImpl(
      {
        sid: sid, // Use producerId as SID to match publication
        kind: consumer.kind as any,
        source: publication.source as any,
        muted: false,
      },
      consumer.track as MediaStreamTrack
    );

    console.log(
      'RemoteTrack created:',
      track.sid,
      'mediaTrack:',
      track.mediaTrack,
      'kind:',
      track.kind
    );

    (publication as any).setTrack(track);
    console.log('Track set on publication:', publication.sid, 'hasTrack:', !!publication.track);

    track.emitSubscribed();
    this.emit('track-subscribed', {
      track,
      publication,
      participant: this.getParticipantFromPublication(publication),
    });

    return track;
  }

  /**
   * Unsubscribe from a track
   */
  async unsubscribeFromTrack(sid: string): Promise<void> {
    const publication = this.findTrackPublication(sid);
    if (!publication) {
      throw new Error(`Track ${sid} not found`);
    }

    // Unsubscribe via WebRTC manager
    const track = publication.track;
    (publication as any).clearTrack();
    if (track) {
      (track as RemoteTrackImpl).emitUnsubscribed();
      this.emit('track-unsubscribed', {
        track,
        publication,
        participant: this.getParticipantFromPublication(publication),
      });
    }
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
   *
   * Delegates message handling to the HandlerRegistry.
   */
  private handleMessage(message: any): void {
    // Emit message event for WebRTC signaling
    this.emit('message', message);

    // Handle message through registry
    handlerRegistry.handle({ client: this }, message);
  }

  /**
   * Send message via WebSocket (public for WebRTC signaling)
   */
  public send(message: unknown): void {
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
   * Get RTP capabilities
   */
  public getRtpCapabilities(): any {
    return this.rtpCapabilities;
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

  /**
   * Get participant from publication
   */
  private getParticipantFromPublication(
    publication: RemoteTrackPublication
  ): RemoteParticipant | null {
    for (const participant of this.participants.values()) {
      if (participant.getTrack(publication.sid)) {
        return participant;
      }
    }
    return null;
  }
}
