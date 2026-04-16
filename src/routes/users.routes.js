import { Router } from "express";
import prisma from "../lib/prisma.js";  

const router = Router();

router.post("/", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.create({
            data: {
                email,
                password,
            },
        });

        res.status(201).json(user);
    } catch (error) {
        console.error("CREATE USER ERROR:", error);

        res.status(500).json({
            error: "Internal server error"
        });
        }
});

export default router;