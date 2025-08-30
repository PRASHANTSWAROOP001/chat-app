import { MessageTypes } from "../../types/socketTypes";
import WebSocket from "ws";

export default function extractValidateMessage(ws: WebSocket, message: WebSocket.RawData): MessageTypes | null {
  let parsedData: MessageTypes;

  try {
    parsedData = JSON.parse(message.toString());
  } catch (error) {
    console.error("Error parsing data:", error);
    ws.send(JSON.stringify({
      type: "system",
      message: "Invalid message format.",
    }));
    return null; // stop further execution
  }

  return parsedData
}