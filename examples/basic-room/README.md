# Basic Room Example

A simple video conferencing example using PulseWave.

## Features

- Join/Leave room functionality
- Display local and remote participants
- Camera and microphone controls
- Connection state monitoring
- Device selection support

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 8

### Setup

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

The app will be available at `http://localhost:5173`

### Server Setup

Before running the example, make sure the PulseWave server is running:

```bash
cd packages/server
docker-compose up -d
```

Or run it locally:

```bash
cd packages/server
cp .env.example .env
npm start
```

### Usage

1. Open the app in your browser
2. Enter a room name
3. Enter an access token (you can generate one using the server's `/api/token` endpoint)
4. Click "Join Room"
5. Use the controls to manage your participation

### Token Generation

Generate an access token using the server's API:

```bash
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/json" \
  -d '{
    "identity": "user-123",
    "name": "John Doe",
    "room": "my-room"
  }'
```

## Project Structure

```
examples/basic-room/
├── src/
│   ├── App.tsx          # Main application component
│   ├── main.tsx         # Entry point
│   └── index.css        # Styles
├── index.html           # HTML template
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
└── vite.config.ts       # Vite config
```

## Code Example

```tsx
import {
  RoomProvider,
  useRoom,
  useLocalParticipant,
  useParticipants,
  RoomView,
} from '@bytepulse/pulsewave-client';

function VideoRoom() {
  const { connect, disconnect } = useRoom();
  const localParticipant = useLocalParticipant();
  const participants = useParticipants();
  const connectionState = useConnectionState();

  return (
    <div>
      <div className="connection-status">Connection: {connectionState}</div>
      <div className="media-controls">
        <button onClick={() => localParticipant?.enableCamera()}>Enable Camera</button>
        <button onClick={() => localParticipant?.disableCamera()}>Disable Camera</button>
        <button onClick={() => localParticipant?.enableMicrophone()}>Enable Microphone</button>
        <button onClick={() => localParticipant?.disableMicrophone()}>Disable Microphone</button>
      </div>
      <div className="participants-count">Remote participants: {participants.length}</div>
      <RoomView />
    </div>
  );
}

function App() {
  const [roomOptions, setRoomOptions] = useState({
    url: 'ws://localhost:3000',
    room: 'my-room',
    token: 'your-access-token',
  });

  return (
    <RoomProvider options={roomOptions}>
      <VideoRoom />
    </RoomProvider>
  );
}
```

## Customization

You can customize the example by modifying:

- **App.tsx**: Add more features like screen sharing, chat, device selection, etc.
- **index.css**: Change the styling
- **vite.config.ts**: Configure the dev server

## License

MIT
