import logger from "../../utils/logger/pinoLogger";
import {
  ChatMessageSchema,
  ChatAckSchema,
  SystemInfoSchema,
  SystemErrorSchema,
  EnvelopeSchema,
  type ChatMessage,
  type ChatAck,
  type SystemInfo,
  type SystemError,
  type Envelope,
} from "../../types/messageValidation"; // import what we wrote earlier
import { RawData, WebSocket } from "ws";

/**
 * Factory for client → server chat message
 */
export function createChatMessage(data: Omit<ChatMessage, "type">): ChatMessage {
  const msg: ChatMessage = { type: "chat", ...data };
  return ChatMessageSchema.parse(msg);
}

/**
 * Factory for client → server acknowledgement
 */
export function createChatAck(data: Omit<ChatAck, "type">): ChatAck {
  const msg: ChatAck = { type: "ack", ...data };
  return ChatAckSchema.parse(msg);
}

/**
 * Factory for server → client system info
 */
export function createSystemInfo(message: string): SystemInfo {
  const msg: SystemInfo = { type: "system", message };
  return SystemInfoSchema.parse(msg);
}

/**
 * Factory for server → client error
 */
export function createSystemError(component: string, message: string): SystemError {
  const msg: SystemError = { type: "error", component, message };
  return SystemErrorSchema.parse(msg);
}

export function sendSystemErrorMessage(ws: WebSocket, component: string, message: string) {
  const errorMessage = createSystemError(component, message);

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(errorMessage));
  } else {
    logger.warn(`Cannot send system error: socket not open. Component: ${component}, Message: ${message}`);
  }
}


export function sendSystemInfoMessage(ws:WebSocket, message:string){
const  sysmessage = createSystemInfo(message)

if(ws && ws.readyState === WebSocket.OPEN){
  ws.send(JSON.stringify(sysmessage))
}
else{
  logger.warn("cant not send messages socket is not open")
}

}

/**
 * General safe parse utility for inbound JSON
 * Keeps all entry points consistent
 */
export function parseEnvelope(raw: RawData): Envelope | null {
  try {
    const json = JSON.parse(raw.toString());
    logger.info("message before validation", json)
    return EnvelopeSchema.parse(json);
  } catch (err) {
    console.error("Invalid envelope:", err);
    return null;
  }
}
