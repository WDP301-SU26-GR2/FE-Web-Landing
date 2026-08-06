# §07 — SUPER_ADMIN (Quản trị hệ thống)

> 🔴 **2026-08-06 — xem [`08-spec-2026-08-06-magazines-decisions-flows.md`](08-spec-2026-08-06-magazines-decisions-flows.md) (có FLOW ① tạp chí/ranking/kỳ vote):** 5 route mới thuộc Super Admin — quản lý **danh mục tạp chí** `POST`/`PATCH`/`DELETE /admin/magazines[/:name]` + đọc `GET /magazines`, và **sửa slot** `PATCH /admin/series/:id/slot` (đường sửa `magazine` rác đã lỡ nhập). Seed tạp chí **trước** khi Editor mở serial hoá thật.
>
> **Nguồn:** đọc trực tiếp code và đối chiếu quyền route với `BE-dev/test/flows/route-roles.ts` (nguồn sự thật duy nhất: **284 route** sau Spec 30/31). Ngày dựng: 2026-07-27; cập nhật §87/Spec 29: 2026-08-02; Spec 30/31: 2026-08-04.
> Đọc trước [`00-INDEX.md`](00-INDEX.md) (mục lục) và **bắt buộc** [`01-conventions-and-auth.md`](01-conventions-and-auth.md) (envelope, lỗi, phân trang, upload R2, enum §7, `GET/PATCH /me`) — file này KHÔNG lặp lại các quy ước đó.
> Enum ghi dạng `enum X` → tra giá trị đầy đủ ở `01-conventions-and-auth.md` §7.

---

## 0. Tổng quan phạm vi — 79 route độc quyền SUPER_ADMIN

Đối chiếu `test/flows/route-roles.ts`: SUPER_ADMIN có đúng **79 route** trong `allowed[]` sau Spec 30/31 (77 + 2 route đọc `GET /series-requests` và `GET /series-requests/:id`). Hai route proposal-Name đã bị xoá; hai route chapter-Name được đổi sang Storyboard.

Ngoài 79 route này, Admin còn dùng các route **AUTH** dùng chung mọi role (xem `01-conventions-and-auth.md` §5.8, §3, §4): `GET/PATCH /me`, `POST /uploads/sign` + `/sign-download`, `GET /notifications` + đánh dấu đã đọc.

| # | Method | Path | Nhóm | Mục |
|---|---|---|---|---|
| 1 | POST | `/admin/users` | A | §1.1 Tạo Editor/Board |
| 2 | GET | `/admin/users` | A | §1.2 Danh sách user |
| 3 | GET | `/admin/users/:id` | A | §1.3 Chi tiết user |
| 4 | PATCH | `/admin/users/:id/status` | A | §1.4 Ban/Block/Unban |
| 5 | DELETE | `/admin/users/:id` | A | §1.5 Xoá mềm |
| 6 | POST | `/admin/users/:id/restore` | A | §1.6 Khôi phục |
| 7 | POST | `/admin/users/:id/reset-password` | A | §1.7 Cấp lại mật khẩu tạm |
| 8 | GET | `/admin/stats` | A | §1.8 Thống kê hệ thống |
| 9 | GET | `/admin/app-config` | B | §2.1 App Config |
| 10 | PATCH | `/admin/app-config` | B | §2.1 App Config |
| 11 | GET | `/voting-config` | B | §2.2 Voting Config |
| 12 | PATCH | `/voting-config` | B | §2.2 Voting Config |
| 13 | GET | `/board/config` | B | §2.3 Board Config |
| 14 | PATCH | `/board/config/:id` | B | §2.3 Board Config |
| 15 | GET | `/audit` | C | §3 Audit log |
| 16 | GET | `/dashboard/admin` | D | §4 Dashboard |
| 17 | GET | `/series` | D | §5 Series & Chapter (theo dõi) |
| 18 | GET | `/series/:id` | D | §5 |
| 19 | GET | `/series/:id/defense-dashboard` | D | §5 |
| 22 | GET | `/chapters/:id/storyboards` | D | §5 |
| 23 | GET | `/storyboards/:id` | D | §5 |
| 24 | GET | `/chapters/:id/pages` | D | §5 |
| 25 | GET | `/chapters/:id/progress` | D | §5 |
| 26 | GET | `/chapters/:id/stages` | D | §5 |
| 27 | GET | `/board/decisions` | D | §6 Board (theo dõi + ghi song song Editor) |
| 28 | POST | `/board/decisions` | D | §6 |
| 29 | GET | `/board/decisions/:id` | D | §6 |
| 30 | GET | `/board/decisions/:id/votes` | D | §6 |
| 31 | GET | `/board/reports` | D | §6 |
| 32 | GET | `/board/reports/:id` | D | §6 |
| 33 | GET | `/board/sessions` | D | §6 |
| 34 | POST | `/board/sessions` | D | §6 |
| 35 | GET | `/board/sessions/:id` | D | §6 |
| 36 | PATCH | `/board/sessions/:id/conclude` | D | §6 |
| 37 | GET | `/board/sessions/:id/messages` | D | §6 |
| 38 | PATCH | `/board/sessions/:id/phase` | D | §6 |
| 39 | PATCH | `/board/sessions/:id/start` | D | §6 |
| 40 | GET | `/board/suggest-members` | D | §6 |
| 41 | GET | `/deadline-requests` | D | §7 Deadline requests |
| 42 | GET | `/deadline-requests/:id` | D | §7 |
| 43 | GET | `/assistants` | D | §8 Danh bạ |
| 44 | GET | `/mangakas` | D | §8 |
| 45 | GET | `/payments` | D | §9 Payments |
| 46 | GET | `/payments/:id` | D | §9 |
| 47 | PATCH | `/payments/:id/cancel` | D | §9 |
| 48 | PATCH | `/payments/:id/pay` | D | §9 |
| 49 | GET | `/payments/contracts/:id/payments` | D | §9 |
| 50 | GET | `/payments/series/:id/payments` | D | §9 |
| 51 | GET | `/payments/users/:id/payments` | D | §9 |
| 52 | GET | `/series/:seriesId/publication-versions` | D | §10 Publication versions |
| 53 | POST | `/series/:seriesId/publication-versions` | D | §10 |
| 54 | GET | `/publication-versions/:id` | D | §10 |
| 55 | PATCH | `/publication-versions/:id` | D | §10 |
| 56 | DELETE | `/publication-versions/:id` | D | §10 |
| 57 | GET | `/rankings` | D | §11 Rankings |
| 58 | GET | `/rankings/board` | D | §11 |
| 58b 🆕 | GET | `/rankings/internal/aggregate` | D | §11 (W1 — aggregate nội bộ giữ risk signal) |
| 59 | GET | `/reprint-requests` | D | §12 Reprint requests |
| 60 | GET | `/reprint-requests/:id` | D | §12 |
| 61 | GET | `/reprint-requests/:id/chapters` | D | §12 |
| 62 | GET | `/reprint-requests/:id/chapters/:chapterId` | D | §12 |
| 63 | GET | `/revision-requests` | D | §13 Revision requests |
| 64 | POST | `/survey-data/import` | D | §14 Survey/Voting periods |
| 65 | GET | `/survey-periods` | D | §14 |
| 66 | POST | `/survey-periods` | D | §14 |
| 67 | GET | `/survey-periods/:id` | D | §14 |
| 68 | POST | `/survey-periods/:id/finalize` | D | §14 |
| 69 | GET | `/survey-periods/:id/rankings` | D | §14 |
| 70 | PATCH | `/survey-periods/:id/status` | D | §14 |
| 71 | GET | `/survey-periods/:id/survey-data` | D | §14 |
| 72 | GET | `/survey-periods/:id/votes` | D | §14 |
| 73 | POST | `/tasks/:id/download-url` | D | §15 Task file download |
| 74 | GET | `/transfers/contracts/:id/signatures` | D | §16 Transfers |
| 74b 🆕 | GET | `/transfers/contracts/:id` | D | §16 Transfers (Spec 27) |
| 75 | GET | `/transfers/requests/:id` | D | §16 |

**Phát hiện quan trọng — Admin KHÔNG chỉ đọc:** 15 route trong Nhóm D là **hành động ghi** (POST/PATCH/DELETE) mà Admin có quyền ngang Editor (Board sessions/decisions, Publication versions) hoặc ngang Board Member (Payments pay/cancel). Đây là điểm khác với mô tả "Admin chỉ quản lý tài khoản" ở `Requiment.md` §2.6 (xem ghi chú cuối file).

> 🔴 **§84 (2026-07-29) — 4 route vận hành kỳ bình chọn nay ĐỘC QUYỀN Admin (trước là ngang Editor):**
> `POST /survey-periods` · `PATCH /survey-periods/:id/status` · `POST /survey-data/import` ·
> `POST /survey-periods/:id/finalize`. Lý do nghiệp vụ: `SurveyPeriod` là đơn vị theo **kỳ phát hành của cả
> tạp chí**, trong khi Editor/Tantou chỉ phụ trách vài series (Requiment §2.6 — scoping theo sở hữu/phân công);
> riêng `finalize` chốt xếp hạng so sánh toàn bộ series nên Editor thực hiện là **xung đột lợi ích**.
> Editor **vẫn đọc được** toàn bộ survey/ranking. ⇒ **FE: màn vận hành kỳ bình chọn giờ chỉ có ở Admin.**

---

## 1. Quản lý User — `admin/users` (Nhóm A, độc quyền Admin)

Nguồn: `users.controller.ts` + `services/admin-user.service.ts` (tạo), `services/admin-moderation.service.ts` (ban/block/xoá/khôi phục/reset password), `services/admin-user-query.service.ts` (list/detail), `services/admin-stats.service.ts`, `helpers/temp-password.helper.ts`.

### 1.0. Bối cảnh nghiệp vụ (đối chiếu `Requiment.md` §2.6)

Hệ thống **tự quản lý xác thực**: Mangaka/Assistant **tự đăng ký** (`POST /auth/register`) rồi tự verify email → `ACTIVE` ngay, **không** qua Admin duyệt. Admin **chỉ** cấp tài khoản cho 2 role nội bộ: **EDITOR** và **BOARD_MEMBER** (`ADMIN_CREATABLE_ROLES` trong `users.constant.ts` — gửi role khác → 422). SUPER_ADMIN tự thân được seed sẵn lúc khởi tạo hệ thống (`initialScript`), không có route tự tạo thêm Admin.

### 1.1. `POST /admin/users` — Tạo Editor/Board

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `email` | ✅ | email string | Trùng → `Error.EmailAlreadyExists` (409) |
| `name` | ✅ | string (2–100) | Tên thật |
| `phoneNumber` | ✅ | string E.164 | vd `+84901234567` |
| `roleCode` | ✅ | `enum RoleCode` (subset) | **CHỈ nhận** `EDITOR` hoặc `BOARD_MEMBER` — gửi role khác → 422 |

Không có field `password`/`displayName` trong body — mật khẩu **tự sinh** (xem cơ chế bên dưới), `displayName` để `null` (user tự đặt sau ở `PATCH /me`). Schema `.strict()` — gửi field lạ → 422.

**Cơ chế tạo (verify trong code, không suy đoán):**
1. `generateTemporaryPassword()` (`helpers/temp-password.helper.ts`): sinh chuỗi 16 ký tự — random base64url 8 byte + ép chèn 1 chữ hoa + 1 chữ thường + 1 chữ số ở đầu để chắc chắn pass được regex mật khẩu, rồi cắt còn 16 ký tự.
2. Hash bằng bcrypt (`HashingService`), lưu `User` với: `status: ACTIVE` (không qua `INACTIVE`), `emailVerified: true`, `registrationType: ADMIN_CREATED`, **`mustChangePassword: true`**.
3. Gửi email chứa mật khẩu tạm qua `EmailQueue.enqueueAdminCred` (BullMQ, có fallback gọi thẳng `EmailService.sendAccountCredentials` nếu enqueue lỗi) — **best-effort**: email gửi lỗi **không** làm fail request (Admin vẫn thấy `temporaryPassword` trong response để tự gửi tay nếu cần).
4. Trùng email (Prisma `P2002`) → bắt riêng, trả `Error.EmailAlreadyExists`.

**Response** (`AdminCreateUserRes`, 201):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | |
| `email` | string | |
| `roleCode` | `enum RoleCode` | |
| `temporaryPassword` | string | ⚠️ **Trả đúng 1 lần** ở response này — không có route nào xem lại sau đó. FE phải hiển thị ngay (khuyến nghị: kèm nút copy + cảnh báo "chỉ hiện 1 lần") |

Vì `mustChangePassword: true`, user Editor/Board mới tạo **bị chặn 403 mọi route nghiệp vụ** (kể cả `GET /me`) tới khi họ tự gọi `POST /auth/change-password` (xem `01` §5.1) — Admin không có route nào đổi hộ mật khẩu vĩnh viễn cho họ, chỉ có thể **cấp lại mật khẩu tạm mới** (§1.7).

**Lỗi:** `Error.EmailAlreadyExists` (409/422) · Validation 422 (roleCode khác EDITOR/BOARD_MEMBER, thiếu field, field lạ).

### 1.2. `GET /admin/users` — Danh sách user

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `roleCode` | tuỳ | `enum RoleCode` | Lọc theo role |
| `status` | tuỳ | `enum UserStatus` | Lọc theo trạng thái |
| `search` | tuỳ | string (1–200) | Tìm theo tên/email (case-insensitive, xem service) |
| `includeDeleted` | tuỳ | `'true'\|'false'` | `true` = gồm cả user đã xoá mềm. **Lưu ý:** parse thủ công — chỉ chuỗi `'true'` ra `true`, còn lại (kể cả thiếu) ra `false` (KHÔNG dùng `z.coerce.boolean()` vì `'false'` non-empty sẽ ra `true` nếu coerce ẩu) |
| `onlyDeleted` | tuỳ | `'true'\|'false'` | Chỉ hiện user đã xoá mềm (thùng rác) — **thắng** `includeDeleted` nếu gửi cả hai |
| `limit` / `offset` | tuỳ | number | ≤100/default 20, default 0 |

Danh sách **luôn ẩn chính Admin đang gọi** (`excludeUserId = callerId` tự động, không cần FE lọc tay) và mặc định ẩn user đã xoá mềm (`deletedAt` set — trừ khi `includeDeleted`/`onlyDeleted`).

**Response** (`AdminUserListRes`): `{ items: AdminUserRes[], total, limit, offset }`.

| Field (`AdminUserRes`) | Kiểu | Ghi chú |
|---|---|---|
| `id`, `email`, `name` | string | |
| `displayName` | string \| null | |
| `phoneNumber` | string | |
| `avatar` | string \| null | Object key R2 |
| `role` | `enum RoleCode` | |
| `status` | `enum UserStatus` | |
| `emailVerified` | boolean | |
| `registrationType` | `enum RegistrationType` | `SELF_REGISTERED` \| `ADMIN_CREATED` |
| `mustChangePassword` | boolean | Còn `true` = user Editor/Board mới tạo chưa đổi mật khẩu lần đầu |
| `createdAt` | string (ISO) | |

Không có bảng lỗi riêng (route không throw domain error, chỉ 401/403 chung).

### 1.3. `GET /admin/users/:id` — Chi tiết 1 user

Response giống 1 item của §1.2. **Lỗi:** `Error.UserNotFound` (404 — gồm cả id sai định dạng ObjectId, guard trước khi query).

### 1.4. `PATCH /admin/users/:id/status` — Ban/Block/Unban

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `status` | ✅ | `z.enum(['ACTIVE','BANNED','BLOCKED'])` | **Chỉ nhận đúng 3 giá trị này** — `INACTIVE` KHÔNG được phép gửi (state tiền-verify, không phải trạng thái Admin gán) → 422 nếu gửi |
| `reason` | tuỳ | string (≥1) | Lý do — được nhúng thẳng vào nội dung notification gửi cho user bị phạt |

**Chuyển trạng thái hợp lệ (verify trong `admin-moderation.service.ts`, không suy đoán):**
- Không có bảng `*_TRANSITIONS` cứng nhắc — route chấp nhận set thẳng `ACTIVE`/`BANNED`/`BLOCKED` từ **bất kỳ** trạng thái hiện tại nào (kể cả set lại giá trị hiện tại — no-op, không gửi notification/audit nếu `target.status === body.status`).
- **Guard riêng trước khi đổi sang `BANNED`/`BLOCKED`:** hệ thống đếm "ràng buộc đang hoạt động" của user (`countActiveCommitments`, theo role):
  - `MANGAKA`: `activeSeries` (series đang ở status không-terminal) + `executedContracts` (hợp đồng `FULLY_EXECUTED`).
  - `EDITOR`: `activeSeries` (series mình phụ trách, không-terminal).
  - `ASSISTANT`: `openTasks` (task chưa xong) + `activeAssignments` (`StudioAssignment ACTIVE`).
  - `BOARD_MEMBER`: `pendingBoardDecisions` (quyết định `PENDING`/`PENDING_QUORUM` thuộc phiên họp mời user này).
  - `total > 0` → chặn, trả `Error.UserHasActiveCommitments` (409) — **phải xử lý xong ràng buộc trước** mới ban/block được.
- Đổi sang `BANNED`/`BLOCKED` thành công → **revoke toàn bộ refresh token** của user (buộc đăng xuất mọi thiết bị ngay) + notify (`type: SYSTEM`, `referenceType: USER_BANNED`/`USER_BLOCKED` kèm `reason`) + ghi `AuditLog` (`action: BAN`/`BLOCK`, `fromState`/`toState`).
- Đổi về `ACTIVE` (từ `BANNED`/`BLOCKED`) → **không** revoke token (không cần vì user đang bị chặn không có token hợp lệ để dùng), chỉ notify (`referenceType: USER_REACTIVATED`) + audit (`action: REACTIVATE`).
- **Không thể thao tác lên chính SUPER_ADMIN khác** (kể cả chính mình) — mọi user có `role.code === SUPER_ADMIN` → `Error.CannotModifyAdminUser` (422, path `id`) trước khi kiểm bất kỳ điều kiện nào khác.
- User đã xoá mềm (`deletedAt` set) → `Error.UserNotFound` (như thể không tồn tại).

**Response:** `AdminUserRes` (status đã cập nhật).

| Lỗi | Status | Điều kiện |
|---|---|---|
| `Error.UserNotFound` | 404 | Id sai/không tồn tại/đã xoá mềm |
| `Error.CannotModifyAdminUser` | 422 | Target là SUPER_ADMIN |
| `Error.UserHasActiveCommitments` | 409 | Đổi sang BANNED/BLOCKED nhưng còn ràng buộc hoạt động (xem breakdown trên) |
| Validation | 422 | `status` không thuộc `ACTIVE`/`BANNED`/`BLOCKED` (vd gửi `INACTIVE`) |

### 1.5. `DELETE /admin/users/:id` — Xoá mềm

Không có body. Set `User.deletedAt = now()` (soft-delete — record vẫn còn trong DB, chỉ ẩn khỏi list mặc định) + revoke toàn bộ refresh token + audit (`action: SOFT_DELETE`). Response: `MessageResDto { message: 'Xoá người dùng thành công' }`.

Cùng guard "ràng buộc đang hoạt động" như §1.4 (áp dụng **luôn luôn** cho xoá, không chỉ khi ban/block) và cùng chặn thao tác lên SUPER_ADMIN.

| Lỗi | Status | Điều kiện |
|---|---|---|
| `Error.UserNotFound` | 404 | |
| `Error.CannotModifyAdminUser` | 422 | |
| `Error.UserAlreadyDeleted` | 409 | `deletedAt` đã set từ trước |
| `Error.UserHasActiveCommitments` | 409 | |

### 1.6. `POST /admin/users/:id/restore` — Khôi phục user đã xoá mềm

Không có body. `User.deletedAt` chuyển về **absent** (dùng Prisma `unset`, không phải set `null` — đúng theo gotcha AGENTS.md §10 "Optional field `null` vs ABSENT"). Response: `AdminUserRes` (đã khôi phục). Audit `action: RESTORE`.

| Lỗi | Status | Điều kiện |
|---|---|---|
| `Error.UserNotFound` | 404 | |
| `Error.CannotModifyAdminUser` | 422 | |
| `Error.UserNotDeleted` | 409 | User chưa từng bị xoá mềm |

### 1.7. `POST /admin/users/:id/reset-password` — Cấp lại mật khẩu tạm

Không có body. Sinh mật khẩu tạm mới (cùng cơ chế §1.1), set `mustChangePassword: true`, **revoke toàn bộ refresh token**, gửi email best-effort (không fail request nếu email lỗi), audit `action: RESET_PASSWORD`.

**Response:** `{ temporaryPassword: string }` — **trả đúng 1 lần**, giống lưu ý ở §1.1.

| Lỗi | Status | Điều kiện |
|---|---|---|
| `Error.UserNotFound` | 404 | Gồm cả user đã xoá mềm |
| `Error.CannotModifyAdminUser` | 422 | Target là SUPER_ADMIN |

Dùng khi Editor/Board quên mật khẩu và **không** dùng được `POST /auth/send-otp-email` (route đó dành cho self-service `FORGOT_PASSWORD` — Editor/Board vẫn dùng được route đó bình thường; route reset này là kênh **Admin chủ động** cấp lại khi user không tự thao tác được, vd khoá email).

### 1.8. `GET /admin/stats` — Thống kê tổng quan hệ thống

Không tham số. Snapshot `groupBy` tại thời điểm gọi (không cache).

| Field | Kiểu | Ghi chú |
|---|---|---|
| `users.total` | number | User chưa xoá mềm |
| `users.deleted` | number | User đã xoá mềm |
| `users.byStatus` | `Record<enum UserStatus, number>` | **Zero-filled** — mọi giá trị enum đều có key kể cả 0 |
| `users.byRole` | `Record<enum RoleCode, number>` | Zero-filled |
| `series.total` / `series.byStatus` | number / `Record<enum SeriesStatus, number>` | Zero-filled |
| `chapters.total` / `chapters.published` | number | `published` = đếm `ChapterStatus=PUBLISHED` |
| `tasks.total` / `tasks.byStatus` | number / `Record<enum TaskStatus, number>` | Zero-filled |

Đây cũng chính là field `systemStats` trong `GET /dashboard/admin` (§4) — 2 route trả **cùng 1 shape**, dashboard chỉ bọc thêm `unreadNotifications`.

---

## 2. Cấu hình hệ thống (Nhóm B, độc quyền Admin)

### 2.1. `GET/PATCH /admin/app-config` — Tham số nghiệp vụ toàn hệ thống

Nguồn: `app-config.controller.ts` → `app-config.service.ts` (cache in-memory TTL **30 giây**, lazy-seed lần gọi đầu nếu chưa có record). **10 tham số** (đếm lại 2026-08-04 theo `CONFIG_KEYS` + `AppConfigResSchema` + model Prisma — bản guide trước ghi 8 là **thiếu** `boardRepClaimGraceDays` của §87):

| Field | Kiểu | Default (seed) | Ghi chú |
|---|---|---|---|
| `coOwnerApprovalGraceDays` | int ≥0 | 7 | Số ngày ân hạn cho luồng co-owner approval |
| `storyboardMaxReviewRounds` | int >0 | 8 | Số vòng review Storyboard tối đa trước cảnh báo loop |
| `reputationRecommendThreshold` | float 1–5 | 4 | Điểm reputation tối thiểu để gắn nhãn "đề xuất" trong danh bạ |
| `hiatusTooLongDays` | int >0 | 30 | Số ngày hiatus trước khi bị coi là "quá lâu" |
| `lowVoteReliabilityThreshold` | int ≥0 | 10 | Ngưỡng số vote để coi ranking là "reliable" |
| `rankingAggregateMinCoverageRatio` | float (0,1] | 0.5 | Coverage tối thiểu để ranking tổng hợp không bị đánh dấu provisional |
| `maxUploadBytes` | int >0, ≤50MB | 15728640 (15MB) | Kích thước upload tối đa — dùng ở `POST /uploads/sign` (xem `01` §3) |
| `assignmentGraceDays` | int ≥0 | 0 | Số ngày ân hạn quanh vòng đời `StudioAssignment` |
| `boardRepClaimGraceDays` | int ≥0 | 3 | (§87) Số ngày chờ trước khi cron báo "chưa ai nhận làm đại diện ký hợp đồng" → Admin phải `assign-representative` |
| `taskOverdueGraceHours` | int 0–168 | 24 | 🆕 **Spec 31** — số **giờ** ân hạn sau hạn nộp trước khi công việc bị **tự huỷ**. Đặt `0` = huỷ ngay khi quá hạn; trần 168 giờ (7 ngày) |

> ⚠️ **`taskOverdueGraceHours` là tham số có hậu quả phá huỷ** — hạ nó xuống sẽ khiến loạt công việc đang quá hạn
> bị cron huỷ ở lần chạy kế tiếp (mỗi giờ một lần), trợ lý và tác giả đều nhận thông báo `TASK_AUTO_CANCELLED`.
> UI nên có bước xác nhận riêng cho field này thay vì lưu chung một nút với các tham số vô hại.

**`GET`** trả đủ 10 field + `id`, `updatedBy` (userId Admin cập nhật lần cuối, `null` nếu chưa từng sửa), `updatedAt` (ISO).

**`PATCH`** — body mọi field **optional + nullable** (gửi `null` hoặc omit = giữ nguyên giá trị cũ; **không có `.strict()` reject field lạ nào khác ngoài 10 field trên**). Chỉ field thực sự đổi giá trị mới được ghi + đẩy vào `reason` của audit log (dạng `"key: old -> new"` nối bằng dấu phẩy). Nếu không field nào đổi (mọi field omit/null hoặc giá trị y hệt hiện tại) → **không** ghi DB, không tạo audit, trả nguyên state cũ. Sau khi update thành công → cache bị invalidate ngay (`this.cached = null`) để lần `GET` kế tiếp đọc giá trị mới (không phải chờ hết 30s).

**Lỗi:** chỉ có validation 422 (kiểu/khoảng giá trị sai, vd `maxUploadBytes` > 50MB cap).

### 2.2. `GET/PATCH /voting-config` — Cấu hình bình chọn độc giả

Nguồn: `survey.controller.ts` → `services/survey-config.service.ts` (cache 30s, lazy-seed, invalidate on PATCH — cùng pattern §2.1). **9 tham số** (model `VotingConfig`):

| Field | Kiểu | Default | Ghi chú |
|---|---|---|---|
| `authMode` | `enum VotingAuthMode` | `OTP` | `OTP`/`CAPTCHA`/`HYBRID` — chọn cơ chế xác thực Guest Vote |
| `maxSeriesPerVote` | int ≥1 | 3 | Số series tối đa 1 phiếu được chọn |
| `otpExpirySeconds` | int ≥60 | 300 | Hạn OTP vote |
| `otpMaxAttempts` | int ≥1 | 3 | Số lần nhập sai OTP tối đa trước khi khoá |
| `ipRateLimit` | int ≥1 | 10 | Số request/khoảng thời gian theo IP |
| `phoneRateLimit` | int ≥1 | 3 | Số vote/khoảng thời gian theo số điện thoại |
| `otpCooldownSeconds` | int ≥0 | 60 | Thời gian chờ giữa 2 lần xin OTP vote |
| `ipVotesPerPeriod` | int ≥1 | 10 | Số vote tối đa/IP/kỳ bình chọn |
| `captchaThreshold` | float 0–1 | 0.3 | Điểm reCAPTCHA v3 tối thiểu để coi là hợp lệ |

**`PATCH`** — mọi field optional (`.strict()`, nhưng omit = giữ nguyên qua `??` ở repo, không phải "null xoá") — gửi field lạ ngoài 9 field trên → 422. Nếu chưa từng có config row, `PATCH` tự tạo mới với default + field gửi lên đè (không cần `GET` trước).

**Lỗi:** `Error.VotingConfigNotFound` khai ở `@ApiErrors` nhưng **thực tế không bao giờ throw** — cả `get()` lẫn `update()` đều lazy-create nếu thiếu row (không có nhánh nào ném exception này qua code path thật). Validation 422 cho field sai kiểu/khoảng giá trị.

### 2.3. `GET/PATCH /board/config/:id` — Cấu hình biểu quyết Hội đồng

Nguồn: `board.controller.ts` → `services/board-query.service.ts` (GET) / `services/board-governance.service.ts` (PATCH) → `board.repo.ts`.

**`GET /board/config`** — không cần `:id`, luôn trả **1 config đang active** (lazy-create nếu chưa có: `{ boardTotalMembers: 5, quorumMin: 3, approveMajorityRatio: 0.5, isDefault: true }`).

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | — dùng làm `:id` cho `PATCH` |
| `boardTotalMembers` | number | Tổng sĩ số Hội đồng (bắt buộc số **lẻ**) |
| `quorumMin` | number | Sĩ số roster mặc định khi auto-assign (PB-05) — **KHÔNG phải** quorum đếm phiếu bỏ |
| `approveMajorityRatio` | number | Tỉ lệ đồng ý tối thiểu để quyết định `APPROVED` (default 0.5 = quá bán) |
| `updatedBy` | string \| null | |
| `updatedAt` | string (ISO) | |

**`PATCH /board/config/:id`** — ⚠️ **quirk đáng chú ý (verify qua code + test, không suy đoán):** body schema **bắt buộc** cả field `updatedBy` (kiểu string) dù giá trị gửi lên **luôn bị ghi đè** bằng userId thật lấy từ token ở service (`{ ...dto, updatedBy: userId }`) — FE **vẫn phải gửi** field này (giá trị bất kỳ, kể cả chuỗi rác) để qua được validation `.strict()`, nếu không sẽ nhận 422 do thiếu field bắt buộc.

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `boardTotalMembers` | ✅ | number | Phải là số **lẻ** — chẵn → 422 (`Sĩ số tổng của Board thành viên bắt buộc phải là số lẻ...`) |
| `quorumMin` | ✅ | number | Không được vượt `boardTotalMembers` — vượt → 422 |
| `approveMajorityRatio` | ✅ | number | |
| `updatedBy` | ✅ (nhưng bị ghi đè) | string | **Gửi giá trị bất kỳ** — server luôn thay bằng admin thật, FE không cần quan tâm nội dung |

**Config bị khoá khi có phiên họp đang mở:** nếu tồn tại bất kỳ `BoardSession` nào chưa `CONCLUDED` (`findFirstOpenSession`) → `PATCH` bị chặn hoàn toàn, kể cả khi giá trị gửi giống hệt hiện tại.

| Lỗi | Status | Điều kiện |
|---|---|---|
| `Error.BoardConfigNotFound` | 404 | `id` không đúng ObjectId hoặc không tồn tại |
| `Error.BoardConfigLocked` | 400 | Đang có phiên họp chưa kết thúc |
| Validation | 422 | `boardTotalMembers` chẵn, `quorumMin` > tổng, thiếu field |

---

## 3. Audit Log — `GET /audit` (Nhóm C, độc quyền Admin + Board)

Nguồn: `audit.controller.ts` → `audit.service.ts` → `audit.repo.ts`. Route dùng chung `SUPER_ADMIN`/`BOARD_MEMBER` nhưng không phân biệt scope (cả hai xem toàn bộ log, không lọc theo "của mình").

### Query filter

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `entityType` | tuỳ | `enum AuditEntityType` | 16 giá trị — tra `01` §7.10 (`SERIES`/`MANUSCRIPT`/`PAGE`/`CHAPTER`/`TASK`/`DEADLINE_REQUEST`/`USER`/`REGION`/`APP_CONFIG`/`CONTRACT`/`BOARD_DECISION`/`REPRINT_REQUEST`/`TRANSFER_REQUEST`/`PAYMENT_RECORD`/`SURVEY_PERIOD`/`PUBLICATION_VERSION`/`BOARD_SESSION`) |
| `entityId` | tuỳ | string | Id entity bị tác động — nếu gửi id **không đúng ObjectId format**, route trả **rỗng có kiểm soát** (`{items:[],total:0,...}`), KHÔNG lỗi 422/500 |
| `actorId` | tuỳ | string | Id user thao tác — cùng quy tắc "id sai format → trả rỗng" như trên |
| `action` | tuỳ | string (tự do) | **KHÔNG phải enum cứng** — chuỗi chuẩn hoá tự nhập theo module ghi (xem danh sách giá trị thật gặp trong code bên dưới) |
| `limit` / `offset` | tuỳ | number | ≤100/default 20, default 0 |

**Các giá trị `action` thật đã grep trong toàn bộ codebase** (không đầy đủ 100% vì `action` là free-text, nhưng đây là toàn bộ literal đang dùng — tham khảo cho autocomplete/filter dropdown ở FE, đừng coi là enum đóng): `TRANSITION`, `CREATE`, `UPDATE`, `DELETE`, `SOFT_DELETE`, `RESTORE`, `RESET_PASSWORD`, `BAN`, `BLOCK`, `REACTIVATE`, `CONFIG_UPDATE`, `HOLD`, `RESUME`, `CLAIM`, `RELEASE`, `COMPLETION_PROPOSED`, `CHAPTER_MANUSCRIPT_SUBMITTED`, `PRODUCTION_STAGE_COMPLETE`, `PAGE_DELETE_CASCADE`, `PAGE_BULK_DELETE_CASCADE`, `REGION_DELETE_CASCADE`, `PROFILE_UPDATE`, `METADATA_UPDATED`, `CONTRACT_SIGNED`, `AMENDMENT_EXECUTED`, `AMENDMENT_VOIDED`, `PAYMENT_CONDITION_TRANSITION`, `SETTLEMENT_COMPLETED`, `REVENUE_REPORTED`, `SESSION_TRANSITION`, `PHASE_ADVANCED`, `DECISION_FINALIZED`, `DECISION_EXPIRED`, `RANKING_FINALIZED`, `REVISER_ASSIGNED`, `TANKOBON_SALES_RECORDED`.

### Response — `{ items: AuditLogRes[], total, limit, offset }`

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | |
| `actorId` | string \| null | `null` = hành động hệ thống (cron/listener tự động, vd `board-scheduler.service.ts` tự conclude phiên hết giờ) |
| `entityType` | `enum AuditEntityType` | |
| `entityId` | string | |
| `action` | string | Xem danh sách trên |
| `fromState` / `toState` | string \| null | Trạng thái trước/sau (nếu action là transition) — `null` với action không phải state-change (vd `CREATE`) |
| `reason` | string \| null | Lý do (nếu có) — vd nội dung `PATCH /admin/app-config` ghi `"key: old -> new, ..."` |
| `createdAt` | string (ISO) | |

**Best-effort, không đầy đủ tuyệt đối:** `AuditService.record()` tự nuốt lỗi (log rồi return, không throw) — nếu ghi audit thất bại (DB lỗi tạm thời) thì hành động nghiệp vụ chính **vẫn thành công bình thường**, chỉ dòng audit đó bị thiếu. Cũng bỏ qua ghi nếu `entityId` không đúng ObjectId format (log warning, không tạo record). FE không nên coi `GET /audit` là nguồn duy nhất/tuyệt đối chứng minh 1 hành động đã xảy ra — chỉ là log hỗ trợ theo dõi.

Không có validation error ngoài 422 chuẩn (field sai kiểu).

---

## 4. Dashboard tổng quan — `GET /dashboard/admin`

Nguồn: `admin-dashboard.controller.ts` → `AdminDashboardFacade` → `admin-dashboard.service.ts`. Không tham số.

**Response:** `{ systemStats: AdminStatsRes, unreadNotifications: number }` — `systemStats` là **shape giống hệt** `GET /admin/stats` (§1.8, cùng service `AdminStatsService`, không cache riêng — snapshot tại thời điểm gọi). `unreadNotifications` = badge chuông thông báo của chính Admin đang đăng nhập.

Không có bảng lỗi riêng.

---

## 5. Theo dõi Series & Chapter Production (chỉ đọc)

10 route GET, dùng để dựng màn "Admin xem tổng quan sản xuất" — field chi tiết đầy đủ đã mô tả ở `03-mangaka.md`/`05-editor.md` (owner chính của các route này); dưới đây chỉ tóm tắt mục đích + field chính.

| Route | Mục đích | Field chính đáng chú ý |
|---|---|---|
| `GET /series` | Danh sách series toàn hệ thống (phân trang, lọc `status` + **`magazine` + `publicationType` — MỚI 2026-08-05**) | `status` (`enum SeriesStatus`), `magazine`, `publicationType`, `mangaka`/`editor` mini object, `title`, `genres` |
| `GET /series/:id` | Chi tiết 1 series kèm `proposal` (nếu còn ở giai đoạn đề xuất) | `proposal.status` (`enum ProposalStatus`), `completionProposal`, `franchiseConsentStatus` |
| `GET /series/:id/defense-dashboard` | Dashboard "bảo vệ" series trước Hội đồng (PB-08) — ranking trend + tankobon + báo cáo Editor + mốc serial hoá | `rankingTrend[]` (`rankPosition`, `riskLevel`, `rankChange`), `tankobon.totalUnitsSold`, `seriesReports[]`, `serialization.serializedSince` |
| `proposal.storyboardPages` trong `GET /series/:id` | Trang storyboard embedded của proposal | `pageNumber`, `fileUrl`; không có lifecycle riêng |
| `GET /chapters/:id/storyboards` + `GET /storyboards/:id` | Storyboard cấp chapter | `status` (`enum StoryboardStatus`), `version`, `pages[]` |
| `GET /chapters/:id/pages` | Danh sách trang của 1 chapter | `originalFile`/`compositeFile` (object key), `displayFile` (⛔ tính sẵn), `status` (`enum PageStatus`) |
| `GET /chapters/:id/progress` | Dashboard tiến độ chapter (cảnh báo trễ deadline) | `warningLevel` (enum tính runtime `NONE`/`YELLOW`/`RED`/`CRITICAL` — không có trong `schema.prisma`, xem `01` §7 cuối) |
| `GET /chapters/:id/stages` | Danh sách `ProductionStage` + analytics | `status` (`enum ProductionStageStatus`), thứ tự stage. 🔴 **`status` đi lùi được** (Spec 26): Mangaka mở lại giai đoạn khi Editor trả sửa ⇒ `COMPLETED → ACTIVE` và các giai đoạn sau về `LOCKED`, `completedAt` về `null`. Audit tương ứng: `AuditLog.action = 'PRODUCTION_STAGE_REOPEN'` (`entityType = CHAPTER`) — tra ở `GET /audit` |

Không có bảng lỗi riêng — dùng chung `Error.SeriesNotFound`/`Error.ChapterNotFound` (404) như mô tả ở file role chính.

---

## 6. Theo dõi & can thiệp Board (Hội đồng) — 14 route

Nguồn: `board.controller.ts`, chi tiết đầy đủ ở `06-board-member.md`. Admin có quyền **ngang Editor** trên phần lớn route ghi ở đây (không chỉ xem).

| Route | Vai trò của Admin |
|---|---|
| `GET /board/decisions[,/:id,/:id/votes]` | Chỉ đọc — danh sách/chi tiết/phiếu bầu quyết định Hội đồng |
| `POST /board/decisions` | **Ghi ngang Editor** — tạo quyết định nháp (`PENDING`), body = `BoardDecisionSchema` (bỏ field derive: `id/result/votes/approveCount/rejectCount/...`) |
| `GET /board/reports[,/:id]` | Chỉ đọc — Admin **không** có route tạo báo cáo (`POST /board/reports` chỉ `@Roles(EDITOR)`) |
| `GET /board/sessions[,/:id,/:id/messages]` | Chỉ đọc — danh sách/chi tiết phiên họp + lịch sử chat Q&A |
| `POST /board/sessions` | **Ghi ngang Editor** — tạo phiên họp mới (`title`, `startTime`, `endTime?`, `allowedEditorIds?` hoặc `seriesId` để auto-assign roster theo PB-05, `rosterSize?`) |
| `PATCH /board/sessions/:id/start` | **Ghi ngang Editor** — kích hoạt phiên `→ ACTIVE` |
| `PATCH /board/sessions/:id/conclude` | **Ghi + override quyền** — kết thúc phiên `→ CONCLUDED`. ⚠️ **Verify qua code:** route bình thường chỉ cho **creator** (Editor tạo phiên) gọi (`Error.NotSessionCreator` nếu không phải), nhưng khi `roleName === SUPER_ADMIN` thì **bỏ qua hoàn toàn** check này — Admin kết thúc được **mọi** phiên họp bất kể ai tạo |
| `PATCH /board/sessions/:id/phase` | **Ghi + override quyền tương tự** — chuyển `PRESENTING→QA→VOTING` (forward-only). Cùng override: Admin bỏ qua check "phải là creator" |
| `GET /board/suggest-members` | Chỉ đọc — gợi ý roster Board theo thể loại series (PB-05), dùng khi tạo phiên không truyền sẵn `allowedEditorIds` |

**Ý nghĩa nghiệp vụ:** Admin có năng lực "ghi đè" (override) trên vòng đời phiên họp — dùng cho tình huống Editor phụ trách vắng mặt/gặp sự cố nhưng phiên vẫn cần được kết thúc/chuyển giai đoạn đúng lịch. Field/enum chi tiết (`BoardSessionStatus`, `BoardSessionPhase`, `DecisionType`, `BoardDecisionResult`, `VoteValue`) tra `01` §7.7; lỗi đầy đủ (`Error.BoardSessionNotFound`, `Error.InvalidBoardSessionTransition`, `Error.BoardSessionNotOpen`...) xem `06-board-member.md`.

---

## 6b. Can thiệp Hợp đồng 2-phase (🆕 §87) — 2 route

Admin **không** list/sửa hợp đồng (`GET /contracts` + mutation là EDITOR/Board), nhưng có 2 điểm can thiệp trong flow ký 2-phase:

| Route | Vai trò của Admin |
|---|---|
| `POST /contracts/:id/assign-representative` | **Độc quyền Admin** — gán Board đại diện ký khi **không ai `claim` quá `AppConfig.boardRepClaimGraceDays`** (cron escalate báo). Body `{ representativeId }` — phải thuộc roster của `BoardDecision` SERIALIZATION gắn HĐ. Lỗi: `Error.ContractNotFound` (404) · `Error.ContractNotInBoardReview` (409) · `Error.NotInContractBoardRoster` (403 — representativeId ngoài roster). |
| `GET /contracts/:id/comments` | Chỉ đọc — xem comment tư vấn Board để lại ở Phase 1 (giám sát). |

> Chi tiết flow 2-phase (`DRAFT→BOARD_REVIEW→AWAITING_MANGAKA→FULLY_EXECUTED`, claim/sign đại diện) xem `06-board-member.md` §3.

---

## 7. Theo dõi Deadline Requests (chỉ đọc) — 2 route

Nguồn: `deadline.controller.ts`, chi tiết đầy đủ ở `03-mangaka.md`/`05-editor.md`.

| Route | Query/Field chính |
|---|---|
| `GET /deadline-requests` | Query bắt buộc `chapterId`; tuỳ `status` (`enum DeadlineRequestStatus`) |
| `GET /deadline-requests/:id` | `requestedBy`/`lastProposedBy` (`'MANGAKA'`\|`'EDITOR'`), `currentDeadline`/`requestedDeadline`, `affectsSlot` |

Admin **không** có route ghi nào ở module này (không tạo/counter/agree/reject/finalize/board-resolve) — chỉ theo dõi tiến trình thương lượng deadline giữa Mangaka/Editor/Board.

---

## 8. Danh bạ (directory) — Mangaka & Assistant (chỉ đọc) — 2 route

Nguồn: `users.controller.ts` (`listMangakas`/`listAssistants`), chi tiết đầy đủ ở `03-mangaka.md`/`05-editor.md`.

| Route | Query chính | Ghi chú |
|---|---|---|
| `GET /mangakas` | `q` (tên/penName), `genre`, `level`, `limit`/`offset` | Danh bạ Mangaka — **kèm `email`/`phoneNumber`** (2026-08-04), ưu tiên `isRecommended`/`reputationScore`. Chỉ liệt kê user đã build hồ sơ |
| `GET /assistants` | `q`, `specialization` (`enum Specialization`), `level`, `availableFrom`/`availableTo`, `limit`/`offset` | Danh bạ Assistant — **kèm `email`/`phoneNumber`** để liên hệ. Chỉ liệt kê user đã build hồ sơ |

Dùng cho màn Admin tra cứu nhân sự ngoài hệ thống (vd trước khi ban/block, xem nhanh reputation).

---

## 9. Payments (đọc toàn hệ thống + pay/cancel) — 7 route

Nguồn: `payment.controller.ts`, chi tiết đầy đủ ở `06-board-member.md`. Model `PaymentRecordModel` (`payment.model.ts`).

| Route | Vai trò Admin |
|---|---|
| `GET /payments` | Chỉ đọc — danh sách toàn hệ thống, filter `status` (`enum PaymentRecordStatus`), `receiverId`, `seriesId`, `contractId`, `paymentType` (`enum PaymentType`), `paymentSource` (`enum PaymentSource`) |
| `GET /payments/:id` | Chỉ đọc — chi tiết (bao gồm field detail-only: `description`, `note`, `cancelReason`, `transactionReference`, `paymentMethod`, `approver`) |
| `PATCH /payments/:id/cancel` | **Ghi ngang Board Member** — huỷ payment chưa `PAID` → `CANCELLED`. Body: `{ cancelReason: string (bắt buộc) }` |
| `PATCH /payments/:id/pay` | **Ghi ngang Board Member** — xác nhận đã chuyển tiền → `PAID`. Body: `{ paymentMethod: string ✅, transactionReference: string ✅, note?: string }` |
| `GET /payments/contracts/:id/payments` | Chỉ đọc — theo `contractId` |
| `GET /payments/series/:id/payments` | Chỉ đọc — theo `seriesId` |
| `GET /payments/users/:id/payments` | Chỉ đọc — theo `receiverId` |

⚠️ **Admin KHÔNG có quyền `approve`** (`PATCH /payments/:id/approve` chỉ `@Roles(BOARD_MEMBER)`) — Admin chỉ can thiệp được ở bước `pay`/`cancel` **sau khi** Board đã approve, không thay được vai trò duyệt chi ban đầu của Board.

**Lỗi:** `Error.PaymentRecordNotFound` (404) · `Error.PaymentNotPayable` (409 — payment không ở trạng thái cho phép `pay`) · `Error.PaymentAlreadyPaid` (409 — cancel khi đã `PAID`) · `Error.PaymentAccessDenied` (403 — theo route lọc theo contract/series/user, hiếm gặp với Admin vì Admin không bị scope).

---

## 10. Publication Versions (CRUD đầy đủ, quyền ngang Editor) — 5 route

Nguồn: `publication.controller.ts`, schema `publication-schemas.ts`. Đây là 1 trong số ít module Nhóm D mà Admin có **toàn quyền ghi** giống hệt Editor (không chỉ pay/cancel như Payments).

| Route | Body/Field chính |
|---|---|
| `POST /series/:seriesId/publication-versions` | `language` ✅ (mã ngôn ngữ, vd `JA`/`EN`/`VI`), `readingDirection` (`enum ReadingDirection`, default `RTL`), `versionType?` (`'ORIGINAL'\|'DIGITAL'\|'FLIPPED'`), `notes?` |
| `GET /series/:seriesId/publication-versions` | Danh sách phiên bản của 1 series — `{ items: PublicationVersionRes[] }` |
| `GET /publication-versions/:id` | Chi tiết 1 phiên bản |
| `PATCH /publication-versions/:id` | Partial-update — mọi field nullish (omit/`null` giữ nguyên) |
| `DELETE /publication-versions/:id` | Xoá phiên bản |

**Response (`PublicationVersionRes`):** `id`, `seriesId`, `language`, `readingDirection` (`enum ReadingDirection`), `versionType` (string \| null), `notes` (string \| null), `createdAt` (ISO).

Lỗi/luồng nghiệp vụ đầy đủ (vd điều kiện series phải ở trạng thái nào mới tạo được version, ai được xem) xem `05-editor.md` (Flow 13, B-PUB-01).

---

## 11. Rankings (chỉ đọc) — 3 route

Nguồn: `survey.controller.ts` (`getRankings`/`getBoardRankings`/`getInternalRankingAggregate`), chi tiết đầy đủ ở `06-board-member.md`.

| Route | Query | Field chính |
|---|---|---|
| `GET /rankings` | `seriesId` ✅, `periods?` (default 12, ≤60) | Trend ranking của **1 series** qua nhiều kỳ (`rankPosition`, `voteCount`, `rankChange`, `riskLevel` — `enum RiskLevel`, `isReliable`) |
| `GET /rankings/board` | (theo `surveyPeriodId` hiện hành, xem `06-board-member.md`) | Bảng xếp hạng **toàn tạp chí** 1 kỳ — cùng field trên + `recordedAt` |
| `GET /rankings/internal/aggregate` 🆕 (W1) | `magazine` ✅, `publicationType` ✅, `level=MONTH\|YEAR` ✅, `year` ✅, `month?` | **Bản nội bộ** của `/rankings/aggregate` (public) — gộp nhiều kỳ REFLECTED theo `averageNormalizedScore`, NHƯNG **giữ tín hiệu nguy cơ**: mỗi item thêm `isAtRisk`/`riskLevel`/`isReliable` (lấy record kỳ mới nhất). Dùng khi Board/Editor cần xu hướng tháng/năm mà vẫn thấy nguy cơ (route public thì ẩn các tín hiệu này). Cache namespace `ranking` riêng (`internal:` prefix). |

---

## 12. Reprint Requests (chỉ đọc) — 4 route

Nguồn: `reprint-request.controller.ts`, chi tiết đầy đủ ở `05-editor.md`/`06-board-member.md`.

| Route | Field chính |
|---|---|
| `GET /reprint-requests` | Filter `status` (`enum ReprintRequestStatus`), `seriesId` |
| `GET /reprint-requests/:id` | `revisionMode` (`enum ReprintRevisionMode`), `chapterRangeStart/End`, `chapters[]` (embedded) |
| `GET /reprint-requests/:id/chapters` | Danh sách chapter trong yêu cầu tái bản (`status`: `enum ReprintChapterStatus`) |
| `GET /reprint-requests/:id/chapters/:chapterId` | Chi tiết 1 chapter tái bản (`originalChapterId`, `manuscriptFile`, `status`) |

Admin không có route ghi nào ở module này (tạo/duyệt/gán reviser đều thuộc Editor/Board/Mangaka).

---

## 13. Revision Requests (chỉ đọc) — 1 route

Nguồn: `revision.controller.ts`. Đây là module **không có route detail** (`GET /revision-requests/:id` không tồn tại) — mọi field phải lấy từ list.

`GET /revision-requests` — query: `targetType?` (`enum RevisionTargetType`), `targetId?`, `isResolved?` (`'true'|'false'`), `limit`/`offset`. Với Admin (role privileged), scope **không lọc** theo người trong cuộc — thấy **toàn bộ** vòng yêu cầu sửa hệ thống (khác với Mangaka/Assistant chỉ thấy vòng liên quan đến mình — xem `04-assistant.md` §8).

Field response (`RevisionRequestRes`): `targetType`, `targetId`, `seriesId` (null nếu `TASK`), `round`, `reason`, `requestedBy`/`recipientId`, `isResolved`, `resolver` (mini object, null nếu chưa resolve).

---

## 14. Survey/Voting Periods (🔴 §84: 4 route ghi nay ĐỘC QUYỀN Admin) — 9 route

Nguồn: `survey.controller.ts` (phần period/ranking/import), chi tiết đầy đủ ở `05-editor.md` (B-VOT-*). Admin có **toàn quyền ghi** giống Editor trên toàn bộ vòng đời kỳ bình chọn.

| Route | Vai trò/Field chính |
|---|---|
| `GET /survey-periods` | 🆕 W1: filter `?magazine=&publicationType=&status=&limit=&offset=` + response `{items,total,limit,offset}` (breaking, trước là mảng thô); nay mở thêm cho MANGAKA |
| `POST /survey-periods` | Tạo kỳ mới — `issueNumber` ✅, `magazine` ✅, `publicationType` ✅ (`enum PublicationType`), `eligibleSeriesIds` ✅ (≥1, không trùng), `startDate`/`endDate` ✅ (ISO, start<end), `status?` (chỉ `DRAFT`/`OPEN`/`CLOSED` lúc tạo) |
| `GET /survey-periods/:id` | Chi tiết — `status` (`enum SurveyStatus`) |
| `PATCH /survey-periods/:id/status` | Đổi trạng thái — chỉ nhận `OPEN`/`CLOSED` (không set `REFLECTED` qua route này, xem `finalize`) |
| `POST /survey-data/import` | Nhập vote offline từ postcard — `surveyPeriodId` ✅, `entries[]` ✅ (`{seriesId, voteCount}`) |
| `POST /survey-periods/:id/finalize` | Chốt ranking cho kỳ (→ `REFLECTED`) |
| `GET /survey-periods/:id/rankings` | Ranking đã chốt của kỳ |
| `GET /survey-periods/:id/survey-data` | Lịch sử các lần import vote offline |
| `GET /survey-periods/:id/votes` | Danh sách phiếu vote reader của kỳ (ẩn `identityHash`/`ipHash`/`captchaScore` — chỉ có ở bản list, không phải bản đầy đủ) |

Lỗi đầy đủ (`Error.SurveyPeriodNotFound`, `Error.DuplicateSurveyPeriodScope`, `Error.SurveyPeriodInvalidTransition`...) xem `05-editor.md`.

#### 🆕 `GET /survey-periods/eligible-series` — dựng danh sách chọn khi mở kỳ (MỚI 2026-08-05, SUPER_ADMIN)

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `magazine` | ✅ | string | khớp tuyệt đối (BE tự trim) |
| `publicationType` | ✅ | enum `PublicationType` | `WEEKLY`/`MONTHLY`/`IRREGULAR` |

Response `{ items: [{ id, title, coverImage, status, magazine, publicationType }], total }` — **không phân trang**
(một tạp chí + một nhịp chỉ vài chục bộ). Thiếu query hoặc gửi thừa key → **422**.

> **Dùng đúng route này để đổ dropdown chọn `eligibleSeriesIds`.** Nó dùng **chung một hằng số** với phần validate
> của `POST /survey-periods`, nên **mọi id nó trả về đều chắc chắn được chấp nhận** — không còn cảnh admin chọn
> xong mới ăn 422. (`GET /series?status=...&magazine=...&publicationType=...` vẫn dùng được nhưng phải tự ghép 3
> filter và tự phân trang, dễ lệch luật về sau.)

**Trạng thái được vào kỳ (BR-VOTE-05, cập nhật 2026-08-05):**

| Trạng thái | Vào kỳ được? | Lý do |
|---|---|---|
| `SERIALIZED` | ✅ | đang đăng bình thường |
| `CANCELLING` · `COMPLETING` | ✅ **(MỚI)** | vẫn đang đăng chương kết thúc trên tạp chí kỳ đó ⇒ độc giả vẫn bình chọn được. **Trước 2026-08-05 bị chặn** — đó là lệch nghiệp vụ. |
| `HIATUS` | ❌ | kỳ đó không có chương mới để bình chọn (Requiment §1.10 — tránh kéo bộ truyện xuống đáy bảng oan) |
| `CANCELLED` · `COMPLETED` · `DRAFT` · còn lại | ❌ | không còn/chưa lên tạp chí |

Sai bất kỳ điều kiện nào (kể cả lệch `magazine`/`publicationType`) → **422 `Error.SeriesNotVotable`**.

> ⚠ `eligibleSeriesIds` là **snapshot bất biến** kể từ khi kỳ `OPEN`. Bộ truyện kết thúc/bị huỷ **giữa kỳ** vẫn
> nằm trong bảng xếp hạng lúc `finalize` (đúng: nó đã nhận phiếu trong kỳ), nhưng **không còn** bị gắn
> `isAtRisk`/`riskLevel` nữa (sửa 2026-08-05 — trước đây bộ truyện đã hoàn thành vẫn có thể bị báo "nguy cơ bị huỷ").

---

## 15. Tải file của Task — `POST /tasks/:id/download-url` — 1 route

Nguồn: `task.controller.ts` → `services/task-media.service.ts`. Chi tiết đầy đủ (allowlist key, cơ chế) ở `04-assistant.md` §6.4.

Body: `{ key: string ✅ }` (object key cần tải — phải thuộc task). Response: `{ downloadUrl, expiresAt }` (presigned GET có hạn).

⚠️ **Admin (cùng Board Member) là "privileged" — bỏ qua hoàn toàn check quan hệ task** (`isOwner`/`isAssignee`/`isEditor`): trong `task-media.service.ts`, `roleName === SUPER_ADMIN || roleName === BOARD_MEMBER` → cho tải bất kỳ task nào, không cần là Mangaka sở hữu/Assistant được giao/Editor phụ trách. Vẫn phải đúng `key` nằm trong allowlist thật của task đó (chống spoof key sang file không liên quan) → sai key vẫn `Error.TaskFileForbidden` (403).

---

## 16. Transfers (chỉ đọc) — 2 route

Nguồn: `transfer.controller.ts`, chi tiết đầy đủ ở `05-editor.md`/`06-board-member.md`.

| Route | Field chính |
|---|---|
| `GET /transfers/contracts/:id` 🆕 | **Spec 27** — chi tiết hợp đồng chuyển nhượng: điều khoản (`transferAmount`, `newOwnershipSplit`, `transferType`, `coOwnerApprovalRequired`), `status` (`enum TransferContractStatus`) và `signatures[]`. Lấy `:id` từ field `transferContractId` trên `GET /transfers/requests/:id`. Shape đầy đủ xem `03-mangaka.md` §5.6 |
| `GET /transfers/contracts/:id/signatures` | `{ signatures: TransferContractSignature[] }` — mỗi chữ ký: `role` (`enum TransferSignerRole`), `signedAt` |
| `GET /transfers/requests/:id` | `status` (`enum TransferRequestStatus`), `proposedType` (`enum TransferType`), `originalMangaka`/`requestingMangaka` mini object |

---

## Tổng kết đối chiếu Requiment gốc & guide cũ — điểm khác biệt đáng chú ý

- **Phạm vi Admin rộng hơn Requiment §2.6 mô tả:** SRS chỉ nói Admin "cấp phát tài khoản, gán vai trò, vô hiệu hóa tài khoản" (Nhóm A). Code thật cho Admin **thêm 3 nhóm quyền** không nằm trong SRS gốc: (1) cấu hình vận hành toàn hệ thống (App/Voting/Board Config — Nhóm B), (2) xem audit log cùng cấp Board Member (Nhóm C), (3) **quyền ghi ngang Editor/Board Member** trên 15 route Nhóm D (Board session lifecycle với quyền override "bỏ qua check creator", Publication versions CRUD, Survey period lifecycle, Payment pay/cancel, Task file download privileged bypass). Đây là thiết kế bổ sung hợp lý cho vai trò "quản trị hệ thống" nhưng FE cần biết để không giới hạn UI Admin chỉ còn màn quản lý user.
- **`AppConfig` có 10 tham số** (đếm lại 2026-08-04 — bản trước ghi 8 là thiếu) — verify trực tiếp `CONFIG_KEYS` (`app-config.service.ts`), `AppConfigResSchema` (`app-config-schemas.ts`) và model Prisma `AppConfig`: `coOwnerApprovalGraceDays`, `storyboardMaxReviewRounds`, `reputationRecommendThreshold`, `hiatusTooLongDays`, `lowVoteReliabilityThreshold`, `rankingAggregateMinCoverageRatio`, `maxUploadBytes`, `assignmentGraceDays`, `boardRepClaimGraceDays`, `taskOverdueGraceHours`.
- **Quirk `PATCH /board/config/:id` bắt buộc gửi field `updatedBy`** dù giá trị luôn bị ghi đè bằng userId thật từ token — nếu FE build form tự động từ Swagger/Zod schema mà không biết quirk này sẽ tưởng nhầm cần cho user tự nhập "người cập nhật" (không đúng — chỉ cần gửi giá trị bất kỳ để qua `.strict()` validation).
- **`Error.VotingConfigNotFound` khai trong Swagger nhưng không path code nào ném ra thật** — cả `get()` lẫn `update()` của `SurveyConfigService` đều lazy-create nếu thiếu row, nên FE không cần dựng UI xử lý lỗi 404 cho 2 route `voting-config`.
- **Admin có quyền override vòng đời Board session** (`conclude`/`phase` bỏ qua check "phải là Editor tạo phiên") — dùng cho tình huống Editor phụ trách vắng mặt, đây là chi tiết KHÔNG có trong 2 file guide cũ (`FE-API-Guide-v3.md`/`FE-Mobile-RN-Guide.md`) vì module Board (B5) và cơ chế override này được thêm sau khi 2 guide cũ được viết.
