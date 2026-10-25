import express from "express";
import {
  forgotPassword,
  getUser,
  login,
  logout,
  register,
  resetPassword,
  updatePassword,
} from "../controllers/auth.controller.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";

const authRouter = express.Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/logout", isAuthenticated, logout);
authRouter.get("/get-user", isAuthenticated, getUser);
authRouter.post("/password/forgot", forgotPassword);
authRouter.put("/password/reset/:token", resetPassword);
authRouter.post("/password/update", updatePassword);

export default authRouter;
