import { useState } from "react";
import { publicApi } from "../api/public.service";
import { LOGO_URL, SYSTEM_SHORT_NAME } from "../constants/branding";
import { ErrorBoundary } from "./ErrorBoundary";
import { VotePanel } from "./VotePanel";
import { Reader } from "./Reader";

export function VotePage({ close }) {
  const [reader, setReader] = useState(null);
  const [readerError, setReaderError] = useState("");

  const loadVoteReader = async (chapterId) => {
    try {
      setReaderError("");
      setReader(await publicApi.getChapterPages(chapterId));
      return true;
    } catch (error) {
      setReaderError(error.message || "Không thể mở chương truyện này.");
      return false;
    }
  };

  const openLatestChapter = async (seriesId) => {
    try {
      setReaderError("");
      const series = await publicApi.getSeriesDetail(seriesId);
      const latestChapter = [...(series.chapters || [])].sort(
        (a, b) => b.chapterNumber - a.chapterNumber,
      )[0];
      if (!latestChapter) {
        setReaderError("Series này chưa có chương đã xuất bản để đọc.");
        return;
      }
      await loadVoteReader(latestChapter.id);
    } catch (error) {
      setReaderError(error.message || "Không thể mở chương truyện này.");
    }
  };

  if (reader) {
    return (
      <Reader
        reader={reader}
        close={() => setReader(null)}
        go={loadVoteReader}
      />
    );
  }

  return (
    <div className="vote-page">
      <header>
        <a className="brand" href="#top">
          <img src={LOGO_URL} alt={SYSTEM_SHORT_NAME} /> <span>{SYSTEM_SHORT_NAME}</span>
        </a>
        <button className="back-link" onClick={close}>
          ← Về thư viện
        </button>
      </header>
      <main className="vote-page-main">
        <div className="vote-page-intro">
          <p className="eyebrow">READER'S CHOICE</p>
          <h1>
            Phiếu bầu của bạn,
            <br />
            <i>ngôi sao tiếp theo.</i>
          </h1>
          <p>
            Khám phá các series đang tranh tài, chọn câu chuyện bạn muốn nhìn
            thấy ở kỳ phát hành tiếp theo.
          </p>
        </div>
        <div className="modal vote-modal vote-page-card">
          <ErrorBoundary
            fallbackTitle="Không tải được trang bình chọn"
            fallbackMessage="Một lỗi bất ngờ xảy ra ở màn vote. Hãy thử lại hoặc quay về thư viện."
          >
            <VotePanel onRead={openLatestChapter} readError={readerError} />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}