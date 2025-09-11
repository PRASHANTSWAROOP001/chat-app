import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

export const prismaClient = new PrismaClient();

const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT) || 6379;

// redis connection to be used as publisher and normal event
export const redis = new Redis({
  host: redisHost,
  port: redisPort,
});

// redis connection to be used as subscriber and handle the subscribe methods only.
export const subscriber = new Redis({
  host: redisHost,
  port: redisPort,
});
