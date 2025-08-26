import { wss } from "../server";
import { redis } from "../utils/db/db";

const secretKey = process.env.JWT_SECRET

if(!secretKey){
    console.warn("secret key is missing")
    process.exit(1)

}


wss.on("connection", (ws, req)=>{
    console.log("user initiated the connection")

    const user = req.user

    if (!user) {
        console.error("Authenticated WebSocket connection without user info. Closing.");
        ws.close();
        return;
    }

    // todo implement the one one message delivery

})