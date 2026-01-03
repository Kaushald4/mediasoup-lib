import { useState, useEffect } from 'react';
import {
  RoomProvider,
  useRoom,
  useLocalParticipant,
  useParticipants,
  useConnectionState,
  RoomView,
} from '@mediasoup-lib/client';

function App() {
  const [roomOptions, setRoomOptions] = useState({
    url: 'ws://localhost:3000',
    room: '',
    token: '',
  });
  const [showRoom, setShowRoom] = useState(false);
  const [token, setToken] = useState('');
  const [roomName, setRoomName] = useState('');

  const handleJoin = () => {
    if (token && roomName) {
      setRoomOptions({
        url: 'ws://localhost:3000',
        room: roomName,
        token: token,
      });
      setShowRoom(true);
    }
  };

  const handleLeave = () => {
    setShowRoom(false);
    setToken('');
    setRoomName('');
  };

  return (
    <div className="app">
      <header>
        <h1>Basic Room Example</h1>
        <p>A simple video conferencing example using mediasoup-lib</p>
      </header>
      <main>
        {!showRoom ? (
          <div className="room-controls">
            <h2>Join a Room</h2>
            <div className="join-form">
              <input
                type="text"
                placeholder="Room Name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Access Token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button onClick={handleJoin}>Join Room</button>
            </div>
            <div className="instructions">
              <h3>Instructions</h3>
              <ol>
                <li>Make sure the mediasoup-lib server is running on port 3000</li>
                <li>Generate an access token using the server's /token endpoint</li>
                <li>Enter the room name and token above</li>
                <li>Click "Join Room" to connect</li>
              </ol>
              <p>
                <strong>Token Generation Example:</strong>
              </p>
              <pre>{`curl -X POST http://localhost:3000/api/token \\
  -H "Content-Type: application/json" \\
  -d '{"identity":"user123","name":"John","room":"my-room"}'`}</pre>
              <p>
                <strong>Required fields:</strong>
              </p>
              <ul>
                <li>
                  <code>identity</code> - Unique user identifier (required)
                </li>
                <li>
                  <code>name</code> - Display name for the participant
                </li>
                <li>
                  <code>room</code> - Room name to join
                </li>
                <li>
                  <code>metadata</code> - Optional metadata object
                </li>
                <li>
                  <code>canPublish</code> - Whether user can publish tracks (default: true)
                </li>
                <li>
                  <code>canSubscribe</code> - Whether user can subscribe to tracks (default: true)
                </li>
                <li>
                  <code>canPublishData</code> - Whether user can publish data (default: true)
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <RoomProvider options={roomOptions}>
            <RoomContent onLeave={handleLeave} />
          </RoomProvider>
        )}
      </main>
    </div>
  );
}

function RoomContent({ onLeave }: { onLeave: () => void }) {
  const { connect, disconnect } = useRoom();
  const localParticipant = useLocalParticipant();
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);

  // Auto-connect when component mounts
  useEffect(() => {
    connect().catch(console.error);
  }, [connect]);

  const handleToggleCamera = async () => {
    if (!localParticipant) return;

    try {
      if (isCameraEnabled) {
        await localParticipant.disableCamera();
        setIsCameraEnabled(false);
      } else {
        await localParticipant.enableCamera();
        setIsCameraEnabled(true);
      }
    } catch (error) {
      console.error('Failed to toggle camera:', error);
    }
  };
  console.log('kk');

  const handleToggleMicrophone = async () => {
    if (!localParticipant) return;

    try {
      if (isMicrophoneEnabled) {
        await localParticipant.disableMicrophone();
        setIsMicrophoneEnabled(false);
      } else {
        await localParticipant.enableMicrophone();
        setIsMicrophoneEnabled(true);
      }
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
    }
  };

  const handleLeave = async () => {
    await disconnect();
    onLeave();
  };

  return (
    <>
      <div className="room-controls">
        <h2>Room Controls</h2>
        <div className="connection-status">
          <span>Connection: </span>
          <span className={`status ${connectionState}`}>{connectionState}</span>
        </div>
        <div className="media-controls">
          <button
            onClick={handleToggleCamera}
            disabled={!localParticipant || connectionState !== 'connected'}
            className={isCameraEnabled ? 'active' : ''}
          >
            {isCameraEnabled ? '📷 Disable Camera' : '📷 Enable Camera'}
          </button>
          <button
            onClick={handleToggleMicrophone}
            disabled={!localParticipant || connectionState !== 'connected'}
            className={isMicrophoneEnabled ? 'active' : ''}
          >
            {isMicrophoneEnabled ? '🎤 Disable Mic' : '🎤 Enable Mic'}
          </button>
        </div>
        <button onClick={handleLeave}>Leave Room</button>
        {localParticipant && (
          <div className="local-controls">
            <h3>Local Participant</h3>
            <p>Name: {localParticipant.name}</p>
            <p>Identity: {localParticipant.identity}</p>
          </div>
        )}
        <div className="participants-count">
          <h3>Participants</h3>
          <p>Remote: {participants.length}</p>
        </div>
      </div>
      <RoomView />
    </>
  );
}

export default App;
