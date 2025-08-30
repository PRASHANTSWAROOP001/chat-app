
import WebSocket from "ws"
import {IncomingMessage} from 'http'
import { DecodedUserPayload } from "../../types/http";
import jwt from "jsonwebtoken"
import url from "url"
const secret = process.env.JWT_SECRET!;
import { redis } from "../../utils/db/db";

export default async function ValidateWebSocketConnection(ws: WebSocket, req: IncomingMessage, connectedClient:Map<string, WebSocket>) {
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