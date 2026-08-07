import { useEffect, useRef, useState } from "react";
import { useBodyScrollLock } from "../lib/useBodyScrollLock";

export function Reader({ reader, close, go }) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshAttempted, setRefreshAttempted] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  // Lock body scroll khi reader mở — auto-restore khi unmount.
  useBodyScrollLock(true);

  useEffect(() => {
    setRefreshing(false);
    setRefreshAttempted(false);
    setRefreshError("");
  }, [reader.chapter.id]);

  const refreshExpiredUrls = async () => {
    if (refreshing || refreshAttempted) return;
    setRefreshing(true);
    setRefreshAttempted(true);
    setRefreshError("");
    const refreshed = await go(reader.chapter.id);
    if (!refreshed) {
      setRefreshError("Không thể làm mới ảnh chương. Vui lòng thử lại.");
    }
    setRefreshing(false);
  };

  return (
    <div className="reader">
      <div className="reader-bar">
        <button onClick={close}>← Thư viện</button>
        <p>
          {reader.series.title} <span>/ Ch.{reader.chapter.chapterNumber}</span>
        </p>
        <div className="reader-actions">
          <button onClick={refreshExpiredUrls} disabled={refreshing}>
            {refreshing ? "Đang làm mới…" : "Làm mới ảnh"}
          </button>
          <button
            onClick={() => {
              if (window.scrollY > 10) {
                window.scrollTo({ top: 0, behavior: "smooth" });
              } else {
                window.scrollTo({ top: 0 });
              }
            }}
          >
            ↑ Đầu trang
          </button>
        </div>
      </div>
      <div className="reader-progress">
        <span>Đọc trọn chương</span>
        <b>{reader.pages.length} trang</b>
      </div>
      <div className="pages">
        {reader.pages.map((p) => (
          <img
            key={p.pageNumber}
            src={p.imageUrl}
            alt={`Trang ${p.pageNumber}`}
            onError={refreshExpiredUrls}
          />
        ))}
      </div>
      {refreshError && <p className="reader-refresh-error">{refreshError}</p>}
      <div className="reader-nav">
        <button
          disabled={!reader.prevChapterId}
          onClick={() => reader.prevChapterId && go(reader.prevChapterId)}
        >
          ← Chương trước
        </button>
        <button
          disabled={!reader.nextChapterId}
          onClick={() => reader.nextChapterId && go(reader.nextChapterId)}
        >
          Chương sau →
        </button>
      </div>
    </div>
  );
}