import e from "express";
import userRouter from "./routes/userRoute";
import helmet from "helmet"
import cors from "cors"
import http from "http"
import WebSocket from "ws"
import jwt from "jsonwebtoken"
import { DecodedUserPayload } from "./types/http";
const app = e();


const port = process.env.PORT || 5000

const secret = process.env.JWT_SECRET

if(!secret){
    console.warn("missing keys")
    process.exit(1)
}

const server = http.createServer(app)

export const wss = new WebSocket.Server({server, handleProtocols:(protocols, request)=>{
    for (const protocol of protocols){
        if(protocol.startsWith("chat-auth-v1, ")){
            const token = protocol.substring("chat-auth-v1,".length).trim()
            if(token){
                try {
                    
                    const decoded = jwt.verify(token,secret) as DecodedUserPayload

                    request.user = decoded

                    return protocol;

                } catch (error) {
                        console.log('JWT verification failed during protocol handshake:', error);
                        // Returning false rejects the connection without establishing a WebSocket.
                        return false;
            }
            }

        }
    }

       console.log('WebSocket connection rejected: No valid "chat-auth-v1" protocol or token.');
    return false;
}})

app.use(e.json())
app.use(helmet())
app.use(cors())

app.use("/health", (req:e.Request, res:e.Response)=>{
    res.json({
        message:"hello world"
    })
})


app.use("/auth", userRouter)

app.listen(port, ()=>{
    console.log("app started listening on port 4000")
})


