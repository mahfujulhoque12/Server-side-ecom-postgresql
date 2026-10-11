import express from "express";
import {
  getUser,
  login,
  logout,
  register,
} from "../controllers/auth.controller.js";

const authRouter = express.Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/logout", logout);
authRouter.get("/get-user", getUser);

export default authRouter;
