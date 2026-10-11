class ErrorHandler extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorMiddleware = (err, req, res, next) => {
  err.message = err.message || "Internal Server Error";
  err.statusCode = err.statusCode || 500;

  // PostgreSQL duplicate key error
  if (err.code === "23505") {
    err = new ErrorHandler("This email is already registered", 400);
  }

  // Invalid JWT
  if (err.name === "JsonWebTokenError") {
    err = new ErrorHandler("JSON Web Token is invalid. Please try again.", 400);
  }

  // Expired JWT
  if (err.name === "TokenExpiredError") {
    err = new ErrorHandler("Token has expired. Please log in again.", 401);
  }

  const errorMessage = err.errors
    ? Object.values(err.errors)
        .map((error) => error.message)
        .join(" ")
    : err.message;

  return res.status(err.statusCode || 500).json({
    success: false,
    message: errorMessage,
  });
};

export default ErrorHandler;
