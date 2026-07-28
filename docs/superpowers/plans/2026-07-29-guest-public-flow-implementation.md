# Guest Public Flow Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the documented public Guest/Reader catalog, voting, realtime tally, and ranking flows without changing authenticated-role behavior.

**Architecture:** Preserve the existing React/Vite single-page application while extracting guest-only API/query, CAPTCHA, Socket.IO, voting, and ranking responsibilities into focused modules. `FE-Web-Guide/01-conventions-and-auth.md` and `FE-Web-Guide/02-guest-reader.md` are the authority because the local `api-json.json` predates the newly documented guest endpoints.

**Tech Stack:** React 19, Vite 8, browser Fetch API, Google reCAPTCHA v3, Socket.IO client, Vitest.

## Global Constraints

- Implement only the Guest/Reader API surface in the FE Web Guide; authenticated roles and their routes remain out of scope.
- Use `VITE_API_URL` and the configured `VITE_RECAPTCHA_SITE_KEY`; do not expose backend secrets and do not retain the static CAPTCHA-token fallback.
- Treat every successful API body as `{ success, message, data }` and consume the unwrapped `data` payload.
- Never send undocumented/empty query parameters; ranking requests require `magazine` and `publicationType`, and vote context/live require `periodId`.
- Render R2 object keys only after matching them to public catalog `coverImageUrl`; do not render object keys as image URLs.
- Keep `FE-Web-Guide/` unmodified. `AGENTS.md` is absent in this workspace.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/api/query.js` | Serialize only valid non-empty public query fields. |
| `src/api/public.service.js` | One exact method per Guest REST endpoint. |
| `src/config/env.js` | Expose API URL and reCAPTCHA site key, with no test/development CAPTCHA token. |
| `src/lib/recaptcha.js` | Load reCAPTCHA v3 once and execute a fresh token per action. |
| `src/lib/vote-socket.js` | Isolate Socket.IO `/vote` connect/join/listener/disconnect behavior. |
| `src/utils/guest-flow.js` | Pure vote-selection, period-label, cooldown, and ranking-query helpers. |
| `src/components/VotePanel.jsx` | Open-period discovery, ballot lifecycle, cover lookup, live tally, and user-visible errors. |
| `src/components/RankingPanel.jsx` | Reflected-history and aggregate-ranking controls and result rendering. |
| `src/main.jsx` | Catalog/reader shell and composition of the two Guest components. |
| `src/styles.css` | Responsive styles for period selector, live tally, aggregate controls, and error states. |
| `src/**/*.test.js` | API query-contract and pure guest-flow behavior coverage. |

## Task 1: Establish testable Guest-flow helpers

**Files:**
- Create: `src/utils/guest-flow.js`
- Create: `src/utils/guest-flow.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces `toggleSeriesSelection(selectedIds, seriesId, maxSelections)`, `formatVotePeriod(period)`, `formatCooldown(seconds)`, and `isRankingSelectionComplete({ magazine, publicationType, level, year, month })`.
- Consumed by `VotePanel.jsx` and `RankingPanel.jsx` in later tasks.

- [ ] **Step 1: Add the test runner dependency and command**

Run:

```powershell
npm install --save-dev vitest
npm pkg set scripts.test="vitest run"
```

Expected: `package.json` contains a `test` script and the lockfile contains Vitest.

- [ ] **Step 2: Write the failing pure-flow tests**

Create `src/utils/guest-flow.test.js`:

```js
import { describe, expect, it } from "vitest";
import {
  formatCooldown,
  formatVotePeriod,
  isRankingSelectionComplete,
  toggleSeriesSelection,
} from "./guest-flow";

describe("toggleSeriesSelection", () => {
  it("adds only until the server-provided selection limit", () => {
    expect(toggleSeriesSelection(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(toggleSeriesSelection(["a"], "b", 2)).toEqual(["a", "b"]);
  });

  it("removes an already selected series", () => {
    expect(toggleSeriesSelection(["a", "b"], "a", 3)).toEqual(["b"]);
  });
});

it("formats a distinct period label", () => {
  expect(formatVotePeriod({ magazine: "Kirameki", publicationType: "WEEKLY", issueNumber: 7 }))
    .toBe("Kirameki · Hàng tuần · Kỳ #7");
});

it("formats rate-limit time and validates aggregate month requirements", () => {
  expect(formatCooldown(61)).toBe("1:01");
  expect(isRankingSelectionComplete({ magazine: "K", publicationType: "WEEKLY", level: "MONTH", year: 2026, month: "" }))
    .toBe(false);
  expect(isRankingSelectionComplete({ magazine: "K", publicationType: "WEEKLY", level: "YEAR", year: 2026, month: "" }))
    .toBe(true);
});
```

- [ ] **Step 3: Run the helper test to prove it fails before implementation**

Run: `npm test -- src/utils/guest-flow.test.js`

Expected: FAIL because `src/utils/guest-flow.js` does not exist.

- [ ] **Step 4: Implement the minimal pure helpers**

Create `src/utils/guest-flow.js` with these exact exports:

```js
const publicationTypeLabel = {
  WEEKLY: "Hàng tuần",
  MONTHLY: "Hàng tháng",
  IRREGULAR: "Không định kỳ",
};

export function toggleSeriesSelection(selectedIds, seriesId, maxSelections) {
  if (selectedIds.includes(seriesId)) return selectedIds.filter((id) => id !== seriesId);
  return selectedIds.length >= maxSelections ? selectedIds : [...selectedIds, seriesId];
}

export function formatVotePeriod({ magazine, publicationType, issueNumber }) {
  const issue = issueNumber == null ? "Kỳ đang mở" : `Kỳ #${issueNumber}`;
  return `${magazine} · ${publicationTypeLabel[publicationType] || publicationType} · ${issue}`;
}

export function formatCooldown(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function isRankingSelectionComplete({ magazine, publicationType, level, year, month }) {
  return Boolean(magazine?.trim() && publicationType && year && (level !== "MONTH" || month));
}
```

- [ ] **Step 5: Run the helper test and commit**

Run: `npm test -- src/utils/guest-flow.test.js`

Expected: PASS.

```powershell
git add package.json package-lock.json src/utils/guest-flow.js src/utils/guest-flow.test.js
git commit -m "test: add guest flow helper coverage"
```

## Task 2: Correct and complete the public REST/CAPTCHA boundary

**Files:**
- Create: `src/api/query.js`
- Create: `src/api/public.service.test.js`
- Create: `src/lib/recaptcha.js`
- Modify: `src/api/public.service.js`
- Modify: `src/config/env.js`
- Modify: `.env.example`

**Interfaces:**
- Consumes `request(path, options)` from `src/api/client.js`.
- Produces `toQueryString(params)`, `getRecaptchaToken(action)`, and exact `publicApi` methods used by the two UI components.

- [ ] **Step 1: Write failing REST-contract tests**

Create `src/api/public.service.test.js`:

```js
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicApi } from "./public.service";

afterEach(() => vi.unstubAllGlobals());

function stubSuccess(data = {}) {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data }),
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("public API contracts", () => {
  it("discovers open periods and loads context/live with a period id", async () => {
    const fetch = stubSuccess({ items: [] });
    await publicApi.getOpenVotePeriods();
    await publicApi.getVoteContext("period-1");
    await publicApi.getVoteLive("period-1");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      expect.stringMatching(/\/vote\/periods\/open$/),
      expect.stringMatching(/\/vote\/context\?periodId=period-1$/),
      expect.stringMatching(/\/vote\/live\?periodId=period-1$/),
    ]);
  });

  it("sends only documented ranking query parameters", async () => {
    const fetch = stubSuccess({ items: [] });
    await publicApi.getLatestRankingResults({ magazine: "Kirameki", publicationType: "WEEKLY" });
    await publicApi.getVotePeriods({ magazine: "Kirameki", publicationType: "WEEKLY", limit: 24 });
    await publicApi.getRankingResults("period-1");
    await publicApi.getAggregateRankings({ magazine: "Kirameki", publicationType: "WEEKLY", level: "YEAR", year: 2026 });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      expect.stringMatching(/\/vote\/results\/latest\?magazine=Kirameki&publicationType=WEEKLY$/),
      expect.stringMatching(/\/vote\/periods\?magazine=Kirameki&publicationType=WEEKLY&limit=24$/),
      expect.stringMatching(/\/vote\/results\?surveyPeriodId=period-1$/),
      expect.stringMatching(/\/rankings\/aggregate\?magazine=Kirameki&publicationType=WEEKLY&level=YEAR&year=2026$/),
    ]);
  });
});
```

- [ ] **Step 2: Run the API-contract test to verify it fails**

Run: `npm test -- src/api/public.service.test.js`

Expected: FAIL because open-period, live, and aggregate methods are absent and the current context/ranking method signatures are incorrect.

- [ ] **Step 3: Add query serialization and exact API methods**

Create `src/api/query.js`:

```js
export function toQueryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}
```

Replace `public.service.js` voting/ranking methods with signatures:

```js
getOpenVotePeriods: (filters) => request(`/vote/periods/open${toQueryString(filters)}`),
getVoteContext: (periodId) => request(`/vote/context${toQueryString({ periodId })}`),
getVoteLive: (periodId) => request(`/vote/live${toQueryString({ periodId })}`),
sendVoteOtp: ({ identity, captchaToken }) => request("/vote/otp", { method: "POST", body: JSON.stringify({ identity, captchaToken }) }),
submitVote: (payload) => request("/vote", { method: "POST", body: JSON.stringify(payload) }),
getLatestRankingResults: ({ magazine, publicationType }) => request(`/vote/results/latest${toQueryString({ magazine, publicationType })}`),
getVotePeriods: ({ magazine, publicationType, limit = 12 }) => request(`/vote/periods${toQueryString({ magazine, publicationType, limit })}`),
getRankingResults: (surveyPeriodId) => request(`/vote/results${toQueryString({ surveyPeriodId })}`),
getAggregateRankings: (params) => request(`/rankings/aggregate${toQueryString(params)}`),
```

Keep catalog/detail/chapter methods unchanged apart from importing `toQueryString`.

- [ ] **Step 4: Replace the static CAPTCHA token with a v3 loader**

In `src/config/env.js`, export `RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || ""` and remove `VOTE_CAPTCHA_TOKEN`.

Create `src/lib/recaptcha.js`:

```js
import { RECAPTCHA_SITE_KEY } from "../config/env";

let scriptPromise;

function loadRecaptcha() {
  if (!RECAPTCHA_SITE_KEY) return Promise.reject(new Error("Chưa cấu hình VITE_RECAPTCHA_SITE_KEY."));
  if (window.grecaptcha) return Promise.resolve(window.grecaptcha);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(RECAPTCHA_SITE_KEY)}`;
      script.async = true;
      script.onload = () => resolve(window.grecaptcha);
      script.onerror = () => reject(new Error("Không thể tải reCAPTCHA. Vui lòng thử lại."));
      document.head.append(script);
    });
  }
  return scriptPromise;
}

export async function getRecaptchaToken(action) {
  const grecaptcha = await loadRecaptcha();
  return new Promise((resolve, reject) => {
    grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_SITE_KEY, { action }).then(resolve, reject));
  });
}
```

Replace `.env.example`'s legacy `VITE_RECAPTCHA_TOKEN` with `VITE_RECAPTCHA_SITE_KEY=` and a comment identifying it as the public v3 site key.

- [ ] **Step 5: Run API tests and commit**

Run: `npm test -- src/api/public.service.test.js`

Expected: PASS.

```powershell
git add .env.example src/api/query.js src/api/public.service.js src/api/public.service.test.js src/config/env.js src/lib/recaptcha.js
git commit -m "feat: complete guest public API contracts"
```

## Task 3: Implement dynamic voting and realtime tally

**Files:**
- Create: `src/lib/vote-socket.js`
- Create: `src/components/VotePanel.jsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes `publicApi`, `getRecaptchaToken`, and guest-flow helpers from Tasks 1–2.
- Produces `<VotePanel standalone onRead readError />`, replacing the existing incorrect `VoteModal` implementation.

- [ ] **Step 1: Install the documented Socket.IO transport**

Run: `npm install socket.io-client`

Expected: `socket.io-client` is added to dependencies and locked.

- [ ] **Step 2: Create the Socket.IO lifecycle wrapper**

Create `src/lib/vote-socket.js`:

```js
import { io } from "socket.io-client";
import { API_BASE_URL } from "../config/env";

export function subscribeToVoteTally(periodId, onTally, onStatus) {
  const socket = io(`${API_BASE_URL}/vote`);
  socket.on("connect_error", () => onStatus("Không thể kết nối cập nhật trực tiếp; đang hiển thị số liệu gần nhất."));
  socket.on("voteTally", onTally);
  socket.emit("joinPeriod", { periodId }, ({ status }) => {
    if (status !== "SUCCESS") onStatus("Kỳ bình chọn không còn mở để cập nhật trực tiếp.");
  });
  return () => {
    socket.off("voteTally", onTally);
    socket.disconnect();
  };
}
```

- [ ] **Step 3: Replace hard-coded vote types with open-period discovery**

In `VotePanel.jsx`, on mount call `publicApi.getOpenVotePeriods()`. Store `openPeriods`, set the first returned id as `selectedPeriodId`, and render period buttons from `formatVotePeriod(period)`. Do not render `WEEKLY`, `MONTHLY`, or `IRREGULAR` buttons unless an API period has that value.

When `selectedPeriodId` changes, reset `selectedIds`, `email`, `otp`, `otpSent`, `cooldown`, notices, and tally; then in parallel call `publicApi.getVoteContext(selectedPeriodId)` and `publicApi.getVoteLive(selectedPeriodId)`. Match context series IDs against `publicApi.getCatalog({ publicationType: context.period.publicationType, limit: 50, offset })` pages to attach only `coverImageUrl` values. Retain a textual placeholder if no public cover match exists.

- [ ] **Step 4: Add fresh CAPTCHA-backed ballot submission and resilient tally UI**

Implement two explicit handlers:

```js
async function requestOtp() {
  const captchaToken = await getRecaptchaToken("vote_otp");
  await publicApi.sendVoteOtp({ identity: email.trim(), captchaToken });
}

async function submitBallot() {
  const captchaToken = await getRecaptchaToken("vote_submit");
  await publicApi.submitVote({
    surveyPeriodId: context.period.id,
    identity: email.trim(),
    otpCode: otp.trim(),
    seriesIds: selectedIds,
    captchaToken,
  });
}
```

Use `retryAfter` to start a per-period cooldown. For `Error.VoteOtpNotFound`, preserve the form and tell the reader to correct or request a new OTP. For `Error.ReaderAlreadyVoted` or `Error.SurveyPeriodNotOpen`, disable the selected period's form and tell the reader to select another open period. Use a `useEffect` to subscribe through `subscribeToVoteTally`; REST tally remains visible if the socket fails.

Render `tally.totalVotes`, timestamp, and tally rows beneath the ballot with the copy “Lượt chọn trực tiếp — chưa phải kết quả xếp hạng cuối.”

- [ ] **Step 5: Compose the new panel and style its states**

In `src/main.jsx`, replace uses/definition of `VoteModal` with `VotePanel`, preserve the existing standalone vote route and reader callback, and remove the main-page `getVoteContext()` call that currently lacks a required period id. Use open-period presence instead for the hero live indicator.

Add responsive CSS for `.vote-periods`, `.vote-live`, `.vote-live-status`, `.vote-tally-row`, and `.vote-empty-state`. Use focusable buttons with `aria-pressed` for selected periods, disabled states for cooldown/closed periods, and keep the existing card layout.

- [ ] **Step 6: Run focused tests, production build, and commit**

Run:

```powershell
npm test
npm run build
```

Expected: all Vitest files PASS and Vite emits `dist/` without compile errors.

```powershell
git add package.json package-lock.json src/lib/vote-socket.js src/components/VotePanel.jsx src/main.jsx src/styles.css
git commit -m "feat: complete guest voting and live tally flow"
```

## Task 4: Implement reflected and aggregate public rankings

**Files:**
- Create: `src/components/RankingPanel.jsx`
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes `publicApi` methods from Task 2 and `isRankingSelectionComplete` from Task 1.
- Produces `<RankingPanel magazines={magazines} />` for the current ranking section.

- [ ] **Step 1: Write the failing ranking-control test**

Append to `src/utils/guest-flow.test.js`:

```js
it("rejects ranking requests without a magazine or publication type", () => {
  expect(isRankingSelectionComplete({ magazine: "", publicationType: "WEEKLY", level: "YEAR", year: 2026 })).toBe(false);
  expect(isRankingSelectionComplete({ magazine: "Kirameki", publicationType: "", level: "YEAR", year: 2026 })).toBe(false);
});
```

- [ ] **Step 2: Run the ranking helper test to verify the new assertion**

Run: `npm test -- src/utils/guest-flow.test.js`

Expected: PASS, confirming that the UI can guard all required ranking parameters before network calls.

- [ ] **Step 3: Implement the ranking component**

Create `RankingPanel.jsx` with state for `magazine`, `publicationType`, `selectedPeriodId`, `level`, `year`, and `month`.

Use a text input backed by a `datalist` from `magazines` so users can enter a magazine not present in the initially loaded catalog. Do not call latest/history endpoints until `magazine.trim()` and `publicationType` are set. On a complete selection:

```js
const rankingQuery = { magazine: magazine.trim(), publicationType };
const [latest, periods] = await Promise.all([
  publicApi.getLatestRankingResults(rankingQuery),
  publicApi.getVotePeriods(rankingQuery),
]);
```

When a reflected period is selected, call `publicApi.getRankingResults(selectedPeriodId)` with no publication type query. For aggregate data, call `publicApi.getAggregateRankings({ ...rankingQuery, level, year: Number(year), ...(level === "MONTH" ? { month: Number(month) } : {}) })` only when `isRankingSelectionComplete` returns true.

Render rank rows from `rankPosition`, `seriesTitle`, `voteCount`, and `rankChange`. Render aggregate rows from `averageNormalizedScore`, `participationCoverage`, and `isProvisional`; show “Chưa đủ dữ liệu” for provisional entries. Render separate loading, empty, and API-error states.

- [ ] **Step 4: Compose the ranking component and pass catalog magazines**

In `src/main.jsx`, derive unique, non-empty `magazine` values from loaded catalog items and pass them to `<RankingPanel magazines={magazines} />`. Remove the current eager invalid requests to `getLatestRankingResults()` and `getVotePeriods()` and remove `rankingType` because it is not a valid standalone ranking query.

Add responsive styles for `.ranking-controls`, `.ranking-aggregate`, `.ranking-empty`, `.ranking-error`, and `.provisional-label` while retaining the existing ranking visual hierarchy.

- [ ] **Step 5: Run the full suite/build and commit**

Run:

```powershell
npm test
npm run build
```

Expected: all tests PASS and Vite production build succeeds.

```powershell
git add src/components/RankingPanel.jsx src/main.jsx src/styles.css src/utils/guest-flow.test.js
git commit -m "feat: add guest reflected and aggregate rankings"
```

## Task 5: Verify configuration and Guest-route coverage

**Files:**
- Modify: `.env.example`
- Modify: `docs/superpowers/specs/2026-07-29-guest-public-flow-design.md` only if implementation changes an approved contract

**Interfaces:**
- Consumes all completed UI/API modules.
- Produces final verified Guest behavior and configuration handoff.

- [ ] **Step 1: Verify environment documentation**

Check `.env.example` contains only public values required by this app:

```dotenv
VITE_API_URL=https://api-mangaka.novaproj.site
VITE_RECAPTCHA_SITE_KEY=
```

Expected: no `VITE_RECAPTCHA_TOKEN` fallback remains; no backend secret is added.

- [ ] **Step 2: Manually verify every public Guest flow against the guide**

Run `npm run dev` and verify in a browser:

1. Catalog filters, series detail, published chapter reader, previous/next chapter navigation.
2. No-open-period empty state, then selected open-period context and selector reset behavior.
3. CAPTCHA script loading, OTP cooldown, wrong-OTP preservation, successful ballot, and already-voted/closed-period messages.
4. Initial REST tally, Socket.IO tally update, and realtime-disconnected fallback.
5. Latest reflected ranking, historical period selection, yearly aggregate, monthly aggregate, and provisional badges.

- [ ] **Step 3: Run final automated verification**

Run:

```powershell
npm test
npm run build
git status --short
```

Expected: tests and build pass; status contains only intended Guest-flow changes plus the intentionally untracked `FE-Web-Guide/` reference directory.

- [ ] **Step 4: Commit final configuration/documentation adjustments**

```powershell
git add .env.example docs/superpowers/specs/2026-07-29-guest-public-flow-design.md
git commit -m "docs: finalize guest flow configuration"
```
