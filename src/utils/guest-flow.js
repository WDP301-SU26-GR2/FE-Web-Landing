const publicationTypeLabels = {
  WEEKLY: "Hàng tuần",
  MONTHLY: "Hàng tháng",
  IRREGULAR: "Không định kỳ",
};

// Lấy tên tạp chí từ kỳ vote đang mở (dùng cho VotePanel pre-select khi Guest bấm từ màn vote sang
// màn ranking, vd link "Xem bảng xếp hạng của kỳ này"). Đây là nguồn phụ — nguồn chính cho dropdown
// tạp chí trên Landing là GET /public/magazines (xem RankingPanel.jsx).
export function getMagazineOptions(openPeriods = []) {
  return [...new Set(
    openPeriods
      .map((period) => period.magazine?.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

// Tên tạp chí trong dropdown Ranking, lấy từ response của GET /public/magazines (Spec 15 §2.4).
// Map [{name, publicationTypes}] → string[] chỉ chứa tên (component RankingPanel xử lý publicationTypes
// qua field publicationType riêng). Tương tự getMagazineOptions: trim, bỏ rỗng, sort localeCompare,
// và Set để chống trùng khi cùng tên xuất hiện nhiều lần trong catalog.
export function listMagazineNames(catalog = []) {
  if (!Array.isArray(catalog)) return [];
  return [...new Set(
    catalog
      .map((entry) => entry?.name?.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

export function toggleSeriesSelection(selectedIds, seriesId, maxSelections) {
  if (selectedIds.includes(seriesId)) {
    return selectedIds.filter((id) => id !== seriesId);
  }

  return selectedIds.length >= maxSelections
    ? selectedIds
    : [...selectedIds, seriesId];
}

export function formatVotePeriod({ magazine, publicationType, issueNumber }) {
  const issue = issueNumber == null ? "Kỳ đang mở" : `Kỳ #${issueNumber}`;
  return `${magazine} · ${publicationTypeLabels[publicationType] || publicationType} · ${issue}`;
}

export function formatCooldown(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function isRankingSelectionComplete({
  magazine,
  publicationType,
  level,
  year,
  month,
}) {
  const isValidYear = Number.isInteger(Number(year)) && Number(year) >= 1970 && Number(year) <= 9999;
  // `month` chỉ cần validate khi level=MONTH (BE bắt buộc) — level=YEAR ignore tháng.
  const requireMonth = level === "MONTH";
  const isValidMonth = requireMonth
    ? Number.isInteger(Number(month)) && Number(month) >= 1 && Number(month) <= 12
    : true;

  return Boolean(
    magazine?.trim() &&
      publicationType &&
      (level === "MONTH" || level === "YEAR") &&
      isValidYear &&
      isValidMonth,
  );
}
