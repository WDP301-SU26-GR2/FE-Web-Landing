# §02 — Guest / Reader (Public — không cần đăng nhập)

> **Nguồn:** đọc trực tiếp `BE-dev/src/modules/public/*`, `BE-dev/src/modules/survey/*` (controller/service/schema/dto/errors/messages), `BE-dev/src/core/security/guards/public-rate-limit.guard.ts`, `BE-dev/src/infrastructure/redis/cache.service.ts`, `BE-dev/prisma/schema.prisma` — **KHÔNG** copy lại từ `FE-API-Guide-v3.md`/`FE-Mobile-RN-Guide.md` cũ. Ground-truth 2026-07-29 (bao gồm `author.displayName` ở public catalog/detail).
> Đọc [`00-INDEX.md`](00-INDEX.md) để biết cách dùng bộ guide, và **bắt buộc đọc trước** [`01-conventions-and-auth.md`](01-conventions-and-auth.md) — response envelope, quy tắc lỗi, phân trang, enum dictionary (§7), FE env vars (`NEXT_PUBLIC_RECAPTCHA_SITE_KEY` dùng ở file này). File này KHÔNG lặp lại các quy ước chung đó.

---

## 0. Phạm vi — 23 route PUBLIC theo `route-roles.ts`

`test/flows/route-roles.ts` liệt kê đúng **23 route** `access: 'PUBLIC'`. Chia làm 3 nhóm:

| Nhóm | Route | Ghi ở đâu |
|---|---|---|
| Auth dùng chung (8 route) | `POST /auth/register`, `/auth/verify-email`, `/auth/login`, `/auth/google`, `/auth/forgot-password`, `/auth/logout`, `/auth/refresh-token`, `/auth/send-otp-email` | Đã ghi đủ ở `01-conventions-and-auth.md` §5 — **không lặp lại ở đây** vì Reader không sở hữu `User` (mục 2.5/2.6 Requiment: Reader "không thuộc entity User"), các route này chỉ liên quan role có tài khoản |
| Hạ tầng/observability (3 route) | `GET /health/live`, `GET /health/ready`, `GET /metrics` | Ngoài scope FE (đã ghi rõ ở `00-INDEX.md` "Không nằm trong scope FE Web") |
|  **Nghiệp vụ Guest/Reader thật (12 route — nội dung file này)** | `GET /public/series`, `GET /public/series/:id`, `GET /public/chapters/:id/pages`, `GET /vote/periods/open` 🆕, `GET /vote/context`, `POST /vote/otp`, `POST /vote`, `GET /vote/live`, `GET /vote/results/latest`, `GET /vote/periods`, `GET /vote/results`, `GET /rankings/aggregate` | §2–§5 bên dưới |

Toàn bộ 12 route đều `@IsPublic()` — không cần Bearer token, không phân biệt role.

---

## 1. Flow đọc truyện & bình chọn (narrative)

```
Guest vào trang chủ (catalog)
    → GET /public/series (filter genre/demographic/publicationType/status/q, phân trang)
    → Chọn 1 series → GET /public/series/:id (chi tiết + danh sách chapter PUBLISHED)
    → Chọn 1 chapter → GET /public/chapters/:id/pages (ảnh trang đã ký URL, có prev/next để đọc liên tục)

[Bình chọn — bắt đầu bằng bước KHÁM PHÁ kỳ đang mở]
    → GET /vote/periods/open (🆕 2026-07-27 — điểm vào của Guest, KHÔNG cần biết gì trước)
        ├── items rỗng → hiện "Hiện chưa có kỳ bình chọn nào đang mở", ẩn toàn bộ CTA vote
        └── items[] → mỗi item là 1 kỳ OPEN (Option B: WEEKLY và MONTHLY có thể mở SONG SONG)
            → dựng tab theo publicationType, lấy items[].id làm periodId cho các bước sau
    → GET /vote/context?periodId=... (thông tin kỳ + danh sách series SERIALIZED được vote + maxSeriesPerVote)
    → Guest chọn tối đa N series (N = maxSeriesPerVote, mặc định 3) + nhập email
    → FE lấy reCAPTCHA v3 token (invisible, chạy ngầm)
    → POST /vote/otp { identity: email, captchaToken }
        ├── Rate limit theo identity/IP, captcha score thấp → chặn trước khi tốn OTP
        └── OK → gửi OTP 6 số qua email (Resend), hết hạn 5 phút
    → Guest nhập OTP
    → POST /vote { surveyPeriodId, identity, otpCode, seriesIds, captchaToken }
        ├── Sai OTP / hết hạn / quá số lần thử → cho nhập lại (không tốn thêm OTP mới)
        └── Đúng → ReaderVote được ghi, tally realtime cập nhật qua WebSocket /vote

[Trong lúc kỳ đang OPEN]
    → GET /vote/live?periodId=... (đếm thô, chưa phải bảng xếp hạng cuối)
      hoặc nghe event `voteTally` qua WebSocket /vote thay vì poll (xem §6)

[Sau khi Editor đóng kỳ (CLOSED) rồi chốt xếp hạng (REFLECTED)]
    → GET /vote/results/latest?magazine=&publicationType=  — bảng xếp hạng kỳ REFLECTED mới nhất
    → GET /vote/periods?magazine=&publicationType=          — dropdown lịch sử các kỳ đã REFLECTED
    → GET /vote/results?surveyPeriodId=                      — bảng xếp hạng của 1 kỳ cụ thể (từ dropdown trên)
    → GET /rankings/aggregate?magazine=&publicationType=&level=&year=(&month=) — bảng tổng hợp theo tháng/năm
```

### 1.1. Điểm nghiệp vụ quan trọng cần FE biết trước khi code

- **Reader không có tài khoản** (Requiment 2.5/2.6) — danh tính chỉ là **hash HMAC-SHA256** của email + pepper server-side (`IdentityHashService`), dùng để chặn vote trùng trong cùng kỳ. Server không lưu email gốc ở bảng vote (`identityHash`/`ipHash` là hash, không phải giá trị thật).
- **Chỉ có kênh Email OTP** — mã nguồn hiện tại **không có nhánh SMS/phone OTP nào cả** dù Requiment 1.15 mô tả SMS là kênh chính và Email chỉ là "chế độ dev/test". `VoteOtpRequestBodySchema`/`ReaderVoteBodySchema` bắt buộc field `identity` phải là **email hợp lệ** (`z.string().email()`), không nhận số điện thoại. `ReaderAuthMethod.PHONE_OTP`/`CAPTCHA_ONLY` chỉ là enum dự phòng chưa dùng (xem `01-conventions-and-auth.md` §7.8). Nếu tài liệu cũ nói FE cần form nhập SĐT — **sai, hiện tại chỉ có form email**.
- **`VotingConfig.authMode`** (`OTP`/`CAPTCHA`/`HYBRID`, Super Admin cấu hình qua `PATCH /voting-config`) được lưu DB nhưng **luồng vote thực tế không đọc/rẽ nhánh theo field này** — `SurveyOtpRequestService`/`ReaderVoteService` luôn bắt buộc OTP + captcha bất kể giá trị `authMode` là gì. FE không cần (và không thể) đổi hành vi UI theo `authMode`.
- **`GET /vote/context` và `GET /vote/live` đòi hỏi `periodId` là query BẮT BUỘC** (schema `zObjectId()` không có `.optional()`) — thiếu `periodId` → 422. Guest lấy `periodId` bằng cách gọi **`GET /vote/periods/open`** trước (🆕 bổ sung 2026-07-27, xem §3.0). Lưu ý phân biệt với `GET /vote/periods` — route đó chỉ liệt kê kỳ đã **REFLECTED** (đã đóng + chốt), dùng cho dropdown lịch sử ranking, **không** dùng để tìm kỳ đang mở.
- **Vote nghi ngờ KHÔNG bị từ chối, chỉ giảm trọng số** (đúng như Requiment 1.15f): captcha score thấp hơn ngưỡng (`VotingConfig.captchaThreshold`, mặc định `0.3`) → vote vẫn được ghi nhận nhưng `voteWeight = 0.5` (hằng số `SURVEY_CONFIG.voteWeightForFlagged`) và `isFlagged = true`; Google reCAPTCHA lỗi/timeout → fail-open (`degraded: true`, vote vẫn qua nhưng bị đánh dấu nghi ngờ). Chỉ khi `captcha.ok === false` (token sai/rỗng) mới bị từ chối hẳn (`403 Error.CaptchaRejected`).
- **`GET /public/series/:id` và `GET /public/chapters/:id/pages` dùng chung 1 mã 404** cho cả 3 trường hợp: id sai định dạng, không tồn tại, hoặc series/chapter chưa public — chủ đích để Guest không dò được trạng thái nội bộ (comment trong code: *"the same 404 intentionally covers malformed/missing/private resources so guests cannot probe internal state"*).

---

## 2. Đọc truyện (public catalog & reader) — `src/modules/public/*`

### 2.1. `GET /public/series` — Catalog

Query:

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `q` | tuỳ | string (1–100) | tìm theo `title`, contains, không phân biệt hoa/thường |
| `genre` | tuỳ | enum `Genre` | lọc 1 thể loại |
| `demographic` | tuỳ | enum `Demographic` | |
| `publicationType` | tuỳ | enum `PublicationType` | |
| `status` | tuỳ | subset `SeriesStatus` | **chỉ nhận** `SERIALIZED`·`HIATUS`·`COMPLETING`·`CANCELLING`·`COMPLETED`·`CANCELLED` (mọi trạng thái pre-serialization như `DRAFT`/`IN_REVIEW`/`PITCHED` gửi lên → 422, vì route không expose chúng ra public). Omit = trả toàn bộ tập public (6 status trên) |
| `statusGroup` | tuỳ | literal `ACTIVE` | Gom series vẫn đang phát hành: `SERIALIZED` + `COMPLETING` + `CANCELLING`. **Không gửi đồng thời** với `status` (gửi cả hai → 422). Dùng cho tab “Đang phát hành”. |
| `limit` | tuỳ | int | default 20, **tối đa 50** — ⚠️ khác quy ước chung "tối đa 100" ở file 01 §2, route này tự giới hạn thấp hơn |
| `offset` | tuỳ | int | default 0 |

Response (`{ items, total, limit, offset }`) — mỗi item:

| Field | Kiểu/enum | Ghi chú |
|---|---|---|
| `id` | string | |
| `title` | string | |
| `synopsis` | string \| null | từ `Series.proposal.synopsis`; null nếu chưa có |
| `coverImageUrl` | string \| null | URL đã ký sẵn (short-lived), null nếu series chưa có cover |
| `genres` | enum `Genre`[] | |
| `demographic` | enum `Demographic` \| null | |
| `status` | enum `SeriesStatus` | |
| `publicationType` | enum `PublicationType` \| null | |
| `magazine` | string \| null | |
| `author` | `{ displayName: string \| null }` | 🆕 **Luôn là object**, không phải `null`. Chỉ có bút danh/tên hiển thị công khai của Mangaka. Nếu tác giả chưa đặt bút danh, tài khoản không còn `ACTIVE`, hoặc đã bị xoá mềm thì `displayName = null`. |
| `publishedChapterCount` | int | số chapter đã `PUBLISHED`; 0 = "sắp ra mắt" |

**Cách hiển thị tác giả:** dùng `item.author.displayName` để hiện dòng `Tác giả: …` khi giá trị khác `null`; nếu `null` thì ẩn dòng này hoặc hiện “Đang cập nhật”. Không dùng `id`, không gọi/join API nội bộ để tự tìm tên khác.

**Cam kết privacy:** public API tuyệt đối **không** trả `User.id`, `email`, `name` (có thể là tên pháp lý), `phoneNumber` hay `avatar` trong field `author`. BE cũng cố ý **không fallback** từ `displayName` sang `name`.

> `author` chỉ được bổ sung ở `GET /public/series` và `GET /public/series/:id`. Không có ở `/public/chapters/:id/pages`, `/vote/context`, `/vote/live`, kết quả vote hay ranking. Đặc biệt trang vote phải giữ ẩn tác giả để tránh thiên vị; không cố ghép tên tác giả từ catalog vào card vote.

Lỗi: `429 Error.PublicRateLimited` (kèm `retryAfter`, xem §7).

### 2.2. `GET /public/series/:id` — Chi tiết series

Response = mọi field của item ở §2.1 (bao gồm `author.displayName`) **cộng thêm**:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `chapters` | array | danh sách chapter **đã `PUBLISHED`** của series, mỗi item: `{ id, chapterNumber, title, publishedAt }` |

Lỗi: `404 Error.PublicSeriesNotFound` (id sai định dạng/không tồn tại/series chưa public — cùng 1 mã, xem §1.1) · `429 Error.PublicRateLimited`.

### 2.3. `GET /public/chapters/:id/pages` — Đọc chapter

Response:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `series` | `{ id, title }` | |
| `chapter` | `{ id, chapterNumber, title, publishedAt }` | |
| `pages[]` | `{ pageNumber, imageUrl }` | `imageUrl` là URL đã ký, **hạn ngắn** (`PUBLIC_SIGN_TTL_SECONDS`, mặc định 900s = 15 phút) — gọi lại route này để lấy URL mới khi hết hạn, không cache URL lâu |
| `prevChapterId` | string \| null | chapter `PUBLISHED` liền trước theo `chapterNumber`, null nếu là chapter đầu |
| `nextChapterId` | string \| null | chapter `PUBLISHED` liền sau, null nếu là chapter cuối |

Ghi chú: ảnh mỗi trang ưu tiên **bản composite** (đã ghép nền/screentone/hiệu ứng của trợ lý), fallback về **bản gốc** (`originalFile`) nếu trang không có composite (vd Mangaka tự vẽ hết, không giao task) — công thức giống hệt `PageRes.displayFile` ở các route nội bộ, FE không cần tự chọn giữa 2 bản.

Lỗi: `404 Error.PublicChapterNotFound` (cùng logic §1.1 — chapter không tồn tại/chưa `PUBLISHED`) · `429 Error.PublicRateLimited`.

---

## 3. Bình chọn (Guest Voting) — `src/modules/survey/*`

### 3.0. `GET /vote/periods/open` — 🆕 Khám phá kỳ đang mở (BƯỚC ĐẦU TIÊN của luồng vote)

> Bổ sung 2026-07-27 để lấp lỗ hổng: trước đó cả 3 route vote (`/vote/context`, `/vote/live`, `POST /vote`) đều đòi `periodId`, mà không route public nào cho biết kỳ nào đang mở. **Public, không cần token.**

Query (cả 2 đều **tuỳ chọn** — bỏ trống = lấy mọi kỳ đang mở; schema `.strict()` nên gửi field lạ → 422):

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `magazine` | ⛔ tuỳ chọn | string (≥1 ký tự, tự trim) | Lọc theo tạp chí. Bỏ trống = mọi tạp chí |
| `publicationType` | ⛔ tuỳ chọn | `enum PublicationType` | Lọc theo nhịp xuất bản (dựng tab Tuần/Tháng). Giá trị ngoài enum → 422 |

Response: `{ items: OpenPeriod[] }` — **mảng rỗng nghĩa là hiện không có kỳ nào mở** (không phải lỗi, không phải 404).

| Field trong `items[]` | Kiểu/enum | Ghi chú |
|---|---|---|
| `id` | string | **Chính là `periodId`** dùng cho `/vote/context`, `/vote/live`, và `surveyPeriodId` của `POST /vote` |
| `magazine` | string | Tên tạp chí của kỳ |
| `publicationType` | `enum PublicationType` | Dùng để tách tab — xem quy tắc Option B bên dưới |
| `issueNumber` | number \| null | Số kỳ |
| `startDate` | string \| null | ISO 8601 UTC |
| `endDate` | string \| null | ISO 8601 UTC; `null` = chưa ấn định ngày đóng |

🔴 **Option B — có thể có NHIỀU kỳ mở cùng lúc.** Kỳ được scope theo `magazine + publicationType`, nên WEEKLY và MONTHLY thường mở song song. Vì vậy route trả **danh sách**, không phải một kỳ. Guest bỏ được 1 phiếu cho **mỗi** kỳ (mỗi tab), không phải 1 phiếu chung → FE dựng tab theo `publicationType` và giữ trạng thái "đã vote" **riêng cho từng `id`**.

Route **chỉ trả kỳ có đủ scope** — kỳ dữ liệu cũ thiếu `magazine`/`publicationType` bị ẩn hẳn, vì `/vote/context` sẽ từ chối chúng (`Error.SurveyPeriodNotOpen`), hiện ra chỉ dẫn Guest vào ngõ cụt.

Có `PublicRateLimitGuard` (xem §7) → `429 Error.PublicRateLimited` + `retryAfter` khi vượt hạn mức IP. Cache: namespace `votectx`, TTL 60s, tự invalidate khi Admin/Editor mở hoặc đóng kỳ.

### 3.1. `GET /vote/context` — Dữ liệu dựng trang vote

Query: `periodId` — **✅ bắt buộc**, ObjectId 24-hex (xem cảnh báo §1.1 — sai định dạng → 422, không phải 404).

Response:

| Field | Kiểu/enum | Ghi chú |
|---|---|---|
| `period.id` | string | |
| `period.magazine` | string | |
| `period.publicationType` | enum `PublicationType` | Option B: FE tách tab Tuần/Tháng theo field này |
| `period.issueNumber` | int \| null | |
| `period.reflectedIssueNumber` | int \| null | |
| `period.startDate` / `endDate` | string \| null | ISO 8601 UTC |
| `series[].id/title` | string | |
| `series[].coverImage` | string \| null | **object key R2**, KHÔNG phải URL — cần gọi thêm `POST /uploads/sign-download` (xem file 01 §3) hoặc dùng ảnh từ `GET /public/series` cho cùng series thay vì tự ký lại |
| `series[].genres` | enum `Genre`[] | |
| `series[].demographic` | enum `Demographic` \| null | |
| `series[].publicationType` | enum `PublicationType` | luôn khớp `period.publicationType` |
| `maxSeriesPerVote` | int | đọc từ `VotingConfig` (Admin cấu hình được, mặc định 3) — FE dùng giá trị này để giới hạn UI chọn, KHÔNG hard-code 3 |

Lỗi: `404 Error.SurveyPeriodNotFound` · `409 Error.SurveyPeriodNotOpen` (kỳ tồn tại nhưng không `OPEN`, hoặc thiếu `magazine`/`publicationType`/`issueNumber`/danh sách series hợp lệ — coi như chưa sẵn sàng vote).

### 3.2. `POST /vote/otp` — Xin OTP

Body:

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `identity` | ✅ | email string | nhận OTP |
| `captchaToken` | ✅ | string | token reCAPTCHA v3 (site key = `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, xem file 01 §6.1) |

Response: `MessageResDto { message: "OTP bình chọn đã được gửi thành công." }`.

Thứ tự kiểm tra trong service (để FE hiểu UX chặn ở đâu):
1. Rate-limit theo `identity` (hash) — tối đa **3 request/24h**, cooldown **60s** giữa 2 lần (mặc định từ `VotingConfig`, Admin chỉnh được qua `PATCH /voting-config`).
2. Rate-limit theo IP — tối đa **10 request/24h**.
3. reCAPTCHA: `ok=false` → từ chối hẳn; `score < captchaThreshold` (mặc định 0.3) → cũng từ chối ở bước xin OTP (khác với bước submit vote — ở bước OTP score thấp bị chặn cứng, không chỉ giảm trọng số).
4. Gửi OTP 6 số qua email (Resend), timeout gửi 10s, hết hạn sau `otpExpirySeconds` (mặc định 300s = 5 phút), tối đa `otpMaxAttempts` lần nhập sai (mặc định 3).

Lỗi: `429 Error.VoteOtpRateLimit` (kèm `retryAfter`, dùng chung cho cả 2 rate-limit identity/IP ở bước 1–2) · `403 Error.CaptchaRejected` · `503 Error.VoteOtpDeliveryFailed` (Resend lỗi/timeout).

### 3.3. `POST /vote` — Xác thực OTP + gửi phiếu

Body:

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `surveyPeriodId` | ✅ | string | id kỳ bình chọn |
| `identity` | ✅ | email string | phải là email đã nhận OTP ở §3.2 |
| `otpCode` | ✅ | string (≥4 ký tự) | mã 6 số |
| `seriesIds` | ✅ | string[] (1–3, **trần cứng 3 ở schema**) | không trùng phần tử. ⚠️ Có **2 lớp giới hạn**: schema Zod hard-cap `.max(3)` (gửi >3 → 422 validation ngay, bất kể config), rồi service so tiếp với `VotingConfig.maxSeriesPerVote` → `Error.TooManySeriesSelected`. Admin chỉ có thể **hạ** giới hạn xuống dưới 3, **không thể nâng** lên >3 (comment trong `reader-vote.service.ts` nêu rõ điều này) — nên FE cứ lấy `maxSeriesPerVote` từ `/vote/context` để render counter, nhưng đừng kỳ vọng giá trị >3 |
| `captchaToken` | ✅ | string | verify lại lần nữa ở bước submit (độc lập với token đã dùng ở `/vote/otp`) |

Response: `MessageResDto { message: "Bình chọn của bạn đã được ghi nhận." }`.

Thứ tự validate (quan trọng để FE hiển thị đúng lỗi trước — code cố ý validate phiếu KHÔNG hợp lệ trước khi đụng tới OTP để không "đốt" OTP oan):
1. `seriesIds.length > maxSeriesPerVote` → `422 Error.TooManySeriesSelected` (path `seriesIds`).
2. `surveyPeriodId` sai định dạng/không tồn tại → `404 Error.SurveyPeriodNotFound`; tồn tại nhưng không `OPEN` → `409 Error.SurveyPeriodNotOpen`.
3. Nếu kỳ đã "scoped" (có đủ `magazine`+`publicationType`+`issueNumber`+danh sách `eligibleSeriesIds`): mọi `seriesIds` gửi lên phải nằm trong `eligibleSeriesIds` — sai → `422 Error.SeriesNotVotable`.
4. `seriesIds` trùng phần tử → `422 Error.DuplicateSeriesInVote`; id sai định dạng hoặc series không ở trạng thái `SERIALIZED` → `422 Error.SeriesNotVotable`. (Kỳ chưa "scoped" — legacy — còn validate thêm: mọi series được chọn phải cùng `publicationType`, khác nhau → `422 Error.SeriesNotVotable`.)
5. IP đã đạt hạn mức vote của kỳ (đếm cả trong DB lẫn 1 quota tạm trong Redis để chặn race-condition gửi đồng thời) — mặc định `ipVotesPerPeriod = 10` → `429 Error.VoteIpLimitExceeded` (⚠️ exception này **không kèm `retryAfter`**, khác với `VoteOtpRateLimit`).
6. Đã tồn tại phiếu của `identity` này trong kỳ này → `409 Error.ReaderAlreadyVoted`.
7. reCAPTCHA `ok=false` → `403 Error.CaptchaRejected`. Score thấp hơn ngưỡng → **không chặn**, chỉ đặt `voteWeight=0.5`, `isFlagged=true` (xem §1.1).
8. Khớp OTP (identity + code + chưa hết hạn + chưa vượt `otpMaxAttempts`) rồi mới ghi `ReaderVote` + tiêu huỷ OTP nguyên tử; sai bất kỳ điều kiện nào (kể cả OTP đã dùng, hết hạn, hoặc identity không khớp OTP đã xin) → cùng 1 mã `400 Error.VoteOtpNotFound` (gộp chung "không tìm thấy/hết hạn/sai/quá số lần" — tránh lộ thông tin cho kẻ dò OTP).

Sau khi ghi thành công, server broadcast realtime qua WebSocket `/vote` (best-effort — xem §6); nếu bước này lỗi, phiếu vẫn được tính là thành công.

### 3.4. `GET /vote/live` — Tally thô khi kỳ đang mở

Query: `periodId` — ✅ bắt buộc, ObjectId.

Response:

| Field | Kiểu/enum | Ghi chú |
|---|---|---|
| `periodId` / `magazine` | string | |
| `publicationType` | enum `PublicationType` | |
| `issueNumber` | int \| null | |
| `tally[].seriesId/title/coverImage` | | `coverImage` là **object key**, chưa ký URL |
| `tally[].count` | int | **đếm thô số lượt chọn** (mỗi `ReaderVote.seriesIds` chứa series này = +1), KHÔNG phải điểm xếp hạng có trọng số |
| `totalVotes` | int | tổng số phiếu hợp lệ đã ghi trong kỳ (có thể khác `Σ tally[].count` vì 1 phiếu chọn nhiều series) |
| `updatedAt` | string (ISO datetime) | thời điểm tính, luôn realtime — route này **không cache** (xem §7) |

Lỗi: `404 Error.SurveyPeriodNotFound` · `409 Error.SurveyPeriodNotOpen` (kỳ không `OPEN` hoặc chưa đủ scope magazine/publicationType/issueNumber/eligibleSeriesIds).

---

## 4. Bảng xếp hạng công khai (Ranking) — `src/modules/survey/public-ranking.controller.ts`

> Cả 4 route dưới đây **không yêu cầu và không đọc** `AppConfig`/tín hiệu nội bộ như `isAtRisk`/`riskLevel`/`isReliable` — những field đó chỉ dành cho Editor/Board (route `rankings/board`, `rankings` ở file `05-editor.md`/`06-board-member.md`).

### 4.1. `GET /vote/results/latest` — Kỳ REFLECTED mới nhất

Query: `magazine` (✅ bắt buộc, string) · `publicationType` (✅ bắt buộc, enum `PublicationType`).

Response:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `period` | object \| null | null = chưa có kỳ nào từng `REFLECTED` cho cặp magazine+publicationType này |
| `period.id/issueNumber/reflectedIssueNumber/startDate/endDate` | | |
| `results[].rankPosition` | int \| null | vị trí trên **bảng tổng** của kỳ (giữ nguyên khi FE filter theo publicationType phía client) |
| `results[].seriesId/seriesTitle` | | `seriesTitle` null nếu series đã bị xoá |
| `results[].publicationType` | enum `PublicationType` \| null | |
| `results[].voteCount` | number | tổng trọng số phiếu (không phải đếm thô) |
| `results[].rankChange` | int \| null | so với kỳ trước |

Lỗi: `429 Error.PublicRateLimited`.

### 4.2. `GET /vote/periods` — Dropdown lịch sử kỳ REFLECTED

Query: `magazine` (✅) · `publicationType` (✅) · `limit` (tuỳ, default 12, tối đa 24).

Response: `{ items: [{ id, issueNumber, reflectedIssueNumber, startDate, endDate }] }`.

Lỗi: `429 Error.PublicRateLimited`.

### 4.3. `GET /vote/results` — Kết quả 1 kỳ cụ thể

Query: `surveyPeriodId` — ✅ bắt buộc.

Response: `{ surveyPeriodId, issueNumber, results[] }` — `results[]` cùng shape với §4.1.

Lỗi: `404 Error.SurveyPeriodNotFound` (id sai định dạng cũng rơi vào đây) · `409 Error.SurveyPeriodNotFinalized` (kỳ tồn tại nhưng chưa `REFLECTED`). Route này **không** có `PublicRateLimitGuard` (khác với 2 route ở §4.1/§4.2).

### 4.4. `GET /rankings/aggregate` — Bảng tổng hợp theo tháng/năm

Query:

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `magazine` | ✅ | string | |
| `publicationType` | ✅ | enum `PublicationType` | |
| `level` | ✅ | `'MONTH'` \| `'YEAR'` | |
| `year` | ✅ | int (1970–9999) | |
| `month` | tuỳ | int (1–12) | **bắt buộc nếu `level=MONTH`** — thiếu → 422 path `month` (lỗi validation thuần, không phải mã `Error.X`) |

Response:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `magazine/publicationType/level/year/month` | | `month` chỉ có mặt khi `level=MONTH` |
| `reflectedIssueCount` | int | số kỳ REFLECTED trong khoảng thời gian được gộp |
| `items[].rankPosition` | int | xếp theo `averageNormalizedScore` giảm dần (KHÔNG phải theo tổng phiếu) |
| `items[].seriesId/seriesTitle` | | |
| `items[].reflectedIssueCount` | int | = `reflectedIssueCount` ở trên (lặp lại per-item cho tiện FE) |
| `items[].totalWeightedVoteCount` | number | tổng phiếu có trọng số — chỉ mang tính tham khảo, KHÔNG dùng để xếp hạng |
| `items[].participatedIssueCount` | int | số kỳ series này thực sự có mặt (được vote) trong khoảng |
| `items[].participationCoverage` | number (0–1) | = `participatedIssueCount / reflectedIssueCount` |
| `items[].averageNormalizedScore` | number | điểm chuẩn hoá trung bình trên các kỳ **đã tham gia** — dùng để xếp hạng |
| `items[].isProvisional` | boolean | `true` khi `participationCoverage` dưới ngưỡng tối thiểu (`AppConfig.rankingAggregateMinCoverageRatio`, cấu hình động, không phải hằng số tĩnh) — FE nên hiện nhãn "chưa đủ dữ liệu" |

Không có `@ApiErrors` khai báo cho lỗi nghiệp vụ ở route này (chỉ có 422 validation nếu thiếu `month` khi `level=MONTH`).

---

## 5. WebSocket `/vote` — tally realtime

Nguồn: `src/modules/survey/vote.gateway.ts`.

- **Namespace:** Socket.IO `/vote`, **public** — không cần token, không cần header. CORS theo đúng danh sách `CORS_ORIGINS` phía BE (giống REST).
- Client kết nối theo URL gốc + path namespace, vd `io('${NEXT_PUBLIC_API_BASE_URL}/vote')` (dùng socket.io-client, không phải raw WebSocket).
- **Join room theo kỳ:** client emit `joinPeriod` với payload `{ periodId }` (ObjectId string). Server ack lại (callback) với `{ status: 'SUCCESS' | 'CLOSED' | 'INVALID' }`:
  - `SUCCESS` — đã join room `vote:{periodId}`, server **emit ngay** 1 event `voteTally` với snapshot tally hiện tại (cùng shape `VoteTallyResDto` ở §3.4).
  - `CLOSED` — `periodId` hợp lệ nhưng kỳ không `OPEN`/không đủ scope (tương ứng lỗi 409 của REST `/vote/live`).
  - `INVALID` — `periodId` sai định dạng hoặc lỗi khác khi tra cứu.
- **Cập nhật liên tục:** sau khi `POST /vote` ghi thành công, server broadcast `voteTally` mới tới room `vote:{periodId}` — **throttle tối đa 1 lần / 2 giây / kỳ** (dùng khoá Redis `SET NX EX`), best-effort (nếu broadcast lỗi, phiếu vote đã ghi vẫn được tính thành công, chỉ mất update realtime).
- **Khi nào dùng thay vì poll REST:** dùng WebSocket khi Guest đang mở màn hình tally trực tiếp trong lúc kỳ `OPEN` (gọi `GET /vote/live` một lần để render lần đầu, sau đó chỉ nghe `voteTally` thay vì set interval poll). Với các trang không cần realtime (catalog, kết quả REFLECTED) thì dùng REST bình thường — không có kênh WebSocket cho các route đó.
- Server tự cấu hình Redis adapter (`@socket.io/redis-adapter`) để scale nhiều instance — không ảnh hưởng contract phía FE.

---

## 6. Cache & rate-limit — quan sát thật từ code

### 6.1. Cache đọc (Redis, versioned — `CacheService.getOrSet`/`bumpVersion`)

Cơ chế: mỗi namespace cache có 1 counter version `cache:ver:{ns}` trên Redis; key cache thật là `cache:{ns}:v{version}:{suffix}`. Khi có hành động ghi liên quan, service gọi `bumpVersion(ns)` → mọi key cache cũ của namespace đó lập tức "mồ côi" (không còn được đọc trúng nữa), **không chỉ dựa vào TTL hết hạn**. Toàn bộ cache có thể tắt hẳn qua env `READ_CACHE_ENABLED=false` (mặc định `true`) — khi tắt, mọi route dưới đây luôn đọc thẳng DB.

| Route | Namespace | TTL | Bump khi nào |
|---|---|---|---|
| `GET /public/series` | `pubseries` | 120s — **chỉ cache khi `offset=0`** (trang đầu); các trang sau luôn query thẳng DB | Series/chapter đổi trạng thái publish, cover, metadata (nhiều service series/chapter cùng bump). `author.displayName` cũng nằm trong entry này, nên đổi bút danh có thể hiện chậm tối đa 120 giây. |
| `GET /public/series/:id` | `pubseries` | 120s | như trên; gồm cả `author.displayName` |
| `GET /public/chapters/:id/pages` | `pubseries` | 120s | như trên |
| `GET /vote/context` | `votectx` | 60s | `SurveyPeriodService` khi tạo/đổi trạng thái kỳ bình chọn |
| `GET /vote/results/latest`, `GET /vote/periods`, `GET /vote/results`, `GET /rankings/aggregate` | `ranking` | 60s (con trỏ "kỳ mới nhất") hoặc 3600s (dữ liệu kỳ đã REFLECTED — bất biến nên TTL dài) tuỳ loại truy vấn | `SurveyPeriodService` (đổi trạng thái kỳ) **và** khi **Super Admin** finalize ranking (`ranking-finalize-effects.service.ts`) — từ 2026-07-29 finalize là `SUPER_ADMIN`-only, xem `07-super-admin.md` §14 |
| `GET /vote/live` | — | **không cache** | route cố ý luôn đọc thẳng DB vì cần realtime |
| `POST /vote/otp`, `POST /vote` | — | không cache (mutation) | |

FE implication: sau khi Editor mở/đóng/chốt kỳ, dữ liệu catalog/vote-context/ranking cập nhật **ngay** (bump version), không cần đợi TTL; ngược lại nếu FE thấy dữ liệu cũ trong vài chục giây đầu sau khi tự thao tác (vd F5 ngay sau khi vote), đó là do TTL bình thường của route đọc — không phải bug.

### 6.2. Rate-limit theo IP cho route đọc công khai

`PublicRateLimitGuard` (đếm theo IP, mặc định **120 request / 60 giây**, env `PUBLIC_RL_IP_MAX`/`PUBLIC_RL_IP_WINDOW`) áp dụng cho: `GET /public/series`, `GET /public/series/:id`, `GET /public/chapters/:id/pages`, `GET /vote/results/latest`, `GET /vote/periods`. **Không** áp dụng cho `GET /vote/results`, `GET /rankings/aggregate`, `GET /vote/context`, `GET /vote/live`, `POST /vote/otp`, `POST /vote` (2 route vote/otp và vote đã có rate-limit nghiệp vụ riêng theo identity/IP ở §3.2/§3.3, không dùng guard này). Lỗi vượt hạn mức: `429 { message: "Error.PublicRateLimited", retryAfter }` — không có field `code` riêng, FE dựa vào `retryAfter` (giây) để hiện cooldown.
