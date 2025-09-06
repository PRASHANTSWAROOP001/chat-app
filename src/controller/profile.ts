import { Request, Response } from "express";
import { prismaClient, redis } from "../utils/db/db";
import logger from "../utils/logger/pinoLogger";



export async function getLastSeen(req:Request, res:Response){
    logger.info("last seen endpoint hit")
    try {

        const user = req.user

        if(!user){
            res.status(401).json({
                success:false,
                message:"Please login and send bearer token!"
            })
            return;
        }
        
        const {mobileNo} = req.query

        if(!mobileNo){
            res.status(401).json({
                success:false,
                message:"missing the mobileNo as query param"
            })
            return;
        }

        const userDetails = await prismaClient.user.findFirst({
            where:{
                mobileNo: mobileNo.toString()
            }
        })

        if(!userDetails){
            res.status(404).json({
                success:false,
                message:"user does not exists"
            })
            return;
        }


        const isBlocked = await redis.sismember(`blockedUser:${mobileNo.toString()}`, user.id)

        if(isBlocked == 1){

             res.json({
                success:true,
                data:{
                    username:userDetails.name,
                    mobileNo:userDetails.mobileNo
                }
            })

            return 
        }


        const isActive = await redis.get(`user:${mobileNo.toString()}`);
if (isActive) {
  return res.json({
    success: true,
    data: {
      username: userDetails.name,
      mobileNo: userDetails.mobileNo,
      lastSeen: "online"
    }
  });
}


        const userLastSeen = await redis.get(`lastActive:${mobileNo.toString()}`)

        if(!userLastSeen){
            res.json({
                success:true,
                data:{
                    username:userDetails.name,
                    mobileno:userDetails.mobileNo,
                    lastseen:"never"
                }
            })
            return;
        }

        const lastActiveDate = parseInt(userLastSeen,10)
        const lastActiveString = formatLastSeen(lastActiveDate)

        res.json({
            success:true,
            data:{
                username:userDetails.name,
                mobileNo:userDetails.mobileNo,
                lastSeen:lastActiveString
            }
        })

    } catch (error) {

        logger.error({error}, "error happened while viewing profile")

        res.status(500).json({
            success:false,
            message:"we have some error while getting user lastActive"
        })
        
    }
}


function formatLastSeen(lastActive: number): string {
  const diffMs = Date.now() - lastActive;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return "just now";
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`;
  } else if (diffDay < 7) {
    return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  } else {
    // Fallback: show the actual date
    return new Date(lastActive).toLocaleDateString();
  }
}
