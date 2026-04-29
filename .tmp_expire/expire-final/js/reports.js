import { getBatches } from "./batches.js";

export function generateReport() {
  return getBatches();
}

export function exportCSV(data) {
  const headers = Object.keys(data[0]);

  const csv = [
    headers.join(","),
    ...data.map(row => headers.map(h => `"${row[h] || ""}"`).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);
  link.download = "report.csv";
  link.click();
}