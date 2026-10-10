import http from 'http';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import app from './app.js';

dotenv.config();

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

export const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on('join_club', (clubId: string) => {
    socket.join(`club:${clubId}`);
    console.log(`[Socket.IO] Client ${socket.id} joined room club:${clubId}`);
  });

  socket.on('join_coordinator', () => {
    socket.join('coordinators');
    console.log(`[Socket.IO] Client ${socket.id} joined room coordinators`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
    console.log(`[Server] Health check at http://localhost:${PORT}/health`);
  });
}

export { server };
