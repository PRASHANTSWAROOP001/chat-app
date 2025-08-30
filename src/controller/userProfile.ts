import { Request, Response } from "express";
import logger from "../utils/logger/pinoLogger";
import {prismaClient} from "../utils/db/db";
import {redis} from "../utils/db/db";


// const checkLastSeen = async (req:Request, res:Response)=>{
//     logger.info("check last seen endpoint hit")
//     const userMobileNo = req.query.mobileNo;
//     if(!userMobileNo){
//         res.status(401).json({
//             success:false,
//             message:"missing query param"
//         })
//         return;
//     }

//     try {

//         const user = req.user

//         if(!user){
//             logger.warn("user is not verified to check others profile")
//             res.status(403).json({
//                 success:false,
//                 message:"user not authorised"
//             })
//             return;
//         }

//         const checkUserAvailability = await prismaClient.user.findFirst({
//             where:{
//                 mobileNo:userMobileNo.toString()
//             }
//         })

//         if(!checkUserAvailability){
//             logger.warn("searched user does not exists!")
//             res.status(404).json({
//                 success:false,
//                 message:"user does not exists."
//             })
//             return;
//         }


//         const checkBlocked = await redis.sismember(`blockedUser:${userMobileNo}`,user.id.toString())

//         if(checkBlocked == 1){
//             logger.warn("blocked user tried to access user profile")
//             res.status(403).json({
//                 success:false,
//                 message:"You have been blocked cant access the profile details."
//             })
//             return;
//         }

//         const checkUserOnline = await redis.get(`user:${userMobileNo}`)

//         if(!checkUserOnline){
//             const findLastSeen = await redis.get(`lastSeen:${}`)
//         }

//     } catch (error) {
        
//     }
// }  
