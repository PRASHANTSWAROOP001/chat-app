import { Router} from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { blockUser } from "../controller/blockUsers";
const router = Router()

router.post("/block", authMiddleware, blockUser)


export default router