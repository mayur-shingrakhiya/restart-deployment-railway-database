import express from "express";
import http from "http";
import { Server } from "socket.io";
import { setSocketInstance } from "./socket/emitter";

export let io: Server | null = null;

export function startSocketServer() {
  const app = express();
  const server = http.createServer(app);

  io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  // 🔗 VERY IMPORTANT
  setSocketInstance(io);

  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id);

    /* ---------------- JOIN DEPOSIT ROOM ---------------- */
    socket.on("join-deposit-room", (tnxid: string) => {
      socket.join(tnxid);
      console.log(`✅ Socket ${socket.id} joined room: ${tnxid}`);
    });

    /* ---------------- LEAVE DEPOSIT ROOM ---------------- */
    socket.on("leave-deposit-room", (tnxid: string) => {
      socket.leave(tnxid);
      console.log(`❌ Socket ${socket.id} left room: ${tnxid}`);
    });

    socket.on("disconnect", () => {
      console.log("🔴 Socket disconnected:", socket.id);
    });
  });

  server.listen(9068, () => {
    console.log("🚀 Socket server running on port 9068");
  });
}
