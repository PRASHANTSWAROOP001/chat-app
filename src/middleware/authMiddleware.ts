import { Request, NextFunction, Response} from "express";
import jwt from "jsonwebtoken"
import { DecodedUserPayload } from "../types/http";
const jwtsecret = process.env.JWT_SECRET;



if (!jwtsecret) {
  console.warn("missing the jwtsecret");
  process.exit(1);
}


export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, jwtsecret!) as DecodedUserPayload;
    req.user = decoded; // attach payload (e.g., { id, name })
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: "Invalid or expired token" });
  }
}