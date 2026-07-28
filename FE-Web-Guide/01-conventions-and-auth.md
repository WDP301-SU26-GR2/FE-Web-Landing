# §01 — Quy ước chung + Auth & Tài khoản (dùng chung mọi role)

> **Nguồn:** đọc trực tiếp `BE-dev/src/core/*`, `BE-dev/src/infrastructure/*`, `BE-dev/src/modules/auth/*`, `BE-dev/src/modules/storage/*`, `BE-dev/src/modules/users/*`, `BE-dev/src/modules/notification/*`, `BE-dev/prisma/schema.prisma`, `BE-dev/ARCHITECTURE.md`, `BE-dev/AGENTS.md` — **KHÔNG** copy lại từ `FE-API-Guide-v3.md`/`FE-Mobile-RN-Guide.md` cũ (2 file đó có thể đã lỗi thời so với code hiện tại).
> Ngày dựng: 2026-07-27. Mọi role-file khác (`02-*.md` → `07-*.md`) tham chiếu NGƯỢC vào file này thay vì lặp lại — sửa quy ước chung thì sửa 1 chỗ ở đây.

---

## 0. Cách đọc bộ guide này

- `00-INDEX.md` — mục lục, chọn role.
- `01-conventions-and-auth.md` (file này) — response envelope, lỗi, phân trang, upload file, realtime, **Auth & Tài khoản** (dùng chung mọi role đã đăng nhập), **enum dictionary đầy đủ 66 enum**, **FE env vars**.
- `02-guest-reader.md` … `07-super-admin.md` — theo role, chỉ liệt kê API **role đó gọi được** (đối chiếu `test/flows/route-roles.ts` — file sinh tự động từ Reflect metadata runtime, 277 route, **nguồn sự thật duy nhất về quyền route**).
- Mỗi bảng field trong các file role ghi rõ: **Bắt buộc?** (✅/⛔/tuỳ) · **Kiểu/enum** (enum thì tra ở §7 file này) · **Ghi chú** (ràng buộc, ý nghĩa nghiệp vụ).

---

## 1. Response Envelope (BẮT BUỘC đọc trước khi code bất kỳ call nào)

Toàn bộ response **thành công** đi qua `ResponseEnvelopeInterceptor` (đăng ký **trước** `ZodSerializerInterceptor`):

```jsonc
{ "success": true, "message": "Success", "data": { /* payload thật — bảng field trong guide mô tả CHÍNH payload này */ } }
```

- Service trả object có field `message` (string) → `message` được nâng lên top-level, phần còn lại là `data` (hoặc `null` nếu hết field). Nếu không có field `message` → `message: "Success"`, `data` = nguyên payload.
- ⚠️ **DTO Swagger mô tả shape CHƯA bọc** (chính là `data`) — FE luôn đọc `res.data`.

Response **lỗi** luôn qua `CatchEverythingFilter` (bộ lọc lỗi DUY NHẤT trong toàn hệ thống):

```jsonc
// Lỗi field-level (validation hoặc domain có path):
{ "success": false, "statusCode": 422, "message": "Validation failed",
  "errors": [ { "message": "Địa chỉ email không hợp lệ", "path": "email" } ] }

// Lỗi đơn (không gắn field cụ thể):
{ "success": false, "statusCode": 403, "message": "Error.EmailNotVerified" }

// Rate-limit (OTP) — thêm code + retryAfter cho UI cooldown:
{ "success": false, "statusCode": 429, "message": "Error.OtpRateLimited",
  "code": "AUTH_OTP_RATE_LIMITED", "retryAfter": 60 }
```

- `message` **luôn là string**. Có `errors[]` khi lỗi gắn field cụ thể (1 issue → `message` = message của issue đó; nhiều issue → `message: "Validation failed"`).
- Mã lỗi nghiệp vụ nằm trong `message` dạng **`Error.PascalCase`** (vd `Error.EmailNotVerified`, `Error.SeriesNotSerialized`) — **FE phân nhánh logic theo chuỗi `message` này** (đây là "code" ổn định của hệ thống hiện tại — không có field `code` riêng cho lỗi thường, trừ nhánh rate-limit OTP có thêm `code`+`retryAfter`).
- Prisma `P2002` (trùng unique) → 409. Lỗi không xác định → 500 (đã log server, FE hiện thông báo lỗi hệ thống chung).
- **Validation fail = 422**, KHÔNG PHẢI 400 — đây là design quyết định cố ý (`CustomZodValidationPipe`).
- 401 = thiếu/sai/hết hạn Bearer token. 403 = có token nhưng sai role, hoặc đúng role nhưng sai **scope sở hữu** (không phải chủ sở hữu/người được phân công). 404 = không tìm thấy (gồm id không phải ObjectId 24-hex hợp lệ — mọi route `:id` đều guard trước khi query, trả 404 sạch thay vì 500). 409 = state machine sai bước hoặc trùng dữ liệu. 503 = tính năng phụ thuộc service ngoài đang tắt (vd AI segmentation khi `AI_SERVICE_URL` rỗng).

---

## 2. Quy ước field trong các bảng API của guide

- **Bắt buộc** — ✅ luôn phải gửi (thiếu → 422) · ⛔ read-only (chỉ xuất hiện ở response, FE không bao giờ gửi lên) · **tuỳ** = optional, có ghi chú hành vi khi omit.
- **Partial-update (PATCH/PUT)**: field omit hoặc gửi `null` = **giữ nguyên** giá trị cũ; gửi mảng `[]` = **xoá sạch** mảng đó. Ngoại lệ: `PATCH /me` cho chuỗi rỗng `''` = xoá field nullable (`displayName`/`avatar`).
- Schema Zod hầu hết là `.strict()` — gửi field lạ không có trong schema → **422**, không bị lờ đi.
- **Phân trang**: query `limit` (default 20, tối đa 100) + `offset` (default 0). Response list có thể trả thẳng mảng, hoặc bọc `{ items, total, limit, offset }` khi route có tổng số (đọc kỹ shape ghi trong từng route — không đồng nhất 100% giữa các module vì lịch sử phát triển khác thời điểm).
- **Datetime**: luôn ISO 8601 UTC (`2026-07-27T09:00:00.000Z`). FE tự đổi sang giờ VN (UTC+7) khi hiển thị.
- **Id**: mọi id là chuỗi ObjectId Mongo 24-hex. Gửi id rác (không đúng format) → 404 sạch (không phải 500) nhờ guard ở BE.

---

## 3. File & Upload (Cloudflare R2 — BE không giữ bytes)

Nguồn: `src/modules/storage/*`, ground-truth 2026-07-27.

Mọi field kiểu file (`coverImage`, `originalFile`, `compositeFile`, `portfolioFiles`, `avatar`, `namePages[].fileUrl`...) lưu **object key** trên R2, KHÔNG phải URL. Luồng bắt buộc luôn là 3 bước:

1. **Xin URL upload** — `POST /uploads/sign` (cần Bearer, mọi role đã login đều gọi được — route access `AUTH`):

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `fileName` | ✅ | string (1–255) | tên file gốc |
| `contentType` | ✅ | enum literal | chỉ nhận: `image/png`, `image/jpeg`, `image/webp`, `application/pdf` — sai → 422 |
| `contentLength` | ✅ | number (int, dương) | bytes; phải ≤ `AppConfig.maxUploadBytes` (mặc định 15MB = 15728640) — vượt → lỗi `Error.FileTooLarge` |
| `assetType` | tuỳ | enum `AssetType` | `REFERENCE`/`BACKGROUND`/`SCREENTONE`/`BRUSH`/`OTHER`/`DOCUMENT` (`DOCUMENT` do hệ thống tự sinh — vd PDF hợp đồng, FE không tự chọn loại này) |

   Response: `{ assetId, key, uploadUrl, requiredHeaders: {contentType: "..."}, expiresAt }`.

2. **PUT trực tiếp lên R2** — HTTP `PUT uploadUrl` với **đúng** header trong `requiredHeaders` (chủ yếu `Content-Type`) + body = bytes file. Sai header → R2 trả 403 `SignatureDoesNotMatch` (không phải lỗi BE).
3. **Gửi `key`** (KHÔNG phải `uploadUrl`) vào field nghiệp vụ tương ứng (vd `coverImage`, `originalFile`).

**Hiển thị lại file đã upload** — `POST /uploads/sign-download` `{ key }` → `{ downloadUrl, expiresAt }`. URL **có hạn** (ngắn) — không cache URL lâu, cache `key` rồi xin URL mới khi cần hiển thị. Route public (`/public/*`) tự trả sẵn URL đã ký, dùng thẳng.

Lỗi có thể gặp: `Error.UnsupportedFileType` (422) · `Error.FileTooLarge` (422) · `Error.DownloadForbidden` (403 — không phải chủ sở hữu/không đúng role được xem) · `Error.AssetNotFound` (404).

---

## 4. Realtime & Notification

- **Mặc định polling** — không có WebSocket cho notification. `GET /notifications` kèm `unreadCount` dùng làm badge; poll 15–30s hoặc khi focus tab.
- **Duy nhất WebSocket `/board`** (Socket.IO, namespace `/board`) cho phiên họp Hội đồng realtime (chat + tally) — chi tiết ở `06-board-member.md` §Board Session (đọc code `src/modules/board/board.gateway.ts`). Ngoài ra có namespace `/vote` **public** (không cần token) cho tally bình chọn độc giả realtime — chi tiết ở `02-guest-reader.md`.
- **Notification** (`GET /notifications?isRead=&type=&limit=&offset=`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` — route `AUTH`, mọi role đã login gọi được): field `type` là enum `NotificationType` (`SYSTEM`/`CONTRACT`/`TASK`/`DEADLINE`/`SURVEY`/`BOARD`/`REVIEW`); `referenceType` là chuỗi dạng `<ENTITY>_<ACTION>` (vd `TASK_ASSIGNED`, `PROPOSAL_RESUBMITTED`) dùng để deep-link — mỗi role-file liệt kê đúng các `referenceType` module đó thật sự phát ra (grep `notify(` / `notifySafe(` trong module tương ứng, đừng đoán).
- Notification chống trùng bằng `dedupeKey` nội bộ — FE **không cần tự dedupe** danh sách trả về.

---

## 5. Auth & Tài khoản (dùng chung — nguồn: `src/modules/auth/*`, `src/modules/users/*`)

### 5.1. Vai trò & vòng đời tài khoản

- `RoleCode`: `MANGAKA` · `ASSISTANT` — tự đăng ký qua `POST /auth/register`. `EDITOR` · `BOARD_MEMBER` — chỉ `SUPER_ADMIN` tạo qua `POST /admin/users` (mật khẩu tạm, ép đổi lần đầu). `SUPER_ADMIN` — seed sẵn lúc khởi tạo hệ thống, không có route tự tạo.
- `UserStatus`: `INACTIVE` (vừa đăng ký, chưa verify email) → `ACTIVE` · `BANNED` (cấm vĩnh viễn, login → 403 `Error.AccountBanned`) · `BLOCKED` (khoá tạm, admin mở lại được).
- `User.mustChangePassword = true` (tài khoản do Admin cấp) → **chặn 403 mọi route nghiệp vụ** (kể cả `GET /me`) tới khi gọi `POST /auth/change-password`. Flag này trả về ngay trong response login/refresh — FE phải điều hướng sang màn đổi mật khẩu bắt buộc trước, không cho vào app.
- Access token JWT mang `userId` + `roleName` (dùng để FE tự biết role ngay từ token, không cần gọi thêm API để rẽ nhánh UI theo role).

### 5.2. `POST /auth/register` — PUBLIC — Mangaka/Assistant tự đăng ký

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `email` | ✅ | email string | unique — trùng → 409/422 `Error.EmailAlreadyExists` |
| `name` | ✅ | string | tên thật |
| `displayName` | ✅ | string (2–100) | tên hiển thị |
| `phoneNumber` | ✅ | string E.164 | vd `+84901234567` |
| `password` | ✅ | string (8–100) | phải có hoa + thường + số (regex `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,100}$`) |
| `confirm_password` | ✅ | string | phải khớp `password`, sai → 422 path `confirm_password` |
| `type` | ✅ | enum `RoleCode` subset | **chỉ nhận** `MANGAKA` hoặc `ASSISTANT` — gửi role khác → 422 |

→ Tạo `User` status `INACTIVE`, gửi OTP email `purpose=REGISTER`. Response: `MessageResDto { message }` (201).
**Lỗi:** `Error.EmailAlreadyExists` (422/409) · 429 rate-limit OTP (`code: AUTH_OTP_RATE_LIMITED` + `retryAfter`).

### 5.3. `POST /auth/verify-email` — PUBLIC

`{ email, code: string 6 ký tự }` → verify OTP `REGISTER` → `emailVerified=true`, `status=ACTIVE`.
Lỗi: `Error.EmailAlreadyVerified` (409) · `Error.OTPExpired` (410) · `Error.InvalidOTP` (422, path `code`) · `Error.OTPLocked` (422 — sai quá số lần, phải xin OTP mới) · `Error.EmailNotFound` (422).
⚠️ **Không có route resend OTP đăng ký riêng** — `POST /auth/send-otp-email` chỉ dùng cho `FORGOT_PASSWORD` (xem 5.6); đăng ký lại email đã tồn tại → lỗi.

### 5.4. `POST /auth/login` — PUBLIC

`{ email, password }` (schema `.strict()` — chỉ 2 field, không có field khác). Response `LoginRes`:

```jsonc
{
  "user": { "id", "email", "name", "displayName", "phoneNumber", "role": { /* zRole() — id/code/description */ } },
  "mustChangePassword": boolean,
  "accessToken": string,
  "refreshToken": string
}
```

Lỗi: `Error.AccountBanned` (403 — bao gồm cả `BLOCKED`) · `Error.EmailNotVerified` (403) · `Error.EmailNotFound` (422) · `Error.InvalidPassword` (422, path `password`).

### 5.5. `POST /auth/google` — PUBLIC

`{ idToken: string }` (ID token thật lấy từ Google Sign-In SDK, KHÔNG phải access token Google). BE verify chữ ký + `aud` khớp `GOOGLE_CLIENT_ID`, tìm `User.googleId` hoặc link theo email. Response giống `LoginRes`.
Lỗi: `Error.InvalidGoogleToken` (401) · `Error.GoogleEmailNotVerified` (403) · `Error.GoogleAccountNotRegistered` (403 — user chưa từng đăng ký bằng email đó, CTA sang đăng ký thường) · `Error.AccountBanned` / `Error.EmailNotVerified` · `Error.GoogleAccountMismatch` (409 — email Google khác tài khoản đã link trước đó).

### 5.6. Quên/đặt lại & đổi mật khẩu

- **Xin OTP quên mật khẩu** — `POST /auth/send-otp-email` `{ email, purpose }` (purpose thực tế dùng `FORGOT_PASSWORD`) — PUBLIC, có rate-limit (429 + `retryAfter`).
- **Đặt lại** — `POST /auth/forgot-password` `{ email, code (6 ký tự), newPassword, confirmNewPassword }` — PUBLIC. Reset xong → **toàn bộ refresh token của user bị revoke** (buộc đăng nhập lại mọi thiết bị). Lỗi: `Error.OTPExpired` · `Error.EmailNotFound` · `Error.InvalidOTP` · `Error.OTPLocked` · `Error.InvalidPassword` (newPassword/confirm không khớp pattern).
- **Đổi mật khẩu (đã đăng nhập)** — `POST /auth/change-password` `{ currentPassword, newPassword, confirmNewPassword }` — cần Bearer, route này **không** bị chặn bởi `mustChangePassword` (đây chính là lối thoát bắt buộc). Lỗi: `Error.InvalidPassword`.

### 5.7. Token & session

- `POST /auth/refresh-token` `{ refreshToken }` — PUBLIC (tự thân refresh token là bằng chứng). **Rotate**: refresh cũ bị revoke ngay, dùng lại → 401 `Error.RefreshTokenAlreadyUsed` (dấu hiệu token có thể bị lộ — FE nên force-logout khi gặp lỗi này). Response giống `LoginRes`.
- `POST /auth/logout` `{ refreshToken }` — PUBLIC — revoke đúng refresh token đó.
- Access token TTL ngắn (`ACCESS_TOKEN_EXPIRES_IN`, khuyến nghị FE đọc `exp` trong JWT hoặc bắt 401 rồi gọi refresh 1 lần → retry request gốc).

### 5.8. Hồ sơ chung mọi role — `GET/PATCH /me`

`GET /me` trả thông tin user hiện tại (id/email/name/displayName/phoneNumber/avatar/role...). `PATCH /me` cho sửa field cá nhân cơ bản (displayName/avatar/phoneNumber tuỳ implement hiện tại — field nào omit/`null` giữ nguyên, chuỗi rỗng `''` xoá field nullable như đã nói ở §2). Route `AUTH` — mọi role gọi được, không cần role cụ thể.
Hồ sơ **nghiệp vụ riêng theo role** (MangakaProfile/AssistantProfile/StaffProfile) nằm ở route riêng, xem file role tương ứng (`GET/PUT /me/mangaka-profile`, `/me/assistant-profile`, `/me/staff-profile`).

---

## 6. FE Environment Variables

### 6.1. Biến FE tự cấu hình (không phụ thuộc BE trả về)

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` (hoặc tương đương theo stack FE) | ✅ | Base URL của BE (vd `https://api.mangaka.example.com`) — mọi route trong guide là path tương đối so với URL này |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | ✅ (nếu bật Google Sign-In) | **Phải giống hệt** biến `GOOGLE_CLIENT_ID` phía BE (`BE-dev/.env`) — khác nhau → BE verify `aud` thất bại → `Error.InvalidGoogleToken` cho mọi lần đăng nhập Google |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | ✅ (nếu dùng màn Guest Vote) | Site key Google reCAPTCHA v3 — **phải cùng project** với `RECAPTCHA_SECRET` phía BE (BE chỉ verify token, không có route trả site key — 2 bên phải nhận key từ cùng một chỗ tạo project reCAPTCHA, trao đổi thủ công với BE-dev, không qua API) |

### 6.2. Không có biến BE nào khác cần đồng bộ sang FE

Theo `src/core/config/env-schema.ts` (nguồn sự thật duy nhất, 2026-07-27): các secret khác (`ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `R2_*`, `RESEND_API_KEY`, `AI_SERVICE_API_KEY`, `IDENTITY_HASH_PEPPER`...) **thuần server-side**, FE không bao giờ cần và không bao giờ được biết. `CORS_ORIGINS` là biến BE phải khai origin của FE (production + preview) — báo domain FE cho BE thêm vào, không phải FE tự set.

⚠️ Nếu FE deploy thêm domain preview mới (Vercel preview URL, staging...) → phải báo domain đó để thêm vào `CORS_ORIGINS` phía BE, nếu không mọi request bị trình duyệt chặn CORS (không phải lỗi API).

---

## 7. Từ điển Enum đầy đủ (66 enum — nguồn: `prisma/schema.prisma`, đọc trực tiếp 2026-07-27)

> Enum đánh dấu **(read-only)** = chỉ xuất hiện ở response, FE không bao giờ gửi lên. Enum không đánh dấu = FE có thể phải gửi field mang enum đó trong request (tra ở bảng field từng route).

### 7.1. Identity & Access
- **`RoleCode`**: `MANGAKA` · `ASSISTANT` · `EDITOR` · `BOARD_MEMBER` · `SUPER_ADMIN`.
- **`UserStatus`** (read-only): `INACTIVE` · `ACTIVE` · `BANNED` · `BLOCKED`.
- **`RegistrationType`** (read-only): `SELF_REGISTERED` · `ADMIN_CREATED`.
- **`OtpPurpose`** (nội bộ BE, FE không gửi trực tiếp — chọn qua field `purpose` ở `send-otp-email`): `REGISTER` · `FORGOT_PASSWORD` · `SIGNING_CONTRACT` · `VOTE`.

### 7.2. Series & Proposal (Flow 1/5, chi tiết ở `03-mangaka.md`/`05-editor.md`)
- **`SeriesStatus`** (read-only, dẫn xuất bởi state machine): `DRAFT` · `IN_REVIEW` · `READY_TO_PITCH` · `PITCHED` · `SERIALIZED` · `HIATUS` · `COMPLETING` · `CANCELLING` · `COMPLETED` · `CANCELLED` · `REJECTED` · `ABANDONED` · `WITHDRAWN`.
- **`ProposalStatus`** (read-only, embedded trong Series.proposal): `DRAFT` · `PROPOSAL_REVIEW` · `PROPOSAL_REVISION` · `PROPOSAL_APPROVED` · `PITCHED` · `APPROVED` · `REJECTED` · `WITHDRAWN`.
- **`Genre`** (17 giá trị, mảng): `ACTION` · `ADVENTURE` · `COMEDY` · `DRAMA` · `FANTASY` · `HORROR` · `MYSTERY` · `ROMANCE` · `SCI_FI` · `SLICE_OF_LIFE` · `SPORTS` · `SUPERNATURAL` · `THRILLER` · `HISTORICAL` · `ISEKAI` · `MECHA` · `PSYCHOLOGICAL`.
- **`Demographic`**: `SHONEN` · `SEINEN` · `SHOJO` · `JOSEI` · `KODOMO`.
- **`PublicationType`**: `WEEKLY` · `MONTHLY` · `IRREGULAR`.
- **`RelationshipType`** (franchise): `SEQUEL` · `SPINOFF` · `SIDE_STORY` · `REBOOT`.
- **`FranchiseConsentStatus`** (read-only): `PENDING` · `APPROVED` · `REJECTED`.

### 7.3. Name & Chapter Production
- **`NameStatus`**: `DRAFT` · `SUBMITTED` · `IN_REVIEW` · `REVISION` · `APPROVED`.
- **`NameKind`**: `PROPOSAL` · `CHAPTER`.
- **`ChapterStatus`** (read-only, dẫn xuất từ Manuscript): `DRAFT` · `IN_PRODUCTION` · `COMPLETED` · `PUBLISHED`.
- **`ChapterHoldAction`** (read-only, trong `holdHistory[]`): `HOLD` · `RESUME`.
- **`ManuscriptStatus`**: `DRAFT` · `IN_PRODUCTION` · `EDITOR_REVIEW` · `EDITOR_REVISION` · `READY_FOR_PRINT` · `AWAITING_CO_OWNER_APPROVAL` · `PUBLISHED`.
- **`PageStatus`** (read-only, backend-driven): `DRAFT` · `COMPLETED` · `REVISING`.
- **`CoOwnerApprovalStatus`** (read-only): `PENDING` · `APPROVED` · `REJECTED` · `ESCALATED`.

### 7.4. Region / Task / AI / Production Stage
- **`RegionType`**: `PANEL` · `BACKGROUND` · `SPEECH_BUBBLE` · `SFX` · `CHARACTER`.
- **`TaskStatus`** (read-only): `ASSIGNED` · `IN_PROGRESS` · `SUBMITTED` · `UNDER_REVIEW` · `APPROVED` · `REVISION_REQUESTED` · `ON_HOLD` · `CANCELLED`.
- **`TaskVersionReviewStatus`** (read-only): `PENDING` · `APPROVED` · `REVISION_REQUESTED`.
- **`AiJobType`**: `SEGMENT` (đang dùng) · `COLOR` / `NUMBER` (dự phòng, chưa dùng).
- **`AiJobStatus`** (read-only): `QUEUED` · `RUNNING` · `SUCCEEDED` · `FAILED`.
- **`AiSegmentMode`**: `MODEL` · `HEURISTIC`.
- **`AiSegmentSource`**: `ORIGINAL` · `COMPOSITE` (bản nền AI đọc để phân vùng — trang gốc hay bản đã ghép).
- **`ProductionStageStatus`** (read-only): `LOCKED` · `ACTIVE` · `COMPLETED`.

### 7.5. Studio & Review
- **`Specialization`**: `BACKGROUND` · `SCREENTONE` · `EFFECT_LINES` · `INKING` · `COLORING` · `LETTERING`.
- **`AvailabilityStatus`**: `AVAILABLE` · `BUSY` · `ON_LEAVE` · `UNAVAILABLE`.
- **`CollaborationInviteStatus`** (read-only): `PENDING` · `ACCEPTED` · `DECLINED` · `EXPIRED` · `CANCELLED`.
- **`StudioAssignmentStatus`** (read-only): `ACTIVE` · `COMPLETED` · `TERMINATED`.
- **`ReviewStage`** (read-only, annotation): `ASSISTANT` · `MANGAKA` · `EDITOR`.
- **`AnnotationType`**: `TEXT` · `HIGHLIGHT` · `DRAWING`.
- **`AnnotationTargetType`**: `PAGE` · `REGION` · `TASK` · `MANUSCRIPT` · `NAME`.
- **`AssetType`**: `REFERENCE` · `BACKGROUND` · `SCREENTONE` · `BRUSH` · `OTHER` · `DOCUMENT` (`DOCUMENT` do hệ thống tự sinh, FE không chọn khi upload thủ công).
- **`RevisionTargetType`** (read-only): `PROPOSAL` · `NAME` · `MANUSCRIPT` · `TASK`.

### 7.6. Contract & Payment (Flow 6)
- **`ContractType`**: `FULL_BUYOUT` (NXB mua đứt) · `REVENUE_SHARE` (ăn chia — mọi quyết định lớn cần Mangaka đồng ý).
- **`ContractStatus`** (read-only): `DRAFT` · `MANGAKA_REVIEW` · `MANGAKA_APPROVED` · `BOARD_APPROVED` · `NEGOTIATION` · `MANGAKA_SIGNED` · `ACTIVATION_PENDING` (🆕 — HĐ thay thế của giao dịch FULL_BUYOUT chờ kích hoạt, KHÔNG cho publish/PDF) · `FULLY_EXECUTED` · `FULFILLED` · `TERMINATED` · `TERMINATED_BY_BREACH` · `EXPIRED` · `VOIDED`.
- **`ConditionType`**: `CHAPTER_MILESTONE` · `RECURRING_CHAPTER` · `RANKING_MILESTONE` · `TIME_BOUND`.
- **`PaymentConditionStatus`** (read-only): `PENDING` · `ACHIEVED` · `PAID` · `CANCELLED` · `MISSED` · `DISABLED`.
- **`PaymentType`** (read-only): `CONDITION_PAYOUT` · `REVENUE_SHARE` · `COMPENSATION` · `CHAPTER_MILESTONE` · `RECURRING_CHAPTER` · `RANKING_MILESTONE` · `TIME_BOUND` · `TRANSFER`.
- **`PaymentSource`** (read-only): `CONTRACT` · `REPRINT` · `TRANSFER` · `TERMINATION` · `MANUAL`.
- **`PaymentRecordStatus`** (read-only): `TRIGGERED` · `MISSED` · `PENDING` · `APPROVED` · `PAID` · `FAILED` · `CANCELLED`.
- **`ContractAmendmentStatus`** (read-only): `DRAFT` · `PENDING_SIGNATURES` · `FULLY_EXECUTED` · `VOIDED`.
- **`AmendmentTrigger`** (read-only): `MANUAL` · `FORMAT_CHANGE` · `COMPLETION`.

### 7.7. Board & Decision (Flow 1/5/7/8)
- **`BoardSessionStatus`** (read-only): `UPCOMING` · `ACTIVE` · `CONCLUDED`.
- **`BoardSessionPhase`**: `PRESENTING` · `QA` · `VOTING` (forward-only, không lùi được).
- **`DecisionType`** (read-only): `CONTINUE` · `CANCEL` · `HIATUS` · `ENDING_ALLOWANCE` · `SERIES_CONTRACT_APPROVAL` · `SERIALIZATION` · `CANCELLATION` · `FORMAT_CHANGE` · `COMPLETION` · `REPRINT` · `TRANSFER` · `CONTRACT`.
- **`BoardDecisionResult`** (read-only): `PENDING` · `PENDING_QUORUM` · `APPROVED` · `REJECTED` · `EXPIRED`.
- **`VoteValue`**: `APPROVE` · `REJECT` · `ABSTAIN`.

### 7.8. Survey / Voting / Ranking (Flow 4)
- **`SurveyStatus`** (read-only): `DRAFT` · `OPEN` · `CLOSED` · `REFLECTED`.
- **`ReaderAuthMethod`** (read-only): `EMAIL_OTP` (đang dùng) · `PHONE_OTP` / `CAPTCHA_ONLY` (dự phòng, chưa dùng).
- **`VotingAuthMode`**: `OTP` · `CAPTCHA` · `HYBRID`.
- **`RiskLevel`** (read-only, nội bộ — KHÔNG trả ở route public): `NONE` · `LOW` · `MEDIUM` · `SEVERE`.

### 7.9. Reprint / Transfer (Flow 7/8)
- **`ReprintRequestStatus`** (read-only): `PENDING` · `MANGAKA_APPROVED` · `BOARD_APPROVED` · `PROPOSED` · `MANGAKA_REVIEW` · `IN_PRODUCTION` · `APPROVED` · `PUBLISHED` · `REJECTED` · `REJECTED_BY_MANGAKA`.
- **`ReprintChapterStatus`** (read-only): `PENDING` · `IN_REVISION` · `READY` · `APPROVED` · `PUBLISHED`.
- **`ReprintRevisionMode`**: `AS_IS` · `WITH_REVISION`.
- **`ReviserType`**: `INTERNAL_TEAM` · `OTHER_MANGAKA`.
- **`TransferType`**: `FULL_TRANSFER` · `PARTIAL_TRANSFER` (bên gốc giữ 1 phần → thành co-owner).
- **`TransferRequestStatus`** (read-only): `SUBMITTED` · `UNDER_REVIEW` · `REJECTED_BY_BOARD` · `NEGOTIATING` · `REJECTED_BY_ORIGINAL_MANGAKA` · `PROPOSED` · `ACCEPTED` · `REJECTED` · `CANCELLED` · `AWAITING_REPLACEMENT_SIGNATURES` · `AWAITING_TRANSFER_SIGNATURES` · `COMPLETED`.
- **`TransferContractStatus`** (read-only): `DRAFT` · `A_SIGNED` · `B_SIGNED` · `BOARD_SIGNED` · `FULLY_EXECUTED` · `VOIDED`.
- **`TransferSignerRole`**: `MANGAKA_A` · `MANGAKA_B` · `BOARD`.

### 7.10. Deadline / Publication / Khác
- **`DeadlineRequestStatus`** (read-only): `PROPOSED` · `COUNTER_PROPOSED` · `AGREED_BY_PARTIES` · `BOARD_REVIEW` · `ESCALATED` · `APPROVED` · `REJECTED`.
- **`ReadingDirection`**: `RTL` · `LTR`.
- **`NotificationType`**: `SYSTEM` · `CONTRACT` · `TASK` · `DEADLINE` · `SURVEY` · `BOARD` · `REVIEW`.
- **`AuditEntityType`** (read-only, `GET /audit`): `SERIES` · `MANUSCRIPT` · `PAGE` · `CHAPTER` · `TASK` · `DEADLINE_REQUEST` · `USER` · `REGION` · `APP_CONFIG` · `CONTRACT` · `BOARD_DECISION` · `REPRINT_REQUEST` · `TRANSFER_REQUEST` · `PAYMENT_RECORD` · `SURVEY_PERIOD` · `PUBLICATION_VERSION` · `BOARD_SESSION`.
- **`OutboxEventType`** (nội bộ hạ tầng, FE không thấy): `TRANSFER_REPLACEMENT_READY`.

> **`WarningLevel`** (`NONE`/`YELLOW`/`RED`/`CRITICAL`, read-only ở `GET /chapters/:id/progress`) là enum **tính toán runtime**, không nằm trong `schema.prisma` — xem chi tiết ngưỡng ở `03-mangaka.md`/`05-editor.md` phần Chapter Progress.

---

## 8. Danh sách vai trò & phạm vi route (tổng quan — chi tiết từng route ở file role)

Nguồn: `BE-dev/test/flows/route-roles.ts` (**sinh tự động từ Reflect metadata runtime lúc boot, 277 route, 2026-07-27** — là nguồn sự thật duy nhất về việc route nào role nào gọi được, không suy đoán từ code nghiệp vụ).

| Role | Số route độc quyền (`@Roles` chứa role đó) | File guide |
|---|---|---|
| Guest / Reader (không cần token) | 23 | `02-guest-reader.md` |
| MANGAKA | 126 | `03-mangaka.md` |
| ASSISTANT | 18 | `04-assistant.md` |
| EDITOR | 122 | `05-editor.md` |
| BOARD_MEMBER | 76 | `06-board-member.md` |
| SUPER_ADMIN | 75 | `07-super-admin.md` |

Ngoài ra có **18 route `AUTH`** (cần Bearer, không giới hạn role cụ thể — mọi role đăng nhập gọi được): `POST /auth/change-password`, `GET/PATCH /me`, `GET /notifications` + 2 route đọc/đánh dấu, `POST /uploads/sign` + `/sign-download`, `GET /chapters` + `GET /chapters/:id` (đọc, có scoping riêng theo sở hữu xử lý trong service — không phải RBAC role), `GET /assistants/:userId`, `GET /mangakas/:userId`, `GET /staff/:userId`, `GET /assistant-reviews`, `GET /mangaka-reviews`, `GET /contracts/health`, `DELETE /annotations/:id`, `PATCH /annotations/:id/resolve` — các route này được mô tả trong file role tương ứng khi nằm trong flow của role đó (vd `GET /chapters/:id` xuất hiện ở cả `03-mangaka.md` và `05-editor.md` vì cả 2 role đều dùng, mỗi bên mô tả theo góc nhìn hành động của mình).
