import { daysLeft } from "./utils.js";

export function getFEFOBatches(productId, batches) {
  return batches
    .filter(b => b.product_id === productId && b.quantity > 0)
    .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
}

export function deductStock(productId, quantity, batches) {
  const sorted = getFEFOBatches(productId, batches);

  let remaining = quantity;

  for (let batch of sorted) {
    if (remaining <= 0) break;

    if (batch.quantity >= remaining) {
      batch.quantity -= remaining;
      remaining = 0;
    } else {
      remaining -= batch.quantity;
      batch.quantity = 0;
    }
  }

  return batches;
}