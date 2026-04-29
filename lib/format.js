const LOCALE = "th-TH-u-ca-gregory-nu-latn";
const TIME_ZONE = "Asia/Bangkok";

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatDistance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(1);
}

export function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}
