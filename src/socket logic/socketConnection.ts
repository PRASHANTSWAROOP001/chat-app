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




async function checkUserAvailability(recipientId: string): Promise<string> {
  try {

    const userStatus = await redis.get(`user:${recipientId}`)

    if (!userStatus) {
      //handles user not registered on platform
      const searchUser = await prismaClient.user.findFirst({
        where: {
          mobileNo: recipientId
        }
      })

      if (!searchUser) {
        console.log("not exists")
        return "not exists"
      } else {
        console.log("offline")
        return "offline"
      }

    }

    const recipientJson: {
      server: string,
      name: string
      id: string
    } = JSON.parse(userStatus)

    console.log(recipientJson)

    return recipientJson.server

  } catch (error) {
    console.error("Error while checking the recipientStatus", error)
    return "offline";
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


async function ValidateWebSocketConnection(ws:WebSocket, req:IncomingMessage){
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


function extractValidateMessage(ws:WebSocket, message:WebSocket.RawData):MessageFormat|undefined{
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
    
    ValidateWebSocketConnection(ws, req);
  
    ws.on("message", async (message) => {
      
      const userData = extractValidateMessage(ws, message)

      if(!userData){
        console.log("invalid data handled");
        return;
      }

      const isAvailable = await checkUserAvailability(userData.to);

      if (isAvailable == "offline") {
        ws.send(JSON.stringify({
          type: "system",
          message: `User ${userData.to} is not online.`,
        }));
        return;
      }
      else if (isAvailable == "not exists") {
        ws.send(JSON.stringify({
          type: "system",
          message: `User ${userData.to} does not exists. Invite them to signup.`,
        }))
        return;
      }

      // ✅ Publish the message
      const publishSuccess = await PublishMessage({
        to: userData.to,
        content: userData.content,
        server: isAvailable
      });

      if (publishSuccess) {
        ws.send(JSON.stringify({
          type: "system",
          message: `Message delivered to ${userData.to}`,
        }));
      } else {
        ws.send(JSON.stringify({
          type: "system",
          message: `Failed to deliver message to ${userData.to}`,
        }));
      }
    });

    ws.on("error", (error) => {
      console.log("error at the ws instance ", error)
    })


    // handles the closing makes user offline
    ws.on("close", async () => {
      if ((ws as any).user?.id) {
        connectedClient.delete((ws as any).user.mobileNo)
        await redis.del(`user:${(ws as any).user.mobileNo}`);
        console.log("user disconnected");
      }
    });
  });


}
