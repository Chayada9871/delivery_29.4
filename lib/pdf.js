import { formatCurrency, formatDateTime } from "@/lib/format";

export async function generatePurchaseOrderPdf(order, options = {}) {
  if (typeof window === "undefined") return null;

  const { autoPrint = true } = options;
  const popup = window.open("", "_blank", "width=1080,height=1200");
  if (!popup) {
    throw new Error("ไม่สามารถเปิดหน้าต่างสำหรับเอกสาร PO ได้");
  }

  const documentHtml = buildPoHtml(order);
  popup.document.open();
  popup.document.write(documentHtml);
  popup.document.close();
  popup.focus();

  const fileName = `PO-${sanitizeFileName(order.poNumber || order.id || Date.now())}.pdf`;
  popup.onload = () => {
    popup.document.title = fileName;
    if (autoPrint) {
      popup.print();
    }
  };

  return fileName;
}

function buildPoHtml(order) {
  const items = buildItems(order);
  const totalAmount = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  const itemRows = items
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.code || "-")}</td>
          <td>${escapeHtml(item.name || item.text || "-")}</td>
          <td>${escapeHtml(item.quantity || "-")}</td>
          <td>${formatCurrency(item.lineTotal || 0)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="th">
      <head>
        <meta charset="UTF-8" />
        <title>PO-${escapeHtml(order.poNumber || "-")}</title>
        <style>
          body { font-family: "Tahoma", "Segoe UI", sans-serif; margin: 0; color: #0f172a; background: #e2e8f0; }
          .page { max-width: 980px; margin: 0 auto; padding: 32px; background: #ffffff; }
          .hero { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 3px solid #f97316; padding-bottom: 20px; }
          .brand { font-size: 30px; font-weight: 700; letter-spacing: 0.04em; color: #c2410c; }
          .meta { margin-top: 6px; font-size: 13px; color: #475569; }
          .section { margin-top: 28px; }
          .section-title { margin-bottom: 12px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #c2410c; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .card { border: 1px solid #e2e8f0; padding: 16px; background: linear-gradient(180deg, #fff7ed 0%, #ffffff 100%); }
          .card-value { margin-top: 6px; font-size: 18px; font-weight: 700; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
          .summary-box { border: 1px solid #e2e8f0; padding: 14px; background: #f8fafc; }
          .summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
          .summary-value { margin-top: 6px; font-size: 22px; font-weight: 700; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 10px; text-align: left; font-size: 13px; vertical-align: top; }
          th { background: #f8fafc; color: #475569; }
          .block { border: 1px solid #e2e8f0; padding: 16px; background: #ffffff; white-space: pre-line; }
          .muted { color: #64748b; }
          .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
          @media print {
            body { background: #ffffff; }
            .page { max-width: none; padding: 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="hero">
            <div>
              <div class="brand">PURCHASE ORDER</div>
              <div class="meta">เลขที่ PO: ${escapeHtml(order.poNumber || "-")}</div>
              <div class="meta">วันที่สร้าง: ${escapeHtml(formatDateTime(order.createdAt || new Date().toISOString()))}</div>
            </div>
            <div>
              <div class="meta">ช่องทางรับออเดอร์: Line OA</div>
              <div class="meta">สถานะ: ${escapeHtml(order.status || "LINE_RECEIVED")}</div>
            </div>
          </div>

          <div class="section grid">
            <div class="card">
              <div class="section-title">Customer</div>
              <div class="card-value">${escapeHtml(order.customerName || "-")}</div>
              <div class="meta">ติดต่อ: ${escapeHtml(order.contact || order.phone || "-")}</div>
            </div>
            <div class="card">
              <div class="section-title">Delivery</div>
              <div class="meta">วันที่จัดส่ง: ${escapeHtml(order.deliveryDate || "-")}</div>
              <div class="meta">ช่วงเวลา: ${escapeHtml(order.deliveryTimeSlot || "-")}</div>
              <div class="meta">Google Maps: ${escapeHtml(order.mapsUrl || "-")}</div>
            </div>
          </div>

          <div class="section">
            <div class="summary-grid">
              <div class="summary-box">
                <div class="summary-label">Items</div>
                <div class="summary-value">${items.length}</div>
              </div>
              <div class="summary-box">
                <div class="summary-label">Quantity</div>
                <div class="summary-value">${totalQty.toFixed(1)}</div>
              </div>
              <div class="summary-box">
                <div class="summary-label">Amount</div>
                <div class="summary-value">${escapeHtml(formatCurrency(order.estimatedAmount || totalAmount))}</div>
              </div>
              <div class="summary-box">
                <div class="summary-label">Status</div>
                <div class="summary-value" style="font-size:16px">${escapeHtml(order.status || "LINE_RECEIVED")}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Items</div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Code</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Delivery Address</div>
            <div class="block">${escapeHtml(order.address || "-")}</div>
          </div>

          <div class="section">
            <div class="section-title">Landmark</div>
            <div class="block muted">${escapeHtml(order.landmark || "-")}</div>
          </div>

          <div class="section">
            <div class="section-title">Chat Note</div>
            <div class="block">${escapeHtml(order.chatNote || "-")}</div>
          </div>

          <div class="footer">เอกสารนี้สร้างจากระบบ Sophon Driver เพื่อใช้ตรวจสอบและบันทึกคำสั่งซื้อ</div>
        </div>
      </body>
    </html>
  `;
}

function buildItems(order) {
  if (Array.isArray(order.selectedProducts) && order.selectedProducts.length) {
    return order.selectedProducts.map((item) => ({
      code: item.code,
      name: item.name,
      quantity: item.quantity,
      lineTotal: Number(item.price || 0) * Number(item.quantity || 0),
    }));
  }

  return String(order.items || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({
      text,
      quantity: "",
      lineTotal: 0,
    }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFileName(value) {
  return String(value).replace(/[<>:"/\\|?*]+/g, "-");
}
