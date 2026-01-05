import { Server } from "socket.io";

let io: Server | null = null;

/**
 * This will be called ONLY ONCE
 * from socket.server.ts
 */
export function setSocketInstance(socketIo: Server) {
  io = socketIo;
}

/**
 * Safe emit function
 * Can be called from workflows/services
 */
export function emitNotification(payload: any) {
  if (!io) {
    console.warn("⚠️ Socket not initialized yet");
    return;
  }

  io.emit("notification", payload);
}


export function emitDepositUpdate(tnxid: string, deposit: any) {
  if (!io) {
    console.warn("⚠️ Socket not initialized yet");
    return;
  }

  io.to(tnxid).emit("deposit-updated", {
    our_transaction_id: tnxid,
    deposit,
  });
}

