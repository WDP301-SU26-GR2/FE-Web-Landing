import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  "https://api-mangaka.novaproj.site";
const SERIES_PER_PAGE = 8;
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

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.success === false) {
    const error = new Error(
      payload.message || "Không thể kết nối tới hệ thống.",
    );
    error.retryAfter = payload.retryAfter;
    throw error;
  }
  return payload.data ?? payload;
}
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
    [tab, setTab] = useState(""),
    [page, setPage] = useState(0);
  const [ranking, setRanking] = useState({ period: null, results: [] }),
    [reader, setReader] = useState(null),
    [detail, setDetail] = useState(null),
    [voteOpen, setVoteOpen] = useState(false);
  const loadSeries = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        limit: String(SERIES_PER_PAGE),
        offset: String(page * SERIES_PER_PAGE),
      });
      if (query) qs.set("q", query);
      if (genre) qs.set("genre", genre);
      if (tab) qs.set("status", tab);
      const data = await api(`/public/series?${qs}`);
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
  }, [query, genre, tab, page]);
  useEffect(() => {
    api("/vote/results/latest")
      .then(setRanking)
      .catch(() => {});
  }, []);
  const openDetail = async (id) => {
    try {
      const data = await api(`/public/series/${id}`);
      setDetail(data);
      document.body.classList.add("locked");
    } catch (e) {
      setError(e.message);
    }
  };
  const openReader = async (id) => {
    try {
      const data = await api(`/public/chapters/${id}/pages`);
      setReader(data);
      document.body.classList.add("locked");
    } catch (e) {
      setError(e.message);
    }
  };
  const close = () => {
    setReader(null);
    setDetail(null);
    setVoteOpen(false);
    document.body.classList.remove("locked");
  };
  return (
    <>
      <header>
        <a className="brand" href="#top">
          <img src={LOGO_URL} alt={SYSTEM_NAME} /> <span>{SYSTEM_NAME}</span>
        </a>
        <nav>
          <a href="#catalog">Khám phá</a>
          <a href="#ranking">Bảng xếp hạng</a>
          <button className="nav-vote" onClick={() => setVoteOpen(true)}>
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
              <button className="btn ghost" onClick={() => setVoteOpen(true)}>
                ✦ Bình chọn ngay
              </button>
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
          </div>
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
            <button className="btn primary" onClick={() => setVoteOpen(true)}>
              Tham gia bình chọn <b>→</b>
            </button>
          </div>
          <div className="rank-list">
            <div className="rank-head">
              <span>XẾP HẠNG MỚI NHẤT</span>
              <small>
                {ranking.period
                  ? `Kỳ ${ranking.period.reflectedIssueNumber || ranking.period.issueNumber || ""}`
                  : "Đang cập nhật"}
              </small>
            </div>
            {ranking.results?.slice(0, 5).map((r, i) => (
              <div className="rank-row" key={r.seriesId}>
                <strong>0{i + 1}</strong>
                <div>
                  <h3>{r.seriesTitle || "Series không còn hiển thị"}</h3>
                  <p>
                    {r.publicationType || "SERIES"} ·{" "}
                    {Math.round(r.voteCount || 0)} lượt bình chọn
                  </p>
                </div>
                <span
                  className={
                    r.rankChange > 0 ? "up" : r.rankChange < 0 ? "down" : ""
                  }
                >
                  {r.rankChange
                    ? `${r.rankChange > 0 ? "↑" : "↓"} ${Math.abs(r.rankChange)}`
                    : "—"}
                </span>
              </div>
            ))}
            {!ranking.results?.length && (
              <p className="empty dark">Chưa có bảng xếp hạng đã công bố.</p>
            )}
          </div>
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
      {voteOpen && <VoteModal close={close} />}
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
function VoteModal({ close }) {
  const [ctx, setCtx] = useState(null),
    [selected, setSelected] = useState([]),
    [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [notice, setNotice] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/vote/context")
      .then(setCtx)
      .catch((e) => setNotice(e.message));
  }, []);
  const token = "kirameki-guest";
  const toggle = (id) =>
    setSelected((x) =>
      x.includes(id)
        ? x.filter((v) => v !== id)
        : x.length < (ctx?.maxSeriesPerVote || 3)
          ? [...x, id]
          : x,
    );
  const send = async () => {
    setBusy(true);
    try {
      await api("/vote/otp", {
        method: "POST",
        body: JSON.stringify({ identity: email, captchaToken: token }),
      });
      setSent(true);
      setNotice("Mã xác nhận đã được gửi đến email của bạn.");
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };
  const vote = async () => {
    setBusy(true);
    try {
      await api("/vote", {
        method: "POST",
        body: JSON.stringify({
          surveyPeriodId: ctx.period.id,
          identity: email,
          otpCode: otp,
          seriesIds: selected,
          captchaToken: token,
        }),
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
      <div className="modal-wrap">
        <div className="modal vote-modal loading-modal">
          <button className="close" onClick={close}>
            ×
          </button>
          {notice || "Đang mở kỳ bình chọn..."}
        </div>
      </div>
    );
  if (!ctx.period)
    return (
      <div className="modal-wrap">
        <div className="modal vote-modal loading-modal">
          <button className="close" onClick={close}>
            ×
          </button>
          <h2>Chưa có kỳ bình chọn</h2>
          <p>Hãy quay lại khi Kirameki mở kỳ bình chọn tiếp theo nhé.</p>
        </div>
      </div>
    );
  return (
    <div className="modal-wrap">
      <div className="modal vote-modal">
        <button className="close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">KỲ BÌNH CHỌN #{ctx.period.issueNumber || ""}</p>
        <h2>
          Chọn câu chuyện
          <br />
          <i>bạn yêu thích.</i>
        </h2>
        <p className="vote-help">
          Chọn tối đa {ctx.maxSeriesPerVote} series. Mỗi email chỉ có một lá
          phiếu trong kỳ này.
        </p>
        <div className="vote-options">
          {ctx.series.map((s) => (
            <button
              className={selected.includes(s.id) ? "picked" : ""}
              onClick={() => toggle(s.id)}
              key={s.id}
            >
              <span>{selected.includes(s.id) ? "✓" : "+"}</span>
              <b>{s.title}</b>
              <small>{s.genres?.map((g) => VI[g] || g).join(" · ")}</small>
            </button>
          ))}
        </div>
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
            disabled={busy || !email || !selected.length || (!sent && false)}
            onClick={sent ? vote : send}
          >
            {busy ? "Đang xử lý..." : sent ? "Gửi lá phiếu →" : "Nhận mã OTP →"}
          </button>
        </div>
        {notice && <p className="vote-notice">{notice}</p>}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
