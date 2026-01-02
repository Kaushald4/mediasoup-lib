# Mediasoup Lib

A LiveKit-style WebRTC wrapper built on top of mediasoup, providing a complete video/audio conferencing solution with simple React hooks and a self-hosted server.

## Overview

- **Client SDK**: React library with simple hooks like `useRoom`, `useTracks`, `useLocalParticipant`
- **Server**: Self-hosted or Docker-deployable mediasoup SFU server
- **Features**: Video/audio streaming, screen sharing, data channels, text chat

## Packages

| Package                 | Description                                | Status      |
| ----------------------- | ------------------------------------------ | ----------- |
| `@mediasoup-lib/client` | React client SDK with hooks and components | ✅ Complete |
| `@mediasoup-lib/server` | Mediasoup SFU server (Docker)              | ✅ Complete |
| `@mediasoup-lib/shared` | Shared types and constants                 | ✅ Complete |

## Quick Start

### Server (Docker)

```bash
# Clone the repository
git clone https://github.com/your-org/mediasoup-lib.git
cd mediasoup-lib

# Start with docker-compose
cd packages/server
docker-compose up -d
```

The server will be available at `http://localhost:3000`

### Client (React)

```bash
# Install the client SDK
npm install @mediasoup-lib/client
```

```tsx
import {
  RoomProvider,
  useRoom,
  useLocalParticipant,
  useTracks,
  TrackView,
} from '@mediasoup-lib/client';

function VideoRoom() {
  const room = useRoom();
  const localParticipant = useLocalParticipant();
  const tracks = useTracks();

  return (
    <div>
      <button onClick={() => localParticipant.setCameraEnabled(true)}>Enable Camera</button>
      <button onClick={() => localParticipant.setMicrophoneEnabled(true)}>Enable Microphone</button>

      {tracks.map((track) => (
        <TrackView key={track.sid} track={track} />
      ))}
    </div>
  );
}

function App() {
  return (
    <RoomProvider
      token={accessToken}
      serverUrl="wss://mediasoup.example.com"
      options={{ autoConnect: true }}
    >
      <VideoRoom />
    </RoomProvider>
  );
}
```

## Client SDK API

### RoomProvider

The main entry point for using the client SDK.

```tsx
<RoomProvider
  token={accessToken}
  serverUrl="wss://mediasoup.example.com"
  options={{
    autoConnect: true,
    adaptiveStream: true,
    dynacast: true,
  }}
>
  <YourRoomComponent />
</RoomProvider>
```

### React Hooks

#### `useRoom()`

Access the room instance and manage connection.

```tsx
const room = useRoom();

room.connect();
room.disconnect();
room.name;
room.participants;
room.localParticipant;
```

#### `useTracks()`

Get all tracks (local and remote).

```tsx
const tracks = useTracks();

tracks.map((track) => <TrackView key={track.sid} track={track} />);
```

#### `useLocalParticipant()`

Access and control the local participant.

```tsx
const localParticipant = useLocalParticipant();

localParticipant.setCameraEnabled(true);
localParticipant.setMicrophoneEnabled(false);
localParticipant.publishTrack(track);
localParticipant.unpublishTrack(trackSid);
```

#### `useParticipants()`

Get all participants in the room.

```tsx
const participants = useParticipants();

participants.map((p) => <ParticipantView key={p.sid} participant={p} />);
```

#### `useDataChannel()`

Send and receive data.

```tsx
const { sendData, onData } = useDataChannel();

sendData({ type: 'chat', message: 'Hello' });
onData((data) => console.log('Received:', data));
```

#### `useConnectionState()`

Monitor connection state.

```tsx
const state = useConnectionState();
// 'connected' | 'disconnected' | 'reconnecting'
```

## Server Configuration

### Environment Variables

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

### Token Generation

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
mediasoup-lib/
├── packages/
│   ├── client/          # React client SDK
│   ├── server/          # Mediasoup SFU server
│   └── shared/          # Shared types and constants
├── plans/               # Architecture and roadmap
└── README.md
```

See [`plans/architecture.md`](plans/architecture.md) for detailed architecture documentation.

## Development

### Prerequisites

- Node.js >= 18
- pnpm >= 8

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev
```

### Build

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @mediasoup-lib/client build
pnpm --filter @mediasoup-lib/server build
```

### Test

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @mediasoup-lib/client test
```

## Deployment

### Server (Docker)

```bash
# Build the Docker image
docker build -t mediasoup-lib/server:latest packages/server

# Run with docker-compose
cd packages/server
docker-compose up -d
```

### Client (NPM)

```bash
# Build and publish
pnpm build
pnpm release
```

## Roadmap

See [`plans/roadmap.md`](plans/roadmap.md) for the complete implementation roadmap.

### Current Status

- ✅ Phase 1: Project Setup & Infrastructure
- ✅ Phase 2: Shared Package (types and constants)
- ✅ Phase 3: Server - Core SFU
- ✅ Phase 4: Server - WebSocket Server
- ✅ Phase 5: Server - Token Service
- ✅ Phase 6: Server - Redis Integration
- ✅ Phase 7: Server - Configuration & Logging
- ✅ Phase 8: Server - Docker & Deployment
- ✅ Phase 9: Client - Core Client
- ✅ Phase 10: Client - Media Handling
- ✅ Phase 11: Client - React Context
- ✅ Phase 12: Client - React Hooks
- ✅ Phase 13: Client - React Components
- ✅ Phase 14: Client - Data Channels
- ✅ Phase 15: Testing
- 🚧 Phase 16: Documentation
- ⏳ Phase 17: CI/CD
- ⏳ Phase 18: Examples
- ⏳ Phase 19: Performance & Optimization
- ⏳ Phase 20: Security

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT

## Support

- GitHub Issues: [github.com/your-org/mediasoup-lib/issues](https://github.com/your-org/mediasoup-lib/issues)
- Documentation: [docs.mediasoup-lib.com](https://docs.mediasoup-lib.com)

## Acknowledgments

Built with:

- [mediasoup](https://mediasoup.org/) - WebRTC SFU library
- [React](https://react.dev/) - UI library
- [TypeScript](https://www.typescriptlang.org/) - Type safety
