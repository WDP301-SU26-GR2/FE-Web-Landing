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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
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
