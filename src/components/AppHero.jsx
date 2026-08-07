export function AppHero({ total, hasOpenVotePeriod, onVoteClick }) {
  return (
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
          <button className="btn ghost" onClick={onVoteClick}>
            ✦ Bình chọn ngay
          </button>
        </div>
        <div className="hero-proof" aria-label="Thông tin thư viện">
          <div>
            <strong>{total || "—"}</strong>
            <span>series đang mở</span>
          </div>
          <div>
            <strong>TOP</strong>
            <span>bảng xếp hạng công khai</span>
          </div>
          <div className={hasOpenVotePeriod ? "live" : ""}>
            <strong>{hasOpenVotePeriod ? "LIVE" : "SOON"}</strong>
            <span>
              {hasOpenVotePeriod
                ? "kỳ bình chọn đang mở"
                : "đón kỳ bình chọn mới"}
            </span>
          </div>
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="sun"></div>
        <div className="arc arc1"></div>
        <div className="arc arc2"></div>
      </div>
    </section>
  );
}
