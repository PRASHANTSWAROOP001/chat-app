import WebSocket from "ws";
import { redis } from "../../utils/db/db";
import { ChatMessage } from "../../types/socketTypes";

export async function handleOfflineMessages(ws: WebSocket, userMobileNo: string) {
    try {
        const stream = `stream:message:${userMobileNo}`;

        // Fetch all messages for this user
        const messages = await redis.xrange(stream, "-", "+");

        for (const [id, fields] of messages) {
            const parsed = parseStreamFields(fields);

            const msg = parsed.payload as ChatMessage;

            ws.send(
                JSON.stringify({
                    ...msg,         // the actual chat.message
                    streamId: id,   // attach streamId so the client can ack & delete
                })
            );
        }


    } catch (error) {
        console.error("Error fetching offline messages:", error);
    }
}

function parseStreamFields(fields: string[]): Record<string, any> {
    const obj: Record<string, any> = {};
    for (let i = 0; i < fields.length; i += 2) {
        const key = fields[i];
        const value = fields[i + 1];
        obj[key] = key === "payload" ? JSON.parse(value) : value;
    }
    return obj;
}

