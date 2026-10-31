import express from "express";
import { createProduct } from "../controllers/product.controller.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";

const productRouter = express.Router();

productRouter.post("/add-product", isAuthenticated, createProduct);

export default productRouter;
