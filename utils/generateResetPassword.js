import crypto from "crypto";

export const generateResetPasswordToken = () => {
  // Generate a secure random token
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash token before saving it to the database
  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  const resetPasswordExpireTime = Date.now() + 15 * 60 * 1000;

  return {
    resetToken,
    hashedToken,
    resetPasswordExpireTime,
  };
};
