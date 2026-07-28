# Guest public flow completion

## Scope

Complete only the Guest/Reader experience documented in `FE-Web-Guide/01-conventions-and-auth.md` and `FE-Web-Guide/02-guest-reader.md`. Existing catalog and chapter-reader behavior remains intact unless an API-contract correction is required. Authenticated roles are out of scope.

The workspace has no `AGENTS.md`; therefore the FE Web Guide and the project's current React/Vite conventions govern this work.

## API architecture

Keep `src/api/public.service.js` as the public boundary, correcting and adding methods for all 12 Guest business routes:

- Catalog and reader: `GET /public/series`, `GET /public/series/:id`, and `GET /public/chapters/:id/pages`.
- Voting: `GET /vote/periods/open`, `GET /vote/context?periodId`, `POST /vote/otp`, `POST /vote`, and `GET /vote/live?periodId`.
- Rankings: `GET /vote/results/latest?magazine&publicationType`, `GET /vote/periods?magazine&publicationType&limit`, `GET /vote/results?surveyPeriodId`, and `GET /rankings/aggregate`.

All successful response handling continues to unwrap the documented `{ success, message, data }` envelope. Requests omit empty optional query values and never send undocumented query keys. Required ranking and voting query values are supplied before calling the API.

Create focused browser-side modules for reCAPTCHA v3 token acquisition and Socket.IO `/vote` lifecycle. The reCAPTCHA module loads Google's script once and obtains a newly executed token for each OTP and ballot request. It uses `VITE_RECAPTCHA_SITE_KEY` only; there is no static CAPTCHA-token fallback.

## Vote data flow and UX

1. Open the voting view and call `GET /vote/periods/open`.
2. If `items` is empty, show an empty state and no ballot form. Otherwise, render a selectable period using its magazine and publication type. A period is the unit of state, so switching it resets selected series, email/OTP submission state, tally, and any cooldown state.
3. Fetch `GET /vote/context?periodId=<selected id>`. The returned list is the sole vote-eligible list and its `maxSeriesPerVote` controls selection. Cover URLs are resolved by matching each series against public catalog results; object keys are never rendered as URLs.
4. Offer the existing search, pagination, and latest-chapter reader action. A user cannot choose more than `maxSeriesPerVote` items.
5. Ask for an email, execute reCAPTCHA, then call `POST /vote/otp`. Display the server cooldown if present. After success, accept a six-digit OTP, execute a fresh reCAPTCHA token, then call `POST /vote` with the selected period id, identity, OTP, and selected series ids.
6. Fetch `GET /vote/live?periodId=<selected id>` once and then join Socket.IO namespace `/vote` with `joinPeriod`. Replace tally state on every `voteTally` event. Disconnect and remove handlers when the selected period changes or the component unmounts. Tally is labelled as raw selections, not final ranking.

## Ranking UX

Ranking queries require a magazine and publication type. The UI exposes those controls before making latest/history requests, using magazines discovered from catalog data and allowing manual entry when required. It then supports:

- Latest reflected result for the selection.
- A reflected-period selector populated by `/vote/periods`, whose selection calls `/vote/results`.
- Aggregate monthly or yearly rankings with year/month inputs. Month is required only in monthly mode.

Rows display the API's `rankPosition`, not array order. Aggregate rows identify provisional values with the documented insufficient-data label.

## Error and resilience behavior

- `ApiError` supplies the BE message, field errors, status, code, and `retryAfter`. The UI shows the message and preserves input whenever retrying is valid.
- Rate limits with `retryAfter` disable the affected action for the returned duration. This covers `Error.VoteOtpRateLimit` and `Error.PublicRateLimited`.
- `Error.VoteOtpNotFound` leaves the selected period, selection, and email intact so a corrected OTP can be entered. Period-closed and already-voted responses stop submission for that period and direct the user to select another open period.
- A reCAPTCHA script/token failure blocks the associated request and states that CAPTCHA could not be verified; it never substitutes a placeholder token.
- Socket connection or acknowledgement failures preserve the latest REST tally and surface that realtime updates are unavailable. A tally failure never invalidates a successful ballot.

## Configuration and dependencies

`VITE_API_URL` is already configured. `VITE_RECAPTCHA_SITE_KEY` is required for this Guest scope and is now present in `.env`; `.env.example` will document it without a value. Google client settings are not part of the Guest implementation.

Add the Socket.IO client dependency because the backend contract explicitly requires Socket.IO rather than a raw WebSocket. No backend secrets are exposed in the frontend.

## Verification

Add a lightweight test setup and unit coverage for public-query serialization/API contract helpers, vote selection limits, cooldown/error mapping, and ranking parameter validation. Run the full test command and the Vite production build. Manual verification covers no-open-period, OTP rate limit, ballot submit, period switch, realtime tally connection fallback, and both ranking modes.
