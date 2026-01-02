# Basic Room Example

A simple video conferencing example using mediasoup-lib.

## Features

- Join/Leave room functionality
- Display local and remote participants
- Connection state monitoring
- Basic room controls

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

Before running the example, make sure the mediasoup-lib server is running:

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
3. Enter an access token (you can generate one using the server's `/token` endpoint)
4. Click "Join Room"
5. Use the controls to manage your participation

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

## Customization

You can customize the example by modifying:

- **App.tsx**: Add more features like screen sharing, chat, etc.
- **index.css**: Change the styling
- **vite.config.ts**: Configure the dev server

## License

MIT
