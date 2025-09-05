import WebSocket from "ws";
import { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import url from "url";
import logger from "../utils/logger/pinoLogger";
import { DecodedUserPayload } from "../types/http";
import { redis } from "../utils/db/db";
import { Envelope } from "../types/messageValidation";
import { parseEnvelope } from "./socketutils/messagehelper";
import { sendSystemErrorMessage, sendSystemInfoMessage } from "./socketutils/messagehelper";
import { handleChatMessages } from "./messagesHandlers/handleMessages";

/**
 * Connection state model:
 *
 * We maintain 3 in-memory maps + Redis for efficient routing:
 *
 * 1. userToWs: Map<userId, WebSocket>
 *    - Primary routing table for delivering chat messages.
 *
 * 2. wsToUser: Map<WebSocket, userId>
 *    - Reverse lookup used during socket close/error/termination.
 *    - Avoids O(n) scans through connectedClients.
 *
 * 3. activeConnection: Map<WebSocket, boolean>
 *    - Tracks liveness of sockets across ping/pong cycles.
 *    - Ensures stale connections are terminated and cleaned up.
 *
 * 4. Redis (user:<id> = "online"/"offline")
 *    - Global state for presence across distributed servers.
 *    - Also serves as a queue for offline message delivery.
 *
 * Together, this design guarantees:
 * - O(1) message routing (userId → ws)
 * - O(1) cleanup (ws → userId)
 * - O(1) liveness tracking
 * - Durability and horizontal scalability via Redis
 *
 * This is the same pattern used in production chat systems
 * (Slack, WhatsApp, Discord) at a smaller scale.
 */


const secret = process.env.JWT_SECRET!;
const serverId = process.env.SERVER_ID!
const userToWs = new Map<string, WebSocket>(); // to deliver messages needs userMobile mapped to websocket
const wsToUser = new Map<WebSocket, string>(); // to handle termination needs websocker mapped to userMobile

// Validate incoming connection and attach user
async function checkComingConnection(
  ws: WebSocket,
  req: IncomingMessage
): Promise<DecodedUserPayload | null> {
  try {
    const { query } = url.parse(req.url!, true);
    const token = query?.token as string | undefined;

    if (!token) {
      logger.error("No token provided");
      sendSystemErrorMessage(ws,"token missing","validation error token not provided")
      ws.close();
      return null;
    }

    const decoded = jwt.verify(token, secret) as DecodedUserPayload;
    (ws as any).user = decoded;
    logger.info("✅ User connected:");

    userToWs.set(decoded.mobileNo, ws);
    wsToUser.set(ws, decoded.mobileNo);

    const dataForRedisStore = {
      name:decoded.name,
      server:serverId||"1",
      id:decoded.id
    }

    await redis.set(`user:${decoded.mobileNo}`, JSON.stringify(dataForRedisStore))


    sendSystemInfoMessage(ws,`dear user:${decoded.name} you are connected to the server!`)

    return decoded;
  } catch (err) {
    logger.error("JWT verification failed:");
    console.error(err)

    sendSystemErrorMessage(ws, "jwt verification failed", "please relogin. use fresh tokens to connect")

    ws.close();
    return null;
  }
}

// deliver offline messages and attach streamId

async function deliverOfflineMessages(ws:WebSocket, userMobileNo:string){
  try {
    const streamKey = `offlineMessage:${userMobileNo}`;
    const messages = await redis.xrange(streamKey, "-", "+");

    if (!messages.length) return;

    for (const [id, fields] of messages) {
      // Convert array of fields to an object
      const messageObj = Object.fromEntries(
        fields.reduce((acc, val, i) => {
          if (i % 2 === 0) acc.push([val, fields[i + 1]]);
          return acc;
        }, [] as [string, string][])
      );

      // Attach Redis stream entry ID as streamId
      messageObj.streamId = id;

      // Send message to client
      ws.send(JSON.stringify({
        type: "chat.message",
        ...messageObj
      }));
    }
  } catch (error) {
    logger.error("Error delivering offline messages:");
    console.error(error);
  }
}


// Main WebSocket handler
export default function registerSocketHandlers(wss: WebSocket.Server) {

  const activeConnection = new Map<WebSocket, boolean>()

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    console.log("🔗 Incoming connection from:", req.socket.remoteAddress);

    const user = await checkComingConnection(ws, req);
    if (!user) return;

    activeConnection.set(ws, true)

    await deliverOfflineMessages(ws, user.mobileNo)

    ws.on("pong", () => {
      console.log("got ping from client.")
      activeConnection.set(ws, true)
    })

    ws.on("message", (data, isBinary) => {

      if (isBinary) {
        logger.info("we have a binary payload in on messages! not handling that")
        return;
      }

      const recievedMessage: Envelope | null = parseEnvelope(data)

      if (recievedMessage == null) {
        logger.info("some weird message format recieved")
        return;
      }

      switch (recievedMessage.type) {
        
        case "chat":
          handleChatMessages(ws, recievedMessage, userToWs, user.id)
          break;

        case "ack":
          logger.info(
            "got an chat ack"
          )
          break;
          
        default:
          logger.info("you have sent an invalid choice.")
          break;
      }


    })

    ws.on("close", async (code, reason) => {
      console.log("❌ WS closed:", code, reason.toString());

      // 1. Global presence cleanup
      await redis.del(`user:${user.mobileNo}`);

      // 2. In-memory maps cleanup
      userToWs.delete(user.mobileNo);  // userId → ws map
      wsToUser.delete(ws);             // ws → userId map
      activeConnection.delete(ws);     // ws → liveness flag

      // 3. Logging
      logger.info(`User disconnected: ${user.mobileNo}`);
    });


    ws.on("error", (err) => console.error("WebSocket error:", err));


    // pings every client in 30 seconds for responsiveness or drops the connection
    setInterval(async () => {
      logger.info("pinging each websocket instance");

      for (const ws of wss.clients) {
        if (!activeConnection.get(ws)) {
          const userMobileNo = wsToUser.get(ws);
          logger.info("dropping connection due to inactivity");
          ws.terminate();

          if (userMobileNo) {
            userToWs.delete(userMobileNo);
            wsToUser.delete(ws);
            await redis.del(`user:${userMobileNo}`); // ✅ works here
          }

          activeConnection.delete(ws);
          continue;
        }

        activeConnection.set(ws, false);
        ws.ping();
      }
    }, 30000);



  });

}

