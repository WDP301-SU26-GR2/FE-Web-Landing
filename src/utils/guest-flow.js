const publicationTypeLabels = {
  WEEKLY: "Hàng tuần",
  MONTHLY: "Hàng tháng",
  IRREGULAR: "Không định kỳ",
};

export function getMagazineOptions(openPeriods = []) {
  return [...new Set(
    openPeriods
      .map((period) => period.magazine?.trim())
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
  return Boolean(
    magazine?.trim() && publicationType && year && (level !== "MONTH" || month),
  );
}
