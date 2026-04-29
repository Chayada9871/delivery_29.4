window.APP_CONFIG = {
  expandMapsShortLinkEndpoint: "",
  reverseGeocodeEndpoint: "",
  supabaseUrl: "https://uaqljdqtitdpctjxhutv.supabase.co",
  supabasePublishableKey: "sb_publishable_acbHgymVZkSQv0cHco0WWw_2Aipv9hL",
  productTable: "products",
  poTable: "purchase_orders",
  productColumns: {
    id: ["id", "product_id"],
    code: ["sku", "product_code", "code"],
    name: ["name", "product_name", "title"],
    price: ["price", "unit_price", "sell_price"],
    stock: ["stock", "qty", "quantity", "on_hand"]
  }
};
