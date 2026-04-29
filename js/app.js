const STORAGE_KEY = "sophon-driver-expire-format";
const APP_CONFIG = window.APP_CONFIG || {};

const STATUS = {
  PENDING: "Pending",
  ASSIGNED: "Assigned",
  LOADED: "Loaded",
  OUT: "Out for Delivery",
  DELIVERED: "Delivered",
  FAILED: "Failed Delivery",
  RETURNED: "Returned",
};

const STATUS_LABELS = {
  [STATUS.PENDING]: "รอจัดส่ง",
  [STATUS.ASSIGNED]: "มอบหมายแล้ว",
  [STATUS.LOADED]: "ขึ้นรถแล้ว",
  [STATUS.OUT]: "กำลังจัดส่ง",
  [STATUS.DELIVERED]: "ส่งสำเร็จ",
  [STATUS.FAILED]: "ส่งไม่สำเร็จ",
  [STATUS.RETURNED]: "ตีกลับ",
};

const ROLE_LABELS = {
  Admin: "ผู้ดูแลระบบ",
  Manager: "ผู้จัดการ",
  Driver: "พนักงานขับรถ",
};

const EMPTY_STATE = {
  users: [],
  orders: [],
  logs: [],
  lineOrders: [],
};

const WHOLESALE_DEFAULT_MAX_ORDERS = 12;
const HUB = {
  name: "Sophon Supermarket",
  lat: 12.9951114,
  lng: 100.9372863,
};

let state = loadState();
const page = document.body.dataset.page;
const supabaseClient = createSupabaseClient();
let lineProductResults = [];
let confirmProductResults = [];
let lineSelectedProducts = [];
let confirmSelectedProducts = [];

document.addEventListener("submit", handleSubmit);
document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);

renderPage();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(EMPTY_STATE);
  try {
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      lineOrders: Array.isArray(parsed.lineOrders) ? parsed.lineOrders : [],
    };
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderPage() {
  persist();
  if (page === "dashboard") renderDashboard();
  if (page === "line_orders") renderLineOrdersPage();
  if (page === "confirm_orders") renderConfirmOrdersPage();
  if (page === "orders") renderOrdersPage();
  if (page === "planning") renderPlanningPage();
  if (page === "driver") renderDriverPage();
  if (page === "reports") renderReportsPage();
  if (page === "users") renderUsersPage();
}

async function handleSubmit(event) {
  if (event.target.id === "orderForm") {
    event.preventDefault();
    const data = new FormData(event.target);
    const orderId = String(data.get("orderNumber") || "").trim();
    const mapsUrl = String(data.get("mapsUrl") || "").trim();
    const resolvedMap = await resolveMapsCoordinates(mapsUrl);
    const coordinates = resolvedMap?.coordinates || null;

    if (!coordinates) {
      window.alert(
        isGoogleMapsShortLink(mapsUrl)
          ? "ลิงก์สั้นแบบ maps.app.goo.gl ต้องใช้ตัวขยายลิงก์จาก backend ก่อน กรุณาตั้งค่า endpoint ใน js/config.js หรือใช้ลิงก์ Google Maps แบบเต็มชั่วคราว"
          : "ลิงก์ Google Maps นี้ยังไม่มีพิกัดที่ระบบอ่านได้ กรุณาใช้ลิงก์ปลายทางที่มี latitude และ longitude"
      );
      return;
    }

    const locationInfo = await resolveDistrictFromCoordinates(coordinates.lat, coordinates.lng);

    state.orders.unshift({
      id: orderId,
      customerName: String(data.get("customerName") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      area: buildDistrictArea(locationInfo, coordinates.lat, coordinates.lng),
      district: String(locationInfo?.district || ""),
      province: String(locationInfo?.province || ""),
      distanceKm: calculateDistanceKm(HUB.lat, HUB.lng, coordinates.lat, coordinates.lng),
      relativeLocation: buildRelativeLocationLabel(coordinates.lat, coordinates.lng),
      address: String(data.get("address") || "").trim(),
      deliveryDate: String(data.get("deliveryDate") || "").trim(),
      note: String(data.get("note") || "").trim(),
      mapsUrl: String(resolvedMap?.finalUrl || mapsUrl),
      originalMapsUrl: mapsUrl,
      destinationLat: coordinates.lat,
      destinationLng: coordinates.lng,
      status: STATUS.PENDING,
      driverId: "",
      assignedAt: "",
      loadedAt: "",
      outForDeliveryAt: "",
      deliveredAt: "",
      failedReason: "",
      createdAt: new Date().toISOString(),
    });

    addLog(orderId, "", STATUS.PENDING, "สร้างคำสั่งซื้อ");
    event.target.reset();
    const computedAreaInput = document.getElementById("computedAreaInput");
    if (computedAreaInput) computedAreaInput.value = "";
    renderPage();
    return;
  }

  if (event.target.id === "lineOrderForm") {
    event.preventDefault();
    const data = new FormData(event.target);
    const poNumber = String(data.get("poNumber") || "").trim();
    const lineOrder = {
      id: `LINE-${Date.now()}`,
      poNumber,
      customerName: String(data.get("customerName") || "").trim(),
      contact: String(data.get("contact") || "").trim(),
      items: String(data.get("items") || "").trim(),
      selectedProducts: cloneSelectedProducts(lineSelectedProducts),
      estimatedAmount: String(data.get("estimatedAmount") || "").trim(),
      chatNote: String(data.get("chatNote") || "").trim(),
      status: "LINE_RECEIVED",
      createdAt: new Date().toISOString(),
      confirmedAt: "",
    };
    state.lineOrders.unshift(lineOrder);
    addLog(poNumber, "", STATUS.PENDING, "รับออเดอร์จาก Line และรอส่งให้ลูกค้ายืนยัน");
    await savePurchaseOrderToSupabase({
      poNumber,
      customerName: lineOrder.customerName,
      contact: lineOrder.contact,
      itemsText: lineOrder.items,
      selectedProducts: lineOrder.selectedProducts,
      estimatedAmount: lineOrder.estimatedAmount,
      status: lineOrder.status,
      source: "line_orders",
      rawData: lineOrder,
    });
    event.target.reset();
    lineProductResults = [];
    lineSelectedProducts = [];
    renderPage();
    return;
  }

  if (event.target.id === "poLookupForm") {
    event.preventDefault();
    const data = new FormData(event.target);
    const poNumber = String(data.get("poNumber") || "").trim();
    renderPoLookup(poNumber);
    return;
  }

  if (event.target.id === "confirmOrderForm") {
    event.preventDefault();
    const data = new FormData(event.target);
    const poNumber = String(data.get("poNumber") || "").trim();
    const mapsUrl = String(data.get("mapsUrl") || "").trim();
    const resolvedMap = await resolveMapsCoordinates(mapsUrl);
    const coordinates = resolvedMap?.coordinates || null;
    if (!coordinates) {
      window.alert("ไม่สามารถอ่านพิกัดปลายทางจากลิงก์แผนที่ได้");
      return;
    }

    const locationInfo = await resolveDistrictFromCoordinates(coordinates.lat, coordinates.lng);
    const lineOrder = state.lineOrders.find((item) => item.poNumber === poNumber);
    const orderId = `ORD-${poNumber}`;
    const confirmedOrder = {
      id: orderId,
      poNumber,
      customerName: String(data.get("customerName") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      area: buildDistrictArea(locationInfo, coordinates.lat, coordinates.lng),
      district: String(locationInfo?.district || ""),
      province: String(locationInfo?.province || ""),
      distanceKm: calculateDistanceKm(HUB.lat, HUB.lng, coordinates.lat, coordinates.lng),
      relativeLocation: buildRelativeLocationLabel(coordinates.lat, coordinates.lng),
      address: String(data.get("address") || "").trim(),
      deliveryDate: String(data.get("deliveryDate") || "").trim(),
      note: String(data.get("confirmNote") || "").trim(),
      items: String(data.get("items") || "").trim(),
      selectedProducts: cloneSelectedProducts(confirmSelectedProducts),
      confirmedAmount: String(data.get("confirmedAmount") || "").trim(),
      mapsUrl: String(resolvedMap?.finalUrl || mapsUrl),
      originalMapsUrl: mapsUrl,
      destinationLat: coordinates.lat,
      destinationLng: coordinates.lng,
      status: STATUS.PENDING,
      driverId: "",
      assignedAt: "",
      loadedAt: "",
      outForDeliveryAt: "",
      deliveredAt: "",
      failedReason: "",
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
    };
    state.orders.unshift(confirmedOrder);

    if (lineOrder) {
      lineOrder.status = "CONFIRMED";
      lineOrder.confirmedAt = new Date().toISOString();
      lineOrder.phone = String(data.get("phone") || "").trim();
      lineOrder.address = String(data.get("address") || "").trim();
      lineOrder.mapsUrl = String(resolvedMap?.finalUrl || mapsUrl);
      lineOrder.selectedProducts = cloneSelectedProducts(confirmSelectedProducts);
      lineOrder.items = confirmedOrder.items;
    }

    addLog(orderId, "", STATUS.PENDING, "ลูกค้ายืนยันรายละเอียดแล้วและสร้างคำสั่งซื้อเข้าสู่ระบบจัดส่ง");
    await savePurchaseOrderToSupabase({
      poNumber,
      customerName: confirmedOrder.customerName,
      contact: confirmedOrder.phone,
      itemsText: confirmedOrder.items,
      selectedProducts: confirmedOrder.selectedProducts,
      confirmedAmount: confirmedOrder.confirmedAmount,
      deliveryDate: confirmedOrder.deliveryDate,
      address: confirmedOrder.address,
      mapsUrl: confirmedOrder.mapsUrl,
      area: confirmedOrder.area,
      status: "CONFIRMED",
      source: "confirm_orders",
      rawData: confirmedOrder,
    });
    event.target.reset();
    confirmProductResults = [];
    confirmSelectedProducts = [];
    renderPage();
    return;
  }

  if (event.target.id === "userForm") {
    event.preventDefault();
    const data = new FormData(event.target);
    state.users.unshift({
      id: `USR-${Date.now()}`,
      name: String(data.get("name") || "").trim(),
      role: String(data.get("role") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      area: String(data.get("area") || "").trim(),
      vehicleType: String(data.get("vehicleType") || "").trim(),
      maxOrders: toPositiveInt(data.get("maxOrders")),
    });
    event.target.reset();
    renderPage();
    return;
  }

  if (event.target.id === "assignmentForm") {
    event.preventDefault();
    const data = new FormData(event.target);
    const order = state.orders.find((item) => item.id === data.get("orderId"));
    if (!order) return;
    order.driverId = String(data.get("driverId") || "");
    order.status = STATUS.ASSIGNED;
    order.assignedAt = new Date().toISOString();
    addLog(order.id, order.driverId, STATUS.ASSIGNED, "มอบหมายงานให้คนขับ");
    renderPage();
  }
}

function handleClick(event) {
  if (event.target.id === "lineProductSearchBtn") {
    searchProductsForContext("line");
    return;
  }

  if (event.target.id === "confirmProductSearchBtn") {
    searchProductsForContext("confirm");
    return;
  }

  const action = event.target.closest("[data-action]");
  if (!action) return;

  if (action.dataset.action === "add-product") {
    addProductSelection(action.dataset.context, action.dataset.productId);
    return;
  }

  if (action.dataset.action === "remove-product") {
    removeProductSelection(action.dataset.context, action.dataset.productId);
    return;
  }

  const order = state.orders.find((item) => item.id === action.dataset.orderId);
  if (!order) return;

  const nextStatus = action.dataset.action;
  const now = new Date().toISOString();
  order.status = nextStatus;
  if (nextStatus === STATUS.LOADED) order.loadedAt = now;
  if (nextStatus === STATUS.OUT) order.outForDeliveryAt = now;
  if (nextStatus === STATUS.DELIVERED) order.deliveredAt = now;
  addLog(order.id, order.driverId, nextStatus, `เปลี่ยนสถานะเป็น ${STATUS_LABELS[nextStatus]}`);
  renderPage();
}

function handleInput(event) {
  if (event.target.id === "mapsUrlInput") {
    updateComputedAreaPreview(event.target.value);
    return;
  }

  if (event.target.matches("[data-product-qty]")) {
    updateSelectedProductQuantity(event.target.dataset.context, event.target.dataset.productId, event.target.value);
  }
}

function addLog(orderId, driverId, status, note) {
  state.logs.unshift({
    id: `LOG-${Date.now()}`,
    orderId,
    driverId,
    status,
    note,
    timestamp: new Date().toISOString(),
  });
}

function renderDashboard() {
  renderStats("dashboardStats");
  setHTML("recentLogs", renderLogs());
  setHTML("areaSummary", renderAreaSummary());
}

function renderOrdersPage() {
  setHTML("ordersTableWrap", renderOrdersTable());
}

function renderLineOrdersPage() {
  setHTML("lineOrdersTableWrap", renderLineOrdersTable());
  renderProductSearchSection("line");
}

function renderConfirmOrdersPage() {
  setHTML("confirmOrdersTableWrap", renderConfirmOrdersTable());
  renderProductSearchSection("confirm");
}

function renderPlanningPage() {
  setHTML("dispatchOverview", renderDispatchOverview());
  fillSelect(
    "assignOrder",
    sortedOrdersForPlanning().map((order) => ({
      value: order.id,
      label: `${order.id} - ${order.customerName} (${order.area}${typeof order.routeRank === "number" ? ` / ลำดับ ${order.routeRank}` : ""})`,
    })),
    "ยังไม่มีคำสั่งซื้อ"
  );
  fillSelect(
    "assignDriver",
    drivers().map((user) => ({ value: user.id, label: `${user.name}${user.area ? ` (${user.area})` : ""}` })),
    "ยังไม่มีพนักงานขับรถ"
  );
  setHTML("planningAreaSummary", renderAreaSummary());
  setHTML("waveSuggestions", renderWaveSuggestions());
  setHTML("driverRoutes", renderDriverRoutes());
}

function renderDriverPage() {
  fillSelect(
    "driverViewSelect",
    drivers().map((user) => ({ value: user.id, label: user.name })),
    "ยังไม่มีพนักงานขับรถ"
  );
  const select = document.getElementById("driverViewSelect");
  if (select && !select.dataset.bound) {
    select.dataset.bound = "true";
    select.addEventListener("change", () => setHTML("driverJobs", renderDriverJobs(select.value)));
  }
  setHTML("driverJobs", renderDriverJobs(select?.value || ""));
}

function renderReportsPage() {
  setHTML("reportCards", renderReports());
  setHTML("failedList", renderExceptionList(STATUS.FAILED));
  setHTML("returnedList", renderExceptionList(STATUS.RETURNED));
}

function renderUsersPage() {
  setHTML("usersTableWrap", renderUsersTable());
}

function renderPoLookup(poNumber) {
  const target = document.getElementById("poLookupResult");
  if (!target) return;
  const lineOrder = state.lineOrders.find((item) => item.poNumber === poNumber);
  if (!lineOrder) {
    target.innerHTML = empty("ไม่พบ PO นี้ในรายการที่รับมาจาก Line");
    return;
  }

  const confirmPoNumber = document.getElementById("confirmPoNumber");
  if (confirmPoNumber) confirmPoNumber.value = lineOrder.poNumber;

  const confirmForm = document.getElementById("confirmOrderForm");
  if (confirmForm) {
    const setValue = (name, value) => {
      const input = confirmForm.elements.namedItem(name);
      if (input) input.value = value || "";
    };
    setValue("customerName", lineOrder.customerName);
    setValue("phone", lineOrder.phone || lineOrder.contact);
    setValue("items", lineOrder.items);
  }

  confirmSelectedProducts = cloneSelectedProducts(lineOrder.selectedProducts || []);
  syncItemsTextarea("confirm");
  renderProductSearchSection("confirm");

  target.innerHTML = `
    <div class="soft-card">
      <strong>PO ${lineOrder.poNumber}</strong>
      <div class="inline-meta">${lineOrder.customerName} • ${lineOrder.contact}</div>
      <div class="inline-meta">สถานะ ${lineOrder.status === "CONFIRMED" ? "ยืนยันแล้ว" : "รอยืนยัน"}</div>
      <div>${escapeHtml(lineOrder.items).replace(/\n/g, "<br>")}</div>
    </div>
  `;
}

function createSupabaseClient() {
  if (!window.supabase?.createClient || !APP_CONFIG.supabaseUrl || !APP_CONFIG.supabasePublishableKey) {
    return null;
  }
  try {
    return window.supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabasePublishableKey);
  } catch {
    return null;
  }
}

function getProductColumns() {
  return APP_CONFIG.productColumns || {};
}

function pickFirstField(record, candidates, fallback = "") {
  for (const key of candidates || []) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

function normalizeProduct(record) {
  const columns = getProductColumns();
  const id = String(pickFirstField(record, columns.id, record?.id || record?.product_id || "")).trim();
  const code = String(pickFirstField(record, columns.code, "")).trim();
  const name = String(pickFirstField(record, columns.name, "")).trim();
  const price = Number(pickFirstField(record, columns.price, 0)) || 0;
  const stockRaw = pickFirstField(record, columns.stock, "");
  const stock = stockRaw === "" ? "" : Number(stockRaw);
  return {
    id: id || `${code || name}-${Math.random().toString(36).slice(2, 8)}`,
    code,
    name,
    price,
    stock: Number.isFinite(stock) ? stock : "",
    raw: record,
  };
}

async function searchProductsForContext(context) {
  const inputId = context === "line" ? "lineProductSearch" : "confirmProductSearch";
  const input = document.getElementById(inputId);
  const query = String(input?.value || "").trim().toLowerCase();
  const resultsTargetId = context === "line" ? "lineProductResults" : "confirmProductResults";

  if (!supabaseClient || !APP_CONFIG.productTable) {
    setHTML(resultsTargetId, empty("ยังไม่ได้ตั้งค่า Supabase product table"));
    return;
  }

  setHTML(resultsTargetId, `<div class="inline-meta">กำลังค้นหาสินค้า...</div>`);

  try {
    const { data, error } = await supabaseClient
      .from(APP_CONFIG.productTable)
      .select("*")
      .limit(100);

    if (error) {
      setHTML(resultsTargetId, empty(`ค้นหาสินค้าไม่สำเร็จ: ${escapeHtml(error.message)}`));
      return;
    }

    const normalized = (data || []).map(normalizeProduct).filter((item) => item.name || item.code);
    const filtered = normalized.filter((item) => {
      if (!query) return true;
      return [item.code, item.name].some((value) => String(value || "").toLowerCase().includes(query));
    }).slice(0, 20);

    if (context === "line") {
      lineProductResults = filtered;
    } else {
      confirmProductResults = filtered;
    }

    renderProductSearchSection(context);
  } catch (error) {
    setHTML(resultsTargetId, empty(`เชื่อม product table ไม่สำเร็จ: ${escapeHtml(error?.message || "unknown error")}`));
  }
}

function renderProductSearchSection(context) {
  const resultId = context === "line" ? "lineProductResults" : "confirmProductResults";
  const selectedId = context === "line" ? "lineSelectedProducts" : "confirmSelectedProducts";
  const results = context === "line" ? lineProductResults : confirmProductResults;
  const selected = context === "line" ? lineSelectedProducts : confirmSelectedProducts;

  const resultsHtml = !results.length
    ? `<div class="inline-meta">ค้นหาสินค้าจากรหัสหรือชื่อสินค้า</div>`
    : `<div class="list-stack">${results.map((product) => `
      <div class="soft-card">
        <strong>${escapeHtml(product.code || "-")} ${product.name ? `| ${escapeHtml(product.name)}` : ""}</strong>
        <div class="inline-meta">ราคา ${formatCurrency(product.price)} ${product.stock !== "" ? `| คงเหลือ ${product.stock}` : ""}</div>
        <button type="button" class="btn btn-secondary mt-14" data-action="add-product" data-context="${context}" data-product-id="${escapeHtml(product.id)}">เพิ่มเข้า PO</button>
      </div>
    `).join("")}</div>`;

  const selectedHtml = !selected.length
    ? `<div class="inline-meta">ยังไม่ได้เลือกสินค้า</div>`
    : `<div class="list-stack">${selected.map((product) => `
      <div class="soft-card">
        <strong>${escapeHtml(product.code || "-")} ${product.name ? `| ${escapeHtml(product.name)}` : ""}</strong>
        <div class="toolbar mt-14">
          <div class="toolbar-left">
            <label>จำนวน
              <input type="number" min="1" step="1" value="${product.quantity}" data-product-qty data-context="${context}" data-product-id="${escapeHtml(product.id)}">
            </label>
          </div>
          <button type="button" class="btn btn-secondary" data-action="remove-product" data-context="${context}" data-product-id="${escapeHtml(product.id)}">ลบ</button>
        </div>
        <div class="inline-meta">ราคา ${formatCurrency(product.price)} | รวม ${formatCurrency(Number(product.price || 0) * Number(product.quantity || 0))}</div>
      </div>
    `).join("")}</div>`;

  setHTML(resultId, resultsHtml);
  setHTML(selectedId, selectedHtml);
}

function addProductSelection(context, productId) {
  const results = context === "line" ? lineProductResults : confirmProductResults;
  const selected = context === "line" ? lineSelectedProducts : confirmSelectedProducts;
  const found = results.find((item) => item.id === productId);
  if (!found) return;
  const existing = selected.find((item) => item.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    selected.push({
      id: found.id,
      code: found.code,
      name: found.name,
      price: found.price,
      quantity: 1,
    });
  }
  syncItemsTextarea(context);
  renderProductSearchSection(context);
}

function removeProductSelection(context, productId) {
  if (context === "line") {
    lineSelectedProducts = lineSelectedProducts.filter((item) => item.id !== productId);
  } else {
    confirmSelectedProducts = confirmSelectedProducts.filter((item) => item.id !== productId);
  }
  syncItemsTextarea(context);
  renderProductSearchSection(context);
}

function updateSelectedProductQuantity(context, productId, value) {
  const selected = context === "line" ? lineSelectedProducts : confirmSelectedProducts;
  const item = selected.find((product) => product.id === productId);
  if (!item) return;
  item.quantity = Math.max(1, Math.floor(Number(value) || 1));
  syncItemsTextarea(context);
  renderProductSearchSection(context);
}

function syncItemsTextarea(context) {
  const selected = context === "line" ? lineSelectedProducts : confirmSelectedProducts;
  const textareaId = context === "line" ? "lineItemsTextarea" : "confirmItemsTextarea";
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;
  if (!selected.length) {
    textarea.value = "";
    return;
  }
  textarea.value = selected.map((item) => {
    const total = Number(item.price || 0) * Number(item.quantity || 0);
    return `${item.code || "-"} ${item.name || ""} x${item.quantity} = ${formatCurrency(total)}`;
  }).join("\n");
}

function cloneSelectedProducts(items) {
  return Array.isArray(items)
    ? items.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      price: Number(item.price || 0),
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
    }))
    : [];
}

async function savePurchaseOrderToSupabase(payload) {
  if (!supabaseClient || !APP_CONFIG.poTable) return;
  const record = {
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
    raw_data: payload.rawData || {},
    updated_at: new Date().toISOString(),
  };

  try {
    await supabaseClient.from(APP_CONFIG.poTable).insert(record);
  } catch (error) {
    console.error("savePurchaseOrderToSupabase failed", error);
  }
}

function renderStats(targetId) {
  const stats = [
    ["คำสั่งซื้อทั้งหมด", state.orders.length],
    ["รอจัดส่ง", countByStatus(STATUS.PENDING)],
    ["กำลังจัดส่ง", countByStatus(STATUS.OUT)],
    ["ส่งสำเร็จ", countByStatus(STATUS.DELIVERED)],
    ["ส่งไม่สำเร็จ", countByStatus(STATUS.FAILED)],
  ];

  setHTML(
    targetId,
    stats.map(([label, value]) => overviewCard(label, value)).join("")
  );
}

function renderLogs() {
  if (!state.logs.length) return empty("ยังไม่มีกิจกรรมในระบบ");
  return `<div class="list-stack">${state.logs.slice(0, 8).map((log) => `
    <div class="soft-card">
      <strong>${STATUS_LABELS[log.status]}</strong>
      <div class="inline-meta">${log.orderId || "-"} • ${formatDateTime(log.timestamp)}</div>
      <div>${log.note}</div>
    </div>
  `).join("")}</div>`;
}

function renderAreaSummary() {
  const groups = buildPlanningGroups();
  if (!groups.length) return empty("ยังไม่มีคำสั่งซื้อสำหรับสรุปตามพื้นที่");
  return `<div class="list-stack">${groups.map((group) => `
    <div class="soft-card">
      <strong>${group.area}</strong>
      <div class="inline-meta">${group.orders.length} รายการ • ระยะเฉลี่ย ${group.averageDistanceLabel} กม. • พิกัดเฉลี่ย ${group.centerLabel}</div>
      <div class="inline-meta">งานรอมอบหมาย ${group.unassignedCount} • งานขึ้นรถแล้ว ${group.loadedCount}</div>
      ${group.orders.map((order) => `
        <div class="inline-meta">ลำดับ ${order.routeRank || "-"} • ${order.id} • ${order.customerName} • ${order.relativeLocation || "-"} • ${formatDistance(order.distanceKm)} กม. • ${findUser(order.driverId)?.name || "ยังไม่มอบหมาย"}</div>
      `).join("")}
    </div>
  `).join("")}</div>`;
}

function renderOrdersTable() {
  if (!state.orders.length) return empty("ยังไม่มีคำสั่งซื้อ กรุณาเพิ่มข้อมูลจริงจากฟอร์มด้านซ้าย");
  return `<div class="table-wrap"><table><thead><tr>
    <th>เลขออเดอร์</th><th>PO</th><th>ลูกค้า</th><th>ปลายทาง</th><th>พื้นที่</th><th>ระยะจากต้นทาง</th><th>วันที่จัดส่ง</th><th>สถานะ</th><th>คนขับ</th>
  </tr></thead><tbody>
    ${sortedOrdersForPlanning().map((order) => `
      <tr>
        <td>${order.id}</td>
        <td>${order.poNumber || "-"}</td>
        <td>${order.customerName}<div class="inline-meta">${order.phone || "-"}</div></td>
        <td>
          ${order.address}
          ${order.mapsUrl ? `<div class="inline-meta"><a href="${escapeHtml(order.mapsUrl)}" target="_blank" rel="noreferrer">เปิด Google Maps</a></div>` : ""}
        </td>
        <td>${order.area}${typeof order.routeRank === "number" ? `<div class="inline-meta">${order.relativeLocation || "-"} • ลำดับส่ง ${order.routeRank}</div>` : ""}</td>
        <td>${formatDistance(order.distanceKm)} กม.</td>
        <td>${formatDate(order.deliveryDate)}</td>
        <td>${badge(order.status)}</td>
        <td>${findUser(order.driverId)?.name || "-"}</td>
      </tr>
    `).join("")}
  </tbody></table></div>`;
}

function renderLineOrdersTable() {
  if (!state.lineOrders.length) return empty("ยังไม่มีรายการที่รับเข้าจาก Line");
  return `<div class="table-wrap"><table><thead><tr>
    <th>PO</th><th>ลูกค้า</th><th>ติดต่อ</th><th>รายการสินค้า</th><th>ยอดประมาณการ</th><th>สถานะ</th>
  </tr></thead><tbody>
    ${state.lineOrders.map((item) => `
      <tr>
        <td>${item.poNumber}</td>
        <td>${item.customerName}</td>
        <td>${item.contact}</td>
        <td>${escapeHtml(item.items).replace(/\n/g, "<br>")}</td>
        <td>${item.estimatedAmount || "-"}</td>
        <td>${renderLineOrderStatus(item.status)}</td>
      </tr>
    `).join("")}
  </tbody></table></div>`;
}

function renderConfirmOrdersTable() {
  if (!state.lineOrders.length) return empty("ยังไม่มี PO ที่รอยืนยัน");
  return `<div class="table-wrap"><table><thead><tr>
    <th>PO</th><th>ลูกค้า</th><th>ติดต่อ</th><th>สถานะ</th><th>เวลายืนยัน</th>
  </tr></thead><tbody>
    ${state.lineOrders.map((item) => `
      <tr>
        <td>${item.poNumber}</td>
        <td>${item.customerName}</td>
        <td>${item.contact}</td>
        <td>${renderLineOrderStatus(item.status)}</td>
        <td>${item.confirmedAt ? formatDateTime(item.confirmedAt) : "-"}</td>
      </tr>
    `).join("")}
  </tbody></table></div>`;
}

function renderLineOrderStatus(status) {
  const label = status === "CONFIRMED" ? "ยืนยันแล้ว" : "รอยืนยัน";
  const cls = status === "CONFIRMED" ? "status-delivered" : "status-pending";
  return `<span class="status-badge ${cls}">${label}</span>`;
}

function renderDriverRoutes() {
  if (!drivers().length) return empty("ยังไม่มีพนักงานขับรถ");
  return `<div class="list-stack">${drivers().map((driver) => {
    const assigned = sortedOrdersForPlanning().filter((order) => order.driverId === driver.id);
    const capacity = driver.maxOrders || WHOLESALE_DEFAULT_MAX_ORDERS;
    return `
      <div class="soft-card">
        <strong>${driver.name}</strong>
        <div class="inline-meta">${driver.area || "ไม่ระบุพื้นที่"} • ${driver.vehicleType || "ไม่ระบุประเภทรถ"} • ความจุ ${capacity} งาน/รอบ</div>
        ${assigned.length ? `
          <div class="inline-meta">มอบหมายแล้ว ${assigned.length} งาน • เหลือความจุ ${Math.max(capacity - assigned.length, 0)} งาน</div>
          ${assigned.map((order) => `<div class="inline-meta">โหลดช่อง ${order.routeRank || "-"} • ${order.id} • ${order.customerName} • ${order.area} • ${formatDistance(order.distanceKm)} กม. • ${STATUS_LABELS[order.status]}</div>`).join("")}
        ` : `<div class="inline-meta">ยังไม่มีงานที่มอบหมาย</div>`}
      </div>
    `;
  }).join("")}</div>`;
}

function renderDriverJobs(driverId) {
  if (!driverId) return empty("เลือกพนักงานขับรถเพื่อดูงาน");
  const jobs = sortedOrdersForPlanning().filter((order) => order.driverId === driverId);
  if (!jobs.length) return empty("ยังไม่มีงานที่มอบหมายให้คนขับคนนี้");
  return jobs.map((order) => `
    <div class="job-card">
      <div><strong>${order.id}</strong></div>
      <div>${order.customerName}</div>
      <div class="inline-meta">${order.address}</div>
      <div class="inline-meta">${order.area}${typeof order.routeRank === "number" ? ` • ลำดับส่ง ${order.routeRank}` : ""}</div>
      <div class="inline-meta">ต้นทาง ${HUB.name} • ${order.relativeLocation || "-"} • ${formatDistance(order.distanceKm)} กม.</div>
      <div>${badge(order.status)}</div>
      <div class="job-actions">
        ${statusButton(order, STATUS.LOADED)}
        ${statusButton(order, STATUS.OUT)}
        ${statusButton(order, STATUS.DELIVERED)}
        ${statusButton(order, STATUS.FAILED)}
        ${statusButton(order, STATUS.RETURNED)}
      </div>
    </div>
  `).join("");
}

function renderReports() {
  if (!drivers().length) return empty("ยังไม่มีพนักงานขับรถสำหรับประมวลผลรายงาน");
  return `<div class="report-grid">${drivers().map((driver) => {
    const jobs = state.orders.filter((order) => order.driverId === driver.id);
    const delivered = jobs.filter((order) => order.status === STATUS.DELIVERED).length;
    const failed = jobs.filter((order) => order.status === STATUS.FAILED).length;
    const returned = jobs.filter((order) => order.status === STATUS.RETURNED).length;
    const out = jobs.filter((order) => order.status === STATUS.OUT).length;
    const loaded = jobs.filter((order) => order.status === STATUS.LOADED).length;
    const onTimeRate = jobs.length ? Math.round((delivered / jobs.length) * 100) : 0;
    return `
      <div class="report-card">
        <strong>${driver.name}</strong>
        <div class="inline-meta">${driver.area || "-"}</div>
        <div class="inline-meta">ส่งสำเร็จ ${delivered} รายการ</div>
        <div class="inline-meta">อัตราส่งสำเร็จ ${onTimeRate}%</div>
        <div class="inline-meta">ส่งไม่สำเร็จ ${failed} รายการ</div>
        <div class="inline-meta">ตีกลับ ${returned} รายการ</div>
        <div class="inline-meta">ขึ้นรถแล้ว ${loaded} รายการ</div>
        <div class="inline-meta">กำลังจัดส่ง ${out} รายการ</div>
      </div>
    `;
  }).join("")}</div>`;
}

function renderExceptionList(targetStatus) {
  const list = state.orders.filter((order) => order.status === targetStatus);
  if (!list.length) return empty(`ยังไม่มีรายการ${STATUS_LABELS[targetStatus]}`);
  return `<div class="list-stack">${list.map((order) => `
    <div class="soft-card">
      <strong>${order.id}</strong>
      <div class="inline-meta">${order.customerName} • ${findUser(order.driverId)?.name || "-"}</div>
      <div>${order.note || order.failedReason || "ไม่มีหมายเหตุ"}</div>
    </div>
  `).join("")}</div>`;
}

function renderUsersTable() {
  if (!state.users.length) return empty("ยังไม่มีผู้ใช้ กรุณาเพิ่มข้อมูลจริงจากฟอร์มด้านซ้าย");
  return `<div class="table-wrap"><table><thead><tr>
    <th>ชื่อ</th><th>บทบาท</th><th>เบอร์โทร</th><th>พื้นที่</th><th>รถ</th><th>ความจุ/รอบ</th>
  </tr></thead><tbody>
    ${state.users.map((user) => `
      <tr>
        <td>${user.name}</td>
        <td>${ROLE_LABELS[user.role] || user.role}</td>
        <td>${user.phone || "-"}</td>
        <td>${user.area || "-"}</td>
        <td>${user.vehicleType || "-"}</td>
        <td>${user.maxOrders || "-"}</td>
      </tr>
    `).join("")}
  </tbody></table></div>`;
}

function renderDispatchOverview() {
  const groups = buildPlanningGroups();
  if (!groups.length) return empty("ยังไม่มีคำสั่งซื้อสำหรับสร้างรอบส่ง");
  const unassigned = state.orders.filter((order) => !order.driverId).length;
  const assigned = state.orders.filter((order) => order.driverId).length;
  const loaded = countByStatus(STATUS.LOADED);
  const out = countByStatus(STATUS.OUT);
  return `
    <div class="stats-grid">
      ${overviewCard("โซนจัดส่งวันนี้", groups.length)}
      ${overviewCard("งานรอมอบหมาย", unassigned)}
      ${overviewCard("งานที่วางแผนแล้ว", assigned)}
      ${overviewCard("งานขึ้นรถแล้ว", loaded)}
      ${overviewCard("รถที่กำลังออกส่ง", out)}
    </div>
    <div class="soft-card">
      <strong>ต้นทางการจัดส่ง</strong>
      <div class="inline-meta">${HUB.name}</div>
      <div class="inline-meta">${HUB.lat.toFixed(6)}, ${HUB.lng.toFixed(6)}</div>
    </div>
    <div class="list-stack">
      ${groups.map((group) => `
        <div class="soft-card">
          <strong>${group.area}</strong>
          <div class="inline-meta">จำนวนงาน ${group.orders.length} • ระยะเฉลี่ย ${group.averageDistanceLabel} กม. • รอบวิ่งแนะนำ ${group.suggestedWaveCount}</div>
          <div class="inline-meta">คนขับที่เหมาะสม ${group.suggestedDrivers.length ? group.suggestedDrivers.join(", ") : "ยังไม่มีคนขับที่ตรงพื้นที่"}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderWaveSuggestions() {
  const groups = buildPlanningGroups();
  if (!groups.length) return empty("ยังไม่มีข้อมูลเพียงพอสำหรับสร้างข้อเสนอรอบวิ่ง");
  return `<div class="list-stack">${groups.map((group) => `
    <div class="soft-card">
      <strong>${group.area}</strong>
      ${group.waves.map((wave, index) => `
        <div class="inline-meta">รอบ ${index + 1} • ${wave.length} งาน • คนขับแนะนำ ${group.suggestedDrivers[index] || group.suggestedDrivers[0] || "เลือกภายหลัง"}</div>
        <div class="inline-meta">${wave.map((order) => `${order.routeRank || "-"}:${order.id} (${formatDistance(order.distanceKm)} กม.)`).join(" | ")}</div>
      `).join("")}
    </div>
  `).join("")}</div>`;
}

function fillSelect(id, options, emptyLabel) {
  const select = document.getElementById(id);
  if (!select) return;
  if (!options.length) {
    select.innerHTML = `<option value="">${emptyLabel}</option>`;
    return;
  }
  select.innerHTML = options.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
}

function sortedOrdersForPlanning() {
  return enrichOrdersForPlanning([...state.orders]).sort((a, b) => {
    const areaCompare = String(a.area || "").localeCompare(String(b.area || ""), "th");
    if (areaCompare !== 0) return areaCompare;
    const routeA = typeof a.routeRank === "number" ? a.routeRank : Number.MAX_SAFE_INTEGER;
    const routeB = typeof b.routeRank === "number" ? b.routeRank : Number.MAX_SAFE_INTEGER;
    if (routeA !== routeB) return routeA - routeB;
    return String(a.id).localeCompare(String(b.id), "en");
  });
}

function enrichOrdersForPlanning(orders) {
  const grouped = {};
  orders.forEach((order) => {
    const key = order.area || "ยังไม่คำนวณพื้นที่";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(order);
  });

  Object.values(grouped).forEach((groupOrders) => {
    groupOrders
      .sort((a, b) => routeSortValue(a) - routeSortValue(b))
      .forEach((order, index) => {
        order.routeRank = index + 1;
      });
  });

  return orders;
}

function buildPlanningGroups() {
  const grouped = {};
  sortedOrdersForPlanning().forEach((order) => {
    const key = order.area || "ยังไม่คำนวณพื้นที่";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(order);
  });

  return Object.entries(grouped).map(([area, orders]) => {
    const coords = orders.filter(hasCoordinates);
    const centerLat = coords.length ? coords.reduce((sum, item) => sum + Number(item.destinationLat), 0) / coords.length : null;
    const centerLng = coords.length ? coords.reduce((sum, item) => sum + Number(item.destinationLng), 0) / coords.length : null;
    const averageDistance = orders.length
      ? orders.reduce((sum, order) => sum + Number(order.distanceKm || 0), 0) / orders.length
      : 0;
    const candidateDrivers = drivers()
      .filter((driver) => String(driver.area || "").trim() === area)
      .sort((a, b) => currentDriverLoad(a.id) - currentDriverLoad(b.id));
    const capacity = candidateDrivers[0]?.maxOrders || WHOLESALE_DEFAULT_MAX_ORDERS;
    const waves = chunkOrders(orders, capacity);
    return {
      area,
      orders,
      centerLabel: centerLat !== null && centerLng !== null ? `${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}` : "-",
      averageDistanceLabel: formatDistance(averageDistance),
      unassignedCount: orders.filter((order) => !order.driverId).length,
      loadedCount: orders.filter((order) => order.status === STATUS.LOADED).length,
      suggestedDrivers: candidateDrivers.map((driver) => driver.name),
      suggestedWaveCount: waves.length,
      waves,
    };
  });
}

function drivers() {
  return state.users.filter((user) => user.role === "Driver");
}

function currentDriverLoad(driverId) {
  return state.orders.filter((order) => order.driverId === driverId && ![STATUS.DELIVERED, STATUS.RETURNED].includes(order.status)).length;
}

function findUser(id) {
  return state.users.find((user) => user.id === id);
}

function countByStatus(status) {
  return state.orders.filter((order) => order.status === status).length;
}

function badge(status) {
  const cls = {
    [STATUS.PENDING]: "status-pending",
    [STATUS.ASSIGNED]: "status-assigned",
    [STATUS.LOADED]: "status-loaded",
    [STATUS.OUT]: "status-out",
    [STATUS.DELIVERED]: "status-delivered",
    [STATUS.FAILED]: "status-failed",
    [STATUS.RETURNED]: "status-returned",
  }[status] || "status-pending";
  return `<span class="status-badge ${cls}">${STATUS_LABELS[status] || status}</span>`;
}

function statusButton(order, status) {
  return `<button type="button" class="btn btn-secondary" data-order-id="${order.id}" data-action="${status}">${STATUS_LABELS[status]}</button>`;
}

function setHTML(id, html) {
  const element = document.getElementById(id);
  if (element) element.innerHTML = html;
}

function empty(text) {
  return `<div class="empty-state">${text}</div>`;
}

function overviewCard(label, value) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
}

async function updateComputedAreaPreview(value) {
  const preview = document.getElementById("computedAreaInput");
  if (!preview) return;
  const resolved = await resolveMapsCoordinates(value);
  if (resolved?.coordinates) {
    const locationInfo = await resolveDistrictFromCoordinates(resolved.coordinates.lat, resolved.coordinates.lng);
    preview.value = buildDistrictArea(locationInfo, resolved.coordinates.lat, resolved.coordinates.lng);
    return;
  }
  preview.value = isGoogleMapsShortLink(value)
    ? (APP_CONFIG.expandMapsShortLinkEndpoint ? "ขยายลิงก์ไม่สำเร็จ" : "ต้องตั้งค่า endpoint สำหรับขยายลิงก์สั้น")
    : "";
}

async function resolveMapsCoordinates(value) {
  const direct = parseGoogleMapsCoordinates(value);
  if (direct) {
    return { coordinates: direct, finalUrl: String(value || "").trim() };
  }

  if (!isGoogleMapsShortLink(value) || !APP_CONFIG.expandMapsShortLinkEndpoint) {
    return null;
  }

  try {
    const response = await fetch(APP_CONFIG.expandMapsShortLinkEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: value }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const coordinates = payload?.coordinates || parseGoogleMapsCoordinates(payload?.finalUrl || "");
    if (!coordinates) return null;
    return {
      coordinates,
      finalUrl: String(payload?.finalUrl || value),
    };
  } catch {
    return null;
  }
}

async function resolveDistrictFromCoordinates(lat, lng) {
  if (!APP_CONFIG.reverseGeocodeEndpoint) {
    return null;
  }

  try {
    const response = await fetch(APP_CONFIG.reverseGeocodeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return {
      district: String(payload?.district || "").trim(),
      province: String(payload?.province || "").trim(),
      displayName: String(payload?.displayName || "").trim(),
    };
  } catch {
    return null;
  }
}

function parseGoogleMapsCoordinates(value) {
  const url = String(value || "").trim();
  if (!url) return null;
  const source = `${url} ${safeDecodeURIComponent(url)}`;
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /destination=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
  }
  return null;
}

function buildAreaKey(lat, lng) {
  const distanceKm = calculateDistanceKm(HUB.lat, HUB.lng, lat, lng);
  const direction = getCompassDirection(HUB.lat, HUB.lng, lat, lng);
  const distanceBand = distanceKm <= 5 ? "ใกล้" : distanceKm <= 15 ? "กลาง" : distanceKm <= 30 ? "ไกล" : "ไกลมาก";
  return `โซน${distanceBand}-${direction}`;
}

function buildDistrictArea(locationInfo, lat, lng) {
  const district = String(locationInfo?.district || "").trim();
  const province = String(locationInfo?.province || "").trim();
  if (district && province) return `${district}, ${province}`;
  if (district) return district;
  return buildAreaKey(lat, lng);
}

function routeSortValue(order) {
  if (!hasCoordinates(order)) return Number.MAX_SAFE_INTEGER;
  return (Number(order.destinationLat) * 1000) + Number(order.destinationLng);
}

function chunkOrders(orders, size) {
  const result = [];
  const chunkSize = Math.max(size || WHOLESALE_DEFAULT_MAX_ORDERS, 1);
  for (let index = 0; index < orders.length; index += chunkSize) {
    result.push(orders.slice(index, index + chunkSize));
  }
  return result;
}

function hasCoordinates(order) {
  return Number.isFinite(Number(order.destinationLat)) && Number.isFinite(Number(order.destinationLng));
}

function toPositiveInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return Math.floor(number);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isGoogleMapsShortLink(value) {
  try {
    const url = new URL(String(value || "").trim());
    return /(^|\.)maps\.app\.goo\.gl$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return String(value || "");
  }
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDistance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(1);
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calculateDistanceKm(startLat, startLng, endLat, endLng) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(endLat - startLat);
  const dLng = toRadians(endLng - startLng);
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function buildRelativeLocationLabel(lat, lng) {
  const direction = getCompassDirection(HUB.lat, HUB.lng, lat, lng);
  const distanceKm = calculateDistanceKm(HUB.lat, HUB.lng, lat, lng);
  return `${direction} จากสาขา ${formatDistance(distanceKm)} กม.`;
}

function getCompassDirection(startLat, startLng, endLat, endLng) {
  const bearing = calculateBearing(startLat, startLng, endLat, endLng);
  const directions = ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

function calculateBearing(startLat, startLng, endLat, endLng) {
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);
  const dLng = toRadians(endLng - startLng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function toRadians(value) {
  return value * (Math.PI / 180);
}

function toDegrees(value) {
  return value * (180 / Math.PI);
}
