// socket logic/registerHandlers.ts
import WebSocket from "ws";
import jwt from "jsonwebtoken";
import url from "url";
import { redis } from "../utils/db/db";
import { DecodedUserPayload } from "../types/http";
import { subscriber } from "../utils/db/db";
import { prismaClient } from "../utils/db/db"
import { IncomingMessage } from "http";
const secret = process.env.JWT_SECRET!;
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
        content: data.content
      }))
    }


  } catch (error) {

    console.error("error happened while handling redis message", error)

  }
})



interface PublishMessageFormat {
  to: string,
  content: string,
  server: string
}

interface MessageFormat {
  to: string,
  content: string,
}

type UserAvailability =
  | { status: "not_exists" }
  | { status: "blocked" }
  | { status: "offline" }
  | { status: "online"; server: string; name: string; id: string }




async function checkUserAvailability(recipientId: string, senderId: string): Promise<UserAvailability> {
  try {

    const isBlocked = await redis.sismember(`blockedUser:${recipientId}`, senderId)

    if (isBlocked == 1) {
      return { status: "blocked" }
    }

    const userStatus = await redis.get(`user:${recipientId}`)

    if (userStatus) {
      const recipientJson = JSON.parse(userStatus) as {
        server: string,
        id: string,
        name: string
      }
      return { status: "online", ...recipientJson }
    }

    const recipient = await prismaClient.user.findUnique({
      where: {
        mobileNo: recipientId,
      }
    })

    if (!recipient) {
      return { status: "not_exists" }
    }

    return { status: "offline" }


  } catch (error) {
    console.error("Error while checking the recipientStatus", error)
    return { status: "offline" }
  }
}


async function PublishMessage(messageData: PublishMessageFormat): Promise<boolean> {
  try {

    await redis.publish(`message:${messageData.server}`, JSON.stringify({ to: messageData.to, content: messageData.content }))

    return true
  } catch (error) {

    console.error("error while publishing the message", error)
    return false
  }
}


async function ValidateWebSocketConnection(ws: WebSocket, req: IncomingMessage) {
  const { query } = url.parse(req.url!, true);
  const token = query?.token as string | undefined;

  if (!token) {
    console.error("No token provided");
    ws.close();
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as DecodedUserPayload;
    (ws as any).user = decoded;
    console.log("User connected:", decoded);

    connectedClient.set(decoded.mobileNo, ws)

    const userInfo = JSON.stringify({
      server: process.env.SERVER_ID || "server-1",
      name: decoded.name,
      id: decoded.id
    });

    // add user to the redis database along with its server

    await redis.set(`user:${decoded.mobileNo}`, userInfo);

    ws.send(JSON.stringify({
      type: "system",
      message: `Now you can send one-to-one messages as ${decoded.name}`,
    }));
  } catch (err) {
    console.error("❌ JWT verification failed:", err);
    ws.close();
  }
}


function extractValidateMessage(ws: WebSocket, message: WebSocket.RawData): MessageFormat | undefined {
  let parsedData: MessageFormat;

  try {
    parsedData = JSON.parse(message.toString());
  } catch (error) {
    console.error("❌ Error parsing data:", error);
    ws.send(JSON.stringify({
      type: "system",
      message: "Invalid message format. Expected JSON with {to, content}",
    }));
    return; // stop further execution
  }

  const recipientId = parsedData.to;
  const content = parsedData.content;
  //const sender = (ws as any).user?.id;

  if (!recipientId || !content) {
    ws.send(JSON.stringify({
      type: "system",
      message: "Both 'to' and 'content' fields are required",
    }));
    return;
  }

  return parsedData
}


// global map data to store the clientId/mobile no and its connected instance to look quickly
const connectedClient = new Map<string, WebSocket>()

export default function registerSocketHandlers(wss: WebSocket.Server) {
  wss.on("connection", async (ws, req) => {
    console.log("connection event fired");

    // validate the connection and attach user payload to ws
    ValidateWebSocketConnection(ws, req);

    // Handle messages
    ws.on("message", async (message) => {
      const userData = extractValidateMessage(ws, message);

      if (!userData) {
        console.log("invalid data handled");
        return;
      }

      const sender = (ws as any).user as DecodedUserPayload;

      const isAvailable = await checkUserAvailability(userData.to, sender.id);

      console.log("Availability result:", isAvailable);

      // TODO: route/send the message if available, or handle offline/block cases

      switch (isAvailable.status) {
        case "not_exists":
          console.log("user does not exist");
          ws.send(JSON.stringify({
            type: "system",
            message: "User does not exist. Invite them on this platform"
          }));
          break;

        case "blocked":
          console.log("user is blocked");
          ws.send(JSON.stringify({
            type: "system",
            message: "Recipient has blocked you! Can't be helped sorry!"
          }));
          break;

        case "offline":
          console.log("user is offline");
          ws.send(JSON.stringify({
            type: "system",
            message: "User is offline. Message will be dropped off! Stay tuned for offline feature."
          }));
          // TODO: store in DB for offline delivery
          break;

        case "online":
          console.log("user is online, publishing message");

          await PublishMessage({
            to: userData.to,
            content: userData.content,  // make sure you pass content
            server: isAvailable.server! // from checkUserAvailability
          });

          // (optional) also ACK back to sender that it was delivered
          ws.send(JSON.stringify({
            type: "ack",
            message: "Message delivered to recipient’s server"
          }));

          break;

        default:
          console.warn("Unexpected status", isAvailable);
      }
    });

    // Handle errors
    ws.on("error", (error) => {
      console.error("error at the ws instance", error);
    });

    // Handle close (mark user offline + cleanup)
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

