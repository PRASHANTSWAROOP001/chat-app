import { AckMessage, UserAvailabilityAck } from "../../types/socketTypes";
import WebSocket from "ws";
import logger from "../../utils/logger/pinoLogger";
import { redis } from "../../utils/db/db";


export async function handleAck(ws:WebSocket, payload:AckMessage):Promise<void>{
    try {
        console.log("handleAck Payload", payload)

        const user = await checkSenderAvalibility(payload.to)
        switch(user.status){
            case "offline":
                console.log("we are not handling the offline ack for now it will be dropped.")
                break;
            case "online":
                logger.info("send the ack to the user!")
                ws.send("chat.ack published!")
                const sentStatus = await PublishAckMessage(user.server, payload)
                if(sentStatus){
                    logger.info("message published successfully")
                }
                else{
                    logger.error("due to some error some messages are not sent!")
                }
                break;
        }
    } catch (error) {
        
        logger.error(`error while handling the ack ${error}`)
        ws.send(JSON.stringify({
            type:"system",
            message:"Error While handling Ack"
        }))
    }
}

async function checkSenderAvalibility(senderMobileNo:string):Promise<UserAvailabilityAck>{

    // once the user recieves message they must send the acknowledgement! 
    // in this ack the sender and reciever would be flipped the (like sender becomes reciever for ack)
    // one more assumption we have we have not handled a edge case when a sender just deletes thier account mid conversation
    // so not exists is not handled  
    try {

        const status = await redis.get(`user:${senderMobileNo}`)

        if(!status){
            return {status:"offline"}
        }

        const recipeintJson = JSON.parse(status) as {
            name:string,
            server:string,
            id:string
        }
        
        return  {status:"online", ...recipeintJson}
        
    } catch (error) {
        logger.error("error happened while checking the user status in")
        console.error(error)
        return {status:"offline"}
    
    }

}

async function PublishAckMessage(serverId:string, payload:AckMessage):Promise<boolean>{

    try {

        await redis.publish(`message:${serverId}`,JSON.stringify(payload))

        return true;
        
    } catch (error) {
        console.error(error)
        logger.error("error happened while publishing ack message!")
        return false;
    }

}