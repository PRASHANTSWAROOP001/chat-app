import WebSocket from "ws";
import { ChatMessage } from "../../types/messageValidation";
import { prismaClient, redis } from "../../utils/db/db";
import logger from "../../utils/logger/pinoLogger";
import { sendSystemErrorMessage, sendSystemInfoMessage } from "../socketutils/messagehelper";

const serverId = process.env.SERVER_ID!


type UserStatus = 
 | {status:"not_exists"}
 | {status:"blocked"}
 | {status:"offline"}
 | {status:"online"; server:string}
 | {status:"error"}


export async function handleChatMessages(ws:WebSocket,sentPayload:ChatMessage, routingMap:Map<string,WebSocket>, userId:string){
   try {
    const userDetails = await userStatus(sentPayload.to, userId)
    
    switch(userDetails.status){
        case "not_exists":
            sendSystemErrorMessage(ws,"user does not exists", "we cant send messages to non existant user! Invite them.")
            break;
        case "blocked":
            sendSystemInfoMessage(ws, "dear user you have been blocked cant send messages!")
            break;
        case "offline":
            const offlinestreamid = await storeMessagesInStream(sentPayload,"offline")

            if(offlinestreamid== null){
                logger.info("error could not be saved to redis stream")
                break;
            }
            else{
                logger.info("message saved successfully in redis.")
            }
            break;

        case "online":
            const streamid = await storeMessagesInStream(sentPayload,"online")

            if(streamid == null){
                logger.info("error could not be saved to redis stream")
                break;
            }
            const recipientServer = userDetails.server 

            const updatedPayload:ChatMessage = {
                    ...sentPayload,
                    streamId:streamid
            }

            if(recipientServer == serverId){
                const recipientWsInstance = routingMap.get(sentPayload.to)
             
                if(recipientWsInstance && recipientWsInstance.readyState === WebSocket.OPEN){
                    recipientWsInstance.send(JSON.stringify(updatedPayload))
                    logger.info("message sent to the other user")
                }
                else{
                    logger.info("users socket connection is not open/found")
                }
                break;
            }

            const publishMessageStatus = await publishMessage(recipientServer, updatedPayload)

            if(publishMessageStatus){
                sendSystemInfoMessage(ws, "message sent published successfully")
            }
            else{
                sendSystemErrorMessage(ws, "redis publish message", "error while publishing message using redis")
                
            }
            break;

        case "error":
            sendSystemErrorMessage(ws, "user available status", "error while checking user status")
            break;
    }
    
   } catch (error) {
    logger.error("error happened while")
    console.error(error)
    sendSystemErrorMessage(ws, "error at the message handler router level", "error while routing delivering messages")
   }
}

async function userStatus(to:string, userId:string):Promise<UserStatus> {
    try {
        const isBlocked = await redis.sismember(`blockedUser:${to}`, userId);
        if(isBlocked === 1) return { status: "blocked" };

        const onlineStatus = await redis.get(`user:${to}`);
        if(onlineStatus) {
            try {
                const userStatusObj = JSON.parse(onlineStatus) as { name: string, server: string, id: string };
                if(userStatusObj?.server) {
                    return { status: "online", server: userStatusObj.server };
                }
            } catch (err) {
                logger.warn(`Invalid onlineStatus JSON for user ${to}: ${err}`);
            }
        }

        const doesExist = await prismaClient.user.findUnique({
            where: { mobileNo: to }
        });

        if(!doesExist) return { status: "not_exists" };

        // User exists but not online and not blocked
        return { status: "offline" };
    } catch (error) {
        logger.error("Error happened while handling userStatus");
        console.error(error)
        return { status: "error" };
    }
}

async function publishMessage(server:string, sentPayload:ChatMessage):Promise<boolean>{
    try {
        await redis.publish(`message:${server}`, JSON.stringify(sentPayload))
        return true
    } catch (error) {
        logger.error("error happened while publishing messages")
        console.error(error)
        return false
    }
}

async function storeOfflineMessages(sentPayload:ChatMessage){
    logger.info("storing the offline message")
    try {

           await redis.xadd(
            `offlineMessage:${sentPayload.to}`, // stream key per user
            "*",     // auto-generated ID
            "to", sentPayload.to,                               
            "from", sentPayload.from,
            "messageId", sentPayload.messageId,
            "message", sentPayload.message,
            "mode", "offline",
            "timestamp", sentPayload.timestamp.toString(), // Redis stores strings
            "streamId", sentPayload.streamId || ""          // optional field
        );
        
    } catch (error) {
        logger.error("error happened while  storing the messages in redis")
        console.error(error)
    }
}

async function storeMessagesInStream(sentPayload:ChatMessage, mode:"offline"|"online"):Promise<string|null>{
    logger.info("trying to add data in stream")
    try {

        const streamKey = "chat.messages"

        const streamId = await redis.xadd(streamKey,
             "*",
             "to",sentPayload.to,
             "from", sentPayload.from,
             "messageId", sentPayload.messageId,
             "mode",mode,
             "message", sentPayload.message,
             "timestamp", sentPayload.timestamp
            )

        if(streamId == null){
            return null
        }

        return streamId;

        
    } catch (error) {
        logger.error({error},"error while adding data into stream")
        return null
    }
    
}