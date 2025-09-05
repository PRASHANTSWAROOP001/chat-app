import { z } from "zod";

/**
 * Client → Server: Chat message
 */
export const ChatMessageSchema = z.object({
  type: z.literal("chat"),
  to: z.string(),
  from: z.string(),
  messageId: z.string(),
  message: z.string(),
  mode: z.enum(["offline", "online"]),
  timestamp: z.number(),
  streamId: z.string().optional(), // should be string, not object
});

/**
 * Client → Server: Acknowledgement
 */
export const ChatAckSchema = z.object({
  type: z.literal("ack"),
  to: z.string(),
  from: z.string(),
  messageId: z.string(),
  timestamp: z.number(),
  streamId: z.string().optional(),
  ackType: z.enum(["read", "delivered"]),
});

/**
 * Server → Client: System info
 * Example: "you are connected", "server restarting", etc.
 */
export const SystemInfoSchema = z.object({
  type: z.literal("system"),
  message: z.string(),
});

/**
 * Server → Client: Error info
 * Covers internal / external components.
 */
export const SystemErrorSchema = z.object({
  type: z.literal("error"),
  component:z.string(),
  message: z.string(),
});

/**
 * Envelope: every message in/out must be one of these.
 */
export const EnvelopeSchema = z.union([
  ChatMessageSchema,
  ChatAckSchema,
  SystemInfoSchema,
  SystemErrorSchema,
]);

// ------------ Types ------------
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatAck = z.infer<typeof ChatAckSchema>;
export type SystemInfo = z.infer<typeof SystemInfoSchema>;
export type SystemError = z.infer<typeof SystemErrorSchema>;
export type Envelope = z.infer<typeof EnvelopeSchema>;
