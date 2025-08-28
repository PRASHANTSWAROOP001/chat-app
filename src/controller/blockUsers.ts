import { Request, Response } from "express";
import { redis } from "../utils/db/db";
import {prismaClient} from "../utils/db/db"
import { blockingUserPayload } from "../utils/zod/ZodSchema";


export const blockUser = async (req:Request, res:Response)=>{
    try {
        
        const userPayload= req.body;

        const user = req.user

        if(!user){
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
            res.status(404).json({
                success:false,
                message:"user does not exist to be blocked. Invite them to block!"
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

        console.error("error happend while blocking a user", error)
        res.status(500).json({
            success:false,
            message:"Internal server error!"
        })
        
    }
}


