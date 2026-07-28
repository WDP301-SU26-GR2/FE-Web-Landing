import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { publicApi } from "./api/public.service";
import { RankingPanel } from "./components/RankingPanel";
import { VotePanel } from "./components/VotePanel";

const SERIES_PER_PAGE = 8;
const VOTE_SERIES_PER_PAGE = 8;
const LOGO_URL =
  "https://res.cloudinary.com/dbsbfvz2f/image/upload/f_auto,q_auto/Gemini_Generated_Image_d713d4d713d4d713_hlbjvd.png";
const SYSTEM_NAME = "Manga Creation Workflow and Publishing Management System";
const VI = {
  ACTION: "Hành động",
  ADVENTURE: "Phiêu lưu",
  COMEDY: "Hài hước",
  DRAMA: "Chính kịch",
  FANTASY: "Kỳ ảo",
  HORROR: "Kinh dị",
  MYSTERY: "Bí ẩn",
  ROMANCE: "Lãng mạn",
  SCI_FI: "Viễn tưởng",
  SLICE_OF_LIFE: "Đời thường",
  SPORTS: "Thể thao",
  SUPERNATURAL: "Siêu nhiên",
  THRILLER: "Giật gân",
  HISTORICAL: "Lịch sử",
  ISEKAI: "Dị giới",
  MECHA: "Robot",
  PSYCHOLOGICAL: "Tâm lý",
};

const formatDate = (date) =>
  date
    ? new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(date))
    : "Đang cập nhật";
const status = (value) =>
  ({
    SERIALIZED: "Đang ra mắt",
    HIATUS: "Tạm nghỉ",
    COMPLETING: "Sắp hoàn thành",
    CANCELLING: "Sắp kết thúc",
    COMPLETED: "Hoàn thành",
    CANCELLED: "Đã hủy",
  })[value] || value;

function App() {
  const [series, setSeries] = useState([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [genre, setGenre] = useState(""),
    [demographic, setDemographic] = useState(""),
    [publicationType, setPublicationType] = useState(""),
    [tab, setTab] = useState(""),
    [page, setPage] = useState(0);
  const [hasOpenVotePeriod, setHasOpenVotePeriod] = useState(false),
    [reader, setReader] = useState(null),
    [detail, setDetail] = useState(null),
    [voteRoute, setVoteRoute] = useState(() => window.location.hash === "#vote");
  const loadSeries = async () => {
    setLoading(true);
    try {
      const data = await publicApi.getCatalog({
        limit: SERIES_PER_PAGE,
        offset: page * SERIES_PER_PAGE,
        q: query,
        genre,
        demographic,
        publicationType,
        status: tab,
      });
      setSeries(data.items || []);
      setTotal(data.total || 0);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const id = setTimeout(loadSeries, 250);
    return () => clearTimeout(id);
  }, [query, genre, demographic, publicationType, tab, page]);
  useEffect(() => {
    publicApi
      .getOpenVotePeriods()
      .then((data) => setHasOpenVotePeriod(Boolean(data.items?.length)))
      .catch(() => setHasOpenVotePeriod(false));
  }, []);
  useEffect(() => {
    const syncRoute = () => setVoteRoute(window.location.hash === "#vote");
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);
  const resetCatalogFilters = () => {
    setQuery("");
    setGenre("");
    setDemographic("");
    setPublicationType("");
    setTab("");
    setPage(0);
  };
  const openDetail = async (id) => {
    try {
      const data = await publicApi.getSeriesDetail(id);
      setDetail(data);
      document.body.classList.add("locked");
    } catch (e) {
      setError(e.message);
    }
  };
  const openReader = async (id) => {
    try {
      const data = await publicApi.getChapterPages(id);
      setReader(data);
      document.body.classList.add("locked");
    } catch (e) {
      setError(e.message);
    }
  };
  const close = () => {
    setReader(null);
    setDetail(null);
    document.body.classList.remove("locked");
  };
  const openVotePage = () => {
    window.location.hash = "vote";
  };
  const closeVotePage = () => {
    window.location.hash = "top";
  };
  const magazines = [...new Set(series.map((item) => item.magazine).filter(Boolean))];
  if (voteRoute) return <VotePage close={closeVotePage} />;
  return (
    <>
      <header>
        <a className="brand" href="#top">
          <img src={LOGO_URL} alt={SYSTEM_NAME} /> <span>{SYSTEM_NAME}</span>
        </a>
        <nav>
          <a href="#catalog">Khám phá</a>
          <a href="#ranking">Bảng xếp hạng</a>
          <button className="nav-vote" onClick={openVotePage}>
            Bình chọn
          </button>
        </nav>
      </header>
      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <h1>
              Mỗi trang truyện,
              <br />
              <i>một vũ trụ.</i>
            </h1>
            <p className="lead">
              Đọc những series đang được yêu thích nhất, tìm câu chuyện khiến
              bạn rung động và để lá phiếu của bạn chọn nên ngôi sao tiếp theo.
            </p>
            <div className="hero-actions">
              <a className="btn primary" href="#catalog">
                Khám phá series <b>→</b>
              </a>
              <button className="btn ghost" onClick={openVotePage}>
                ✦ Bình chọn ngay
              </button>
            </div>
            <div className="hero-proof" aria-label="Thông tin thư viện">
              <div><strong>{total || "—"}</strong><span>series đang mở</span></div>
              <div><strong>TOP</strong><span>bảng xếp hạng công khai</span></div>
              <div className={hasOpenVotePeriod ? "live" : ""}><strong>{hasOpenVotePeriod ? "LIVE" : "SOON"}</strong><span>{hasOpenVotePeriod ? "kỳ bình chọn đang mở" : "đón kỳ bình chọn mới"}</span></div>
            </div>
          </div>
          <div className="hero-art">
            <div className="sun"></div>
            <div className="hero-card">
              <span>ISSUE 07</span>
              <strong>
                Stories
                <br />
                that stay.
              </strong>
              <em>Manga Publishing</em>
            </div>
            <div className="arc arc1"></div>
            <div className="arc arc2"></div>
            <p>
              読 む<br />夢 見 る
            </p>
          </div>
        </section>
        <section className="ticker" aria-label="Đọc, bình chọn, tỏa sáng">
          <div className="ticker-track">
            <div className="ticker-group">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i}>ĐỌC · BÌNH CHỌN · TỎA SÁNG</span>
              ))}
            </div>
            <div className="ticker-group" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i}>ĐỌC · BÌNH CHỌN · TỎA SÁNG</span>
              ))}
            </div>
          </div>
        </section>
        <section className="catalog" id="catalog">
          <div className="section-head">
            <div>
              <p className="eyebrow">THƯ VIỆN SERIES</p>
              <h2>
                Tìm một thế giới
                <br />
                để <i>đắm mình.</i>
              </h2>
            </div>
            <p className="count">{total} series đang chờ bạn</p>
          </div>
          <div className="filters">
            <label>
              ⌕{" "}
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Tìm theo tên truyện..."
              />
            </label>
          </div>
          <div className="catalog-controls">
            <div className="tabs">
              {[
                ["", "Tất cả"],
                ["SERIALIZED", "Đang phát hành"],
                ["HIATUS", "Tạm nghỉ"],
                ["COMPLETING", "Sắp hoàn thành"],
                ["CANCELLING", "Sắp kết thúc"],
                ["COMPLETED", "Đã hoàn thành"],
                ["CANCELLED", "Đã hủy"],
              ].map(([key, label]) => (
                <button
                  className={tab === key ? "active" : ""}
                  onClick={() => {
                    setTab(key);
                    setPage(0);
                  }}
                  key={label}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              className="genre-filter"
              value={genre}
              onChange={(e) => {
                setGenre(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Tất cả thể loại</option>
              {Object.entries(VI).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select className="genre-filter" value={publicationType} onChange={(e) => { setPublicationType(e.target.value); setPage(0); }}>
              <option value="">Mọi nhịp xuất bản</option>
              <option value="WEEKLY">Hàng tuần</option>
              <option value="MONTHLY">Hàng tháng</option>
              <option value="IRREGULAR">Không định kỳ</option>
            </select>
            <select className="genre-filter" value={demographic} onChange={(e) => { setDemographic(e.target.value); setPage(0); }}>
              <option value="">Mọi đối tượng</option>
              <option value="SHONEN">Shōnen</option>
              <option value="SHOJO">Shōjo</option>
              <option value="SEINEN">Seinen</option>
              <option value="JOSEI">Josei</option>
              <option value="KODOMO">Kodomo</option>
            </select>
          </div>
          {(query || genre || demographic || publicationType || tab) && (
            <div className="active-filters">
              <span>Đang lọc thư viện theo lựa chọn của bạn</span>
              <button onClick={resetCatalogFilters}>Xóa tất cả ×</button>
            </div>
          )}
          {error && (
            <div className="alert">
              {error}
              <button onClick={loadSeries}>Thử lại</button>
            </div>
          )}
          <div className="series-grid">
            {loading
              ? Array.from({ length: 8 }, (_, i) => (
                  <div className="skeleton" key={i} />
                ))
              : series.map((item, i) => (
                  <article className="series-card" key={item.id}>
                    <button
                      className="cover"
                      onClick={() => openDetail(item.id)}
                    >
                      {item.coverImageUrl ? (
                        <img src={item.coverImageUrl} alt={item.title} />
                      ) : (
                        <div className={`placeholder p${i % 5}`}>
                          MANGA
                          <br />
                          <b>{item.title}</b>
                        </div>
                      )}
                      <span>{status(item.status)}</span>
                      <span className="cover-action">Khám phá <b>↗</b></span>
                    </button>
                    <div className="series-info">
                      <div>
                        <p className="meta">
                          {item.publicationType || "SERIES"} ·{" "}
                          {item.publishedChapterCount} chương
                        </p>
                        <h3>{item.title}</h3>
                      </div>
                      <button
                        className="round"
                        aria-label="Xem series"
                        onClick={() => openDetail(item.id)}
                      >
                        ↗
                      </button>
                    </div>
                    <div className="tags">
                      {item.genres?.slice(0, 2).map((g) => (
                        <span key={g}>{VI[g] || g}</span>
                      ))}
                    </div>
                  </article>
                ))}
          </div>
          {!loading && !series.length && (
            <p className="empty">Chưa tìm thấy series phù hợp.</p>
          )}
          {!loading && total > 0 && (
            <nav className="pagination" aria-label="Phân trang series">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Trước
              </button>
              <span>
                Trang {page + 1} /{" "}
                {Math.max(1, Math.ceil(total / SERIES_PER_PAGE))}
              </span>
              {Array.from(
                { length: Math.ceil(total / SERIES_PER_PAGE) },
                (_, i) => (
                  <button
                    key={i}
                    className={i === page ? "current" : ""}
                    onClick={() => setPage(i)}
                  >
                    {i + 1}
                  </button>
                ),
              )}
              <button
                disabled={page >= Math.ceil(total / SERIES_PER_PAGE) - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau →
              </button>
            </nav>
          )}
        </section>
        <section className="ranking" id="ranking">
          <div className="ranking-intro">
            <p className="eyebrow">BÌNH CHỌN ĐỘC GIẢ</p>
            <h2>
              Tiếng nói của bạn
              <br />
              <i>tạo nên thứ hạng.</i>
            </h2>
            <p>
              Những câu chuyện được cộng đồng Kirameki yêu mến nhất ở kỳ bình
              chọn gần đây.
            </p>
            <button className="btn primary" onClick={openVotePage}>
              Tham gia bình chọn <b>→</b>
            </button>
          </div>
          <RankingPanel magazines={magazines} />
        </section>
      </main>
      <footer>
        <a className="brand" href="#top">
          <img src={LOGO_URL} alt={SYSTEM_NAME} /> <span>{SYSTEM_NAME}</span>
        </a>
        <p>Những câu chuyện đáng được tìm thấy.</p>
        <a href="#top">Lên đầu trang ↑</a>
      </footer>
      {detail && (
        <SeriesModal detail={detail} close={close} read={openReader} />
      )}{" "}
      {reader && <Reader reader={reader} close={close} go={openReader} />}{" "}
    </>
  );
}

function SeriesModal({ detail, close, read }) {
  return (
    <div className="modal-wrap">
      <div className="modal series-modal">
        <button className="close" onClick={close}>
          ×
        </button>
        <div className="detail-cover">
          {detail.coverImageUrl ? (
            <img src={detail.coverImageUrl} alt="" />
          ) : (
            <div>
              ✦<br />
              KIRAMEKI
            </div>
          )}
        </div>
        <div className="detail-content">
          <p className="eyebrow">
            {detail.publicationType || "SERIES"} · {status(detail.status)}
          </p>
          <h2>{detail.title}</h2>
          <div className="detail-stats">
            <span>{detail.chapters?.length || 0} chương đã phát hành</span>
            <span>{detail.mangaka?.displayName || detail.mangakaName || "Tác giả Kirameki"}</span>
          </div>
          <div className="tags">
            {detail.genres?.map((g) => (
              <span key={g}>{VI[g] || g}</span>
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
                <em>{formatDate(c.publishedAt)} →</em>
              </button>
            ))}
            {!detail.chapters?.length && <p>Series sắp ra mắt.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
function Reader({ reader, close, go }) {
  return (
    <div className="reader">
      <div className="reader-bar">
        <button onClick={close}>← Thư viện</button>
        <p>
          {reader.series.title} <span>/ Ch.{reader.chapter.chapterNumber}</span>
        </p>
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          ↑ Đầu trang
        </button>
      </div>
      <div className="reader-progress"><span>Đọc trọn chương</span><b>{reader.pages.length} trang</b></div>
      <div className="pages">
        {reader.pages.map((p) => (
          <img
            key={p.pageNumber}
            src={p.imageUrl}
            alt={`Trang ${p.pageNumber}`}
          />
        ))}
      </div>
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
function VotePage({ close }) {
  const [reader, setReader] = useState(null);
  const [readerError, setReaderError] = useState("");
  const openLatestChapter = async (seriesId) => {
    try {
      setReaderError("");
      const series = await publicApi.getSeriesDetail(seriesId);
      const latestChapter = [...(series.chapters || [])].sort((a, b) => b.chapterNumber - a.chapterNumber)[0];
      if (!latestChapter) {
        setReaderError("Series này chưa có chương đã xuất bản để đọc.");
        return;
      }
      setReader(await publicApi.getChapterPages(latestChapter.id));
    } catch (error) {
      setReaderError(error.message || "Không thể mở chương truyện này.");
    }
  };
  if (reader) return <Reader reader={reader} close={() => setReader(null)} go={async (chapterId) => setReader(await publicApi.getChapterPages(chapterId))} />;
  return (
    <div className="vote-page">
      <header>
        <a className="brand" href="#top">
          <img src={LOGO_URL} alt={SYSTEM_NAME} /> <span>{SYSTEM_NAME}</span>
        </a>
        <button className="back-link" onClick={close}>← Về thư viện</button>
      </header>
      <main className="vote-page-main">
        <div className="vote-page-intro">
          <p className="eyebrow">READER'S CHOICE</p>
          <h1>Phiếu bầu của bạn,<br /><i>ngôi sao tiếp theo.</i></h1>
          <p>Khám phá các series đang tranh tài, chọn câu chuyện bạn muốn nhìn thấy ở kỳ phát hành tiếp theo.</p>
        </div>
        <div className="modal vote-modal vote-page-card">
          <VotePanel onRead={openLatestChapter} readError={readerError} />
        </div>
      </main>
    </div>
  );
}

function VoteModal({ close, standalone = false, onRead, readError }) {
  const [ctx, setCtx] = useState(null),
    [voteType, setVoteType] = useState("WEEKLY"),
    [selected, setSelected] = useState([]),
    [voteQuery, setVoteQuery] = useState(""),
    [voteSeriesPage, setVoteSeriesPage] = useState(0),
    [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [notice, setNotice] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [cooldown, setCooldown] = useState(0);
  const wrapperClass = standalone ? "vote-page-content" : "modal-wrap";
  const cardClass = standalone ? "modal vote-modal vote-page-card" : "modal vote-modal";
  useEffect(() => {
    setCtx(null);
    setSelected([]);
    setVoteQuery("");
    setVoteSeriesPage(0);
    setSent(false);
    const loadCatalog = async () => {
      const first = await publicApi.getCatalog({ publicationType: voteType, limit: 50, offset: 0 });
      const pageCount = Math.ceil((first.total || 0) / 50);
      const remaining = await Promise.all(
        Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
          publicApi.getCatalog({ publicationType: voteType, limit: 50, offset: (index + 1) * 50 }),
        ),
      );
      return [first, ...remaining].flatMap((page) => page.items || []);
    };
    Promise.all([publicApi.getVoteContext(voteType), loadCatalog()])
      .then(([context, catalog]) => {
        const coverById = new Map(catalog.map((series) => [series.id, series.coverImageUrl]));
        setCtx({ ...context, series: (context.series || []).map((series) => ({ ...series, coverImageUrl: coverById.get(series.id) })) });
      })
      .catch((e) => setNotice(e.message));
  }, [voteType]);
  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const filteredSeries = (ctx?.series || []).filter((series) => {
    const haystack = `${series.title || ""} ${(series.genres || []).join(" ")}`.toLowerCase();
    return haystack.includes(voteQuery.trim().toLowerCase());
  });
  const votePageCount = Math.max(1, Math.ceil(filteredSeries.length / VOTE_SERIES_PER_PAGE));
  const displayedSeries = filteredSeries.slice(
    voteSeriesPage * VOTE_SERIES_PER_PAGE,
    (voteSeriesPage + 1) * VOTE_SERIES_PER_PAGE,
  );
  const toggle = (id) =>
    setSelected((x) =>
      x.includes(id)
        ? x.filter((v) => v !== id)
        : x.length < (ctx?.maxSeriesPerVote || 3)
          ? [...x, id]
          : x,
    );
  const send = async () => {
    if (!email.includes("@")) {
      setNotice("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }
    setBusy(true);
    try {
      await publicApi.sendVoteOtp(email);
      setSent(true);
      setNotice("Mã xác nhận đã được gửi đến email của bạn.");
    } catch (e) {
      setNotice(e.message);
      if (e.retryAfter) setCooldown(e.retryAfter);
    } finally {
      setBusy(false);
    }
  };
  const vote = async () => {
    if (otp.trim().length !== 6) {
      setNotice("Vui lòng nhập mã OTP gồm 6 chữ số.");
      return;
    }
    setBusy(true);
    try {
      await publicApi.submitVote({
        surveyPeriodId: ctx.period.id,
        identity: email,
        otpCode: otp,
        seriesIds: selected,
      });
      setNotice(
        "Bình chọn thành công. Cảm ơn bạn đã cùng Kirameki chọn ra những câu chuyện tuyệt vời!",
      );
      setSelected([]);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!ctx)
    return (
      <div className={wrapperClass}>
        <div className={`${cardClass} loading-modal`}>
          <button className="close" onClick={close}>
            ×
          </button>
          {notice || "Đang mở kỳ bình chọn..."}
        </div>
      </div>
    );
  if (!ctx.period)
    return (
      <div className={wrapperClass}>
        <div className={`${cardClass} loading-modal`}>
          <button className="close" onClick={close}>
            ×
          </button>
          <h2>Chưa có kỳ bình chọn</h2>
          <p>Hãy quay lại khi Kirameki mở kỳ bình chọn tiếp theo nhé.</p>
        </div>
      </div>
    );
  return (
    <div className={wrapperClass}>
      <div className={cardClass}>
        <button className="close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">KỲ BÌNH CHỌN #{ctx.period.issueNumber || ""}</p>
        <div className="vote-types" role="tablist" aria-label="Loại tạp chí">
          {["WEEKLY", "MONTHLY", "IRREGULAR"].map((type) => (
            <button
              key={type}
              className={voteType === type ? "picked" : ""}
              onClick={() => setVoteType(type)}
              type="button"
            >
              {type === "WEEKLY" ? "Tuần" : type === "MONTHLY" ? "Tháng" : "Không định kỳ"}
            </button>
          ))}
        </div>
        <h2>
          Chọn câu chuyện
          <br />
          <i>bạn yêu thích.</i>
        </h2>
        <p className="vote-help">
          Chọn tối đa {ctx.maxSeriesPerVote} series thuộc cùng một tạp chí. Mỗi email có một lá
          phiếu cho mỗi loại tạp chí trong kỳ này.
        </p>
        <div className="vote-toolbar">
          <label className="vote-search">
            <span>⌕</span>
            <input
              value={voteQuery}
              onChange={(event) => { setVoteQuery(event.target.value); setVoteSeriesPage(0); }}
              placeholder="Tìm series hoặc thể loại"
            />
          </label>
          <div className="vote-counter"><b>{selected.length}</b> / {ctx.maxSeriesPerVote || 3} đã chọn</div>
        </div>
        <div className="vote-grid-head">
          <div><span>ĐANG TRANH TÀI</span><b>{filteredSeries.length} series để bạn khám phá</b></div>
          <small>Chọn tối đa {ctx.maxSeriesPerVote || 3} bộ</small>
        </div>
        <div className="vote-options">
          {displayedSeries.map((s) => {
            const isSelected = selected.includes(s.id);
            const isDisabled = !isSelected && selected.length >= (ctx.maxSeriesPerVote || 3);
            return (
            <article className={`vote-series-card ${isSelected ? "picked" : ""}`} key={s.id}>
              <button
                className="vote-select"
                onClick={() => toggle(s.id)}
                disabled={isDisabled}
                aria-pressed={isSelected}
              >
                <span className="vote-check">{isSelected ? "✓" : "+"}</span>
                <span className="vote-cover">
                  {s.coverImageUrl ? <img src={s.coverImageUrl} alt="" /> : <b>{s.title?.slice(0, 1)}</b>}
                </span>
                <span className="vote-series-copy"><b>{s.title}</b><small>{s.genres?.map((g) => VI[g] || g).join(" · ")}</small></span>
              </button>
              {onRead && <button className="vote-read" onClick={() => onRead(s.id)}>Đọc mới nhất ↗</button>}
            </article>
            );
          })}
        </div>
        {readError && <p className="vote-read-error">{readError}</p>}
        {!displayedSeries.length && <p className="vote-empty">Không tìm thấy series phù hợp trong tạp chí này.</p>}
        {votePageCount > 1 && (
          <nav className="vote-pagination" aria-label="Phân trang series bình chọn">
            <button disabled={voteSeriesPage === 0} onClick={() => setVoteSeriesPage((current) => current - 1)}>←</button>
            <span>Hiển thị {voteSeriesPage * VOTE_SERIES_PER_PAGE + 1}–{Math.min((voteSeriesPage + 1) * VOTE_SERIES_PER_PAGE, filteredSeries.length)} / {filteredSeries.length}</span>
            <button disabled={voteSeriesPage >= votePageCount - 1} onClick={() => setVoteSeriesPage((current) => current + 1)}>→</button>
          </nav>
        )}
        <div className="vote-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email của bạn"
          />
          {sent && (
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Mã OTP"
            />
          )}
          <button
            className="btn primary"
            disabled={busy || cooldown > 0 || !email || !selected.length}
            onClick={sent ? vote : send}
          >
            {busy ? "Đang xử lý..." : sent ? "Gửi lá phiếu →" : cooldown ? `Gửi lại sau ${cooldown}s` : "Nhận mã OTP →"}
          </button>
        </div>
        {notice && <p className="vote-notice">{notice}</p>}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
