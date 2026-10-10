import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { RoomManager } from './RoomManager';
import { MessageHandler } from './MessageHandler';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || true },
});

const rooms = new RoomManager();
io.on('connection', (socket) => new MessageHandler(io, socket, rooms));

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.count }));

const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const port = Number(process.env.PORT) || 3001;
server.listen(port, () => console.log(`Watch Party server listening on :${port}`));
