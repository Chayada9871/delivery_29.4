import { getBatches } from "./batches.js";

export function getAlerts() {
  return getBatches().filter(b => b.status !== "safe");
}