# Watch Party

A real-time YouTube watch party application that lets users watch videos together in synchronized rooms. Create a room, share the code or invite link, and everyone stays in sync with real-time play, pause, seek, and video changes.

**Live Demo:** https://watch-party-ouyr.onrender.com/

## Features

- Create or join rooms using a 6-character code or invite link
- Real-time synchronization of play, pause, seek, and video changes
- Late joiners automatically sync to the current playback position
- Role-based access control with **Host, Moderator, and Participant** roles
- Host can assign roles, remove participants, block users, and transfer host privileges
- Participants can request playback or video changes for Host/Moderator approval
- Real-time chat and emoji reactions
- Refresh-safe reconnect: a stable browser ID and a short disconnect grace period preserve the user's room role during refreshes or brief connection drops
- Automatic host transfer: when the host leaves, a moderator is promoted; otherwise, the first remaining participant becomes host

## Roles & Permissions

| Action | Host | Moderator | Participant |
|---|:---:|:---:|:---:|
| Play / Pause / Seek / Change Video | ✅ | ✅ | Request |
| Approve / Decline Requests | ✅ | ✅ | ❌ |
| Assign Roles | ✅ | ❌ | ❌ |
| Remove Participants | ✅ | ❌ | ❌ |
| Transfer Host | ✅ | ❌ | ❌ |
| Chat / React | ✅ | ✅ | ✅ |

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express
- **Real-time Communication:** Socket.IO
- **Video:** YouTube IFrame API
- **State Management:** In-memory room state

## Getting Started

### Prerequisites

- Node.js 18+

### Installation

```bash
npm run install:all
```

### Run the Application

```bash
npm run dev
```

The application runs at:

- Frontend: `http://localhost:5173`
- Server: `http://localhost:3001`

Open the application in two browser windows or devices to test real-time synchronization.

### Run Tests

Make sure the server is running, then execute:

```bash
npm --prefix server run test:smoke
```

## Production Build

```bash
npm run build
npm start
```

The Express server serves the production frontend and Socket.IO server using the configured `$PORT` (default: `3001`).

## Deployment

The application can be deployed as a **single service on Render**.

1. Push the repository to GitHub.
2. Create a new **Web Service** on Render.
3. Select the repository.
4. Use the following commands:

```text
Build Command: npm run build
Start Command: npm start
```

The included `render.yaml` can also be used for deployment.

Since the frontend and backend share the same origin, no additional CORS configuration is required.

> **Note:** The application currently uses in-memory room state. Rooms are cleared when the server restarts, and free Render instances may sleep after inactivity.

## Architecture

```text
┌──────────────────────────┐        Socket.IO        ┌──────────────────────────┐
│        React Client      │ ◄────────────────────► │       Node Server        │
│                          │                         │                          │
│  Lobby / RoomView        │                         │  MessageHandler          │
│  YouTube Player          │                         │       ↓                  │
│  Participants / Chat     │                         │  Permission Guard        │
│                          │                         │       ↓                  │
└──────────────────────────┘                         │  RoomManager → Room      │
                                                   └──────────────────────────┘
```

### Server Components

- **Room** – Manages participants, roles, video state, and pending requests.
- **RoomManager** – Creates, retrieves, and removes rooms.
- **MessageHandler** – Handles Socket.IO events and routes them to the appropriate Room methods.
- **permissions.ts** – Defines role-based permissions and ensures privileged actions are validated server-side.

## Real-Time Synchronization

The server maintains the current video state:

```text
videoId + playing + time + updatedAt
```

Instead of updating the playback position every second, the current position is calculated from the stored timestamp and elapsed time.

When a user performs an allowed action:

```text
User Action
    ↓
Server Permission Check
    ↓
Room State Update
    ↓
Broadcast sync_state
    ↓
All Clients Update Player
```

Clients only update the YouTube player based on server synchronization, preventing feedback or echo loops.

While a video is playing, clients periodically request fresh state and correct playback drift when necessary.

## Design Decisions

### Server-Side Authorization

Controls for unauthorized users send approval requests instead, and **all privileged actions are validated on the server** using the role-based permission system.

### In-Memory State

In-memory storage keeps the application simple and fast, but room data is lost when the server restarts and the application currently runs on a single server instance.

For horizontal scaling, room state could be moved to Redis or a database and Socket.IO could use the Redis adapter.

### Identity

Users receive a randomly generated browser ID stored in `localStorage`. This provides lightweight identity persistence but is **not authentication**. A full authentication system would be required for stronger identity and access control.

### Synchronization Accuracy

The application aims for near real-time synchronization rather than frame-perfect synchronization. Network latency and YouTube buffering can introduce small playback differences between clients.

## Project Structure

```text
server/
├── src/
│   ├── permissions.ts
│   ├── Room.ts
│   ├── RoomManager.ts
│   ├── MessageHandler.ts
│   └── index.ts
└── test/
    └── smoke.ts

client/
└── src/
    ├── App.tsx
    ├── socket.ts
    ├── youtube.ts
    └── components/
        ├── Lobby.tsx
        ├── RoomView.tsx
        ├── Player.tsx
        ├── Participants.tsx
        └── Chat.tsx
```
