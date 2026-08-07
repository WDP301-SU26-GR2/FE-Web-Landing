import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { publicApi } from "./api/public.service";
import { useCatalog } from "./hooks/useCatalog";
import { AppHeader } from "./components/AppHeader";
import { AppHero } from "./components/AppHero";
import { AppFooter } from "./components/AppFooter";
import { CatalogSection } from "./components/CatalogSection";
import { RankingPanel } from "./components/RankingPanel";
import { SeriesModal } from "./components/SeriesModal";
import { Reader } from "./components/Reader";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useHashNavigate } from "./lib/useHashNavigate";

const VotePage = lazy(() =>
  import("./components/VotePage").then((m) => ({ default: m.VotePage })),
);

function App() {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [demographic, setDemographic] = useState("");
  const [publicationType, setPublicationType] = useState("");
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(0);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [hasOpenVotePeriod, setHasOpenVotePeriod] = useState(false);
  const [openVotePeriods, setOpenVotePeriods] = useState(null);
  const [reader, setReader] = useState(null);
  const [detail, setDetail] = useState(null);
  const { hash, navigate } = useHashNavigate();

  const { series, total, loading, error, perPage } = useCatalog({
    query,
    genre,
    demographic,
    publicationType,
    tab,
    page,
    revision: catalogRevision,
  });

  useEffect(() => {
    publicApi
      .getOpenVotePeriods()
      .then((data) => {
        const periods = data.items || [];
        setOpenVotePeriods(periods);
        setHasOpenVotePeriod(Boolean(periods.length));
      })
      .catch(() => {
        setOpenVotePeriods([]);
        setHasOpenVotePeriod(false);
      });
  }, []);

  const openDetail = async (id) => {
    try {
      setDetail(await publicApi.getSeriesDetail(id));
    } catch (e) {
      setDetail(null);
    }
  };

  const openReader = async (id) => {
    try {
      setReader(await publicApi.getChapterPages(id));
      return true;
    } catch {
      return false;
    }
  };

  const resetFilters = () => {
    setQuery("");
    setGenre("");
    setDemographic("");
    setPublicationType("");
    setTab("");
    setPage(0);
  };

  const openVotePage = () => navigate("vote");
  const closeVotePage = () => navigate("top");

  if (hash === "vote") {
    const voteLoadingLabel = "Đang tải trang bình chọn";
    return (
      <Suspense fallback={<div className="vote-page-loading" aria-label={voteLoadingLabel} />}>
        <VotePage close={closeVotePage} />
      </Suspense>
    );
  }

  return (
    <>
      <AppHeader onVoteClick={openVotePage} />
      <main id="top">
        <AppHero
          total={total}
          hasOpenVotePeriod={hasOpenVotePeriod}
          onVoteClick={openVotePage}
        />
        <div className="ticker" aria-label="Đọc, bình chọn, tỏa sáng">
          <div className="ticker-track">
            {Array.from({ length: 2 }, (_, group) => (
              <div className="ticker-group" key={group} aria-hidden={group === 1}>
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i}>ĐỌC · BÌNH CHỌN · TỎA SÁNG</span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <CatalogSection
          total={total}
          loading={loading}
          series={series}
          error={error}
          query={query}
          genre={genre}
          demographic={demographic}
          publicationType={publicationType}
          tab={tab}
          page={page}
          onQueryChange={(v) => { setQuery(v); setPage(0); }}
          onGenreChange={(v) => { setGenre(v); setPage(0); }}
          onDemographicChange={(v) => { setDemographic(v); setPage(0); }}
          onPublicationTypeChange={(v) => { setPublicationType(v); setPage(0); }}
          onTabChange={(v) => { setTab(v); setPage(0); }}
          onPageChange={setPage}
          onResetFilters={resetFilters}
          onRetry={() => setCatalogRevision((n) => n + 1)}
          onOpenDetail={openDetail}
        />
        <section className="ranking" id="ranking">
          <div className="ranking-intro">
            <p className="eyebrow">BÌNH CHỌN ĐỘC GIẢ</p>
            <h2>
              Tiếng nói của bạn
              <br />
              <i>tạo nên thứ hạng.</i>
            </h2>
            <p>
              Những câu chuyện được cộng đồng{" "}
              {openVotePeriods?.[0]?.magazine?.trim() || "độc giả"} yêu mến
              nhất ở kỳ bình chọn gần đây.
            </p>
            <button className="btn primary" onClick={openVotePage}>
              Tham gia bình chọn <b>→</b>
            </button>
          </div>
          <ErrorBoundary
            fallbackTitle="Không tải được bảng xếp hạng"
            fallbackMessage="Một lỗi bất ngờ xảy ra ở bảng xếp hạng. Bạn vẫn có thể khám phá thư viện hoặc tham gia bình chọn."
          >
            <RankingPanel openVotePeriods={openVotePeriods} />
          </ErrorBoundary>
        </section>
      </main>
      <AppFooter />
      {detail && (
        <SeriesModal
          detail={detail}
          close={() => setDetail(null)}
          read={openReader}
        />
      )}
      {reader && (
        <Reader
          reader={reader}
          close={() => setReader(null)}
          go={openReader}
        />
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
