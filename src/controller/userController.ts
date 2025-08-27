import { Request, Response } from "express";
import { userRegistrationSchema, loginSchema } from "../utils/zod/userzod";
import { prismaClient } from "../utils/db/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const jwtsecret = process.env.JWT_SECRET;

if (!jwtsecret) {
  console.warn("missing the jwtsecret");
  process.exit(1);
}

export const userRegitration = async (req: Request, res: Response) => {
  try {
    const userData = req.body;
    const parsedData = userRegistrationSchema.safeParse(userData);

    if (!parsedData.success) {
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

    return res.json({
      success: false,
      message: "account created successfully",
      id: savedData.id,
    });
  } catch (error) {
    console.error("error happend while creating the user", error);
    return res.status(500).json({
      success: false,
      message: "unexpected error happened",
    });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const body = req.body;

    const parsedData = loginSchema.safeParse(body);

    if (!parsedData.success) {
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
      res.status(401).json({
        success: false,
        message: "Invalid password",
      });
      return;
    }

    const token = jwt.sign(
      {
        id: searchUser.mobileNo,
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
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
