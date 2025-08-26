import z from "zod"


export const userRegistrationSchema =z.object({
    name:z.string().min(3),
    mobileNo:z.string().min(10),
    password:z.string().min(6)
})


export const loginSchema = z.object({
    mobileNo:z.string().min(10),
    password:z.string().min(6)
})