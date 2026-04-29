import { getStorage, setStorage, generateId, daysLeft, getStatus } from "./utils.js";

const KEY = "batches";

export function addBatch(batch) {
  const data = getStorage(KEY);
  batch.id = generateId();
  data.push(batch);
  setStorage(KEY, data);
}

export function getBatches() {
  return getStorage(KEY).map(b => {
    const d = daysLeft(b.expiry_date);
    return {
      ...b,
      daysLeft: d,
      status: getStatus(d)
    };
  });
}

export function deleteBatch(id) {
  const data = getStorage(KEY).filter(b => b.id !== id);
  setStorage(KEY, data);
}