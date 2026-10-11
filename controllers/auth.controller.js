import pool from "../database/db.js";
import { catchAsyncError } from "../middleware/catchAsyncError.js";
import ErrorHandler from "../middleware/errorMiddleware.js";

import bcrypt from "bcrypt";
import { sendToken } from "../utils/jwtToken.js";

export const register = catchAsyncError(async (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return next(new ErrorHandler("Please provide all required fields", 400));
  }

  const isAlreadyRegistered = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email],
  );

  if (isAlreadyRegistered.rows.length > 0) {
    return next(
      new ErrorHandler("User already registered with this email", 400),
    );
  }

  const hashPassword = await bcrypt.hash(password, 10);
  const user = await pool.query(
    "INSERT INTO users (name,email, password) VALUES ($1, $2, $3) RETURNING *",
    [name, email, hashPassword],
  );

  sendToken(user.rows[0], 201, "user register successfully", res);
});

export const login = catchAsyncError(async (req, res, next) => {});

export const getUser = catchAsyncError(async (req, res, next) => {});

export const logout = catchAsyncError(async (req, res, next) => {});
