import { getBatches } from "./batches.js";

export function getDashboardStats() {
  const data = getBatches();

  return {
    total: data.length,
    expired: data.filter(b => b.status === "expired").length,
    warning: data.filter(b => b.status === "warning").length,
    safe: data.filter(b => b.status === "safe").length
  };
}