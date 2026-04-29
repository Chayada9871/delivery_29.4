import { getStorage, setStorage, generateId } from "./utils.js";

const KEY = "products";

export function addProduct(product) {
  const data = getStorage(KEY);
  product.id = generateId();
  data.push(product);
  setStorage(KEY, data);
}

export function getProducts() {
  return getStorage(KEY);
}

export function deleteProduct(id) {
  const data = getStorage(KEY).filter(p => p.id !== id);
  setStorage(KEY, data);
}