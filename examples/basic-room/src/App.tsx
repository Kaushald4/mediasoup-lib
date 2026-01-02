import { useState, useEffect } from 'react';
import {
  RoomProvider,
  useRoom,
  useLocalParticipant,
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
  const connectionState = useConnectionState();

  // Auto-connect when component mounts
  useEffect(() => {
    connect().catch(console.error);
  }, [connect]);

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
        <button onClick={handleLeave}>Leave Room</button>
        {localParticipant && (
          <div className="local-controls">
            <h3>Local Participant</h3>
            <p>Name: {localParticipant.name}</p>
            <p>Identity: {localParticipant.identity}</p>
          </div>
        )}
      </div>
      <RoomView />
    </>
  );
}

export default App;
