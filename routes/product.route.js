import express from "express";
import {
  allProducts,
  createProduct,
  deleteProduct,
  deleteReview,
  postProductReview,
  singleProduct,
  updateProduct,
} from "../controllers/product.controller.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";

const productRouter = express.Router();

productRouter.post("/add-product", isAuthenticated, createProduct);
productRouter.get("/all-products", isAuthenticated, allProducts);
productRouter.put("/update/:productId", isAuthenticated, updateProduct);
productRouter.delete("/delete/:productId", isAuthenticated, deleteProduct);
productRouter.get("/:productId", isAuthenticated, singleProduct);
productRouter.put(
  "/post-review/:productId",
  isAuthenticated,
  postProductReview,
);
productRouter.delete("/:productId/review", isAuthenticated, deleteReview);

export default productRouter;
