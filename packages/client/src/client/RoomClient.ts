/**
 * RoomClient - Main client class for connecting to a mediasoup room
 */

import type { RoomInfo, ParticipantInfo, TrackSource } from '@mediasoup-lib/shared';
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
   */
  private handleMessage(message: any): void {
    // Emit message event for WebRTC signaling
    this.emit('message', message);

    switch (message.type) {
      case 'joined':
        this.handleJoined(message);
        break;

      case 'participant_joined':
        this.handleParticipantJoined(message);
        break;

      case 'participant_left':
        this.handleParticipantLeft(message);
        break;

      case 'transport_created':
        // Handled by WebRTCManager
        break;

      case 'track_published':
        this.handleTrackPublished(message);
        break;

      case 'track_unpublished':
        this.handleTrackUnpublished(message);
        break;

      case 'track_subscribed':
        this.handleTrackSubscribed(message);
        break;

      case 'track_unsubscribed':
        this.handleTrackUnsubscribed(message);
        break;

      case 'track_muted':
        this.handleTrackMuted(message);
        break;

      case 'track_unmuted':
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
  private async handleJoined(message: any): Promise<void> {
    this.roomInfo = message.room;
    this.rtpCapabilities = message.rtpCapabilities;

    // Create local participant
    this.localParticipant = new LocalParticipantImpl(message.participant);
    this.localParticipant.setPublishDataCallback(async (data, kind) => {
      this.send({
        type: 'data',
        kind,
        value: data,
      });
    });

    // Set camera/microphone callbacks
    this.localParticipant.setEnableCameraCallback(() => this.enableCamera());
    this.localParticipant.setDisableCameraCallback(() => this.disableCamera());
    this.localParticipant.setEnableMicrophoneCallback(() => this.enableMicrophone());
    this.localParticipant.setDisableMicrophoneCallback(() => this.disableMicrophone());

    this.emit('local-participant-joined', this.localParticipant);

    // Add existing participants
    message.otherParticipants.forEach((info: ParticipantInfo) => {
      const participant = new RemoteParticipantImpl(info);
      participant.setSubscribeCallback(
        async (sid: string, subscribed: boolean, options?: TrackSubscribeOptions) => {
          if (subscribed) {
            this.subscribeToTrack(sid, options);
          } else {
            this.unsubscribeFromTrack(sid);
          }
        }
      );
      this.participants.set(info.sid, participant);
      this.emit('participant-joined', participant);
    });

    // Auto-subscribe to all existing tracks if enabled
    if (this.options.autoSubscribe !== false) {
      // Initialize WebRTC first
      try {
        await this.initializeWebRTC();
        await this.subscribeToAllTracks();
        console.log('Auto-subscribed to all existing tracks');
      } catch (error) {
        console.error('Failed to auto-subscribe to existing tracks:', error);
      }
    }
  }

  /**
   * Handle participant joined message
   */
  private handleParticipantJoined(message: any): void {
    const participant = new RemoteParticipantImpl(message.participant);
    participant.setSubscribeCallback(
      async (sid: string, subscribed: boolean, options?: TrackSubscribeOptions) => {
        if (subscribed) {
          this.subscribeToTrack(sid, options);
        } else {
          this.unsubscribeFromTrack(sid);
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
  private async handleTrackPublished(message: any): Promise<void> {
    const participant = this.participants.get(message.participantSid);
    if (participant) {
      // Update participant with new track
      const info = participant.getInfo();
      info.tracks.push(message.track);
      participant.updateInfo(info);

      // Emit track published event
      this.emit('track-published', { publication: message.track, participant });

      // Auto-subscribe if enabled
      if (this.options.autoSubscribe !== false) {
        // Initialize WebRTC if not already initialized
        if (!this.isWebRTCInitialized) {
          await this.initializeWebRTC();
        }

        // Subscribe to the new track
        try {
          await this.subscribeToTrack(message.track.sid);
          console.log(`Auto-subscribed to track ${message.track.sid}`);
        } catch (error) {
          console.error('Failed to auto-subscribe to track:', error);
        }
      }
    }
  }

  /**
   * Handle track unpublished message
   */
  private handleTrackUnpublished(message: any): void {
    const participant = this.participants.get(message.participantSid);
    if (participant) {
      // Get the publication before removing it
      const publication = participant.getTrack(message.trackSid);

      // Remove the track from participant's tracks map
      (participant as any).tracks.delete(message.trackSid);

      // Emit track-unpublished event
      if (publication) {
        (publication as any).clearTrack();
        this.emit('track-unpublished', { publication, participant });
      }

      console.log(
        `Track unpublished: ${message.trackSid} from participant ${participant.identity}`
      );
    }
  }

  /**
   * Handle track subscribed message
   */
  private handleTrackSubscribed(message: any): void {
    // This is handled by subscribeToTrack method
    console.log('Track subscribed:', message);
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
