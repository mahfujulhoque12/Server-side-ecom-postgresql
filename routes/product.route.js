import express from "express";
import {
  allProducts,
  createProduct,
} from "../controllers/product.controller.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";

const productRouter = express.Router();

productRouter.post("/add-product", isAuthenticated, createProduct);
productRouter.get("/all-products", isAuthenticated, allProducts);

export default productRouter;
