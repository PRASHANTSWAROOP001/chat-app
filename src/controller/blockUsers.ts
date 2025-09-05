import { Request, Response } from "express";
import { redis } from "../utils/db/db";
import {prismaClient} from "../utils/db/db"
import { blockingUserPayload } from "../utils/zod/ZodSchema";
import logger from "../utils/logger/pinoLogger";



export const blockUser = async (req:Request, res:Response)=>{
    logger.info("block user endpoint hit")
    try {
        
        const userPayload= req.body;

        const user = req.user

        if(!user){
            logger.warn("unverified user tried to block a user")
            res.json({
                message:"user not verified"
            })
            return
        }

        const parsedData = blockingUserPayload.safeParse(userPayload)

        if(!parsedData.success){
            res.status(401).json({
                message:"invalid data format",
                error:`error: ${parsedData.error.issues}`
            })
            return;
        }

        const searchBlockedId = await prismaClient.user.findFirst({
            where:{
                mobileNo:parsedData.data.blockedUserMobileNo
            }
        })

        if(!searchBlockedId){
            logger.info("user tried to block non existant user")
            res.status(404).json({
                success:false,
                message:"user does not exists to be blocked. Invite them to block!"
            })
            return
        }



         await prismaClient.blockedUsers.create({
            data:{
                blockedId:searchBlockedId.id,
                blockerId:parseInt(user.id)
            }
        })
                        // blockPerson mobileNo -> blockedPersonId
        await redis.sadd(`blockedUser:${user.mobileNo}`, searchBlockedId.id.toString())


        res.json({
            success:true,
            message:`You have successfully blocked mobNO: ${searchBlockedId.mobileNo} with id: ${searchBlockedId.id}`
        })


    } catch (error) {

        // console.error("error happend while blocking a user", error)
        logger.error(`error happend while blocking a user ${error}`)
        res.status(500).json({
            success:false,
            message:"Internal server error!"
        })
        
    }
}

export const unblock = async(req:Request, res:Response)=>{
    try {

        const user = req.user

        if(!user){
            logger.warn("unverified user tried to unblock a user")
            res.status(401).json({
                message:"user not verified"
            })
            return
        }



        const {mobileNo}= req.query;
        logger.info(mobileNo)

        if(!mobileNo){
            
            logger.warn("user did not provided the params while deleting")
            res.status(401).json({
                success:false,
                message:"missing query"
            })
            return;
        }


        const blockedUserId = await prismaClient.user.findFirst({
            where:{
                mobileNo:mobileNo.toString()
            }
        })

        if(!blockedUserId){
            logger.warn("user tried to unblock non existing user")
            res.status(404).json({
                success:false,
                message:"user does not exists to be unblocked"
            })
            return;
        }

        const searchBlockedUser = await prismaClient.blockedUsers.findFirst({
            where:{
                blockerId:parseInt(user.id),
                blockedId:blockedUserId.id
            }
        })

        if(!searchBlockedUser){
            logger.warn("cant unblock user which you havent blocked")
            res.status(404).json({
                success:false,
                messgae:"data does not exists. User Blocked Data Does Not Exists"
            })
            return;
        }

        await prismaClient.blockedUsers.delete({
            where:{
                id:searchBlockedUser.id
            }
        })

        await redis.srem(`blockedUser:${user.mobileNo}`, searchBlockedUser.blockedId.toString())


        res.json({
            success:true,
            message:"you have successfully unblocked the user."
        })
    } catch (error) {
        logger.error(`error happened while unblocking the user ${error}`)
        res.status(500).json({
            success:false,
            message:"Internal server error"
        })
        
    }
}

// export const getAllDeletedUser = async(req:Request, res:Response)=>{

// }


