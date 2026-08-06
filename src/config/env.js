const trimTrailingSlash = (value) => value?.replace(/\/$/, "");

export const API_BASE_URL =
  trimTrailingSlash(import.meta.env.VITE_API_URL) ||
  "https://api-mangaka.novaproj.site";

export const RECAPTCHA_SITE_KEY =
  import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";

export const IS_RECAPTCHA_CONFIGURED = Boolean(RECAPTCHA_SITE_KEY);
