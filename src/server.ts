import e from "express";
import userRouter from "./routes/userRoute";
import helmet from "helmet";
import cors from "cors";
import http from "http";
import WebSocket from "ws";

import { redis } from "./utils/db/db";
import { DecodedUserPayload } from "./types/http";

import jwt from "jsonwebtoken";
import url from "url";

const secret = process.env.JWT_SECRET;

if (!secret) {
  console.warn("❌ Missing JWT_SECRET");
  process.exit(1);
}




const app = e();

const port = process.env.PORT || 5000;


const server = http.createServer(app);

// middlewares
app.use(e.json());
app.use(helmet());
app.use(cors());

// healthcheck
app.use("/health", (_req, res) => {
  res.json({ message: "hello world" });
});

// routes
app.use("/auth", userRouter);

server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

// ✅ WebSocket server without handleProtocols
export const wss = new WebSocket.Server({ server });


wss.on("connection", async (ws, req) => {
  
  const { query } = url.parse(req.url!, true);
  const token = query?.token as string | undefined;

  if (!token) {
    console.error("❌ No token provided");
    ws.close();
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as DecodedUserPayload;
    (req as any).user = decoded;
    (ws as any).user = decoded;
    console.log("✅ User connected:", decoded);

    const userInfo = JSON.stringify({
        server:process.env.SERVER_ID||"server-1",
        name:req.user?.name,
    })

    await redis.set(`user:${req.user?.id}`, userInfo)

        ws.send(
      JSON.stringify({
        type: "system",
        message: `Now you can send one-to-one messages as ${req.user}`,
      })
    );

  } catch (err) {
    console.error("❌ JWT verification failed:", err);
    ws.close();
  }


//   ws.on("message", (message)=>{
//     let parsedString;
//     try {


        
//     } catch (error) {
        
//     }
//   })




});


