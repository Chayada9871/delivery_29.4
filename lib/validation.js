import { validateMapsUrl } from "@/lib/maps";
import { ROLES, STATUS } from "@/lib/config";
import {
  canEditOrder,
  getCompletedStatus,
  getOperationalStatus,
  isDispatchReady,
} from "@/lib/workflow";

export function calculateSelectedTotals(items = []) {
  return items.reduce(
    (acc, item) => {
      const quantity = Number(item?.quantity || 0);
      const price = Number(item?.price || 0);
      acc.lines += 1;
      acc.quantity += Number.isFinite(quantity) ? quantity : 0;
      acc.amount += (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(price) ? price : 0);
      return acc;
    },
    { lines: 0, quantity: 0, amount: 0 }
  );
}

export function buildItemsText(items = [], fallback = "") {
  const cleanItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!cleanItems.length) return String(fallback || "").trim();

  return cleanItems
    .map((item) => `${item.code || "SKU"} ${item.name || "ไม่ระบุสินค้า"} x${Number(item.quantity || 0).toFixed(1)}`)
    .join("\n");
}

export function validateSelectedProducts(items = []) {
  const errors = [];
  const cleanItems = Array.isArray(items) ? items : [];

  if (!cleanItems.length) {
    errors.push({
      field: "selectedProducts",
      message: "กรุณาเลือกสินค้าอย่างน้อย 1 รายการก่อนบันทึก PO",
    });
    return errors;
  }

  cleanItems.forEach((item, index) => {
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push({
        field: `selectedProducts.${index}.quantity`,
        message: `จำนวนของสินค้า ${item?.code || item?.name || index + 1} ไม่ถูกต้อง`,
      });
    }
  });

  return errors;
}

function buildInsufficientStockWarning(item = {}, index = 0) {
  const quantity = Number(item?.quantity);
  const availableQty = Number(item?.availableQty);

  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(availableQty) || quantity <= availableQty) {
    return null;
  }

  const shortage = Math.max(quantity - availableQty, 0);
  const itemLabel = item?.code || item?.name || `รายการที่ ${index + 1}`;

  return {
    field: `selectedProducts.${index}.quantity`,
    code: "insufficient_stock",
    message: `${itemLabel} ต้องการ ${quantity.toFixed(1)} แต่สต็อกพร้อมขายมี ${availableQty.toFixed(1)} ขาด ${shortage.toFixed(1)}`,
  };
}

export function getInsufficientStockWarnings(items = []) {
  const cleanItems = Array.isArray(items) ? items : [];
  return cleanItems.map((item, index) => buildInsufficientStockWarning(item, index)).filter(Boolean);
}

export function validateLineOrderDraft(payload = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const currentEditingId = String(payload.editingId || "").trim();
  const poNumber = String(payload.poNumber || "").trim();
  const customerName = String(payload.customerName || "").trim();
  const contact = String(payload.contact || "").trim();
  const address = String(payload.address || "").trim();
  const deliveryDate = String(payload.deliveryDate || "").trim();
  const selectedProducts = Array.isArray(payload.selectedProducts) ? payload.selectedProducts : [];
  const existingOrders = Array.isArray(options.existingOrders) ? options.existingOrders : [];

  if (!poNumber) errors.push({ field: "poNumber", message: "กรุณาระบุเลขที่ PO" });
  if (!customerName) errors.push({ field: "customerName", message: "กรุณาระบุชื่อลูกค้า" });
  if (!contact) warnings.push({ field: "contact", message: "กรุณาระบุชื่อผู้ติดต่อ", code: "missing_contact" });
  if (!address) errors.push({ field: "address", message: "กรุณาระบุที่อยู่จัดส่ง" });
  if (!deliveryDate) errors.push({ field: "deliveryDate", message: "กรุณาระบุวันที่จัดส่ง" });

  errors.push(...validateSelectedProducts(selectedProducts));
  warnings.push(...getInsufficientStockWarnings(selectedProducts));

  const duplicatePo = existingOrders.find(
    (item) => String(item.poNumber || "").trim() === poNumber && String(item.id || "") !== currentEditingId
  );
  if (duplicatePo) {
    errors.push({ field: "poNumber", message: "เลขที่ PO นี้มีอยู่ในระบบแล้ว" });
  }

  const mapsIssue = validateMapsUrl(payload.mapsUrl);
  if (mapsIssue) {
    (mapsIssue.level === "error" ? errors : warnings).push({
      field: "mapsUrl",
      message: mapsIssue.message,
      code: mapsIssue.code,
    });
  }

  if (!String(payload.paymentMethod || "").trim()) {
    warnings.push({
      field: "paymentMethod",
      message: "ยังไม่ได้ระบุวิธีชำระเงิน อาจต้องติดตามกับฝ่ายการเงิน",
      code: "missing_payment_method",
    });
  }

  return {
    errors,
    warnings,
    totals: calculateSelectedTotals(selectedProducts),
    itemsText: buildItemsText(selectedProducts, payload.items),
  };
}

export function getOrderDataIssues(order = {}, options = {}) {
  const issues = [];
  const status = getOperationalStatus(order);
  const role = options.role || "";

  if (!String(order.customerName || "").trim()) {
    issues.push({ level: "error", code: "missing_customer", message: "ยังไม่ได้ระบุชื่อลูกค้า" });
  }

  if (!String(order.contact || "").trim()) {
    issues.push({ level: "error", code: "missing_contact", message: "ยังไม่ได้ระบุข้อมูลติดต่อของลูกค้า" });
  }

  if (!String(order.deliveryDate || "").trim()) {
    issues.push({ level: "error", code: "missing_delivery_date", message: "ยังไม่ได้ระบุวันที่จัดส่ง" });
  }

  if (!String(order.address || "").trim()) {
    issues.push({ level: "error", code: "missing_address", message: "ยังไม่ได้ระบุที่อยู่จัดส่ง" });
  }

  if (!Array.isArray(order.selectedProducts) || !order.selectedProducts.length) {
    issues.push({ level: "error", code: "missing_products", message: "PO นี้ยังไม่มีรายการสินค้า" });
  } else if (
    order.selectedProducts.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)
  ) {
    issues.push({
      level: "error",
      code: "invalid_quantity",
      message: "มีรายการสินค้าที่จำนวนไม่ถูกต้องอย่างน้อย 1 รายการ",
    });
  }

  const mapsIssue = validateMapsUrl(order.mapsUrl);
  if (mapsIssue) issues.push(mapsIssue);

  if (isDispatchReady(order) && !String(order.assignedDriverId || "").trim() && status !== STATUS.PREPARED) {
    issues.push({
      level: "warning",
      code: "missing_driver",
      message: "มีข้อมูลจัดส่งแล้ว แต่ยังไม่ได้ล็อกคนขับ",
    });
  }

  if (status === STATUS.PREPARED && !String(order.assignedDriverId || "").trim()) {
    issues.push({
      level: "warning",
      code: "unassigned_prepared",
      message: "งานนี้เตรียมสินค้าแล้ว แต่ยังรอมอบหมายคนขับ",
    });
  }

  if (status === STATUS.ARCHIVED && !getCompletedStatus(order)) {
    issues.push({
      level: "warning",
      code: "archived_without_result",
      message: "รายการในประวัติยังไม่มีผลจัดส่งสุดท้าย",
    });
  }

  if (role && !canEditOrder(order, role) && ![ROLES.DRIVER, ROLES.MANAGER].includes(role)) {
    issues.push({
      level: "info",
      code: "read_only",
      message: "คำสั่งซื้อนี้เลยช่วงที่บทบาทปัจจุบันจะแก้ไขได้แล้ว",
    });
  }

  return issues;
}
