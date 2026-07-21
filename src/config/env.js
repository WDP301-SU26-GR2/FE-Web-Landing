const trimTrailingSlash = (value) => value?.replace(/\/$/, "");

export const API_BASE_URL =
  trimTrailingSlash(import.meta.env.VITE_API_URL) ||
  "https://api-mangaka.novaproj.site";

// The public backend currently requires the field but has verification disabled.
// Set VITE_RECAPTCHA_TOKEN to a real token provider when verification is enabled.
export const VOTE_CAPTCHA_TOKEN =
  import.meta.env.VITE_RECAPTCHA_TOKEN || "captcha-disabled";
