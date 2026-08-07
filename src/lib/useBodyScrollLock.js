import { useCallback, useEffect } from "react";

// Hook quản lý body scroll lock khi modal/reader mở.
// Tự động restore scroll khi unmount hoặc khi isLocked=false.
// Dùng ref để track để tránh race-condition khi component remount nhanh.
export function useBodyScrollLock(isLocked) {
  useEffect(() => {
    if (!isLocked) return;

    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const originalStyle = {
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight,
    };

    document.body.style.overflow = "hidden";
    // Bù scrollbar width để không bị layout shift khi overflow=hidden.
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalStyle.overflow;
      document.body.style.paddingRight = originalStyle.paddingRight;
    };
  }, [isLocked]);
}
