import { LOGO_URL, SYSTEM_SHORT_NAME } from "../constants/branding";

export function AppFooter() {
  return (
    <footer>
      <a className="brand" href="#top">
        <img src={LOGO_URL} alt={SYSTEM_SHORT_NAME} /> <span>{SYSTEM_SHORT_NAME}</span>
      </a>
      <p>Những câu chuyện đáng được tìm thấy.</p>
      <a href="#top">Lên đầu trang ↑</a>
    </footer>
  );
}
