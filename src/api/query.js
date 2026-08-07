// Numeric query params (limit/offset/year/month) phải là số hợp lệ, nếu không bị 422 vô ích ở BE.
const NUMERIC_QUERY_KEYS = new Set(["limit", "offset", "year", "month"]);

function normalizeQueryValue(key, value) {
  if (NUMERIC_QUERY_KEYS.has(key)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : null;
  }
  return String(value);
}

export function toQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    const normalized = normalizeQueryValue(key, value);
    if (normalized !== null) query.set(key, normalized);
  });

  const text = query.toString();
  return text ? `?${text}` : "";
}
