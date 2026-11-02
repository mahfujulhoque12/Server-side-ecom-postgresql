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
