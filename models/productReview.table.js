import pool from "../database/db.js";

export const createProductReviewTable = async () => {
  try {
    const query = ` 
    CREATE TABLE IF NOT EXISTS product_review (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL,
    user_id UUID NOT NULL,
    ratings DECIMAL(3,2) DEFAULT 0 CHECK (ratings BETWEEN 0 AND 5),
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    `;

    await pool.query(query);
  } catch (error) {
    console.error("Create product review table error:", error);
    throw error;
  }
};
