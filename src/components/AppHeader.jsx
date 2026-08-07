import { LOGO_URL, SYSTEM_SHORT_NAME } from "../constants/branding";

export function AppHeader({ onVoteClick }) {
  return (
    <header>
      <a className="brand" href="#top">
        <img src={LOGO_URL} alt={SYSTEM_SHORT_NAME} /> <span>{SYSTEM_SHORT_NAME}</span>
      </a>
      <nav>
        <a href="#catalog">Khám phá</a>
        <a href="#ranking">Bảng xếp hạng</a>
        <button className="nav-vote" onClick={onVoteClick}>
          Bình chọn
        </button>
      </nav>
    </header>
  );
}
