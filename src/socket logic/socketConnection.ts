// socket logic/registerHandlers.ts
import WebSocket from "ws";
import jwt from "jsonwebtoken";
import url from "url";
import { redis } from "../utils/db/db";
import { DecodedUserPayload } from "../types/http";
import { subscriber } from "../utils/db/db";
const secret = process.env.JWT_SECRET!;
const serverId = process.env.SERVER_ID!


subscriber.subscribe(`message:${serverId}`, (err, count)=>{
    if (err) {
    console.error('Failed to subscribe:', err);
  } else {
    console.log(`Successfully subscribed to ${count} channel(s)`);
  }
})



subscriber.on("message", (channel, message)=>{
  console.log("message recieved on channel", channel)
  try {

    const data:{to:string, content:string} = JSON.parse(message)

    const ws = connectedClient.get(data.to)

    if(ws && ws.readyState == WebSocket.OPEN){
      ws.send(JSON.stringify({
        type:"message",
        content:data.content
      }))
    }

    
  } catch (error) {

    console.error("error happened while handling redis message", error)
    
  }  
})



interface PublisMessageFormat{
  to:string,
  content:string,
  server:string
}

interface MessageFormat{
  to:string,
  content:string,
}




async function checkUserAvailability(recipientId:string):Promise<string>{
  try {

    const userStatus = await redis.get(`user:${recipientId}`)

    if(!userStatus){
      return "offline";
    }

    const recipientJson:{
      server:string,
      name:string
    } = JSON.parse(userStatus)

    console.log(recipientJson)

    return recipientJson.server
    
  } catch (error) {
    console.error("Error while checking the recipientStatus", error)
    return "offline";
  }
}


async function PublishMessage(messageData:PublisMessageFormat):Promise<boolean>{
  try {

    await redis.publish(`message:${messageData.server}`, JSON.stringify({to:messageData.to, content:messageData.content}))
    
    return true
  } catch (error) {

    console.error("error while publishing the message",error)
    return false
  }
}


// global map data to store the clientId/mobile no and its connected instance to look quickly
const connectedClient = new Map<string, WebSocket>()

export default function registerSocketHandlers(wss: WebSocket.Server) {
  wss.on("connection", async (ws, req) => {
    console.log("connection event fired");
   // verify the connection
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

      connectedClient.set(decoded.id, ws)

      const userInfo = JSON.stringify({
        server: process.env.SERVER_ID || "server-1",
        name: decoded.name,
      });

      // add user to the redis database along with its server

      await redis.set(`user:${decoded.id}`, userInfo);

      ws.send(JSON.stringify({
        type: "system",
        message: `Now you can send one-to-one messages as ${decoded.name}`,
      }));
    } catch (err) {
      console.error("❌ JWT verification failed:", err);
      ws.close();
    }

  ws.on("message", async (message) => {
  let parsedData: MessageFormat;

  // Try to parse incoming data
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

  // ✅ Check if recipient is online
  const isAvailable = await checkUserAvailability(recipientId);

  if (isAvailable == "offline") {
    ws.send(JSON.stringify({
      type: "system",
      message: `User ${recipientId} is not online.`,
    }));
    return;
  }

  // ✅ Publish the message
  const publishSuccess = await PublishMessage({
    to: recipientId,
    content: content,
    server:isAvailable
  });

  if (publishSuccess) {
    ws.send(JSON.stringify({
      type: "system",
      message: `Message delivered to ${recipientId}`,
    }));
  } else {
    ws.send(JSON.stringify({
      type: "system",
      message: `Failed to deliver message to ${recipientId}`,
    }));
  }
});

ws.on("error", (error)=>{
  console.log("error at the ws instance ", error)
})


// handles the closing makes user offline
    ws.on("close", async () => {
      if ((ws as any).user?.id) {
        connectedClient.delete((ws as any).user.id)
        await redis.del(`user:${(ws as any).user.id}`);
        console.log("user disconnected");
      }
    });
  });


}
