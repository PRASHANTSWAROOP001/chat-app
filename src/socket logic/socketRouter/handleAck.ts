import { AckMessage } from "../../types/socketTypes";
import WebSocket from "ws";
import logger from "../../utils/logger/pinoLogger";


export async function handleAck(ws:WebSocket, payload:AckMessage):Promise<void>{
    try {
        console.log("handleAck Payload", payload)
        
    } catch (error) {
        
        logger.error(`error while handling the ack ${error}`)
        ws.send(JSON.stringify({
            type:"system",
            message:"Error While handling Ack"
        }))
    }
}