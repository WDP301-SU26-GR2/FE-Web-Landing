import { useEffect, useMemo, useRef, useState } from "react";
import { publicApi } from "../api/public.service";
import { IS_RECAPTCHA_CONFIGURED } from "../config/env";
import { getRecaptchaToken } from "../lib/recaptcha";
import { subscribeToVoteTally } from "../lib/vote-socket";
import {
  formatCooldown,
  formatVotePeriod,
  toggleSeriesSelection,
} from "../utils/guest-flow";

const SERIES_PER_PAGE = 8;

// Tải cover cho 1 trang catalog (offset=0 — có cache 120s ở BE, an toàn với rate-limit).
// Theo Spec 02 §2.1: `coverImageUrl` ở /public/series là URL đã ký sẵn; trong /vote/context (§3.1)
// thì `coverImage` là OBJECT KEY R2 chưa ký — ta KHÔNG tự ký lại (đỡ tốn request + đỡ lộ cap),
// chỉ dùng từ /public/series làm nguồn phụ, các series không nằm trong page đầu giữ placeholder
// (chữ cái đầu của title — UX vẫn đẹp, không block vote).
async function loadCatalogCovers(publicationType) {
  const firstPage = await publicApi.getCatalog({
    publicationType,
    limit: 50,
    offset: 0,
  });
  return new Map(
    (firstPage.items || [])
      .filter((series) => series.coverImageUrl)
      .map((series) => [series.id, series.coverImageUrl]),
  );
}

function getErrorKey(error) {
  return error?.code || error?.message || "";
}

function isError(error, key) {
  return getErrorKey(error).includes(key);
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
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);
  const [openPeriodsError, setOpenPeriodsError] = useState("");
  const [contextError, setContextError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [coverNotice, setCoverNotice] = useState("");
  const [liveStatus, setLiveStatus] = useState("");
  const [periodClosed, setPeriodClosed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [periodsRevision, setPeriodsRevision] = useState(0);
  const [periodRevision, setPeriodRevision] = useState(0);
  const otpInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoadingPeriods(true);
    setOpenPeriodsError("");

    publicApi
      .getOpenVotePeriods()
      .then((data) => {
        if (!active) return;
        const periods = data.items || [];
        setOpenPeriods(periods);
        setSelectedPeriodId((current) =>
          periods.some((period) => period.id === current)
            ? current
            : periods[0]?.id || "",
        );
      })
      .catch((error) => active && setOpenPeriodsError(error.message))
      .finally(() => active && setLoadingPeriods(false));

    return () => {
      active = false;
    };
  }, [periodsRevision]);

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
    setCoverNotice("");
    setLiveStatus("");
    setContextError("");
    setPeriodClosed(false);
    setSubmitted(false);
    setLoadingContext(true);

    const loadContext = async () => {
      try {
        const voteContext = await publicApi.getVoteContext(selectedPeriodId);
        if (!active) return;

        // Cover chỉ là cosmetic — lấy từ /public/series?offset=0 (1 request, có cache 120s).
        // Các series nằm ngoài page đầu giữ placeholder; ballot vẫn dùng được bình thường.
        setContext(voteContext);
        setLoadingContext(false);
        void loadCatalogCovers(voteContext.period.publicationType)
          .then((covers) => {
            if (!active) return;
            setContext((current) =>
              current?.period?.id === voteContext.period.id
                ? {
                    ...current,
                    series: (current.series || []).map((series) => ({
                      ...series,
                      coverImageUrl: covers.get(series.id) || null,
                    })),
                  }
                : current,
            );
          })
          .catch(() => {
            if (active) {
              setCoverNotice(
                "Không thể tải ảnh bìa lúc này; bạn vẫn có thể chọn và bình chọn series.",
              );
            }
          });
      } catch (error) {
        if (!active) return;
        setContextError(error.message);
        setNotice(error.message);
        if (isError(error, "SurveyPeriodNotOpen")) setPeriodClosed(true);
        setLoadingContext(false);
      }
    };

    const loadTally = async () => {
      try {
        const voteTally = await publicApi.getVoteLive(selectedPeriodId);
        if (active) setTally(voteTally);
      } catch (error) {
        if (!active) return;
        if (isError(error, "SurveyPeriodNotOpen")) setPeriodClosed(true);
        setLiveStatus(
          "Chưa thể tải lượt chọn trực tiếp; hãy thử lại sau ít phút.",
        );
      }
    };

    void loadContext();
    void loadTally();
    const unsubscribe = subscribeToVoteTally(
      selectedPeriodId,
      (nextTally) => active && setTally(nextTally),
      (status) => active && setLiveStatus(status),
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [selectedPeriodId, periodRevision]);

  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = window.setTimeout(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  // Auto-focus vào ô nhập OTP ngay khi mã được gửi thành công.
  useEffect(() => {
    if (otpSent) {
      otpInputRef.current?.focus();
    }
  }, [otpSent]);

  const selectedPeriod = openPeriods.find(
    (period) => period.id === selectedPeriodId,
  );
  // Option B (Spec 02 §3.0): WEEKLY và MONTHLY có thể mở SONG SONG. Vì spec lưu ý "Series Monthly
  // sẽ xuất hiện ở đây ngay khi Editor mở kỳ" nên nhắc riêng MONTHLY khi thiếu — nhắc WEEKLY
  // hay IRREGULAR sẽ ồn ào (chúng có thể đang đóng tạm theo kế hoạch phát hành).
  const hasOpenMonthlyPeriod = openPeriods.some(
    (period) => period.publicationType === "MONTHLY",
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

  const handleVoteError = (error) => {
    setNotice(error.message || "Không thể hoàn tất bình chọn.");
    if (error.retryAfter) setCooldown(error.retryAfter);

    if (isError(error, "ReaderAlreadyVoted")) {
      // The uniqueness rule is tied to this identity, not to this browser. Keep
      // the period available so another reader can vote from the same device.
      setOtpSent(false);
      setOtp("");
      return;
    }
    if (isError(error, "SurveyPeriodNotOpen")) setPeriodClosed(true);
  };

  const requestOtp = async () => {
    if (!IS_RECAPTCHA_CONFIGURED) {
      setNotice("Bình chọn tạm thời chưa sẵn sàng vì reCAPTCHA chưa được cấu hình.");
      return;
    }
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
      setOtp("");
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

  if (loadingPeriods) {
    return <div className="vote-empty-state">Đang tìm kỳ bình chọn...</div>;
  }

  if (openPeriodsError && !openPeriods.length) {
    return (
      <section className="vote-empty-state vote-error-state" role="alert">
        <h2>Chưa thể tải trang bình chọn</h2>
        <p>{openPeriodsError}</p>
        <button className="btn primary" type="button" onClick={() => setPeriodsRevision((value) => value + 1)}>
          Thử lại
        </button>
      </section>
    );
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
            onClick={() => period.id !== selectedPeriodId && setSelectedPeriodId(period.id)}
            aria-pressed={period.id === selectedPeriodId}
          >
            {formatVotePeriod(period)}
          </button>
        ))}
      </div>
      {!hasOpenMonthlyPeriod && (
        <p className="vote-period-note">
          Kỳ bình chọn Hàng tháng chưa được mở. Series Monthly sẽ xuất hiện ở đây ngay khi Editor mở kỳ.
        </p>
      )}

      {openPeriodsError && <p className="vote-notice">{openPeriodsError}</p>}
      {!IS_RECAPTCHA_CONFIGURED && (
        <p className="vote-config-warning" role="alert">
          Bình chọn đang tạm khóa: thiếu cấu hình reCAPTCHA ở môi trường này.
        </p>
      )}

      {loadingContext && (
        <p className="vote-empty-state">Đang tải danh sách series được bình chọn...</p>
      )}
      {contextError && (
        <div className="vote-context-error" role="alert">
          <p>{contextError}</p>
          {!periodClosed && (
            <button className="btn ghost" type="button" onClick={() => setPeriodRevision((value) => value + 1)}>
              Tải lại kỳ này
            </button>
          )}
        </div>
      )}

      {context && (
        <>
          <p className="vote-help">
            {selectedPeriod && `Bạn đang bình chọn cho ${formatVotePeriod(selectedPeriod)}. `}
            Chọn tối đa {maxSelections} series trong kỳ này.
          </p>
          {coverNotice && <p className="vote-cover-notice" role="status">{coverNotice}</p>}
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
                aria-label="Tìm kiếm series hoặc thể loại"
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
              <button type="button" disabled={seriesPage === 0} onClick={() => setSeriesPage((page) => page - 1)}>
                ←
              </button>
              <span>
                {seriesPage * SERIES_PER_PAGE + 1}–
                {Math.min((seriesPage + 1) * SERIES_PER_PAGE, filteredSeries.length)} / {filteredSeries.length}
              </span>
              <button type="button" disabled={seriesPage >= pageCount - 1} onClick={() => setSeriesPage((page) => page + 1)}>
                →
              </button>
            </nav>
          )}
          <div className="vote-form">
            <input
              type="email"
              value={email}
              disabled={periodClosed || submitted || otpSent}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email của bạn"
              aria-label="Địa chỉ email để nhận mã xác nhận"
            />
            {otpSent && (
              <input
                ref={otpInputRef}
                inputMode="numeric"
                value={otp}
                disabled={periodClosed || submitted}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Mã OTP gồm 6 số"
                aria-label="Mã xác nhận OTP gồm 6 chữ số"
              />
            )}
            <div className="vote-actions">
              <button
                className="btn primary"
                type="button"
                disabled={
                  busy ||
                  cooldown > 0 ||
                  periodClosed ||
                  submitted ||
                  !selectedIds.length ||
                  !IS_RECAPTCHA_CONFIGURED
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
                        ? `Thử lại sau ${formatCooldown(cooldown)}`
                        : otpSent
                          ? "Gửi lá phiếu →"
                          : "Nhận mã OTP →"}
              </button>
              {otpSent && !submitted && !periodClosed && (
                <>
                  <button className="vote-secondary-action" type="button" disabled={busy || cooldown > 0 || !IS_RECAPTCHA_CONFIGURED} onClick={requestOtp}>
                    Gửi lại OTP
                  </button>
                  <button className="vote-secondary-action" type="button" disabled={busy} onClick={() => { setOtpSent(false); setOtp(""); setNotice(""); }}>
                    Đổi email
                  </button>
                </>
              )}
            </div>
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
