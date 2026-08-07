import { useCallback, useEffect, useState } from "react";

// Hook quản lý hash-based routing với history API đúng cách.
// Lưu ý: window.location.hash không hoạt động tốt với history.back() —
// trình duyệt không pushState khi hash thay đổi nên Back button không hoạt động.
// Hook này dùng pushState/replaceState + popstate listener thay thế.

const POPSTATE_HASH = "#__popstate__";

function getHash() {
  const hash = window.location.hash;
  return hash === POPSTATE_HASH ? "" : hash.replace(/^#/, "");
}

function pushHash(hash) {
  const newHash = hash ? `#${hash}` : "#";
  if (window.location.hash !== newHash) {
    window.history.pushState(null, "", newHash);
  }
}

function replaceHash(hash) {
  const newHash = hash ? `#${hash}` : "#";
  if (window.location.hash !== newHash) {
    window.history.replaceState(null, "", newHash);
  }
}

// Navigate tới hash mới (pushState → Back button hoạt động).
// replace=true thay thế entry hiện tại (không push mới) — dùng khi mount/unmount page.
export function useHashNavigate() {
  const [hash, setHash] = useState(getHash);

  // Sync khi user bấm Back/Forward trong trình duyệt.
  useEffect(() => {
    const onPopState = () => {
      // Dùng replace để tránh vòng lặp: popstate → pushState lại → popstate...
      setHash(getHash());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (replace) {
      replaceHash(to);
      setHash(to);
    } else {
      pushHash(to);
      setHash(to);
    }
  }, []);

  return { hash, navigate };
}
