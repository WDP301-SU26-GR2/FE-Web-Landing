import { Component } from "react";

// React chưa có hook ErrorBoundary nên phải dùng class component (chuẩn từ React 16).
// Wrap quanh những màn dễ crash runtime:
//   - VotePanel: subscribe Socket.IO có thể throw nếu gateway ngắt giữa chừng
//   - RankingPanel: Promise.all([latest, history]) có thể throw khi 1 route 5xx
//   - SeriesModal/Reader: chỉ render, ít rủi ro (không cần wrap)
// Khi 1 component con throw, ErrorBoundary render fallback + nút "Thử lại" (reset state)
// thay vì để toàn bộ landing trắng trơn — user vẫn có thể vote ở tab khác hoặc refresh.

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Chỉ log ở dev để tránh lộ stack trace trong production console.
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary]", error, info?.componentStack);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { fallbackTitle = "Đã có lỗi xảy ra", fallbackMessage } = this.props;
    const message =
      fallbackMessage ||
      this.state.error?.message ||
      "Không thể hiển thị màn này. Vui lòng thử lại.";

    return (
      <div className="vote-error-state" role="alert">
        <h2>{fallbackTitle}</h2>
        <p>{message}</p>
        <button className="btn primary" type="button" onClick={this.handleRetry}>
          Thử lại
        </button>
      </div>
    );
  }
}