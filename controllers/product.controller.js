import pool from "../database/db.js";
import { v2 as cloudinary } from "cloudinary";

export const createProduct = async (req, res) => {
  let uploadedImages = [];

  try {
    const { name, description, price, category, stock } = req.body;
    const created_by = req.user.id;

    // Validate required fields
    if (
      !name?.trim() ||
      price === undefined ||
      !category?.trim() ||
      stock === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, price, category and stock are required",
      });
    }

    // Validate numeric fields
    if (
      !Number.isFinite(Number(price)) ||
      Number(price) <= 0 ||
      !Number.isInteger(Number(stock)) ||
      Number(stock) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid price or stock value",
      });
    }

    // Upload images to Cloudinary
    if (req.files?.images) {
      const images = Array.isArray(req.files.images)
        ? req.files.images
        : [req.files.images];

      for (const image of images) {
        const result = await cloudinary.uploader.upload(image.tempFilePath, {
          folder: "Ecom_product_images",
          width: 1000,
          crop: "scale",
          resource_type: "image",
        });

        uploadedImages.push({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    }

    // Insert product into PostgreSQL
    const product = await pool.query(
      `INSERT INTO products
      (name, description, price, category, stock, images, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        name.trim(),
        description || null,
        Number(price),
        category.trim(),
        Number(stock),
        JSON.stringify(uploadedImages),
        created_by,
      ],
    );

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: product.rows[0],
    });
  } catch (error) {
    console.error("Create product error:", error);

    // Rollback uploaded Cloudinary images if DB insertion fails
    await Promise.allSettled(
      uploadedImages.map((image) =>
        cloudinary.uploader.destroy(image.public_id),
      ),
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const allProducts = async (req, res, next) => {
  try {
    // 1. Get query parameters
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 10),
    );

    const offset = (page - 1) * limit;

    // 2. Get total product count
    const countResult = await pool.query("SELECT COUNT(*) FROM products");

    const totalProducts = Number(countResult.rows[0].count);

    // 3. Fetch products with pagination
    const productsResult = await pool.query(
      `SELECT id, name, description, price, category, ratings, images, created_at
       FROM products
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    // 4. Calculate pagination metadata
    const totalPages = Math.ceil(totalProducts / limit);

    // 5. Send response
    return res.status(200).json({
      success: true,
      message: "Products retrieved successfully",
      data: {
        products: productsResult.rows,
        pagination: {
          currentPage: page,
          limit,
          totalProducts,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, description, price, category, stock } = req.body;

    // Validate required fields
    if (
      !name?.trim() ||
      price === undefined ||
      !category?.trim() ||
      stock === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, price, category and stock are required",
      });
    }

    // Check product exists
    const product = await pool.query("SELECT * FROM products WHERE id = $1", [
      productId,
    ]);

    if (product.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Update product
    const result = await pool.query(
      `UPDATE products
       SET name = $1,
           description = $2,
           price = $3,
           category = $4,
           stock = $5
       WHERE id = $6
       RETURNING *`,
      [name, description, price, category, stock, productId],
    );

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: result.rows[0],
    });
  } catch (error) {
    console.error("Product update error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    // Check product exists
    const product = await pool.query("SELECT * FROM products WHERE id = $1", [
      productId,
    ]);

    if (product.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const images = product.rows[0].images;
    const deleteResult = await pool.query(
      "DELETE FROM products WHERE id= $1 RETURNING *",
      [productId],
    );

    if (deleteResult.rows[0].length === 0) {
      return res.status(500).json({ message: "Failed to delete product" });
    }

    if (images && images.length > 0) {
      for (const image of images) {
        await cloudinary.uploader.destroy(image.public_id);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Product Delete successfully",
      deletedProduct: deleteResult.rows[0],
    });
  } catch (error) {
    console.error("Product delete error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const singleProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const query = `
      SELECT p.*,
      COALESCE(
        json_agg(
          json_build_object(
            'review_id', r.id,
            'rating', r.ratings,
            'comment', r.comment,
            'reviewer', json_build_object(
              'id', u.id,
              'name', u.name,
              'avatar', u.avatar
            )
          )
        ) FILTER (WHERE r.id IS NOT NULL), '[]'
      ) AS reviews
      FROM products p
      LEFT JOIN product_review r ON p.id = r.product_id
      LEFT JOIN users u ON r.user_id = u.id
      WHERE p.id = $1
      GROUP BY p.id;
    `;

    const result = await pool.query(query, [productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      product: result.rows[0],
    });
  } catch (error) {
    console.error("Product single error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const postProductReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, comment } = req.body;

    if (!rating || !comment) {
      return res
        .status(400)
        .json({ message: "Please provide rating and comment" });
    }

    const purchaseCheckQuery = `

    SELECT oi.product_id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN payments p ON p.order_id = o.id
    WHERE o.buyer_id = $1
    AND oi.product_id = $2
    AND p.payment_status = 'Paid'
    LIMIT 1

`;

    const { rows } = await pool.query(purchaseCheckQuery, [
      req.user.id,
      productId,
    ]);

    if (rows.length === 0) {
      return res
        .status(403)
        .json({ message: "You can review only the product that you parched" });
    }

    const product = await pool.query(`SELECT * FROM products WHERE id = $1`, [
      productId,
    ]);

    if (product.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const isAlreadyReviewed = await pool.query(
      `
      SELECT * FROM reviews WHERE product_id = $1  AND user_id = $2
      `,
      [productId, req.user.id],
    );

    let review;
    if (isAlreadyReviewed.rows.length > 0) {
      review = await pool.query(
        "UPDATE reviews SET rating = $1 , comment = $2 WHERE product_id = $3 AND user_id = $4 RETURNING * ",
        [rating, comment, productId, req.user.id],
      );
    } else {
      review = await pool.query(
        "INSERT INTO reviews(product_id, user_id, rating, comment) VALUES($1, $2, $3, $4) RETURNING *",
        [productId, req.user.id, rating, comment],
      );
    }

    const allReviews = await pool.query(
      `SELECT AVG(rating) AS avg_rating WHERE product_id = $1`,
      [productId],
    );

    const newAvgRating = allReviews.rows[0].avg_rating;
    const updatedProduct = await pool.query(
      `
      UPDATE products SET ratings = $1 WHERE id = $2 RETURNING * 
      `,
      [newAvgRating, productId],
    );

    return res.status(200).json({
      success: true,
      message: "Review posted",
      review: review.rows[0],
      product: updatedProduct.rows[0],
    });
  } catch (error) {
    console.error("Product review:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    // Check if review exists
    const existingReview = await pool.query(
      `SELECT * FROM reviews
       WHERE product_id = $1 AND user_id = $2`,
      [productId, userId],
    );

    if (existingReview.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Delete review
    await pool.query(
      `DELETE FROM reviews
       WHERE product_id = $1 AND user_id = $2`,
      [productId, userId],
    );

    // Recalculate average rating
    const allReviews = await pool.query(
      `SELECT AVG(rating) AS avg_rating
       FROM reviews
       WHERE product_id = $1`,
      [productId],
    );

    const newAvgRating = Number(allReviews.rows[0].avg_rating || 0);

    // Update product rating
    const updatedProduct = await pool.query(
      `UPDATE products
       SET ratings = $1
       WHERE id = $2
       RETURNING *`,
      [newAvgRating, productId],
    );

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully",
      product: updatedProduct.rows[0],
    });
  } catch (error) {
    console.error("Delete review:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
