import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { getLastSeen } from "../controller/profile";
const router = Router()

router.get("/lastseen", authMiddleware, getLastSeen)


export default router;