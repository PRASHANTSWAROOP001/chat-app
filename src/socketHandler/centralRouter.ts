import WebSocket from "ws";
import { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import url from "url";
import logger from "../utils/logger/pinoLogger";
import { DecodedUserPayload } from "../types/http";
import { redis } from "../utils/db/db";
import { ChatAck, ChatMessage, Envelope } from "../types/messageValidation";
import { parseEnvelope, parseSubsEnvelope } from "./socketutils/messagehelper";
import { sendSystemErrorMessage, sendSystemInfoMessage } from "./socketutils/messagehelper";
import { handleChatMessages } from "./messagesHandlers/handleMessages";
import { subscriber } from "../utils/db/db";
import { handleAck } from "./messagesHandlers/handleAckMessages";


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

subscriber.subscribe(`message:${serverId}`, (error)=>{
  if(error){
    logger.info("error while subscribing to the channel")
  }
  else{
    logger.info("subscribed to the channel.")
  }
})




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


export async function deliverOfflineMessages(
  ws: WebSocket,
  userMobileNo: string,
  serverId: string
) {
  const streamKey = "chat.messages";
  const groupName = `cg:${userMobileNo}`;
  const consumerName = `c:${userMobileNo}:${serverId}`;

  try {
    logger.info({ userMobileNo }, "Delivering offline + crashed messages…");

    // 1) Pending (unacked/crashed)
    const pending = await redis.xreadgroup(
      "GROUP", groupName, consumerName,
      "COUNT", 500,
      "STREAMS", streamKey, "0"
    );

    if (pending) {
      for (const [stream, entries] of pending as [string, [string, string[]][]][]) {
        await deliverMessagesToSocket(ws, userMobileNo, entries);
      }
    }

    // 2) Fresh (offline backlog, never delivered)
    const fresh = await redis.xreadgroup(
      "GROUP", groupName, consumerName,
      "COUNT", 500,
      "STREAMS", streamKey, ">"
    );

    if (fresh) {
      for (const [stream, entries] of fresh as [string, [string, string[]][]][]) {
        await deliverMessagesToSocket(ws, userMobileNo, entries);
      }
    }

    logger.info({ userMobileNo }, "Offline delivery complete");
  } catch (error) {
    logger.error({ error, userMobileNo }, "Error delivering offline messages");
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

   await deliverOfflineMessages(ws, user.mobileNo, serverId)

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
          handleAck(ws, recievedMessage, userToWs, user.id)
          break;
          
        default:
          logger.info("you have sent an invalid choice.")
          break;
      }


    })

    ws.on("close", async (code, reason) => {
      console.log("❌ WS closed:", code, reason.toString());

      // 1. Global presence cleanup
      await terminateUserFromRedis(user.mobileNo)

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
      for (const ws of wss.clients) {
        if (!activeConnection.get(ws)) {
          const userMobileNo = wsToUser.get(ws);
          logger.info("dropping connection due to inactivity");
          ws.terminate();

          if (userMobileNo) {
            userToWs.delete(userMobileNo);
            wsToUser.delete(ws);
            await terminateUserFromRedis(userMobileNo)
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


subscriber.on("message", (channel, message) => {
  logger.info({ channel, raw: message }, "Handling subs message");

  try {
    const validatedMessage = parseSubsEnvelope(message);

    if (!validatedMessage) {
      logger.warn({ message }, "Invalid message format received");
      return;
    }

    switch (validatedMessage.type) {
      case "chat":
        sendSubsMessage(validatedMessage);
        break;

      case "ack":
        sendSubsAck(validatedMessage)
        break;

      default:
        logger.warn({ validatedMessage }, "Unknown payload type received");
        break;
    }
  } catch (err) {
    logger.error({ err, channel, message }, "Error while routing subs message");
  }
});

function getUserWs(userId: string): WebSocket | null {
  const ws = userToWs.get(userId);
  return ws && ws.readyState === WebSocket.OPEN ? ws : null;
}

function sendSubsMessage(payload: ChatMessage) {
  const ws = getUserWs(payload.to);

  if (!ws) {
    logger.info({ to: payload.to }, "No stable connection to send message");
    return;
  }

  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    logger.error({ err, payload }, "Failed to send chat message");
  }
}

function sendSubsAck(payload:ChatAck){
  const ws = getUserWs(payload.to)
  if(!ws){
    logger.info({to:payload.to}, "has no stable socket connection to send messsages")
    return;
  }
  try {
     ws.send(JSON.stringify(payload))
  } catch (error) {
    logger.error({error}, "error while sending chat ack message at subs")
  
  }
}

async function terminateUserFromRedis(userMobileNo:string){
  try {

    await redis.del(`user:${userMobileNo}`)
    await redis.set(`lastActive:${userMobileNo}`, Date.now().toString())
    
  } catch (error) {

    logger.error({error}, "error happened while terminating user");
    
  }
}

function parseFields(rawFields: string[]) {
  const obj: Record<string, string> = {};
  for (let i = 0; i < rawFields.length; i += 2) {
    obj[rawFields[i]] = rawFields[i + 1];
  }
  return obj;
}

async function deliverMessagesToSocket(
  ws: WebSocket,
  userMobileNo: string,
  entries: [string, string[]][]
) {
  for (const [id, rawFields] of entries) {
    const msg = parseFields(rawFields);
    msg.streamId = id;

    // 🔑 Filter: only deliver messages intended for this user
    if (msg.to !== userMobileNo) {
      logger.warn(
        { userMobileNo, to: msg.to },
        "Skipping message not meant for this user"
      );
      continue;
    }

    logger.info({ msg }, "Delivering message…");

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "chat",
          ...msg,
          mode: "offline", // override to indicate backlog delivery
          timestamp: msg.timestamp ? parseInt(msg.timestamp) : Date.now(),
        })
      );
    } else {
      logger.warn({ userMobileNo }, "WebSocket closed mid-delivery");
      return;
    }
  }
}