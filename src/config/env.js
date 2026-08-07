/** @param {string|undefined} value */
const trimTrailingSlash = (value) => value?.replace(/\/$/, "");

/**
 * Cấu hình môi trường cho FE Web Landing.
 * Dùng Vite (biến prefixed VITE_) để tránh leak vào production bundle.
 *
 * Cách dùng:
 *   Trong .env.local (local dev):    VITE_API_URL=http://localhost:3000
 *   Trong .env.production:           VITE_API_URL=https://api-mangaka.novaproj.site
 *   Không cần khai báo gì ở CI/CD — Vite tự merge .env theo priority.
 */

/**
 * Base URL của BE API (không có trailing slash).
 * Fallback về URL staging khi không khai báo (vd dev máy cá nhân).
 * @type {string}
 */
export const API_BASE_URL =
  trimTrailingSlash(import.meta.env.VITE_API_URL) ||
  "https://api-mangaka.novaproj.site";

/**
 * Google reCAPTCHA v3 site key cho form vote.
 * Để trống ở môi trường dev/CI (IS_RECAPTCHA_CONFIGURED=false → vote tạm khóa).
 * @type {string}
 */
export const RECAPTCHA_SITE_KEY =
  import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";

/**
 * True khi RECAPTCHA_SITE_KEY có giá trị — quyết định UI vote có hiện form OTP hay không.
 * @type {boolean}
 */
export const IS_RECAPTCHA_CONFIGURED = Boolean(RECAPTCHA_SITE_KEY);
