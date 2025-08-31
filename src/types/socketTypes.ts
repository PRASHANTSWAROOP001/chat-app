export type MessageTypes =
  // actual chat
  | {
      type: "chat.message";
      to: string;
      from: string;
      messageId: string;
      message: string;
      timestamp: number;
    }

  // ack/receipts
  | {
      type: "chat.ack";
      messageId: string;
      to:string;
      from:string;
      mode: "online"|"offline";
      streamId?:string;
      status: "delivered" | "read";
      timestamp: number;
    }

  // system heartbeats
  | { type: "system.ping" }
  | { type: "system.pong" }

  // presence
  | {
      type: "system.presence";
      userId: string;
      status: "online" | "offline" | "typing";
      lastSeen?: number;
    }

  // optional: error responses
  | {
      type: "system.error";
      code: number;
      message: string;
    };

// 👇 no duplication: just alias them
export type ChatMessage = Extract<MessageTypes, { type: "chat.message" }>;
export type AckMessage = Extract<MessageTypes, { type: "chat.ack" }>;
export type PingMessage = Extract<MessageTypes, { type: "system.ping" }>;
export type PongMessage = Extract<MessageTypes, { type: "system.pong" }>;
export type PresenceMessage = Extract<MessageTypes, { type: "system.presence" }>;
export type ErrorMessage = Extract<MessageTypes, { type: "system.error" }>;

export type UserAvailability =
  | { status: "not_exists" }
  | { status: "blocked" }
  | { status: "offline" }
  | { status: "online"; server: string; name: string; id: string }

export type UserAvailabilityAck =
 | {status:"offline"}
 | {status:"online"; server:string, name:string, id:string}


export type Message = MessageTypes;

