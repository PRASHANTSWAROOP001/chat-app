import WebSocket from "ws";
import { ChatAck } from "../../types/messageValidation";
import { prismaClient, redis } from "../../utils/db/db";
import logger from "../../utils/logger/pinoLogger";
import {
    sendSystemErrorMessage,
    sendSystemInfoMessage,
} from "../socketutils/messagehelper";

const serverId = process.env.SERVER_ID!;

type UserStatus =
    | { status: "not_exists" }
    | { status: "blocked" }
    | { status: "offline" }
    | { status: "online"; server: string }
    | { status: "error" };

export async function handleAck(
    ws: WebSocket,
    sentAck: ChatAck,
    routingMap: Map<string, WebSocket>,
    userId: string
) {
    try {
        logger.info({sentAck},"user sent payload!")
        const userDetails = await userStatus(sentAck.to, userId);

        await ackMessage(sentAck, sentAck.from);

        switch (userDetails.status) {
            case "not_exists":
                sendSystemErrorMessage(
                    ws,
                    "not_exists",
                    "user does not exists to deliver ack messages"
                );
                break;
            case "blocked":
                sendSystemInfoMessage(ws, "you are blocked cant send ack messages");
                break;
            case "offline":
                logger.debug(
                    "recieved a chat ack the recipient is offline currently not handling it"
                );
                break;
            case "online":
                const recipientServer = userDetails.server;

                if (recipientServer == serverId) {
                    const recipientWsInstance = routingMap.get(sentAck.to);
                    if (
                        recipientWsInstance &&
                        recipientWsInstance.readyState == WebSocket.OPEN
                    ) {
                        recipientWsInstance.send(JSON.stringify(sentAck));
                        logger.info("chat ack delivered to the user");
                        break;
                    } else {
                        logger.warn(
                            "error web socket connection is not open to send messages/publishing ack."
                        );
                    }
                    
                }

                const ackStatus = await publishAck(recipientServer, sentAck);

                if (ackStatus) {
                    logger.info("chat ack published successfully");
                } else {
                    logger.info("chat ack could not be published error");
                }
                break;
            case "error":
                sendSystemErrorMessage(
                    ws,
                    "error while checking user status chat ack",
                    "error at user status"
                );
                break;
        }
    } catch (error) {
        logger.error({ error }, "error happened while handling chat ack routing");
    }
}

async function userStatus(to: string, userId: string): Promise<UserStatus> {
    try {
        const isBlocked = await redis.sismember(`blockedUser:${to}`, userId);
        if (isBlocked === 1) return { status: "blocked" };

        const onlineStatus = await redis.get(`user:${to}`);
        if (onlineStatus) {
            try {
                const userStatusObj = JSON.parse(onlineStatus) as {
                    name: string;
                    server: string;
                    id: string;
                };
                if (userStatusObj?.server) {
                    return { status: "online", server: userStatusObj.server };
                }
            } catch (err) {
                logger.warn(`Invalid onlineStatus JSON for user ${to}: ${err}`);
            }
        }

        const doesExist = await prismaClient.user.findUnique({
            where: { mobileNo: to },
        });

        if (!doesExist) return { status: "not_exists" };

        // User exists but not online and not blocked
        return { status: "offline" };
    } catch (error) {
        logger.error("Error happened while handling userStatus");
        console.error(error);
        return { status: "error" };
    }
}

export async function ackMessage(ack: ChatAck, userMobileNo: string) {
  try {
    if (!ack.streamId) return;

    const streamKey = "chat.messages";
    const groupName = `cg:${userMobileNo}`;

    // Mark message as processed for this user
    await redis.xack(streamKey, groupName, ack.streamId);

    // Optional: also remove the entry entirely from the stream
    await redis.xdel(streamKey, ack.streamId);

    logger.info(`Acked & deleted message ${ack.streamId} for ${userMobileNo}`);
  } catch (error) {
    logger.error({ error }, "Error while acking/deleting redis stream");
  }
}

async function publishAck(server: string, sentAck: ChatAck): Promise<boolean> {
    try {
        await redis.publish(`message:${server}`, JSON.stringify(sentAck));
        return true;
    } catch (error) {
        logger.error({ error }, "error happened while publishing messages");
        return false;
    }
}
