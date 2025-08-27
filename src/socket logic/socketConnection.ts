import { wss } from "../server";




// const secretKey = process.env.JWT_SECRET

// if(!secretKey){
//     console.warn("secret key is missing")
//     process.exit(1)

// }


// wss.on("connection", async (ws, req:IncomingMessage) => {
//   console.log("user initiated the connection");

//   const user = (req as any).user;  // ✅ cast to any
//   if (!user) {
//     console.error("Authenticated WebSocket connection without user info. Closing.");
//     ws.close();
//     return;
//   }
//   (ws as any).user = user;

// //   try {
// //     const userConnectionInfo = JSON.stringify({
// //       serverId: process.env.SERVER_ID || "server-1",
// //       name: user.name,
// //       id: user.id,
// //     });

// //     await redis.set(`user:${user.id}`, userConnectionInfo);

// //     ws.send(
// //       JSON.stringify({
// //         type: "system",
// //         message: `Now you can send one-to-one messages as ${user.name}`,
// //       })
// //     );
// //   } catch (error) {
// //     console.error("Redis operation failed:", error);
// //     ws.close();
// //     return;
// //   }

// //   ws.on("message", async (message) => {
// //     let parsedMessage;
// //     try {
// //       parsedMessage = JSON.parse(message.toString());
// //     } catch (error) {
// //       ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
// //       return;
// //     }

// //     const { content, recipientId } = parsedMessage;

// //     if (!recipientId || !content) { // ✅ fixed logic
// //       ws.send(
// //         JSON.stringify({
// //           type: "error",
// //           message: "Message must have both content and recipientId",
// //         })
// //       );
// //       return;
// //     }

// //     try {
// //       const recipientInfoString = await redis.get(`user:${recipientId}`);
// //       if (!recipientInfoString) {
// //         ws.send(
// //           JSON.stringify({ type: "error", message: `User ${recipientId} is offline.` })
// //         );
// //         return;
// //       }

// //       wss.clients.forEach((client) => {
// //         const ClientUser = (client as any).user;
// //         if (ClientUser && ClientUser.id === recipientId && client.readyState === WebSocket.OPEN) {
// //           const messagePayload = JSON.stringify({
// //             type: "chat",
// //             sender: user.name,
// //             id: user.id,
// //             message: content,
// //           });
// //           client.send(messagePayload);

// //           ws.send(JSON.stringify({ type: "chat", sender: "You", message: content }));
// //         }
// //       });
// //     } catch (error) {
// //       console.error("Message sending error:", error);
// //       ws.send(JSON.stringify({ type: "error", message: "Could not send message." }));
// //     }
// //   });

// //   ws.on("close", async () => {
// //     await redis.del(`user:${user.id}`);
// //   });

// //   ws.on("error", (error) => {
// //     console.error("error while connection", error);
// //   });
// });
