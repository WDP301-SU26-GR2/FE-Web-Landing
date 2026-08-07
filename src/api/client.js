import { API_BASE_URL } from "../config/env";

export class ApiError extends Error {
  constructor({ message, status, code, retryAfter, errors }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.errors = errors;
  }
}

export async function request(path, options = {}) {
  // Always bypass browser HTTP cache. The BE already has its own short-lived
  // caches (60-120s) for public data; without this, browsers revalidate with
  // the same etag and serve a stale empty payload from disk (e.g. catalog was
  // empty when the tab was first loaded, then BE was populated — FE never
  // sees the new data until hard refresh).
  const {
    cache: _ignoredCache,
    headers: optionHeaders,
    ...rest
  } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    ...rest,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...optionHeaders,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new ApiError({
      message: payload.message || "Không thể kết nối tới hệ thống.",
      status: payload.statusCode || response.status,
      code: payload.code,
      retryAfter: payload.retryAfter,
      errors: payload.errors,
    });
  }

  return payload.data ?? payload;
}
