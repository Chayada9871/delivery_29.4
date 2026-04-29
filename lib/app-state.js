"use client";

import { createClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { APP_CONFIG, EMPTY_STATE, ROLES, STATUS } from "@/lib/config";
import {
  buildDistrictArea,
  buildRelativeLocationLabel,
  calculateDistanceKm,
  isGoogleMapsShortLink,
  parseGoogleMapsCoordinates,
  resolveDistrictFromCoordinates,
  resolveMapsCoordinates,
} from "@/lib/maps";
import { buildItemsText, calculateSelectedTotals, validateLineOrderDraft } from "@/lib/validation";
import {
  canArchiveOrder,
  canDeleteOrder,
  canEditOrder,
  FINAL_DELIVERY_STATUSES,
  getCompletedStatus,
  getOperationalStatus,
  getSafeTransitionError,
  normalizeWorkflowStatus,
} from "@/lib/workflow";

const STORAGE_KEY = "sophon-driver-next-state";
const AppStateContext = createContext(null);

function generatePoNumber(existingLineOrders = []) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const prefix = `PO-${year}${month}${day}`;
  const todaysNumbers = existingLineOrders
    .map((item) => String(item.poNumber || ""))
    .filter((value) => value.startsWith(prefix));
  const maxSequence = todaysNumbers.reduce((max, value) => {
    const sequence = Number(value.split("-").pop());
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  return `${prefix}-${String(maxSequence + 1).padStart(3, "0")}`;
}

function sanitizeQuantity(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 1;
  return Math.round(number * 10) / 10;
}

function parseNumberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const source = String(value ?? "").trim();
  if (!source) return 0;
  const normalized = source.replace(/,/g, "");
  const direct = Number(normalized);
  if (Number.isFinite(direct)) return direct;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const extracted = Number(match[0]);
  return Number.isFinite(extracted) ? extracted : 0;
}

function normalizeAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : "";
}

function cloneProductItems(items) {
  return Array.isArray(items)
    ? items.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        price: Number(item.price || 0),
        quantity: sanitizeQuantity(item.quantity),
        stockOnHand: Number(item.stockOnHand || 0),
        reservedQty: Number(item.reservedQty || 0),
        availableQty: Number(item.availableQty || 0),
        stockNote: buildStockShortageNote(item, item.quantity) || String(item.stockNote || ""),
        priceNote: String(item.priceNote || ""),
      }))
    : [];
}

function pickFirstField(record, candidates, fallback = "") {
  for (const key of candidates || []) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function normalizeProduct(record) {
  const columns = APP_CONFIG.productColumns || {};
  return {
    id: String(pickFirstField(record, columns.id, record?.id || record?.product_id || "")).trim(),
    code: String(pickFirstField(record, columns.code, "")).trim(),
    name: String(pickFirstField(record, columns.name, "")).trim(),
    price: parseNumberValue(pickFirstField(record, columns.price, 0)),
    raw: record,
  };
}

function normalizePriceRecord(record) {
  const columns = APP_CONFIG.priceColumns || {};
  return {
    code: String(pickFirstField(record, columns.code, "")).trim(),
    name: String(pickFirstField(record, columns.name, "")).trim(),
    price: parseNumberValue(pickFirstField(record, columns.price, 0)),
    note: String(pickFirstField(record, columns.note, "")).trim(),
  };
}

function normalizeUserRole(value) {
  const rawRole = String(value || "").trim().toLowerCase();
  return rawRole === "admin" || rawRole === "manager"
    ? ROLES.MANAGER
    : rawRole === "driver"
      ? ROLES.DRIVER
      : rawRole === "warehouse"
        ? ROLES.WAREHOUSE
        : ROLES.SALES;
}

function normalizeUserRecord(record) {
  const normalizedRole = normalizeUserRole(record?.role || record?.department);
  const department = String(record?.department || normalizedRole || "").trim() || normalizedRole;

  return {
    id: String(record?.id || `USR-${Date.now()}`),
    name: String(record?.full_name || record?.name || record?.username || "").trim(),
    username: String(record?.username || "").trim(),
    password: String(record?.password || "").trim(),
    role: normalizedRole,
    department,
    employeeCode: String(record?.employee_code || record?.employeeCode || "").trim(),
    position: String(record?.position || record?.job_title || "").trim(),
    email: String(record?.email || "").trim(),
    phone: String(record?.phone || "").trim(),
    area: String(record?.area || "").trim(),
    vehicleType: String(record?.vehicle_type || record?.vehicleType || "").trim(),
    maxOrders: record?.max_orders ?? record?.maxOrders ?? "",
    note: String(record?.note || record?.staff_note || "").trim(),
  };
}

function normalizeLogRecord(record) {
  return {
    id: String(record?.id || `LOG-${Date.now()}`),
    orderId: String(record?.order_id || record?.orderId || "").trim(),
    driverId: String(record?.driver_id || record?.driverId || "").trim(),
    status: normalizeWorkflowStatus(record?.status || "") || String(record?.status || "").trim(),
    note: String(record?.note || "").trim(),
    actedById: String(record?.acted_by_id || record?.actedById || "").trim(),
    actedByName: String(record?.acted_by_name || record?.actedByName || "").trim(),
    actedByRole: String(record?.acted_by_role || record?.actedByRole || "").trim(),
    timestamp: String(record?.timestamp || record?.created_at || new Date().toISOString()).trim(),
    createdAt: String(record?.created_at || record?.timestamp || "").trim(),
    updatedAt: String(record?.updated_at || "").trim(),
  };
}

function validateUserPayload(payload = {}, existingUsers = []) {
  const name = String(payload.name || "").trim();
  const username = String(payload.username || "")
    .trim()
    .toLowerCase();
  const password = String(payload.password || "").trim();
  const role = normalizeUserRole(payload.role || payload.department);
  const department = String(payload.department || role || "").trim() || role;
  const maxOrdersValue = String(payload.maxOrders ?? "").trim();
  const maxOrdersNumber = maxOrdersValue ? Number(maxOrdersValue) : "";

  if (!name) {
    return { ok: false, message: "กรุณาระบุชื่อพนักงาน" };
  }

  if (!username) {
    return { ok: false, message: "กรุณาระบุชื่อผู้ใช้" };
  }

  if (!/^[a-z0-9._-]+$/i.test(username)) {
    return { ok: false, message: "ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข จุด ขีดกลาง และขีดล่าง" };
  }

  const hasDuplicate = existingUsers.some(
    (user) => String(user?.username || "").trim().toLowerCase() === username
  );
  if (hasDuplicate) {
    return { ok: false, message: "ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว" };
  }

  if (password.length < 4) {
    return { ok: false, message: "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร" };
  }

  if (maxOrdersValue && (!Number.isFinite(maxOrdersNumber) || maxOrdersNumber < 1)) {
    return { ok: false, message: "จำนวนงานสูงสุดต่อรอบต้องมากกว่า 0" };
  }

  return {
    ok: true,
    payload: {
      ...payload,
      name,
      username,
      password,
      role,
      department,
      maxOrders: maxOrdersValue ? Math.floor(maxOrdersNumber) : "",
    },
  };
}

function buildHistorySnapshot(order = {}) {
  const archivedAt = String(order.routeArchivedAt || order.routeFinishedAt || order.updatedAt || new Date().toISOString()).trim();
  return {
    historyId: `${String(order.poNumber || "").trim()}::${archivedAt || "history"}`,
    poNumber: String(order.poNumber || "").trim(),
    customerName: String(order.customerName || "").trim(),
    contact: String(order.contact || "").trim(),
    paymentMethod: String(order.paymentMethod || "").trim(),
    address: String(order.address || "").trim(),
    mapsUrl: String(order.mapsUrl || "").trim(),
    landmark: String(order.landmark || "").trim(),
    deliveryDate: String(order.deliveryDate || "").trim(),
    deliveryTimeSlot: String(order.deliveryTimeSlot || "").trim(),
    items: String(order.items || "").trim(),
    selectedProducts: cloneProductItems(order.selectedProducts || []),
    estimatedAmount: normalizeAmount(order.estimatedAmount),
    confirmedAmount: normalizeAmount(order.confirmedAmount),
    chatNote: String(order.chatNote || "").trim(),
    dispatchNote: String(order.dispatchNote || "").trim(),
    deliveryNote: String(order.deliveryNote || "").trim(),
    status: STATUS.ARCHIVED,
    finalStatus: getCompletedStatus(order),
    createdById: String(order.createdById || "").trim(),
    createdByName: String(order.createdByName || "").trim(),
    confirmedById: String(order.confirmedById || "").trim(),
    confirmedByName: String(order.confirmedByName || "").trim(),
    preparedById: String(order.preparedById || "").trim(),
    preparedByName: String(order.preparedByName || "").trim(),
    assignedById: String(order.assignedById || "").trim(),
    assignedByName: String(order.assignedByName || "").trim(),
    archivedById: String(order.archivedById || "").trim(),
    archivedByName: String(order.archivedByName || "").trim(),
    assignedDriverId: String(order.assignedDriverId || "").trim(),
    routeDriverName: String(order.routeDriverName || "").trim(),
    deliverySequence: String(order.deliverySequence || "").trim(),
    routeStartKm: order.routeStartKm ?? "",
    routeEndKm: order.routeEndKm ?? "",
    lineReceivedAt: String(order.lineReceivedAt || order.createdAt || "").trim(),
    confirmedAt: String(order.confirmedAt || "").trim(),
    preparedAt: String(order.preparedAt || order.readyForRouteAt || "").trim(),
    assignedAt: String(order.assignedAt || "").trim(),
    routeStartedAt: String(order.routeStartedAt || "").trim(),
    dispatchStartedAt: String(order.dispatchStartedAt || "").trim(),
    dispatchDeliveredAt: String(order.dispatchDeliveredAt || "").trim(),
    routeFinishedAt: String(order.routeFinishedAt || "").trim(),
    routeArchivedAt: archivedAt,
    returnReportedAt: String(order.returnReportedAt || "").trim(),
    returnHandledBy: String(order.returnHandledBy || "").trim(),
    destinationLat: order.destinationLat ?? "",
    destinationLng: order.destinationLng ?? "",
    createdAt: String(order.createdAt || "").trim(),
    updatedAt: String(order.updatedAt || "").trim(),
  };
}

function finalizeLineOrder(order = {}) {
  const coordinates = parseGoogleMapsCoordinates(order.mapsUrl);
  const operationalStatus = getOperationalStatus(order);
  const finalStatus = getCompletedStatus({ ...order, status: operationalStatus });
  const dispatchStatus =
    operationalStatus === STATUS.ARCHIVED
      ? finalStatus || ""
      : [STATUS.ASSIGNED, STATUS.OUT_FOR_DELIVERY, STATUS.DELIVERED, STATUS.FAILED, STATUS.RETURNED].includes(operationalStatus)
        ? operationalStatus
        : "";

  const next = {
    ...order,
    status: operationalStatus,
    finalStatus,
    dispatchStatus,
    routeArchived: operationalStatus === STATUS.ARCHIVED,
    selectedForDispatch: Boolean(order.assignedDriverId),
    estimatedAmount: normalizeAmount(order.estimatedAmount),
    confirmedAmount:
      order.confirmedAmount === "" || order.confirmedAmount === null || order.confirmedAmount === undefined
        ? ""
        : normalizeAmount(order.confirmedAmount),
    destinationLat:
      Number.isFinite(Number(order.destinationLat)) ? Number(order.destinationLat) : coordinates?.lat ?? "",
    destinationLng:
      Number.isFinite(Number(order.destinationLng)) ? Number(order.destinationLng) : coordinates?.lng ?? "",
  };

  next.historySnapshot =
    operationalStatus === STATUS.ARCHIVED
      ? buildHistorySnapshot(next)
      : order.historySnapshot && typeof order.historySnapshot === "object"
        ? order.historySnapshot
        : null;

  return next;
}

function normalizeLineOrderRecord(record) {
  const raw = record?.raw_data && typeof record.raw_data === "object" ? record.raw_data : {};
  const poNumber = String(record?.po_number || raw?.poNumber || "").trim();

  return finalizeLineOrder({
    recordId: String(record?.id || raw?.recordId || "").trim(),
    id: String(raw?.id || `LINE-${poNumber || Date.now()}`),
    poNumber,
    customerName: String(record?.customer_name || raw?.customerName || "").trim(),
    contact: String(record?.contact || raw?.contact || "").trim(),
    paymentMethod: String(raw?.paymentMethod || "").trim(),
    address: String(record?.address || raw?.address || "").trim(),
    mapsUrl: String(record?.maps_url || raw?.mapsUrl || "").trim(),
    landmark: String(raw?.landmark || "").trim(),
    deliveryDate: String(record?.delivery_date || raw?.deliveryDate || "").trim(),
    deliveryTimeSlot: String(raw?.deliveryTimeSlot || "").trim(),
    items: String(record?.items_text || raw?.items || "").trim(),
    selectedProducts: cloneProductItems(record?.selected_products || raw?.selectedProducts || []),
    estimatedAmount: record?.estimated_amount ?? raw?.estimatedAmount ?? "",
    confirmedAmount: record?.confirmed_amount ?? raw?.confirmedAmount ?? "",
    chatNote: String(raw?.chatNote || "").trim(),
    status: normalizeWorkflowStatus(record?.status || raw?.status) || STATUS.LINE_RECEIVED,
    finalStatus: normalizeWorkflowStatus(raw?.finalStatus || raw?.historySnapshot?.finalStatus || ""),
    createdAt: String(record?.created_at || raw?.createdAt || "").trim(),
    updatedAt: String(record?.updated_at || raw?.updatedAt || "").trim(),
    lineReceivedAt: String(raw?.lineReceivedAt || record?.created_at || raw?.createdAt || "").trim(),
    confirmedAt: String(raw?.confirmedAt || "").trim(),
    preparedAt: String(raw?.preparedAt || raw?.readyForRouteAt || raw?.checkedAt || "").trim(),
    readyForRouteAt: String(raw?.readyForRouteAt || raw?.preparedAt || raw?.checkedAt || "").trim(),
    assignedAt: String(raw?.assignedAt || "").trim(),
    createdById: String(raw?.createdById || raw?.historySnapshot?.createdById || "").trim(),
    createdByName: String(raw?.createdByName || raw?.historySnapshot?.createdByName || "").trim(),
    confirmedById: String(raw?.confirmedById || raw?.historySnapshot?.confirmedById || "").trim(),
    confirmedByName: String(raw?.confirmedByName || raw?.historySnapshot?.confirmedByName || "").trim(),
    preparedById: String(raw?.preparedById || raw?.historySnapshot?.preparedById || "").trim(),
    preparedByName: String(raw?.preparedByName || raw?.historySnapshot?.preparedByName || "").trim(),
    assignedById: String(raw?.assignedById || raw?.historySnapshot?.assignedById || "").trim(),
    assignedByName: String(raw?.assignedByName || raw?.historySnapshot?.assignedByName || "").trim(),
    archivedById: String(raw?.archivedById || raw?.historySnapshot?.archivedById || "").trim(),
    archivedByName: String(raw?.archivedByName || raw?.historySnapshot?.archivedByName || "").trim(),
    assignedDriverId: String(raw?.assignedDriverId || "").trim(),
    selectedForDispatch: Boolean(raw?.selectedForDispatch),
    deliverySequence: raw?.deliverySequence ?? "",
    plannedDispatchDate: String(raw?.plannedDispatchDate || "").trim(),
    plannedDispatchSlot: String(raw?.plannedDispatchSlot || "").trim(),
    dispatchNote: String(raw?.dispatchNote || "").trim(),
    deliveryNote: String(raw?.deliveryNote || "").trim(),
    routeDriverName: String(raw?.routeDriverName || "").trim(),
    routeStartKm: raw?.routeStartKm ?? "",
    routeEndKm: raw?.routeEndKm ?? "",
    routeStartedAt: String(raw?.routeStartedAt || "").trim(),
    routeFinishedAt: String(raw?.routeFinishedAt || "").trim(),
    dispatchStartedAt: String(raw?.dispatchStartedAt || "").trim(),
    dispatchDeliveredAt: String(raw?.dispatchDeliveredAt || "").trim(),
    routeArchived: Boolean(raw?.routeArchived),
    routeArchivedAt: String(raw?.routeArchivedAt || raw?.archivedAt || "").trim(),
    returnReportedAt: String(raw?.returnReportedAt || raw?.historySnapshot?.returnReportedAt || "").trim(),
    returnHandledBy: String(raw?.returnHandledBy || raw?.historySnapshot?.returnHandledBy || "").trim(),
    destinationLat: raw?.destinationLat ?? "",
    destinationLng: raw?.destinationLng ?? "",
    historySnapshot:
      raw?.historySnapshot && typeof raw.historySnapshot === "object"
        ? buildHistorySnapshot({ ...raw, ...raw.historySnapshot })
        : null,
    isDeleted: Boolean(raw?.isDeleted || raw?.deletedAt),
    deletedAt: String(raw?.deletedAt || "").trim(),
    deletedById: String(raw?.deletedById || "").trim(),
    deletedByName: String(raw?.deletedByName || "").trim(),
  });
}

function isSoftDeletedLineOrder(order = {}) {
  return Boolean(order?.isDeleted || order?.deletedAt);
}

function loadState() {
  if (typeof window === "undefined") return EMPTY_STATE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;

    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users.map(normalizeUserRecord) : [],
      orders: [],
      logs: Array.isArray(parsed.logs) ? parsed.logs.map(normalizeLogRecord) : [],
      lineOrders: Array.isArray(parsed.lineOrders)
        ? parsed.lineOrders.map(normalizeLineOrderRecord).filter((item) => !isSoftDeletedLineOrder(item))
        : [],
      currentUserId: typeof parsed.currentUserId === "string" ? parsed.currentUserId : "",
    };
  } catch {
    return EMPTY_STATE;
  }
}

function sumReservedQuantities(purchaseOrders = []) {
  return purchaseOrders.reduce((acc, order) => {
    const normalizedOrder = normalizeLineOrderRecord(order);
    const operationalStatus = getOperationalStatus(normalizedOrder);
    const isFinishedOrder =
      operationalStatus === STATUS.ARCHIVED || FINAL_DELIVERY_STATUSES.includes(operationalStatus);

    if (isFinishedOrder || isSoftDeletedLineOrder(normalizedOrder)) return acc;

    const rawData = order?.raw_data && typeof order.raw_data === "object" ? order.raw_data : {};
    const selectedProducts = Array.isArray(order?.selected_products)
      ? order.selected_products
      : Array.isArray(rawData.selectedProducts)
        ? rawData.selectedProducts
        : [];

    selectedProducts.forEach((item) => {
      const key = String(item?.code || item?.id || "").trim();
      if (!key) return;
      acc[key] = (acc[key] || 0) + sanitizeQuantity(item?.quantity);
    });
    return acc;
  }, {});
}

function buildStockNote(product, quantity) {
  const requested = sanitizeQuantity(quantity);
  const availableQty = Number(product.availableQty || 0);
  if (requested <= availableQty) return "";
  return `จำนวนที่ต้องการ (${requested.toFixed(1)}) มากกว่าสต็อกที่พร้อมขาย (${availableQty.toFixed(1)})`;
}

function normalizeBatchStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function buildStockShortageNote(product, quantity) {
  const requested = sanitizeQuantity(quantity);
  const availableQty = Number(product.availableQty || 0);
  if (requested <= availableQty) return "";
  const shortageQty = Math.max(requested - availableQty, 0);
  return `ต้องการ ${requested.toFixed(1)} | พร้อมขาย ${availableQty.toFixed(1)} | ขาด ${shortageQty.toFixed(1)}`;
}

function summarizeBatchTotals(batchRows = []) {
  return batchRows.reduce(
    (acc, row) => {
      const quantity = parseNumberValue(row?.quantity_remaining);
      if (quantity <= 0) return acc;

      const status = normalizeBatchStatus(row?.status);
      acc.all += quantity;
      acc.batchCount += 1;

      if (status === "expired") {
        acc.expired += quantity;
        return acc;
      }

      acc.sellable += quantity;

      if (status === "safe") acc.safe += quantity;
      else if (status === "warning") acc.warning += quantity;
      else acc.other += quantity;

      return acc;
    },
    {
      all: 0,
      sellable: 0,
      expired: 0,
      safe: 0,
      warning: 0,
      other: 0,
      batchCount: 0,
    }
  );
}

function upsertLineOrder(list, nextOrder) {
  const exists = list.some((item) => item.id === nextOrder.id);
  const nextList = exists
    ? list.map((item) => (item.id === nextOrder.id ? nextOrder : item))
    : [nextOrder, ...list];

  return [...nextList].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt || "");
    const rightTime = Date.parse(right.updatedAt || right.createdAt || "");
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return String(left.poNumber || "").localeCompare(String(right.poNumber || ""));
  });
}

function buildOrderFromPayload(existingRecord, payload, selectedProductsLine, actor = {}) {
  const now = new Date().toISOString();
  const selectedProducts = cloneProductItems(selectedProductsLine);
  const totals = calculateSelectedTotals(selectedProducts);
  const itemsText = buildItemsText(selectedProducts, payload.items);
  const coordinates = parseGoogleMapsCoordinates(payload.mapsUrl || existingRecord?.mapsUrl || "");
  const currentStatus = existingRecord ? getOperationalStatus(existingRecord) : STATUS.LINE_RECEIVED;
  const confirmedAmount =
    existingRecord?.confirmedAmount !== "" && existingRecord?.confirmedAmount !== null && existingRecord?.confirmedAmount !== undefined
      ? existingRecord.confirmedAmount
      : currentStatus !== STATUS.LINE_RECEIVED
        ? totals.amount
        : "";

  return finalizeLineOrder({
    ...(existingRecord || {}),
    id: existingRecord?.id || `LINE-${Date.now()}`,
    poNumber: String(payload.poNumber || "").trim(),
    customerName: String(payload.customerName || "").trim(),
    contact: String(payload.contact || "").trim(),
    paymentMethod: String(payload.paymentMethod || "").trim(),
    address: String(payload.address || "").trim(),
    mapsUrl: String(payload.mapsUrl || "").trim(),
    landmark: String(payload.landmark || "").trim(),
    deliveryDate: String(payload.deliveryDate || "").trim(),
    deliveryTimeSlot: String(payload.deliveryTimeSlot || "").trim(),
    items: itemsText,
    selectedProducts,
    estimatedAmount: totals.amount,
    confirmedAmount,
    chatNote: String(payload.chatNote || "").trim(),
    status: currentStatus,
    createdAt: existingRecord?.createdAt || now,
    updatedAt: now,
    lineReceivedAt: existingRecord?.lineReceivedAt || existingRecord?.createdAt || now,
    confirmedAt: existingRecord?.confirmedAt || "",
    preparedAt: existingRecord?.preparedAt || existingRecord?.readyForRouteAt || "",
    readyForRouteAt: existingRecord?.readyForRouteAt || existingRecord?.preparedAt || "",
    assignedAt: existingRecord?.assignedAt || "",
    createdById: existingRecord?.createdById || String(actor.id || "").trim(),
    createdByName: existingRecord?.createdByName || String(actor.name || "").trim(),
    confirmedById: existingRecord?.confirmedById || "",
    confirmedByName: existingRecord?.confirmedByName || "",
    preparedById: existingRecord?.preparedById || "",
    preparedByName: existingRecord?.preparedByName || "",
    assignedById: existingRecord?.assignedById || "",
    assignedByName: existingRecord?.assignedByName || "",
    archivedById: existingRecord?.archivedById || "",
    archivedByName: existingRecord?.archivedByName || "",
    assignedDriverId: existingRecord?.assignedDriverId || "",
    selectedForDispatch: existingRecord?.selectedForDispatch || false,
    deliverySequence: existingRecord?.deliverySequence ?? "",
    plannedDispatchDate: existingRecord?.plannedDispatchDate || "",
    plannedDispatchSlot: existingRecord?.plannedDispatchSlot || "",
    dispatchNote: existingRecord?.dispatchNote || "",
    deliveryNote: existingRecord?.deliveryNote || "",
    routeDriverName: existingRecord?.routeDriverName || "",
    routeStartKm: existingRecord?.routeStartKm ?? "",
    routeEndKm: existingRecord?.routeEndKm ?? "",
    routeStartedAt: existingRecord?.routeStartedAt || "",
    routeFinishedAt: existingRecord?.routeFinishedAt || "",
    dispatchStartedAt: existingRecord?.dispatchStartedAt || "",
    dispatchDeliveredAt: existingRecord?.dispatchDeliveredAt || "",
    routeArchived: existingRecord?.routeArchived || false,
    routeArchivedAt: existingRecord?.routeArchivedAt || "",
    destinationLat: coordinates?.lat ?? existingRecord?.destinationLat ?? "",
    destinationLng: coordinates?.lng ?? existingRecord?.destinationLng ?? "",
    historySnapshot: existingRecord?.historySnapshot || null,
  });
}

function applyStatusTransition(order, nextStatus, extras = {}) {
  const now = extras.timestamp || new Date().toISOString();
  const current = finalizeLineOrder(order);

  if (nextStatus === STATUS.LINE_RECEIVED) {
    return finalizeLineOrder({
      ...current,
      status: STATUS.LINE_RECEIVED,
      confirmedAt: "",
      preparedAt: "",
      readyForRouteAt: "",
      assignedAt: "",
      confirmedById: "",
      confirmedByName: "",
      preparedById: "",
      preparedByName: "",
      assignedById: "",
      assignedByName: "",
      archivedById: "",
      archivedByName: "",
      assignedDriverId: "",
      deliverySequence: "",
      selectedForDispatch: false,
      plannedDispatchDate: "",
      plannedDispatchSlot: "",
      dispatchNote: "",
      deliveryNote: "",
      routeDriverName: "",
      routeStartKm: "",
      routeEndKm: "",
      routeStartedAt: "",
      routeFinishedAt: "",
      dispatchStartedAt: "",
      dispatchDeliveredAt: "",
      routeArchived: false,
      routeArchivedAt: "",
      finalStatus: "",
      historySnapshot: null,
      updatedAt: now,
    });
  }

  if (nextStatus === STATUS.CONFIRMED) {
    return finalizeLineOrder({
      ...current,
      status: STATUS.CONFIRMED,
      confirmedAt: current.confirmedAt || now,
      confirmedById: String(extras.actorId || current.confirmedById || "").trim(),
      confirmedByName: String(extras.actorName || current.confirmedByName || "").trim(),
      confirmedAmount:
        current.confirmedAmount === "" || current.confirmedAmount === null || current.confirmedAmount === undefined
          ? current.estimatedAmount
          : current.confirmedAmount,
      preparedAt: "",
      readyForRouteAt: "",
      assignedAt: "",
      preparedById: "",
      preparedByName: "",
      assignedById: "",
      assignedByName: "",
      assignedDriverId: "",
      selectedForDispatch: false,
      deliverySequence: "",
      plannedDispatchDate: "",
      plannedDispatchSlot: "",
      dispatchNote: "",
      deliveryNote: "",
      routeDriverName: "",
      routeStartKm: "",
      routeEndKm: "",
      routeStartedAt: "",
      routeFinishedAt: "",
      dispatchStartedAt: "",
      dispatchDeliveredAt: "",
      routeArchived: false,
      routeArchivedAt: "",
      finalStatus: "",
      historySnapshot: null,
      updatedAt: now,
    });
  }

  if (nextStatus === STATUS.PREPARED) {
    return finalizeLineOrder({
      ...current,
      status: STATUS.PREPARED,
      preparedAt: current.preparedAt || current.readyForRouteAt || now,
      readyForRouteAt: current.readyForRouteAt || current.preparedAt || now,
      preparedById: String(extras.actorId || current.preparedById || "").trim(),
      preparedByName: String(extras.actorName || current.preparedByName || "").trim(),
      assignedAt: "",
      assignedById: "",
      assignedByName: "",
      assignedDriverId: "",
      selectedForDispatch: false,
      deliverySequence: "",
      plannedDispatchDate: "",
      plannedDispatchSlot: "",
      routeDriverName: "",
      routeStartKm: "",
      routeEndKm: "",
      routeStartedAt: "",
      routeFinishedAt: "",
      dispatchStartedAt: "",
      dispatchDeliveredAt: "",
      routeArchived: false,
      routeArchivedAt: "",
      finalStatus: "",
      historySnapshot: null,
      updatedAt: now,
    });
  }

  if (nextStatus === STATUS.ASSIGNED) {
    return finalizeLineOrder({
      ...current,
      status: STATUS.ASSIGNED,
      assignedAt: current.assignedAt || now,
      assignedById: String(extras.actorId || current.assignedById || "").trim(),
      assignedByName: String(extras.actorName || current.assignedByName || "").trim(),
      selectedForDispatch: true,
      plannedDispatchDate: current.plannedDispatchDate || current.deliveryDate || "",
      updatedAt: now,
    });
  }

  if (nextStatus === STATUS.OUT_FOR_DELIVERY) {
    return finalizeLineOrder({
      ...current,
      status: STATUS.OUT_FOR_DELIVERY,
      routeStartedAt: current.routeStartedAt || extras.routeStartedAt || now,
      dispatchStartedAt: current.dispatchStartedAt || extras.dispatchStartedAt || now,
      updatedAt: now,
    });
  }

  if ([STATUS.DELIVERED, STATUS.FAILED, STATUS.RETURNED].includes(nextStatus)) {
    return finalizeLineOrder({
      ...current,
      status: nextStatus,
      finalStatus: nextStatus,
      routeStartedAt: current.routeStartedAt || extras.routeStartedAt || now,
      dispatchStartedAt: current.dispatchStartedAt || extras.dispatchStartedAt || now,
      dispatchDeliveredAt: extras.dispatchDeliveredAt || current.dispatchDeliveredAt || now,
      updatedAt: now,
    });
  }

  if (nextStatus === STATUS.ARCHIVED) {
    return finalizeLineOrder({
      ...current,
      status: STATUS.ARCHIVED,
      finalStatus: current.finalStatus || getCompletedStatus(current),
      archivedById: String(extras.actorId || current.archivedById || "").trim(),
      archivedByName: String(extras.actorName || current.archivedByName || "").trim(),
      routeFinishedAt: extras.routeFinishedAt || current.routeFinishedAt || now,
      routeArchivedAt: extras.routeArchivedAt || current.routeArchivedAt || now,
      routeArchived: true,
      updatedAt: now,
    });
  }

  return finalizeLineOrder({
    ...current,
    updatedAt: now,
  });
}

export function AppStateProvider({ children }) {
  const [state, setState] = useState(EMPTY_STATE);
  const [isReady, setIsReady] = useState(false);
  const [catalog, setCatalog] = useState({ lineResults: [], confirmResults: [], pricingResults: [] });
  const [selectedProducts, setSelectedProducts] = useState({ line: [], confirm: [] });

  const supabase = useMemo(() => {
    if (!APP_CONFIG.supabaseUrl || !APP_CONFIG.supabasePublishableKey) return null;
    try {
      return createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabasePublishableKey);
    } catch {
      return null;
    }
  }, []);

  const stockSupabase = useMemo(() => {
    if (!APP_CONFIG.stockSupabaseUrl || !APP_CONFIG.stockSupabasePublishableKey) return null;
    try {
      return createClient(APP_CONFIG.stockSupabaseUrl, APP_CONFIG.stockSupabasePublishableKey);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setState(loadState());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady || typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        users: state.users,
        logs: state.logs,
        lineOrders: state.lineOrders,
        currentUserId: state.currentUserId,
      })
    );
  }, [isReady, state]);

  useEffect(() => {
    if (!isReady) return;
    if (!state.users.length) return;
    if (!state.currentUserId) return;
    if (state.users.some((item) => item.id === state.currentUserId)) return;

    setState((current) => ({
      ...current,
      currentUserId: "",
    }));
  }, [isReady, state.currentUserId, state.users]);

  useEffect(() => {
    if (!isReady || !supabase || !APP_CONFIG.userTable) return;

    let active = true;

    const loadUsersFromSupabase = async () => {
      const { data, error } = await supabase.from(APP_CONFIG.userTable).select("*").order("id", { ascending: true });
      if (!active || error || !Array.isArray(data)) return;

      const nextUsers = data.map(normalizeUserRecord).filter((item) => item.name || item.username);
      if (!nextUsers.length) return;

      setState((current) => ({
        ...current,
        users: nextUsers,
        currentUserId:
          current.currentUserId && nextUsers.some((item) => item.id === current.currentUserId)
            ? current.currentUserId
            : "",
      }));
    };

    loadUsersFromSupabase();

    return () => {
      active = false;
    };
  }, [isReady, supabase]);

  useEffect(() => {
    if (!isReady || !supabase || !APP_CONFIG.poTable) return;

    let active = true;

    const loadPurchaseOrdersFromSupabase = async () => {
      const { data, error } = await supabase
        .from(APP_CONFIG.poTable)
        .select("*")
        .order("updated_at", { ascending: false });

      if (!active || error || !Array.isArray(data)) return;

      const nextLineOrders = data
        .map(normalizeLineOrderRecord)
        .filter((item) => item.poNumber && !isSoftDeletedLineOrder(item));
      setState((current) => ({
        ...current,
        lineOrders: nextLineOrders,
      }));
    };

    loadPurchaseOrdersFromSupabase();

    return () => {
      active = false;
    };
  }, [isReady, supabase]);

  const refreshLineOrdersFromSupabase = async () => {
    if (!supabase || !APP_CONFIG.poTable) {
      return { ok: false, message: "ยังไม่ได้เชื่อมต่อ Supabase" };
    }

    const { data, error } = await supabase
      .from(APP_CONFIG.poTable)
      .select("*")
      .order("updated_at", { ascending: false });

    if (error || !Array.isArray(data)) {
      return { ok: false, message: error?.message || "ดึงข้อมูล PO จาก Supabase ไม่สำเร็จ" };
    }

    const nextLineOrders = data
      .map(normalizeLineOrderRecord)
      .filter((item) => item.poNumber && !isSoftDeletedLineOrder(item));

    setState((current) => ({
      ...current,
      lineOrders: nextLineOrders,
    }));

    return { ok: true, count: nextLineOrders.length };
  };

  const currentUser = useMemo(
    () => state.users.find((item) => item.id === state.currentUserId) || null,
    [state.currentUserId, state.users]
  );

  const drivers = useMemo(
    () => state.users.filter((user) => user.role === ROLES.DRIVER),
    [state.users]
  );

  const switchCurrentUser = (userId) => {
    setState((current) => ({
      ...current,
      currentUserId: userId || "",
    }));
  };

  const login = (username, password) => {
    const normalizedUsername = String(username || "")
      .trim()
      .toLowerCase();
    const normalizedPassword = String(password || "").trim();

    if (!normalizedUsername || !normalizedPassword) {
      return { ok: false, message: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" };
    }

    const matchedUser = state.users.find(
      (user) =>
        String(user?.username || "")
          .trim()
          .toLowerCase() === normalizedUsername &&
        String(user?.password || "").trim() === normalizedPassword
    );

    if (!matchedUser) {
      return { ok: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
    }

    setState((current) => ({
      ...current,
      currentUserId: matchedUser.id,
    }));

    return { ok: true, user: matchedUser };
  };

  const logout = () => {
    setState((current) => ({
      ...current,
      currentUserId: "",
    }));
  };

  const saveLogToSupabase = async (payload) => {
    if (!supabase || !APP_CONFIG.logTable) {
      return { ok: false, message: "ยังไม่ได้ตั้งค่าตาราง app_logs" };
    }

    try {
      const timestamp = String(payload.timestamp || new Date().toISOString()).trim();
      const { data, error } = await supabase
        .from(APP_CONFIG.logTable)
        .insert({
          order_id: payload.orderId || "",
          driver_id: payload.driverId || "",
          status: payload.status || "",
          note: payload.note || "",
          acted_by_id: payload.actedById || "",
          acted_by_name: payload.actedByName || "",
          acted_by_role: payload.actedByRole || "",
          timestamp,
          created_at: payload.createdAt || timestamp,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) return { ok: false, message: error.message };
      return { ok: true, log: normalizeLogRecord(data || payload) };
    } catch (error) {
      return { ok: false, message: error?.message || "บันทึก log ไม่สำเร็จ" };
    }
  };

  const addLog = async (orderId, driverId, status, note) => {
    const localLog = normalizeLogRecord({
      id: `LOG-${Date.now()}`,
      orderId,
      driverId,
      status,
      note,
      actedById: currentUser?.id || "",
      actedByName: currentUser?.name || "",
      actedByRole: currentUser?.role || "",
      timestamp: new Date().toISOString(),
    });
    const saveResult = await saveLogToSupabase(localLog);
    const nextLog = saveResult.ok && saveResult.log ? saveResult.log : localLog;

    setState((current) => ({
      ...current,
      logs: [nextLog, ...current.logs.filter((item) => item.id !== nextLog.id)],
    }));

    return { ok: true, log: nextLog, saveResult };
  };

  useEffect(() => {
    if (!isReady || !supabase || !APP_CONFIG.logTable) return;

    let active = true;

    const loadLogsFromSupabase = async () => {
      const { data, error } = await supabase
        .from(APP_CONFIG.logTable)
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(2000);

      if (!active || error || !Array.isArray(data)) return;

      setState((current) => ({
        ...current,
        logs: data.map(normalizeLogRecord),
      }));
    };

    loadLogsFromSupabase();

    return () => {
      active = false;
    };
  }, [isReady, supabase]);

  const savePoToSupabase = async (payload) => {
    if (!supabase || !APP_CONFIG.poTable) {
      return { ok: false, message: "ยังไม่ได้ตั้งค่าตาราง purchase_orders" };
    }

    try {
      const rawData =
        payload.rawData && typeof payload.rawData === "object"
          ? {
              ...payload.rawData,
              recordId: String(payload.recordId || payload.rawData.recordId || "").trim(),
            }
          : {};
      const { data, error } = await supabase
        .from(APP_CONFIG.poTable)
        .upsert(
          {
            po_number: payload.poNumber || "",
            customer_name: payload.customerName || "",
            contact: payload.contact || "",
            items_text: payload.itemsText || "",
            estimated_amount: payload.estimatedAmount || null,
            confirmed_amount: payload.confirmedAmount || null,
            delivery_date: payload.deliveryDate || null,
            address: payload.address || "",
            maps_url: payload.mapsUrl || "",
            area: payload.area || "",
            status: payload.status || "",
            source: payload.source || "",
            selected_products: payload.selectedProducts || [],
            raw_data: rawData,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "po_number" }
        )
        .select("id, po_number")
        .maybeSingle();
      if (error) return { ok: false, message: error.message };
      return { ok: true, data };
    } catch (error) {
      return { ok: false, message: error?.message || "save failed" };
    }
  };

  const deletePoFromSupabase = async (poNumber, recordId = "") => {
    if (!supabase || !APP_CONFIG.poTable) {
      return { ok: false, message: "ยังไม่ได้ตั้งค่าตาราง purchase_orders" };
    }

    try {
      const primaryDelete = await supabase
        .from(APP_CONFIG.poTable)
        .delete()
        .eq("po_number", poNumber)
        .select("id, po_number");

      if (primaryDelete.error) return { ok: false, message: primaryDelete.error.message };
      if (Array.isArray(primaryDelete.data) && primaryDelete.data.length > 0) {
        return { ok: true, data: primaryDelete.data };
      }

      if (recordId) {
        const fallbackDelete = await supabase
          .from(APP_CONFIG.poTable)
          .delete()
          .eq("id", recordId)
          .select("id, po_number");

        if (fallbackDelete.error) return { ok: false, message: fallbackDelete.error.message };
        if (Array.isArray(fallbackDelete.data) && fallbackDelete.data.length > 0) {
          return { ok: true, data: fallbackDelete.data };
        }
      }

      return { ok: false, message: "ไม่พบ PO นี้ในตาราง purchase_orders หรือไม่มีสิทธิ์ลบข้อมูล" };
    } catch (error) {
      return { ok: false, message: error?.message || "delete failed" };
    }
  };

  const softDeletePoInSupabase = async (order) => {
    const deletedAt = new Date().toISOString();
    const nextRecord = finalizeLineOrder({
      ...order,
      isDeleted: true,
      deletedAt,
      deletedById: String(currentUser?.id || "").trim(),
      deletedByName: String(currentUser?.name || "").trim(),
      updatedAt: deletedAt,
    });

    const saveResult = await savePoToSupabase({
      recordId: nextRecord.recordId,
      poNumber: nextRecord.poNumber,
      customerName: nextRecord.customerName,
      contact: nextRecord.contact,
      itemsText: nextRecord.items,
      selectedProducts: nextRecord.selectedProducts,
      estimatedAmount: nextRecord.estimatedAmount,
      confirmedAmount: nextRecord.confirmedAmount,
      deliveryDate: nextRecord.deliveryDate,
      address: nextRecord.address,
      mapsUrl: nextRecord.mapsUrl,
      area: nextRecord.area || "",
      status: nextRecord.status,
      source: "deleted",
      rawData: nextRecord,
    });

    if (!saveResult.ok) {
      return {
        ok: false,
        message: saveResult.message || "ไม่สามารถซ่อน PO ที่ลบแล้วลง Supabase ได้",
        saveResult,
      };
    }

    return {
      ok: true,
      mode: "soft_delete",
      record: withPersistedRecordId(nextRecord, saveResult),
      saveResult,
    };
  };

  const clearSupabaseTable = async (tableName, keyColumn, emptyMessage) => {
    if (!tableName) {
      return { ok: false, message: emptyMessage || "ยังไม่ได้ตั้งค่าตารางที่ต้องการล้างข้อมูล" };
    }

    if (!supabase) {
      return { ok: false, message: "ยังไม่ได้เชื่อมต่อ Supabase" };
    }

    try {
      const { error } = await supabase.from(tableName).delete().not(keyColumn, "is", null);
      if (error) return { ok: false, message: error.message };
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || "ล้างข้อมูล Supabase ไม่สำเร็จ" };
    }
  };

  const resetSavedData = async (options = {}) => {
    if (state.users.length && currentUser?.role !== ROLES.MANAGER) {
      return { ok: false, message: "เฉพาะผู้จัดการเท่านั้นที่รีเซ็ตข้อมูลระบบได้" };
    }

    const includePrices = Boolean(options.includePrices);
    const poResult = await clearSupabaseTable(
      APP_CONFIG.poTable,
      "po_number",
      "ยังไม่ได้ตั้งค่าตาราง purchase_orders"
    );

    if (!poResult.ok) {
      return {
        ok: false,
        message: `ล้างข้อมูล PO ใน Supabase ไม่สำเร็จ: ${poResult.message}`,
        poResult,
      };
    }

    const logResult = APP_CONFIG.logTable
      ? await clearSupabaseTable(APP_CONFIG.logTable, "id", "ยังไม่ได้ตั้งค่าตาราง app_logs")
      : null;

    const priceResult = includePrices
      ? await clearSupabaseTable(
          APP_CONFIG.priceTable,
          "product_code",
          "ยังไม่ได้ตั้งค่าตาราง product_prices"
        )
      : null;

    setState((current) => ({
      ...EMPTY_STATE,
      users: current.users,
      logs: [],
      currentUserId:
        current.currentUserId && current.users.some((item) => item.id === current.currentUserId)
          ? current.currentUserId
          : "",
    }));
    setCatalog({ lineResults: [], confirmResults: [], pricingResults: [] });
    setSelectedProducts({ line: [], confirm: [] });

    return {
      ok: true,
      warning: Boolean(includePrices && priceResult && !priceResult.ok),
      message:
        includePrices && priceResult && !priceResult.ok
          ? `ล้างข้อมูลปฏิบัติการแล้ว แต่ล้างราคาที่บันทึกไว้ใน Supabase ไม่สำเร็จ: ${priceResult.message}`
          : logResult && !logResult.ok
            ? `ล้างข้อมูล PO แล้ว แต่ล้างประวัติกิจกรรมใน Supabase ไม่สำเร็จ: ${logResult.message}`
          : "ล้างข้อมูลที่บันทึกไว้ทั้งหมดแล้ว โดยเก็บบัญชีพนักงานไว้ตามเดิม",
      poResult,
      logResult,
      priceResult,
    };
  };

  const persistLineOrder = async (order, source = "line_orders") => {
    return savePoToSupabase({
      recordId: order.recordId,
      poNumber: order.poNumber,
      customerName: order.customerName,
      contact: order.contact,
      itemsText: order.items,
      selectedProducts: order.selectedProducts,
      estimatedAmount: order.estimatedAmount,
      confirmedAmount: order.confirmedAmount,
      deliveryDate: order.deliveryDate,
      address: order.address,
      mapsUrl: order.mapsUrl,
      area: order.area || "",
      status: order.status,
      source,
      rawData: order,
    });
  };

  const withPersistedRecordId = (order, saveResult) => {
    if (!saveResult?.ok || !saveResult.data?.id) return order;
    return finalizeLineOrder({
      ...order,
      recordId: String(saveResult.data.id).trim(),
    });
  };

  const fetchMergedProducts = async () => {
    if (!stockSupabase || !APP_CONFIG.stockTable) {
      return { ok: false, message: "Stock source is not configured.", items: [] };
    }

    try {
      const [stockQuery, batchQuery, priceQuery, poQuery] = await Promise.all([
        stockSupabase.from(APP_CONFIG.stockTable).select("*").limit(500),
        stockSupabase
          .from(APP_CONFIG.batchTable)
          .select("product_id,quantity_remaining,status,expiry_date,batch_no")
          .limit(5000),
        supabase && APP_CONFIG.priceTable
          ? supabase.from(APP_CONFIG.priceTable).select("*").limit(500)
          : Promise.resolve({ data: [], error: null }),
        supabase && APP_CONFIG.poTable
          ? supabase.from(APP_CONFIG.poTable).select("id,po_number,status,raw_data,selected_products").limit(1000)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (stockQuery.error) return { ok: false, message: stockQuery.error.message, items: [] };
      if (batchQuery.error) return { ok: false, message: batchQuery.error.message, items: [] };

      const priceMap = (priceQuery.data || []).map(normalizePriceRecord).reduce((acc, item) => {
        if (item.code) acc[item.code] = item;
        return acc;
      }, {});
      const reservedMap = sumReservedQuantities(priceQuery.error ? [] : poQuery.data || []);
      const batchRowsByProduct = (batchQuery.data || []).reduce((acc, row) => {
        const productId = String(row?.product_id || "").trim();
        if (!productId) return acc;
        if (!acc[productId]) acc[productId] = [];
        acc[productId].push(row);
        return acc;
      }, {});

      const items = (stockQuery.data || [])
        .map(normalizeProduct)
        .filter((item) => item.name || item.code)
        .map((item) => {
          const priceInfo = priceMap[item.code] || {};
          const batchSummary = summarizeBatchTotals(batchRowsByProduct[item.id] || []);
          const stockOnHand = Number(batchSummary.sellable || 0);
          const reservedQty = Number(reservedMap[item.code] || 0);
          const availableQty = stockOnHand - reservedQty;
          const hasConfiguredPrice = Object.prototype.hasOwnProperty.call(priceInfo, "price");
          return {
            ...item,
            price: hasConfiguredPrice ? Number(priceInfo.price || 0) : 0,
            priceNote: String(priceInfo.note || ""),
            stockOnHand,
            reservedQty,
            availableQty,
            batchSummary,
          };
        });

      return { ok: true, items };
    } catch (error) {
      return { ok: false, message: error?.message || "โหลดข้อมูลไม่สำเร็จ", items: [] };
    }
  };

  const searchProducts = async (context, query) => {
    const response = await fetchMergedProducts();
    if (!response.ok) return { ok: false, message: response.message || "ไม่สามารถโหลดข้อมูลสินค้าได้" };

    const needle = String(query || "").trim().toLowerCase();
    const filtered = response.items
      .filter((item) => {
        if (!needle) return true;
        return [item.code, item.name].some((value) => String(value || "").toLowerCase().includes(needle));
      })
      .slice(0, 20);

    const targetKey =
      context === "confirm" ? "confirmResults" : context === "pricing" ? "pricingResults" : "lineResults";

    setCatalog((current) => ({
      ...current,
      [targetKey]: filtered,
    }));

    return { ok: true };
  };

  const addSelectedProduct = (context, product) => {
    const key = context === "confirm" ? "confirm" : "line";

    setSelectedProducts((current) => {
      const existingIndex = current[key].findIndex((item) => item.code === product.code || item.id === product.id);

      if (existingIndex >= 0) {
        const updatedList = current[key].map((item, index) => {
          if (index !== existingIndex) return item;
          const nextQuantity = sanitizeQuantity(Number(item.quantity || 0) + 1);
          const updatedItem = {
            ...item,
            quantity: nextQuantity,
            stockOnHand: Number(product.stockOnHand || item.stockOnHand || 0),
            reservedQty: Number(product.reservedQty || item.reservedQty || 0),
            availableQty: Number(product.availableQty || item.availableQty || 0),
            price: Number(product.price || item.price || 0),
            priceNote: String(product.priceNote || item.priceNote || ""),
          };
          return {
            ...updatedItem,
            stockNote: buildStockShortageNote(updatedItem, nextQuantity),
          };
        });

        return { ...current, [key]: updatedList };
      }

      return {
        ...current,
        [key]: [
          ...current[key],
          {
            id: product.id || product.code,
            code: product.code,
            name: product.name,
            price: Number(product.price || 0),
            quantity: 1,
            stockOnHand: Number(product.stockOnHand || 0),
            reservedQty: Number(product.reservedQty || 0),
            availableQty: Number(product.availableQty || 0),
            stockNote: buildStockShortageNote(product, 1),
            priceNote: String(product.priceNote || ""),
          },
        ],
      };
    });
  };

  const removeSelectedProduct = (context, productId) => {
    const key = context === "confirm" ? "confirm" : "line";
    setSelectedProducts((current) => ({
      ...current,
      [key]: current[key].filter((item) => item.id !== productId && item.code !== productId),
    }));
  };

  const setProductQuantity = (context, productId, quantity) => {
    const key = context === "confirm" ? "confirm" : "line";
    const nextQuantity = sanitizeQuantity(quantity);

    setSelectedProducts((current) => ({
      ...current,
      [key]: current[key].map((item) =>
        item.id === productId || item.code === productId
          ? {
              ...item,
              quantity: nextQuantity,
              stockNote: buildStockShortageNote(item, nextQuantity),
            }
          : item
      ),
    }));
  };

  const syncConfirmProductsFromPo = (poNumber) => {
    const item = state.lineOrders.find((entry) => entry.poNumber === poNumber);
    if (!item) return null;
    setSelectedProducts((current) => ({
      ...current,
      confirm: cloneProductItems(item.selectedProducts || []),
    }));
    return item;
  };

  const syncLineProductsFromPo = (poNumber) => {
    const item = state.lineOrders.find((entry) => entry.poNumber === poNumber);
    if (!item) return null;
    setSelectedProducts((current) => ({
      ...current,
      line: cloneProductItems(item.selectedProducts || []),
    }));
    return item;
  };

  const saveProductPrice = async (payload) => {
    if (!supabase || !APP_CONFIG.priceTable) {
      return { ok: false, message: "ยังไม่ได้ตั้งค่าตาราง product_prices" };
    }

    try {
      const record = {
        product_code: payload.code || "",
        product_name: payload.name || "",
        selling_price: Number(payload.price || 0),
        note: payload.note || "",
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from(APP_CONFIG.priceTable).upsert(record, {
        onConflict: "product_code",
      });
      if (error) return { ok: false, message: error.message };
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || "บันทึกราคาไม่สำเร็จ" };
    }
  };

  const saveUserToSupabase = async (payload) => {
    if (!supabase || !APP_CONFIG.userTable) {
      return { ok: false, message: "ยังไม่ได้ตั้งค่าตารางผู้ใช้งาน" };
    }

    try {
      const normalizedPayload = normalizeUserRecord(payload);
      const record = {
        username: normalizedPayload.username || "",
        password: normalizedPayload.password || "",
        full_name: normalizedPayload.name || "",
        role: normalizedPayload.role || ROLES.SALES,
        department: normalizedPayload.department || normalizedPayload.role || ROLES.SALES,
        employee_code: normalizedPayload.employeeCode || "",
        position: normalizedPayload.position || "",
        email: normalizedPayload.email || "",
        phone: normalizedPayload.phone || "",
        area: normalizedPayload.area || "",
        vehicle_type: normalizedPayload.vehicleType || "",
        max_orders: normalizedPayload.maxOrders ? Math.floor(Number(normalizedPayload.maxOrders)) : null,
        note: normalizedPayload.note || "",
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from(APP_CONFIG.userTable)
        .upsert(record, { onConflict: "username" })
        .select("*")
        .single();

      if (error) return { ok: false, message: error.message };
      return { ok: true, user: normalizeUserRecord({ ...normalizedPayload, ...(data || record) }) };
    } catch (error) {
      return { ok: false, message: error?.message || "บันทึกผู้ใช้งานไม่สำเร็จ" };
    }
  };

  const submitLineOrder = async (payload) => {
    const requestedPoNumber = String(payload.poNumber || "").trim();
    const existingRecord = state.lineOrders.find((item) => item.id === payload.editingId);
    const duplicatePo = state.lineOrders.find(
      (item) => String(item.poNumber || "").trim() === requestedPoNumber && String(item.id || "") !== String(payload.editingId || "")
    );
    const poNumber = existingRecord
      ? existingRecord.poNumber
      : !requestedPoNumber || duplicatePo
        ? generatePoNumber(state.lineOrders)
        : requestedPoNumber;

    if (existingRecord && !canEditOrder(existingRecord, currentUser?.role || ROLES.SALES)) {
      return {
        ok: false,
        message: "PO นี้อยู่ลึกในขั้นตอนงานแล้ว จึงแก้ไขจากหน้ารับออเดอร์ไม่ได้",
      };
    }

    const validation = validateLineOrderDraft(
      {
        ...payload,
        poNumber,
        selectedProducts: selectedProducts.line,
      },
      {
        existingOrders: state.lineOrders,
      }
    );

    if (validation.errors.length) {
      return {
        ok: false,
        message: validation.errors[0].message,
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }

    const record = buildOrderFromPayload(
      existingRecord,
      { ...payload, poNumber },
      selectedProducts.line,
      {
        id: currentUser?.id,
        name: currentUser?.name,
      }
    );

    const saveResult = await persistLineOrder(record);
    if (!saveResult.ok) {
      return {
        ok: false,
        message: saveResult.message || "ไม่สามารถบันทึก PO ไปยัง Supabase ได้",
        saveResult,
        warnings: validation.warnings,
      };
    }

    const persistedRecord = withPersistedRecordId(record, saveResult);

    setState((current) => ({
      ...current,
      lineOrders: upsertLineOrder(current.lineOrders, persistedRecord),
    }));

    await addLog(
      persistedRecord.poNumber,
      "",
      persistedRecord.status,
      existingRecord ? "อัปเดต PO จากหน้ารับออเดอร์" : "รับออเดอร์จาก Line"
    );

    setSelectedProducts((current) => ({ ...current, line: [] }));
    setCatalog((current) => ({ ...current, lineResults: [] }));

    return { ok: true, record: persistedRecord, saveResult, warnings: validation.warnings };
  };

  const deleteLineOrder = async (poNumber) => {
    const order = state.lineOrders.find((item) => item.poNumber === poNumber);
    if (!order) return { ok: false, message: "ไม่พบ PO นี้ในระบบ" };
    if (!canDeleteOrder(order, currentUser?.role)) {
      return { ok: false, message: "PO นี้ไม่สามารถลบได้แล้วในขั้นตอนงานปัจจุบัน" };
    }

    let deleteResult = await deletePoFromSupabase(poNumber, order.recordId);
    if (!deleteResult.ok) {
      const fallbackResult = await softDeletePoInSupabase(order);
      if (!fallbackResult.ok) {
        return {
          ok: false,
          message: fallbackResult.message || deleteResult.message || "ไม่สามารถลบ PO นี้ได้",
          deleteResult,
          fallbackResult,
        };
      }
      deleteResult = fallbackResult;
    }

    setState((current) => ({
      ...current,
      lineOrders: current.lineOrders.filter((item) => item.poNumber !== poNumber),
      logs: current.logs.filter((item) => item.orderId !== poNumber),
    }));

    await addLog(poNumber, "", order.status, "ลบ PO ออกจากขั้นตอนงาน");
    return deleteResult;
  };

  const updateLineOrderStatus = async (poNumber, nextStatus) => {
    const order = state.lineOrders.find((item) => item.poNumber === poNumber);
    if (!order) return { ok: false, message: "ไม่พบ PO นี้ในระบบ" };

    const error = getSafeTransitionError(order, nextStatus, currentUser?.role, {
      actorId: currentUser?.id,
      assignedDriverId: order.assignedDriverId,
      routeStartedAt: order.routeStartedAt,
    });
    if (error) return { ok: false, message: error };

    const nextRecord = applyStatusTransition(order, normalizeWorkflowStatus(nextStatus), {
      timestamp: new Date().toISOString(),
      actorId: currentUser?.id,
      actorName: currentUser?.name,
    });

    const saveResult = await persistLineOrder(nextRecord);
    if (!saveResult.ok) {
      return { ok: false, message: saveResult.message || "ไม่สามารถอัปเดตสถานะไปยัง Supabase ได้", saveResult };
    }

    const persistedRecord = withPersistedRecordId(nextRecord, saveResult);

    setState((current) => ({
      ...current,
      lineOrders: upsertLineOrder(current.lineOrders, persistedRecord),
    }));

    await addLog(
      persistedRecord.poNumber,
      persistedRecord.assignedDriverId,
      persistedRecord.status,
      `เปลี่ยนสถานะเป็น ${persistedRecord.status}`
    );
    return { ok: true, record: persistedRecord, saveResult };
  };

  const updateLineOrderDispatch = async (poNumber, payload = {}) => {
    const order = state.lineOrders.find((item) => item.poNumber === poNumber);
    if (!order) return { ok: false, message: "ไม่พบ PO นี้ในระบบ" };

    const now = new Date().toISOString();
    const nextDriverId =
      payload.assignedDriverId !== undefined ? String(payload.assignedDriverId || "").trim() : order.assignedDriverId;
    const requestedStatus = normalizeWorkflowStatus(payload.status || payload.dispatchStatus || "");
    let nextStatus = requestedStatus || getOperationalStatus(order);

    if (payload.routeArchived) {
      nextStatus = STATUS.ARCHIVED;
    } else if (!requestedStatus && payload.assignedDriverId !== undefined) {
      nextStatus = nextDriverId ? STATUS.ASSIGNED : STATUS.PREPARED;
    }

    const merged = finalizeLineOrder({
      ...order,
      assignedDriverId: nextDriverId,
      deliverySequence:
        payload.deliverySequence !== undefined ? String(payload.deliverySequence || "").trim() : order.deliverySequence,
      plannedDispatchDate:
        payload.plannedDispatchDate !== undefined
          ? String(payload.plannedDispatchDate || "").trim()
          : order.plannedDispatchDate,
      plannedDispatchSlot:
        payload.plannedDispatchSlot !== undefined
          ? String(payload.plannedDispatchSlot || "").trim()
          : order.plannedDispatchSlot,
      dispatchNote:
        payload.dispatchNote !== undefined ? String(payload.dispatchNote || "").trim() : order.dispatchNote,
      deliveryNote:
        payload.deliveryNote !== undefined ? String(payload.deliveryNote || "").trim() : order.deliveryNote,
      routeDriverName:
        payload.routeDriverName !== undefined ? String(payload.routeDriverName || "").trim() : order.routeDriverName,
      routeStartKm: payload.routeStartKm !== undefined ? payload.routeStartKm : order.routeStartKm,
      routeEndKm: payload.routeEndKm !== undefined ? payload.routeEndKm : order.routeEndKm,
      routeStartedAt:
        payload.routeStartedAt !== undefined ? String(payload.routeStartedAt || "").trim() : order.routeStartedAt,
      routeFinishedAt:
        payload.routeFinishedAt !== undefined ? String(payload.routeFinishedAt || "").trim() : order.routeFinishedAt,
      dispatchStartedAt:
        payload.dispatchStartedAt !== undefined
          ? String(payload.dispatchStartedAt || "").trim()
          : order.dispatchStartedAt,
      dispatchDeliveredAt:
        payload.dispatchDeliveredAt !== undefined
          ? String(payload.dispatchDeliveredAt || "").trim()
          : order.dispatchDeliveredAt,
      routeArchived:
        payload.routeArchived !== undefined ? Boolean(payload.routeArchived) : order.routeArchived,
      routeArchivedAt:
        payload.routeArchivedAt !== undefined
          ? String(payload.routeArchivedAt || "").trim()
          : order.routeArchivedAt,
      finalStatus:
        payload.finalStatus !== undefined ? normalizeWorkflowStatus(payload.finalStatus) : order.finalStatus,
      dispatchStatus:
        payload.dispatchStatus !== undefined ? normalizeWorkflowStatus(payload.dispatchStatus) : order.dispatchStatus,
      returnReportedAt:
        payload.returnReportedAt !== undefined ? String(payload.returnReportedAt || "").trim() : order.returnReportedAt,
      returnHandledBy:
        payload.returnHandledBy !== undefined ? String(payload.returnHandledBy || "").trim() : order.returnHandledBy,
      selectedForDispatch:
        payload.selectedForDispatch !== undefined ? Boolean(payload.selectedForDispatch) : order.selectedForDispatch,
      status: requestedStatus || order.status,
      updatedAt: now,
    });

    const error = nextStatus
      ? getSafeTransitionError(order, nextStatus, currentUser?.role, {
          actorId: currentUser?.id,
          assignedDriverId: merged.assignedDriverId,
          routeStartedAt: merged.routeStartedAt,
          allowArchive: payload.routeArchived || (payload.routeFinishedAt && canArchiveOrder(merged)),
        })
      : "";
    if (error) return { ok: false, message: error };

    let nextRecord =
      nextStatus && nextStatus !== getOperationalStatus(order)
        ? applyStatusTransition(merged, nextStatus, {
            timestamp: now,
            actorId: currentUser?.id,
            actorName: currentUser?.name,
            routeStartedAt: merged.routeStartedAt,
            routeFinishedAt: merged.routeFinishedAt,
            routeArchivedAt: merged.routeArchivedAt || merged.routeFinishedAt || now,
            dispatchStartedAt: merged.dispatchStartedAt,
            dispatchDeliveredAt: merged.dispatchDeliveredAt,
          })
        : finalizeLineOrder(merged);

    if (payload.routeFinishedAt && !payload.routeArchived) {
      nextRecord = finalizeLineOrder({
        ...nextRecord,
        routeFinishedAt: String(payload.routeFinishedAt).trim(),
      });
    }

    if (payload.routeArchived && !canArchiveOrder(nextRecord) && getOperationalStatus(nextRecord) !== STATUS.ARCHIVED) {
      return { ok: false, message: "เก็บเข้าประวัติได้เฉพาะงานที่ปิดผลจัดส่งครบแล้วเท่านั้น" };
    }

    const saveResult = await persistLineOrder(nextRecord);
    if (!saveResult.ok) {
      return { ok: false, message: saveResult.message || "ไม่สามารถอัปเดตข้อมูลการจัดส่งไปยัง Supabase ได้", saveResult };
    }

    const persistedRecord = withPersistedRecordId(nextRecord, saveResult);

    setState((current) => ({
      ...current,
      lineOrders: upsertLineOrder(current.lineOrders, persistedRecord),
    }));

    await addLog(
      persistedRecord.poNumber,
      persistedRecord.assignedDriverId,
      persistedRecord.status,
      "อัปเดตข้อมูลการจัดส่ง"
    );
    return { ok: true, record: persistedRecord, saveResult };
  };

  const archiveLineOrdersByDate = async (deliveryDate) => {
    if (!deliveryDate) {
      return { ok: false, message: "กรุณาเลือกวันที่จัดส่งก่อนย้ายเข้าประวัติ" };
    }

    const targets = state.lineOrders.filter(
      (item) => item.deliveryDate === deliveryDate && !item.routeArchived && canArchiveOrder(item)
    );

    if (!targets.length) {
      return { ok: false, message: "ยังไม่มีงานที่ปิดผลจัดส่งครบและพร้อมย้ายเข้าประวัติในวันที่เลือก" };
    }

    const failures = [];

    for (const item of targets) {
      const result = await updateLineOrderDispatch(item.poNumber, {
        routeFinishedAt: item.routeFinishedAt || new Date().toISOString(),
        routeArchived: true,
      });

      if (!result.ok) {
        failures.push({
          poNumber: item.poNumber,
          message: result.message || "archive failed",
        });
      }
    }

    if (failures.length) {
      return {
        ok: false,
        message: `ย้ายเข้าประวัติไม่ครบ ${failures.length} รายการ: ${failures[0].poNumber} - ${failures[0].message}`,
        count: targets.length - failures.length,
        failures,
      };
    }

    return { ok: true, count: targets.length };
  };

  const markHistoryOrderReturned = async (poNumber, reason = "") => {
    const order = state.lineOrders.find((item) => item.poNumber === poNumber);
    if (!order) return { ok: false, message: "ไม่พบ PO นี้ในระบบ" };
    if (![ROLES.MANAGER, ROLES.SALES].includes(currentUser?.role)) {
      return { ok: false, message: "เฉพาะผู้จัดการหรือฝ่ายขายเท่านั้นที่บันทึกคืนสินค้าจากประวัติได้" };
    }
    if (!order.routeArchived) {
      return { ok: false, message: "คืนสินค้าจากหน้านี้ได้เฉพาะรายการที่ปิดรอบและเข้าไปอยู่ในประวัติแล้วเท่านั้น" };
    }

    const completedStatus = getCompletedStatus(order);
    if (completedStatus === STATUS.RETURNED) {
      return { ok: false, message: "รายการนี้ถูกบันทึกเป็นคืนสินค้าไปแล้ว" };
    }
    if (completedStatus !== STATUS.DELIVERED) {
      return { ok: false, message: "ปุ่มนี้ใช้กับรายการที่ส่งสำเร็จแล้วเท่านั้น" };
    }

    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) {
      return { ok: false, message: "กรุณาระบุเหตุผลการคืนสินค้า" };
    }

    const now = new Date().toISOString();
    const nextNote = String(order.deliveryNote || "").trim();
    const stampedReason = `คืนสินค้าจากประวัติ: ${trimmedReason}`;
    const mergedDeliveryNote = nextNote ? `${nextNote}\n${stampedReason}` : stampedReason;

    const nextRecord = finalizeLineOrder({
      ...order,
      status: STATUS.ARCHIVED,
      finalStatus: STATUS.RETURNED,
      dispatchStatus: STATUS.RETURNED,
      deliveryNote: mergedDeliveryNote,
      returnReportedAt: now,
      returnHandledBy: String(currentUser?.name || "").trim(),
      updatedAt: now,
    });

    const saveResult = await persistLineOrder(nextRecord, "send_history_return");
    if (!saveResult.ok) {
      return { ok: false, message: saveResult.message || "ไม่สามารถบันทึกคืนสินค้าลง Supabase ได้", saveResult };
    }

    const persistedRecord = withPersistedRecordId(nextRecord, saveResult);

    setState((current) => ({
      ...current,
      lineOrders: upsertLineOrder(current.lineOrders, persistedRecord),
    }));

    await addLog(
      persistedRecord.poNumber,
      persistedRecord.assignedDriverId,
      STATUS.RETURNED,
      "บันทึกคืนสินค้าจากประวัติการส่ง"
    );
    return { ok: true, record: persistedRecord, saveResult };
  };

  const confirmOrder = async (payload) => {
    const resolvedMap = await resolveMapsCoordinates(payload.mapsUrl);
    const coordinates = resolvedMap?.coordinates || null;
    if (!coordinates) {
      const message = isGoogleMapsShortLink(payload.mapsUrl)
        ? "ลิงก์ย่อของ Maps ต้องมี endpoint สำหรับขยายลิงก์ก่อนจึงจะอ่านพิกัดได้"
        : "ไม่สามารถอ่านพิกัดจากลิงก์ Google Maps นี้ได้";
      return { ok: false, message };
    }

    const locationInfo = await resolveDistrictFromCoordinates(coordinates.lat, coordinates.lng);
    const order = {
      id: `ORD-${payload.poNumber}`,
      poNumber: payload.poNumber,
      customerName: payload.customerName,
      phone: payload.phone,
      area: buildDistrictArea(locationInfo, coordinates.lat, coordinates.lng),
      district: String(locationInfo?.district || ""),
      province: String(locationInfo?.province || ""),
      distanceKm: calculateDistanceKm(APP_CONFIG.hub.lat, APP_CONFIG.hub.lng, coordinates.lat, coordinates.lng),
      relativeLocation: buildRelativeLocationLabel(coordinates.lat, coordinates.lng),
      address: payload.address,
      deliveryDate: payload.deliveryDate,
      note: payload.confirmNote,
      items: payload.items,
      selectedProducts: cloneProductItems(selectedProducts.confirm),
      confirmedAmount: payload.confirmedAmount,
      mapsUrl: String(resolvedMap?.finalUrl || payload.mapsUrl),
      destinationLat: coordinates.lat,
      destinationLng: coordinates.lng,
      status: STATUS.CONFIRMED,
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
    };

    setSelectedProducts((current) => ({ ...current, confirm: [] }));
    setCatalog((current) => ({ ...current, confirmResults: [] }));
    return { ok: true, order };
  };

  const addUser = async (payload) => {
    if (state.users.length && currentUser?.role !== ROLES.MANAGER) {
      return { ok: false, message: "เฉพาะผู้จัดการเท่านั้นที่เพิ่มพนักงานใหม่ได้" };
    }

    const validation = validateUserPayload(payload, state.users);
    if (!validation.ok) {
      return validation;
    }

    const nextPayload = validation.payload;

    const localUser = normalizeUserRecord({
      id: `USR-${Date.now()}`,
      username: nextPayload.username,
      password: nextPayload.password || "",
      full_name: nextPayload.name,
      role: nextPayload.role || (state.users.length ? ROLES.SALES : ROLES.MANAGER),
      department:
        nextPayload.department || nextPayload.role || (state.users.length ? ROLES.SALES : ROLES.MANAGER),
      employee_code: nextPayload.employeeCode,
      position: nextPayload.position,
      email: nextPayload.email,
      phone: nextPayload.phone,
      area: nextPayload.area,
      vehicle_type: nextPayload.vehicleType,
      max_orders: nextPayload.maxOrders ? Math.floor(Number(nextPayload.maxOrders)) : "",
      note: nextPayload.note,
    });

    const saveResult = await saveUserToSupabase(localUser);
    if (!saveResult?.ok || !saveResult.user) {
      return {
        ok: false,
        message: saveResult?.message || "ไม่สามารถบันทึกบัญชีพนักงานไปยัง Supabase ได้",
        saveResult,
      };
    }

    const nextUser = saveResult.user;

    setState((current) => ({
      ...current,
      users: current.users.some((item) => item.username === nextUser.username)
        ? current.users.map((item) => (item.username === nextUser.username ? nextUser : item))
        : [nextUser, ...current.users],
      currentUserId: current.currentUserId || nextUser.id,
    }));

    return { ok: true, user: nextUser, saveResult };
  };

  const assignDriver = async (orderId, driverId) => {
    const poNumber = String(orderId || "").replace(/^ORD-/, "");
    return updateLineOrderDispatch(poNumber, { assignedDriverId: driverId, status: STATUS.ASSIGNED });
  };

  const updateOrderStatus = async (orderId, nextStatus) => {
    const poNumber = String(orderId || "").replace(/^ORD-/, "");
    return updateLineOrderDispatch(poNumber, { status: nextStatus });
  };

  const value = {
    state,
    isReady,
    currentUser,
    supabase,
    stockSupabase,
    catalog,
    selectedProducts,
    drivers,
    login,
    logout,
    switchCurrentUser,
    searchProducts,
    addSelectedProduct,
    removeSelectedProduct,
    setProductQuantity,
    syncLineProductsFromPo,
    syncConfirmProductsFromPo,
    submitLineOrder,
    deleteLineOrder,
    updateLineOrderStatus,
    updateLineOrderDispatch,
    archiveLineOrdersByDate,
    markHistoryOrderReturned,
    confirmOrder,
    addUser,
    assignDriver,
    updateOrderStatus,
    addLog,
    saveProductPrice,
    fetchMergedProducts,
    resetSavedData,
    refreshLineOrdersFromSupabase,
    generatePoNumber: () => generatePoNumber(state.lineOrders),
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used within AppStateProvider");
  return value;
}
