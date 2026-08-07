// Helper dùng chung cho các màn hiển thị series.
// Tách ra để SeriesModal/Reader/VotePage có thể import mà không kéo theo App (677 dòng).

// Map enum Genre → tiếng Việt (Spec 02 §7.2 — 17 giá trị).
export const VI_GENRE = {
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

const SERIES_STATUS_LABEL = {
  SERIALIZED: "Đang phát hành",
  HIATUS: "Tạm nghỉ",
  COMPLETING: "Sắp kết thúc",
  CANCELLING: "Sắp bị hủy",
  COMPLETED: "Đã kết thúc",
  CANCELLED: "Đã hủy",
};

export function formatSeriesStatus(value) {
  return SERIES_STATUS_LABEL[value] || value;
}

export function formatChapterDate(date) {
  return date
    ? new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(date))
    : "Đang cập nhật";
}