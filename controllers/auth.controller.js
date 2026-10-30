import pool from "../database/db.js";
import { catchAsyncError } from "../middleware/catchAsyncError.js";
import ErrorHandler from "../middleware/errorMiddleware.js";
import jwt from "jsonwebtoken";

import bcrypt from "bcrypt";
import { sendToken } from "../utils/jwtToken.js";
import { generateResetPasswordToken } from "../utils/generateResetPassword.js";
import { sendEmail } from "./../utils/sendEmail.js";
import { generateEmailTemplate } from "../utils/emailPasswordForgotTemplete.js";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";

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

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // find user in postgreSql
    const result = await pool.query(
      "SELECT id, name, email, password FROM users WHERE email = $1",
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];

    // Verify password
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate JWT
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET_KEY, {
      expiresIn: "7d",
    });

    // Send response
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.log(error, "login error");
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getUser = async (req, res) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    // Find user in PostgreSQL
    const result = await pool.query(
      `SELECT id, name, email
       FROM users
       WHERE id = $1`,
      [decoded.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User fetched successfully",
      user: result.rows[0],
    });
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    console.error("Get user error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const logout = async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const { frontendUrl } = req.query;

    // ১. ইউজার চেক করা
    let userResult = await pool.query(`SELECT * FROM users WHERE email = $1`, [
      email,
    ]);

    if (userResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User Not found with this email" });
    }

    const user = userResult.rows[0];

    // ২. টোকেন তৈরি ও ডাটাবেজে সেভ করা
    const { hashedToken, resetPasswordExpireTime, resetToken } =
      generateResetPasswordToken();

    await pool.query(
      `UPDATE users 
       SET reset_password_token = $1, reset_password_expire = to_timestamp($2) 
       WHERE email = $3`,
      [hashedToken, resetPasswordExpireTime / 1000, email],
    );

    // ৩. ইমেইল টেমপ্লেট ও লিংক তৈরি
    const resetPasswordUrl = `${frontendUrl}/password/reset/${resetToken}`;
    const message = generateEmailTemplate(resetPasswordUrl);

    // ৪. ইমেইল পাঠানো এবং ফেইল করলে রোলব্যাক করার জন্য নেস্টেড try...catch
    try {
      await sendEmail({
        email: user.email,
        subject: "Ecommerce Password Recovery",
        message,
      });

      return res.status(200).json({
        success: true,
        message: `Email sent to ${user.email} successfully.`,
      });
    } catch (emailError) {
      // ইমেইল না গেলে টোকেন মুছে ফেলা হচ্ছে
      await pool.query(
        `UPDATE users 
         SET reset_password_token = NULL, reset_password_expire = NULL 
         WHERE email = $1`,
        [email],
      );

      console.error("Email send error:", emailError.message);

      return res.status(500).json({
        success: false,
        message: "Email could not be sent.",
      });
    }
  } catch (error) {
    console.error("Forgot password error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await pool.query(
      "SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expire > NOW()",
      [resetPasswordToken],
    );

    if (user.rows.length === 0) {
      return res.status(400).json({ message: "Invalid Or expire password" });
    }

    if (req.body.password !== req.body.confirmPassword) {
      return res.status(400).json({ message: "Password do not match" });
    }
    const passwordLength = req.body.password ? req.body.password.length : 0;

    if (passwordLength < 8 || passwordLength > 16) {
      return res.status(400).json({
        message: "Password must be between 8 and 16 characters long",
      });
    }

    const hashPassword = await bcrypt.hash(req.body.password, 10);

    const updateUser = await pool.query(
      `UPDATE users SET password=$1, reset_password_token = NULL ,reset_password_expire = NULL WHERE id = $2 RETURNING *`,
      [hashPassword, user.rows[0].id],
    );
    sendToken(updateUser.rows[0], 200, "Password reset successfully", res);
  } catch (error) {
    console.error("Reset password error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const { email, currentPassword, newPassword, confirmNewPassword } =
      req.body;

    // ১. ফিল্ডগুলো পূরণ করা হয়েছে কি না যাচাই
    if (!email || !currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: "সবগুলো ফিল্ড সঠিকভাবে পূরণ করুন",
      });
    }

    // ২. নতুন পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড ম্যাচিং চেক
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirm password do not match",
      });
    }

    // ৩. পাসওয়ার্ডের দৈর্ঘ্য চেক (৮ থেকে ১৬ অক্ষর)
    if (newPassword.length < 8 || newPassword.length > 16) {
      return res.status(400).json({
        success: false,
        message: "Password must be between 8 and 16 characters long",
      });
    }

    // ৪. ইমেইল দিয়ে সরাসরি ডাটাবেজ থেকে ইউজার খোঁজা (আপাতত টেস্টের জন্য)
    const userResult = await pool.query(
      "SELECT id, password FROM users WHERE email = $1",
      [email],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userResult.rows[0];

    // ৫. আগের পাসওয়ার্ড সঠিক আছে কি না চেক
    const isPasswordMatched = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isPasswordMatched) {
      return res.status(400).json({
        success: false,
        message: "Incorrect current password",
      });
    }

    // ৬. নতুন পাসওয়ার্ড হ্যাশ করে আপডেট করা
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
      hashedPassword,
      user.id,
    ]);

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Update password error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    // Validate required fields
    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required",
      });
    }

    // Find existing user by email
    const existingUser = await pool.query(
      "SELECT id, avatar FROM users WHERE email = $1",
      [email.trim()],
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userId = existingUser.rows[0].id;

    let avatarData = existingUser.rows[0].avatar;

    // Upload new avatar if provided
    if (req.files?.avatar) {
      const { avatar } = req.files;

      // Upload new image to Cloudinary
      const uploadedImage = await cloudinary.uploader.upload(
        avatar.tempFilePath,
        {
          folder: "Ecom_avatar",
          width: 150,
          crop: "scale",
        },
      );

      // Delete old avatar after successful upload
      if (avatarData?.public_id) {
        await cloudinary.uploader.destroy(avatarData.public_id);
      }

      avatarData = {
        public_id: uploadedImage.public_id,
        url: uploadedImage.secure_url,
      };
    }

    // Update user profile
    const user = await pool.query(
      `UPDATE users
       SET name = $1,
           email = $2,
           avatar = $3
       WHERE id = $4
       RETURNING id, name, email, avatar, role`,
      [name.trim(), email.trim(), JSON.stringify(avatarData), userId],
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: user.rows[0],
    });
  } catch (error) {
    console.error("Update profile error:", error);

    // Handle duplicate email
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
