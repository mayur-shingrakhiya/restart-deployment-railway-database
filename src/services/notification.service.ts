import * as restate from "@restatedev/restate-sdk";
import { io } from "../socket.server";

export const notificationService = restate.service({
  name: "notification",
  handlers: {
    send: async (ctx, req) => {
      if (!io) {
        return { success: false };
      }
      io.emit("notification", {
        title: req.title,
        message: req.message,
      });

      return {
        success: true,
        message: "Notification sent",
      };
    },
  },
});
