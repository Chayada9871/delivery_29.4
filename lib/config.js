export const APP_CONFIG = {
  hub: {
    name: "Sophon Supermarket",
    lat: 12.9951114,
    lng: 100.9372863,
  },
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jobzvmtavribasfocebz.supabase.co",
  supabasePublishableKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    "sb_publishable_SFZcABIb5w01EjiabsT2Yw_uHMaFoQj",
  stockSupabaseUrl:
    process.env.NEXT_PUBLIC_STOCK_SUPABASE_URL || "https://uaqljdqtitdpctjxhutv.supabase.co",
  stockSupabasePublishableKey:
    process.env.NEXT_PUBLIC_STOCK_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STOCK_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    "sb_publishable_acbHgymVZkSQv0cHco0WWw_2Aipv9hL",
  productTable: process.env.NEXT_PUBLIC_PRODUCT_TABLE || "products",
  stockTable: process.env.NEXT_PUBLIC_STOCK_TABLE || "products",
  batchTable: process.env.NEXT_PUBLIC_BATCH_TABLE || "batches",
  priceTable: process.env.NEXT_PUBLIC_PRICE_TABLE || "product_prices",
  poTable: process.env.NEXT_PUBLIC_PO_TABLE || "purchase_orders",
  userTable: process.env.NEXT_PUBLIC_USER_TABLE || "app_users",
  logTable: process.env.NEXT_PUBLIC_LOG_TABLE || "app_logs",
  expandMapsShortLinkEndpoint:
    process.env.NEXT_PUBLIC_EXPAND_MAPS_SHORT_LINK_ENDPOINT || "",
  reverseGeocodeEndpoint: process.env.NEXT_PUBLIC_REVERSE_GEOCODE_ENDPOINT || "",
  productColumns: {
    id: ["id", "product_id", "item_id", "productid"],
    code: [
      "sku",
      "product_code",
      "code",
      "item_code",
      "barcode",
      "productcode",
    ],
    name: [
      "name",
      "product_name",
      "title",
      "item_name",
      "description",
      "productname",
    ],
    price: [
      "price",
      "unit_price",
      "sell_price",
      "sale_price",
      "selling_price",
      "retail_price",
      "amount",
    ],
    stock: [
      "stock",
      "qty",
      "quantity",
      "on_hand",
      "stock_qty",
      "balance_qty",
      "available_qty",
      "remain_qty",
    ],
  },
  priceColumns: {
    code: ["product_code", "code", "sku", "item_code", "barcode"],
    name: ["product_name", "name", "title", "item_name"],
    price: ["selling_price", "price", "unit_price", "sale_price", "retail_price", "amount"],
    note: ["note", "remark"],
  },
};

export const STATUS = {
  LINE_RECEIVED: "LINE_RECEIVED",
  CONFIRMED: "CONFIRMED",
  PREPARED: "PREPARED",
  ASSIGNED: "ASSIGNED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
  RETURNED: "RETURNED",
  ARCHIVED: "ARCHIVED",
};

export const STATUS_LABELS = {
  [STATUS.LINE_RECEIVED]: "รับออเดอร์จากไลน์",
  [STATUS.CONFIRMED]: "ยืนยัน PO",
  [STATUS.PREPARED]: "เตรียมสินค้าแล้ว",
  [STATUS.ASSIGNED]: "มอบหมายคนขับ",
  [STATUS.OUT_FOR_DELIVERY]: "กำลังจัดส่ง",
  [STATUS.DELIVERED]: "ส่งสำเร็จ",
  [STATUS.FAILED]: "ส่งไม่สำเร็จ",
  [STATUS.RETURNED]: "คืนสินค้า",
  [STATUS.ARCHIVED]: "เก็บเข้าประวัติ",
};

export const STATUS_DESCRIPTIONS = {
  [STATUS.LINE_RECEIVED]: "รับคำสั่งซื้อจาก Line แล้ว และกำลังรอฝ่ายขายตรวจสอบยืนยัน",
  [STATUS.CONFIRMED]: "ฝ่ายขายยืนยัน PO แล้ว และส่งต่อให้ทีมปฏิบัติการ",
  [STATUS.PREPARED]: "คลังเตรียมสินค้าครบแล้ว พร้อมวางแผนจัดส่ง",
  [STATUS.ASSIGNED]: "วางแผนเส้นทางและมอบหมายงานให้คนขับเรียบร้อย",
  [STATUS.OUT_FOR_DELIVERY]: "คนขับเริ่มวิ่งงานและกำลังดำเนินการจัดส่ง",
  [STATUS.DELIVERED]: "ลูกค้ารับสินค้าเรียบร้อยแล้ว",
  [STATUS.FAILED]: "จัดส่งไม่สำเร็จและต้องติดตามผลต่อ",
  [STATUS.RETURNED]: "ต้องคืนสินค้าและติดตามคำสั่งซื้อเพิ่มเติม",
  [STATUS.ARCHIVED]: "งานเสร็จสิ้นและถูกย้ายไปเก็บในประวัติ",
};

export const ROLES = {
  MANAGER: "Manager",
  SALES: "Sales",
  WAREHOUSE: "Warehouse",
  DRIVER: "Driver",
};

export const ROLE_LABELS = {
  [ROLES.MANAGER]: "ผู้จัดการปฏิบัติการ",
  [ROLES.SALES]: "ฝ่ายขาย / รับออเดอร์",
  [ROLES.WAREHOUSE]: "คลังสินค้า",
  [ROLES.DRIVER]: "คนขับ",
};

export const PAGE_ACCESS = {
  "/dashboard": [ROLES.MANAGER],
  "/manager-home": [ROLES.MANAGER],
  "/sales-home": [ROLES.MANAGER, ROLES.SALES],
  "/warehouse-home": [ROLES.MANAGER, ROLES.WAREHOUSE],
  "/driver-home": [ROLES.MANAGER, ROLES.DRIVER],
  "/line-orders": [ROLES.MANAGER, ROLES.SALES],
  "/po-status": [ROLES.MANAGER, ROLES.WAREHOUSE],
  "/send-orders": [ROLES.MANAGER, ROLES.SALES],
  "/send-history": [ROLES.MANAGER, ROLES.SALES],
  "/return-history": [ROLES.MANAGER, ROLES.SALES, ROLES.WAREHOUSE],
  "/pricing": [ROLES.MANAGER],
  "/driver": [ROLES.MANAGER, ROLES.DRIVER],
  "/users": [ROLES.MANAGER],
};

export const ROLE_HOME = {
  [ROLES.MANAGER]: "/dashboard",
  [ROLES.SALES]: "/sales-home",
  [ROLES.WAREHOUSE]: "/warehouse-home",
  [ROLES.DRIVER]: "/driver-home",
};

export const EMPTY_STATE = {
  users: [],
  orders: [],
  logs: [],
  lineOrders: [],
  currentUserId: "",
};
