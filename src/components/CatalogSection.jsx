import { formatSeriesStatus, VI_GENRE } from "../lib/series-format";

export function CatalogSection({
  total,
  loading,
  series,
  error,
  query,
  genre,
  demographic,
  publicationType,
  tab,
  page,
  onQueryChange,
  onGenreChange,
  onDemographicChange,
  onPublicationTypeChange,
  onTabChange,
  onPageChange,
  onResetFilters,
  onRetry,
  onOpenDetail,
}) {
  return (
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
              onQueryChange(e.target.value);
              onPageChange(0);
            }}
            placeholder="Tìm theo tên truyện..."
          />
        </label>
      </div>
      <div className="catalog-controls">
        <div className="tabs">
          {[
            ["", "Tất cả"],
            ["ACTIVE", "Đang phát hành"],
            ["HIATUS", "Tạm nghỉ"],
            ["COMPLETED", "Đã kết thúc"],
            ["CANCELLED", "Đã hủy"],
          ].map(([key, label]) => (
            <button
              className={tab === key ? "active" : ""}
              onClick={() => {
                onTabChange(key);
                onPageChange(0);
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
            onGenreChange(e.target.value);
            onPageChange(0);
          }}
        >
          <option value="">Tất cả thể loại</option>
          {Object.entries(VI_GENRE).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          className="genre-filter"
          value={publicationType}
          onChange={(e) => {
            onPublicationTypeChange(e.target.value);
            onPageChange(0);
          }}
        >
          <option value="">Mọi nhịp xuất bản</option>
          <option value="WEEKLY">Hàng tuần</option>
          <option value="MONTHLY">Hàng tháng</option>
          <option value="IRREGULAR">Không định kỳ</option>
        </select>
        <select
          className="genre-filter"
          value={demographic}
          onChange={(e) => {
            onDemographicChange(e.target.value);
            onPageChange(0);
          }}
        >
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
          <button onClick={onResetFilters}>Xóa tất cả ×</button>
        </div>
      )}
      {error && (
        <div className="alert">
          {error}
          <button onClick={onRetry}>Thử lại</button>
        </div>
      )}
      <div className="series-grid">
        {loading
          ? Array.from({ length: 12 }, (_, i) => (
              <div className="skeleton" key={i} role="status" aria-label="Đang tải series..." />
            ))
          : series.map((item, i) => (
              <article className="series-card" key={item.id}>
                <button
                  className="cover"
                  onClick={() => onOpenDetail(item.id)}
                >
                  {item.coverImageUrl ? (
                    <img src={item.coverImageUrl} alt={item.title} />
                  ) : (
                    <div className={`placeholder p${i % 5}`}>
                      Chưa có ảnh bìa
                      <br />
                      <b>{item.title}</b>
                    </div>
                  )}
                  <span>{formatSeriesStatus(item.status)}</span>
                  <span className="cover-action">
                    Khám phá <b>↗</b>
                  </span>
                </button>
                <div className="series-info">
                  <div>
                    <p className="meta">
                      {item.publicationType || "SERIES"} ·{" "}
                      {item.publishedChapterCount} chương
                    </p>
                    <h3>{item.title}</h3>
                    {item.author?.displayName && (
                      <p className="series-author">
                        Tác giả: {item.author.displayName}
                      </p>
                    )}
                  </div>
                  <button
                    className="round"
                    aria-label="Xem series"
                    onClick={() => onOpenDetail(item.id)}
                  >
                    ↗
                  </button>
                </div>
                <div className="tags">
                  {item.genres?.slice(0, 2).map((g) => (
                    <span key={g}>{VI_GENRE[g] || g}</span>
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
            onClick={() => onPageChange(page - 1)}
          >
            ← Trước
          </button>
          <span>
            Trang {page + 1} /{" "}
            {Math.max(1, Math.ceil(total / 8))}
          </span>
          {Array.from(
            { length: Math.ceil(total / 8) },
            (_, i) => (
              <button
                key={i}
                className={i === page ? "current" : ""}
                onClick={() => onPageChange(i)}
              >
                {i + 1}
              </button>
            ),
          )}
          <button
            disabled={page >= Math.ceil(total / 8) - 1}
            onClick={() => onPageChange(page + 1)}
          >
            Sau →
          </button>
        </nav>
      )}
    </section>
  );
}
