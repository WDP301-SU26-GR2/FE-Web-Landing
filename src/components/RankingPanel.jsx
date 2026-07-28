import { useEffect, useState } from "react";
import { publicApi } from "../api/public.service";
import { isRankingSelectionComplete } from "../utils/guest-flow";

const publicationTypes = [
  ["WEEKLY", "Hàng tuần"],
  ["MONTHLY", "Hàng tháng"],
  ["IRREGULAR", "Không định kỳ"],
];

function rankChange(change) {
  if (!change) return "—";
  return `${change > 0 ? "↑" : "↓"} ${Math.abs(change)}`;
}

export function RankingPanel({ magazines }) {
  const [magazine, setMagazine] = useState("");
  const [publicationType, setPublicationType] = useState("");
  const [ranking, setRanking] = useState({ period: null, results: [] });
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [level, setLevel] = useState("YEAR");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [aggregate, setAggregate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [error, setError] = useState("");
  const [aggregateError, setAggregateError] = useState("");
  const [rankingRetryAfter, setRankingRetryAfter] = useState(0);

  useEffect(() => {
    if (!magazine && magazines[0]) setMagazine(magazines[0]);
  }, [magazine, magazines]);

  useEffect(() => {
    if (!magazine.trim() || !publicationType) {
      setRanking({ period: null, results: [] });
      setPeriods([]);
      setSelectedPeriodId("");
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError("");
    setRankingRetryAfter(0);
    setSelectedPeriodId("");
    const query = { magazine: magazine.trim(), publicationType };
    Promise.all([
      publicApi.getLatestRankingResults(query),
      publicApi.getVotePeriods(query),
    ])
      .then(([latest, history]) => {
        if (!active) return;
        setRanking(latest);
        setPeriods(history.items || []);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message);
        setRankingRetryAfter(requestError.retryAfter || 0);
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [magazine, publicationType]);

  useEffect(() => {
    if (!selectedPeriodId) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    setRankingRetryAfter(0);
    publicApi
      .getRankingResults(selectedPeriodId)
      .then((result) => active && setRanking(result))
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message);
        setRankingRetryAfter(requestError.retryAfter || 0);
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [selectedPeriodId]);

  useEffect(() => {
    if (!rankingRetryAfter) return undefined;
    const timer = window.setTimeout(
      () => setRankingRetryAfter((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [rankingRetryAfter]);

  const loadAggregate = async () => {
    const query = {
      magazine: magazine.trim(),
      publicationType,
      level,
      year: Number(year),
      ...(level === "MONTH" ? { month: Number(month) } : {}),
    };
    if (!isRankingSelectionComplete(query)) {
      setAggregateError("Hãy chọn đủ tạp chí, nhịp xuất bản và thời gian.");
      return;
    }

    setAggregateLoading(true);
    setAggregateError("");
    try {
      setAggregate(await publicApi.getAggregateRankings(query));
    } catch (requestError) {
      setAggregateError(requestError.message);
    } finally {
      setAggregateLoading(false);
    }
  };

  const rankingReady = Boolean(magazine.trim() && publicationType);
  const selectedHistoricalPeriod = periods.find(
    (period) => period.id === selectedPeriodId,
  );
  const displayedIssueNumber = selectedPeriodId
    ? ranking.issueNumber ?? selectedHistoricalPeriod?.reflectedIssueNumber ?? selectedHistoricalPeriod?.issueNumber
    : ranking.period?.reflectedIssueNumber || ranking.period?.issueNumber;
  const aggregateReady = isRankingSelectionComplete({
    magazine,
    publicationType,
    level,
    year,
    month,
  });

  return (
    <div className="ranking-panel">
      <div className="ranking-controls">
        <label>
          Tạp chí
          <input
            value={magazine}
            onChange={(event) => setMagazine(event.target.value)}
            list="public-magazines"
            placeholder="Nhập tên tạp chí"
          />
          <datalist id="public-magazines">
            {magazines.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
        <label>
          Nhịp xuất bản
          <select
            value={publicationType}
            onChange={(event) => setPublicationType(event.target.value)}
          >
            <option value="">Chọn nhịp xuất bản</option>
            {publicationTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kỳ đã công bố
          <select
            value={selectedPeriodId}
            disabled={!rankingReady || loading}
            onChange={(event) => setSelectedPeriodId(event.target.value)}
          >
            <option value="">Kỳ mới nhất</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                Kỳ #{period.reflectedIssueNumber || period.issueNumber || period.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!rankingReady && (
        <p className="ranking-empty">Chọn tạp chí và nhịp xuất bản để xem bảng xếp hạng.</p>
      )}
      {error && (
        <p className="ranking-error">
          {error}
          {rankingRetryAfter > 0 && ` Thử lại sau ${rankingRetryAfter}s.`}
        </p>
      )}
      {rankingReady && loading && <p className="ranking-empty">Đang tải bảng xếp hạng...</p>}
      {rankingReady && !loading && !error && (
        <div className="rank-list">
          <div className="rank-head">
            <span>XẾP HẠNG ĐÃ CÔNG BỐ</span>
            <small>
              {displayedIssueNumber != null
                ? `Kỳ ${displayedIssueNumber}`
                : "Chưa có kỳ REFLECTED"}
            </small>
          </div>
          {ranking.results?.map((item) => (
            <div className="rank-row" key={item.seriesId}>
              <strong>{item.rankPosition ?? "—"}</strong>
              <div>
                <h3>{item.seriesTitle || "Series không còn hiển thị"}</h3>
                <p>{Number(item.voteCount || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm bình chọn</p>
              </div>
              <span className={item.rankChange > 0 ? "up" : item.rankChange < 0 ? "down" : ""}>
                {rankChange(item.rankChange)}
              </span>
            </div>
          ))}
          {!ranking.results?.length && <p className="ranking-empty">Chưa có kết quả công bố cho lựa chọn này.</p>}
        </div>
      )}
      <section className="ranking-aggregate">
        <div>
          <p className="eyebrow">XẾP HẠNG TỔNG HỢP</p>
          <h3>Theo tháng hoặc năm</h3>
        </div>
        <div className="ranking-controls aggregate-controls">
          <label>
            Loại tổng hợp
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="YEAR">Theo năm</option>
              <option value="MONTH">Theo tháng</option>
            </select>
          </label>
          <label>
            Năm
            <input type="number" min="1970" max="9999" value={year} onChange={(event) => setYear(event.target.value)} />
          </label>
          {level === "MONTH" && (
            <label>
              Tháng
              <input type="number" min="1" max="12" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
          )}
          <button className="btn primary" type="button" disabled={!aggregateReady || aggregateLoading} onClick={loadAggregate}>
            {aggregateLoading ? "Đang tải..." : "Xem tổng hợp"}
          </button>
        </div>
        {aggregateError && <p className="ranking-error">{aggregateError}</p>}
        {aggregate && (
          <div className="aggregate-list">
            <p className="ranking-empty">{aggregate.reflectedIssueCount} kỳ đã được phản ánh trong khoảng này.</p>
            {(aggregate.items || []).map((item) => (
              <div className="rank-row" key={item.seriesId}>
                <strong>{item.rankPosition}</strong>
                <div>
                  <h3>{item.seriesTitle || "Series không còn hiển thị"}</h3>
                  <p>Điểm chuẩn hoá: {Number(item.averageNormalizedScore || 0).toFixed(2)} · Độ phủ: {Math.round((item.participationCoverage || 0) * 100)}%</p>
                </div>
                {item.isProvisional && <span className="provisional-label">Chưa đủ dữ liệu</span>}
              </div>
            ))}
            {!aggregate.items?.length && <p className="ranking-empty">Chưa có dữ liệu tổng hợp.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
