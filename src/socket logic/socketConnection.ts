// socket logic/registerHandlers.ts
import type WebSocket from "ws";
import jwt from "jsonwebtoken";
import url from "url";
import { redis } from "../utils/db/db";
import { DecodedUserPayload } from "../types/http";

const secret = process.env.JWT_SECRET!;

export default function registerSocketHandlers(wss: WebSocket.Server) {
  wss.on("connection", async (ws, req) => {
    console.log("connection event fired");

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

      const userInfo = JSON.stringify({
        server: process.env.SERVER_ID || "server-1",
        name: decoded.name,
      });

      await redis.set(`user:${decoded.id}`, userInfo);

      ws.send(JSON.stringify({
        type: "system",
        message: `Now you can send one-to-one messages as ${decoded.name}`,
      }));
    } catch (err) {
      console.error("❌ JWT verification failed:", err);
      ws.close();
    }

    ws.on("close", async () => {
      if ((ws as any).user?.id) {
        await redis.del(`user:${(ws as any).user.id}`);
        console.log("user disconnected");
      }
    });
  });
}
