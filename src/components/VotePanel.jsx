import { useEffect, useMemo, useState } from "react";
import { publicApi } from "../api/public.service";
import { getRecaptchaToken } from "../lib/recaptcha";
import { subscribeToVoteTally } from "../lib/vote-socket";
import {
  formatCooldown,
  formatVotePeriod,
  toggleSeriesSelection,
} from "../utils/guest-flow";

const SERIES_PER_PAGE = 8;

async function getCatalogCoverMap(publicationType) {
  const firstPage = await publicApi.getCatalog({
    publicationType,
    limit: 50,
    offset: 0,
  });
  const pageCount = Math.ceil((firstPage.total || 0) / 50);
  const pages = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      publicApi.getCatalog({
        publicationType,
        limit: 50,
        offset: (index + 1) * 50,
      }),
    ),
  );

  return new Map(
    [firstPage, ...pages]
      .flatMap((page) => page.items || [])
      .map((series) => [series.id, series.coverImageUrl]),
  );
}

function getErrorKey(error) {
  return error?.code || error?.message || "";
}

export function VotePanel({ onRead, readError }) {
  const [openPeriods, setOpenPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [context, setContext] = useState(null);
  const [tally, setTally] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [voteQuery, setVoteQuery] = useState("");
  const [seriesPage, setSeriesPage] = useState(0);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [liveStatus, setLiveStatus] = useState("");
  const [periodClosed, setPeriodClosed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    publicApi
      .getOpenVotePeriods()
      .then((data) => {
        if (!active) return;
        const periods = data.items || [];
        setOpenPeriods(periods);
        setSelectedPeriodId(periods[0]?.id || "");
      })
      .catch((error) => active && setNotice(error.message))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) return undefined;

    let active = true;
    setContext(null);
    setTally(null);
    setSelectedIds([]);
    setVoteQuery("");
    setSeriesPage(0);
    setEmail("");
    setOtp("");
    setOtpSent(false);
    setCooldown(0);
    setNotice("");
    setLiveStatus("");
    setPeriodClosed(false);
    setSubmitted(false);

    Promise.all([
      publicApi.getVoteContext(selectedPeriodId),
      publicApi.getVoteLive(selectedPeriodId),
    ])
      .then(async ([voteContext, voteTally]) => {
        const covers = await getCatalogCoverMap(
          voteContext.period.publicationType,
        );
        if (!active) return;
        setContext({
          ...voteContext,
          series: (voteContext.series || []).map((series) => ({
            ...series,
            coverImageUrl: covers.get(series.id) || null,
          })),
        });
        setTally(voteTally);
      })
      .catch((error) => {
        if (!active) return;
        setNotice(error.message);
        if (getErrorKey(error).includes("SurveyPeriodNotOpen")) {
          setPeriodClosed(true);
        }
      });

    const unsubscribe = subscribeToVoteTally(
      selectedPeriodId,
      (nextTally) => active && setTally(nextTally),
      (status) => active && setLiveStatus(status),
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [selectedPeriodId]);

  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = window.setTimeout(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const selectedPeriod = openPeriods.find(
    (period) => period.id === selectedPeriodId,
  );
  const filteredSeries = useMemo(() => {
    const normalizedQuery = voteQuery.trim().toLowerCase();
    return (context?.series || []).filter((series) =>
      `${series.title || ""} ${(series.genres || []).join(" ")}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [context?.series, voteQuery]);
  const pageCount = Math.max(1, Math.ceil(filteredSeries.length / SERIES_PER_PAGE));
  const displayedSeries = filteredSeries.slice(
    seriesPage * SERIES_PER_PAGE,
    (seriesPage + 1) * SERIES_PER_PAGE,
  );
  const maxSelections = context?.maxSeriesPerVote || 3;

  const handlePeriodChange = (periodId) => {
    if (periodId !== selectedPeriodId) setSelectedPeriodId(periodId);
  };

  const handleVoteError = (error) => {
    const key = getErrorKey(error);
    setNotice(error.message || "Không thể hoàn tất bình chọn.");
    if (error.retryAfter) setCooldown(error.retryAfter);
    if (
      key.includes("ReaderAlreadyVoted") ||
      key.includes("SurveyPeriodNotOpen")
    ) {
      setPeriodClosed(true);
    }
  };

  const requestOtp = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setNotice("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }
    if (!selectedIds.length) {
      setNotice("Hãy chọn ít nhất một series trước khi nhận OTP.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const captchaToken = await getRecaptchaToken("vote_otp");
      await publicApi.sendVoteOtp({
        identity: email.trim(),
        captchaToken,
      });
      setOtpSent(true);
      setNotice("Mã xác nhận đã được gửi đến email của bạn.");
    } catch (error) {
      handleVoteError(error);
    } finally {
      setBusy(false);
    }
  };

  const submitBallot = async () => {
    if (!/^\d{6}$/.test(otp.trim())) {
      setNotice("Vui lòng nhập mã OTP gồm 6 chữ số.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const captchaToken = await getRecaptchaToken("vote_submit");
      await publicApi.submitVote({
        surveyPeriodId: context.period.id,
        identity: email.trim(),
        otpCode: otp.trim(),
        seriesIds: selectedIds,
        captchaToken,
      });
      setSubmitted(true);
      setNotice("Bình chọn thành công. Cảm ơn bạn đã tham gia!");
    } catch (error) {
      handleVoteError(error);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="vote-empty-state">Đang tìm kỳ bình chọn...</div>;
  }

  if (!openPeriods.length) {
    return (
      <div className="vote-empty-state">
        <h2>Chưa có kỳ bình chọn</h2>
        <p>Hãy quay lại khi kỳ bình chọn tiếp theo được mở nhé.</p>
      </div>
    );
  }

  return (
    <section className="vote-panel" aria-live="polite">
      <p className="eyebrow">READER'S CHOICE</p>
      <h2>
        Chọn câu chuyện
        <br />
        <i>bạn yêu thích.</i>
      </h2>
      <div className="vote-periods" role="tablist" aria-label="Kỳ bình chọn">
        {openPeriods.map((period) => (
          <button
            key={period.id}
            type="button"
            className={period.id === selectedPeriodId ? "picked" : ""}
            onClick={() => handlePeriodChange(period.id)}
            aria-pressed={period.id === selectedPeriodId}
          >
            {formatVotePeriod(period)}
          </button>
        ))}
      </div>

      {!context ? (
        <p className="vote-empty-state">Đang tải danh sách series được bình chọn...</p>
      ) : (
        <>
          <p className="vote-help">
            {selectedPeriod && `Bạn đang bình chọn cho ${formatVotePeriod(selectedPeriod)}. `}
            Chọn tối đa {maxSelections} series trong kỳ này.
          </p>
          <div className="vote-toolbar">
            <label className="vote-search">
              <span>⌕</span>
              <input
                value={voteQuery}
                onChange={(event) => {
                  setVoteQuery(event.target.value);
                  setSeriesPage(0);
                }}
                placeholder="Tìm series hoặc thể loại"
              />
            </label>
            <div className="vote-counter">
              <b>{selectedIds.length}</b> / {maxSelections} đã chọn
            </div>
          </div>
          <div className="vote-options">
            {displayedSeries.map((series) => {
              const selected = selectedIds.includes(series.id);
              const disabled =
                periodClosed ||
                submitted ||
                (!selected && selectedIds.length >= maxSelections);
              return (
                <article
                  className={`vote-series-card ${selected ? "picked" : ""}`}
                  key={series.id}
                >
                  <button
                    type="button"
                    className="vote-select"
                    disabled={disabled}
                    onClick={() =>
                      setSelectedIds((ids) =>
                        toggleSeriesSelection(ids, series.id, maxSelections),
                      )
                    }
                    aria-pressed={selected}
                  >
                    <span className="vote-check">{selected ? "✓" : "+"}</span>
                    <span className="vote-cover">
                      {series.coverImageUrl ? (
                        <img src={series.coverImageUrl} alt="" />
                      ) : (
                        <b>{series.title?.slice(0, 1)}</b>
                      )}
                    </span>
                    <span className="vote-series-copy">
                      <b>{series.title}</b>
                      <small>{(series.genres || []).join(" · ")}</small>
                    </span>
                  </button>
                  {onRead && (
                    <button
                      className="vote-read"
                      type="button"
                      onClick={() => onRead(series.id)}
                    >
                      Đọc mới nhất ↗
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {!displayedSeries.length && (
            <p className="vote-empty-state">Không tìm thấy series phù hợp.</p>
          )}
          {pageCount > 1 && (
            <nav className="vote-pagination" aria-label="Phân trang series bình chọn">
              <button
                type="button"
                disabled={seriesPage === 0}
                onClick={() => setSeriesPage((page) => page - 1)}
              >
                ←
              </button>
              <span>
                {seriesPage * SERIES_PER_PAGE + 1}–
                {Math.min((seriesPage + 1) * SERIES_PER_PAGE, filteredSeries.length)} / {filteredSeries.length}
              </span>
              <button
                type="button"
                disabled={seriesPage >= pageCount - 1}
                onClick={() => setSeriesPage((page) => page + 1)}
              >
                →
              </button>
            </nav>
          )}
          <div className="vote-form">
            <input
              type="email"
              value={email}
              disabled={periodClosed || submitted}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email của bạn"
            />
            {otpSent && (
              <input
                inputMode="numeric"
                value={otp}
                disabled={periodClosed || submitted}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Mã OTP gồm 6 số"
              />
            )}
            <button
              className="btn primary"
              type="button"
              disabled={
                busy ||
                cooldown > 0 ||
                periodClosed ||
                submitted ||
                !selectedIds.length
              }
              onClick={otpSent ? submitBallot : requestOtp}
            >
              {busy
                ? "Đang xử lý..."
                : submitted
                  ? "Đã gửi phiếu"
                  : periodClosed
                    ? "Kỳ này đã đóng"
                    : cooldown
                      ? `Gửi lại sau ${formatCooldown(cooldown)}`
                      : otpSent
                        ? "Gửi lá phiếu →"
                        : "Nhận mã OTP →"}
            </button>
          </div>
        </>
      )}
      {notice && <p className="vote-notice">{notice}</p>}
      <section className="vote-live" aria-label="Lượt chọn trực tiếp">
        <div>
          <p className="eyebrow">LIVE TALLY</p>
          <h3>{tally?.totalVotes ?? "—"} phiếu hợp lệ</h3>
          <p>Lượt chọn trực tiếp — chưa phải kết quả xếp hạng cuối.</p>
        </div>
        {liveStatus && <p className="vote-live-status">{liveStatus}</p>}
        {tally?.tally?.map((item) => (
          <div className="vote-tally-row" key={item.seriesId}>
            <span>{item.title}</span>
            <b>{item.count}</b>
          </div>
        ))}
      </section>
      {readError && <p className="vote-read-error">{readError}</p>}
    </section>
  );
}
