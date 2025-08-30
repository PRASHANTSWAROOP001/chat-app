import { PingMessage } from "../../types/socketTypes";
import WebSocket from "ws";
import logger from "../../utils/logger/pinoLogger";
export default async function handlePing (ws:WebSocket, payload:PingMessage):Promise<void>{
    try {

        console.log("ping payload", payload)
        
    } catch (error) {
        logger.error(`error while handling the ping messages ${error}`)
        ws.send(JSON.stringify({
            type:"system",
            message:"error while handling the ping message"
        }))
    }
}