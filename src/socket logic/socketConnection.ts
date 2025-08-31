// socket logic/registerHandlers.ts
import WebSocket from "ws";
import { redis } from "../utils/db/db";
import { MessageTypes } from "../types/socketTypes";
import { subscriber } from "../utils/db/db";
import logger from "../utils/logger/pinoLogger";
import ValidateWebSocketConnection from "./utils/validateSocketConnection";
import extractValidateMessage from "./utils/extractMessage";

import { handleChat } from "./socketRouter/chat";
import { handleAck } from "./socketRouter/handleAck";
import { handleOfflineMessages } from "./utils/handleOfflineChats";

const serverId = process.env.SERVER_ID!


subscriber.subscribe(`message:${serverId}`, (err, count) => {
  if (err) {
    console.error('Failed to subscribe:', err);
  } else {
    console.log(`Successfully subscribed to ${count} channel(s)`);
  }
})



subscriber.on("message", async (channel, message) => {
  console.log("message recieved on channel", channel)
  try {

    const data: MessageTypes = JSON.parse(message)

    switch (data.type) {
      case "chat.message":
        const ws = connectedClient.get(data.to)

        if (ws && ws.readyState == WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "chat.message",
            content: data
          }))
        }
        break;
      case "chat.ack":
        console.log("chat ack recieved")
        const newws = connectedClient.get(data.to)
        if (newws && newws.readyState == WebSocket.OPEN) {
          newws.send(JSON.stringify({
            type: "chat.ack",
            content: data
          }))

          if(data.streamId && data.mode == "offline"){
            const status =await redis.xdel(`stream:message:${data.from}`, data.streamId)
            console.log("status", status)
          }
        }

        break;

      case "system.presence":
        console.log("system message")
        break;
      case "system.error":
        break;
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
    handleOfflineMessages(ws, (ws as any).user.mobileNo)

    // Handle messages
    ws.on("message", async (message) => {
      const messageData: MessageTypes | null = extractValidateMessage(ws, message);

      if (messageData == null) {
        logger.warn("invalid payload sent")
        return;
      }

      switch (messageData.type) {
        case "chat.message":
          await handleChat(ws, messageData);
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

