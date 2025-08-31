import { ChatMessage } from "../../types/socketTypes";
import logger from "../../utils/logger/pinoLogger";
import WebSocket from "ws";
import { UserAvailability } from "../../types/socketTypes";
import { redis } from "../../utils/db/db";
import {prismaClient} from "../../utils/db/db"


export async function handleChat(ws:WebSocket, payload:ChatMessage):Promise<void>{
    try {

        console.log("payload", payload)

        const userStatus = await checkUserAvailability(payload.to, payload.from)

        switch(userStatus.status){
            case "not_exists":
                logger.warn("user tried to send the message to non-existant user")
                ws.send(JSON.stringify({
                    type:"system",
                    message:"Dear user intended recipient does not exists! Invite them"
                }))
                break;
            case "blocked":
                logger.warn("user tried to send the message to a user who blocked!")
                ws.send(JSON.stringify({
                type:"system",
                message:"Dear user you are blocked! Cant Send Message To This Recipient"
                }))
                break;
            case "offline":
                logger.warn("user tried to send the message to offline recipeint")
                await handleOfflineMessage(payload)
                ws.send(JSON.stringify({
                    type:'system',
                    message:"Stay tuned for offline delivery"
                }))
                break;
            case "online":
                const deliverStatus = await PublishMessage(payload, userStatus.server)
                if(deliverStatus == true){
                    ws.send(JSON.stringify({
                        type:"chat.ack",
                        message:"message sent to the user",
                        messageId:payload.messageId,
                        status:"sent"
                    }))
                }
                else{
                    ws.send(JSON.stringify({
                        type:"chat.ack",
                        message:"message could not be sent some error",
                        messageId:payload.messageId,
                        status:"error"
                    }))
                }

        }


        
    } catch (error) {

        logger.error(`error happend while handling the chat ${error}`)

        ws.send(JSON.stringify({
            type:"system",
            message:"error happened while handling the chat routing/delivery"
        }))
        
    }

}

async function checkUserAvailability(recipientId: string, senderId: string): Promise<UserAvailability> {
  try {

    const isBlocked = await redis.sismember(`blockedUser:${recipientId}`, senderId)

    if (isBlocked == 1) {
      return { status: "blocked" }
    }

    const userStatus = await redis.get(`user:${recipientId}`)

    if (userStatus) {
      const recipientJson = JSON.parse(userStatus) as {
        server: string,
        id: string,
        name: string
      }
      return { status: "online", ...recipientJson }
    }

    const recipient = await prismaClient.user.findUnique({
      where: {
        mobileNo: recipientId,
      }
    })

    if (!recipient) {
      return { status: "not_exists" }
    }

    return { status: "offline" }


  } catch (error) {
    console.error("Error while checking the recipientStatus", error)
    return { status: "offline" }
  }
}

async function handleOfflineMessage(message:ChatMessage):Promise<void>{
    logger.info("handling offline messages")
  try {
   
    await redis.xadd(`stream:message:${message.to}`, 
      "*",
     "payload", JSON.stringify(message)
    )

  
} catch (error) {

  console.error("error while handling offline stream", error)

  
}
}

async function PublishMessage(message:ChatMessage, serverId:string):Promise<boolean>{
    try {

        logger.info("trying to send the publish the message");

        await redis.publish(`message:${serverId}`, JSON.stringify(message))

        return true
        
    } catch (error) {

        logger.error(`error happened while sending ${error}`)
        return false
        
    }

}



