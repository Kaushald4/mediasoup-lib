/**
 * WebSocketServer - WebSocket server for signaling
 */

import { WebSocketServer as WSServer, WebSocket } from 'ws';
import type { Server as HTTPServer } from 'http';
import type { IncomingMessage } from 'http';
import type { RoomManager } from '../sfu';
import type { RedisManager } from '../redis';
import type { JwtConfig } from '../config';
import type { ServerMessage, ClientMessage } from '@mediasoup-lib/shared';
import { validateToken } from '../auth';
import { SERVER_EVENTS, CLIENT_EVENTS, ErrorCode } from '@mediasoup-lib/shared';
import type { Room } from '../sfu/Room';

/**
 * WebSocket connection with additional data
 */
interface WebSocketConnection extends WebSocket {
  socketId: string;
  participantSid?: string;
  roomSid?: string;
}

/**
 * WebSocketServer class
 */
export class WebSocketServer {
  private wss: WSServer;
  private roomManager: RoomManager;
  private jwtConfig: JwtConfig;
  private connections: Map<string, WebSocketConnection>;

  constructor(
    httpServer: HTTPServer,
    roomManager: RoomManager,
    _redisManager: RedisManager | null,
    jwtConfig: JwtConfig
  ) {
    this.roomManager = roomManager;
    this.jwtConfig = jwtConfig;
    this.connections = new Map();

    this.wss = new WSServer({ server: httpServer });

    this.wss.on('connection', this.handleConnection.bind(this));
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    const socketId = this.generateSocketId();
    (ws as WebSocketConnection).socketId = socketId;
    this.connections.set(socketId, ws as WebSocketConnection);

    console.log(`WebSocket connected: ${socketId}`);

    ws.on('message', (data: Buffer) => {
      this.handleMessage(ws as WebSocketConnection, data);
    });

    ws.on('close', () => {
      this.handleClose(ws as WebSocketConnection);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error: ${socketId}`, error);
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(ws: WebSocketConnection, data: Buffer): Promise<void> {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      console.log(`Received message: ${message.type} from ${ws.socketId}`);

      switch (message.type) {
        case CLIENT_EVENTS.JOIN:
          await this.handleJoin(ws, message as any);
          break;
        case CLIENT_EVENTS.LEAVE:
          await this.handleLeave(ws);
          break;
        case 'create_transport':
          await this.handleCreateWebRtcTransport(ws, message as any);
          break;
        case 'connect_transport':
          await this.handleConnectWebRtcTransport(ws, message as any);
          break;
        case CLIENT_EVENTS.PUBLISH:
          await this.handlePublish(ws, message as any);
          break;
        case CLIENT_EVENTS.UNPUBLISH:
          await this.handleUnpublish(ws, message as any);
          break;
        case CLIENT_EVENTS.SUBSCRIBE:
          await this.handleSubscribe(ws, message as any);
          break;
        case CLIENT_EVENTS.UNSUBSCRIBE:
          await this.handleUnsubscribe(ws, message as any);
          break;
        case 'resume_consumer':
          await this.handleResumeConsumer(ws, message as any);
          break;
        case CLIENT_EVENTS.MUTE:
          await this.handleMute(ws, message as any);
          break;
        case CLIENT_EVENTS.DATA:
          await this.handleData(ws, message as any);
          break;
        default:
          this.sendError(
            ws,
            ErrorCode.InvalidRequest,
            `Unknown message type: ${(message as any).type}`
          );
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError(ws, ErrorCode.Unknown, 'Failed to process message');
    }
  }

  /**
   * Handle join room
   */
  private async handleJoin(ws: WebSocketConnection, message: any): Promise<void> {
    const { room: roomName, token, metadata } = message;

    // Validate token
    const validation = validateToken(token, this.jwtConfig.apiSecret, this.jwtConfig.apiKey);
    if (!validation.valid) {
      this.sendError(ws, ErrorCode.Unauthorized, validation.error || 'Invalid token');
      return;
    }

    const claims = validation.claims!;

    // Check if user has permission to join
    if (claims.video?.roomJoin === false) {
      this.sendError(ws, ErrorCode.Unauthorized, 'Not authorized to join room');
      return;
    }

    // Get or create room
    let room = this.roomManager.getRoomByName(roomName);
    if (!room) {
      room = await this.roomManager.createRoom({
        name: roomName,
        metadata: {},
      });
    }

    // Check if room is full
    if (room.isFull()) {
      this.sendError(ws, ErrorCode.RoomFull, 'Room is full');
      return;
    }

    // Create participant
    const { Participant } = await import('../sfu');
    const participant = new Participant(
      room,
      claims.identity,
      claims.name,
      { ...metadata, ...claims.metadata },
      {
        canPublish: claims.video?.canPublish ?? true,
        canSubscribe: claims.video?.canSubscribe ?? true,
        canPublishData: claims.video?.canPublishData ?? true,
      }
    );

    participant.setSocketId(ws.socketId);
    participant.setState('connected' as any);
    room.addParticipant(participant);

    ws.participantSid = participant.sid;
    ws.roomSid = room.sid;

    // Send joined message with RTP capabilities
    this.send(ws, {
      type: SERVER_EVENTS.JOINED,
      room: room.getInfo(),
      participant: participant.getInfo(),
      otherParticipants: room
        .getParticipants()
        .filter((p) => p.sid !== participant.sid)
        .map((p) => p.getInfo()),
      rtpCapabilities: room.getRtpCapabilities() as any,
    });

    // Notify other participants
    this.broadcastToRoom(
      room,
      {
        type: SERVER_EVENTS.PARTICIPANT_JOINED,
        participant: participant.getInfo(),
      },
      ws.socketId
    );

    console.log(`Participant ${participant.identity} joined room ${roomName}`);
  }

  /**
   * Handle leave room
   */
  private async handleLeave(ws: WebSocketConnection): Promise<void> {
    if (!ws.roomSid || !ws.participantSid) {
      return;
    }

    const room = this.roomManager.getRoom(ws.roomSid);
    if (room) {
      const participant = room.getParticipant(ws.participantSid);
      if (participant) {
        // Notify other participants
        this.broadcastToRoom(
          room,
          {
            type: SERVER_EVENTS.PARTICIPANT_LEFT,
            participantSid: participant.sid,
          },
          ws.socketId
        );

        // Remove participant
        room.removeParticipant(participant.sid);

        console.log(`Participant ${participant.identity} left room ${room.name}`);
      }
    }

    ws.participantSid = undefined;
    ws.roomSid = undefined;
  }

  /**
   * Handle create WebRTC transport
   */
  private async handleCreateWebRtcTransport(ws: WebSocketConnection, message: any): Promise<void> {
    if (!ws.roomSid || !ws.participantSid) {
      this.sendError(ws, ErrorCode.InvalidRequest, 'Not joined to room');
      return;
    }

    const room = this.roomManager.getRoom(ws.roomSid);
    if (!room) {
      this.sendError(ws, ErrorCode.RoomNotFound, 'Room not found');
      return;
    }

    const participant = room.getParticipant(ws.participantSid);
    if (!participant) {
      this.sendError(ws, ErrorCode.InvalidRequest, 'Participant not found');
      return;
    }

    try {
      const { direction } = message;

      // Create WebRTC transport
      const transport = await room.createWebRtcTransport({
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        listenIps: [
          {
            ip: '0.0.0.0',
            announcedIp: process.env.ANNOUNCED_IP || '127.0.0.1',
          },
        ],
        initialAvailableOutgoingBitrate: 1000000,
      });

      // Store transport
      participant.addTransport(transport.id, transport);

      // Send transport info to client
      this.send(ws, {
        type: 'transport_created',
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        direction,
      });

      console.log(`WebRTC transport created for participant ${participant.identity}`);
    } catch (error) {
      console.error('Failed to create WebRTC transport:', error);
      this.sendError(ws, ErrorCode.Unknown, 'Failed to create transport');
    }
  }

  /**
   * Handle connect WebRTC transport
   */
  private async handleConnectWebRtcTransport(ws: WebSocketConnection, message: any): Promise<void> {
    if (!ws.roomSid || !ws.participantSid) {
      return;
    }

    const room = this.roomManager.getRoom(ws.roomSid);
    if (!room) {
      return;
    }

    const participant = room.getParticipant(ws.participantSid);
    if (!participant) {
      return;
    }

    const { transportId, dtlsParameters } = message;
    const transport = participant.getTransport(transportId);

    if (transport) {
      await transport.connect({ dtlsParameters });
      console.log(`WebRTC transport connected: ${transportId}`);
    }
  }

  /**
   * Handle publish track
   */
  private async handlePublish(ws: WebSocketConnection, message: any): Promise<void> {
    if (!ws.roomSid || !ws.participantSid) {
      this.sendError(ws, ErrorCode.InvalidRequest, 'Not joined to room');
      return;
    }

    const room = this.roomManager.getRoom(ws.roomSid);
    if (!room) {
      this.sendError(ws, ErrorCode.RoomNotFound, 'Room not found');
      return;
    }

    const participant = room.getParticipant(ws.participantSid);
    if (!participant) {
      this.sendError(ws, ErrorCode.InvalidRequest, 'Participant not found');
      return;
    }

    try {
      const { transportId, kind, rtpParameters, appData } = message;
      const transport = participant.getTransport(transportId);

      if (!transport) {
        this.sendError(ws, ErrorCode.InvalidRequest, 'Transport not found');
        return;
      }

      // Create producer
      const producer = await transport.produce({
        kind,
        rtpParameters,
        appData,
      });

      // Add producer to participant
      const track = participant.addProducer(
        producer.id,
        producer,
        kind,
        appData?.source || (kind === 'audio' ? 'microphone' : 'camera')
      );

      // Notify other participants
      this.broadcastToRoom(
        room,
        {
          type: 'track_published',
          participantSid: participant.sid,
          track: track.getInfo(),
        },
        ws.socketId
      );

      // Send producer ID to client
      this.send(ws, {
        type: 'track_published',
        id: producer.id,
        trackSid: track.sid,
      });

      console.log(`Track published: ${track.sid} by ${participant.identity}`);
    } catch (error) {
      console.error('Failed to publish track:', error);
      this.sendError(ws, ErrorCode.Unknown, 'Failed to publish track');
    }
  }

  /**
   * Handle unpublish track
   */
  private async handleUnpublish(ws: WebSocketConnection, message: any): Promise<void> {
    if (!ws.roomSid || !ws.participantSid) {
      return;
    }

    const room = this.roomManager.getRoom(ws.roomSid);
    if (!room) {
      return;
    }

    const participant = room.getParticipant(ws.participantSid);
    if (!participant) {
      return;
    }

    try {
      const { producerId, trackSid } = message;

      // Remove producer
      participant.removeProducer(producerId);

      // Notify other participants
      this.broadcastToRoom(
        room,
        {
          type: 'track_unpublished',
          participantSid: participant.sid,
          trackSid,
        },
        ws.socketId
      );

      console.log(`Track unpublished: ${trackSid}`);
    } catch (error) {
      console.error('Failed to unpublish track:', error);
    }
  }

  /**
   * Handle subscribe to track
   */
  private async handleSubscribe(ws: WebSocketConnection, message: any): Promise<void> {
    if (!ws.roomSid || !ws.participantSid) {
      this.sendError(ws, ErrorCode.InvalidRequest, 'Not joined to room');
      return;
    }

    const room = this.roomManager.getRoom(ws.roomSid);
    if (!room) {
      this.sendError(ws, ErrorCode.RoomNotFound, 'Room not found');
      return;
    }

    const participant = room.getParticipant(ws.participantSid);
    if (!participant) {
      this.sendError(ws, ErrorCode.InvalidRequest, 'Participant not found');
      return;
    }

    try {
      const { transportId, producerId, rtpCapabilities } = message;
      const transport = participant.getTransport(transportId);

      if (!transport) {
        this.sendError(ws, ErrorCode.InvalidRequest, 'Transport not found');
        return;
      }

      // Create consumer
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });

      // Add consumer to participant
      participant.addConsumer(consumer.id, consumer);

      // Send consumer info to client
      this.send(ws, {
        type: 'track_subscribed',
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        trackSid: producerId,
      });

      console.log(`Track subscribed: ${producerId} by ${participant.identity}`);
    } catch (error) {
      console.error('Failed to subscribe to track:', error);
      this.sendError(ws, ErrorCode.Unknown, 'Failed to subscribe to track');
    }
  }

  /**
   * Handle unsubscribe from track
   */
  private async handleUnsubscribe(ws: WebSocketConnection, message: any): Promise<void> {
    if (!ws.roomSid || !ws.participantSid) {
      return;
    }

    const room = this.roomManager.getRoom(ws.roomSid);
    if (!room) {
      return;
    }

    const participant = room.getParticipant(ws.participantSid);
    if (!participant) {
      return;
    }

    try {
      const { consumerId } = message;

      // Remove consumer
      participant.removeConsumer(consumerId);

      console.log(`Track unsubscribed: ${consumerId}`);
    } catch (error) {
      console.error('Failed to unsubscribe from track:', error);
    }
  }

  /**
   * Handle resume consumer
   */
  private async handleResumeConsumer(ws: WebSocketConnection, message: any): Promise<void> {
    if (!ws.roomSid || !ws.participantSid) {
      return;
    }

    const room = this.roomManager.getRoom(ws.roomSid);
    if (!room) {
      return;
    }

    const participant = room.getParticipant(ws.participantSid);
    if (!participant) {
      return;
    }

    try {
      const { consumerId } = message;
      const consumer = participant.getConsumer(consumerId);

      if (consumer) {
        await consumer.resume();
        console.log(`Consumer resumed: ${consumerId}`);
      }
    } catch (error) {
      console.error('Failed to resume consumer:', error);
    }
  }

  /**
   * Handle mute/unmute track
   */
  private async handleMute(ws: WebSocketConnection, message: any): Promise<void> {
    if (!ws.roomSid || !ws.participantSid) {
      return;
    }

    const room = this.roomManager.getRoom(ws.roomSid);
    if (!room) {
      return;
    }

    const participant = room.getParticipant(ws.participantSid);
    if (!participant) {
      return;
    }

    try {
      const { trackSid, muted } = message;

      if (muted) {
        participant.muteTrack(trackSid);
      } else {
        participant.unmuteTrack(trackSid);
      }

      // Notify other participants
      this.broadcastToRoom(
        room,
        {
          type: 'track_muted',
          participantSid: participant.sid,
          trackSid,
          muted,
        },
        ws.socketId
      );

      console.log(`Track ${trackSid} ${muted ? 'muted' : 'unmuted'}`);
    } catch (error) {
      console.error('Failed to mute track:', error);
    }
  }

  /**
   * Handle data message
   */
  private async handleData(_ws: WebSocketConnection, message: any): Promise<void> {
    // TODO: Implement data channel
    console.log('Data message:', message);
  }

  /**
   * Handle WebSocket close
   */
  private async handleClose(ws: WebSocketConnection): Promise<void> {
    console.log(`WebSocket disconnected: ${ws.socketId}`);
    await this.handleLeave(ws);
    this.connections.delete(ws.socketId);
  }

  /**
   * Send message to client
   */
  private send(ws: WebSocketConnection, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error to client
   */
  private sendError(ws: WebSocketConnection, code: ErrorCode, message: string): void {
    this.send(ws, {
      type: SERVER_EVENTS.ERROR,
      error: {
        code,
        message,
      },
    });
  }

  /**
   * Broadcast message to all participants in a room
   */
  private broadcastToRoom(room: Room, message: ServerMessage, excludeSocketId?: string): void {
    for (const participant of room.getParticipants()) {
      const ws = this.connections.get(participant.socketId);
      if (ws && ws.socketId !== excludeSocketId) {
        this.send(ws, message);
      }
    }
  }

  /**
   * Generate socket ID
   */
  private generateSocketId(): string {
    return `socket_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Close the server
   */
  public close(): void {
    this.wss.close();
  }
}
