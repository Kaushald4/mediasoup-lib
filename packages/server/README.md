# @mediasoup-lib/server

Mediasoup SFU server for mediasoup-lib. Provides WebRTC signaling and media routing for video/audio conferencing.

## Installation

The server is designed to be deployed via Docker or run directly with Node.js.

## Quick Start

### Docker (Recommended)

```bash
cd packages/server
docker-compose up -d
```

### Node.js

```bash
# Copy environment file
cp .env.example .env

# Install dependencies
npm install

# Start server
npm start
```

## Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0

# Mediasoup
MEDIASOUP_NUM_WORKERS=4
MEDIASOUP_MIN_PORT=40000
MEDIASOUP_MAX_PORT=50000
MEDIASOUP_LOG_LEVEL=error

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENABLED=true

# JWT
API_KEY=your-api-key
API_SECRET=your-api-secret
JWT_EXPIRES_IN=24h

# ICE Servers
ICE_SERVERS=[{"urls":["stun:stun.l.google.com:19302"]}]
```

## API Endpoints

### POST /token

Generate an access token for joining a room.

```bash
curl -X POST http://localhost:3000/token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "identity": "user-123",
    "name": "John Doe",
    "room": "my-room",
    "metadata": {"role": "host"}
  }'
```

Response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### GET /rooms/:name

Get room information.

```bash
curl http://localhost:3000/rooms/my-room
```

Response:

```json
{
  "sid": "RM_123",
  "name": "my-room",
  "numParticipants": 3,
  "maxParticipants": 10,
  "creationTime": 1234567890
}
```

## WebSocket Protocol

The server uses WebSocket for real-time signaling. Connect to `ws://localhost:3000` with the access token as a query parameter.

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000?token=your-access-token');
```

### Client Messages

#### Join Room

```json
{
  "type": "join",
  "room": "my-room"
}
```

#### Leave Room

```json
{
  "type": "leave"
}
```

#### Publish Track

```json
{
  "type": "publish",
  "kind": "video",
  "source": "camera",
  "rtpParameters": {...}
}
```

#### Unpublish Track

```json
{
  "type": "unpublish",
  "trackSid": "TR_123"
}
```

#### Subscribe Track

```json
{
  "type": "subscribe",
  "trackSid": "TR_123",
  "rtpCapabilities": {...}
}
```

#### Unsubscribe Track

```json
{
  "type": "unsubscribe",
  "trackSid": "TR_123"
}
```

#### Publish Data

```json
{
  "type": "publish-data",
  "kind": "reliable",
  "data": { "type": "chat", "message": "Hello" }
}
```

### Server Messages

#### Joined

```json
{
  "type": "joined",
  "room": {...},
  "participant": {...}
}
```

#### Participant Joined

```json
{
  "type": "participant-joined",
  "participant": {...}
}
```

#### Participant Left

```json
{
  "type": "participant-left",
  "participant": {...}
}
```

#### Track Published

```json
{
  "type": "track-published",
  "track": {...}
}
```

#### Track Unpublished

```json
{
  "type": "track-unpublished",
  "trackSid": "TR_123"
}
```

#### Track Subscribed

```json
{
  "type": "track-subscribed",
  "trackSid": "TR_123",
  "transportId": "TP_123"
}
```

#### Data Received

```json
{
  "type": "data",
  "participantSid": "PA_123",
  "kind": "reliable",
  "data": {...}
}
```

#### Error

```json
{
  "type": "error",
  "code": 100,
  "message": "Room not found"
}
```

## Token Generation

Generate access tokens on your backend:

```typescript
import { AccessToken } from '@mediasoup-lib/server';

const token = new AccessToken(API_KEY, API_SECRET, {
  identity: 'user-123',
  name: 'John Doe',
  metadata: { role: 'host' },
});

token.addGrant({
  room: 'room-name',
  roomJoin: true,
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
});

const jwt = token.toJwt();
```

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ WebSocket
       ▼
┌─────────────────┐
│ WebSocketServer │
└──────┬──────────┘
       │
┌──────▼──────────┐
│  RoomManager    │◄────┐
└──────┬──────────┘     │
       │                │
┌──────▼──────────┐     │
│     Room        │     │
└──────┬──────────┘     │
       │                │
┌──────▼──────────┐     │
│  Participants   │     │
└─────────────────┘     │
                       │
┌──────────────────────┼──────────────┐
│                      │              │
┌──────▼──────┐  ┌─────▼─────┐  ┌───▼──────┐
│ Mediasoup   │  │   Redis   │  │   JWT    │
│   Workers   │  │  Manager  │  │ Service  │
└─────────────┘  └───────────┘  └──────────┘
```

## Scaling

### Horizontal Scaling

Multiple server instances can be run behind a load balancer. Redis is used for state synchronization.

```yaml
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

  server-1:
    build: .
    environment:
      - REDIS_HOST=redis
      - REDIS_ENABLED=true
    ports:
      - '3001:3000'

  server-2:
    build: .
    environment:
      - REDIS_HOST=redis
      - REDIS_ENABLED=true
    ports:
      - '3002:3000'
```

## License

MIT
