import { ROLES, STATUS, STATUS_DESCRIPTIONS, STATUS_LABELS } from "@/lib/config";

export const WORKFLOW_STEPS = [
  {
    status: STATUS.LINE_RECEIVED,
    symbol: "01",
    title: STATUS_LABELS[STATUS.LINE_RECEIVED],
    description: STATUS_DESCRIPTIONS[STATUS.LINE_RECEIVED],
    owner: ROLES.SALES,
  },
  {
    status: STATUS.CONFIRMED,
    symbol: "02",
    title: STATUS_LABELS[STATUS.CONFIRMED],
    description: STATUS_DESCRIPTIONS[STATUS.CONFIRMED],
    owner: ROLES.SALES,
  },
  {
    status: STATUS.PREPARED,
    symbol: "03",
    title: STATUS_LABELS[STATUS.PREPARED],
    description: STATUS_DESCRIPTIONS[STATUS.PREPARED],
    owner: ROLES.WAREHOUSE,
  },
  {
    status: STATUS.ASSIGNED,
    symbol: "04",
    title: STATUS_LABELS[STATUS.ASSIGNED],
    description: STATUS_DESCRIPTIONS[STATUS.ASSIGNED],
    owner: ROLES.SALES,
  },
  {
    status: STATUS.OUT_FOR_DELIVERY,
    symbol: "05",
    title: STATUS_LABELS[STATUS.OUT_FOR_DELIVERY],
    description: STATUS_DESCRIPTIONS[STATUS.OUT_FOR_DELIVERY],
    owner: ROLES.DRIVER,
  },
  {
    status: STATUS.DELIVERED,
    symbol: "06",
    title: STATUS_LABELS[STATUS.DELIVERED],
    description: STATUS_DESCRIPTIONS[STATUS.DELIVERED],
    owner: ROLES.DRIVER,
  },
];

export const STATUS_TONES = {
  [STATUS.LINE_RECEIVED]: {
    badge: "border-slate-200 bg-slate-100 text-slate-700",
    accent: "bg-slate-500",
    ring: "ring-slate-200/80",
  },
  [STATUS.CONFIRMED]: {
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    accent: "bg-blue-500",
    ring: "ring-blue-200/80",
  },
  [STATUS.PREPARED]: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    accent: "bg-amber-500",
    ring: "ring-amber-200/80",
  },
  [STATUS.ASSIGNED]: {
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    accent: "bg-orange-500",
    ring: "ring-orange-200/80",
  },
  [STATUS.OUT_FOR_DELIVERY]: {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    accent: "bg-sky-500",
    ring: "ring-sky-200/80",
  },
  [STATUS.DELIVERED]: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    accent: "bg-emerald-500",
    ring: "ring-emerald-200/80",
  },
  [STATUS.FAILED]: {
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    accent: "bg-rose-500",
    ring: "ring-rose-200/80",
  },
  [STATUS.RETURNED]: {
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    accent: "bg-violet-500",
    ring: "ring-violet-200/80",
  },
  [STATUS.ARCHIVED]: {
    badge: "border-slate-200 bg-slate-900 text-white",
    accent: "bg-slate-900",
    ring: "ring-slate-200/80",
  },
};

export const ACTIVE_STATUSES = [
  STATUS.LINE_RECEIVED,
  STATUS.CONFIRMED,
  STATUS.PREPARED,
  STATUS.ASSIGNED,
  STATUS.OUT_FOR_DELIVERY,
  STATUS.DELIVERED,
  STATUS.FAILED,
  STATUS.RETURNED,
];

export const FINAL_DELIVERY_STATUSES = [STATUS.DELIVERED, STATUS.FAILED, STATUS.RETURNED];

const STATUS_PROGRESS = {
  [STATUS.LINE_RECEIVED]: 1,
  [STATUS.CONFIRMED]: 2,
  [STATUS.PREPARED]: 3,
  [STATUS.ASSIGNED]: 4,
  [STATUS.OUT_FOR_DELIVERY]: 5,
  [STATUS.DELIVERED]: 6,
  [STATUS.FAILED]: 6,
  [STATUS.RETURNED]: 6,
  [STATUS.ARCHIVED]: 7,
};

export function normalizeWorkflowStatus(value) {
  const source = String(value || "").trim().toUpperCase();

  if (!source) return "";

  if (ACTIVE_STATUSES.includes(source) || source === STATUS.ARCHIVED) return source;

  const legacyMap = {
    PENDING: STATUS.CONFIRMED,
    PENDING_PLAN: STATUS.PREPARED,
    SENT: STATUS.OUT_FOR_DELIVERY,
    ASSIGNED: STATUS.ASSIGNED,
    LOADED: STATUS.ASSIGNED,
    OUT: STATUS.OUT_FOR_DELIVERY,
    "OUT FOR DELIVERY": STATUS.OUT_FOR_DELIVERY,
    DELIVERED: STATUS.DELIVERED,
    "FAILED DELIVERY": STATUS.FAILED,
    FAILED: STATUS.FAILED,
    RETURNED: STATUS.RETURNED,
    ARCHIVED: STATUS.ARCHIVED,
  };

  return legacyMap[source] || "";
}

export function getOperationalStatus(order = {}) {
  const directStatus = normalizeWorkflowStatus(order.status);
  const dispatchStatus = normalizeWorkflowStatus(order.dispatchStatus);
  const finalStatus = normalizeWorkflowStatus(order.finalStatus);

  if (
    order.routeArchived ||
    directStatus === STATUS.ARCHIVED ||
    dispatchStatus === STATUS.ARCHIVED ||
    finalStatus === STATUS.ARCHIVED
  ) {
    return STATUS.ARCHIVED;
  }

  const inferredStatus = order.dispatchStartedAt || order.routeStartedAt
    ? STATUS.OUT_FOR_DELIVERY
    : order.assignedDriverId
      ? STATUS.ASSIGNED
      : order.readyForRouteAt || order.preparedAt
        ? STATUS.PREPARED
        : order.confirmedAt
          ? STATUS.CONFIRMED
          : STATUS.LINE_RECEIVED;

  const candidates = [finalStatus, directStatus, dispatchStatus, inferredStatus].filter(Boolean);
  if (!candidates.length) return STATUS.LINE_RECEIVED;

  return candidates.reduce((best, candidate) =>
    (STATUS_PROGRESS[candidate] || 0) > (STATUS_PROGRESS[best] || 0) ? candidate : best
  );
}

export function getDisplayStatus(order = {}) {
  return getOperationalStatus(order);
}

export function getCompletedStatus(order = {}) {
  const finalStatus = normalizeWorkflowStatus(order.finalStatus);
  if (FINAL_DELIVERY_STATUSES.includes(finalStatus)) return finalStatus;

  const operational = getOperationalStatus(order);
  if (FINAL_DELIVERY_STATUSES.includes(operational)) return operational;

  const dispatchStatus = normalizeWorkflowStatus(order.dispatchStatus);
  if (FINAL_DELIVERY_STATUSES.includes(dispatchStatus)) return dispatchStatus;

  return "";
}

export function isArchived(order = {}) {
  return getOperationalStatus(order) === STATUS.ARCHIVED;
}

export function isDispatchReady(order = {}) {
  const status = getOperationalStatus(order);
  return [
    STATUS.PREPARED,
    STATUS.ASSIGNED,
    STATUS.OUT_FOR_DELIVERY,
    STATUS.DELIVERED,
    STATUS.FAILED,
    STATUS.RETURNED,
    STATUS.ARCHIVED,
  ].includes(status);
}

export function isCompleted(order = {}) {
  return FINAL_DELIVERY_STATUSES.includes(getCompletedStatus(order));
}

export function canDeleteOrder(order = {}, role) {
  const status = getOperationalStatus(order);

  if (role === ROLES.MANAGER) {
    return [
      STATUS.LINE_RECEIVED,
      STATUS.CONFIRMED,
      STATUS.PREPARED,
      STATUS.ASSIGNED,
    ].includes(status) && !order.routeStartedAt;
  }

  return status === STATUS.LINE_RECEIVED;
}

export function canEditOrder(order = {}, role) {
  const status = getOperationalStatus(order);
  if (status === STATUS.ARCHIVED) return false;
  if ([STATUS.OUT_FOR_DELIVERY, STATUS.DELIVERED, STATUS.FAILED, STATUS.RETURNED].includes(status)) return false;
  if (role === ROLES.MANAGER) return true;
  return [STATUS.LINE_RECEIVED, STATUS.CONFIRMED].includes(status);
}

export function canArchiveOrder(order = {}) {
  return Boolean(order.routeFinishedAt) && isCompleted(order);
}

export function isDriverAllowed(order = {}, driverId = "") {
  return Boolean(driverId) && String(order.assignedDriverId || "").trim() === String(driverId).trim();
}

export function getStatusMeta(status) {
  const normalized = normalizeWorkflowStatus(status) || STATUS.LINE_RECEIVED;
  return {
    status: normalized,
    label: STATUS_LABELS[normalized] || normalized,
    description: STATUS_DESCRIPTIONS[normalized] || "",
    tone: STATUS_TONES[normalized] || STATUS_TONES[STATUS.LINE_RECEIVED],
  };
}

export function getWorkflowIndex(status) {
  const normalized = normalizeWorkflowStatus(status);
  return WORKFLOW_STEPS.findIndex((step) => step.status === normalized);
}

export function getOrderDepartment(order = {}) {
  const status = getOperationalStatus(order);

  if ([STATUS.LINE_RECEIVED, STATUS.CONFIRMED].includes(status)) return ROLES.SALES;
  if (status === STATUS.PREPARED) return ROLES.WAREHOUSE;
  if ([STATUS.ASSIGNED, STATUS.OUT_FOR_DELIVERY, STATUS.DELIVERED, STATUS.FAILED, STATUS.RETURNED].includes(status)) {
    return ROLES.DRIVER;
  }

  return ROLES.MANAGER;
}

export function getSafeTransitionError(order = {}, nextStatus, role, options = {}) {
  const currentStatus = getOperationalStatus(order);
  const requestedStatus = normalizeWorkflowStatus(nextStatus);
  const actorId = String(options.actorId || "").trim();
  const assignedDriverId = String(options.assignedDriverId ?? order.assignedDriverId ?? "").trim();
  const routeStartedAt = options.routeStartedAt ?? order.routeStartedAt;
  const allowArchive = Boolean(options.allowArchive);

  if (!requestedStatus) return "ไม่พบสถานะงานที่ต้องการ";
  if (currentStatus === requestedStatus) return "";
  if (currentStatus === STATUS.ARCHIVED) return "รายการที่เก็บเข้าประวัติแล้วจะอ่านได้อย่างเดียว";

  if (requestedStatus === STATUS.CONFIRMED) {
    if (currentStatus === STATUS.LINE_RECEIVED && [ROLES.SALES, ROLES.MANAGER].includes(role)) return "";
    if (currentStatus === STATUS.PREPARED && !assignedDriverId && !routeStartedAt && [ROLES.WAREHOUSE, ROLES.MANAGER].includes(role)) return "";
    return "ฝ่ายขายหรือผู้จัดการเท่านั้นที่ยืนยันออเดอร์ใหม่ได้ และงานที่เตรียมแล้วจะย้อนกลับได้เฉพาะก่อนเริ่มจัดส่ง";
  }

  if (requestedStatus === STATUS.LINE_RECEIVED) {
    if (currentStatus === STATUS.CONFIRMED && !assignedDriverId && !routeStartedAt && [ROLES.SALES, ROLES.MANAGER].includes(role)) return "";
    return "ฝ่ายขายหรือผู้จัดการเท่านั้นที่ย้อน PO จากสถานะยืนยันกลับไปขั้นรับออเดอร์ได้ก่อนเริ่มวางแผนจัดส่ง";
  }

  if (requestedStatus === STATUS.PREPARED) {
    if (currentStatus === STATUS.CONFIRMED && [ROLES.WAREHOUSE, ROLES.MANAGER].includes(role)) return "";
    if (currentStatus === STATUS.ASSIGNED && !routeStartedAt && [ROLES.SALES, ROLES.MANAGER].includes(role)) return "";
    return "คลังสามารถเปลี่ยนงานที่ยืนยันแล้วเป็นเตรียมสินค้าแล้วได้ และทีมจัดส่งจะยกเลิกการมอบหมายกลับมาได้เฉพาะก่อนเริ่มวิ่งงาน";
  }

  if (requestedStatus === STATUS.ASSIGNED) {
    if (currentStatus !== STATUS.PREPARED) return "จะมอบหมายคนขับได้ต่อเมื่อคลังเตรียมสินค้าเสร็จแล้วเท่านั้น";
    if (!assignedDriverId) return "ต้องเลือกคนขับก่อนเปลี่ยนงานเป็นสถานะมอบหมายคนขับ";
    if (![ROLES.SALES, ROLES.MANAGER].includes(role)) return "เฉพาะทีมจัดส่งหรือผู้จัดการเท่านั้นที่มอบหมายคนขับได้";
    return "";
  }

  if (requestedStatus === STATUS.OUT_FOR_DELIVERY) {
    if (currentStatus === STATUS.FAILED && role === ROLES.MANAGER && !order.routeFinishedAt && !order.routeArchived) return "";
    if (![ROLES.DRIVER, ROLES.MANAGER].includes(role)) return "เฉพาะคนขับที่ได้รับมอบหมายหรือผู้จัดการเท่านั้นที่เริ่มจัดส่งได้";
    if (!assignedDriverId) return "ต้องมีการมอบหมายคนขับก่อนเริ่มจัดส่ง";
    if (actorId && assignedDriverId !== actorId && role !== ROLES.MANAGER) return "เฉพาะคนขับที่ได้รับมอบหมายเท่านั้นที่อัปเดตจุดส่งนี้ได้";
    if (currentStatus !== STATUS.ASSIGNED) return "เริ่มจัดส่งได้จากสถานะมอบหมายคนขับเท่านั้น";
    if (!routeStartedAt) return "คนขับต้องเริ่มรอบวิ่งก่อนจึงจะเริ่มจุดส่งแต่ละจุดได้";
    return "";
  }

  if (FINAL_DELIVERY_STATUSES.includes(requestedStatus)) {
    if (![ROLES.DRIVER, ROLES.MANAGER].includes(role)) return "เฉพาะคนขับที่ได้รับมอบหมายหรือผู้จัดการเท่านั้นที่ปิดผลจุดส่งได้";
    if (!assignedDriverId) return "ต้องมีการมอบหมายคนขับก่อนปิดผลงานจัดส่ง";
    if (actorId && assignedDriverId !== actorId && role !== ROLES.MANAGER) return "เฉพาะคนขับที่ได้รับมอบหมายเท่านั้นที่อัปเดตจุดส่งนี้ได้";
  if (currentStatus !== STATUS.OUT_FOR_DELIVERY) return "ต้องเริ่มจุดส่งก่อนจึงจะบันทึกว่าส่งสำเร็จ ส่งไม่สำเร็จ หรือ คืนสินค้าได้";
    return "";
  }

  if (requestedStatus === STATUS.ARCHIVED) {
    if (![ROLES.DRIVER, ROLES.MANAGER, ROLES.SALES].includes(role)) return "เฉพาะผู้ใช้งานฝั่งปฏิบัติการเท่านั้นที่เก็บรอบส่งเข้าประวัติได้";
    if (!allowArchive && !canArchiveOrder(order)) return "จะย้ายเข้าประวัติได้เฉพาะรอบที่ปิดงานครบและมีผลจัดส่งสุดท้ายแล้วเท่านั้น";
    return "";
  }

  return `ไม่สามารถเปลี่ยนสถานะจาก ${STATUS_LABELS[currentStatus] || currentStatus} ไปเป็น ${STATUS_LABELS[requestedStatus] || requestedStatus} ได้`;
}

export function getAvailableActions(order = {}, role, options = {}) {
  const candidates = [
    STATUS.LINE_RECEIVED,
    STATUS.CONFIRMED,
    STATUS.PREPARED,
    STATUS.ASSIGNED,
    STATUS.OUT_FOR_DELIVERY,
    STATUS.DELIVERED,
    STATUS.FAILED,
    STATUS.RETURNED,
    STATUS.ARCHIVED,
  ];

  return candidates.filter(
    (status) => !getSafeTransitionError(order, status, role, options)
  );
}
