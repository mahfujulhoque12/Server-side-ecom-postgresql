import pool from "../database/db.js";

export const createUserTable = async () => {
  try {
    const query = `
    CREATE TABLE IF NOT EXISTS users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL CHECK (char_length(name) >=3),
    email VARCHAR(100) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role VARCHAR(10) DEFAULT 'User' CHECK ( role IN ('User', 'Admin')),
    avatar JSONB DEFAULT NULL,
    reset_password_token TEXT DEFAULT NULL,
    reset_password_expire TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `;
    await pool.query(query);
  } catch (error) {
    console.log("create user table error", error);
    process.exit(1);
  }
};
