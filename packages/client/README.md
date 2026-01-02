# @mediasoup-lib/client

React client SDK for mediasoup-lib. Provides simple hooks and components for building video/audio conferencing applications.

## Installation

```bash
npm install @mediasoup-lib/client
```

## Quick Start

```tsx
import { RoomProvider, useRoom, useLocalParticipant } from '@mediasoup-lib/client';

function VideoRoom() {
  const { connect, disconnect } = useRoom();
  const localParticipant = useLocalParticipant();

  return (
    <div>
      <button onClick={connect}>Join Room</button>
      <button onClick={disconnect}>Leave Room</button>
      <button onClick={() => localParticipant?.publishTrack(track)}>Publish Track</button>
    </div>
  );
}

function App() {
  return (
    <RoomProvider options={{ url: 'ws://localhost:3000', token: 'your-token' }}>
      <VideoRoom />
    </RoomProvider>
  );
}
```

## Components

### RoomProvider

The main provider component that wraps your application and provides room context.

```tsx
<RoomProvider
  options={{
    url: 'ws://localhost:3000',
    token: 'your-access-token',
    autoSubscribe: true,
    enableDataChannels: true,
  }}
  onConnectionStateChanged={(state) => console.log(state)}
  onError={(error) => console.error(error)}
  autoConnect={false}
>
  <YourApp />
</RoomProvider>
```

### VideoTrack

Component for rendering video tracks.

```tsx
<VideoTrack track={track} className="w-full" objectFit="cover" muted={true} />
```

### AudioTrack

Component for rendering audio tracks (hidden).

```tsx
<AudioTrack track={track} />
```

### ParticipantView

Component for rendering a participant with their tracks.

```tsx
<ParticipantView participant={participant} showAudioIndicator={true} showIdentity={true} />
```

### LocalParticipantView

Component for rendering local participant with controls.

```tsx
<LocalParticipantView participant={localParticipant} showIdentity={true} />
```

### RoomView

Component for rendering all participants in a room.

```tsx
<RoomView layout="grid" showLocalParticipant={true} />
```

## Hooks

### useRoom

Access the room instance and manage connection.

```tsx
const room = useRoom();

room.connect();
room.disconnect();
```

### useLocalParticipant

Access and control the local participant.

```tsx
const localParticipant = useLocalParticipant();

// Publish a track
await localParticipant.publishTrack(track);

// Unpublish a track
await localParticipant.unpublishTrack(trackSid);

// Publish data
await localParticipant.publishData({ type: 'chat', message: 'Hello' });
```

### useParticipants

Get all remote participants.

```tsx
const participants = useParticipants();

participants.map((p) => <ParticipantView key={p.sid} participant={p} />);
```

### useParticipant

Get a specific participant by SID.

```tsx
const participant = useParticipant('PA_123');
```

### useParticipantByIdentity

Get a specific participant by identity.

```tsx
const participant = useParticipantByIdentity('user-123');
```

### useTracks

Get all tracks (local and remote).

```tsx
const tracks = useTracks();
```

### useTracksByKind

Get tracks filtered by kind.

```tsx
const videoTracks = useTracksByKind('video');
const audioTracks = useTracksByKind('audio');
```

### useAudioTracks

Get all audio tracks.

```tsx
const audioTracks = useAudioTracks();
```

### useVideoTracks

Get all video tracks.

```tsx
const videoTracks = useVideoTracks();
```

### useTrackPublications

Get all track publications.

```tsx
const publications = useTrackPublications();
```

### useLocalTracks

Get local participant's tracks.

```tsx
const localTracks = useLocalTracks();
```

### useConnectionState

Monitor connection state.

```tsx
const state = useConnectionState();
// 'connected' | 'disconnected' | 'reconnecting'
```

### useIsConnected

Check if connected.

```tsx
const isConnected = useIsConnected();
```

### useIsConnecting

Check if connecting.

```tsx
const isConnecting = useIsConnecting();
```

### useIsDisconnected

Check if disconnected.

```tsx
const isDisconnected = useIsDisconnected();
```

### useIsReconnecting

Check if reconnecting.

```tsx
const isReconnecting = useIsReconnecting();
```

### useDataChannel

Send and receive data through data channels.

```tsx
const { sendData, onData } = useDataChannel();

sendData({ type: 'chat', message: 'Hello' });
onData((data) => console.log('Received:', data));
```

### useDataChannelListener

Listen to data channel events.

```tsx
useDataChannelListener('message', (data) => {
  console.log('Message received:', data);
});
```

### useMediaDevices

Access and manage media devices.

```tsx
const { audioInputs, videoInputs, audioOutputs, getDevices, getUserMedia, getDisplayMedia } =
  useMediaDevices();

// Get all devices
await getDevices();

// Get user media (camera/mic)
const stream = await getUserMedia({ video: true, audio: true });

// Get display media (screen share)
const stream = await getDisplayMedia({ video: true });
```

## Client Classes

### RoomClient

Main client class for managing room connections.

```tsx
import { RoomClient } from '@mediasoup-lib/client';

const client = new RoomClient({
  url: 'ws://localhost:3000',
  token: 'your-token',
});

await client.connect();
await client.disconnect();
```

### Track

Base track class.

```tsx
track.mute();
track.unmute();
track.stop();
```

### LocalTrack

Local track implementation.

```tsx
await localTrack.mute();
await localTrack.unmute();
```

### RemoteTrack

Remote track implementation.

```tsx
remoteTrack.on('subscribed', () => console.log('Subscribed'));
remoteTrack.on('unsubscribed', () => console.log('Unsubscribed'));
```

### DataChannel

WebRTC data channel wrapper.

```tsx
dataChannel.send('Hello');
dataChannel.on('message', (data) => console.log(data));
```

### DataChannelManager

Manages multiple data channels.

```tsx
const channel = await manager.createChannel({ label: 'chat' });
manager.closeChannel('chat');
```

## Types

### RoomClientOptions

```tsx
interface RoomClientOptions {
  url: string;
  token: string;
  autoSubscribe?: boolean;
  preferredVideoCodec?: 'vp8' | 'vp9' | 'h264' | 'av1';
  preferredAudioCodec?: 'opus' | 'isac' | 'aac';
  enableSimulcast?: boolean;
  enableDataChannels?: boolean;
  maxVideoBitrate?: number;
  maxAudioBitrate?: number;
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: 'all' | 'relay';
  debug?: boolean;
}
```

### TrackPublishOptions

```tsx
interface TrackPublishOptions {
  publish?: boolean;
  simulcast?: boolean;
  maxBitrate?: number;
  codec?: string;
}
```

### TrackSubscribeOptions

```tsx
interface TrackSubscribeOptions {
  subscribe?: boolean;
  codec?: string;
  maxBitrate?: number;
}
```

### DataChannelOptions

```tsx
interface DataChannelOptions {
  label: string;
  ordered?: boolean;
  maxPacketLifeTime?: number;
  maxRetransmits?: number;
  protocol?: string;
}
```

## License

MIT
