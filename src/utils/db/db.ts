import { PrismaClient } from "@prisma/client";
import Redis from "ioredis"

export const prismaClient = new PrismaClient();
// redis connection to be used as publisher and normal event
export const redis = new Redis(6380)

// redis connection to be used as subscriber and handle the subcribe methods only.
export const subscriber = new Redis(6380)