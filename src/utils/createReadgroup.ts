import { redis } from "./db/db";
import logger from "./logger/pinoLogger";

export async function createUserGroup(userMobileNo: string) {
  const streamKey = "chat.messages";
  const groupName = `cg:${userMobileNo}`;

  try {
    await redis.xgroup("CREATE", streamKey, groupName, "0", "MKSTREAM");
    logger.info(`Consumer group created for ${userMobileNo}`);
  } catch (error: any) {
    if (error.message.includes("BUSYGROUP")) {
      logger.info(`Group already exists for ${userMobileNo}, skipping`);
    } else {
      logger.error({error}, "Failed to create consumer group");
      throw error;
    }
  }
}
