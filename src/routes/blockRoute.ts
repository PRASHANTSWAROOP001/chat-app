import { Router} from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { blockUser,unblock} from "../controller/blockUsers";
const router = Router()

router.post("/block", authMiddleware, blockUser)
router.delete("/unblock", authMiddleware, unblock)

export default router