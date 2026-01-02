/**
 * WebSocket signaling message types
 */

import type { RoomInfo, ParticipantInfo, TrackInfo, ErrorInfo, TrackKind } from './room.types';

// ============================================================================
// Client -> Server Messages
// ============================================================================

/**
 * Join room message
 */
export interface JoinMessage {
  type: 'join';
  room: string;
  token: string;
  metadata?: Record<string, unknown>;
}

/**
 * Leave room message
 */
export interface LeaveMessage {
  type: 'leave';
}

/**
 * Publish track message
 */
export interface PublishMessage {
  type: 'publish';
  kind: TrackKind;
  rtpParameters: RtpParameters;
  appData?: Record<string, unknown>;
}

/**
 * Unpublish track message
 */
export interface UnpublishMessage {
  type: 'unpublish';
  trackSid: string;
}

/**
 * Subscribe to track message
 */
export interface SubscribeMessage {
  type: 'subscribe';
  trackSid: string;
  rtpCapabilities: RtpCapabilities;
}

/**
 * Unsubscribe from track message
 */
export interface UnsubscribeMessage {
  type: 'unsubscribe';
  trackSid: string;
}

/**
 * Mute/unmute track message
 */
export interface MuteMessage {
  type: 'mute';
  trackSid: string;
  muted: boolean;
}

/**
 * Send data message
 */
export interface DataMessage {
  type: 'data';
  payload: unknown;
  kind?: 'reliable' | 'lossy';
}

/**
 * Client message union
 */
export type ClientMessage =
  | JoinMessage
  | LeaveMessage
  | PublishMessage
  | UnpublishMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | MuteMessage
  | DataMessage;

// ============================================================================
// Server -> Client Messages
// ============================================================================

/**
 * Room joined message
 */
export interface JoinedMessage {
  type: 'joined';
  room: RoomInfo;
  participant: ParticipantInfo;
  otherParticipants: ParticipantInfo[];
}

/**
 * Participant joined message
 */
export interface ParticipantJoinedMessage {
  type: 'participant_joined';
  participant: ParticipantInfo;
}

/**
 * Participant left message
 */
export interface ParticipantLeftMessage {
  type: 'participant_left';
  participantSid: string;
}

/**
 * Track published message
 */
export interface TrackPublishedMessage {
  type: 'track_published';
  participantSid: string;
  track: TrackInfo;
}

/**
 * Track unpublished message
 */
export interface TrackUnpublishedMessage {
  type: 'track_unpublished';
  participantSid: string;
  trackSid: string;
}

/**
 * Track subscribed message
 */
export interface TrackSubscribedMessage {
  type: 'track_subscribed';
  track: TrackInfo;
  rtpParameters: RtpParameters;
}

/**
 * Track unsubscribed message
 */
export interface TrackUnsubscribedMessage {
  type: 'track_unsubscribed';
  trackSid: string;
}

/**
 * Track muted message
 */
export interface TrackMutedMessage {
  type: 'track_muted';
  trackSid: string;
  muted: boolean;
}

/**
 * Data received message
 */
export interface DataReceivedMessage {
  type: 'data';
  participantSid: string;
  payload: unknown;
}

/**
 * Error message
 */
export interface ErrorMessage {
  type: 'error';
  error: ErrorInfo;
}

/**
 * Server message union
 */
export type ServerMessage =
  | JoinedMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage
  | TrackPublishedMessage
  | TrackUnpublishedMessage
  | TrackSubscribedMessage
  | TrackUnsubscribedMessage
  | TrackMutedMessage
  | DataReceivedMessage
  | ErrorMessage;

// ============================================================================
// WebRTC Types
// ============================================================================

/**
 * RTP parameters (simplified)
 */
export interface RtpParameters {
  codecs: RtpCodecParameters[];
  headerExtensions: RtpHeaderExtensionParameters[];
  encodings: RtpEncodingParameters[];
  rtcp: RtcpParameters;
}

/**
 * RTP codec parameters
 */
export interface RtpCodecParameters {
  mimeType: string;
  clockRate: number;
  channels?: number;
  parameters?: Record<string, unknown>;
}

/**
 * RTP header extension parameters
 */
export interface RtpHeaderExtensionParameters {
  uri: string;
  id: number;
  encrypt?: boolean;
  parameters?: Record<string, unknown>;
}

/**
 * RTP encoding parameters
 */
export interface RtpEncodingParameters {
  ssrc?: number;
  rid?: string;
  codecPayloadType?: number;
  rtx?: {
    ssrc: number;
  };
  dtx?: boolean;
  scalabilityMode?: string;
  scaleResolutionDownBy?: number;
  maxBitrate?: number;
  maxFramerate?: number;
  adaptivePtime?: boolean;
  priority?: 'very-low' | 'low' | 'medium' | 'high';
  networkPriority?: 'very-low' | 'low' | 'medium' | 'high';
}

/**
 * RTCP parameters
 */
export interface RtcpParameters {
  cname?: string;
  reducedSize?: boolean;
  mux?: boolean;
}

/**
 * RTP capabilities
 */
export interface RtpCapabilities {
  codecs: RtpCodecCapability[];
  headerExtensions: RtpHeaderExtension[];
}

/**
 * RTP codec capability
 */
export interface RtpCodecCapability {
  mimeType: string;
  kind?: string;
  preferredPayloadType?: number;
  clockRate: number;
  channels?: number;
  parameters?: Record<string, unknown>;
  rtcpFeedback?: RtcpFeedback[];
}

/**
 * RTP header extension
 */
export interface RtpHeaderExtension {
  uri: string;
  preferredId: number;
  preferredEncrypt?: boolean;
  direction?: 'sendrecv' | 'send' | 'recv';
}

/**
 * RTCP feedback
 */
export interface RtcpFeedback {
  type: string;
  parameter?: string;
}
