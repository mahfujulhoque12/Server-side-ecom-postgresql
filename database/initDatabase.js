import { orderItemsTable } from "../models/orderItems.table.js";
import { createOrdersTable } from "../models/orders.table.js";
import { paymentsTable } from "../models/payment.table.js";
import { createProductTable } from "../models/product.table.js";
import { createProductReviewTable } from "../models/productReview.table.js";
import { createShippingInfoTable } from "../models/shippingInfo.table.js";
import { createUserTable } from "../models/user.table.js";

const initDatabase = async () => {
  await createUserTable();
  await createProductTable();
  await createOrdersTable();
  await createShippingInfoTable();
  await createProductReviewTable();
  await paymentsTable();
  await orderItemsTable();

  console.log("All database tables initialized");
};

export default initDatabase;
