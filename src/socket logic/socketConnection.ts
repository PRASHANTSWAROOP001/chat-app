// socket logic/registerHandlers.ts
import WebSocket from "ws";
import { redis } from "../utils/db/db";
import { MessageTypes } from "../types/socketTypes";
import { subscriber } from "../utils/db/db";
import { prismaClient } from "../utils/db/db"
import logger from "../utils/logger/pinoLogger";
import ValidateWebSocketConnection from "./utils/validateSocketConnection";
import extractValidateMessage from "./utils/extractMessage";

import { handleChat } from "./socketRouter/chat";
import { handleAck } from "./socketRouter/handleAck";

const serverId = process.env.SERVER_ID!


subscriber.subscribe(`message:${serverId}`, (err, count) => {
  if (err) {
    console.error('Failed to subscribe:', err);
  } else {
    console.log(`Successfully subscribed to ${count} channel(s)`);
  }
})



subscriber.on("message", (channel, message) => {
  console.log("message recieved on channel", channel)
  try {

    const data: { to: string, content: string } = JSON.parse(message)

    const ws = connectedClient.get(data.to)

    if (ws && ws.readyState == WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "message",
        content:data
      }))
    }


  } catch (error) {

    console.error("error happened while handling redis message", error)

  }
})







// global map data to store the clientId/mobile no and its connected instance to look quickly
const connectedClient = new Map<string, WebSocket>()



export default function registerSocketHandlers(wss: WebSocket.Server) {
  wss.on("connection", async (ws, req) => {
    console.log("connection event fired");


    ValidateWebSocketConnection(ws, req, connectedClient);

    // Handle messages
    ws.on("message", async (message) => {
      const messageData: MessageTypes | null = extractValidateMessage(ws, message);

      if (messageData == null) {
        logger.warn("invalid payload sent")
        return;
      }

      switch (messageData.type) {
        case "chat.message":
          await handleChat(ws, messageData, connectedClient);
          break;

        case "chat.ack":
          await handleAck(ws, messageData);
          break;

        case "system.ping":
          ws.send(JSON.stringify({ type: "system.pong" }));
          break;

        case "system.pong":
          console.log("pong received");
          break;

        case "system.presence":
          console.log("hanle presence");
          break;

        case "system.error":
          logger.error(`Error: ${messageData.message}`);
          break;

        default:
          logger.warn("invalid selecttion");
      }

    });


    ws.on("error", (error) => {
      console.error("error at the ws instance", error);
    });

    ws.on("close", async () => {
      const user = (ws as any).user;
      if (user?.mobileNo) {
        connectedClient.delete(user.mobileNo);
        await redis.del(`user:${user.mobileNo}`);
        console.log("user disconnected:", user.mobileNo);
      }
    });

  });
}

