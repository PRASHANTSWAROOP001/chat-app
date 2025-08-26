import {Router} from "express"
import { loginUser,userRegitration } from "../controller/userController"

const router = Router()

router.post("/signin",userRegitration)
router.post("/login", loginUser)


export default router;