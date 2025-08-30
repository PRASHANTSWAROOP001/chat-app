import { PongMessage } from "../../types/socketTypes";
import WebSocket from "ws";
import logger from "../../utils/logger/pinoLogger";
export default async function handlePong (ws:WebSocket, payload:PongMessage):Promise<void>{
    try {

        console.log("pong payload", payload)
        
    } catch (error) {
        logger.error(`error while handling the pong messages ${error}`)
        ws.send(JSON.stringify({
            type:"system",
            message:"error while handling the pong message"
        }))
    }
}