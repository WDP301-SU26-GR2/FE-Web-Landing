import { RECAPTCHA_SITE_KEY } from "../config/env";

let scriptPromise;

function loadRecaptcha() {
  if (!RECAPTCHA_SITE_KEY) {
    return Promise.reject(new Error("Chưa cấu hình VITE_RECAPTCHA_SITE_KEY."));
  }

  if (window.grecaptcha) return Promise.resolve(window.grecaptcha);

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(RECAPTCHA_SITE_KEY)}`;
      script.async = true;
      script.onload = () => resolve(window.grecaptcha);
      script.onerror = () =>
        reject(new Error("Không thể tải reCAPTCHA. Vui lòng thử lại."));
      document.head.append(script);
    });
  }

  return scriptPromise;
}

export async function getRecaptchaToken(action) {
  const grecaptcha = await loadRecaptcha();

  return new Promise((resolve, reject) => {
    grecaptcha.ready(() => {
      grecaptcha.execute(RECAPTCHA_SITE_KEY, { action }).then(resolve, reject);
    });
  });
}
