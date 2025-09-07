import { Request, Response } from "express";
import { userRegistrationSchema, loginSchema } from "../utils/zod/ZodSchema";
import { prismaClient } from "../utils/db/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import logger from "../utils/logger/pinoLogger";
import { createUserGroup } from "../utils/createReadgroup";

const jwtsecret = process.env.JWT_SECRET;

if (!jwtsecret) {
  console.warn("missing the jwtsecret");
  process.exit(1);
}

export const userRegitration = async (req: Request, res: Response) => {
  logger.info("signup endpoint hit.")
  try {
    const userData = req.body;
    const parsedData = userRegistrationSchema.safeParse(userData);
    if (!parsedData.success) {
      logger.warn("user payload does not match zodSchema")
      res.json({
        success: false,
        message: parsedData.error.issues,
      });
      return;
    }

    const searchMobileNo = await prismaClient.user.findFirst({
      where: {
        mobileNo: parsedData.data.mobileNo,
      },
    });

    if (searchMobileNo) {
      logger.warn("user has an existing account")
      res.status(401).json({
        success: false,
        message: "user already exists",
      });

      return;
    }

    const hashedPassword = await bcrypt.hash(parsedData.data.password, 10);

    const savedData = await prismaClient.user.create({
      data: {
        passwordHash: hashedPassword,
        mobileNo: parsedData.data.mobileNo,
        name: parsedData.data.name,
      },
    });

    await createUserGroup(parsedData.data.mobileNo)

    return res.json({
      success: true,
      message: "account created successfully",
      id: savedData.id,
    });
  } catch (error) {
    logger.error(`error happend while creating the user ${error}`)
    return res.status(500).json({
      success: false,
      message: "unexpected error happened",
    });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  logger.info("login endpoint hit")
  try {
    const body = req.body;

    const parsedData = loginSchema.safeParse(body);
    

    if (!parsedData.success) {
        logger.warn("user payload does not match zodSchema")
      res.status(400).json({
        success: false,
        message: parsedData.error.issues,
      });
      return;
    }

    const searchUser = await prismaClient.user.findFirst({
      where: {
        mobileNo: parsedData.data.mobileNo,
      },
    });

    if (!searchUser) {
      logger.info("user tried to login with non existant data")
      res.status(404).json({
        success: false,
        message: "No user exists",
      });
      return;
    }

    const validatePassword = await bcrypt.compare(
      parsedData.data.password,
      searchUser.passwordHash
    );

    if (!validatePassword) {
      logger.warn("user entered wrong password. Validation Failed")
      res.status(401).json({
        success: false,
        message: "Invalid password",
      });
      return;
    }

    const token = jwt.sign(
      {
        id: searchUser.id,
        mobileNo:searchUser.mobileNo,
        name: searchUser.name,
      },
      jwtsecret,
      {
        expiresIn: "1h", // ✅ use "1h" not "1 hour"
      }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
    });
  } catch (error) {
    logger.error(`error happened while login ${error}`)
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
