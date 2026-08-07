import { useEffect, useRef } from "react";
import { formatChapterDate, formatSeriesStatus, VI_GENRE } from "../lib/series-format";
import { useBodyScrollLock } from "../lib/useBodyScrollLock";

export function SeriesModal({ detail, close, read }) {
  const closeRef = useRef(null);
  const modalRef = useRef(null);

  // Lock body scroll khi modal mở — auto-restore khi unmount.
  useBodyScrollLock(true);

  // Bắt phím ESC đóng modal (WCAG 2.1 Technique SCR2).
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [close]);

  // Focus vào nút đóng khi mount (focus trap bắt đầu từ đây).
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Focus trap: khi Tab ra khỏi modal → wrap về.
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableSelectors = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(", ");

    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;

      const focusable = Array.from(modal.querySelectorAll(focusableSelectors));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab từ first → wrap về last.
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab từ last → wrap về first.
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    modal.addEventListener("keydown", handleKeyDown);
    return () => modal.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      className="modal-wrap"
      role="dialog"
      aria-modal="true"
      aria-labelledby="series-modal-title"
    >
      <div className="modal series-modal" ref={modalRef}>
        <button
          ref={closeRef}
          className="close"
          onClick={close}
          aria-label="Đóng chi tiết series"
        >
          ×
        </button>
        <div className="detail-cover">
          {detail.coverImageUrl ? (
            <img src={detail.coverImageUrl} alt="" />
          ) : (
            <div>
              ✦<br />
              Chưa có ảnh bìa
            </div>
          )}
        </div>
        <div className="detail-content">
          <p className="eyebrow">
            {detail.publicationType || "SERIES"} · {formatSeriesStatus(detail.status)}
          </p>
          <h2 id="series-modal-title">{detail.title}</h2>
          <div className="detail-stats">
            <span>{detail.chapters?.length || 0} chương đã phát hành</span>
            <span>
              {detail.author?.displayName
                ? `Tác giả: ${detail.author.displayName}`
                : "Tác giả: Đang cập nhật"}
            </span>
          </div>
          <div className="tags">
            {detail.genres?.map((g) => (
              <span key={g}>{VI_GENRE[g] || g}</span>
            ))}
          </div>
          <p>
            {detail.synopsis || "Thông tin về series này đang được cập nhật."}
          </p>
          <h3>Danh sách chương</h3>
          <div className="chapters">
            {detail.chapters?.map((c) => (
              <button key={c.id} onClick={() => read(c.id)}>
                <b>Ch.{c.chapterNumber}</b>
                <span>{c.title || "Chương mới"}</span>
                <em>{formatChapterDate(c.publishedAt)} →</em>
              </button>
            ))}
            {!detail.chapters?.length && <p>Series sắp ra mắt.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
