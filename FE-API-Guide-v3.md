# FE API Guide v3 — Manga Creation Workflow System

> **Nguồn sự thật:** bản nền sinh + đối chiếu từ Swagger runtime (`GET /api-json`), đồng bộ contract tới **Page API mở rộng + Region embed** ngày 2026-07-21: **263 route, 63 enum**. (Mốc trước: Spec 19 Page Lifecycle 256 route ngày 2026-07-18 — xem PROGRESS-BE-A §63.6; Spec 22 Reopen/Re-pitch +2 = 258; Spec 24 +1 = 259; Page API mở rộng +2 = 261; Task group +2 = 263.)
> 🆕 **Đợt 2026-07-20 có 3 thay đổi FE PHẢI sửa** (chi tiết §16): route mới `GET /contracts/:id/pdf` · 2 route request-changes nay **bắt buộc body `{reason}`** · `board-approve`/`board-request-changes` siết quyền theo roster phiên họp. Ngoài ra nhóm route public/ranking nay có **read-cache** (§0.11).
> ⚠️ **Đánh số spec:** **Spec 18 = Role Dashboards** (6 route `/dashboard/*`), **Spec 19 = Page Lifecycle Simplification**. Bản guide trước ghi nhầm Page Lifecycle là "Spec 18" — đã sửa 2026-07-18.
> **Phạm vi:** TOÀN BỘ backend (BE-A + BE-B), tổ chức theo **flow nghiệp vụ Requiment (Flow 1–13)** — mỗi flow: mô tả nghiệp vụ, các bước happy path (gọi API nào), bảng unhappy case, rồi reference chi tiết từng API (role, field, enum, lỗi).
> **Thay thế:** `FE-API-Guide-v2.md` (chỉ cover BE-A, đã lỗi thời sau Spec 9/10/11/12 + Fix-1/2). Đọc §16 để biết breaking change so với v2.

## Mục lục

- §0. Quy ước chung (BẮT BUỘC đọc trước khi gọi API)
- §1. Từ điển Enum (63 enum — đầy đủ giá trị + ý nghĩa)
- §2. Auth, Tài khoản & Hồ sơ (Flow 11)
- §3. Flow 1 — Series Proposal → Serialization (kèm Board engine)
- §4. Flow 6 — Contract & Payment (kèm xuất PDF hợp đồng)
- §5. Flow 2 — Chapter Production (chapter-first)
- §6. Flow 3 — Region / Task / AI segmentation
- §7. Flow 9 — Danh bạ Mangaka/Trợ lý & Studio (kèm Review/Reputation)
- §8. Flow 10 — Deadline Negotiation
- §9. Flow 4 — Survey / Guest Voting / Ranking
- §10. Flow 5 — Series Lifecycle (hiatus / complete / cancel)
- §11. Flow 7 — Reprint (tái bản)
- §12. Flow 8 — Transfer (chuyển nhượng)
- §13. Flow 12 + 13 — Franchise consent & Publication Version
- §14. Cross-cutting: Upload R2, Notification, Audit, AppConfig
- §15. WebSocket `/board` (realtime phiên họp Hội đồng)
- §16. Changelog v2 → v3 (breaking change FE phải sửa)

---

## §0. Quy ước chung

### 0.1. Response envelope — FE LUÔN đọc `res.data`

Mọi response **thành công** đều được bọc:

```jsonc
{ "success": true, "message": "Thành công", "data": { /* payload — chính là shape ghi trong guide này */ } }
```

- Bảng "Response" của từng API trong guide mô tả shape **BÊN TRONG `data`** (chưa bọc).
- `message` có thể là text nghiệp vụ (vd "Chapter name deleted") — hiển thị được cho user.

Mọi response **lỗi**:

```jsonc
// Lỗi field-level (validation 422 hoặc lỗi nghiệp vụ có path):
{ "success": false, "statusCode": 422, "code": "Error.ValidationFailed",
  "message": "Dữ liệu không hợp lệ",
  "errors": [ { "code": null, "message": "Địa chỉ email không hợp lệ", "path": "email" } ] }
// mỗi item trong errors[] có `code` (mã domain, hoặc null nếu là lỗi validation zod) + `message` tiếng Việt + `path`

// Lỗi đơn (không gắn field):
{ "success": false, "statusCode": 403, "code": "Error.EmailNotVerified",
  "message": "Email chưa được xác thực" }

// Rate-limit (OTP) — có thêm code + retryAfter (giây) cho UI cooldown:
{ "success": false, "statusCode": 429, "code": "Error.OtpRateLimited",
  "message": "Bạn thao tác quá nhanh — vui lòng thử lại sau", "retryAfter": 60 }
```

> 🔴 **BREAKING 2026-07-20 — mọi `code` nay đều theo dạng `Error.PascalCase`.**
> Trước đây tồn tại 2 lớp mã legacy: câu tiếng Anh nguyên văn ở guard 401/403 (`"Unauthorized"`,
> `"You do not have permission to access this resource"`) và SCREAMING_SNAKE ở rate-limit +
> contract/payment/transfer (`AUTH_OTP_RATE_LIMITED`, `CONTRACT_NOT_FOUND`, …). Toàn bộ đã chuẩn hoá —
> xem bảng ánh xạ cũ→mới ở **§16 changelog**. `message` (tiếng Việt) và `retryAfter` **không đổi**.

- `code` là mã máy ổn định (`Error.*` hoặc mã raw tương thích BE-B như `AUTH_OTP_RATE_LIMITED`) — FE **phân nhánh logic theo `code`**, không so sánh `message`.
- ⚠ Riêng 401/403 từ guard auth, `code` là chuỗi legacy giữ nguyên để tương thích: `"Unauthorized"`, `"Access token is required"`, `"Invalid access token"`, `"You do not have permission to access this resource"` — vẫn ổn định, FE cứ so bằng đúng chuỗi đó.
- `message` và `errors[].message` là text tiếng Việt sẵn để hiển thị trực tiếp. Không tự map `Error.*` từ `message` nữa.
- Nhiều lỗi field cùng lúc → `code: "Error.ValidationFailed"`, `message: "Dữ liệu không hợp lệ"` và chi tiết tiếng Việt trong `errors[]`.
- Metadata bổ sung như `retryAfter` vẫn giữ nguyên bên cạnh envelope chuẩn.

### 0.2. Status code semantics

| Status | Ý nghĩa |
|---|---|
| 200 / 201 | Thành công (POST tạo mới = 201, còn lại = 200) |
| 401 | Thiếu / sai / hết hạn Bearer token |
| 403 | Có token nhưng sai role, hoặc không phải chủ sở hữu / người được phân công (scoping) |
| 404 | Không tìm thấy (gồm cả trường hợp id không phải ObjectId 24-hex hợp lệ) |
| 409 | Vi phạm state machine (chuyển trạng thái sai) hoặc trùng dữ liệu unique |
| 410 | OTP hết hạn |
| **422** | **Validation fail** (body/query sai kiểu, thiếu field, field lạ với schema `.strict()`) — LƯU Ý: là 422, KHÔNG phải 400 |
| 429 | Rate-limit (kèm `code` + `retryAfter`) |
| 503 | Tính năng phụ thuộc service ngoài đang tắt (vd AI segmentation khi `AI_SERVICE_URL` trống) |

### 0.3. Auth

- Đăng nhập → nhận `accessToken` (TTL ngắn) + `refreshToken` (TTL dài). Mọi request gắn `Authorization: Bearer <accessToken>`.
- Access hết hạn → gọi `POST /auth/refresh-token` — refresh bị **rotate** (cái cũ bị revoke, dùng lại → 401).
- Route **PUBLIC** (không cần token) được ghi rõ ở từng API; còn lại mặc định cần Bearer.
- User có `mustChangePassword=true` (tài khoản admin cấp) bị chặn **403 ở MỌI route nghiệp vụ** (kể cả `GET /me`) cho tới khi đổi mật khẩu qua `POST /auth/change-password` — flag này trả về ngay trong response login, FE điều hướng sang màn đổi mật khẩu.
- **Role:** `MANGAKA`, `ASSISTANT`, `EDITOR`, `BOARD_MEMBER`, `SUPER_ADMIN`. Ngoài role, hầu hết API còn **scope theo sở hữu**: Mangaka chỉ thao tác series/chapter của mình, Editor chỉ series mình phụ trách, Assistant chỉ task được giao — sai scope → 403 dù đúng role.

### 0.4. Datetime & file

- **Mọi datetime là ISO 8601 UTC** (`2026-07-12T09:00:00.000Z`). FE tự đổi sang giờ VN (UTC+7) khi hiển thị. Swagger đánh dấu các field này `format: date-time`.
- **File KHÔNG BAO GIỜ đi qua Backend.** Mọi field file (`coverImage`, `namePages[].fileUrl`, `originalFile`, `portfolio`, `avatar`...) là **object key** trên Cloudflare R2:
  - Upload: `POST /uploads/sign` → nhận `uploadUrl` (presigned PUT) + `key` → FE PUT bytes **thẳng lên R2** với đúng `requiredHeaders` → rồi gửi `key` vào API nghiệp vụ.
  - Hiển thị: đổi `key` → URL tạm qua `POST /uploads/sign-download`. KHÔNG cache URL (có hạn) — cache `key`.
  - Allowlist: `image/png`, `image/jpeg`, `image/webp`, `application/pdf`; tối đa 15MB (cấu hình `AppConfig.maxUploadBytes`).

### 0.5. Quy ước field trong guide

- Cột **Kiểu**: ràng buộc ghi trong ngoặc (độ dài / min-max). Dấu **✍ = field tự do, FE/client tự nhập giá trị** (không có enum, chỉ cần đúng kiểu + ràng buộc). Field `enum \`X\`` → tra bảng giá trị ở **§1** (đầy đủ, không sót giá trị nào).
- **Partial-update (PATCH/PUT):** field omit hoặc gửi `null` = **giữ nguyên**; gửi `[]` cho mảng = **xoá sạch**; riêng `PATCH /me` chuỗi rỗng `''` = xoá field nullable (displayName/avatar).
- Schema `.strict()`: gửi field lạ → 422 (đừng gửi thừa field).
- **Phân trang:** `limit` (default 20, max 100) + `offset` (default 0); response kèm `total` khi có.

### 0.6. Notification deep-link

`Notification.referenceType` là mã sự kiện dạng `<ENTITY>_<ACTION>` (vd `TASK_ASSIGNED`, `PROPOSAL_RESUBMITTED`, `NAME_APPROVED`, `CONTRACT_SIGNED`...). FE deep-link bằng **prefix** của `referenceType` + `referenceId`:

| Prefix | Điều hướng tới |
|---|---|
| `TASK_*` | Chi tiết task (`referenceId` = taskId) |
| `PROPOSAL_*`, `SERIES_*`, `NAME_*`, `FRANCHISE_*` | Chi tiết series (`referenceId` = seriesId/nameId) |
| `CHAPTER_*`, `MANUSCRIPT_*`, `PAGE_*` | Chi tiết chapter |
| `CONTRACT_*`, `AMENDMENT_*`, `PAYMENT_*` | Chi tiết hợp đồng / thanh toán |
| `DEADLINE_*` | Chi tiết deadline request |
| `BOARD_*`, `DECISION_*` | Phiên họp / quyết định Board |
| `SURVEY_*`, `RANKING_*` | Kỳ khảo sát / bảng xếp hạng |
| `REVIEW_*`, `INVITE_*`, `ASSIGNMENT_*` | Hồ sơ / lời mời cộng tác |
| `REVISION_*` | Danh sách vòng yêu cầu sửa (`referenceId` = RevisionRequest id) |

### 0.7. Realtime

- **Mặc định là polling** (10–30s) cho dashboard tiến độ + notification (badge dùng `unreadCount` của `GET /notifications`).
- Duy nhất **phiên họp Board** có WebSocket (`/board` namespace, Socket.IO) — xem §15. Kết nối **bắt buộc JWT**.

### 0.8. CORS / Origin (Spec 13 — hạ tầng)

- Backend chỉ chấp nhận request từ các origin trong biến môi trường **`CORS_ORIGINS`** (danh sách phẩy ngăn cách; rỗng = `*` cho dev). Áp cho **cả HTTP lẫn WebSocket `/board`**.
- ⚠️ **Deploy:** origin của FE (vd `https://mangaka.vercel.app`) **phải** nằm trong `CORS_ORIGINS` của môi trường tương ứng, nếu không browser chặn request (lỗi CORS phía client, không phải lỗi API). Báo BE origin production/preview của FE để thêm vào.
- Auth bằng **Bearer token** (không dùng cookie) → không cần `credentials: 'include'`; chỉ cần gửi header `Authorization`.

### 0.9. Notification không còn trùng (Spec 13 — hạ tầng)

Backend nay chống trùng thông báo bằng khóa duy nhất có hash nội dung (`dedupeKey`): 2 sự kiện y hệt (vd retry job) chỉ tạo **một** bản ghi. Với FE nghĩa là danh sách `GET /notifications` **không còn bản trùng lặp** cho cùng một hành động — không cần tự dedupe phía client.

### 0.10. Tên hiển thị nhúng trong response đọc (Spec 20 — additive)

Các route GET nghiệp vụ dưới đây trả thêm object hiển thị, đồng thời **giữ nguyên toàn bộ field ID cũ**. FE dùng trực tiếp các object này để render tên/avatar/title; không cần gọi thêm `/staff/:id`, `/mangakas/:id` hoặc `/assistants/:id`. Đây là thay đổi additive, không breaking.

| GET route | Field nhúng thêm trong từng item/detail |
|---|---|
| `/contracts`, `/contracts/:id` | `series {id,title}` · `mangaka UserMini` · `editor UserMini \| null` · 🆕 2026-07-19 `boardDecision {id, decisionType, result, decidedAt, boardSession{id,title,startTime}} \| null` (căn cứ phiên họp serial hóa) |
| `/contracts/:contractId/amendments[/:id]` | `creator UserMini \| null` (từ `createdBy`) |
| `/payments`, `/payments/:id`, `/payments/contracts/:id/payments`, `/payments/series/:id/payments`, `/payments/users/:id/payments` | `series {id,title} \| null` · `receiver UserMini` · `approver UserMini \| null` |
| `/transfers/requests/mine`, `/transfers/requests/pending-board`, `/transfers/requests/:id` | `series {id,title} \| null` · `requestingMangaka UserMini \| null` · `originalMangaka UserMini \| null` |
| `/reprint-requests`, `/reprint-requests/:id` | `series {id,title} \| null` · `requester UserMini \| null` |
| `/deadline-requests`, `/deadline-requests/:id` | `series {id,title} \| null` · `chapter {id,chapterNumber,title} \| null` |
| `/tasks`, `/tasks/:id` | `assistant UserMini \| null`; mỗi `versions[]` có `submitter UserMini \| null`; 🆕 2026-07-21 `region {id,pageId,coordinates{x,y,width,height},regionType,createdBy,confirmedByMangaka,confidenceScore,detectedSubtype,aiModelVersion} \| null` |
| `/collaboration-invites[/:id]`, `/studio-assignments[/:id]` | `mangaka UserMini \| null` · `assistant UserMini \| null` · `series {id,title} \| null` |
| `/annotations?targetType=&targetId=` | `author UserMini \| null` |
| `/revision-requests` | `requester UserMini \| null` · `recipient UserMini \| null` · `series {id,title} \| null` |

> 🆕 **2026-07-21 — vùng + reference nhúng trong TaskRes (quan trọng cho Assistant).** Trước đây `TaskRes` chỉ có
> `regionId`/`assetIds` trần, mà `GET /pages/:id/regions` lại là **MANGAKA/EDITOR-only** ⇒ Assistant nhận task nhưng
> **không có API hợp lệ nào** để lấy toạ độ vùng, cũng không có key để tải ảnh reference. Nay `GET /tasks` và
> `GET /tasks/:id` trả kèm:
> - **`regions[]`** 🔴 (BREAKING — thay `region` đơn): mảng RegionRes đầy đủ toạ độ. Task 1 trang gắn 0..N vùng → vẽ **tất cả** khung; task nhóm (nhiều trang) → `[]`.
> - **`assets[]`** 🆕: `{id, filePath, name, assetType}` — resolve sẵn `assetIds` → object key; Assistant dùng `filePath` làm `key` cho `POST /tasks/:id/download-url` để tải reference.
>
> Nhờ đó màn task của Assistant vẽ khung vùng + tải ảnh gốc/reference chỉ từ một call, không cần nới quyền route region.

`UserMini = { id, displayName, avatar }`, trong đó backend tính `displayName = user.displayName ?? user.name`; `avatar` có thể `null`. Lookup **không lọc `deletedAt`**, vì lịch sử công việc/hợp đồng vẫn phải hiện tên người đã nghỉ. ID dangling do dữ liệu cũ/xóa cứng được biểu diễn bằng `null`, không làm hỏng cả response.

> Chỉ dựa vào embed ở các route GET nêu trên. Response mutation vẫn serialize bình thường nhưng field embed có thể vắng mặt; nếu màn hình cần tên mới nhất sau mutation thì refetch route GET. `DeadlineRequest.requestedBy`/`lastProposedBy` vẫn là PHE `MANGAKA|EDITOR`, không phải user ID và không đổi semantics.

### 0.11. Read-cache trên nhóm route public/ranking (Spec 23 — hạ tầng, KHÔNG breaking)

Từ 2026-07-20, một số route **đọc** được cache phía server (Redis) để chịu tải guest. **Shape response
không đổi một ký tự nào** — FE không phải sửa gì. Điều duy nhất cần biết: **dữ liệu có thể trễ tối đa
bằng TTL** sau một hành động ghi.

| Nhóm route | TTL tối đa | Ghi chú |
|---|---|---|
| `GET /public/series`, `/public/series/:id`, `/public/chapters/:id/pages` | 120s | Chỉ cache trang đầu (`offset=0`); `offset>0` luôn đi thẳng DB |
| `GET /vote/context` | 60s | Trang bình chọn |
| `GET /vote/results`, `/vote/results/latest`, `/vote/periods` | 3600s | Kỳ đã `REFLECTED` là **bất biến** nên TTL dài an toàn |
| `GET /rankings`, `/rankings/board`, `/survey-periods/:id/rankings` | 600s | Dữ liệu dùng chung mọi role, không scope theo user |

**Thực tế thì thường tươi hơn TTL nhiều:** hệ thống chủ động xoá cache khi có sự kiện nghiệp vụ —
series đổi trạng thái, publish chapter, `PATCH /series/:id` đổi title/cover, mở/đóng kỳ bình chọn,
chốt ranking. TTL chỉ là lưới an toàn.

**KHÔNG cache:** mọi route scope theo user (`/dashboard/*`, `/notifications`, list series khi đã đăng nhập)
— nên các màn hình cá nhân luôn tươi tuyệt đối.

⚠ **`coverImageUrl` / `imageUrl` (signed URL) KHÔNG bị cache** — luôn được ký mới mỗi request. Vì vậy 2 lần
gọi cùng một route public sẽ trả URL ảnh **khác chuỗi nhau** dù nội dung giống hệt; đừng dùng URL ảnh làm
khóa so sánh/diff hay cache key phía FE — hãy dùng `id` (hoặc `key` nếu có).

> Redis chết thì các route này **vẫn chạy bình thường** (đọc thẳng DB, fail-open) — không bao giờ trả 5xx vì cache.

---

## §1. Từ điển Enum (63 enum — nguồn: Prisma schema, đầy đủ 100% giá trị)

> Field nào trong guide ghi `enum \`X\`` thì **chỉ được gửi/nhận đúng các giá trị liệt kê dưới đây** — gửi giá trị khác → 422. Enum đánh dấu `(read-only)` = chỉ xuất hiện trong response, FE không bao giờ gửi lên.

### 1.1. Identity & Access

**`RoleCode`** — vai trò user (gán khi tạo tài khoản, nằm trong JWT):
| Giá trị | Ý nghĩa |
|---|---|
| `MANGAKA` | Tác giả — tạo series/chapter, phân vùng, giao task, review trợ lý |
| `ASSISTANT` | Trợ lý — nhận task (background/screentone/...), nộp kết quả |
| `EDITOR` | Biên tập viên — claim series, review proposal/Name/manuscript, đặt deadline, pitch lên Board |
| `BOARD_MEMBER` | Thành viên Hội đồng — vote quyết định serial hóa / hủy / đổi format |
| `SUPER_ADMIN` | Quản trị hệ thống — tạo Editor/Board, moderation user, config |

**`UserStatus`** — vòng đời tài khoản:
| Giá trị | Ý nghĩa |
|---|---|
| `INACTIVE` | Vừa đăng ký, CHƯA verify email (chưa login được đầy đủ) |
| `ACTIVE` | Đang hoạt động bình thường |
| `BANNED` | Bị cấm vĩnh viễn (vi phạm) — login → 403 `Error.AccountBanned` |
| `BLOCKED` | Bị khóa tạm thời — login → 403 như BANNED, admin có thể mở lại |

**`RegistrationType`** (read-only): `SELF_REGISTERED` (Mangaka/Assistant tự đăng ký) · `ADMIN_CREATED` (Editor/Board do Super Admin cấp, bị ép đổi mật khẩu lần đầu).

**`OtpPurpose`** (nội bộ BE, FE không gửi): `REGISTER` (verify email đăng ký) · `FORGOT_PASSWORD` (đặt lại mật khẩu) · `SIGNING_CONTRACT` (ký hợp đồng bằng OTP) · `VOTE` (guest voting).

### 1.2. Series & Proposal

**`SeriesStatus`** — state machine vòng đời Series (Flow 1 + Flow 5):
| Giá trị | Ý nghĩa |
|---|---|
| `DRAFT` | Mangaka đang soạn proposal, chưa submit — sửa/xoá tự do |
| `IN_REVIEW` | Đã submit, vào hàng đợi / đang được Editor review (proposal + Name) |
| `READY_TO_PITCH` | Proposal APPROVED **và** Name APPROVED — Editor sẵn sàng pitch |
| `PITCHED` | Editor đã mở BoardDecision SERIALIZATION, chờ Board vote |
| `SERIALIZED` | Board duyệt — series chính thức được đăng định kỳ (tạo chapter được) |
| `HIATUS` | Tạm ngưng (Mangaka nghỉ) — không tính at-risk, TIME_BOUND dừng đồng hồ |
| `COMPLETING` | Đang kết thúc tự nhiên (Board duyệt COMPLETION) — vẫn tạo được chương cuối, không giới hạn |
| `CANCELLING` | Bị Board hủy — chỉ được tạo thêm đúng `endingChapterAllowance` chương kết thúc |
| `COMPLETED` | Đã kết thúc tự nhiên (terminal) |
| `CANCELLED` | Đã hủy xong (terminal) |
| `REJECTED` | Board từ chối serial hóa; Editor phụ trách có thể mở lại vòng rework (`IN_REVIEW`), hoặc hai bên rút/bỏ hẳn |
| `ABANDONED` | Editor từ chối hẳn concept; Mangaka có thể mở lại hồ sơ về `DRAFT` |
| `WITHDRAWN` | Mangaka tự rút hồ sơ; có thể mở lại về `DRAFT` |

**`ProposalStatus`** — trạng thái hồ sơ proposal (embedded trong Series):
| Giá trị | Ý nghĩa |
|---|---|
| `DRAFT` | Đang soạn |
| `PROPOSAL_REVIEW` | Đã submit, chờ/đang được Editor review |
| `PROPOSAL_REVISION` | Editor yêu cầu sửa — Mangaka được PUT cập nhật rồi resubmit |
| `PROPOSAL_APPROVED` | Editor đã duyệt concept |
| `PITCHED` | Đã pitch lên Board |
| `APPROVED` / `REJECTED` | Kết quả Board |
| `WITHDRAWN` | Mangaka rút |

**`NameStatus`** — trạng thái storyboard Name (nguồn sự thật duy nhất, cho cả proposal-Name lẫn chapter-Name): `DRAFT` (đang vẽ) → `SUBMITTED` (đã nộp) → `IN_REVIEW` (Editor đang xem) ⇄ `REVISION` (bị yêu cầu sửa — Mangaka sửa trang + resubmit, `version` tăng) → `APPROVED` (duyệt — với chapter-Name: **mở gate upload page**).

**`NameKind`**: `PROPOSAL` (Name chương mẫu nộp kèm proposal — thao tác qua `/series/:id/names/*`) · `CHAPTER` (storyboard từng chương — thao tác qua `/chapters/:id/names/*`).

**`Genre`** (17 giá trị — thể loại, mảng nhiều giá trị/series): `ACTION`, `ADVENTURE`, `COMEDY`, `DRAMA`, `FANTASY`, `HORROR`, `MYSTERY`, `ROMANCE`, `SCI_FI`, `SLICE_OF_LIFE`, `SPORTS`, `SUPERNATURAL`, `THRILLER`, `HISTORICAL`, `ISEKAI`, `MECHA`, `PSYCHOLOGICAL`. Dùng cho: proposal, filter danh bạ, hồ sơ staff (`specialtyGenres` — engine auto-assign Board chấm điểm theo field này).

**`Demographic`** — phân khúc độc giả mục tiêu: `SHONEN` (nam thiếu niên) · `SEINEN` (nam trưởng thành) · `SHOJO` (nữ thiếu niên) · `JOSEI` (nữ trưởng thành) · `KODOMO` (trẻ em).

**`PublicationType`** — nhịp xuất bản (Board quyết khi serialize, đổi qua FORMAT_CHANGE): `WEEKLY` (tuần — ngưỡng cảnh báo deadline gắt hơn) · `MONTHLY` (tháng) · `IRREGULAR` (không định kỳ).

**`RelationshipType`** — quan hệ franchise với series gốc (Flow 12): `SEQUEL` (hậu truyện) · `SPINOFF` (ngoại truyện nhân vật phụ) · `SIDE_STORY` (truyện phụ cùng vũ trụ) · `REBOOT` (làm lại).

**`FranchiseConsentStatus`** (read-only): `PENDING` (chờ Mangaka gốc đồng ý — series con bị chặn submit) · `APPROVED` (được phép) · `REJECTED` (từ chối — vẫn chặn submit).

### 1.3. Chapter Production

**`ChapterStatus`** (read-only — DẪN XUẤT từ Manuscript, FE không set):
| Giá trị | Ý nghĩa |
|---|---|
| `DRAFT` | Name-phase: chapter đã tạo slot, Name chưa có hoặc chưa APPROVED (chưa upload page được) |
| `IN_PRODUCTION` | Đang sản xuất (Manuscript từ IN_PRODUCTION → READY_FOR_PRINT) |
| `COMPLETED` | (dự phòng — hiện Manuscript điều khiển trực tiếp sang PUBLISHED) |
| `PUBLISHED` | Đã xuất bản |

**`ManuscriptStatus`** — state machine sản xuất bản thảo:
| Giá trị | Ý nghĩa |
|---|---|
| `DRAFT` | Khởi tạo cùng chapter (chapter-first), chưa có page |
| `IN_PRODUCTION` | Có page đầu tiên — đang vẽ / giao task |
| `EDITOR_REVIEW` | Mangaka đã nộp cho Editor final check |
| `EDITOR_REVISION` | Editor yêu cầu sửa (annotate) — Mangaka sửa rồi resubmit |
| `READY_FOR_PRINT` | Editor đã duyệt — chờ publish |
| `AWAITING_CO_OWNER_APPROVAL` | Series có co-owner (PARTIAL_TRANSFER) — chờ Mangaka gốc duyệt trước khi phát hành |
| `PUBLISHED` | Đã xuất bản (emit sự kiện cho payment + ranking) |

**`PageStatus`** (backend-driven; FE không set): `DRAFT` (được sửa) → `COMPLETED` (khóa sửa khi Editor review) → `REVISING` (mở lại để sửa) → `COMPLETED` khi resubmit.

**`ChapterHoldAction`** (read-only, trong `holdHistory[]`): `HOLD` · `RESUME`. Lưu ý: hold KHÔNG phải một `ChapterStatus` — chapter đang hold có object `hold != null`, mọi mutation sản xuất bị chặn 409 `Error.ChapterOnHold`.

### 1.4. Region / Task / AI

**`RegionType`** — loại vùng trên trang: `PANEL` (khung truyện) · `BACKGROUND` (nền cần vẽ) · `SPEECH_BUBBLE` (bóng thoại) · `SFX` (hiệu ứng chữ/âm thanh) · `CHARACTER` (nhân vật).

**`TaskStatus`** — vòng đời task giao trợ lý:
| Giá trị | Ý nghĩa |
|---|---|
| `ASSIGNED` | Vừa giao, Assistant chưa bắt đầu |
| `IN_PROGRESS` | Assistant đã bấm start |
| `SUBMITTED` | Đã nộp kết quả (tạo TaskVersion mới) |
| `UNDER_REVIEW` | Mangaka đang review (trạng thái trung gian khi approve) |
| `APPROVED` | Duyệt — trigger cascade Page/Manuscript |
| `REVISION_REQUESTED` | Bị yêu cầu sửa — Assistant start/submit lại (version tăng) |
| `ON_HOLD` | Assistant nghỉ (ON_LEAVE/UNAVAILABLE) — Mangaka reassign được |
| `CANCELLED` | Bị hủy (xóa region / Mangaka hủy tay) — giữ lịch sử version |

**`TaskVersionReviewStatus`** — trạng thái từng bản nộp: `PENDING` (chờ review) · `APPROVED` · `REVISION_REQUESTED`.

**`Specialization`** — chuyên môn Assistant = loại việc giao được: `BACKGROUND` (vẽ nền) · `SCREENTONE` (dán tone) · `EFFECT_LINES` (speed line/hiệu ứng) · `INKING` (đi mực) · `COLORING` (tô màu) · `LETTERING` (chữ/thoại).

**`AvailabilityStatus`** — Assistant tự khai: `AVAILABLE` (nhận việc) · `BUSY` (bận) · `ON_LEAVE` (nghỉ phép — task đang làm auto ON_HOLD) · `UNAVAILABLE` (ngừng nhận — cũng auto ON_HOLD).

**`AiJobType`**: `SEGMENT` (đang dùng) · `COLOR`, `NUMBER` (dự phòng tương lai).
**`AiJobStatus`**: `QUEUED` → `RUNNING` → `SUCCEEDED` | `FAILED` (FE poll `GET /ai-jobs/:id`).
**`AiSegmentMode`**: `MODEL` (YOLO deep-learning — chính xác hơn, chậm hơn) · `HEURISTIC` (OpenCV baseline — nhanh, fallback).

### 1.5. Studio & Review

**`CollaborationInviteStatus`**: `PENDING` (chờ Assistant trả lời) · `ACCEPTED` (→ sinh StudioAssignment ACTIVE) · `DECLINED` (Assistant từ chối) · `EXPIRED` (quá hạn) · `CANCELLED` (Mangaka rút lời mời).

**`StudioAssignmentStatus`**: `ACTIVE` (đang hợp tác — điều kiện để giao task; hết `hireEnd` tự coi như kết thúc, KHÔNG có giá trị EXPIRED riêng) · `COMPLETED` (kết thúc trọn vẹn) · `TERMINATED` (Mangaka chấm dứt sớm, kèm lý do).

**`ReviewStage`** (annotation): `ASSISTANT` · `MANGAKA` · `EDITOR` — giai đoạn review mà annotation thuộc về.

### 1.6. Contract & Payment (Flow 6)

**`ContractType`** — **biến điều khiển Ownership Principle** (chi phối Reprint/Transfer/Franchise):
| Giá trị | Ý nghĩa |
|---|---|
| `FULL_BUYOUT` | NXB mua đứt 100% — Board toàn quyền tái bản/chuyển nhượng/franchise, KHÔNG cần hỏi Mangaka |
| `REVENUE_SHARE` | Ăn chia % sở hữu — mọi quyết định lớn (reprint, transfer, sequel) PHẢI có Mangaka đồng ý; Mangaka nhận chia lợi nhuận định kỳ |

**`ContractStatus`** — vòng đời hợp đồng:
| Giá trị | Ý nghĩa |
|---|---|
| `DRAFT` | Editor đang soạn |
| `MANGAKA_REVIEW` | Đã gửi Mangaka xem |
| `NEGOTIATION` | Có bên yêu cầu sửa — Editor chỉnh rồi gửi lại (reset mọi phê duyệt trước đó) |
| `MANGAKA_APPROVED` | Mangaka đồng ý điều khoản → chuyển Board duyệt |
| `BOARD_APPROVED` | Board đồng ý — đủ điều kiện ký |
| `MANGAKA_SIGNED` | Mangaka đã ký (OTP) |
| `FULLY_EXECUTED` | Cả 2 bên ký — **khóa cứng** (sửa phải qua Amendment); điều kiện để publish chapter |
| `FULFILLED` | Hoàn thành trọn nghĩa vụ (series COMPLETED) |
| `TERMINATED` | Tất toán do series bị CANCEL (mốc đã đạt vẫn trả + compensation) |
| `TERMINATED_BY_BREACH` | Chấm dứt do Mangaka vi phạm (không compensation) |
| `EXPIRED` | Hết hạn hợp đồng |
| `VOIDED` | Hủy trước khi ký xong |

**`ConditionType`** — loại điều kiện giải ngân (`thresholdConfig` khác nhau từng loại — xem route B-CON-04):
| Giá trị | Ý nghĩa |
|---|---|
| `CHAPTER_MILESTONE` | Mốc chương tuyệt đối: đủ N chương published → trả M |
| `RECURRING_CHAPTER` | Lặp: cứ mỗi N chương → trả M (series mở không biết trước số chương) |
| `RANKING_MILESTONE` | Đạt top X trong Y kỳ ranking liên tiếp → bonus |
| `TIME_BOUND` | Trong hạn D đạt N chương → trả M; quá hạn không đạt → MISSED. Series HIATUS → **dừng đồng hồ** |

**`PaymentConditionStatus`**: `PENDING` (đang theo dõi) · `ACHIEVED` (đã đạt — sinh PaymentRecord) · `PAID` · `CANCELLED` · `MISSED` (TIME_BOUND quá hạn) · `DISABLED` (tạm tắt — vd trong lúc HIATUS).

**`PaymentType`** — bản chất khoản chi: `CONDITION_PAYOUT` · `REVENUE_SHARE` (chia lợi nhuận kỳ) · `COMPENSATION` (bồi thường termination) · `CHAPTER_MILESTONE` / `RECURRING_CHAPTER` / `RANKING_MILESTONE` / `TIME_BOUND` (payout theo loại điều kiện) · `TRANSFER` (tiền chuyển nhượng B trả A).

**`PaymentSource`** — nguồn phát sinh: `CONTRACT` · `REPRINT` · `TRANSFER` · `TERMINATION` · `MANUAL`.

**`PaymentRecordStatus`**: `TRIGGERED` (điều kiện vừa đạt, chờ duyệt) → `APPROVED` (Board duyệt chi) → `PAID` (đã chi, có `paidAt`); nhánh khác: `PENDING` · `MISSED` · `FAILED` · `CANCELLED`.

**`ContractAmendmentStatus`** — phụ lục sửa HĐ đã ký: `DRAFT` (soạn/sửa được) → `PENDING_SIGNATURES` (trình ký — reject sẽ về DRAFT + reset chữ ký) → `FULLY_EXECUTED` (đủ chữ ký → ghi đè điều khoản lên HĐ gốc + log ContractVersion) | `VOIDED`.

**`AmendmentTrigger`**: `MANUAL` (Editor tự tạo) · `FORMAT_CHANGE` / `COMPLETION` (auto-sinh DRAFT khi Board quyết Flow 5, nhắc Editor hoàn thiện).

### 1.7. Board & Decision (Flow 1/5/7/8)

**`BoardSessionStatus`**: `UPCOMING` (đã lên lịch, chưa tới giờ — chưa vote được) → `ACTIVE` (đang họp — vote được; auto-start bởi cron khi tới `startTime` hoặc start tay) → `CONCLUDED` (bế mạc — decision còn treo bị sweep sang EXPIRED).

**`BoardSessionPhase`** (read-only trừ route chuyển phase): `PRESENTING` → `QA` → `VOTING`. Phase chỉ đi tới, được phép nhảy `PRESENTING → VOTING`, không được lùi hoặc gửi chat khi đã vào `VOTING`. Phiên `ACTIVE` chỉ nhận phiếu khi phase hiện tại là `VOTING`.

**`DecisionType`** — loại quyết định: `SERIALIZATION` (duyệt serial hóa — Flow 1) · `CANCELLATION` (hủy series) · `FORMAT_CHANGE` (đổi nhịp/tạp chí) · `COMPLETION` (kết thúc tự nhiên) · `CONTINUE`/`CANCEL`/`HIATUS`/`ENDING_ALLOWANCE` (giá trị lifecycle bổ trợ) · `SERIES_CONTRACT_APPROVAL`/`CONTRACT` (liên quan hợp đồng) · `REPRINT` · `TRANSFER`.

**`BoardDecisionResult`** (read-only): `PENDING` (đang vote) · `PENDING_QUORUM` (chưa đủ quorum) · `APPROVED` · `REJECTED` · `EXPIRED` (phiên bế mạc mà chưa chốt — series giữ nguyên trạng thái, Editor mở phiên mới).

**`VoteValue`**: `APPROVE` · `REJECT` · `ABSTAIN` (trắng).

### 1.8. Survey / Voting / Ranking (Flow 4)

**`SurveyStatus`** — kỳ bình chọn: `DRAFT` → `OPEN` (guest vote được) → `CLOSED` (hết nhận phiếu) → `REFLECTED` (đã finalize + công bố — `GET /vote/results` chỉ trả khi REFLECTED).

**`ReaderAuthMethod`** — cách guest xác thực: `EMAIL_OTP` (đang dùng) · `PHONE_OTP` (dự phòng SMS) · `CAPTCHA_ONLY` (dự phòng).

**`VotingAuthMode`** — cấu hình hệ thống: `OTP` · `CAPTCHA` · `HYBRID`.

**`RiskLevel`** (read-only, tín hiệu nội bộ — KHÔNG trả ở route public): `NONE` (an toàn) · `LOW` (bottom 1/3 kỳ này) · `MEDIUM` (bottom 1/3 ≥3 kỳ liên tiếp) · `SEVERE` (≥5 kỳ — feed Board xem xét hủy, trigger Flow 5).

### 1.9. Reprint / Transfer (Flow 7/8)

**`ReprintRequestStatus`**: `PENDING`/`PROPOSED` (vừa tạo) → [REVENUE_SHARE: `MANGAKA_REVIEW` → `MANGAKA_APPROVED` | `REJECTED_BY_MANGAKA`] → `BOARD_APPROVED`/`APPROVED` (vào sản xuất) → `IN_PRODUCTION` → `PUBLISHED`; `REJECTED` (Board từ chối).

**`ReprintChapterStatus`** — từng chương trong bản tái bản: `PENDING` (chờ xử lý) · `IN_REVISION` (đang sửa — WITH_REVISION) · `READY` (sẵn sàng check) · `APPROVED` (Editor duyệt) · `PUBLISHED`.

**`ReprintRevisionMode`**: `AS_IS` (in lại nguyên bản — dùng manuscript gốc) · `WITH_REVISION` (Mangaka/reviser sửa art trước khi in).

**`ReviserType`** — người sửa khi Mangaka gốc không hợp tác (chỉ FULL_BUYOUT): `INTERNAL_TEAM` (đội nội bộ NXB) · `OTHER_MANGAKA` (mangaka khác).

**`TransferType`** (chỉ có nghĩa khi HĐ gốc REVENUE_SHARE): `FULL_TRANSFER` (B mua trọn phần của A — A rời hẳn) · `PARTIAL_TRANSFER` (A giữ một phần → thành **co-owner**, duyệt từng chapter mới trước khi publish).

**`TransferRequestStatus`**: `SUBMITTED` (B nộp hồ sơ) → `UNDER_REVIEW` (Board sàng lọc) → [`REJECTED_BY_BOARD`] → `NEGOTIATING` (Editor deal với A — chỉ REVENUE_SHARE) → [`REJECTED_BY_ORIGINAL_MANGAKA`] → `PROPOSED`/`ACCEPTED` → hoàn tất; `REJECTED` · `CANCELLED`.

**`TransferContractStatus`** — ký 3 bên: `DRAFT` → `A_SIGNED` (Mangaka gốc ký) → `B_SIGNED` (Mangaka nhận ký) → `BOARD_SIGNED` → `FULLY_EXECUTED` (cập nhật ownership + `Series.coOwnerId` nếu PARTIAL) | `VOIDED`.

**`CoOwnerApprovalStatus`** (read-only): `PENDING` (chờ co-owner duyệt chapter) · `APPROVED` · `REJECTED` · `ESCALATED` (quá hạn grace — cron báo Board).

### 1.10. Deadline / Publication / Khác

**`DeadlineRequestStatus`** (Flow 10): `PROPOSED` (một phe đề xuất) ⇄ `COUNTER_PROPOSED` (phe kia counter — turn-taking) → `AGREED_BY_PARTIES` (2 phe đồng ý) → `APPROVED` (Editor finalize — cập nhật Schedule) | `BOARD_REVIEW` (ảnh hưởng slot → Board resolve) | `ESCALATED` (bất đồng → Board phân xử) | `REJECTED` (rút/từ chối).

**`ReadingDirection`** (Flow 13): `RTL` (phải-qua-trái — manga gốc Nhật) · `LTR` (trái-qua-phải — bản dịch phương Tây).

**`AnnotationTargetType`** — annotation gắn lên: `PAGE` · `REGION` · `TASK` · `MANUSCRIPT` · `NAME`.
**`AnnotationType`** — hình thức markup: `TEXT` (ghi chú) · `HIGHLIGHT` (khoanh vùng) · `DRAWING` (vẽ đè).

**`RevisionTargetType`** — loại thực thể của một vòng yêu cầu sửa: `PROPOSAL` (targetId = seriesId) · `NAME` (targetId = nameId) · `MANUSCRIPT` (targetId = chapterId) · `TASK` (targetId = taskId).

**`AssetType`** — phân loại file đính kèm: `REFERENCE` (ảnh tham khảo) · `BACKGROUND` · `SCREENTONE` · `BRUSH` · `OTHER` · `DOCUMENT` (🆕 2026-07-20 — file văn bản do **hệ thống tự sinh**, hiện dùng cho PDF hợp đồng ở `GET /contracts/:id/pdf`; FE không tạo loại này qua `POST /uploads/sign`).

**`NotificationType`** — nhóm thông báo (dùng filter): `SYSTEM` · `CONTRACT` · `TASK` · `DEADLINE` · `SURVEY` · `BOARD` · `REVIEW`.

**`AuditEntityType`** (read-only — `GET /audit`): `SERIES`, `MANUSCRIPT`, `PAGE`, `CHAPTER`, `TASK`, `DEADLINE_REQUEST`, `USER`, `REGION`, `APP_CONFIG`, `CONTRACT`, `BOARD_DECISION`, `REPRINT_REQUEST`, `TRANSFER_REQUEST`, `PAYMENT_RECORD`, `SURVEY_PERIOD`, `PUBLICATION_VERSION`.

**`WarningLevel`** (read-only — `GET /chapters/:id/progress`): `NONE` (an toàn) · `YELLOW` (nguy cơ — weekly: ≤2 ngày & <70%; monthly: ≤5 ngày & <60%) · `RED` (khó kịp — weekly: ≤1 ngày & <90%; monthly: ≤2 ngày & <85%) · `CRITICAL` (quá hạn). *(Enum tính toán, không nằm trong Prisma.)*

---

## §2. Auth, Tài khoản & Hồ sơ (Flow 11)

**Nghiệp vụ:** Mangaka/Assistant **tự đăng ký** → verify email bằng OTP → ACTIVE ngay (KHÔNG cần admin duyệt). Editor/Board Member do **Super Admin cấp tài khoản** (mật khẩu tạm, bị ép đổi lần đầu). Mỗi role có hồ sơ nghề nghiệp riêng: `MangakaProfile` / `AssistantProfile` / `StaffProfile` (Editor + Board dùng chung — Spec 12); thông tin tài khoản chung (tên, avatar, SĐT) sửa qua `PATCH /me`.

### Happy path — tự đăng ký (Mangaka/Assistant)

1. `POST /auth/register` (`type` = MANGAKA | ASSISTANT) → 201, tài khoản `INACTIVE`, OTP gửi vào email.
2. `POST /auth/verify-email` với `{email, code}` → `ACTIVE` + `emailVerified=true`.
3. `POST /auth/login` → `{accessToken, refreshToken, mustChangePassword:false}`.
4. Build hồ sơ: `PUT /me/mangaka-profile` hoặc `PUT /me/assistant-profile`; sửa tên/avatar/SĐT qua `PATCH /me`.
5. Access hết hạn → `POST /auth/refresh-token`; đăng xuất → `POST /auth/logout`.

### Happy path — admin cấp tài khoản (Editor/Board)

1. Super Admin `POST /admin/users` (roleCode EDITOR | BOARD_MEMBER) → mật khẩu tạm trả 1 lần (+ email best-effort), `mustChangePassword=true`.
2. User login → bị `PasswordPolicyGuard` chặn 403 mọi route → `POST /auth/change-password` → dùng bình thường.
3. Editor/Board build hồ sơ `PUT /me/staff-profile` (khai `specialtyGenres` — **quan trọng**: engine auto-assign Board dùng field này, Flow 1).

### Đăng nhập Google

`POST /auth/google` với Google ID token — chỉ **link vào tài khoản có sẵn** (match email), KHÔNG tự tạo tài khoản mới.

### Unhappy cases

| Tình huống | API | Kết quả |
|---|---|---|
| Email đã tồn tại | `POST /auth/register` | 409 `Error.EmailAlreadyExists` |
| Mật khẩu yếu (<8, thiếu hoa/thường/số) / phone sai E.164 | `POST /auth/register` | 422 field-level |
| Xin OTP dồn dập (quota email/IP, cooldown mặc định 30s) | register / send-otp-email | 429 `Error.OtpRateLimited` + `retryAfter` |
| OTP sai quá số lần | `POST /auth/verify-email` | 422 `Error.OtpLocked` (phải xin OTP mới) |
| OTP hết hạn (5 phút) | verify-email / forgot-password | 410 `Error.OTPExpired` |
| Verify lần 2 | `POST /auth/verify-email` | 409 `Error.EmailAlreadyVerified` |
| Login khi chưa verify email | `POST /auth/login` | 403 `Error.EmailNotVerified` |
| Login khi bị BANNED/BLOCKED | `POST /auth/login` | 403 `Error.AccountBanned` |
| Sai email / sai mật khẩu | `POST /auth/login` | 422 field-level (`Error.EmailNotFound` / `Error.InvalidPassword`) |
| Refresh token đã dùng (replay) / hết hạn | `POST /auth/refresh-token` | 401 `Error.RefreshTokenAlreadyUsed` / 401 |
| Google token sai chữ ký | `POST /auth/google` | 401 `Error.InvalidGoogleToken` |
| Email Google chưa có tài khoản | `POST /auth/google` | 403 `Error.GoogleAccountNotRegistered` |
| Chưa đổi mật khẩu tạm mà gọi route khác | mọi route (kể cả `GET /me`) | 403 (by design — FE đọc cờ `mustChangePassword` từ login) |
| `PATCH /me` gửi `email`/`role`/`status` | `PATCH /me` | 422 (schema strict — không cho tự đổi) |
| Xem hồ sơ user sai role route (vd `GET /mangakas/:id` với id Assistant) | public profile | 404 |
| User đúng role nhưng chưa build hồ sơ | `GET /mangakas\|assistants\|staff/:userId` | 200 graceful: `hasProfile:false` + basics + field default rỗng |

**Quy ước `PATCH /me`:** omit/`null` = giữ nguyên; `''` = XÓA (chỉ `displayName`/`avatar`). `name`/`phoneNumber` không xoá được (bắt buộc trên User).

### API Reference

#### `POST /auth/register`
> Dang ky Mangaka/Assistant -> User INACTIVE + gui OTP (purpose=REGISTER). Public.

**Quyền:** **PUBLIC** (không cần token)

**Body** (`RegisterBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `email` | string (regex) ✍ | ✅ | Email đăng nhập |
| `name` | string (2..100 ký tự) ✍ | ✅ | Tên |
| `phoneNumber` | string (regex) ✍ | ✅ | E.164 format, e.g. +84912345678 |
| `password` | string (regex) ✍ | ✅ | Mật khẩu ≥8 ký tự, có hoa/thường/số |
| `displayName` | string (2..100 ký tự) ✍ | ✅ | Tên hiển thị (null = dùng name) |
| `confirm_password` | string (8..100 ký tự) ✍ | ✅ |  |
| `type` | enum `ReviewStage` | ✅ | Allowed role codes: MANGAKA, ASSISTANT |

**Response 201** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 409 | `Error.EmailAlreadyExists` | email is already used |
| 422 | — | Validation (password >=8, hoa/thuong/so; roleCode chi MANGAKA/ASSISTANT) |
| 429 | `Error.OtpRateLimited` | too many OTP requests |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "email": "user@example.com",
  "name": "Nguyễn Văn A",
  "phoneNumber": "+84912345678",
  "password": "Password123",
  "displayName": "Nguyễn Văn A",
  "confirm_password": "Password123",
  "type": "MANGAKA"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /auth/verify-email`
> Xac thuc email bang OTP -> emailVerified=true + status=ACTIVE. Public.

**Quyền:** **PUBLIC** (không cần token)

**Body** (`VerifyEmailBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `email` | string (regex) ✍ | ✅ | Email đăng nhập |
| `code` | string (6..6 ký tự) ✍ | ✅ | Mã OTP 6 số |

**Response 201** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 409 | `Error.EmailAlreadyVerified` | email is already verified |
| 410 | `Error.OTPExpired` | OTP code has expired |
| 422 | `Error.InvalidOTP` | OTP code is invalid |
| 422 | `Error.OTPLocked` | OTP attempts are locked |
| 422 | `Error.EmailNotFound` | email does not exist |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "email": "user@example.com",
  "code": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /auth/login`
> Dang nhap (email + password) -> access JWT + refresh token. Public.

**Quyền:** **PUBLIC** (không cần token)

**Body** (`LoginBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `email` | string (regex) ✍ | ✅ | Email đăng nhập |
| `password` | string (6..100 ký tự) ✍ | ✅ | Mật khẩu ≥8 ký tự, có hoa/thường/số |

**Response 201** (`LoginRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `user` | object | ✅ |  |
| `user.id` | string | ✅ | ObjectId của bản ghi |
| `user.email` | string (regex) | ✅ | Email đăng nhập |
| `user.name` | string (2..100 ký tự) | ✅ | Tên |
| `user.displayName` | string (2..100 ký tự) | ✅ | Tên hiển thị (null = dùng name) |
| `user.phoneNumber` | string (9..15 ký tự) | ✅ | Số điện thoại E.164 (vd +849xxxxxxxx) |
| `user.role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `mustChangePassword` | boolean | ✅ | true = bị chặn mọi route nghiệp vụ tới khi đổi mật khẩu |
| `accessToken` | string | ✅ | JWT access (TTL ngắn) — gắn Authorization: Bearer |
| `refreshToken` | string | ✅ | JWT refresh (TTL dài) — đổi access mới qua /auth/refresh-token |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.AccountBanned` | account is banned or blocked |
| 403 | `Error.EmailNotVerified` | email is not verified |
| 422 | `Error.EmailNotFound` | email does not exist |
| 422 | `Error.InvalidPassword` | password is invalid |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "email": "user@example.com",
  "password": "Password123"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "Nguyễn Văn A",
      "displayName": "Nguyễn Văn A",
      "phoneNumber": "+84912345678",
      "role": "MANGAKA"
    },
    "mustChangePassword": false,
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /auth/google`
> Dang nhap Google (FE gui idToken) -> access + refresh. Public.

**Quyền:** **PUBLIC** (không cần token)

**Body** (`GoogleLoginBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `idToken` | string (1..∞ ký tự) ✍ | ✅ |  |

**Response 201** (`LoginRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `user` | object | ✅ |  |
| `user.id` | string | ✅ | ObjectId của bản ghi |
| `user.email` | string (regex) | ✅ | Email đăng nhập |
| `user.name` | string (2..100 ký tự) | ✅ | Tên |
| `user.displayName` | string (2..100 ký tự) | ✅ | Tên hiển thị (null = dùng name) |
| `user.phoneNumber` | string (9..15 ký tự) | ✅ | Số điện thoại E.164 (vd +849xxxxxxxx) |
| `user.role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `mustChangePassword` | boolean | ✅ | true = bị chặn mọi route nghiệp vụ tới khi đổi mật khẩu |
| `accessToken` | string | ✅ | JWT access (TTL ngắn) — gắn Authorization: Bearer |
| `refreshToken` | string | ✅ | JWT refresh (TTL dài) — đổi access mới qua /auth/refresh-token |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 401 | `Error.InvalidGoogleToken` | google token is invalid |
| 403 | `Error.GoogleEmailNotVerified` | google email is not verified |
| 403 | `Error.GoogleAccountNotRegistered` | google account is not registered |
| 403 | `Error.AccountBanned` | account is banned or blocked |
| 403 | `Error.EmailNotVerified` | email is not verified |
| 409 | `Error.GoogleAccountMismatch` | google account does not match existing account |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "idToken": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "Nguyễn Văn A",
      "displayName": "Nguyễn Văn A",
      "phoneNumber": "+84912345678",
      "role": "MANGAKA"
    },
    "mustChangePassword": false,
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /auth/refresh-token`
> Rotate refresh token -> cap access moi + revoke refresh cu. Public.

**Quyền:** **PUBLIC** (không cần token)

**Body** (`RefreshTokenBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `refreshToken` | string ✍ | ✅ | JWT refresh (TTL dài) — đổi access mới qua /auth/refresh-token |

**Response 201** (`RefreshTokenRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `user` | object | ✅ |  |
| `user.id` | string | ✅ | ObjectId của bản ghi |
| `user.email` | string (regex) | ✅ | Email đăng nhập |
| `user.name` | string (2..100 ký tự) | ✅ | Tên |
| `user.displayName` | string (2..100 ký tự) | ✅ | Tên hiển thị (null = dùng name) |
| `user.phoneNumber` | string (9..15 ký tự) | ✅ | Số điện thoại E.164 (vd +849xxxxxxxx) |
| `user.role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `mustChangePassword` | boolean | ✅ | true = bị chặn mọi route nghiệp vụ tới khi đổi mật khẩu |
| `accessToken` | string | ✅ | JWT access (TTL ngắn) — gắn Authorization: Bearer |
| `refreshToken` | string | ✅ | JWT refresh (TTL dài) — đổi access mới qua /auth/refresh-token |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 401 | `Error.UnauthorizedAccess` | authentication token is missing or invalid |
| 401 | `Error.RefreshTokenAlreadyUsed` | refresh token has already been used |
| 403 | `Error.AccountBanned` | account is banned or blocked |
| 403 | `Error.EmailNotVerified` | email is not verified |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "refreshToken": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "Nguyễn Văn A",
      "displayName": "Nguyễn Văn A",
      "phoneNumber": "+84912345678",
      "role": "MANGAKA"
    },
    "mustChangePassword": false,
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /auth/logout`
> Logout -> revoke refresh token hien tai. Public (gui refresh token trong body).

**Quyền:** **PUBLIC** (không cần token)

**Body** (`LogoutBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `refreshToken` | string ✍ | ✅ | JWT refresh (TTL dài) — đổi access mới qua /auth/refresh-token |

**Response 201** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 401 | `Error.UnauthorizedAccess` | authentication token is missing or invalid |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "refreshToken": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /auth/send-otp-email`
> Gui lai OTP qua email (cho tai khoan chua verify). Public.

**Quyền:** **PUBLIC** (không cần token)

**Body** (`SendOtpBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `email` | string (regex) ✍ | ✅ | Email đăng nhập |
| `purpose` | enum `OtpPurpose` | ✅ | OTP purpose: REGISTER, FORGOT_PASSWORD, SIGNING_CONTRACT |

**Response 201** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 422 | `Error.EmailNotFound` | email does not exist |
| 422 | `Error.EmailAlreadyExists` | email is already used |
| 429 | `Error.OtpRateLimited` | too many OTP requests |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "email": "user@example.com",
  "purpose": "REGISTER"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /auth/forgot-password`
> Dat lai mat khau bang OTP (purpose=FORGOT_PASSWORD) + revoke toan bo refresh token. Public.

**Quyền:** **PUBLIC** (không cần token)

**Body** (`ForgotPasswordBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `email` | string (regex) ✍ | ✅ | Email đăng nhập |
| `code` | string (6..6 ký tự) ✍ | ✅ | Mã OTP 6 số |
| `newPassword` | string (regex) ✍ | ✅ |  |
| `confirmNewPassword` | string (8..100 ký tự) ✍ | ✅ |  |

**Response 201** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 410 | `Error.OTPExpired` | OTP code has expired |
| 422 | `Error.EmailNotFound` | email does not exist |
| 422 | `Error.InvalidOTP` | OTP code is invalid |
| 422 | `Error.OTPLocked` | OTP attempts are locked |
| 422 | `Error.InvalidPassword` | password is invalid |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "email": "user@example.com",
  "code": "string",
  "newPassword": "Password123",
  "confirmNewPassword": "Password123"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /auth/change-password`
> Doi mat khau (user da dang nhap; dung cho lan dau mustChangePassword)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Body** (`ChangePasswordBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `currentPassword` | string (6..100 ký tự) ✍ | ✅ |  |
| `newPassword` | string (regex) ✍ | ✅ |  |
| `confirmNewPassword` | string (8..100 ký tự) ✍ | ✅ |  |

**Response 201** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 422 | `Error.InvalidPassword` | password is invalid |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "currentPassword": "Password123",
  "newPassword": "Password123",
  "confirmNewPassword": "Password123"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /me`
> Xem thông tin tài khoản của chính mình (mọi role)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Response 200** (`MeRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `email` | string | ✅ | Email đăng nhập |
| `name` | string | ✅ | Tên |
| `displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `avatar` | string | ✅ | Object key trên R2 (A7) — FE đổi sang signed GET để hiển thị |
| `phoneNumber` | string | ✅ | Số điện thoại E.164 (vd +849xxxxxxxx) |
| `role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `status` | enum `UserStatus` | ✅ | User lifecycle status: INACTIVE, ACTIVE, BANNED, BLOCKED |
| `emailVerified` | boolean | ✅ | true = đã xác thực email |
| `mustChangePassword` | boolean | ✅ | true = bị chặn mọi route nghiệp vụ tới khi đổi mật khẩu |
| `createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.UserNotFound` | user does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "Nguyễn Văn A",
    "displayName": "Nguyễn Văn A",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "phoneNumber": "+84912345678",
    "role": "MANGAKA",
    "status": "INACTIVE",
    "emailVerified": false,
    "mustChangePassword": false,
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /me`
> Cập nhật thông tin tài khoản của chính mình (name/displayName/avatar/phoneNumber). '' = xoá field nullable

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Body** (`UpdateMeBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `name` | string (2..100 ký tự) ✍ | — | Tên |
| `displayName` | string (0..100 ký tự) ✍ | — | Chuỗi rỗng '' = XOÁ; omit/null = giữ nguyên |
| `avatar` | string (0..500 ký tự) ✍ | — | Object key A7. Chuỗi rỗng '' = XOÁ; omit/null = giữ nguyên |
| `phoneNumber` | string (regex) ✍ | — | E.164 format, e.g. +84912345678 |

**Response 200** (`MeRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `email` | string | ✅ | Email đăng nhập |
| `name` | string | ✅ | Tên |
| `displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `avatar` | string | ✅ | Object key trên R2 (A7) — FE đổi sang signed GET để hiển thị |
| `phoneNumber` | string | ✅ | Số điện thoại E.164 (vd +849xxxxxxxx) |
| `role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `status` | enum `UserStatus` | ✅ | User lifecycle status: INACTIVE, ACTIVE, BANNED, BLOCKED |
| `emailVerified` | boolean | ✅ | true = đã xác thực email |
| `mustChangePassword` | boolean | ✅ | true = bị chặn mọi route nghiệp vụ tới khi đổi mật khẩu |
| `createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.UserNotFound` | user does not exist |
| 422 | — | Validation fail (gửi email/role/status → strict reject) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "name": "Nguyễn Văn A",
  "displayName": "Nguyễn Văn A",
  "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
  "phoneNumber": "+84912345678"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "Nguyễn Văn A",
    "displayName": "Nguyễn Văn A",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "phoneNumber": "+84912345678",
    "role": "MANGAKA",
    "status": "INACTIVE",
    "emailVerified": false,
    "mustChangePassword": false,
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PUT /me/mangaka-profile`
> Mangaka tạo/cập nhật hồ sơ của mình (penName/genres/level/bio/portfolio) — lazy 1:1

**Quyền:** MANGAKA (Bearer)

**Body** (`MangakaProfileBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `penName` | string (1..100 ký tự) ✍ | ✅ |  |
| `genres` | enum `Genre`[] | — | Manga genre (mảng, nhiều thể loại / series) (default: `[]`) |
| `experienceLevel` | string ✍ | — | Cấp kinh nghiệm |
| `bio` | string ✍ | — | Giới thiệu bản thân (text tự do) |
| `portfolioFiles` | string[] ✍ | — | (default: `[]`) |

**Response 200** (`MangakaProfileRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `userId` | string | ✅ | ObjectId của User |
| `penName` | string | ✅ |  |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `experienceLevel` | string | ✅ | Cấp kinh nghiệm |
| `bio` | string | ✅ | Giới thiệu bản thân (text tự do) |
| `portfolioFiles` | string[] | ✅ |  |
| `reputationScore` | number | ✅ | Điểm uy tín Bayesian-weighted |
| `ratingAvg` | number | ✅ | Điểm trung bình đánh giá |
| `ratingCount` | number | ✅ | Số lượt đánh giá |
| `isRecommended` | boolean | ✅ | true = hệ thống gắn nhãn đề xuất (ratingCount ≥ 3 và score ≥ ngưỡng AppConfig) |
| `displayName` | string | — | Tên hiển thị (null = dùng name) |
| `avatar` | string | — | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `hasProfile` | boolean | ✅ | false = user chưa build hồ sơ; field profile = default rỗng |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "penName": "Bút danh mẫu",
  "genres": [
    "ACTION"
  ],
  "experienceLevel": "string",
  "bio": "Nội dung mẫu",
  "portfolioFiles": [
    "uploads/507f1f77bcf86cd799439011/anh.png"
  ]
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "penName": "Bút danh mẫu",
    "genres": [
      "ACTION"
    ],
    "experienceLevel": "string",
    "bio": "Nội dung mẫu",
    "portfolioFiles": [
      "uploads/507f1f77bcf86cd799439011/anh.png"
    ],
    "reputationScore": 0,
    "ratingAvg": 0,
    "ratingCount": 1,
    "isRecommended": false,
    "displayName": "Nguyễn Văn A",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "hasProfile": false
  }
}
```

<!-- payload-example:end -->

---

#### `GET /me/mangaka-profile`
> Mangaka xem hồ sơ của mình

**Quyền:** MANGAKA (Bearer)

**Response 200** (`MangakaProfileRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `userId` | string | ✅ | ObjectId của User |
| `penName` | string | ✅ |  |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `experienceLevel` | string | ✅ | Cấp kinh nghiệm |
| `bio` | string | ✅ | Giới thiệu bản thân (text tự do) |
| `portfolioFiles` | string[] | ✅ |  |
| `reputationScore` | number | ✅ | Điểm uy tín Bayesian-weighted |
| `ratingAvg` | number | ✅ | Điểm trung bình đánh giá |
| `ratingCount` | number | ✅ | Số lượt đánh giá |
| `isRecommended` | boolean | ✅ | true = hệ thống gắn nhãn đề xuất (ratingCount ≥ 3 và score ≥ ngưỡng AppConfig) |
| `displayName` | string | — | Tên hiển thị (null = dùng name) |
| `avatar` | string | — | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `hasProfile` | boolean | ✅ | false = user chưa build hồ sơ; field profile = default rỗng |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ProfileNotFound` | profile does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "penName": "Bút danh mẫu",
    "genres": [
      "ACTION"
    ],
    "experienceLevel": "string",
    "bio": "Nội dung mẫu",
    "portfolioFiles": [
      "uploads/507f1f77bcf86cd799439011/anh.png"
    ],
    "reputationScore": 0,
    "ratingAvg": 0,
    "ratingCount": 1,
    "isRecommended": false,
    "displayName": "Nguyễn Văn A",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "hasProfile": false
  }
}
```

<!-- payload-example:end -->

---

#### `PUT /me/assistant-profile`
> Assistant tạo/cập nhật hồ sơ của mình (specializations/level/availability) — lazy 1:1

**Quyền:** ASSISTANT (Bearer)

**Body** (`AssistantProfileBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `specializations` | enum `Specialization`[] | — | Assistant specialization/task type (default: `[]`) |
| `experienceLevel` | string ✍ | — | Cấp kinh nghiệm |
| `portfolioFiles` | string[] ✍ | — | (default: `[]`) |
| `availabilityStatus` | enum `AvailabilityStatus` | — | Assistant availability: AVAILABLE, BUSY, ON_LEAVE, UNAVAILABLE |
| `availabilityFrom` | string (regex, ISO 8601) ✍ | — |  |
| `availabilityTo` | string (regex, ISO 8601) ✍ | — |  |

**Response 200** (`AssistantProfileRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `userId` | string | ✅ | ObjectId của User |
| `specializations` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `experienceLevel` | string | ✅ | Cấp kinh nghiệm |
| `portfolioFiles` | string[] | ✅ |  |
| `availabilityStatus` | enum `AvailabilityStatus` | ✅ | Assistant availability: AVAILABLE, BUSY, ON_LEAVE, UNAVAILABLE |
| `availabilityFrom` | string | ✅ |  |
| `availabilityTo` | string | ✅ |  |
| `reputationScore` | number | ✅ | Điểm uy tín Bayesian-weighted |
| `ratingAvg` | number | ✅ | Điểm trung bình đánh giá |
| `ratingCount` | number | ✅ | Số lượt đánh giá |
| `isRecommended` | boolean | ✅ | true = hệ thống gắn nhãn đề xuất (ratingCount ≥ 3 và score ≥ ngưỡng AppConfig) |
| `displayName` | string | — | Tên hiển thị (null = dùng name) |
| `avatar` | string | — | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `hasProfile` | boolean | ✅ | false = user chưa build hồ sơ; field profile = default rỗng |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "specializations": [
    "BACKGROUND"
  ],
  "experienceLevel": "string",
  "portfolioFiles": [
    "uploads/507f1f77bcf86cd799439011/anh.png"
  ],
  "availabilityStatus": "AVAILABLE",
  "availabilityFrom": "2026-07-20T09:30:00.000Z",
  "availabilityTo": "2026-07-20T09:30:00.000Z"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "specializations": [
      "BACKGROUND"
    ],
    "experienceLevel": "string",
    "portfolioFiles": [
      "uploads/507f1f77bcf86cd799439011/anh.png"
    ],
    "availabilityStatus": "AVAILABLE",
    "availabilityFrom": "string",
    "availabilityTo": "string",
    "reputationScore": 0,
    "ratingAvg": 0,
    "ratingCount": 1,
    "isRecommended": false,
    "displayName": "Nguyễn Văn A",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "hasProfile": false
  }
}
```

<!-- payload-example:end -->

---

#### `GET /me/assistant-profile`
> Assistant xem hồ sơ của mình

**Quyền:** ASSISTANT (Bearer)

**Response 200** (`AssistantProfileRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `userId` | string | ✅ | ObjectId của User |
| `specializations` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `experienceLevel` | string | ✅ | Cấp kinh nghiệm |
| `portfolioFiles` | string[] | ✅ |  |
| `availabilityStatus` | enum `AvailabilityStatus` | ✅ | Assistant availability: AVAILABLE, BUSY, ON_LEAVE, UNAVAILABLE |
| `availabilityFrom` | string | ✅ |  |
| `availabilityTo` | string | ✅ |  |
| `reputationScore` | number | ✅ | Điểm uy tín Bayesian-weighted |
| `ratingAvg` | number | ✅ | Điểm trung bình đánh giá |
| `ratingCount` | number | ✅ | Số lượt đánh giá |
| `isRecommended` | boolean | ✅ | true = hệ thống gắn nhãn đề xuất (ratingCount ≥ 3 và score ≥ ngưỡng AppConfig) |
| `displayName` | string | — | Tên hiển thị (null = dùng name) |
| `avatar` | string | — | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `hasProfile` | boolean | ✅ | false = user chưa build hồ sơ; field profile = default rỗng |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ProfileNotFound` | profile does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "specializations": [
      "BACKGROUND"
    ],
    "experienceLevel": "string",
    "portfolioFiles": [
      "uploads/507f1f77bcf86cd799439011/anh.png"
    ],
    "availabilityStatus": "AVAILABLE",
    "availabilityFrom": "string",
    "availabilityTo": "string",
    "reputationScore": 0,
    "ratingAvg": 0,
    "ratingCount": 1,
    "isRecommended": false,
    "displayName": "Nguyễn Văn A",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "hasProfile": false
  }
}
```

<!-- payload-example:end -->

---

#### `PUT /me/staff-profile`
> Editor/Board tạo/cập nhật hồ sơ của mình (specialtyGenres/demographics/bio) — lazy 1:1

**Quyền:** EDITOR, BOARD_MEMBER (Bearer)

**Body** (`StaffProfileBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `specialtyGenres` | enum `Genre`[] | — | Sở trường thể loại — dùng để auto-assign Board vào phiên pitch (PB-05) (default: `[]`) |
| `demographics` | enum `Demographic`[] | — | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO (default: `[]`) |
| `bio` | string (0..2000 ký tự) ✍ | — | Giới thiệu bản thân (text tự do) |
| `yearsOfExperience` | integer (≥ 0, ≤ 80) ✍ | — | Số năm kinh nghiệm (0–80) |

**Response 200** (`StaffProfileRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `userId` | string | ✅ | ObjectId của User |
| `role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `specialtyGenres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographics` | enum `Demographic`[] | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `bio` | string | ✅ | Giới thiệu bản thân (text tự do) |
| `yearsOfExperience` | number | ✅ | Số năm kinh nghiệm (0–80) |
| `displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `avatar` | string | ✅ | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `hasProfile` | boolean | ✅ | false = chưa build hồ sơ; field profile = default rỗng |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "specialtyGenres": [
    "ACTION"
  ],
  "demographics": [
    "SHONEN"
  ],
  "bio": "Nội dung mẫu",
  "yearsOfExperience": 1
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "role": "MANGAKA",
    "specialtyGenres": [
      "ACTION"
    ],
    "demographics": [
      "SHONEN"
    ],
    "bio": "Nội dung mẫu",
    "yearsOfExperience": 0,
    "displayName": "Nguyễn Văn A",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "hasProfile": false
  }
}
```

<!-- payload-example:end -->

---

#### `GET /me/staff-profile`
> Editor/Board xem hồ sơ của mình

**Quyền:** EDITOR, BOARD_MEMBER (Bearer)

**Response 200** (`StaffProfileRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `userId` | string | ✅ | ObjectId của User |
| `role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `specialtyGenres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographics` | enum `Demographic`[] | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `bio` | string | ✅ | Giới thiệu bản thân (text tự do) |
| `yearsOfExperience` | number | ✅ | Số năm kinh nghiệm (0–80) |
| `displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `avatar` | string | ✅ | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `hasProfile` | boolean | ✅ | false = chưa build hồ sơ; field profile = default rỗng |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ProfileNotFound` | profile does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "role": "MANGAKA",
    "specialtyGenres": [
      "ACTION"
    ],
    "demographics": [
      "SHONEN"
    ],
    "bio": "Nội dung mẫu",
    "yearsOfExperience": 0,
    "displayName": "Nguyễn Văn A",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "hasProfile": false
  }
}
```

<!-- payload-example:end -->

---

#### `GET /mangakas/:userId`
> Xem hồ sơ Mangaka công khai (kèm reputation)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Response 200** (`MangakaProfileRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `userId` | string | ✅ | ObjectId của User |
| `penName` | string | ✅ |  |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `experienceLevel` | string | ✅ | Cấp kinh nghiệm |
| `bio` | string | ✅ | Giới thiệu bản thân (text tự do) |
| `portfolioFiles` | string[] | ✅ |  |
| `reputationScore` | number | ✅ | Điểm uy tín Bayesian-weighted |
| `ratingAvg` | number | ✅ | Điểm trung bình đánh giá |
| `ratingCount` | number | ✅ | Số lượt đánh giá |
| `isRecommended` | boolean | ✅ | true = hệ thống gắn nhãn đề xuất (ratingCount ≥ 3 và score ≥ ngưỡng AppConfig) |
| `displayName` | string | — | Tên hiển thị (null = dùng name) |
| `avatar` | string | — | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `hasProfile` | boolean | ✅ | false = user chưa build hồ sơ; field profile = default rỗng |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ProfileNotFound` | profile does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "penName": "Bút danh mẫu",
    "genres": [
      "ACTION"
    ],
    "experienceLevel": "string",
    "bio": "Nội dung mẫu",
    "portfolioFiles": [
      "uploads/507f1f77bcf86cd799439011/anh.png"
    ],
    "reputationScore": 0,
    "ratingAvg": 0,
    "ratingCount": 1,
    "isRecommended": false,
    "displayName": "Nguyễn Văn A",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "hasProfile": false
  }
}
```

<!-- payload-example:end -->

---

#### `GET /assistants/:userId`
> Xem hồ sơ Assistant công khai (danh bạ; kèm reputation/availability)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Response 200** (`AssistantProfileRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `userId` | string | ✅ | ObjectId của User |
| `specializations` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `experienceLevel` | string | ✅ | Cấp kinh nghiệm |
| `portfolioFiles` | string[] | ✅ |  |
| `availabilityStatus` | enum `AvailabilityStatus` | ✅ | Assistant availability: AVAILABLE, BUSY, ON_LEAVE, UNAVAILABLE |
| `availabilityFrom` | string | ✅ |  |
| `availabilityTo` | string | ✅ |  |
| `reputationScore` | number | ✅ | Điểm uy tín Bayesian-weighted |
| `ratingAvg` | number | ✅ | Điểm trung bình đánh giá |
| `ratingCount` | number | ✅ | Số lượt đánh giá |
| `isRecommended` | boolean | ✅ | true = hệ thống gắn nhãn đề xuất (ratingCount ≥ 3 và score ≥ ngưỡng AppConfig) |
| `displayName` | string | — | Tên hiển thị (null = dùng name) |
| `avatar` | string | — | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `hasProfile` | boolean | ✅ | false = user chưa build hồ sơ; field profile = default rỗng |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ProfileNotFound` | profile does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "specializations": [
      "BACKGROUND"
    ],
    "experienceLevel": "string",
    "portfolioFiles": [
      "uploads/507f1f77bcf86cd799439011/anh.png"
    ],
    "availabilityStatus": "AVAILABLE",
    "availabilityFrom": "string",
    "availabilityTo": "string",
    "reputationScore": 0,
    "ratingAvg": 0,
    "ratingCount": 1,
    "isRecommended": false,
    "displayName": "Nguyễn Văn A",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "hasProfile": false
  }
}
```

<!-- payload-example:end -->

---

#### `GET /staff/:userId`
> Xem hồ sơ Editor/Board công khai (ẩn email/phone)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Response 200** (`StaffProfileRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `userId` | string | ✅ | ObjectId của User |
| `role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `specialtyGenres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographics` | enum `Demographic`[] | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `bio` | string | ✅ | Giới thiệu bản thân (text tự do) |
| `yearsOfExperience` | number | ✅ | Số năm kinh nghiệm (0–80) |
| `displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `avatar` | string | ✅ | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `hasProfile` | boolean | ✅ | false = chưa build hồ sơ; field profile = default rỗng |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ProfileNotFound` | profile does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "role": "MANGAKA",
    "specialtyGenres": [
      "ACTION"
    ],
    "demographics": [
      "SHONEN"
    ],
    "bio": "Nội dung mẫu",
    "yearsOfExperience": 0,
    "displayName": "Nguyễn Văn A",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "hasProfile": false
  }
}
```

<!-- payload-example:end -->

---

#### `POST /admin/users`
> Super Admin tạo Editor/Board → status=ACTIVE, registrationType=ADMIN_CREATED, mật khẩu tạm

**Quyền:** SUPER_ADMIN (Bearer)

**Body** (`AdminCreateUserBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `email` | string (regex) ✍ | ✅ | Email đăng nhập |
| `name` | string (2..100 ký tự) ✍ | ✅ | Tên |
| `phoneNumber` | string (regex) ✍ | ✅ | E.164 format, e.g. +84912345678 |
| `roleCode` | enum `RoleCode` | ✅ | Allowed role codes: EDITOR, BOARD_MEMBER |

**Response 201** (`AdminCreateUserRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `email` | string | ✅ | Email đăng nhập |
| `roleCode` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `temporaryPassword` | string | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 409 | `Error.EmailAlreadyExists` | email is already used |
| 422 | — | Validation (roleCode chỉ EDITOR/BOARD_MEMBER) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "email": "user@example.com",
  "name": "Nguyễn Văn A",
  "phoneNumber": "+84912345678",
  "roleCode": "EDITOR"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "roleCode": "MANGAKA",
    "temporaryPassword": "Password123"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /admin/users`
> Super Admin liệt kê user (filter roleCode/status/search, phân trang, ẩn chính mình + soft-deleted)

**Quyền:** SUPER_ADMIN (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `roleCode` | enum `RoleCode` | — | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `status` | enum `UserStatus` | — | User lifecycle status: INACTIVE, ACTIVE, BANNED, BLOCKED |
| `search` | string (1..200 ký tự) | — |  |
| `limit` | integer (≥ 0, ≤ 100) | — | Số bản ghi mỗi trang (default: `20`) |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (phân trang) (default: `0`) |
| `includeDeleted` | enum(true, false) | — |  |

**Response 200** (`AdminUserListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].email` | string | ✅ | Email đăng nhập |
| `items[].name` | string | ✅ | Tên |
| `items[].displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `items[].phoneNumber` | string | ✅ | Số điện thoại E.164 (vd +849xxxxxxxx) |
| `items[].avatar` | string | ✅ | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `items[].role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `items[].status` | enum `UserStatus` | ✅ | User lifecycle status: INACTIVE, ACTIVE, BANNED, BLOCKED |
| `items[].emailVerified` | boolean | ✅ | true = đã xác thực email |
| `items[].registrationType` | enum `RegistrationType` | ✅ | How the account was created: SELF_REGISTERED or ADMIN_CREATED |
| `items[].mustChangePassword` | boolean | ✅ | true = bị chặn mọi route nghiệp vụ tới khi đổi mật khẩu |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |
| `total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `limit` | number | ✅ | Số bản ghi mỗi trang |
| `offset` | number | ✅ | Số bản ghi bỏ qua (phân trang) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "email": "user@example.com",
        "name": "Nguyễn Văn A",
        "displayName": "Nguyễn Văn A",
        "phoneNumber": "+84912345678",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
        "role": "MANGAKA",
        "status": "INACTIVE",
        "emailVerified": false,
        "registrationType": "SELF_REGISTERED",
        "mustChangePassword": false,
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    ],
    "total": 1,
    "limit": 1,
    "offset": 1
  }
}
```

<!-- payload-example:end -->

---

#### `GET /admin/users/:id`
> Super Admin xem chi tiết 1 user

**Quyền:** SUPER_ADMIN (Bearer)

**Response 200** (`AdminUserRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `email` | string | ✅ | Email đăng nhập |
| `name` | string | ✅ | Tên |
| `displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `phoneNumber` | string | ✅ | Số điện thoại E.164 (vd +849xxxxxxxx) |
| `avatar` | string | ✅ | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `status` | enum `UserStatus` | ✅ | User lifecycle status: INACTIVE, ACTIVE, BANNED, BLOCKED |
| `emailVerified` | boolean | ✅ | true = đã xác thực email |
| `registrationType` | enum `RegistrationType` | ✅ | How the account was created: SELF_REGISTERED or ADMIN_CREATED |
| `mustChangePassword` | boolean | ✅ | true = bị chặn mọi route nghiệp vụ tới khi đổi mật khẩu |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.UserNotFound` | user does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "Nguyễn Văn A",
    "displayName": "Nguyễn Văn A",
    "phoneNumber": "+84912345678",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "role": "MANGAKA",
    "status": "INACTIVE",
    "emailVerified": false,
    "registrationType": "SELF_REGISTERED",
    "mustChangePassword": false,
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /admin/users/:id/status`
> Super Admin ban/block/unban user (ACTIVE/BANNED/BLOCKED) — phạt thì revoke refresh + notify

**Quyền:** SUPER_ADMIN (Bearer)

**Body** (`AdminUpdateUserStatusBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `status` | enum `UserStatus` | ✅ | Allowed status changes: ACTIVE, BANNED, BLOCKED. INACTIVE is not allowed (pre-verify state). |
| `reason` | string (1..∞ ký tự) ✍ | — | Ban/block reason — included in the notification sent to the user |

**Response 200** (`AdminUserRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `email` | string | ✅ | Email đăng nhập |
| `name` | string | ✅ | Tên |
| `displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `phoneNumber` | string | ✅ | Số điện thoại E.164 (vd +849xxxxxxxx) |
| `avatar` | string | ✅ | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `status` | enum `UserStatus` | ✅ | User lifecycle status: INACTIVE, ACTIVE, BANNED, BLOCKED |
| `emailVerified` | boolean | ✅ | true = đã xác thực email |
| `registrationType` | enum `RegistrationType` | ✅ | How the account was created: SELF_REGISTERED or ADMIN_CREATED |
| `mustChangePassword` | boolean | ✅ | true = bị chặn mọi route nghiệp vụ tới khi đổi mật khẩu |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.UserNotFound` | user does not exist |
| 422 | — | Error.CannotModifyAdminUser (id) - super admin users cannot be modified by admin moderation routes

Validation fail (status không nhận INACTIVE) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "status": "ACTIVE",
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "Nguyễn Văn A",
    "displayName": "Nguyễn Văn A",
    "phoneNumber": "+84912345678",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "role": "MANGAKA",
    "status": "INACTIVE",
    "emailVerified": false,
    "registrationType": "SELF_REGISTERED",
    "mustChangePassword": false,
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `DELETE /admin/users/:id`
> Super Admin xóa mềm user (set deletedAt) + thu hồi toàn bộ refresh token

**Quyền:** SUPER_ADMIN (Bearer)

**Response 200** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.UserNotFound` | user does not exist |
| 409 | `Error.UserAlreadyDeleted` | user has already been soft-deleted |
| 422 | `Error.CannotModifyAdminUser` | super admin users cannot be modified by admin moderation routes |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /admin/users/:id/restore`
> Super Admin khôi phục user đã xóa mềm (unset deletedAt — về absent)

**Quyền:** SUPER_ADMIN (Bearer)

**Response 201** (`AdminUserRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `email` | string | ✅ | Email đăng nhập |
| `name` | string | ✅ | Tên |
| `displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `phoneNumber` | string | ✅ | Số điện thoại E.164 (vd +849xxxxxxxx) |
| `avatar` | string | ✅ | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `role` | enum `RoleCode` | ✅ | Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `status` | enum `UserStatus` | ✅ | User lifecycle status: INACTIVE, ACTIVE, BANNED, BLOCKED |
| `emailVerified` | boolean | ✅ | true = đã xác thực email |
| `registrationType` | enum `RegistrationType` | ✅ | How the account was created: SELF_REGISTERED or ADMIN_CREATED |
| `mustChangePassword` | boolean | ✅ | true = bị chặn mọi route nghiệp vụ tới khi đổi mật khẩu |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.UserNotFound` | user does not exist |
| 409 | `Error.UserNotDeleted` | user is not soft-deleted |
| 422 | `Error.CannotModifyAdminUser` | super admin users cannot be modified by admin moderation routes |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "Nguyễn Văn A",
    "displayName": "Nguyễn Văn A",
    "phoneNumber": "+84912345678",
    "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
    "role": "MANGAKA",
    "status": "INACTIVE",
    "emailVerified": false,
    "registrationType": "SELF_REGISTERED",
    "mustChangePassword": false,
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /admin/users/:id/reset-password`
> Super Admin cấp mật khẩu tạm (trả 1 lần) + mustChangePassword + revoke refresh + email best-effort

**Quyền:** SUPER_ADMIN (Bearer)

**Response 201** (`AdminResetPasswordRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `temporaryPassword` | string | ✅ | Returned once only — user is forced to change it on next login |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.UserNotFound` | user does not exist |
| 422 | `Error.CannotModifyAdminUser` | super admin users cannot be modified by admin moderation routes |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "temporaryPassword": "Password123"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /admin/stats`
> Super Admin: số liệu tổng quan users/series/chapters/tasks (groupBy snapshot)

**Quyền:** SUPER_ADMIN (Bearer)

**Response 200** (`AdminStatsRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `users` | object | ✅ |  |
| `users.total` | number | ✅ | Users not soft-deleted |
| `users.deleted` | number | ✅ | Soft-deleted users |
| `users.byStatus` | object | ✅ |  |
| `users.byRole` | object | ✅ |  |
| `series` | object | ✅ |  |
| `series.total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `series.byStatus` | object | ✅ |  |
| `chapters` | object | ✅ |  |
| `chapters.total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `chapters.published` | number | ✅ |  |
| `tasks` | object | ✅ |  |
| `tasks.total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `tasks.byStatus` | object | ✅ |  |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "users": {
      "total": 1,
      "deleted": 0,
      "byStatus": {},
      "byRole": {}
    },
    "series": {
      "total": 1,
      "byStatus": {}
    },
    "chapters": {
      "total": 1,
      "published": 0
    },
    "tasks": {
      "total": 1,
      "byStatus": {}
    }
  }
}
```

<!-- payload-example:end -->

---

## §3. Flow 1 — Series Proposal → Serialization (kèm Board engine)

**Nghiệp vụ:** Mangaka nộp hồ sơ series mới (synopsis + thiết kế nhân vật + **Name chương mẫu**) → hồ sơ vào **hàng đợi review chung** → một Editor **claim** (nhận) → review lặp proposal + Name → khi CẢ HAI được duyệt → Editor **pitch** lên Hội đồng → Board họp phiên, vote (quorum, đa số >50%) → APPROVED = series `SERIALIZED` + được xếp slot (tạp chí, số bắt đầu, weekly/monthly) → tự động mở đường tạo Contract (Flow 6, §4).

**State machine Series:** `DRAFT → IN_REVIEW → READY_TO_PITCH → PITCHED → SERIALIZED`; nhánh mở lại: `ABANDONED|WITHDRAWN → DRAFT`, `REJECTED → IN_REVIEW|WITHDRAWN|ABANDONED`. Lịch sử status/Board Decision cũ được giữ nguyên qua mọi vòng.

### Happy path

1. **Mangaka** `POST /series/proposals` → Series `DRAFT` + proposal + Name mẫu (`kind=PROPOSAL`). Sửa: `PUT /series/proposals/:id`; xoá nháp: `DELETE /series/proposals/:id`.
2. **Mangaka** `POST /series/:id/submit` → Series `IN_REVIEW`, proposal `PROPOSAL_REVIEW`, Name `SUBMITTED` — vào hàng đợi (Editor thấy qua `GET /series` — hàng đợi = series IN_REVIEW chưa có editor).
3. **Editor** `POST /series/:id/claim` → thành Editor phụ trách (atomic — nhiều Editor bấm cùng lúc chỉ 1 người thắng). Chưa bắt đầu review thì được `POST /series/:id/release` nhả về hàng đợi.
4. **Vòng review proposal:** Editor `POST /series/:id/proposal/request-revision` (kèm lý do) → Mangaka sửa (`PUT /series/proposals/:id`) → `POST /series/:id/proposal/resubmit` → ... → Editor `POST /series/:id/proposal/approve`.
5. **Vòng review Name mẫu** (route series-scoped — CHỈ proposal-Name): Editor `POST /series/:id/names/:nameId/request-revision` → Mangaka sửa trang (`PUT .../pages` thay toàn bộ hoặc `POST .../pages` thêm 1 trang) → `POST .../resubmit` (version++) → Editor `POST .../approve`.
6. Proposal APPROVED **và** Name APPROVED → Series tự sang `READY_TO_PITCH`.
7. **Editor** xem gợi ý roster: `GET /board/suggest-members?seriesId=` (chấm điểm theo `specialtyGenres` khớp genres của series, luôn lẻ ≥3) → `POST /board/sessions` (tạo phiên họp — **truyền roster tay HOẶC bỏ trống `allowedEditorIds` + truyền `seriesId` để hệ thống auto-assign**) → phiên tự `ACTIVE` khi tới `startTime` (hoặc `PATCH /board/sessions/:id/start`). Session sinh ra ở **phase `PRESENTING`**.
8. **Editor** `POST /series/:id/pitch` → Series `PITCHED`; mở quyết định `POST /board/decisions` (type `SERIALIZATION`, **`details` BẮT BUỘC đủ slot**: magazine/startIssueNumber/publicationType — thiếu → 422). Editor đính hồ sơ `POST /board/reports`.
9. **🆕 PHÒNG HỌP (Spec 16) — 3 giai đoạn, creator điều khiển:** mọi người trong roster join room WS `/board` (`joinSession` — rejoin lại được vô hạn khi rớt mạng, resync bằng `GET /board/sessions/:id` + `GET .../messages` + `GET /board/decisions?boardSessionId=`):
   - **`PRESENTING`** — Editor trình bày (Board đọc decision details + reports; tra tài liệu cũ của series: `GET /board/reports?seriesId=`).
   - **Creator** `PATCH /board/sessions/:id/phase {phase:'QA'}` → **Q&A**: chat qua WS `sendMessage` → mọi người nhận `messageReceived` (lịch sử lưu DB). Phase forward-only, được nhảy cóc PRESENTING→VOTING nếu không có câu hỏi.
   - **Creator** `PATCH .../phase {phase:'VOTING'}` → room nhận `phaseChanged`; **từ đây CHAT BỊ KHÓA** (DENIED `VOTING_PHASE`) — chỉ vote.
10. **Board members** `POST /board/decisions/:id/vote` (APPROVE/REJECT/ABSTAIN — ⚠ **chỉ được khi phase=`VOTING`**, sớm hơn → 409 `Error.VotingNotOpen`; realtime tiến độ qua `voteProgressUpdated`). **Luật chốt (Spec 17):** quorum = **≥ 2/3 roster** đã bỏ phiếu (`ceil(2/3 × số thành viên roster)`), và **APPROVE > 1/2 roster** (đa số tuyệt đối của cả roster — phiếu ABSTAIN/vắng tính là chưa đồng thuận) → decision `APPROVED` → **hệ thống tự chuyển Series `SERIALIZED` + set slot từ details** → thông báo Mangaka/Editor → Flow 6 bắt đầu. Nếu REJECT đủ chặn (approve không thể quá bán) hoặc cả roster vote xong mà approve chưa quá bán → `REJECTED`. Chưa đủ quorum → `PENDING_QUORUM`; đủ quorum nhưng chưa ngã ngũ → `PENDING` (chờ phiếu tiếp). Vote lại một decision đã `APPROVED`/`REJECTED`/`EXPIRED` → 409 `Error.DecisionAlreadyFinalized` (FE nên disable nút vote khi `result ∉ {PENDING, PENDING_QUORUM}`).
11. Phiên xong → `PATCH /board/sessions/:id/conclude` (hoặc cron auto khi quá `endTime`); decision còn treo → `EXPIRED`, Series giữ `PITCHED` — Editor mở phiên mới + decision mới (KHÔNG cần pitch lại; report cũ tra qua `?seriesId=`).
12. **Mở lại hồ sơ trước pitch:** nếu Editor đã từ chối (`ABANDONED`) hoặc Mangaka đã rút (`WITHDRAWN`), Mangaka `POST /series/:id/reopen` → Series/proposal/proposal-Name về `DRAFT`, bỏ Editor cũ; sau khi sửa, gọi `submit` như bước 2 để trở lại hàng đợi chung và Editor bất kỳ claim.
13. **Re-pitch sau Board reject:** Series `REJECTED` giữ Editor cũ. Editor `POST /series/:id/reopen-review {reason}` → `IN_REVIEW`, proposal `PROPOSAL_REVISION`; Mangaka sửa/resubmit, Editor approve proposal (và có thể mở lại proposal-Name `APPROVED→REVISION`) → `READY_TO_PITCH` → pitch lại và tạo Board Decision mới. Nếu không tiếp tục: Mangaka `withdraw` → `WITHDRAWN`, hoặc Editor `reject` → `ABANDONED`.

### Unhappy cases

| Tình huống | API | Kết quả |
|---|---|---|
| Sửa proposal khi không phải chủ | `PUT /series/proposals/:id` | 403 `Error.NotSeriesOwner` |
| Sửa proposal ngoài trạng thái DRAFT/PROPOSAL_REVISION | `PUT /series/proposals/:id` | 409 `Error.ProposalNotEditable` |
| Xoá proposal khi series đã submit | `DELETE /series/proposals/:id` | 409 `Error.ProposalNotDeletable` |
| Submit khi thiếu điều kiện (đã submit rồi / consent franchise chưa duyệt) | `POST /series/:id/submit` | 409 (`Error.InvalidSeriesTransition` / `Error.FranchiseConsentRequired`) |
| 2 Editor claim cùng lúc | `POST /series/:id/claim` | người sau 409 `Error.SeriesAlreadyClaimed` |
| Release sau khi đã bắt đầu review | `POST /series/:id/release` | 409 `Error.ReviewAlreadyStarted` |
| Editor khác (không phụ trách) review/pitch | mọi action review | 403 `Error.NotAssignedEditor` |
| Duyệt Name sai trạng thái (vd approve khi đang REVISION) | names lifecycle | 409 `Error.InvalidNameState` |
| Gọi route series-Name với chapter-Name | `/series/:id/names/:nameId/*` | 404 `Error.NameNotFound` (tách vai Spec 12 — dùng `/chapters/:id/names/*`) |
| Query `?kind=` trên list Name (contract cũ) | `GET /series/:id/names` | 422 (schema strict — route chỉ còn trả proposal-Name) |
| Name sửa quá nhiều vòng (> `nameMaxReviewRounds`, mặc định 8) | resubmit | vẫn 201 — hệ thống notify cảnh báo Editor (không chặn) |
| Pitch khi chưa READY_TO_PITCH | `POST /series/:id/pitch` | 409 `Error.SeriesNotReadyToPitch` |
| Tạo session: roster chẵn / <3 | `POST /board/sessions` | 422 `Error.InvalidBoardMembers` |
| Tạo session: bỏ trống roster mà không truyền seriesId | `POST /board/sessions` | 422 `Error.RosterSourceRequired` |
| Auto-assign khi hệ thống < 3 BOARD_MEMBER active | sessions / suggest-members | 422 `Error.NotEnoughBoardMembers` |
| Vote khi không thuộc roster phiên | `POST /board/decisions/:id/vote` | 403 (VoterNotAllowed) |
| Vote khi phiên chưa ACTIVE / đã CONCLUDED | vote | 4xx theo trạng thái phiên |
| 🆕 Vote khi phiên ACTIVE nhưng phase chưa `VOTING` (PRESENTING/QA) | `POST /board/decisions/:id/vote` | 409 `Error.VotingNotOpen` |
| 🆕 Vote lại decision đã chốt (APPROVED/REJECTED/EXPIRED) | `POST /board/decisions/:id/vote` | 409 `Error.DecisionAlreadyFinalized` |
| 🆕 Đổi phase khi không phải creator (Super Admin được) | `PATCH /board/sessions/:id/phase` | 403 `Error.NotSessionCreator` |
| 🆕 Đổi phase LÙI hoặc giữ nguyên (chỉ tiến: PRESENTING→QA→VOTING, được nhảy cóc) | `PATCH /board/sessions/:id/phase` | 409 `Error.InvalidPhaseTransition` |
| 🆕 Chat khi phase `VOTING` | WS `sendMessage` | ack `{status:'DENIED', reason:'VOTING_PHASE'}` |
| 🆕 Đọc lịch sử chat khi ngoài roster/creator | `GET /board/sessions/:id/messages` | 403 `Error.NotSessionParticipant` |
| 🆕 Tạo decision SERIALIZATION thiếu slot trong `details` | `POST /board/decisions` | 422 field-level (`details.magazine`...) |
| Phiên bế mạc mà decision chưa đủ quorum | (cron/conclude) | decision → `EXPIRED`, series **giữ `PITCHED`**, Editor được notify mở phiên mới |
| Board REJECT | (kết quả vote) | Series `REJECTED` + statusReason; chờ Editor phụ trách mở rework |
| Mở lại khi không ở ABANDONED/WITHDRAWN | `POST /series/:id/reopen` | 409 `Error.InvalidSeriesTransition` |
| Người không phải chủ mở lại hồ sơ | `POST /series/:id/reopen` | 403 `Error.NotSeriesOwner` |
| Mở rework khi không ở REJECTED | `POST /series/:id/reopen-review` | 409 `Error.InvalidSeriesTransition` |
| Editor khác mở rework | `POST /series/:id/reopen-review` | 403 `Error.NotAssignedEditor` |
| Mangaka gọi route Editor / Editor gọi route Mangaka | hai route reopen | 403 role guard |
| Yêu cầu sửa proposal-Name APPROVED trước khi reopen-review | names request-revision | 409 `Error.InvalidNameState` |
| Yêu cầu sửa chapter-Name APPROVED qua nhánh rework | chapter names request-revision | 409 `Error.InvalidNameState` (guard mới chỉ áp dụng proposal-Name) |
| Editor từ chối hẳn concept | `POST /series/:id/reject` | `IN_REVIEW` hoặc `REJECTED` → Series `ABANDONED` |
| Mangaka rút hồ sơ | `POST /series/:id/withdraw` | có thể rút thêm ở `REJECTED` → Series `WITHDRAWN` |
| Xem series ngoài scope (Mangaka xem series người khác) | `GET /series/:id` | 403 `Error.SeriesAccessDenied` |

> **Scope đọc `GET /series`:** MANGAKA → của mình · EDITOR → mình phụ trách + hàng đợi (IN_REVIEW chưa ai claim) · BOARD/SUPER_ADMIN → tất cả (ẩn DRAFT/WITHDRAWN) · ASSISTANT → không có quyền.

### API Reference

#### `POST /series/proposals`
> Mangaka tạo proposal mới (Series DRAFT + SeriesProposal + Name chương mẫu)

**Quyền:** MANGAKA (Bearer)

**Body** (`CreateProposalBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `title` | string (1..200 ký tự) ✍ | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string (1..∞ ký tự) ✍ | — | Object key ảnh bìa trên R2 |
| `genres` | enum `Genre`[] | — | Manga genre (mảng, nhiều thể loại / series) (default: `[]`) |
| `demographic` | enum `Demographic` | — | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | — | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `synopsis` | string (0..5000 ký tự) ✍ | — | Tóm tắt cốt truyện |
| `characterDesigns` | string[] ✍ | — | Danh sách object key file thiết kế nhân vật trên R2 (default: `[]`) |
| `estimatedLength` | integer (≥ 1) ✍ | — | Ước tính số chương của series |
| `namePages` | object[] | — | Các trang storyboard Name (default: `[]`) |
| `namePages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `namePages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `parentSeriesId` | string ✍ | — | ObjectId series gốc (franchise — Flow 12) |
| `relationshipType` | enum `RelationshipType` | — | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |

**Response 201** (`CreateProposalRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `series` | object | ✅ |  |
| `series.id` | string | ✅ | ObjectId của bản ghi |
| `series.mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `series.editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `series.coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `series.parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `series.title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `series.coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `series.genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `series.demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `series.publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `series.magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `series.startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `series.status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `series.statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `series.relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `series.franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `series.createdAt` | string | ✅ | ISO 8601 |
| `series.reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `series.completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `series.proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `name` | object | ✅ | Tên |
| `name.id` | string | ✅ | ObjectId của bản ghi |
| `name.seriesId` | string | ✅ | ObjectId của Series |
| `name.chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal |
| `name.kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `name.status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `name.version` | number | ✅ | Tăng mỗi lần resubmit |
| `name.submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |
| `name.pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 422 | `Error.ParentSeriesNotFound` | parent series does not exist |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "title": "Tiêu đề mẫu",
  "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
  "genres": [
    "ACTION"
  ],
  "demographic": "SHONEN",
  "publicationType": "WEEKLY",
  "synopsis": "Nội dung mẫu",
  "characterDesigns": [
    "string"
  ],
  "estimatedLength": 1,
  "namePages": [
    {
      "pageNumber": 1,
      "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  ],
  "parentSeriesId": "507f1f77bcf86cd799439011",
  "relationshipType": "SEQUEL"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "mangakaId": "507f1f77bcf86cd799439011",
      "editorId": "507f1f77bcf86cd799439011",
      "mangaka": {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      },
      "editor": {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      },
      "coOwnerId": "507f1f77bcf86cd799439011",
      "parentSeriesId": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu",
      "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
      "genres": [
        "ACTION"
      ],
      "demographic": "SHONEN",
      "publicationType": "WEEKLY",
      "magazine": "string",
      "startIssueNumber": 1,
      "status": "DRAFT",
      "statusReason": "Nội dung mẫu",
      "relationshipType": "SEQUEL",
      "franchiseConsentStatus": "PENDING",
      "createdAt": "2026-07-20T09:30:00.000Z",
      "reviewStartedAt": "2026-07-20T09:30:00.000Z",
      "completionProposal": {
        "proposedByRole": "string",
        "proposedById": "507f1f77bcf86cd799439011",
        "reason": "Nội dung mẫu",
        "proposedEndingChapters": 0,
        "proposedAt": "2026-07-20T09:30:00.000Z"
      },
      "proposal": {
        "nameId": "507f1f77bcf86cd799439011",
        "synopsis": "Nội dung mẫu",
        "characterDesigns": [
          "string"
        ],
        "estimatedLength": 0,
        "status": "DRAFT",
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    },
    "name": {
      "id": "507f1f77bcf86cd799439011",
      "seriesId": "507f1f77bcf86cd799439011",
      "chapterNumber": 1,
      "kind": "PROPOSAL",
      "status": "DRAFT",
      "version": 1,
      "submittedAt": "2026-07-20T09:30:00.000Z",
      "pages": [
        {
          "pageNumber": 1,
          "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PUT /series/proposals/:id`
> Mangaka sửa proposal (partial-update; chỉ DRAFT/PROPOSAL_REVISION; KHÔNG nhận namePages)

**Quyền:** MANGAKA (Bearer)

**Body** (`UpdateProposalBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `title` | string (1..200 ký tự) ✍ | — | Tiêu đề (FE tự nhập) |
| `coverImage` | string (1..∞ ký tự) ✍ | — | Object key ảnh bìa trên R2 |
| `genres` | enum `Genre`[] | — | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | — | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | — | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `synopsis` | string (0..5000 ký tự) ✍ | — | Tóm tắt cốt truyện |
| `characterDesigns` | string[] ✍ | — | Danh sách object key file thiết kế nhân vật trên R2 |
| `estimatedLength` | integer (≥ 1) ✍ | — | Ước tính số chương của series |

**Response 200** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.ProposalNotEditable` | proposal cannot be edited in current state |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "title": "Tiêu đề mẫu",
  "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
  "genres": [
    "ACTION"
  ],
  "demographic": "SHONEN",
  "publicationType": "WEEKLY",
  "synopsis": "Nội dung mẫu",
  "characterDesigns": [
    "string"
  ],
  "estimatedLength": 1
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `DELETE /series/proposals/:id`
> Mangaka xoá hẳn draft tạo nhầm (chỉ khi Series=DRAFT). Trả message.

**Quyền:** MANGAKA (Bearer)

**Response 200** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.ProposalNotDeletable` | proposal cannot be deleted in current state |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /series`
> Danh sách series theo scope vai trò (Mangaka=của mình; Editor=phụ trách+hàng đợi; Board/Admin=tất cả)

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `status` | enum `SeriesStatus` | — | Series state machine status |
| `limit` | integer (≥ 0, ≤ 100) | — | Số bản ghi mỗi trang (default: `20`) |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (phân trang) (default: `0`) |

**Response 200** (`SeriesListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `items[].editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `items[].mangaka` | `UserMini` | ✅ | `{id, displayName, avatar}` của chủ series; chỉ có ở `GET /series` và `GET /series/:id` |
| `items[].editor` | `UserMini` | ✅ | `{id, displayName, avatar}` của Editor; `null` khi chưa claim; chỉ có ở hai read route |
| `items[].coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `items[].parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `items[].title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `items[].coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `items[].genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `items[].demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `items[].publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `items[].magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `items[].startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `items[].status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `items[].statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `items[].relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `items[].franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `items[].createdAt` | string | ✅ | ISO 8601 |
| `items[].reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `items[].completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `items[].proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `limit` | number | ✅ | Số bản ghi mỗi trang |
| `offset` | number | ✅ | Số bản ghi bỏ qua (phân trang) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "mangakaId": "507f1f77bcf86cd799439011",
        "editorId": "507f1f77bcf86cd799439011",
        "mangaka": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "editor": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "coOwnerId": "507f1f77bcf86cd799439011",
        "parentSeriesId": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
        "genres": [
          "ACTION"
        ],
        "demographic": "SHONEN",
        "publicationType": "WEEKLY",
        "magazine": "string",
        "startIssueNumber": 1,
        "status": "DRAFT",
        "statusReason": "Nội dung mẫu",
        "relationshipType": "SEQUEL",
        "franchiseConsentStatus": "PENDING",
        "createdAt": "2026-07-20T09:30:00.000Z",
        "reviewStartedAt": "2026-07-20T09:30:00.000Z",
        "completionProposal": {
          "proposedByRole": "string",
          "proposedById": "507f1f77bcf86cd799439011",
          "reason": "Nội dung mẫu",
          "proposedEndingChapters": 0,
          "proposedAt": "2026-07-20T09:30:00.000Z"
        },
        "proposal": {
          "nameId": "507f1f77bcf86cd799439011",
          "synopsis": "Nội dung mẫu",
          "characterDesigns": [
            "string"
          ],
          "estimatedLength": 0,
          "status": "DRAFT",
          "createdAt": "2026-07-20T09:30:00.000Z"
        }
      }
    ],
    "total": 1,
    "limit": 1,
    "offset": 1
  }
}
```

<!-- payload-example:end -->

---

#### `GET /series/:id`
> Chi tiết 1 series (kèm proposal)

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Response 200** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `mangaka` | `UserMini` | ✅ | `{id, displayName, avatar}` của chủ series; `displayName` đã fallback sang `name` |
| `editor` | `UserMini` | ✅ | `{id, displayName, avatar}` của Editor; `null` khi series chưa được claim |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | current user cannot access this series |
| 404 | `Error.SeriesNotFound` | series does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /series/:id`
> Sửa metadata trình bày của series sau khi tạo proposal, kể cả khi đang SERIALIZED; không đổi state machine hoặc field do Board sở hữu

**Quyền:** MANGAKA chủ series hoặc EDITOR đang phụ trách (Bearer)

**Body** (`UpdateSeriesMetadataBody` — partial update, `.strict()`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `title` | string (1..200 ký tự) ✍ | — | Omit = giữ nguyên |
| `coverImage` | string ✍ | — | Object key R2; omit/null = giữ nguyên, `''` = xoá ảnh bìa |
| `synopsis` | string (0..5000 ký tự) ✍ | — | Omit/null = giữ nguyên, `''` = xoá synopsis |
| `characterDesigns` | string[] ✍ | — | Object key R2; omit/null = giữ nguyên, `[]` = xoá hết |

`genres`, `demographic`, `publicationType`, slot xuất bản và mọi field ngoài allowlist không được nhận; gửi field lạ → 422. Series ở `COMPLETED`, `CANCELLED`, `ABANDONED`, `WITHDRAWN` hoặc `REJECTED` là hồ sơ đã đóng → không sửa được. Cập nhật idempotent; body không làm thay đổi dữ liệu trả 200 nhưng không phát audit/notification mới.

**Response 200:** `SeriesRes` — cùng shape `GET /series/:id`.

Khi có thay đổi thật, BE ghi audit `METADATA_UPDATED` và notify best-effort cho phía còn lại bằng `referenceType=SERIES_METADATA_UPDATED`. Ghi composite proposal dùng optimistic CAS có guard quyền + trạng thái ngay tại write để tránh lost update/TOCTOU khi có request cạnh tranh.

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | caller không phải Mangaka chủ hoặc Editor đang phụ trách, kể cả Editor vừa bị reassign trước lúc ghi |
| 404 | `Error.SeriesNotFound` | series không tồn tại hoặc id không hợp lệ |
| 409 | `Error.SeriesNotEditable` | series đã ở trạng thái terminal |
| 409 | `Error.SeriesMetadataConflict` | metadata bị cập nhật cạnh tranh quá số lần CAS retry; reload series mới nhất rồi gửi lại PATCH |
| 422 | — | body sai kiểu hoặc có field ngoài allowlist |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "title": "Tiêu đề mẫu",
  "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
  "synopsis": "Nội dung mẫu",
  "characterDesigns": [
    "string"
  ]
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/submit`
> Mangaka submit → mở 2 vòng review (proposal+Name), Series DRAFT→IN_REVIEW

**Quyền:** MANGAKA (Bearer)

**Response 201** (`CreateProposalRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `series` | object | ✅ |  |
| `series.id` | string | ✅ | ObjectId của bản ghi |
| `series.mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `series.editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `series.coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `series.parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `series.title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `series.coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `series.genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `series.demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `series.publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `series.magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `series.startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `series.status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `series.statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `series.relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `series.franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `series.createdAt` | string | ✅ | ISO 8601 |
| `series.reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `series.completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `series.proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `name` | object | ✅ | Tên |
| `name.id` | string | ✅ | ObjectId của bản ghi |
| `name.seriesId` | string | ✅ | ObjectId của Series |
| `name.chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal |
| `name.kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `name.status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `name.version` | number | ✅ | Tăng mỗi lần resubmit |
| `name.submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |
| `name.pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.InvalidProposalState` | proposal state does not allow this action |
| 409 | `Error.FranchiseConsentRequired` | derivative needs original mangaka consent (APPROVED) before submit |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "mangakaId": "507f1f77bcf86cd799439011",
      "editorId": "507f1f77bcf86cd799439011",
      "mangaka": {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      },
      "editor": {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      },
      "coOwnerId": "507f1f77bcf86cd799439011",
      "parentSeriesId": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu",
      "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
      "genres": [
        "ACTION"
      ],
      "demographic": "SHONEN",
      "publicationType": "WEEKLY",
      "magazine": "string",
      "startIssueNumber": 1,
      "status": "DRAFT",
      "statusReason": "Nội dung mẫu",
      "relationshipType": "SEQUEL",
      "franchiseConsentStatus": "PENDING",
      "createdAt": "2026-07-20T09:30:00.000Z",
      "reviewStartedAt": "2026-07-20T09:30:00.000Z",
      "completionProposal": {
        "proposedByRole": "string",
        "proposedById": "507f1f77bcf86cd799439011",
        "reason": "Nội dung mẫu",
        "proposedEndingChapters": 0,
        "proposedAt": "2026-07-20T09:30:00.000Z"
      },
      "proposal": {
        "nameId": "507f1f77bcf86cd799439011",
        "synopsis": "Nội dung mẫu",
        "characterDesigns": [
          "string"
        ],
        "estimatedLength": 0,
        "status": "DRAFT",
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    },
    "name": {
      "id": "507f1f77bcf86cd799439011",
      "seriesId": "507f1f77bcf86cd799439011",
      "chapterNumber": 1,
      "kind": "PROPOSAL",
      "status": "DRAFT",
      "version": 1,
      "submittedAt": "2026-07-20T09:30:00.000Z",
      "pages": [
        {
          "pageNumber": 1,
          "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/claim`
> Editor nhận series từ hàng đợi (atomic chống race; set editorId)

**Quyền:** EDITOR (Bearer)

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.SeriesAlreadyClaimed` | series has already been claimed |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/release`
> Editor nhả series về hàng đợi (chỉ khi chưa bắt đầu review)

**Quyền:** EDITOR (Bearer)

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.ReviewAlreadyStarted` | review has already started |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/proposal/request-revision`
> Editor phụ trách yêu cầu sửa proposal (→ PROPOSAL_REVISION). Set reviewStartedAt.

**Quyền:** EDITOR (Bearer)

**Body** (`ReasonBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..1000 ký tự) ✍ | ✅ | Lý do bắt buộc; được lưu vào lịch sử RevisionRequest và hiển thị cho bên phải sửa |

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.InvalidProposalState` | proposal state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/proposal/resubmit`
> Mangaka nộp lại proposal sau revision (→ PROPOSAL_REVIEW)

**Quyền:** MANGAKA (Bearer)

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 409 | `Error.InvalidProposalState` | proposal state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/proposal/approve`
> Editor duyệt proposal (→ PROPOSAL_APPROVED; nếu Name cũng APPROVED → READY_TO_PITCH)

**Quyền:** EDITOR (Bearer)

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.InvalidProposalState` | proposal state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /series/:id/names`
> List proposal-Name của series (chapter-Name xem ở /chapters/:id/names)

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `limit` | integer (≥ 0, ≤ 100) | — | Số bản ghi mỗi trang (default: `20`) |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (phân trang) (default: `0`) |

**Response 200** (`NameListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].seriesId` | string | ✅ | ObjectId của Series |
| `items[].chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `items[].chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `items[].kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `items[].status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `items[].version` | number | ✅ | Tăng mỗi lần resubmit |
| `items[].pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `items[].submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | current user cannot access this series |
| 404 | `Error.SeriesNotFound` | series does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "chapterId": "507f1f77bcf86cd799439011",
        "chapterNumber": 1,
        "kind": "PROPOSAL",
        "status": "DRAFT",
        "version": 1,
        "pages": [
          {
            "pageNumber": 1,
            "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
          }
        ],
        "submittedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /series/:id/names/:nameId`
> Chi tiết 1 Name

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Response 200** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | current user cannot access this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 404 | `Error.NameNotFound` | name does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/names/:nameId/request-revision`
> Editor phụ trách yêu cầu sửa Name → REVISION

**Quyền:** EDITOR (Bearer)

**Body** (`ReasonBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (0..1000 ký tự) ✍ | — | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 201** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.InvalidNameState` | name state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/names/:nameId/resubmit`
> Mangaka nộp lại Name sau revision → IN_REVIEW, version++

**Quyền:** MANGAKA (Bearer)

**Response 201** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 409 | `Error.InvalidNameState` | name state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/names/:nameId/approve`
> Editor duyệt Name → APPROVED (proposal-Name → emit → Series READY_TO_PITCH)

**Quyền:** EDITOR (Bearer)

**Response 201** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.InvalidNameState` | name state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PUT /series/:id/names/:nameId/pages`
> Mangaka thay TOÀN BỘ trang Name (chỉ DRAFT/REVISION)

**Quyền:** MANGAKA (Bearer)

**Body** (`UpdateNamePagesBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `pages` | object[] | ✅ |  |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |

**Response 200** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.InvalidNameState` | name state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "pages": [
    {
      "pageNumber": 1,
      "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  ]
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/names/:nameId/pages`
> Mangaka thêm 1 trang Name (append; chỉ DRAFT/REVISION)

**Quyền:** MANGAKA (Bearer)

**Body** (`AddNamePageBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `pageNumber` | integer (≥ 1) ✍ | ✅ | Số thứ tự trang trong chương |
| `fileUrl` | string (1..∞ ký tự) ✍ | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |

**Response 201** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.InvalidNameState` | name state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "pageNumber": 1,
  "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/reject`
> Editor từ chối hẳn concept (Series → ABANDONED + statusReason)

**Quyền:** EDITOR (Bearer)

**Body** (`ReasonBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (0..1000 ký tự) ✍ | — | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.InvalidProposalState` | proposal state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/withdraw`
> Mangaka rút hồ sơ (Series → WITHDRAWN + statusReason)

**Quyền:** MANGAKA (Bearer)

**Body** (`ReasonBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (0..1000 ký tự) ✍ | — | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.SeriesNotFound` | series does not exist |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/reopen`
> Mangaka mở lại hồ sơ `ABANDONED`/`WITHDRAWN`: Series + proposal + proposal-Name về `DRAFT`, bỏ Editor cũ để lần submit sau quay về hàng đợi chung

**Quyền:** MANGAKA (Bearer)

**Body:** không có.

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của Series |
| `mangakaId` | string | ✅ | Chủ sở hữu gọi reopen |
| `editorId` | string | ✅ | `null` sau reopen; raw Mongo đã unset field để lọt hàng đợi claim |
| `mangaka` / `editor` | `UserMini` | — | Embed optional; mutation có thể không trả — refetch `GET /series/:id` khi cần render |
| `coOwnerId` | string | ✅ | Đồng sở hữu; null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc; null nếu không phải franchise |
| `title` | string | ✅ | Tên series |
| `coverImage` | string | ✅ | Object key ảnh bìa; null nếu chưa có |
| `genres` | enum `Genre`[] | ✅ | Danh sách thể loại |
| `demographic` | enum `Demographic` | ✅ | Phân khúc; null nếu chưa chọn |
| `publicationType` | enum `PublicationType` | ✅ | Nhịp phát hành; null nếu chưa chọn |
| `magazine` | string | ✅ | Slot tạp chí; null trước SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ bắt đầu; null trước SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Luôn `DRAFT` khi thành công |
| `statusReason` | string | ✅ | Lý do status gần nhất; có thể null |
| `relationshipType` | enum `RelationshipType` | ✅ | Quan hệ franchise; null nếu không có |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Trạng thái consent; null nếu không áp dụng |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | `null` sau reopen |
| `completionProposal` | object | ✅ | Đề xuất kết thúc; null nếu chưa có |
| `completionProposal.proposedByRole` | string | ✅ | `MANGAKA\|EDITOR` khi completionProposal có mặt |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc; nullable |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Proposal embedded; không null với flow này |
| `proposal.nameId` | string | ✅ | Id proposal-Name được reset về `DRAFT` |
| `proposal.synopsis` | string | ✅ | Tóm tắt; nullable |
| `proposal.characterDesigns` | string[] | ✅ | Object keys thiết kế nhân vật |
| `proposal.estimatedLength` | number | ✅ | Số chương dự kiến; nullable |
| `proposal.status` | enum `ProposalStatus` | ✅ | Luôn `DRAFT` khi thành công |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | Mangaka không phải chủ sở hữu series |
| 403 | `You do not have permission to access this resource` | Token không có role MANGAKA (security code legacy — xem §0) |
| 404 | `Error.SeriesNotFound` | Series không tồn tại hoặc id không hợp lệ |
| 409 | `Error.InvalidSeriesTransition` | Series không ở `ABANDONED`/`WITHDRAWN` |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/reopen-review`
> Editor phụ trách mở lại vòng chỉnh sửa sau khi Board reject: `REJECTED→IN_REVIEW`, giữ Editor/mốc review và đưa proposal về `PROPOSAL_REVISION`

**Quyền:** EDITOR (Bearer)

**Body** (`ReasonBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..1000 ký tự) ✍ | ✅ | Lý do mở lại vòng rework, hiển thị cho Mangaka |

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của Series |
| `mangakaId` | string | ✅ | Chủ sở hữu được notify |
| `editorId` | string | ✅ | Giữ nguyên Editor phụ trách |
| `mangaka` / `editor` | `UserMini` | — | Embed optional; mutation có thể không trả — refetch `GET /series/:id` khi cần render |
| `coOwnerId` | string | ✅ | Đồng sở hữu; null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc; null nếu không phải franchise |
| `title` | string | ✅ | Tên series |
| `coverImage` | string | ✅ | Object key ảnh bìa; null nếu chưa có |
| `genres` | enum `Genre`[] | ✅ | Danh sách thể loại |
| `demographic` | enum `Demographic` | ✅ | Phân khúc; null nếu chưa chọn |
| `publicationType` | enum `PublicationType` | ✅ | Nhịp phát hành; null nếu chưa chọn |
| `magazine` | string | ✅ | Slot tạp chí; null trước SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ bắt đầu; null trước SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Luôn `IN_REVIEW` khi thành công |
| `statusReason` | string | ✅ | Lý do reopen-review vừa ghi; có thể null theo contract |
| `relationshipType` | enum `RelationshipType` | ✅ | Quan hệ franchise; null nếu không có |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Trạng thái consent; null nếu không áp dụng |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Giữ nguyên mốc đã bắt đầu review |
| `completionProposal` | object | ✅ | Đề xuất kết thúc; null nếu chưa có |
| `completionProposal.proposedByRole` | string | ✅ | `MANGAKA\|EDITOR` khi completionProposal có mặt |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc; nullable |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Proposal embedded; không null với flow này |
| `proposal.nameId` | string | ✅ | Id proposal-Name; Name giữ `APPROVED` tới khi Editor yêu cầu sửa |
| `proposal.synopsis` | string | ✅ | Tóm tắt; nullable |
| `proposal.characterDesigns` | string[] | ✅ | Object keys thiết kế nhân vật |
| `proposal.estimatedLength` | number | ✅ | Số chương dự kiến; nullable |
| `proposal.status` | enum `ProposalStatus` | ✅ | Luôn `PROPOSAL_REVISION` khi thành công |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | Caller không phải Editor đang phụ trách series |
| 403 | `You do not have permission to access this resource` | Token không có role EDITOR (security code legacy — xem §0) |
| 404 | `Error.SeriesNotFound` | Series không tồn tại hoặc id không hợp lệ |
| 409 | `Error.InvalidSeriesTransition` | Series không ở `REJECTED` |
| 422 | `Error.ValidationFailed` | Thiếu/rỗng `reason`, quá 1000 ký tự hoặc body có field lạ |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/pitch`
> Editor pitch series lên Board (Series → PITCHED, gọi B5)

**Quyền:** EDITOR (Bearer)

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.SeriesNotReadyToPitch` | series is not ready to pitch |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /board/suggest-members`
> Gợi ý roster Board theo thể loại của series (PB-05) — lẻ, >= 3

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `seriesId` | string (regex) | ✅ | ObjectId của Series |
| `size` | integer (≥ 3) | — |  |

**Response 200** (`SuggestBoardMembersRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].userId` | string | ✅ | ObjectId của User |
| `items[].displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `items[].avatar` | string | ✅ | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `items[].specialtyGenres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `items[].matchedGenres` | enum `Genre`[] | ✅ | Giao giữa sở trường và thể loại của series |
| `items[].score` | number | ✅ | Số thể loại khớp |
| `items[].hasProfile` | boolean | ✅ | false = user đúng role nhưng chưa build hồ sơ (field profile trả default rỗng) |
| `size` | number | ✅ | Sĩ số roster đề xuất — LUÔN lẻ và >= 3 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.SeriesNotFound` | series does not exist |
| 422 | `Error.NotEnoughBoardMembers` | fewer than 3 active board members exist — cannot form a valid session |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "userId": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
        "specialtyGenres": [
          "ACTION"
        ],
        "matchedGenres": [
          "ACTION"
        ],
        "score": 0,
        "hasProfile": false
      }
    ],
    "size": 0
  }
}
```

<!-- payload-example:end -->

---

#### `POST /board/sessions`
> Editor tạo phiên họp Hội đồng → SCHEDULED

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Body** (`CreateBoardSessionBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `title` | string (5..100 ký tự) ✍ | ✅ | Tiêu đề (FE tự nhập) |
| `startTime` | string (regex, ISO 8601) ✍ | ✅ | Thời điểm bắt đầu phiên họp (ISO) |
| `endTime` | string (regex, ISO 8601) ✍ | — | Giờ kết thúc dự kiến; bỏ trống = chỉ kết thúc thủ công |
| `description` | string (0..500 ký tự) ✍ | — |  |
| `allowedEditorIds` | string[] ✍ | — | Bỏ trống → hệ thống tự phân công theo seriesId (PB-05) |
| `seriesId` | string (regex) ✍ | — | Nguồn thể loại cho auto-assign roster. BẮT BUỘC khi omit allowedEditorIds |
| `rosterSize` | integer (≥ 3) ✍ | — | Sĩ số roster mong muốn (sẽ được ép về số lẻ). Mặc định lấy `BoardConfig.quorumMin` (nay = sĩ số roster mặc định, không phải quorum đếm phiếu — Spec 17) |

**Response 201** (`BoardSessionRes` — đọc `res.data`):

> Mọi `BoardSessionRes` đều có `phase`; `creator`/`members` chỉ được enrich ở hai route GET list/detail.

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `description` | string | ✅ |  |
| `creatorId` | string | ✅ | ObjectId User đã tạo |
| `status` | enum `BoardSessionStatus` | ✅ | Board session status: UPCOMING (chờ tới giờ), ACTIVE (đang họp/vote), CONCLUDED (đã bế mạc) |
| `phase` | enum `BoardSessionPhase` | ✅ | Phase hiện tại: PRESENTING, QA, VOTING |
| `allowedEditorIds` | string[] | ✅ | Roster Board member được vote trong session |
| `startTime` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `endTime` | string (regex, ISO 8601) | — | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `updatedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.BoardSessionAlreadyExists` | a board session with this title is already UPCOMING or ACTIVE |
| 422 | `Error.InvalidBoardMembers` | board member count must be odd to prevent tie votes |
| 422 | `Error.RosterSourceRequired` | provide allowedEditorIds, or seriesId so the roster can be auto-assigned |
| 422 | `Error.NotEnoughBoardMembers` | fewer than 3 active board members exist — cannot form a valid session |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "title": "Tiêu đề mẫu",
  "startTime": "2026-07-20T09:30:00.000Z",
  "endTime": "2026-07-20T09:30:00.000Z",
  "description": "Nội dung mẫu",
  "allowedEditorIds": [
    "507f1f77bcf86cd799439011"
  ],
  "seriesId": "507f1f77bcf86cd799439011",
  "rosterSize": 3
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "description": "Nội dung mẫu",
    "creatorId": "507f1f77bcf86cd799439011",
    "status": "UPCOMING",
    "phase": "PRESENTING",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "members": [
      {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "allowedEditorIds": [
      "507f1f77bcf86cd799439011"
    ],
    "startTime": "2026-07-20T09:30:00.000Z",
    "endTime": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "updatedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /board/sessions`
> Danh sách phiên họp Hội đồng

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `mine` | boolean (`true`/`false`) | — | `true` = chỉ phiên caller là creator hoặc thuộc `allowedEditorIds` |
| `status` | enum `BoardSessionStatus` | — | Lọc theo `UPCOMING`, `ACTIVE`, `CONCLUDED` |

**Response 200** (`BoardSessionRes[]` — đọc `res.data`): mỗi item có `phase`. Riêng hai route đọc `GET /board/sessions` và `GET /board/sessions/:id` còn có enrichment:

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `phase` | enum `BoardSessionPhase` | ✅ | Phase hiện tại: `PRESENTING`, `QA`, `VOTING` |
| `creator` | `UserMini` | ✅ | `{id, displayName, avatar}` của người tạo; `displayName` đã fallback sang `name` |
| `members` | `UserMini[]` | ✅ | Roster đã resolve theo thứ tự `allowedEditorIds` |

> `creator`/`members` chỉ được bảo đảm ở hai route read trên; response mutation create/start/conclude/phase có thể không chứa hai field enrichment này.

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu",
      "description": "Nội dung mẫu",
      "creatorId": "507f1f77bcf86cd799439011",
      "status": "UPCOMING",
      "phase": "PRESENTING",
      "creator": {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      },
      "members": [
        {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      ],
      "allowedEditorIds": [
        "507f1f77bcf86cd799439011"
      ],
      "startTime": "2026-07-20T09:30:00.000Z",
      "endTime": "2026-07-20T09:30:00.000Z",
      "createdAt": "2026-07-20T09:30:00.000Z",
      "updatedAt": "2026-07-20T09:30:00.000Z"
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `GET /board/sessions/:id`
> Chi tiết phiên họp Hội đồng

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Response 200** (`BoardSessionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `description` | string | ✅ |  |
| `creatorId` | string | ✅ | ObjectId User đã tạo |
| `status` | enum `BoardSessionStatus` | ✅ | Board session status: UPCOMING (chờ tới giờ), ACTIVE (đang họp/vote), CONCLUDED (đã bế mạc) |
| `phase` | enum `BoardSessionPhase` | ✅ | Phase hiện tại: PRESENTING, QA, VOTING |
| `creator` | `UserMini` | ✅ | `{id, displayName, avatar}` của người tạo |
| `members` | `UserMini[]` | ✅ | Roster đã resolve từ `allowedEditorIds` |
| `allowedEditorIds` | string[] | ✅ | Roster Board member được vote trong session |
| `startTime` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `endTime` | string (regex, ISO 8601) | — | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `updatedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.BoardSessionNotFound` | board session does not exist (or id is not a valid ObjectId) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "description": "Nội dung mẫu",
    "creatorId": "507f1f77bcf86cd799439011",
    "status": "UPCOMING",
    "phase": "PRESENTING",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "members": [
      {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "allowedEditorIds": [
      "507f1f77bcf86cd799439011"
    ],
    "startTime": "2026-07-20T09:30:00.000Z",
    "endTime": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "updatedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /board/sessions/:id/phase`
> Creator hoặc Super Admin chuyển phần của phiên họp theo chiều tiến: `PRESENTING → QA → VOTING` (được phép bỏ qua QA)

**Quyền:** EDITOR, SUPER_ADMIN (Bearer). EDITOR phải là creator của session.

**Body** (`AdvancePhaseBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `phase` | enum `BoardSessionPhase` | ✅ | Phase đích: `QA` hoặc `VOTING`; không được giữ nguyên/lùi |

**Response 200:** `BoardSessionRes` với `phase` mới. Server đồng thời broadcast WS `phaseChanged` sau khi DB update thành công.

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSessionCreator` | caller không phải creator và không phải SUPER_ADMIN |
| 404 | `Error.BoardSessionNotFound` | session không tồn tại hoặc id không hợp lệ |
| 409 | `Error.BoardSessionNotOpen` | session không ở trạng thái ACTIVE |
| 409 | `Error.InvalidPhaseTransition` | phase đích bằng hoặc đứng trước phase hiện tại |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "phase": "PRESENTING"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "description": "Nội dung mẫu",
    "creatorId": "507f1f77bcf86cd799439011",
    "status": "UPCOMING",
    "phase": "PRESENTING",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "members": [
      {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "allowedEditorIds": [
      "507f1f77bcf86cd799439011"
    ],
    "startTime": "2026-07-20T09:30:00.000Z",
    "endTime": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "updatedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /board/sessions/:id/messages`
> Đọc lịch sử chat Q&A để đồng bộ lại sau reconnect; sắp xếp `createdAt` tăng dần

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer). Service chỉ cho creator, roster hoặc SUPER_ADMIN đọc.

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `limit` | integer (1..200) | — | Mặc định `50` |
| `offset` | integer (≥ 0) | — | Mặc định `0` |

**Response 200** (`BoardMessageListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | `BoardMessageRes[]` | ✅ | Tin nhắn theo thứ tự thời gian tăng dần |
| `items[].id` | string | ✅ | ObjectId tin nhắn |
| `items[].sessionId` | string | ✅ | Session chứa tin nhắn |
| `items[].sender` | `UserMini` | ✅ | `{id, displayName, avatar}` đã resolve |
| `items[].content` | string | ✅ | Nội dung đã trim, tối đa 1000 ký tự |
| `items[].phase` | enum `BoardSessionPhase` | ✅ | Snapshot phase tại lúc gửi |
| `items[].createdAt` | string (ISO 8601) | ✅ | Thời điểm gửi |
| `total` | integer | ✅ | Tổng số tin nhắn của session |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSessionParticipant` | caller không phải creator, roster hoặc SUPER_ADMIN |
| 404 | `Error.BoardSessionNotFound` | session không tồn tại hoặc id không hợp lệ |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "sessionId": "507f1f77bcf86cd799439011",
        "sender": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "content": "Nội dung mẫu",
        "phase": "PRESENTING",
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    ],
    "total": 1
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /board/sessions/:id/start`
> Kích hoạt phiên họp Hội đồng → ACTIVE

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Response 200** (`BoardSessionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `description` | string | ✅ |  |
| `creatorId` | string | ✅ | ObjectId User đã tạo |
| `status` | enum `BoardSessionStatus` | ✅ | Board session status: UPCOMING (chờ tới giờ), ACTIVE (đang họp/vote), CONCLUDED (đã bế mạc) |
| `phase` | enum `BoardSessionPhase` | ✅ | Phase hiện tại; khi mới bắt đầu mặc định là PRESENTING |
| `allowedEditorIds` | string[] | ✅ | Roster Board member được vote trong session |
| `startTime` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `endTime` | string (regex, ISO 8601) | — | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `updatedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 409 | `Error.BoardSessionNotOpen` | board session is not ACTIVE |
| 404 | `Error.BoardSessionNotFound` | board session does not exist (or id is not a valid ObjectId) |
| 409 | `Error.InvalidBoardSessionTransition` | board session status transition is not allowed by BOARD_SESSION_TRANSITIONS |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "description": "Nội dung mẫu",
    "creatorId": "507f1f77bcf86cd799439011",
    "status": "UPCOMING",
    "phase": "PRESENTING",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "members": [
      {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "allowedEditorIds": [
      "507f1f77bcf86cd799439011"
    ],
    "startTime": "2026-07-20T09:30:00.000Z",
    "endTime": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "updatedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /board/sessions/:id/conclude`
> Kết thúc phiên họp Hội đồng → CONCLUDED; quyết định treo → EXPIRED

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Response 200** (`BoardSessionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `description` | string | ✅ |  |
| `creatorId` | string | ✅ | ObjectId User đã tạo |
| `status` | enum `BoardSessionStatus` | ✅ | Board session status: UPCOMING (chờ tới giờ), ACTIVE (đang họp/vote), CONCLUDED (đã bế mạc) |
| `phase` | enum `BoardSessionPhase` | ✅ | Phase cuối cùng trước khi bế mạc |
| `allowedEditorIds` | string[] | ✅ | Roster Board member được vote trong session |
| `startTime` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `endTime` | string (regex, ISO 8601) | — | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `updatedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSessionCreator` | only the board session creator or a Super Admin can conclude the session |
| 404 | `Error.BoardSessionNotFound` | board session does not exist (or id is not a valid ObjectId) |
| 409 | `Error.InvalidBoardSessionTransition` | board session status transition is not allowed by BOARD_SESSION_TRANSITIONS |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "description": "Nội dung mẫu",
    "creatorId": "507f1f77bcf86cd799439011",
    "status": "UPCOMING",
    "phase": "PRESENTING",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "members": [
      {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "allowedEditorIds": [
      "507f1f77bcf86cd799439011"
    ],
    "startTime": "2026-07-20T09:30:00.000Z",
    "endTime": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "updatedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /board/decisions`
> Editor tạo quyết định Hội đồng nháp → PENDING

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Body** (`CreateBoardDecisionBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `boardSessionId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `targetSeriesId` | string ✍ | ✅ |  |
| `decisionType` | enum `DecisionType` | ✅ | Board decision type: CONTINUE, CANCEL, HIATUS, ENDING_ALLOWANCE, SERIES_CONTRACT_APPROVAL, SERIALIZATION, CANCELLATION, FORMAT_CHANGE, COMPLETION, REPRINT, TRANSFER, CONTRACT, OTHER |
| `details` | object | ✅ | Với `SERIALIZATION`, bắt buộc có `magazine` (string không rỗng), `startIssueNumber` (integer ≥ 1), `publicationType` (`WEEKLY`/`MONTHLY`/`IRREGULAR`) |

**Response 201** (`BoardDecisionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `targetSeriesId` | string | — |  |
| `boardSessionId` | string | ✅ |  |
| `decisionType` | enum `DecisionType` | — | Board decision type: CONTINUE, CANCEL, HIATUS, ENDING_ALLOWANCE, SERIES_CONTRACT_APPROVAL, SERIALIZATION, CANCELLATION, FORMAT_CHANGE, COMPLETION, REPRINT, TRANSFER, CONTRACT, OTHER |
| `result` | enum `BoardDecisionResult` | — | Kết quả quyết định Hội đồng: PENDING (đang bỏ phiếu), PENDING_QUORUM (chưa đủ quorum), APPROVED (thông qua), REJECTED (bác bỏ), EXPIRED (phiên đóng khi chưa chốt → cần mở phiên mới) |
| `totalVotes` | number | ✅ |  |
| `approveCount` | number | ✅ |  |
| `rejectCount` | number | ✅ |  |
| `quorumMet` | boolean | ✅ | true = phiên vote đủ quorum |
| `endingChapterAllowance` | number | — | Số chương kết thúc Board cấp khi CANCEL |
| `details` | any | — |  |
| `decidedAt` | string (regex, ISO 8601) | — | ISO 8601 date-time (UTC) |
| `allowedEditorIds` | string[] | — | Roster Board member được vote trong session |
| `votes` | object[] | ✅ |  |
| `votes[].voterId` | string | — |  |
| `votes[].voteValue` | enum `VoteValue` | — | Giá trị phiếu bầu của thành viên Hội đồng: APPROVE, REJECT, ABSTAIN |
| `votes[].note` | string | — | Ghi chú text tự do |
| `votes[].votedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | — | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.BoardSessionNotFound` | board session does not exist (or id is not a valid ObjectId) |
| 422 | `Error.InvalidBoardMembers` | board member count must be odd to prevent tie votes |
| 422 | — | `SERIALIZATION` thiếu/sai `details.magazine`, `startIssueNumber` hoặc `publicationType` |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "boardSessionId": "507f1f77bcf86cd799439011",
  "targetSeriesId": "507f1f77bcf86cd799439011",
  "decisionType": "CONTINUE",
  "details": {}
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "targetSeriesId": "507f1f77bcf86cd799439011",
    "targetSeries": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "boardSessionId": "507f1f77bcf86cd799439011",
    "decisionType": "CONTINUE",
    "result": "PENDING",
    "totalVotes": 1,
    "approveCount": 1,
    "rejectCount": 1,
    "quorumMet": false,
    "endingChapterAllowance": 0,
    "details": null,
    "decidedAt": "2026-07-20T09:30:00.000Z",
    "allowedEditorIds": [
      "507f1f77bcf86cd799439011"
    ],
    "votes": [
      {
        "voterId": "507f1f77bcf86cd799439011",
        "voteValue": "APPROVE",
        "note": "Nội dung mẫu",
        "votedAt": "2026-07-20T09:30:00.000Z"
      }
    ],
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /board/decisions`
> Danh sách quyết định Hội đồng

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `boardSessionId` | string | — | Lọc decision theo session; id không hợp lệ trả mảng rỗng |
| `targetSeriesId` | string | — | 🆕 Lọc decision theo series mục tiêu (dùng để hỏi "series này có decision nào đang treo/đã chốt"); id không hợp lệ trả mảng rỗng. Kết hợp được với `boardSessionId` |

> **Biết series nào đang được bỏ phiếu:** KHÔNG có `SeriesStatus.PITCHING` — series đứng ở `PITCHED` suốt thời gian chờ/đang vote. Muốn biết trạng thái vote, gọi `GET /board/decisions?targetSeriesId=<id>` rồi đọc `result`: `PENDING`/`PENDING_QUORUM` = đang bỏ phiếu, `APPROVED`/`REJECTED` = đã chốt, `EXPIRED` = phiên bế mạc chưa chốt (mở phiên mới).

**Response 200** (`BoardDecisionRes[]` — đọc `res.data`): mỗi item có thêm `targetSeries: {id, title} | null`, chỉ được bảo đảm ở route list/detail decision.

> `targetSeries` là field enrichment cho read route; response tạo decision có thể không chứa field này.

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "targetSeriesId": "507f1f77bcf86cd799439011",
      "targetSeries": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu"
      },
      "boardSessionId": "507f1f77bcf86cd799439011",
      "decisionType": "CONTINUE",
      "result": "PENDING",
      "totalVotes": 1,
      "approveCount": 1,
      "rejectCount": 1,
      "quorumMet": false,
      "endingChapterAllowance": 0,
      "details": null,
      "decidedAt": "2026-07-20T09:30:00.000Z",
      "allowedEditorIds": [
        "507f1f77bcf86cd799439011"
      ],
      "votes": [
        {
          "voterId": "507f1f77bcf86cd799439011",
          "voteValue": "APPROVE",
          "note": "Nội dung mẫu",
          "votedAt": "2026-07-20T09:30:00.000Z"
        }
      ],
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `GET /board/decisions/:id`
> Chi tiết quyết định Hội đồng

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Response 200** (`BoardDecisionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `targetSeriesId` | string | — |  |
| `targetSeries` | object | — | `{id, title}` ở GET list/detail; `null` nếu decision không gắn series hoặc series không resolve được |
| `boardSessionId` | string | ✅ |  |
| `decisionType` | enum `DecisionType` | — | Board decision type: CONTINUE, CANCEL, HIATUS, ENDING_ALLOWANCE, SERIES_CONTRACT_APPROVAL, SERIALIZATION, CANCELLATION, FORMAT_CHANGE, COMPLETION, REPRINT, TRANSFER, CONTRACT, OTHER |
| `result` | enum `BoardDecisionResult` | — | Kết quả quyết định Hội đồng: PENDING (đang bỏ phiếu), PENDING_QUORUM (chưa đủ quorum), APPROVED (thông qua), REJECTED (bác bỏ), EXPIRED (phiên đóng khi chưa chốt → cần mở phiên mới) |
| `totalVotes` | number | ✅ |  |
| `approveCount` | number | ✅ |  |
| `rejectCount` | number | ✅ |  |
| `quorumMet` | boolean | ✅ | true = phiên vote đủ quorum |
| `endingChapterAllowance` | number | — | Số chương kết thúc Board cấp khi CANCEL |
| `details` | any | — |  |
| `decidedAt` | string (regex, ISO 8601) | — | ISO 8601 date-time (UTC) |
| `allowedEditorIds` | string[] | — | Roster Board member được vote trong session |
| `votes` | object[] | ✅ |  |
| `votes[].voterId` | string | — |  |
| `votes[].voteValue` | enum `VoteValue` | — | Giá trị phiếu bầu của thành viên Hội đồng: APPROVE, REJECT, ABSTAIN |
| `votes[].note` | string | — | Ghi chú text tự do |
| `votes[].votedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | — | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.BoardDecisionNotFound` | board decision does not exist (or id is not a valid ObjectId) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "targetSeriesId": "507f1f77bcf86cd799439011",
    "targetSeries": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "boardSessionId": "507f1f77bcf86cd799439011",
    "decisionType": "CONTINUE",
    "result": "PENDING",
    "totalVotes": 1,
    "approveCount": 1,
    "rejectCount": 1,
    "quorumMet": false,
    "endingChapterAllowance": 0,
    "details": null,
    "decidedAt": "2026-07-20T09:30:00.000Z",
    "allowedEditorIds": [
      "507f1f77bcf86cd799439011"
    ],
    "votes": [
      {
        "voterId": "507f1f77bcf86cd799439011",
        "voteValue": "APPROVE",
        "note": "Nội dung mẫu",
        "votedAt": "2026-07-20T09:30:00.000Z"
      }
    ],
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /board/decisions/:id/vote`
> Board/Editor bỏ phiếu cho quyết định → cập nhật kết quả

**Quyền:** BOARD_MEMBER, EDITOR (Bearer)

**Body** (`CastVoteBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `voteValue` | enum `VoteValue` | ✅ | Giá trị phiếu bầu của thành viên Hội đồng: APPROVE, REJECT, ABSTAIN |
| `note` | string (0..300 ký tự) ✍ | — | Ghi chú text tự do |

**Response 201** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 409 | `Error.BoardSessionNotOpen` | board session is not ACTIVE |
| 403 | `Error.VoterNotAllowed` | caller is not in session.allowedEditorIds |
| 404 | `Error.BoardDecisionNotFound` | board decision does not exist (or id is not a valid ObjectId) |
| 404 | `Error.BoardSessionNotFound` | board session does not exist (or id is not a valid ObjectId) |
| 409 | `Error.VotingNotOpen` | session ACTIVE nhưng phase chưa phải `VOTING` (roster được kiểm tra trước phase) |
| 409 | `Error.DecisionAlreadyFinalized` | 🆕 decision đã `APPROVED`/`REJECTED`/`EXPIRED` — sổ phiếu đã khóa, không nhận thêm phiếu (guard chạy sau roster+phase, trước double-vote) |
| 409 | `Error.VoterAlreadyVoted` | voter has already cast a vote on this decision |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "voteValue": "APPROVE",
  "note": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /board/decisions/:id/votes`
> Danh sách phiếu biểu quyết của quyết định

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Response 200** :

_(xem envelope §0 — data có thể null)_

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.BoardDecisionNotFound` | board decision does not exist (or id is not a valid ObjectId) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "voterId": "507f1f77bcf86cd799439011",
      "voteValue": "APPROVE",
      "note": "Nội dung mẫu",
      "votedAt": "2026-07-20T09:30:00.000Z"
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `POST /board/reports`
> Editor tạo báo cáo phân tích series cho Hội đồng

**Quyền:** EDITOR (Bearer)

**Body** (`CreateSeriesReportBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `seriesId` | string (1..∞ ký tự) ✍ | ✅ | ObjectId của Series |
| `boardDecisionId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `reportType` | string ✍ | ✅ |  |
| `content` | string (1..∞ ký tự) ✍ | ✅ | Nội dung text |
| `attachments` | string[] ✍ | ✅ |  |

**Response 201** (`SeriesReportRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | — | ObjectId của Series |
| `boardDecisionId` | string | — |  |
| `preparedBy` | string | — |  |
| `reportType` | string | — |  |
| `content` | string | — | Nội dung text |
| `attachments` | string[] | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | `Error.BoardSessionClosedReport` | cannot submit a series report for a CONCLUDED session |
| 403 | `Error.EditorNotInvited` | caller is not in session.allowedEditorIds for report submission |
| 404 | `Error.BoardDecisionNotFound` | board decision does not exist (or id is not a valid ObjectId) |
| 404 | `Error.BoardSessionNotFound` | board session does not exist (or id is not a valid ObjectId) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "seriesId": "507f1f77bcf86cd799439011",
  "boardDecisionId": "507f1f77bcf86cd799439011",
  "reportType": "string",
  "content": "Nội dung mẫu",
  "attachments": [
    "string"
  ]
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "preparedBy": "string",
    "reportType": "string",
    "content": "Nội dung mẫu",
    "attachments": [
      "string"
    ],
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /board/reports`
> Danh sách báo cáo Hội đồng

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `seriesId` | string | — | Lọc toàn bộ report theo series; hữu ích khi mở phiên/decision mới |
| `boardDecisionId` | string | — | Lọc report theo decision |

Id filter không hợp lệ trả mảng rỗng, không phải 404.

**Response 200** :

_(xem envelope §0 — data có thể null)_

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "seriesId": "507f1f77bcf86cd799439011",
      "boardDecisionId": "507f1f77bcf86cd799439011",
      "preparedBy": "string",
      "reportType": "string",
      "content": "Nội dung mẫu",
      "attachments": [
        "string"
      ],
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `GET /board/reports/:id`
> Chi tiết báo cáo Hội đồng

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Response 200** (`SeriesReportRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | — | ObjectId của Series |
| `boardDecisionId` | string | — |  |
| `preparedBy` | string | — |  |
| `reportType` | string | — |  |
| `content` | string | — | Nội dung text |
| `attachments` | string[] | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.BoardReportNotFound` | series report does not exist (or id is not a valid ObjectId) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "preparedBy": "string",
    "reportType": "string",
    "content": "Nội dung mẫu",
    "attachments": [
      "string"
    ],
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /board/config`
> Xem cấu hình biểu quyết Hội đồng hiện tại

**Quyền:** SUPER_ADMIN, BOARD_MEMBER, EDITOR (Bearer)

> 🆕 **Spec 17:** config được **lazy-seed** — lần gọi đầu trên DB chưa có row sẽ tự tạo default (`boardTotalMembers=5, quorumMin=3, approveMajorityRatio=0.5`) và trả 200. KHÔNG còn 404 trên DB mới.

**Response 200** (`BoardConfigRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `updatedBy` | string | — |  |
| `boardTotalMembers` | number | ✅ |  |
| `quorumMin` | number | ✅ | ⚠ **Spec 17: chỉ là sĩ số roster mặc định khi auto-assign phiên** — KHÔNG còn là quorum đếm phiếu. Quorum vote thực tế = `ceil(2/3 × roster của phiên)` (xem route vote) |
| `approveMajorityRatio` | number | ✅ | Ngưỡng đa số (default 0.5); APPROVE phải > `ratio × roster` để thông qua |
| `isDefault` | boolean | — |  |
| `updatedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "updatedBy": "string",
    "boardTotalMembers": 1,
    "quorumMin": 0,
    "approveMajorityRatio": 0,
    "isDefault": false,
    "updatedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /board/config/:id`
> Super Admin cập nhật cấu hình biểu quyết Hội đồng

**Quyền:** SUPER_ADMIN (Bearer)

**Body** (`UpdateBoardConfigBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `boardTotalMembers` | number ✍ | ✅ | Phải lẻ (chống hòa phiếu) |
| `quorumMin` | number ✍ | ✅ | ⚠ Sĩ số roster mặc định khi auto-assign; KHÔNG phải quorum đếm phiếu (≤ `boardTotalMembers`) |
| `approveMajorityRatio` | number ✍ | ✅ |  |
| `updatedBy` | string ✍ | ✅ |  |

**Response 200** (`BoardConfigRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `updatedBy` | string | — |  |
| `boardTotalMembers` | number | ✅ |  |
| `quorumMin` | number | ✅ |  |
| `approveMajorityRatio` | number | ✅ |  |
| `isDefault` | boolean | — |  |
| `updatedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | `Error.BoardConfigLocked` | cannot update BoardConfig while a session is ACTIVE/UPCOMING |
| 404 | `Error.BoardConfigNotFound` | system has no active BoardConfig row |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "boardTotalMembers": 1,
  "quorumMin": 0,
  "approveMajorityRatio": 0,
  "updatedBy": "string"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "updatedBy": "string",
    "boardTotalMembers": 1,
    "quorumMin": 0,
    "approveMajorityRatio": 0,
    "isDefault": false,
    "updatedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

## §4. Flow 6 — Contract & Payment

**Nghiệp vụ:** Series `SERIALIZED` xong (Flow 1) → Editor soạn hợp đồng theo định giá Board (loại `FULL_BUYOUT` mua đứt / `REVENUE_SHARE` ăn chia %) + danh sách **điều kiện giải ngân** (PaymentCondition 4 loại) → vòng thương lượng (Mangaka và Board đều phải gật CÙNG MỘT bản) → ký 2 bên → `FULLY_EXECUTED` (khóa). **Chưa có hợp đồng FULLY_EXECUTED thì KHÔNG publish được chapter** (Flow 2 §5). Sau đó engine tự theo dõi: mỗi chapter published / mỗi kỳ ranking chốt → điều kiện đạt → sinh PaymentRecord → Board duyệt → chi. Sửa HĐ đã ký = **Amendment** (phụ lục, có vòng ký riêng).

### Happy path — ký hợp đồng

1. **Editor** `POST /contracts` (seriesId + contractType + valuationAmount + ownership % + terminationClause) → `DRAFT`. Chỉ tạo được khi series `SERIALIZED`.
2. **Editor** thêm điều kiện: `POST /contracts/:contractId/payment-conditions` (4 loại — `thresholdConfig` theo loại, xem reference). Sửa/tắt: `PATCH .../payment-conditions/:conditionId` / `.../disable`.
3. **Editor** gửi Mangaka: `PATCH /contracts/:id/status` (sang MANGAKA_REVIEW).
4. **Mangaka** xem (`GET /contracts/:id`): đồng ý → `PATCH /contracts/:id/status` (MANGAKA_APPROVED) **hoặc** yêu cầu sửa → `POST /contracts/:id/request-changes` **kèm body `{reason}` bắt buộc** 🆕 (→ NEGOTIATION → Editor sửa `PATCH /contracts/:id` → gửi lại — mọi sửa đổi reset phê duyệt cũ).
5. **Board** duyệt bản Mangaka đã gật: `POST /contracts/:id/board-approve` (hoặc `board-request-changes` **kèm `{reason}`** 🆕 → NEGOTIATION → vòng lại từ Mangaka).
   🆕 Cả 2 route chỉ nhận board member **trong roster phiên họp** của hợp đồng — **1 người là đủ** (đại diện xem xét), khác với bước ký cần **toàn bộ** roster.
6. Ký: **Mangaka** `POST /contracts/:id/signatures/mangaka` (OTP) → `MANGAKA_SIGNED` → **Board** `POST /contracts/:id/signatures/board` → **`FULLY_EXECUTED`** (khóa — mở gate publish chapter).

### Happy path — dòng tiền tự động

- Chapter published → engine đếm → `CHAPTER_MILESTONE`/`RECURRING_CHAPTER` đạt → PaymentRecord `TRIGGERED` (idempotent — không double-trigger).
- Kỳ ranking REFLECTED → check `RANKING_MILESTONE`.
- Cron daily check `TIME_BOUND` → quá hạn không đạt → `MISSED`. Series `HIATUS` → TIME_BOUND `DISABLED` (dừng đồng hồ), resume → `PENDING` + deadline dời đúng bằng thời gian nghỉ.
- **Board** duyệt chi: `PATCH /payments/:id/approve` → `PATCH /payments/:id/pay` (→ `PAID` + `paidAt`); hủy: `PATCH /payments/:id/cancel`.
- **REVENUE_SHARE:** Editor/Board nhập doanh thu kỳ `POST /contracts/:id/revenue` → hệ thống chia theo ownership split → PaymentRecord loại `REVENUE_SHARE` cho (các) mangaka.

### Happy path — Amendment (sửa HĐ đã ký)

1. **Editor** `POST /contracts/:contractId/amendments` (field typed: valuation/2 pct/termination/start/end — chỉ điền field muốn đổi) → `DRAFT`. (Flow 5 CHANGE_FORMAT/COMPLETION cũng auto-sinh DRAFT + notify Editor.)
2. Sửa nháp `PATCH .../amendments/:id` → trình ký `POST .../submit` → `PENDING_SIGNATURES`.
3. Ký **ownership-aware**: REVENUE_SHARE = Mangaka (`.../sign/mangaka`, OTP) + Board (`.../sign/board`); **FULL_BUYOUT = CHỈ Board ký** (Mangaka chỉ được notify).
4. Đủ chữ ký → `FULLY_EXECUTED` → **ghi đè điều khoản lên HĐ gốc** + log snapshot (`GET /contracts/:id/versions`).

### Unhappy cases

| Tình huống | API | Kết quả |
|---|---|---|
| Tạo contract khi series chưa SERIALIZED | `POST /contracts` | 409 `Error.SeriesNotSerialized` |
| Ownership không hợp lệ (tổng ≠100; FULL_BUYOUT ≠ 100/0) | `POST /contracts` | 422 field-level |
| `thresholdConfig` sai schema theo `conditionType` | payment-conditions | 422 |
| Chuyển trạng thái sai bảng transition | status/approve routes | 409 `Error.InvalidContractTransition` |
| Mangaka khác approve hộ HĐ không phải của mình | `PATCH /contracts/:id/status` | 403 |
| Ký khi chưa được duyệt đủ (chưa BOARD_APPROVED) | signatures | 409 `Error.ContractNotSignableYet` |
| OTP ký sai/hết hạn | signatures (OTP) | 422 / 410 |
| Sửa HĐ đã FULLY_EXECUTED trực tiếp | `PATCH /contracts/:id` | 409 (phải dùng Amendment) |
| Mangaka ký amendment của HĐ FULL_BUYOUT | `.../sign/mangaka` | 409 `Error.MangakaSignNotRequired` |
| 🆕 Board member **ngoài roster** phiên họp bấm duyệt/yêu cầu sửa | `board-approve` / `board-request-changes` | 403 `NOT_AUTHORIZED_IN_BOARD` |
| 🆕 Hợp đồng chưa gắn Board Decision | `board-approve` / `board-request-changes` | 400 `BOARD_DECISION_NOT_FOUND` |
| 🆕 Yêu cầu sửa mà không nêu lý do | `request-changes` / `board-request-changes` | 422 (thiếu `reason`) |
| 🆕 Tải PDF khi HĐ chưa ký khoá | `GET /contracts/:id/pdf` | 409 `Error.ContractNotExecutedForPdf` |
| 🆕 Người ngoài cuộc tải PDF | `GET /contracts/:id/pdf` | 403 `Error.ContractAccessDenied` |
| Execute amendment 2 lần (double-submit) | sign cuối | 409 (guard atomic) |
| Reject amendment đang trình ký | `.../reject` | về `DRAFT` + **reset toàn bộ chữ ký** |
| Duyệt/chi PaymentRecord sai trạng thái | payments approve/pay | 409 |
| id rác (không phải ObjectId) | mọi route `:id` | 404 (không 500) |
| Series bị CANCEL giữa chừng | (event) | HĐ → `TERMINATED`: mốc ĐÃ ĐẠT vẫn trả, mốc chưa đạt → MISSED, sinh `COMPENSATION` theo termination clause |

### API Reference

#### `GET /contracts/health`
> Health check module contract

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Response 200** (`ContractHealthRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `status` | string | ✅ |  |
| `module` | string | ✅ |  |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "status": "string",
    "module": "string"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts`
> Editor tạo hợp đồng nháp cho series đã SERIALIZED → DRAFT (B-CON-01)

**Quyền:** EDITOR (Bearer)

**Body** (`CreateContractBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `seriesId` | string (1..∞ ký tự) ✍ | ✅ | ObjectId của Series |
| `mangakaId` | string (1..∞ ký tự) ✍ | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `boardDecisionId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `contractType` | enum `ContractType` | ✅ | Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) \| REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03 |
| `valuationAmount` | number (≥ 0) ✍ | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number (≥ 0, ≤ 100) ✍ | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number (≥ 0, ≤ 100) ✍ | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string (1..∞ ký tự) ✍ | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) ✍ | ✅ |  |
| `contractEnd` | string (regex, ISO 8601) ✍ | ✅ |  |

**Response 201** (`ContractRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `editorId` | string | ✅ | ObjectId User của Editor phụ trách |
| `boardDecisionId` | string | ✅ |  |
| `sourceTransferRequestId` | string | — |  |
| `contractType` | enum `ContractType` | ✅ | Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) \| REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03 |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `status` | enum `ContractStatus` | ✅ | Vòng đời hợp đồng: DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → NEGOTIATION → MANGAKA_SIGNED → FULLY_EXECUTED (khoá); kết thúc: FULFILLED \| TERMINATED \| TERMINATED_BY_BREACH \| EXPIRED \| VOIDED |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:** 🆕 2026-07-19 — BE siết validate lúc tạo draft (căn cứ Board Decision phải hợp lệ):

| Status | Code | Khi nào |
|---|---|---|
| 404 | — (`CONTRACT_NOT_FOUND`) | `seriesId` rác/không tồn tại |
| 404 | `Error.BoardDecisionNotFound` 🆕 | `boardDecisionId` rác/không tồn tại |
| 409 | `Error.SeriesNotSerialized` | Series chưa `SERIALIZED` — chỉ tạo hợp đồng sau khi Board duyệt serial hóa |
| 409 | `Error.InvalidSerializationDecision` 🆕 | Decision không phải `SERIALIZATION` + `APPROVED` của đúng series này (`targetSeriesId` phải khớp `seriesId`) |
| 409 | `Error.ContractMangakaMismatch` 🆕 | `mangakaId` gửi lên không phải chủ sở hữu hiện tại của series |
| 409 | `Error.OpenContractExists` 🆕 | Series hoặc Decision này đã có hợp đồng **chưa kết thúc** (mọi status ngoài `VOIDED`/`FULFILLED`/`TERMINATED`/`TERMINATED_BY_BREACH`/`EXPIRED`) — kể cả `FULLY_EXECUTED` |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "seriesId": "507f1f77bcf86cd799439011",
  "mangakaId": "507f1f77bcf86cd799439011",
  "boardDecisionId": "507f1f77bcf86cd799439011",
  "contractType": "FULL_BUYOUT",
  "valuationAmount": 1,
  "publisherOwnershipPct": 1,
  "mangakaOwnershipPct": 1,
  "terminationClause": "string",
  "contractStart": "2026-07-20T09:30:00.000Z",
  "contractEnd": "2026-07-20T09:30:00.000Z"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "boardDecision": {
      "id": "507f1f77bcf86cd799439011",
      "decisionType": "CONTINUE",
      "result": "PENDING",
      "decidedAt": "2026-07-20T09:30:00.000Z",
      "boardSession": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "startTime": "2026-07-20T09:30:00.000Z"
      }
    },
    "sourceTransferRequestId": "507f1f77bcf86cd799439011",
    "contractType": "FULL_BUYOUT",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "status": "DRAFT",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /contracts`
> Danh sách hợp đồng theo scope role hiện tại
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.
> 🆕 **2026-07-19:** mỗi item kèm thêm `boardDecision {id, decisionType, result, decidedAt, boardSession{id,title,startTime}}` — xem bảng field ở `GET /contracts/:id`.

**Quyền:** EDITOR, MANGAKA, BOARD_MEMBER (Bearer)

**Response 200** :

_(xem envelope §0 — data có thể null)_

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "seriesId": "507f1f77bcf86cd799439011",
      "mangakaId": "507f1f77bcf86cd799439011",
      "editorId": "507f1f77bcf86cd799439011",
      "series": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu"
      },
      "mangaka": {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      },
      "editor": {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      },
      "boardDecisionId": "507f1f77bcf86cd799439011",
      "boardDecision": {
        "id": "507f1f77bcf86cd799439011",
        "decisionType": "CONTINUE",
        "result": "PENDING",
        "decidedAt": "2026-07-20T09:30:00.000Z",
        "boardSession": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu",
          "startTime": "2026-07-20T09:30:00.000Z"
        }
      },
      "sourceTransferRequestId": "507f1f77bcf86cd799439011",
      "contractType": "FULL_BUYOUT",
      "valuationAmount": 1000000,
      "publisherOwnershipPct": 50,
      "mangakaOwnershipPct": 50,
      "terminationClause": "string",
      "contractStart": "2026-07-20T09:30:00.000Z",
      "contractEnd": "2026-07-20T09:30:00.000Z",
      "status": "DRAFT",
      "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
      "boardSignedAt": "2026-07-20T09:30:00.000Z",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `GET /contracts/:id`
> Chi tiết hợp đồng
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** EDITOR, MANGAKA, BOARD_MEMBER (Bearer)

**Response 200** (`ContractRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `editorId` | string | ✅ | ObjectId User của Editor phụ trách |
| `boardDecisionId` | string | ✅ |  |
| `sourceTransferRequestId` | string | — |  |
| `contractType` | enum `ContractType` | ✅ | Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) \| REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03 |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `status` | enum `ContractStatus` | ✅ | Vòng đời hợp đồng: DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → NEGOTIATION → MANGAKA_SIGNED → FULLY_EXECUTED (khoá); kết thúc: FULFILLED \| TERMINATED \| TERMINATED_BY_BREACH \| EXPIRED \| VOIDED |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `series` | object 🆕 | GET | `{id, title}` — title series để render, không cần tra `/series/:id` |
| `mangaka` | object 🆕 | GET | `UserMini {id, displayName, avatar}` của Mangaka ký hợp đồng |
| `editor` | object \| null 🆕 | GET | `UserMini` của Editor soạn; `null` = chưa gán |
| `boardDecision` | object \| null 🆕 2026-07-19 | GET | Căn cứ phiên họp serial hóa: `{id, decisionType, result, decidedAt, boardSession{id, title, startTime}}` — render "duyệt tại phiên X ngày Y" không cần tra `/board/decisions`; `decidedAt` null khi chưa finalize |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "boardDecision": {
      "id": "507f1f77bcf86cd799439011",
      "decisionType": "CONTINUE",
      "result": "PENDING",
      "decidedAt": "2026-07-20T09:30:00.000Z",
      "boardSession": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "startTime": "2026-07-20T09:30:00.000Z"
      }
    },
    "sourceTransferRequestId": "507f1f77bcf86cd799439011",
    "contractType": "FULL_BUYOUT",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "status": "DRAFT",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /contracts/:id/status`
> Xem trạng thái hợp đồng và tiến độ ký

**Quyền:** EDITOR, MANGAKA, BOARD_MEMBER (Bearer)

**Response 200** (`ContractStatusProgressRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `status` | enum `ContractStatus` | ✅ | Vòng đời hợp đồng: DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → NEGOTIATION → MANGAKA_SIGNED → FULLY_EXECUTED (khoá); kết thúc: FULFILLED \| TERMINATED \| TERMINATED_BY_BREACH \| EXPIRED \| VOIDED |
| `mangaka` | object | ✅ |  |
| `mangaka.id` | string | ✅ | ObjectId của bản ghi |
| `mangaka.isSigned` | boolean | ✅ |  |
| `mangaka.signedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardProgress` | object | ✅ |  |
| `boardProgress.totalRequired` | number | ✅ |  |
| `boardProgress.totalSigned` | number | ✅ |  |
| `boardProgress.signedEditors` | object[] | ✅ |  |
| `boardProgress.pendingEditors` | object[] | ✅ |  |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "status": "DRAFT",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "isSigned": false,
      "signedAt": "2026-07-20T09:30:00.000Z"
    },
    "boardProgress": {
      "totalRequired": 1,
      "totalSigned": 1,
      "signedEditors": [
        {
          "id": "507f1f77bcf86cd799439011",
          "actionAt": "2026-07-20T09:30:00.000Z"
        }
      ],
      "pendingEditors": [
        {
          "id": "507f1f77bcf86cd799439011",
          "actionAt": null
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /contracts/:id`
> Editor cập nhật điều khoản hợp đồng nháp

**Quyền:** EDITOR (Bearer)

**Body** (`EditorUpdateContractBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `contractType` | enum `ContractType` | — | Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) \| REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03 |
| `valuationAmount` | number (≥ 0) ✍ | — | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number (≥ 0, ≤ 100) ✍ | — | % sở hữu của NXB |
| `mangakaOwnershipPct` | number (≥ 0, ≤ 100) ✍ | — | % sở hữu của Mangaka |
| `terminationClause` | string ✍ | — | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) ✍ | — |  |
| `contractEnd` | string (regex, ISO 8601) ✍ | — |  |
| `note` | string (0..500 ký tự) ✍ | — | Ghi chú text tự do |

**Response 200** (`ContractRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `editorId` | string | ✅ | ObjectId User của Editor phụ trách |
| `boardDecisionId` | string | ✅ |  |
| `sourceTransferRequestId` | string | — |  |
| `contractType` | enum `ContractType` | ✅ | Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) \| REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03 |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `status` | enum `ContractStatus` | ✅ | Vòng đời hợp đồng: DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → NEGOTIATION → MANGAKA_SIGNED → FULLY_EXECUTED (khoá); kết thúc: FULFILLED \| TERMINATED \| TERMINATED_BY_BREACH \| EXPIRED \| VOIDED |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "contractType": "FULL_BUYOUT",
  "valuationAmount": 1,
  "publisherOwnershipPct": 1,
  "mangakaOwnershipPct": 1,
  "terminationClause": "string",
  "contractStart": "2026-07-20T09:30:00.000Z",
  "contractEnd": "2026-07-20T09:30:00.000Z",
  "note": "Nội dung mẫu"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "boardDecision": {
      "id": "507f1f77bcf86cd799439011",
      "decisionType": "CONTINUE",
      "result": "PENDING",
      "decidedAt": "2026-07-20T09:30:00.000Z",
      "boardSession": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "startTime": "2026-07-20T09:30:00.000Z"
      }
    },
    "sourceTransferRequestId": "507f1f77bcf86cd799439011",
    "contractType": "FULL_BUYOUT",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "status": "DRAFT",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /contracts/:id/status`
> Editor/Mangaka cập nhật trạng thái hợp đồng theo workflow

**Quyền:** EDITOR, MANGAKA (Bearer)

**Response 200** (`ContractRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `editorId` | string | ✅ | ObjectId User của Editor phụ trách |
| `boardDecisionId` | string | ✅ |  |
| `sourceTransferRequestId` | string | — |  |
| `contractType` | enum `ContractType` | ✅ | Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) \| REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03 |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `status` | enum `ContractStatus` | ✅ | Vòng đời hợp đồng: DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → NEGOTIATION → MANGAKA_SIGNED → FULLY_EXECUTED (khoá); kết thúc: FULFILLED \| TERMINATED \| TERMINATED_BY_BREACH \| EXPIRED \| VOIDED |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "boardDecision": {
      "id": "507f1f77bcf86cd799439011",
      "decisionType": "CONTINUE",
      "result": "PENDING",
      "decidedAt": "2026-07-20T09:30:00.000Z",
      "boardSession": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "startTime": "2026-07-20T09:30:00.000Z"
      }
    },
    "sourceTransferRequestId": "507f1f77bcf86cd799439011",
    "contractType": "FULL_BUYOUT",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "status": "DRAFT",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:id/request-changes`
> B-CON-02: Mangaka yêu cầu chỉnh sửa điều khoản → NEGOTIATION

**Quyền:** MANGAKA (Bearer) — phải đúng Mangaka của hợp đồng.

> 🆕 **BREAKING 2026-07-20 — route này nay BẮT BUỘC có body `{reason}`.** Trước đây gọi không body;
> Editor nhận thông báo "Mangaka yêu cầu chỉnh sửa" mà **không biết sửa gì** → phải hỏi ngoài hệ thống,
> làm gãy vòng thương lượng (BR-CONTRACT-02). Gọi thiếu `reason` → **422**.
> Lý do được ghi vào **2 nơi**: nội dung Notification gửi Editor, và `AuditLog.reason` (tra qua
> `GET /audit?entityType=CONTRACT&entityId=:id` — bản ghi bền, notification chỉ là kênh báo tức thời).

**Body** (`ContractChangeReasonBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..1000 ký tự) ✍ | ✅ | Lý do yêu cầu chỉnh sửa — Editor đọc để biết sửa điều khoản nào. `.strict()`: gửi thêm field lạ (vd `note`) → 422 |

**Response 201** (`ContractRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `editorId` | string | ✅ | ObjectId User của Editor phụ trách |
| `boardDecisionId` | string | ✅ |  |
| `sourceTransferRequestId` | string | — |  |
| `contractType` | enum `ContractType` | ✅ | Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) \| REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03 |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `status` | enum `ContractStatus` | ✅ | Vòng đời hợp đồng: DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → NEGOTIATION → MANGAKA_SIGNED → FULLY_EXECUTED (khoá); kết thúc: FULFILLED \| TERMINATED \| TERMINATED_BY_BREACH \| EXPIRED \| VOIDED |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotContractMangaka` | caller không phải Mangaka của hợp đồng (⚠ đổi từ ONLY_ASSIGNED_EDITOR_CAN_EDIT — 2026-07-17) |
| 404 | — | CONTRACT_NOT_FOUND |
| 409 | `Error.InvalidContractTransition` | contract status transition not allowed by CONTRACT_TRANSITIONS (Flow 6) |
| 422 | `Error.ValidationFailed` | 🆕 thiếu `reason` / `reason` rỗng / > 1000 ký tự / gửi field lạ |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "boardDecision": {
      "id": "507f1f77bcf86cd799439011",
      "decisionType": "CONTINUE",
      "result": "PENDING",
      "decidedAt": "2026-07-20T09:30:00.000Z",
      "boardSession": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "startTime": "2026-07-20T09:30:00.000Z"
      }
    },
    "sourceTransferRequestId": "507f1f77bcf86cd799439011",
    "contractType": "FULL_BUYOUT",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "status": "DRAFT",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:id/board-approve`
> B-CON-02 (BOARD_REVIEW): Hội đồng duyệt điều khoản → BOARD_APPROVED

**Quyền:** BOARD_MEMBER (Bearer) — 🆕 **phải nằm trong roster phiên họp** đã ra quyết định
`SERIALIZATION` cho hợp đồng này (`contract.boardDecision.boardSession.allowedEditorIds`).

> 🆕 **SIẾT QUYỀN 2026-07-20 (không đổi shape request/response).** Trước đây **bất kỳ** BOARD_MEMBER nào
> trong hệ thống cũng bấm được, kể cả người không dự phiên họp đó. Nay dùng **cùng một nguồn sự thật**
> mà bước KÝ (`/signatures/board`) vẫn dùng. Phân biệt rõ 2 bước:
> - **XEM XÉT điều khoản** (`board-approve` / `board-request-changes`): **1 board member trong roster là đủ** — đại diện Hội đồng.
> - **KÝ** (`/signatures/board`): **TOÀN BỘ roster phải ký** mới `FULLY_EXECUTED` (multi-sign 100%).
>
> **FE cần làm:** chỉ hiện nút Duyệt/Yêu cầu sửa khi user hiện tại có trong `boardDecision.boardSession`
> roster (lấy từ `GET /contracts/:id` — xem §0.10 embed `boardDecision`). Nếu vẫn gọi khi ngoài roster → **403**.

**Response 201** (`ContractRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `editorId` | string | ✅ | ObjectId User của Editor phụ trách |
| `boardDecisionId` | string | ✅ |  |
| `sourceTransferRequestId` | string | — |  |
| `contractType` | enum `ContractType` | ✅ | Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) \| REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03 |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `status` | enum `ContractStatus` | ✅ | Vòng đời hợp đồng: DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → NEGOTIATION → MANGAKA_SIGNED → FULLY_EXECUTED (khoá); kết thúc: FULFILLED \| TERMINATED \| TERMINATED_BY_BREACH \| EXPIRED \| VOIDED |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | `BOARD_DECISION_NOT_FOUND` | 🆕 hợp đồng chưa gắn quyết định Hội đồng nào |
| 403 | `NOT_AUTHORIZED_IN_BOARD` | 🆕 caller là BOARD_MEMBER nhưng **ngoài roster** phiên họp của hợp đồng này |
| 404 | — | CONTRACT_NOT_FOUND |
| 409 | `Error.InvalidContractTransition` | contract status transition not allowed by CONTRACT_TRANSITIONS (Flow 6) |

> ⚠ Thứ tự guard: **authz trước, transition sau**. Người ngoài roster luôn nhận **403** kể cả khi
> hợp đồng đang ở trạng thái không duyệt được — cố ý, để không lộ trạng thái hợp đồng ra ngoài Hội đồng.

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "boardDecision": {
      "id": "507f1f77bcf86cd799439011",
      "decisionType": "CONTINUE",
      "result": "PENDING",
      "decidedAt": "2026-07-20T09:30:00.000Z",
      "boardSession": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "startTime": "2026-07-20T09:30:00.000Z"
      }
    },
    "sourceTransferRequestId": "507f1f77bcf86cd799439011",
    "contractType": "FULL_BUYOUT",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "status": "DRAFT",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:id/board-request-changes`
> B-CON-02 (BOARD_REVIEW): Hội đồng yêu cầu chỉnh sửa → NEGOTIATION

**Quyền:** BOARD_MEMBER (Bearer) — 🆕 **phải nằm trong roster phiên họp** (như `board-approve` ở trên).

> 🆕 **BREAKING 2026-07-20 — route này nay BẮT BUỘC có body `{reason}`** (cùng lý do với
> `/request-changes` phía Mangaka). Gọi thiếu → **422**.
>
> ⚠ **Tác động nặng hơn `board-approve`:** route này reset **CẢ HAI** chữ ký
> (`mangakaSignedAt` và `boardSignedAt` về `null`) và đưa hợp đồng về `NEGOTIATION` — cả hai bên
> phải gật lại từ đầu. FE nên confirm dialog trước khi gọi.

**Body** (`ContractChangeReasonBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..1000 ký tự) ✍ | ✅ | Lý do Hội đồng yêu cầu sửa — vào Notification gửi Editor + `AuditLog.reason`. `.strict()`: field lạ → 422 |

**Response 201** (`ContractRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `editorId` | string | ✅ | ObjectId User của Editor phụ trách |
| `boardDecisionId` | string | ✅ |  |
| `sourceTransferRequestId` | string | — |  |
| `contractType` | enum `ContractType` | ✅ | Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) \| REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03 |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `status` | enum `ContractStatus` | ✅ | Vòng đời hợp đồng: DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → NEGOTIATION → MANGAKA_SIGNED → FULLY_EXECUTED (khoá); kết thúc: FULFILLED \| TERMINATED \| TERMINATED_BY_BREACH \| EXPIRED \| VOIDED |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | `BOARD_DECISION_NOT_FOUND` | 🆕 hợp đồng chưa gắn quyết định Hội đồng nào |
| 403 | `NOT_AUTHORIZED_IN_BOARD` | 🆕 caller là BOARD_MEMBER nhưng **ngoài roster** phiên họp của hợp đồng này |
| 404 | — | CONTRACT_NOT_FOUND |
| 409 | `Error.InvalidContractTransition` | contract status transition not allowed by CONTRACT_TRANSITIONS (Flow 6) |
| 422 | `Error.ValidationFailed` | 🆕 thiếu `reason` / `reason` rỗng / > 1000 ký tự / gửi field lạ |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "boardDecision": {
      "id": "507f1f77bcf86cd799439011",
      "decisionType": "CONTINUE",
      "result": "PENDING",
      "decidedAt": "2026-07-20T09:30:00.000Z",
      "boardSession": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "startTime": "2026-07-20T09:30:00.000Z"
      }
    },
    "sourceTransferRequestId": "507f1f77bcf86cd799439011",
    "contractType": "FULL_BUYOUT",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "status": "DRAFT",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:id/signatures/mangaka`
> Mangaka ký hợp đồng bằng OTP

**Quyền:** MANGAKA (Bearer)

**Body** (`SignContractWithOtpBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `otpCode` | string (6..6 ký tự) ✍ | ✅ |  |

**Response 201** (`ContractRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `editorId` | string | ✅ | ObjectId User của Editor phụ trách |
| `boardDecisionId` | string | ✅ |  |
| `sourceTransferRequestId` | string | — |  |
| `contractType` | enum `ContractType` | ✅ | Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) \| REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03 |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `status` | enum `ContractStatus` | ✅ | Vòng đời hợp đồng: DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → NEGOTIATION → MANGAKA_SIGNED → FULLY_EXECUTED (khoá); kết thúc: FULFILLED \| TERMINATED \| TERMINATED_BY_BREACH \| EXPIRED \| VOIDED |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | CONTRACT_ALREADY_SIGNED_BY_THIS_PARTY |
| 403 | `Error.NotContractMangaka` | caller không phải Mangaka của hợp đồng này (mới 2026-07-17) |
| 404 | — | CONTRACT_NOT_FOUND |
| 409 | `Error.ContractNotSignableYet` | contract must reach BOARD_APPROVED before it can be signed (B-CON-02) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "otpCode": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "boardDecision": {
      "id": "507f1f77bcf86cd799439011",
      "decisionType": "CONTINUE",
      "result": "PENDING",
      "decidedAt": "2026-07-20T09:30:00.000Z",
      "boardSession": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "startTime": "2026-07-20T09:30:00.000Z"
      }
    },
    "sourceTransferRequestId": "507f1f77bcf86cd799439011",
    "contractType": "FULL_BUYOUT",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "status": "DRAFT",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:id/signatures/board`
> Board ký hợp đồng bằng OTP

**Quyền:** BOARD_MEMBER (Bearer)

**Body** (`SignContractWithOtpBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `otpCode` | string (6..6 ký tự) ✍ | ✅ |  |

**Response 201** (`ContractSignRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `status` | string | ✅ |  |
| `message` | string | ✅ | Message hiển thị cho user |
| `contract` | object | ✅ |  |
| `contract.id` | string | ✅ | ObjectId của bản ghi |
| `contract.seriesId` | string | ✅ | ObjectId của Series |
| `contract.mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `contract.editorId` | string | ✅ | ObjectId User của Editor phụ trách |
| `contract.boardDecisionId` | string | ✅ |  |
| `contract.sourceTransferRequestId` | string | — |  |
| `contract.contractType` | enum `ContractType` | ✅ | Loại hợp đồng: FULL_BUYOUT (NXB mua đứt 100%, toàn quyền) \| REVENUE_SHARE (ăn chia %, quyết định lớn cần Mangaka đồng ý) — BR-CONTRACT-03 |
| `contract.valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `contract.publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `contract.mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `contract.terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contract.contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contract.contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contract.status` | enum `ContractStatus` | ✅ | Vòng đời hợp đồng: DRAFT → MANGAKA_REVIEW → MANGAKA_APPROVED → BOARD_APPROVED → NEGOTIATION → MANGAKA_SIGNED → FULLY_EXECUTED (khoá); kết thúc: FULFILLED \| TERMINATED \| TERMINATED_BY_BREACH \| EXPIRED \| VOIDED |
| `contract.mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contract.boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contract.createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | CONTRACT_ALREADY_SIGNED_BY_THIS_PARTY |
| 400 | — | BOARD_DECISION_NOT_FOUND |
| 400 | — | BOARD_MEMBER_ALREADY_SIGNED |
| 403 | — | NOT_AUTHORIZED_IN_BOARD |
| 404 | — | CONTRACT_NOT_FOUND |
| 409 | `Error.ContractNotSignableYet` | contract must reach BOARD_APPROVED before it can be signed (B-CON-02) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "otpCode": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "status": "string",
    "message": "Nội dung mẫu",
    "contract": {
      "id": "507f1f77bcf86cd799439011",
      "seriesId": "507f1f77bcf86cd799439011",
      "mangakaId": "507f1f77bcf86cd799439011",
      "editorId": "507f1f77bcf86cd799439011",
      "series": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu"
      },
      "mangaka": {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      },
      "editor": {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      },
      "boardDecisionId": "507f1f77bcf86cd799439011",
      "boardDecision": {
        "id": "507f1f77bcf86cd799439011",
        "decisionType": "CONTINUE",
        "result": "PENDING",
        "decidedAt": "2026-07-20T09:30:00.000Z",
        "boardSession": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu",
          "startTime": "2026-07-20T09:30:00.000Z"
        }
      },
      "sourceTransferRequestId": "507f1f77bcf86cd799439011",
      "contractType": "FULL_BUYOUT",
      "valuationAmount": 1000000,
      "publisherOwnershipPct": 50,
      "mangakaOwnershipPct": 50,
      "terminationClause": "string",
      "contractStart": "2026-07-20T09:30:00.000Z",
      "contractEnd": "2026-07-20T09:30:00.000Z",
      "status": "DRAFT",
      "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
      "boardSignedAt": "2026-07-20T09:30:00.000Z",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:contractId/payment-conditions`
> Editor tạo điều kiện thanh toán cho hợp đồng

**Quyền:** EDITOR (Bearer)

**Body** (`CreatePaymentConditionBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `conditionType` | enum `ConditionType` | ✅ |  |
| `thresholdConfig` | any | ✅ | Cấu hình ngưỡng theo conditionType (JSON — xem mô tả route) |
| `isRecurring` | boolean ✍ | — | (default: `false`) |
| `payoutAmount` | number (≥ 0) ✍ | — | Số tiền chi khi điều kiện đạt |
| `payoutPct` | number (≥ 0, ≤ 100) ✍ | — |  |

**Response 201** (`PaymentConditionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `conditionType` | enum `ConditionType` | ✅ |  |
| `thresholdConfig` | any | ✅ | Cấu hình ngưỡng theo conditionType (JSON — xem mô tả route) |
| `payoutAmount` | number | ✅ | Số tiền chi khi điều kiện đạt |
| `payoutPct` | number | ✅ |  |
| `isRecurring` | boolean | ✅ |  |
| `status` | enum `PaymentConditionStatus` | ✅ | Trạng thái điều kiện giải ngân: PENDING (chờ đạt) \| ACHIEVED (đã đạt) \| PAID (đã chi) \| CANCELLED (đã huỷ) \| MISSED (hết hạn không đạt) \| DISABLED (tạm dừng khi series HIATUS — BR-CONTRACT-07) |
| `lastTriggeredValue` | number | ✅ |  |
| `achievedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | — | ONLY_ASSIGNED_EDITOR_CAN_MANAGE_PAYMENT_CONDITIONS |
| 404 | — | CONTRACT_NOT_FOUND |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "conditionType": "CHAPTER_MILESTONE",
  "thresholdConfig": null,
  "isRecurring": false,
  "payoutAmount": 1,
  "payoutPct": 1
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "conditionType": "CHAPTER_MILESTONE",
    "thresholdConfig": null,
    "payoutAmount": 1000000,
    "payoutPct": 50,
    "isRecurring": false,
    "status": "PENDING",
    "lastTriggeredValue": 0,
    "achievedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /contracts/:contractId/payment-conditions`
> Danh sách điều kiện thanh toán của hợp đồng

**Quyền:** EDITOR, MANGAKA, BOARD_MEMBER (Bearer)

**Response 200** (`PaymentConditionListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `data` | object[] | ✅ |  |
| `data[].id` | string | ✅ | ObjectId của bản ghi |
| `data[].contractId` | string | ✅ | ObjectId của Contract |
| `data[].conditionType` | enum `ConditionType` | ✅ |  |
| `data[].thresholdConfig` | any | ✅ | Cấu hình ngưỡng theo conditionType (JSON — xem mô tả route) |
| `data[].payoutAmount` | number | ✅ | Số tiền chi khi điều kiện đạt |
| `data[].payoutPct` | number | ✅ |  |
| `data[].isRecurring` | boolean | ✅ |  |
| `data[].status` | enum `PaymentConditionStatus` | ✅ | Trạng thái điều kiện giải ngân: PENDING (chờ đạt) \| ACHIEVED (đã đạt) \| PAID (đã chi) \| CANCELLED (đã huỷ) \| MISSED (hết hạn không đạt) \| DISABLED (tạm dừng khi series HIATUS — BR-CONTRACT-07) |
| `data[].lastTriggeredValue` | number | ✅ |  |
| `data[].achievedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | — | ONLY_ASSIGNED_EDITOR_CAN_MANAGE_PAYMENT_CONDITIONS |
| 404 | — | CONTRACT_NOT_FOUND |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "data": [
      {
        "id": "507f1f77bcf86cd799439011",
        "contractId": "507f1f77bcf86cd799439011",
        "conditionType": "CHAPTER_MILESTONE",
        "thresholdConfig": null,
        "payoutAmount": 1000000,
        "payoutPct": 50,
        "isRecurring": false,
        "status": "PENDING",
        "lastTriggeredValue": 0,
        "achievedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /contracts/:contractId/payment-conditions/:conditionId`
> Editor cập nhật điều kiện thanh toán của hợp đồng

**Quyền:** EDITOR (Bearer)

**Body** (`UpdatePaymentConditionBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `thresholdConfig` | any | — | Cấu hình ngưỡng theo conditionType (JSON — xem mô tả route) |
| `payoutAmount` | number (≥ 0) ✍ | — | Số tiền chi khi điều kiện đạt |
| `payoutPct` | number (≥ 0, ≤ 100) ✍ | — |  |
| `isRecurring` | boolean ✍ | — |  |

**Response 200** (`PaymentConditionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `conditionType` | enum `ConditionType` | ✅ |  |
| `thresholdConfig` | any | ✅ | Cấu hình ngưỡng theo conditionType (JSON — xem mô tả route) |
| `payoutAmount` | number | ✅ | Số tiền chi khi điều kiện đạt |
| `payoutPct` | number | ✅ |  |
| `isRecurring` | boolean | ✅ |  |
| `status` | enum `PaymentConditionStatus` | ✅ | Trạng thái điều kiện giải ngân: PENDING (chờ đạt) \| ACHIEVED (đã đạt) \| PAID (đã chi) \| CANCELLED (đã huỷ) \| MISSED (hết hạn không đạt) \| DISABLED (tạm dừng khi series HIATUS — BR-CONTRACT-07) |
| `lastTriggeredValue` | number | ✅ |  |
| `achievedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | PAYMENT_CONDITION_NOT_EDITABLE_STATUS_ACHIEVED_OR_MISSED |
| 403 | — | ONLY_ASSIGNED_EDITOR_CAN_MANAGE_PAYMENT_CONDITIONS |
| 404 | — | CONTRACT_NOT_FOUND |
| 404 | — | PAYMENT_CONDITION_NOT_FOUND |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "thresholdConfig": null,
  "payoutAmount": 1,
  "payoutPct": 1,
  "isRecurring": false
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "conditionType": "CHAPTER_MILESTONE",
    "thresholdConfig": null,
    "payoutAmount": 1000000,
    "payoutPct": 50,
    "isRecurring": false,
    "status": "PENDING",
    "lastTriggeredValue": 0,
    "achievedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /contracts/:contractId/payment-conditions/:conditionId/disable`
> Editor vô hiệu hóa điều kiện thanh toán

**Quyền:** EDITOR (Bearer)

**Response 200** (`PaymentConditionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `conditionType` | enum `ConditionType` | ✅ |  |
| `thresholdConfig` | any | ✅ | Cấu hình ngưỡng theo conditionType (JSON — xem mô tả route) |
| `payoutAmount` | number | ✅ | Số tiền chi khi điều kiện đạt |
| `payoutPct` | number | ✅ |  |
| `isRecurring` | boolean | ✅ |  |
| `status` | enum `PaymentConditionStatus` | ✅ | Trạng thái điều kiện giải ngân: PENDING (chờ đạt) \| ACHIEVED (đã đạt) \| PAID (đã chi) \| CANCELLED (đã huỷ) \| MISSED (hết hạn không đạt) \| DISABLED (tạm dừng khi series HIATUS — BR-CONTRACT-07) |
| `lastTriggeredValue` | number | ✅ |  |
| `achievedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | PAYMENT_CONDITION_NOT_EDITABLE_STATUS_ACHIEVED_OR_MISSED |
| 403 | — | ONLY_ASSIGNED_EDITOR_CAN_MANAGE_PAYMENT_CONDITIONS |
| 404 | — | CONTRACT_NOT_FOUND |
| 404 | — | PAYMENT_CONDITION_NOT_FOUND |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "conditionType": "CHAPTER_MILESTONE",
    "thresholdConfig": null,
    "payoutAmount": 1000000,
    "payoutPct": 50,
    "isRecurring": false,
    "status": "PENDING",
    "lastTriggeredValue": 0,
    "achievedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:id/revenue`
> Board/Editor nhập doanh thu kỳ cho HĐ REVENUE_SHARE → chia theo ownership split (B-CON-07)

**Quyền:** BOARD_MEMBER, EDITOR (Bearer)

**Body** (`ReportRevenueBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `revenue` | number (≥ 0) ✍ | ✅ |  |
| `period` | string (1..∞ ký tự) ✍ | ✅ | Kỳ (chuỗi tự do, vd 2026-Q1) |

**Response 201** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | — | ONLY_ASSIGNED_EDITOR_CAN_EDIT |
| 404 | — | CONTRACT_NOT_FOUND |
| 409 | — | REVENUE_NOT_APPLICABLE - contract must be REVENUE_SHARE and FULLY_EXECUTED to report revenue |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "revenue": 1,
  "period": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /contracts/:id/versions`
> Danh sách phiên bản hợp đồng

**Quyền:** EDITOR, MANGAKA, BOARD_MEMBER (Bearer)

**Response 200** :

_(xem envelope §0 — data có thể null)_

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "contractId": "507f1f77bcf86cd799439011",
      "versionNumber": 1,
      "valuationAmount": 1000000,
      "publisherOwnershipPct": 50,
      "mangakaOwnershipPct": 50,
      "terminationClause": "string",
      "editedById": "507f1f77bcf86cd799439011",
      "note": "Nội dung mẫu",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `GET /contracts/:id/versions/:versionId`
> Chi tiết một phiên bản hợp đồng

**Quyền:** EDITOR, MANGAKA, BOARD_MEMBER (Bearer)

**Response 200** (`ContractVersionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `versionNumber` | number | ✅ | Số thứ tự bản nộp |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `editedById` | string | ✅ |  |
| `note` | string | ✅ | Ghi chú text tự do |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "versionNumber": 1,
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "editedById": "507f1f77bcf86cd799439011",
    "note": "Nội dung mẫu",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /contracts/:id/pdf` 🆕
> Spec 24 — xuất hợp đồng đã ký ra PDF (văn bản chính thức)

**Quyền:** EDITOR, MANGAKA, BOARD_MEMBER (Bearer) — cùng luật xem như `GET /contracts/:id`:
BOARD_MEMBER xem tất; EDITOR/MANGAKA chỉ hợp đồng của mình.

**Nghiệp vụ:** hệ thống render PDF tiếng Việt (1 template chuẩn của NXB) từ dữ liệu đã có
(Contract + PaymentCondition + ContractVersion + ContractSignature + Series/User + BoardDecision/BoardSession),
đẩy lên object storage rồi trả **presigned URL** để FE tải. **BE không giữ bytes** sau request (BR-STORAGE).

**Chỉ xuất được khi hợp đồng ĐÃ KÝ KHOÁ.** `status` phải ∈
`FULLY_EXECUTED | FULFILLED | TERMINATED | TERMINATED_BY_BREACH | EXPIRED`.
Không có bản nháp, không watermark — PDF là văn bản chính thức duy nhất.

**Idempotent theo phiên bản nội dung:** key file = `contracts/{contractId}/contract-v{soVersion}-a{soAmendmentDaThucThi}.pdf`.
Gọi lại nhiều lần → **cùng `key`**, không render lại. Khi một Amendment `FULLY_EXECUTED` (nội dung đổi)
→ lần gọi kế tiếp sinh **key mới**; file cũ giữ nguyên làm vết đối chiếu.

**Không có body.** Không có query param.

**Response 200** (`ContractPdfRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `downloadUrl` | string | ✅ | Presigned GET URL — mở/tải trực tiếp, KHÔNG kèm `Authorization`. **Có hạn** (mặc định 600s) → xin lại khi hết hạn, đừng cache lâu |
| `expiresAt` | string (ISO 8601) | ✅ | Thời điểm `downloadUrl` hết hiệu lực (UTC) |
| `key` | string | ✅ | Object key trên storage. Dùng để so sánh phiên bản: `key` không đổi ⇒ nội dung hợp đồng chưa đổi |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.ContractAccessDenied` | caller ngoài cuộc (không phải Editor/Mangaka của HĐ, không phải BOARD_MEMBER). Body có thêm `errors[{path:'id'}]` |
| 404 | `CONTRACT_NOT_FOUND` | id rác (không 24-hex) hoặc hợp đồng không tồn tại. ⚠ Mã **raw legacy**, không phải dạng `Error.*` — so đúng chuỗi này |
| 409 | `Error.ContractNotExecutedForPdf` | 🆕 hợp đồng chưa `FULLY_EXECUTED` (vd đang `DRAFT`/`NEGOTIATION`/`MANGAKA_SIGNED`/`VOIDED`) |

> Giá trị `code` ở bảng trên đã **verify bằng response thật** (smoke Spec 24 + flow-06, 2026-07-20), không phải suy đoán từ tên exception. `message` luôn là câu tiếng Việt hiển thị được.

**FE nên làm:**

- Ở màn chi tiết hợp đồng, chỉ hiện nút **"Tải hợp đồng PDF"** khi `status` thuộc 5 giá trị ở trên —
  tránh cho user bấm rồi ăn 409.
- Bấm nút → `GET /contracts/:id/pdf` → mở `data.downloadUrl` (tab mới hoặc `<a download>`).
  **Đừng** gắn header `Authorization` vào `downloadUrl` (URL đã tự ký; thêm header có thể làm hỏng chữ ký).
- Nội dung PDF hiển thị ngày giờ theo **giờ VN (UTC+7)**; API vẫn trả/lưu ISO UTC như mọi nơi khác.

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "downloadUrl": "uploads/507f1f77bcf86cd799439011/anh.png",
    "expiresAt": "2026-07-20T09:30:00.000Z",
    "key": "uploads/507f1f77bcf86cd799439011/anh.png"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:contractId/amendments`
> Editor tạo phụ lục hợp đồng đã FULLY_EXECUTED → DRAFT (B-CON-08)

**Quyền:** EDITOR (Bearer)

**Body** (`CreateAmendmentBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `changedClauses` | string[] ✍ | ✅ |  |
| `reason` | string (1..∞ ký tự) ✍ | — | Lý do (text tự do, hiển thị cho bên liên quan) |
| `valuationAmount` | number (≥ 0) ✍ | — | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number (≥ 0, ≤ 100) ✍ | — | % sở hữu của NXB |
| `mangakaOwnershipPct` | number (≥ 0, ≤ 100) ✍ | — | % sở hữu của Mangaka |
| `terminationClause` | string (1..∞ ký tự) ✍ | — | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) ✍ | — |  |
| `contractEnd` | string (regex, ISO 8601) ✍ | — |  |

**Response 201** (`AmendmentRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `changedClauses` | string[] | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `status` | enum `ContractAmendmentStatus` | ✅ | Vòng đời phụ lục hợp đồng: DRAFT → PENDING_SIGNATURES → FULLY_EXECUTED \| VOIDED (reject → về DRAFT) |
| `triggerSource` | enum `AmendmentTrigger` | ✅ | Nguồn phát sinh phụ lục: MANUAL (Editor tự tạo) \| FORMAT_CHANGE \| COMPLETION (từ quyết định Flow 5 — BR-CONTRACT-06) |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `fullyExecutedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `voidReason` | string | ✅ |  |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `signatures` | object[] | — |  |
| `signatures[].id` | string | ✅ | ObjectId của bản ghi |
| `signatures[].amendmentId` | string | ✅ |  |
| `signatures[].userId` | string | ✅ | ObjectId của User |
| `signatures[].role` | string | ✅ |  |
| `signatures[].signedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | — | ONLY_ASSIGNED_EDITOR_CAN_EDIT |
| 404 | — | CONTRACT_NOT_FOUND |
| 409 | `Error.ContractNotAmendable` | contract must be FULLY_EXECUTED to create an amendment (BR-CONTRACT-01) |
| 409 | `Error.OpenAmendmentExists` | contract already has a non-terminal amendment (DRAFT/PENDING_SIGNATURES) |
| 422 | `Error.OwnershipMismatch` | ownership split must total 100; FULL_BUYOUT stays 100/0 |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "changedClauses": [
    "string"
  ],
  "reason": "Nội dung mẫu",
  "valuationAmount": 1,
  "publisherOwnershipPct": 1,
  "mangakaOwnershipPct": 1,
  "terminationClause": "string",
  "contractStart": "2026-07-20T09:30:00.000Z",
  "contractEnd": "2026-07-20T09:30:00.000Z"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "changedClauses": [
      "string"
    ],
    "reason": "Nội dung mẫu",
    "status": "DRAFT",
    "triggerSource": "MANUAL",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "fullyExecutedAt": "2026-07-20T09:30:00.000Z",
    "voidReason": "Nội dung mẫu",
    "createdBy": "string",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "createdAt": "2026-07-20T09:30:00.000Z",
    "signatures": [
      {
        "id": "507f1f77bcf86cd799439011",
        "amendmentId": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "role": "string",
        "signedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /contracts/:contractId/amendments`
> Danh sách phụ lục của hợp đồng
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** EDITOR, MANGAKA, BOARD_MEMBER (Bearer)

**Response 200** :

_(xem envelope §0 — data có thể null)_

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "contractId": "507f1f77bcf86cd799439011",
      "changedClauses": [
        "string"
      ],
      "reason": "Nội dung mẫu",
      "status": "DRAFT",
      "triggerSource": "MANUAL",
      "valuationAmount": 1000000,
      "publisherOwnershipPct": 50,
      "mangakaOwnershipPct": 50,
      "terminationClause": "string",
      "contractStart": "2026-07-20T09:30:00.000Z",
      "contractEnd": "2026-07-20T09:30:00.000Z",
      "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
      "boardSignedAt": "2026-07-20T09:30:00.000Z",
      "fullyExecutedAt": "2026-07-20T09:30:00.000Z",
      "voidReason": "Nội dung mẫu",
      "createdBy": "string",
      "creator": {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      },
      "createdAt": "2026-07-20T09:30:00.000Z",
      "signatures": [
        {
          "id": "507f1f77bcf86cd799439011",
          "amendmentId": "507f1f77bcf86cd799439011",
          "userId": "507f1f77bcf86cd799439011",
          "role": "string",
          "signedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `GET /contracts/:contractId/amendments/:id`
> Chi tiết một phụ lục

**Quyền:** EDITOR, MANGAKA, BOARD_MEMBER (Bearer)

**Response 200** (`AmendmentRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `changedClauses` | string[] | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `status` | enum `ContractAmendmentStatus` | ✅ | Vòng đời phụ lục hợp đồng: DRAFT → PENDING_SIGNATURES → FULLY_EXECUTED \| VOIDED (reject → về DRAFT) |
| `triggerSource` | enum `AmendmentTrigger` | ✅ | Nguồn phát sinh phụ lục: MANUAL (Editor tự tạo) \| FORMAT_CHANGE \| COMPLETION (từ quyết định Flow 5 — BR-CONTRACT-06) |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `fullyExecutedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `voidReason` | string | ✅ |  |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `signatures` | object[] | — |  |
| `signatures[].id` | string | ✅ | ObjectId của bản ghi |
| `signatures[].amendmentId` | string | ✅ |  |
| `signatures[].userId` | string | ✅ | ObjectId của User |
| `signatures[].role` | string | ✅ |  |
| `signatures[].signedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.AmendmentNotFound` | amendment id not found under this contract |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "changedClauses": [
      "string"
    ],
    "reason": "Nội dung mẫu",
    "status": "DRAFT",
    "triggerSource": "MANUAL",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "fullyExecutedAt": "2026-07-20T09:30:00.000Z",
    "voidReason": "Nội dung mẫu",
    "createdBy": "string",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "createdAt": "2026-07-20T09:30:00.000Z",
    "signatures": [
      {
        "id": "507f1f77bcf86cd799439011",
        "amendmentId": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "role": "string",
        "signedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /contracts/:contractId/amendments/:id`
> Editor sửa phụ lục khi DRAFT (reset chữ ký)

**Quyền:** EDITOR (Bearer)

**Body** (`UpdateAmendmentBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `changedClauses` | string[] ✍ | — |  |
| `reason` | string (1..∞ ký tự) ✍ | — | Lý do (text tự do, hiển thị cho bên liên quan) |
| `valuationAmount` | number (≥ 0) ✍ | — | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number (≥ 0, ≤ 100) ✍ | — | % sở hữu của NXB |
| `mangakaOwnershipPct` | number (≥ 0, ≤ 100) ✍ | — | % sở hữu của Mangaka |
| `terminationClause` | string (1..∞ ký tự) ✍ | — | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) ✍ | — |  |
| `contractEnd` | string (regex, ISO 8601) ✍ | — |  |

**Response 200** (`AmendmentRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `changedClauses` | string[] | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `status` | enum `ContractAmendmentStatus` | ✅ | Vòng đời phụ lục hợp đồng: DRAFT → PENDING_SIGNATURES → FULLY_EXECUTED \| VOIDED (reject → về DRAFT) |
| `triggerSource` | enum `AmendmentTrigger` | ✅ | Nguồn phát sinh phụ lục: MANUAL (Editor tự tạo) \| FORMAT_CHANGE \| COMPLETION (từ quyết định Flow 5 — BR-CONTRACT-06) |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `fullyExecutedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `voidReason` | string | ✅ |  |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `signatures` | object[] | — |  |
| `signatures[].id` | string | ✅ | ObjectId của bản ghi |
| `signatures[].amendmentId` | string | ✅ |  |
| `signatures[].userId` | string | ✅ | ObjectId của User |
| `signatures[].role` | string | ✅ |  |
| `signatures[].signedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.AmendmentNotFound` | amendment id not found under this contract |
| 409 | `Error.AmendmentNotEditable` | amendment can only be edited while DRAFT |
| 422 | `Error.OwnershipMismatch` | ownership split must total 100; FULL_BUYOUT stays 100/0 |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "changedClauses": [
    "string"
  ],
  "reason": "Nội dung mẫu",
  "valuationAmount": 1,
  "publisherOwnershipPct": 1,
  "mangakaOwnershipPct": 1,
  "terminationClause": "string",
  "contractStart": "2026-07-20T09:30:00.000Z",
  "contractEnd": "2026-07-20T09:30:00.000Z"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "changedClauses": [
      "string"
    ],
    "reason": "Nội dung mẫu",
    "status": "DRAFT",
    "triggerSource": "MANUAL",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "fullyExecutedAt": "2026-07-20T09:30:00.000Z",
    "voidReason": "Nội dung mẫu",
    "createdBy": "string",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "createdAt": "2026-07-20T09:30:00.000Z",
    "signatures": [
      {
        "id": "507f1f77bcf86cd799439011",
        "amendmentId": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "role": "string",
        "signedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:contractId/amendments/:id/submit`
> Editor trình phụ lục để ký (DRAFT → PENDING_SIGNATURES)

**Quyền:** EDITOR (Bearer)

**Response 200** (`AmendmentRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `changedClauses` | string[] | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `status` | enum `ContractAmendmentStatus` | ✅ | Vòng đời phụ lục hợp đồng: DRAFT → PENDING_SIGNATURES → FULLY_EXECUTED \| VOIDED (reject → về DRAFT) |
| `triggerSource` | enum `AmendmentTrigger` | ✅ | Nguồn phát sinh phụ lục: MANUAL (Editor tự tạo) \| FORMAT_CHANGE \| COMPLETION (từ quyết định Flow 5 — BR-CONTRACT-06) |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `fullyExecutedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `voidReason` | string | ✅ |  |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `signatures` | object[] | — |  |
| `signatures[].id` | string | ✅ | ObjectId của bản ghi |
| `signatures[].amendmentId` | string | ✅ |  |
| `signatures[].userId` | string | ✅ | ObjectId của User |
| `signatures[].role` | string | ✅ |  |
| `signatures[].signedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.AmendmentNotFound` | amendment id not found under this contract |
| 409 | `Error.AmendmentNotSubmittable` | amendment can only be submitted while DRAFT |
| 422 | `Error.AmendmentNoChanges` | submit requires at least one changed term + non-empty changedClauses |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "changedClauses": [
      "string"
    ],
    "reason": "Nội dung mẫu",
    "status": "DRAFT",
    "triggerSource": "MANUAL",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "fullyExecutedAt": "2026-07-20T09:30:00.000Z",
    "voidReason": "Nội dung mẫu",
    "createdBy": "string",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "createdAt": "2026-07-20T09:30:00.000Z",
    "signatures": [
      {
        "id": "507f1f77bcf86cd799439011",
        "amendmentId": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "role": "string",
        "signedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:contractId/amendments/:id/sign/mangaka`
> Mangaka ký phụ lục bằng OTP (chỉ REVENUE_SHARE)

**Quyền:** MANGAKA (Bearer)

**Body** (`SignAmendmentBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `otpCode` | string (6..6 ký tự) ✍ | ✅ |  |

**Response 201** (`AmendmentRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `changedClauses` | string[] | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `status` | enum `ContractAmendmentStatus` | ✅ | Vòng đời phụ lục hợp đồng: DRAFT → PENDING_SIGNATURES → FULLY_EXECUTED \| VOIDED (reject → về DRAFT) |
| `triggerSource` | enum `AmendmentTrigger` | ✅ | Nguồn phát sinh phụ lục: MANUAL (Editor tự tạo) \| FORMAT_CHANGE \| COMPLETION (từ quyết định Flow 5 — BR-CONTRACT-06) |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `fullyExecutedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `voidReason` | string | ✅ |  |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `signatures` | object[] | — |  |
| `signatures[].id` | string | ✅ | ObjectId của bản ghi |
| `signatures[].amendmentId` | string | ✅ |  |
| `signatures[].userId` | string | ✅ | ObjectId của User |
| `signatures[].role` | string | ✅ |  |
| `signatures[].signedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotContractMangaka` | caller không phải Mangaka của hợp đồng (⚠ đổi từ ONLY_ASSIGNED_EDITOR_CAN_EDIT — 2026-07-17) |
| 409 | `Error.AmendmentNotPendingSignatures` | amendment must be PENDING_SIGNATURES to sign/reject |
| 409 | — | MangakaSignNotRequired |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "otpCode": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "changedClauses": [
      "string"
    ],
    "reason": "Nội dung mẫu",
    "status": "DRAFT",
    "triggerSource": "MANUAL",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "fullyExecutedAt": "2026-07-20T09:30:00.000Z",
    "voidReason": "Nội dung mẫu",
    "createdBy": "string",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "createdAt": "2026-07-20T09:30:00.000Z",
    "signatures": [
      {
        "id": "507f1f77bcf86cd799439011",
        "amendmentId": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "role": "string",
        "signedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:contractId/amendments/:id/sign/board`
> Board ký phụ lục bằng OTP

**Quyền:** BOARD_MEMBER (Bearer)

**Body** (`SignAmendmentBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `otpCode` | string (6..6 ký tự) ✍ | ✅ |  |

**Response 201** (`AmendmentRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `changedClauses` | string[] | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `status` | enum `ContractAmendmentStatus` | ✅ | Vòng đời phụ lục hợp đồng: DRAFT → PENDING_SIGNATURES → FULLY_EXECUTED \| VOIDED (reject → về DRAFT) |
| `triggerSource` | enum `AmendmentTrigger` | ✅ | Nguồn phát sinh phụ lục: MANUAL (Editor tự tạo) \| FORMAT_CHANGE \| COMPLETION (từ quyết định Flow 5 — BR-CONTRACT-06) |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `fullyExecutedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `voidReason` | string | ✅ |  |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `signatures` | object[] | — |  |
| `signatures[].id` | string | ✅ | ObjectId của bản ghi |
| `signatures[].amendmentId` | string | ✅ |  |
| `signatures[].userId` | string | ✅ | ObjectId của User |
| `signatures[].role` | string | ✅ |  |
| `signatures[].signedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | BOARD_MEMBER_ALREADY_SIGNED |
| 403 | — | NOT_AUTHORIZED_IN_BOARD |
| 409 | `Error.AmendmentNotPendingSignatures` | amendment must be PENDING_SIGNATURES to sign/reject |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "otpCode": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "changedClauses": [
      "string"
    ],
    "reason": "Nội dung mẫu",
    "status": "DRAFT",
    "triggerSource": "MANUAL",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "fullyExecutedAt": "2026-07-20T09:30:00.000Z",
    "voidReason": "Nội dung mẫu",
    "createdBy": "string",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "createdAt": "2026-07-20T09:30:00.000Z",
    "signatures": [
      {
        "id": "507f1f77bcf86cd799439011",
        "amendmentId": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "role": "string",
        "signedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:contractId/amendments/:id/reject`
> Mangaka từ chối phụ lục → về DRAFT (chỉ REVENUE_SHARE)

**Quyền:** MANGAKA (Bearer)

**Body** (`RejectAmendmentBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..∞ ký tự) ✍ | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 200** (`AmendmentRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `changedClauses` | string[] | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `status` | enum `ContractAmendmentStatus` | ✅ | Vòng đời phụ lục hợp đồng: DRAFT → PENDING_SIGNATURES → FULLY_EXECUTED \| VOIDED (reject → về DRAFT) |
| `triggerSource` | enum `AmendmentTrigger` | ✅ | Nguồn phát sinh phụ lục: MANUAL (Editor tự tạo) \| FORMAT_CHANGE \| COMPLETION (từ quyết định Flow 5 — BR-CONTRACT-06) |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `fullyExecutedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `voidReason` | string | ✅ |  |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `signatures` | object[] | — |  |
| `signatures[].id` | string | ✅ | ObjectId của bản ghi |
| `signatures[].amendmentId` | string | ✅ |  |
| `signatures[].userId` | string | ✅ | ObjectId của User |
| `signatures[].role` | string | ✅ |  |
| `signatures[].signedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotContractMangaka` | caller không phải Mangaka của hợp đồng (⚠ đổi từ ONLY_ASSIGNED_EDITOR_CAN_EDIT — 2026-07-17) |
| 409 | `Error.AmendmentNotPendingSignatures` | amendment must be PENDING_SIGNATURES to sign/reject |
| 409 | — | MangakaSignNotRequired |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "changedClauses": [
      "string"
    ],
    "reason": "Nội dung mẫu",
    "status": "DRAFT",
    "triggerSource": "MANUAL",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "fullyExecutedAt": "2026-07-20T09:30:00.000Z",
    "voidReason": "Nội dung mẫu",
    "createdBy": "string",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "createdAt": "2026-07-20T09:30:00.000Z",
    "signatures": [
      {
        "id": "507f1f77bcf86cd799439011",
        "amendmentId": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "role": "string",
        "signedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `POST /contracts/:contractId/amendments/:id/void`
> Editor hủy phụ lục (non-terminal → VOIDED)

**Quyền:** EDITOR (Bearer)

**Body** (`VoidAmendmentBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `voidReason` | string (1..∞ ký tự) ✍ | ✅ |  |

**Response 200** (`AmendmentRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `changedClauses` | string[] | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `status` | enum `ContractAmendmentStatus` | ✅ | Vòng đời phụ lục hợp đồng: DRAFT → PENDING_SIGNATURES → FULLY_EXECUTED \| VOIDED (reject → về DRAFT) |
| `triggerSource` | enum `AmendmentTrigger` | ✅ | Nguồn phát sinh phụ lục: MANUAL (Editor tự tạo) \| FORMAT_CHANGE \| COMPLETION (từ quyết định Flow 5 — BR-CONTRACT-06) |
| `valuationAmount` | number | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `publisherOwnershipPct` | number | ✅ | % sở hữu của NXB |
| `mangakaOwnershipPct` | number | ✅ | % sở hữu của Mangaka |
| `terminationClause` | string | ✅ | Điều khoản bồi thường khi hủy (text) |
| `contractStart` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `contractEnd` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `mangakaSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `fullyExecutedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `voidReason` | string | ✅ |  |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `signatures` | object[] | — |  |
| `signatures[].id` | string | ✅ | ObjectId của bản ghi |
| `signatures[].amendmentId` | string | ✅ |  |
| `signatures[].userId` | string | ✅ | ObjectId của User |
| `signatures[].role` | string | ✅ |  |
| `signatures[].signedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | — | ONLY_ASSIGNED_EDITOR_CAN_EDIT |
| 404 | `Error.AmendmentNotFound` | amendment id not found under this contract |
| 409 | `Error.AmendmentNotVoidable` | amendment is already terminal (FULLY_EXECUTED/VOIDED) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "voidReason": "Nội dung mẫu"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "changedClauses": [
      "string"
    ],
    "reason": "Nội dung mẫu",
    "status": "DRAFT",
    "triggerSource": "MANUAL",
    "valuationAmount": 1000000,
    "publisherOwnershipPct": 50,
    "mangakaOwnershipPct": 50,
    "terminationClause": "string",
    "contractStart": "2026-07-20T09:30:00.000Z",
    "contractEnd": "2026-07-20T09:30:00.000Z",
    "mangakaSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "fullyExecutedAt": "2026-07-20T09:30:00.000Z",
    "voidReason": "Nội dung mẫu",
    "createdBy": "string",
    "creator": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "createdAt": "2026-07-20T09:30:00.000Z",
    "signatures": [
      {
        "id": "507f1f77bcf86cd799439011",
        "amendmentId": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "role": "string",
        "signedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /payments`
> Danh sách payment toàn hệ thống (filter status/receiver/series/contract/type/source)
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `status` | enum `PaymentRecordStatus` | — | Trạng thái khoản chi: TRIGGERED (điều kiện đạt) \| PENDING (chờ xử lý) → APPROVED (Board duyệt) → PAID (đã trả); MISSED/FAILED/CANCELLED = không chi trả |
| `receiverId` | string | — |  |
| `seriesId` | string | — | ObjectId của Series |
| `contractId` | string | — | ObjectId của Contract |
| `paymentType` | enum `PaymentType` | — | Loại khoản chi cho Mangaka: CONDITION_PAYOUT (đạt điều kiện) \| REVENUE_SHARE (chia lợi nhuận định kỳ) \| COMPENSATION (đền bù khi huỷ series) \| CHAPTER_MILESTONE \| RECURRING_CHAPTER \| RANKING_MILESTONE \| TIME_BOUND (các payout theo điều kiện) \| TRANSFER (liên quan chuyển nhượng) |
| `paymentSource` | enum `PaymentSource` | — | Nguồn phát sinh khoản chi: CONTRACT (hợp đồng gốc) \| REPRINT (tái bản) \| TRANSFER (chuyển nhượng) \| TERMINATION (huỷ/kết thúc hợp đồng) \| MANUAL (tạo thủ công) |

**Response 200** (`PaymentRecordListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `data` | object[] | ✅ |  |
| `data[].id` | string | ✅ | ObjectId của bản ghi |
| `data[].contractId` | string | ✅ | ObjectId của Contract |
| `data[].conditionId` | string | ✅ |  |
| `data[].receiverId` | string | ✅ |  |
| `data[].seriesId` | string | ✅ | ObjectId của Series |
| `data[].description` | string | ✅ |  |
| `data[].approvedBy` | string | ✅ |  |
| `data[].approvedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].paymentType` | enum `PaymentType` | ✅ |  |
| `data[].paymentSource` | enum `PaymentSource` | ✅ |  |
| `data[].amount` | number | ✅ | Số tiền |
| `data[].period` | string | ✅ | Kỳ (chuỗi tự do, vd 2026-Q1) |
| `data[].paymentMethod` | string | ✅ |  |
| `data[].transactionReference` | string | ✅ |  |
| `data[].status` | enum `PaymentRecordStatus` | ✅ |  |
| `data[].paidAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].cancelledAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].cancelReason` | string | ✅ |  |
| `data[].note` | string | ✅ | Ghi chú text tự do |
| `data[].createdBy` | string | ✅ |  |
| `data[].createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "data": [
      {
        "id": "507f1f77bcf86cd799439011",
        "contractId": "507f1f77bcf86cd799439011",
        "conditionId": "507f1f77bcf86cd799439011",
        "receiverId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "description": "Nội dung mẫu",
        "approvedBy": "string",
        "approvedAt": "2026-07-20T09:30:00.000Z",
        "paymentType": "CONDITION_PAYOUT",
        "paymentSource": "CONTRACT",
        "amount": 1000000,
        "period": "string",
        "paymentMethod": "string",
        "transactionReference": "string",
        "status": "TRIGGERED",
        "paidAt": "2026-07-20T09:30:00.000Z",
        "cancelledAt": "2026-07-20T09:30:00.000Z",
        "cancelReason": "Nội dung mẫu",
        "note": "Nội dung mẫu",
        "createdBy": "string",
        "createdAt": "2026-07-20T09:30:00.000Z",
        "series": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu"
        },
        "receiver": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "approver": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /payments/:id`
> Chi tiết một payment record
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** BOARD_MEMBER, SUPER_ADMIN, MANGAKA, EDITOR (Bearer)

**Response 200** (`PaymentRecordRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `conditionId` | string | ✅ |  |
| `receiverId` | string | ✅ |  |
| `seriesId` | string | ✅ | ObjectId của Series |
| `description` | string | ✅ |  |
| `approvedBy` | string | ✅ |  |
| `approvedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `paymentType` | enum `PaymentType` | ✅ |  |
| `paymentSource` | enum `PaymentSource` | ✅ |  |
| `amount` | number | ✅ | Số tiền |
| `period` | string | ✅ | Kỳ (chuỗi tự do, vd 2026-Q1) |
| `paymentMethod` | string | ✅ |  |
| `transactionReference` | string | ✅ |  |
| `status` | enum `PaymentRecordStatus` | ✅ |  |
| `paidAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `cancelledAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `cancelReason` | string | ✅ |  |
| `note` | string | ✅ | Ghi chú text tự do |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | — | PAYMENT_RECORD_NOT_FOUND |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "conditionId": "507f1f77bcf86cd799439011",
    "receiverId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "description": "Nội dung mẫu",
    "approvedBy": "string",
    "approvedAt": "2026-07-20T09:30:00.000Z",
    "paymentType": "CONDITION_PAYOUT",
    "paymentSource": "CONTRACT",
    "amount": 1000000,
    "period": "string",
    "paymentMethod": "string",
    "transactionReference": "string",
    "status": "TRIGGERED",
    "paidAt": "2026-07-20T09:30:00.000Z",
    "cancelledAt": "2026-07-20T09:30:00.000Z",
    "cancelReason": "Nội dung mẫu",
    "note": "Nội dung mẫu",
    "createdBy": "string",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "receiver": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "approver": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /payments/contracts/:id/payments`
> Danh sách payment theo contractId
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Response 200** (`PaymentRecordListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `data` | object[] | ✅ |  |
| `data[].id` | string | ✅ | ObjectId của bản ghi |
| `data[].contractId` | string | ✅ | ObjectId của Contract |
| `data[].conditionId` | string | ✅ |  |
| `data[].receiverId` | string | ✅ |  |
| `data[].seriesId` | string | ✅ | ObjectId của Series |
| `data[].description` | string | ✅ |  |
| `data[].approvedBy` | string | ✅ |  |
| `data[].approvedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].paymentType` | enum `PaymentType` | ✅ |  |
| `data[].paymentSource` | enum `PaymentSource` | ✅ |  |
| `data[].amount` | number | ✅ | Số tiền |
| `data[].period` | string | ✅ | Kỳ (chuỗi tự do, vd 2026-Q1) |
| `data[].paymentMethod` | string | ✅ |  |
| `data[].transactionReference` | string | ✅ |  |
| `data[].status` | enum `PaymentRecordStatus` | ✅ |  |
| `data[].paidAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].cancelledAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].cancelReason` | string | ✅ |  |
| `data[].note` | string | ✅ | Ghi chú text tự do |
| `data[].createdBy` | string | ✅ |  |
| `data[].createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "data": [
      {
        "id": "507f1f77bcf86cd799439011",
        "contractId": "507f1f77bcf86cd799439011",
        "conditionId": "507f1f77bcf86cd799439011",
        "receiverId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "description": "Nội dung mẫu",
        "approvedBy": "string",
        "approvedAt": "2026-07-20T09:30:00.000Z",
        "paymentType": "CONDITION_PAYOUT",
        "paymentSource": "CONTRACT",
        "amount": 1000000,
        "period": "string",
        "paymentMethod": "string",
        "transactionReference": "string",
        "status": "TRIGGERED",
        "paidAt": "2026-07-20T09:30:00.000Z",
        "cancelledAt": "2026-07-20T09:30:00.000Z",
        "cancelReason": "Nội dung mẫu",
        "note": "Nội dung mẫu",
        "createdBy": "string",
        "createdAt": "2026-07-20T09:30:00.000Z",
        "series": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu"
        },
        "receiver": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "approver": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /payments/series/:id/payments`
> Danh sách payment theo seriesId

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Response 200** (`PaymentRecordListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `data` | object[] | ✅ |  |
| `data[].id` | string | ✅ | ObjectId của bản ghi |
| `data[].contractId` | string | ✅ | ObjectId của Contract |
| `data[].conditionId` | string | ✅ |  |
| `data[].receiverId` | string | ✅ |  |
| `data[].seriesId` | string | ✅ | ObjectId của Series |
| `data[].description` | string | ✅ |  |
| `data[].approvedBy` | string | ✅ |  |
| `data[].approvedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].paymentType` | enum `PaymentType` | ✅ |  |
| `data[].paymentSource` | enum `PaymentSource` | ✅ |  |
| `data[].amount` | number | ✅ | Số tiền |
| `data[].period` | string | ✅ | Kỳ (chuỗi tự do, vd 2026-Q1) |
| `data[].paymentMethod` | string | ✅ |  |
| `data[].transactionReference` | string | ✅ |  |
| `data[].status` | enum `PaymentRecordStatus` | ✅ |  |
| `data[].paidAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].cancelledAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].cancelReason` | string | ✅ |  |
| `data[].note` | string | ✅ | Ghi chú text tự do |
| `data[].createdBy` | string | ✅ |  |
| `data[].createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "data": [
      {
        "id": "507f1f77bcf86cd799439011",
        "contractId": "507f1f77bcf86cd799439011",
        "conditionId": "507f1f77bcf86cd799439011",
        "receiverId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "description": "Nội dung mẫu",
        "approvedBy": "string",
        "approvedAt": "2026-07-20T09:30:00.000Z",
        "paymentType": "CONDITION_PAYOUT",
        "paymentSource": "CONTRACT",
        "amount": 1000000,
        "period": "string",
        "paymentMethod": "string",
        "transactionReference": "string",
        "status": "TRIGGERED",
        "paidAt": "2026-07-20T09:30:00.000Z",
        "cancelledAt": "2026-07-20T09:30:00.000Z",
        "cancelReason": "Nội dung mẫu",
        "note": "Nội dung mẫu",
        "createdBy": "string",
        "createdAt": "2026-07-20T09:30:00.000Z",
        "series": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu"
        },
        "receiver": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "approver": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /payments/users/:id/payments`
> Danh sách payment theo receiverId

**Quyền:** MANGAKA, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Response 200** (`PaymentRecordListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `data` | object[] | ✅ |  |
| `data[].id` | string | ✅ | ObjectId của bản ghi |
| `data[].contractId` | string | ✅ | ObjectId của Contract |
| `data[].conditionId` | string | ✅ |  |
| `data[].receiverId` | string | ✅ |  |
| `data[].seriesId` | string | ✅ | ObjectId của Series |
| `data[].description` | string | ✅ |  |
| `data[].approvedBy` | string | ✅ |  |
| `data[].approvedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].paymentType` | enum `PaymentType` | ✅ |  |
| `data[].paymentSource` | enum `PaymentSource` | ✅ |  |
| `data[].amount` | number | ✅ | Số tiền |
| `data[].period` | string | ✅ | Kỳ (chuỗi tự do, vd 2026-Q1) |
| `data[].paymentMethod` | string | ✅ |  |
| `data[].transactionReference` | string | ✅ |  |
| `data[].status` | enum `PaymentRecordStatus` | ✅ |  |
| `data[].paidAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].cancelledAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `data[].cancelReason` | string | ✅ |  |
| `data[].note` | string | ✅ | Ghi chú text tự do |
| `data[].createdBy` | string | ✅ |  |
| `data[].createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "data": [
      {
        "id": "507f1f77bcf86cd799439011",
        "contractId": "507f1f77bcf86cd799439011",
        "conditionId": "507f1f77bcf86cd799439011",
        "receiverId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "description": "Nội dung mẫu",
        "approvedBy": "string",
        "approvedAt": "2026-07-20T09:30:00.000Z",
        "paymentType": "CONDITION_PAYOUT",
        "paymentSource": "CONTRACT",
        "amount": 1000000,
        "period": "string",
        "paymentMethod": "string",
        "transactionReference": "string",
        "status": "TRIGGERED",
        "paidAt": "2026-07-20T09:30:00.000Z",
        "cancelledAt": "2026-07-20T09:30:00.000Z",
        "cancelReason": "Nội dung mẫu",
        "note": "Nội dung mẫu",
        "createdBy": "string",
        "createdAt": "2026-07-20T09:30:00.000Z",
        "series": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu"
        },
        "receiver": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "approver": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /payments/:id/approve`
> Board duyệt payment → APPROVED

**Quyền:** BOARD_MEMBER (Bearer)

**Body** (`ApprovePaymentBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `approvedBy` | string (1..∞ ký tự) ✍ | ✅ |  |

**Response 200** (`PaymentRecordRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `conditionId` | string | ✅ |  |
| `receiverId` | string | ✅ |  |
| `seriesId` | string | ✅ | ObjectId của Series |
| `description` | string | ✅ |  |
| `approvedBy` | string | ✅ |  |
| `approvedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `paymentType` | enum `PaymentType` | ✅ |  |
| `paymentSource` | enum `PaymentSource` | ✅ |  |
| `amount` | number | ✅ | Số tiền |
| `period` | string | ✅ | Kỳ (chuỗi tự do, vd 2026-Q1) |
| `paymentMethod` | string | ✅ |  |
| `transactionReference` | string | ✅ |  |
| `status` | enum `PaymentRecordStatus` | ✅ |  |
| `paidAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `cancelledAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `cancelReason` | string | ✅ |  |
| `note` | string | ✅ | Ghi chú text tự do |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | INVALID_STATUS_FOR_APPROVAL_EXPECTED_TRIGGERED |
| 404 | — | PAYMENT_RECORD_NOT_FOUND |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "conditionId": "507f1f77bcf86cd799439011",
    "receiverId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "description": "Nội dung mẫu",
    "approvedBy": "string",
    "approvedAt": "2026-07-20T09:30:00.000Z",
    "paymentType": "CONDITION_PAYOUT",
    "paymentSource": "CONTRACT",
    "amount": 1000000,
    "period": "string",
    "paymentMethod": "string",
    "transactionReference": "string",
    "status": "TRIGGERED",
    "paidAt": "2026-07-20T09:30:00.000Z",
    "cancelledAt": "2026-07-20T09:30:00.000Z",
    "cancelReason": "Nội dung mẫu",
    "note": "Nội dung mẫu",
    "createdBy": "string",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "receiver": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "approver": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /payments/:id/pay`
> Board/Admin xác nhận đã thanh toán → PAID

**Quyền:** BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Body** (`PayPaymentBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `paymentMethod` | string (1..∞ ký tự) ✍ | ✅ |  |
| `transactionReference` | string (1..∞ ký tự) ✍ | ✅ |  |
| `note` | string ✍ | — | Ghi chú text tự do |

**Response 200** (`PaymentRecordRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `conditionId` | string | ✅ |  |
| `receiverId` | string | ✅ |  |
| `seriesId` | string | ✅ | ObjectId của Series |
| `description` | string | ✅ |  |
| `approvedBy` | string | ✅ |  |
| `approvedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `paymentType` | enum `PaymentType` | ✅ |  |
| `paymentSource` | enum `PaymentSource` | ✅ |  |
| `amount` | number | ✅ | Số tiền |
| `period` | string | ✅ | Kỳ (chuỗi tự do, vd 2026-Q1) |
| `paymentMethod` | string | ✅ |  |
| `transactionReference` | string | ✅ |  |
| `status` | enum `PaymentRecordStatus` | ✅ |  |
| `paidAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `cancelledAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `cancelReason` | string | ✅ |  |
| `note` | string | ✅ | Ghi chú text tự do |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | INVALID_STATUS_FOR_PAYMENT_EXPECTED_APPROVED |
| 404 | — | PAYMENT_RECORD_NOT_FOUND |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "paymentMethod": "string",
  "transactionReference": "string",
  "note": "Nội dung mẫu"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "conditionId": "507f1f77bcf86cd799439011",
    "receiverId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "description": "Nội dung mẫu",
    "approvedBy": "string",
    "approvedAt": "2026-07-20T09:30:00.000Z",
    "paymentType": "CONDITION_PAYOUT",
    "paymentSource": "CONTRACT",
    "amount": 1000000,
    "period": "string",
    "paymentMethod": "string",
    "transactionReference": "string",
    "status": "TRIGGERED",
    "paidAt": "2026-07-20T09:30:00.000Z",
    "cancelledAt": "2026-07-20T09:30:00.000Z",
    "cancelReason": "Nội dung mẫu",
    "note": "Nội dung mẫu",
    "createdBy": "string",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "receiver": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "approver": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /payments/:id/cancel`
> Board/Admin hủy payment chưa PAID → CANCELLED

**Quyền:** BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Body** (`CancelPaymentBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `cancelReason` | string (1..∞ ký tự) ✍ | ✅ |  |

**Response 200** (`PaymentRecordRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `contractId` | string | ✅ | ObjectId của Contract |
| `conditionId` | string | ✅ |  |
| `receiverId` | string | ✅ |  |
| `seriesId` | string | ✅ | ObjectId của Series |
| `description` | string | ✅ |  |
| `approvedBy` | string | ✅ |  |
| `approvedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `paymentType` | enum `PaymentType` | ✅ |  |
| `paymentSource` | enum `PaymentSource` | ✅ |  |
| `amount` | number | ✅ | Số tiền |
| `period` | string | ✅ | Kỳ (chuỗi tự do, vd 2026-Q1) |
| `paymentMethod` | string | ✅ |  |
| `transactionReference` | string | ✅ |  |
| `status` | enum `PaymentRecordStatus` | ✅ |  |
| `paidAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `cancelledAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `cancelReason` | string | ✅ |  |
| `note` | string | ✅ | Ghi chú text tự do |
| `createdBy` | string | ✅ |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | PAYMENT_ALREADY_PAID_CANNOT_CANCEL |
| 404 | — | PAYMENT_RECORD_NOT_FOUND |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "cancelReason": "Nội dung mẫu"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "contractId": "507f1f77bcf86cd799439011",
    "conditionId": "507f1f77bcf86cd799439011",
    "receiverId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "description": "Nội dung mẫu",
    "approvedBy": "string",
    "approvedAt": "2026-07-20T09:30:00.000Z",
    "paymentType": "CONDITION_PAYOUT",
    "paymentSource": "CONTRACT",
    "amount": 1000000,
    "period": "string",
    "paymentMethod": "string",
    "transactionReference": "string",
    "status": "TRIGGERED",
    "paidAt": "2026-07-20T09:30:00.000Z",
    "cancelledAt": "2026-07-20T09:30:00.000Z",
    "cancelReason": "Nội dung mẫu",
    "note": "Nội dung mẫu",
    "createdBy": "string",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "receiver": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "approver": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

## §5. Flow 2 — Chapter Production (chapter-first)

**Nghiệp vụ (chapter-first):** slot chương (số + tiêu đề + deadline) tạo **TRƯỚC** → Mangaka vẽ **Name** (storyboard) gắn vào chapter → Editor duyệt Name (checkpoint #1 — sửa storyboard rẻ hơn sửa bản vẽ thật) → khi Name `APPROVED` mới được **upload page** → phân vùng + giao task trợ lý (Flow 3, §6) → Mangaka duyệt bản tổng hợp → nộp Editor final check → duyệt → **publish** (bị gate bởi Contract FULLY_EXECUTED). Series có co-owner (PARTIAL_TRANSFER, Flow 8) thì publish phải qua co-owner duyệt.

**State machine Manuscript:** `DRAFT → IN_PRODUCTION → EDITOR_REVIEW ⇄ EDITOR_REVISION → READY_FOR_PRINT → [AWAITING_CO_OWNER_APPROVAL] → PUBLISHED`. `Chapter.status` là giá trị **dẫn xuất** (DRAFT = name-phase → IN_PRODUCTION → PUBLISHED).

### Happy path

1. **Mangaka** `POST /chapters` `{seriesId, chapterNumber, title?}` → Chapter `DRAFT` + Manuscript `DRAFT` + Schedule. (Sửa `PATCH /chapters/:id`; xoá slot nhầm `DELETE /chapters/:id` — chỉ DRAFT, cascade.)
2. **Editor** đặt deadline: `PUT /chapters/:id/schedule`; gia hạn đơn phương: `PATCH /chapters/:id/schedule/extend` (giữ lịch sử). *(Thương lượng 2 chiều → Flow 10, §8.)*
3. **Mangaka** tạo Name: `POST /chapters/:id/names` → Name **`DRAFT`** (derive chapterNumber). ⚠ **Đổi hành vi:** chapter-Name **KHÔNG còn tự SUBMITTED** — sinh ở `DRAFT` để Mangaka sửa trang thoải mái (`PUT/POST /chapters/:id/names/:nameId/pages`), sửa cả `title`/`chapterNumber` qua `PATCH /chapters/:id`; **bấm `POST /chapters/:id/names/:nameId/submit`** mới sang `SUBMITTED` (vào tầm Editor). Vẽ hỏng chưa duyệt cũng có thể `DELETE /chapters/:id/names/:nameId` rồi tạo lại.
4. **Vòng duyệt Name** (route chapter-scoped): Editor `POST /chapters/:id/names/:nameId/request-revision` → Mangaka sửa trang (`PUT/POST .../pages`) → `.../resubmit` → Editor `.../approve` → **mở gate page**.
5. **Mangaka** upload trang: `POST /chapters/:id/pages` (object key từ §14) — Page sinh `DRAFT`, trang đầu tiên đẩy Manuscript `IN_PRODUCTION`. `PATCH /pages/:pageId` chỉ sửa file, không nhận `status`.
6. Mangaka review/approve task (Flow 3). Khi chapter có ít nhất 1 page và mọi Task không-CANCELLED đều `APPROVED`, **Mangaka** `POST /chapters/:id/manuscript/submit`; backend bulk Page `DRAFT→COMPLETED` và Manuscript → `EDITOR_REVIEW`.
7. **Editor** `request-revision` → backend bulk Page `COMPLETED→REVISING`; Mangaka sửa và resolve hết RevisionRequest mở, rồi `resubmit` → bulk `REVISING|DRAFT→COMPLETED` + Manuscript `EDITOR_REVIEW`.
8. **Editor** đạt → `POST /chapters/:id/manuscript/approve` → `READY_FOR_PRINT`.
9. **Editor** `POST /chapters/:id/publish` → `PUBLISHED` + `publishedAt` (kích hoạt đếm mốc thanh toán Flow 6 + đủ điều kiện lên ranking Flow 4). Series có co-owner → sang `AWAITING_CO_OWNER_APPROVAL`, co-owner `POST /chapters/:id/co-owner-approve|reject`.
10. Theo dõi: `GET /chapters/:id/progress` (Editor/Mangaka/Board — poll 10–30s): `pagesReady/pagesPending` theo Task, taskBreakdown, deadline còn lại, `progressPct`, `warningLevel`, `onHold`.

**Tạm ngưng giữa chừng (hiatus cấp chương):** Editor `POST /chapters/:id/hold` `{reason, expectedReturnDate?}` — đóng băng (mọi mutation sản xuất → 409), `POST /chapters/:id/resume` khôi phục.

**Annotation (markup dùng chung):** `POST /annotations` (targetType PAGE/REGION/TASK/MANUSCRIPT/NAME + coordinates + TEXT/HIGHLIGHT/DRAWING) · `GET /annotations?targetType=&targetId=` (bắt buộc cả 2) · `PATCH /annotations/:id/resolve` · `DELETE /annotations/:id` (chỉ tác giả). Dùng cho cả Editor→Mangaka lẫn Mangaka→Assistant.

### Unhappy cases

| Tình huống | API | Kết quả |
|---|---|---|
| Tạo chapter khi series chưa SERIALIZED | `POST /chapters` | 409 `Error.SeriesNotSerialized` |
| Series CANCELLING đã hết quota chương kết thúc | `POST /chapters` | 409 `Error.EndingAllowanceExceeded` |
| Trùng số chương | `POST /chapters` / `PATCH` | 409 `Error.DuplicateChapterNumber` |
| Upload page khi Name chưa APPROVED | `POST /chapters/:id/pages` | 409 `Error.ChapterNameNotApproved` |
| Tạo Name khi chapter đã có Name | `POST /chapters/:id/names` | 409 `Error.ChapterNameAlreadyExists` |
| Tạo Name khi chapter không còn DRAFT | `POST /chapters/:id/names` | 409 `Error.ChapterNotDraftForName` |
| Xoá Name đã APPROVED / chapter hết DRAFT | `DELETE /chapters/:id/names/:nameId` | 409 `Error.NameNotDeletable` |
| Đổi `chapterNumber` khi hết DRAFT | `PATCH /chapters/:id` | 409 `Error.ChapterNumberLocked` |
| Đổi `title` sau PUBLISHED | `PATCH /chapters/:id` | 409 `Error.ChapterNotEditable` |
| Xoá chapter hết DRAFT | `DELETE /chapters/:id` | 409 `Error.ChapterNotDeletable` |
| Submit manuscript khi chapter chưa có page | manuscript/submit | 409 `Error.NoPagesToSubmit` |
| Submit/resubmit khi còn Task không-CANCELLED chưa APPROVED | manuscript/submit, resubmit | 409 `Error.TasksNotAllApproved` |
| Resubmit khi còn RevisionRequest mở | manuscript/resubmit | 409 `Error.RevisionNotResolved` |
| Sửa Page/Region/Task/AI khi Page COMPLETED | pages/regions/tasks/segment | 409 `Error.PageNotEditable` |
| Chuyển manuscript sai bậc | manuscript/* | 409 `Error.InvalidManuscriptTransition` |
| Publish khi chưa READY_FOR_PRINT | publish | 409 |
| **Publish khi series chưa có Contract FULLY_EXECUTED** | publish | 409 `Error.ContractNotExecuted` *(ngoại lệ: series CANCELLING/COMPLETING được bypass để ra chương kết thúc)* |
| Mutation khi chapter đang hold | pages/tasks/manuscript | 409 `Error.ChapterOnHold` |
| Không phải co-owner mà gọi co-owner-approve | co-owner-approve/reject | 403 `Error.NotCoOwner` |
| Co-owner im lặng quá hạn grace | (cron) | approval → `ESCALATED`, Board + Editor được notify |
| Người ngoài series thao tác | mọi route | 403 (`Error.NotSeriesOwner` / `Error.NotAssignedEditor`) |
| Annotation thiếu targetType/targetId khi list | `GET /annotations` | 422 |
| Annotation target không tồn tại | `POST /annotations` | 422 `Error.AnnotationTargetNotFound` |
| Xoá annotation của người khác | `DELETE /annotations/:id` | 403 `Error.AnnotationForbidden` |

### API Reference

#### `POST /chapters`
> Mangaka tạo Chapter (chapter-first): chapterNumber + title → Chapter(DRAFT) + Manuscript(DRAFT) + Schedule. Name tạo sau.

**Quyền:** MANGAKA (Bearer)

**Body** (`CreateChapterBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `seriesId` | string (1..∞ ký tự) ✍ | ✅ | ObjectId của Series |
| `chapterNumber` | integer (≥ 0) ✍ | ✅ | Số thứ tự chương trong series |
| `title` | string (0..200 ký tự) ✍ | — | Tiêu đề (FE tự nhập) |

**Response 201** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.DuplicateChapterNumber` | chapter number already exists in this series |
| 409 | `Error.SeriesNotSerialized` | Series phải ở SERIALIZED (hoặc CANCELLING/COMPLETING cho chương kết thúc) mới tạo được chapter |
| 409 | `Error.EndingAllowanceExceeded` | Series CANCELLING đã tạo đủ số chương kết thúc Board cấp (endingChapterAllowance) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "seriesId": "507f1f77bcf86cd799439011",
  "chapterNumber": 1,
  "title": "Tiêu đề mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /chapters`
> List chapter theo seriesId (query)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `seriesId` | string | ✅ | ObjectId của Series |

**Response 200** (`ChapterListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].seriesId` | string | ✅ | ObjectId của Series |
| `items[].nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `items[].chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `items[].title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `items[].totalPages` | number | ✅ | Tổng số trang của chương |
| `items[].status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `items[].publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `items[].hold` | object | ✅ | null = chapter is not on hold |
| `items[].manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `items[].schedule` | object | ✅ |  |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "nameId": "507f1f77bcf86cd799439011",
        "chapterNumber": 1,
        "title": "Tiêu đề mẫu",
        "totalPages": 1,
        "status": "DRAFT",
        "publishedAt": "2026-07-20T09:30:00.000Z",
        "hold": {
          "reason": "Nội dung mẫu",
          "expectedReturnDate": "2026-07-20T09:30:00.000Z",
          "heldBy": "string",
          "heldAt": "2026-07-20T09:30:00.000Z"
        },
        "manuscriptStatus": "DRAFT",
        "schedule": {
          "id": "507f1f77bcf86cd799439011",
          "chapterId": "507f1f77bcf86cd799439011",
          "originalDeadline": "2026-07-20T09:30:00.000Z",
          "currentDeadline": "2026-07-20T09:30:00.000Z",
          "extended": false,
          "extensions": [
            {
              "extendedBy": "string",
              "previousDeadline": "2026-07-20T09:30:00.000Z",
              "newDeadline": "2026-07-20T09:30:00.000Z",
              "reason": "Nội dung mẫu",
              "extendedAt": "2026-07-20T09:30:00.000Z"
            }
          ]
        }
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /chapters/:id`
> Chi tiết 1 chapter (kèm manuscript/schedule)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Response 200** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /chapters/:id`
> Mangaka sửa title (pre-PUBLISHED) / chapterNumber (chỉ khi DRAFT) — chapter-first

**Quyền:** MANGAKA (Bearer)

**Body** (`UpdateChapterBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `title` | string (0..200 ký tự) ✍ | — | Tiêu đề (FE tự nhập) |
| `chapterNumber` | integer ✍ | — | Số thứ tự chương trong series |

**Response 200** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.ChapterNotEditable` | chapter title cannot be changed after PUBLISHED |
| 409 | `Error.ChapterNumberLocked` | chapterNumber can only be changed while the chapter is in DRAFT status |
| 409 | `Error.DuplicateChapterNumber` | chapter number already exists in this series |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "title": "Tiêu đề mẫu",
  "chapterNumber": 1
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `DELETE /chapters/:id`
> Mangaka xóa chapter DRAFT (cascade Name/Manuscript/Schedule/Pages) — chapter-first

**Quyền:** MANGAKA (Bearer)

**Response 200** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.ChapterNotDeletable` | chapter can only be deleted while in DRAFT status |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/names`
> Mangaka tạo chapter-Name (storyboard) cho chapter DRAFT — chapter-first

**Quyền:** MANGAKA (Bearer)

> ⚠️ **Đổi hành vi (Spec 14 / Option A):** chapter-Name sinh ở trạng thái **`DRAFT`** (KHÔNG còn tự `SUBMITTED`). Ở `DRAFT`, Mangaka **sửa trang thoải mái** (`PUT/POST .../pages`) + sửa `title`/`chapterNumber` chương qua `PATCH /chapters/:id`; xong bấm **`POST /chapters/:id/names/:nameId/submit`** mới sang `SUBMITTED` (vào tầm Editor). FE cần bổ sung nút **"Nộp Name"**.

**Body** (`CreateChapterNameBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `namePages` | object[] | ✅ | Các trang storyboard Name |
| `namePages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `namePages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |

**Response 201** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.ChapterNotDraftForName` | chapter must be in DRAFT status to create a Name |
| 409 | `Error.ChapterNameAlreadyExists` | this chapter already has a Name assigned |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "namePages": [
    {
      "pageNumber": 1,
      "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  ]
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/names/:nameId/submit`
> Mangaka nộp chapter-Name lên Editor duyệt → `DRAFT` chuyển `SUBMITTED` (Option A, Spec 14)

**Quyền:** MANGAKA (Bearer)

Không có body. Chỉ chuyển được khi Name đang `DRAFT`; sau `SUBMITTED`, Editor mới thao tác được (request-revision/approve) và trang bị khóa sửa (`.../pages` → 409).

**Response 201** (`NameRes` — đọc `res.data`): shape y hệt `POST /chapters/:id/names` ở trên; `status` = `SUBMITTED`, `submittedAt` được set.

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | không phải Mangaka chủ series |
| 404 | `Error.ChapterNotFound` | chapter không tồn tại / id rác |
| 404 | `Error.NameNotFound` | Name không thuộc chapter này (hoặc id rác) |
| 409 | `Error.InvalidNameState` | Name không ở `DRAFT` (đã nộp/đang duyệt/đã duyệt) |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /chapters/:id/names`
> List Name của chapter (thực tế 0..1)

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Response 200** (`NameListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].seriesId` | string | ✅ | ObjectId của Series |
| `items[].chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `items[].chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `items[].kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `items[].status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `items[].version` | number | ✅ | Tăng mỗi lần resubmit |
| `items[].pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `items[].submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | current user cannot access this series |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "chapterId": "507f1f77bcf86cd799439011",
        "chapterNumber": 1,
        "kind": "PROPOSAL",
        "status": "DRAFT",
        "version": 1,
        "pages": [
          {
            "pageNumber": 1,
            "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
          }
        ],
        "submittedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /chapters/:id/names/:nameId`
> Chi tiết Name của chapter

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Response 200** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | current user cannot access this series |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 404 | `Error.NameNotFound` | name does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/names/:nameId/request-revision`
> Editor phụ trách yêu cầu sửa Name của chapter → REVISION

**Quyền:** EDITOR (Bearer)

**Body** (`ReasonBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (0..1000 ký tự) ✍ | — | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 201** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 404 | `Error.NameNotFound` | name does not exist |
| 409 | `Error.InvalidNameState` | name state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/names/:nameId/resubmit`
> Mangaka nộp lại Name của chapter → IN_REVIEW, version++

**Quyền:** MANGAKA (Bearer)

**Response 201** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 404 | `Error.NameNotFound` | name does not exist |
| 409 | `Error.InvalidNameState` | name state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/names/:nameId/approve`
> Editor duyệt Name của chapter → APPROVED (mở gate upload page)

**Quyền:** EDITOR (Bearer)

**Response 201** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 404 | `Error.NameNotFound` | name does not exist |
| 409 | `Error.InvalidNameState` | name state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PUT /chapters/:id/names/:nameId/pages`
> Mangaka thay TOÀN BỘ trang Name của chapter (chỉ DRAFT/REVISION)

**Quyền:** MANGAKA (Bearer)

**Body** (`UpdateNamePagesBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `pages` | object[] | ✅ |  |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |

**Response 200** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 404 | `Error.NameNotFound` | name does not exist |
| 409 | `Error.InvalidNameState` | name state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "pages": [
    {
      "pageNumber": 1,
      "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  ]
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/names/:nameId/pages`
> Mangaka thêm 1 trang vào Name của chapter (append; chỉ DRAFT/REVISION)

**Quyền:** MANGAKA (Bearer)

**Body** (`AddNamePageBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `pageNumber` | integer (≥ 1) ✍ | ✅ | Số thứ tự trang trong chương |
| `fileUrl` | string (1..∞ ký tự) ✍ | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |

**Response 201** (`NameRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `chapterId` | string | ✅ | null = proposal-Name; có giá trị = Name của chapter đó |
| `chapterNumber` | number | ✅ | null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER) |
| `kind` | enum `NameKind` | ✅ | Name storyboard kind: PROPOSAL (proposal chapter-sample) or CHAPTER (per-chapter storyboard) |
| `status` | enum `NameStatus` | ✅ | Name/chapter-name review status |
| `version` | number | ✅ | Tăng mỗi lần resubmit |
| `pages` | object[] | ✅ | Các trang vẽ thô; fileUrl là object key (R2) |
| `pages[].pageNumber` | integer (≥ 1) | ✅ | Số thứ tự trang trong chương |
| `pages[].fileUrl` | string (1..∞ ký tự) | ✅ | Object key file trên R2 (xin qua POST /uploads/sign) |
| `submittedAt` | string | ✅ | ISO 8601; null khi chưa submit |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 404 | `Error.NameNotFound` | name does not exist |
| 409 | `Error.InvalidNameState` | name state does not allow this action |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "pageNumber": 1,
  "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "kind": "PROPOSAL",
    "status": "DRAFT",
    "version": 1,
    "pages": [
      {
        "pageNumber": 1,
        "fileUrl": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "submittedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `DELETE /chapters/:id/names/:nameId`
> Mangaka xoá Name của chapter để vẽ lại (chỉ chapter DRAFT + Name chưa APPROVED)

**Quyền:** MANGAKA (Bearer)

**Response 200** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 404 | `Error.NameNotFound` | name does not exist |
| 409 | `Error.NameNotDeletable` | only a not-yet-approved Name on a DRAFT chapter can be deleted |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/pages`
> Mangaka upload trang (pencil/ink) → tạo Page (DRAFT)

**Quyền:** MANGAKA (Bearer)

**Body** (`CreatePageBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `pageNumber` | integer (≥ 1) ✍ | ✅ | Số thứ tự trang trong chương |
| `originalFile` | string (1..∞ ký tự) ✍ | ✅ | Object key file trang gốc (pencil/ink của Mangaka) |

**Response 201** (`PageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `chapterId` | string | ✅ | ObjectId của Chapter |
| `pageNumber` | number | ✅ | Số thứ tự trang trong chương |
| `originalFile` | string | ✅ | Object key file gốc (pencil/ink) trên R2 |
| `compositeFile` | string | ✅ | Object key file composite trên R2 |
| `displayFile` | string | ✅ | 🆕 **Ảnh nên hiển thị** = `compositeFile ?? originalFile`. FE render field này là đủ, khỏi tự fallback |
| `status` | enum `PageStatus` | ✅ | Page production status |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |
| 409 | `Error.ChapterNameNotApproved` | Name must be APPROVED before uploading pages; create/approve the Name first |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "pageNumber": 1,
  "originalFile": "uploads/507f1f77bcf86cd799439011/anh.png"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "pageNumber": 1,
    "originalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "compositeFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "displayFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "status": "DRAFT",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /chapters/:id/pages`
> List trang của chapter (đã siết scoping)

**Quyền:** MANGAKA chủ series · EDITOR phụ trách · ASSISTANT có `StudioAssignment` ACTIVE với Mangaka đó · BOARD_MEMBER · SUPER_ADMIN (Bearer)

> 🔴 **BREAKING 2026-07-21.** Trước đây route này chỉ cần đăng nhập (không kiểm sở hữu) nên **mọi user đọc được `originalFile` của mọi chapter**. Nay có scoping theo sở hữu/phân công (BR-AUTH-00): ngoài phạm vi → **403 `Error.ChapterAccessDenied`**.
> - Assistant chỉ đọc được trang của studio mình đang cộng tác (cùng gate BR-ASSIST-01 dùng khi giao task).
> - FE phải xử lý 403 ở màn đọc trang thay vì giả định luôn 200.

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.ChapterAccessDenied` | không phải chủ series / editor phụ trách / assistant đang cộng tác |
| 404 | `Error.ChapterNotFound` | chapter không tồn tại hoặc id không phải ObjectId |

**Response 200** (`PageListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].chapterId` | string | ✅ | ObjectId của Chapter |
| `items[].pageNumber` | number | ✅ | Số thứ tự trang trong chương |
| `items[].originalFile` | string | ✅ | Object key file gốc (pencil/ink) trên R2 |
| `items[].compositeFile` | string | ✅ | Object key file composite trên R2 |
| `items[].displayFile` | string | ✅ | 🆕 **Ảnh nên hiển thị** = `compositeFile ?? originalFile` |
| `items[].status` | enum `PageStatus` | ✅ | Page production status |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "chapterId": "507f1f77bcf86cd799439011",
        "pageNumber": 1,
        "originalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "compositeFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "displayFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "status": "DRAFT",
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /pages/:pageId`
> Mangaka cập nhật file gốc / composite / số trang khi Page DRAFT/REVISING; status do backend điều khiển

**Quyền:** MANGAKA (Bearer)

**Body** (`UpdatePageBody`) — partial-update: **omit hoặc `null` = giữ nguyên**:

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `compositeFile` | string (1..∞ ký tự) ✍ | — | Object key bản tổng hợp sau khi Assistant xong |
| `pageNumber` | number (int ≥ 1) | — | 🆕 Đổi số trang; trùng số trong cùng chapter → 409 |

> 🆕 **2026-07-21:** thêm `pageNumber`. **`originalFile` vẫn KHÔNG sửa được qua PATCH** (gửi vào → 422) — đó là *bản gốc pencil/ink*, là nguồn cho AI segment và cho Assistant tải về làm việc; cho đè sẽ hỏng cả hai. Muốn thay bản gốc: **xoá trang rồi upload lại** (`DELETE /pages/:pageId` + `POST /chapters/:id/pages`). Gửi lại đúng số trang hiện tại của chính nó → 200 (không coi là trùng).

**Response 200** (`PageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `chapterId` | string | ✅ | ObjectId của Chapter |
| `pageNumber` | number | ✅ | Số thứ tự trang trong chương |
| `originalFile` | string | ✅ | Object key file gốc (pencil/ink) trên R2 |
| `compositeFile` | string | ✅ | Object key file composite trên R2 |
| `displayFile` | string | ✅ | 🆕 **Ảnh nên hiển thị** = `compositeFile ?? originalFile`. FE render field này là đủ, khỏi tự fallback |
| `status` | enum `PageStatus` | ✅ | Page production status |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.PageNotFound` | page does not exist |
| 409 | `Error.PageNotEditable` | Page COMPLETED đang được review; không được sửa page hoặc tài nguyên con |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |
| 409 | `Error.DuplicatePageNumber` | 🆕 số trang đã có trang khác dùng trong cùng chapter |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "compositeFile": "uploads/507f1f77bcf86cd799439011/anh.png",
  "pageNumber": 1
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "pageNumber": 1,
    "originalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "compositeFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "displayFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "status": "DRAFT",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `DELETE /pages/:pageId`
> 🆕 Mangaka xoá một trang — cascade xoá luôn Region + Task của trang đó

**Quyền:** MANGAKA chủ series (Bearer)

**Nghiệp vụ:** dùng khi Mangaka upload nhầm trang hoặc bỏ một trang khỏi chương. Xoá trang thì mọi Region đã khoanh và mọi Task đã giao trên trang đó **không còn ý nghĩa** nên bị xoá cùng, trong **một transaction** (không có trạng thái nửa vời). Trợ lý đang giữ task bị xoá sẽ nhận notification.

> 🆕 **2026-07-21 — auto-renumber:** sau khi xoá, backend **dồn số các trang còn lại về `1..N` liên tục** (atomic cùng transaction xoá). Ví dụ chương có `[1,2,3,4]`, xoá trang 3 → còn `[1,2,3]` (trang 4 cũ tự thành số 3). **FE không phải PATCH lại số** — chỉ cần `GET` lại danh sách trang sau khi xoá là thấy số đã liền mạch.
>
> 🆕 **2026-07-21 — dọn file:** file gốc + composite của trang cũng được **xoá khỏi object storage (R2)** (best-effort). FE không phải làm gì thêm.

> ⚠️ Chỉ xoá được khi Page ở `DRAFT` hoặc `REVISING`. Page `COMPLETED` (đang nằm trong bản thảo Editor duyệt) bị khoá — xem Spec 19.

**Response 200** (`DeletePageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `pageId` | string | ✅ | ObjectId trang vừa xoá |
| `deletedRegions` | number | ✅ | Số vùng bị xoá theo trang |
| `deletedTasks` | number | ✅ | Số task bị xoá theo trang |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | không phải chủ series |
| 404 | `Error.PageNotFound` | trang không tồn tại, hoặc id không phải ObjectId 24-hex |
| 409 | `Error.PageNotEditable` | trang đang `COMPLETED` |
| 409 | `Error.PageHasApprovedTasks` | trang có task đã `APPROVED` — không xoá mất công trợ lý đã được duyệt |
| 409 | `Error.ChapterOnHold` | chương đang tạm dừng — resume trước đã |

**FE nên làm:** confirm dialog hiển thị trước số task sẽ mất (gọi `GET /tasks?pageId=...` để đếm), vì thao tác **không hoàn tác được**.

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "pageId": "507f1f77bcf86cd799439011",
    "deletedRegions": 2,
    "deletedTasks": 1
  }
}
```

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "pageId": "507f1f77bcf86cd799439011",
    "deletedRegions": 0,
    "deletedTasks": 0
  }
}
```

<!-- payload-example:end -->

---

#### `DELETE /chapters/:id/pages`
> 🆕 Mangaka xoá nhiều trang trong một chương — **all-or-nothing**, tối đa 50 id

**Quyền:** MANGAKA chủ series (Bearer)

**Body** (`DeletePagesBulkBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `pageIds` | string[] (1..50, mỗi phần tử ObjectId 24-hex) | ✅ | Danh sách trang cần xoá — phải **cùng** chapter `:id` |

**Nghiệp vụ — all-or-nothing:** backend validate **toàn bộ** danh sách trước; chỉ cần **một** id sai (không tồn tại / thuộc chapter khác / đang `COMPLETED`) thì **không trang nào bị xoá** và trả lỗi tương ứng. Không có trường hợp xoá được một nửa.

> 🆕 **2026-07-21:** sau khi xoá, các trang còn lại của chương được **dồn số về `1..N` liên tục** (như `DELETE /pages/:pageId`) và file gốc/composite được **dọn khỏi R2** (best-effort).

**Response 200** (`DeletePagesBulkRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `deletedPages` | number | ✅ | Số trang đã xoá |
| `deletedRegions` | number | ✅ | Tổng số vùng bị xoá theo |
| `deletedTasks` | number | ✅ | Tổng số task bị xoá theo |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | không phải chủ series |
| 404 | `Error.ChapterNotFound` | chapter không tồn tại |
| 404 | `Error.PageNotFound` | có id không tồn tại **hoặc** thuộc chapter khác |
| 409 | `Error.PageNotEditable` | có trang đang `COMPLETED` |
| 409 | `Error.PageHasApprovedTasks` | có trang chứa task đã `APPROVED` |
| 409 | `Error.ChapterOnHold` | chương đang tạm dừng |
| 422 | `Error.ValidationFailed` | `pageIds` rỗng, quá 50 phần tử, hoặc phần tử không phải ObjectId |

**Ví dụ request body:**

```json
{
  "pageIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "deletedPages": 2,
    "deletedRegions": 3,
    "deletedTasks": 2
  }
}
```

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "pageIds": [
    "507f1f77bcf86cd799439011"
  ]
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "deletedPages": 1,
    "deletedRegions": 0,
    "deletedTasks": 0
  }
}
```

<!-- payload-example:end -->

---


#### `POST /chapters/:id/manuscript/submit`
> Mangaka nộp manuscript cho Editor final check → EDITOR_REVIEW

**Quyền:** MANGAKA (Bearer)

**Response 201** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.InvalidManuscriptTransition` | manuscript state transition is not allowed |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/manuscript/request-revision`
> Editor yêu cầu sửa manuscript → EDITOR_REVISION (kèm Annotation)

**Quyền:** EDITOR (Bearer)

**Body** (`RevisionReasonBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..1000 ký tự) ✍ | ✅ | Lý do bắt buộc; được lưu vào lịch sử RevisionRequest và hiển thị cho bên phải sửa |

**Response 201** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesEditor` | current user is not the assigned series editor |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.InvalidManuscriptTransition` | manuscript state transition is not allowed |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/manuscript/resubmit`
> Mangaka nộp lại sau revision (resolve hết request mở và mọi task đạt gate) → EDITOR_REVIEW

**Quyền:** MANGAKA (Bearer)

**Response 201** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.InvalidManuscriptTransition` | manuscript state transition is not allowed |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/manuscript/approve`
> Editor duyệt manuscript → READY_FOR_PRINT

**Quyền:** EDITOR (Bearer)

**Response 201** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesEditor` | current user is not the assigned series editor |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.InvalidManuscriptTransition` | manuscript state transition is not allowed |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/publish`
> Editor xuất bản chapter (chỉ READY_FOR_PRINT) → PUBLISHED + emit chapter.published. Chặn nếu series chưa có Contract FULLY_EXECUTED (BR-CONTRACT-05). Co-owner gate: defer B3.

**Quyền:** EDITOR (Bearer)

**Response 201** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesEditor` | current user is not the assigned series editor |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.InvalidManuscriptTransition` | manuscript state transition is not allowed |
| 409 | `Error.PagesNotReadyForPublish` | 🆕 **2026-07-21** — bản thảo đã `READY_FOR_PRINT` nhưng chương còn trang chưa `COMPLETED` (trang thêm sau khi Editor duyệt → chưa qua duyệt). Nộp lại bản thảo (`manuscript/submit`) để trang mới được duyệt, hoặc xoá trang thừa, rồi publish. |
| 409 | `Error.ContractNotExecuted` | series has no FULLY_EXECUTED contract; cannot publish (BR-CONTRACT-05) |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/co-owner-approve`
> A-CHP-06: Co-owner (PARTIAL_TRANSFER) duyệt chapter đang AWAITING_CO_OWNER_APPROVAL → PUBLISHED

**Quyền:** MANGAKA (Bearer)

**Response 201** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotCoOwner` | only the series co-owner (PARTIAL_TRANSFER) can approve/reject this chapter |
| 404 | `Error.CoOwnerApprovalNotFound` | no co-owner approval record exists for this chapter |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.CoOwnerApprovalNotPending` | co-owner approval is not PENDING; already decided or escalated |
| 409 | `Error.InvalidManuscriptTransition` | manuscript state transition is not allowed |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/co-owner-reject`
> A-CHP-06: Co-owner từ chối → Manuscript về EDITOR_REVISION

**Quyền:** MANGAKA (Bearer)

**Body** (`ReasonBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (0..1000 ký tự) ✍ | — | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 201** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotCoOwner` | only the series co-owner (PARTIAL_TRANSFER) can approve/reject this chapter |
| 404 | `Error.CoOwnerApprovalNotFound` | no co-owner approval record exists for this chapter |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.CoOwnerApprovalNotPending` | co-owner approval is not PENDING; already decided or escalated |
| 409 | `Error.InvalidManuscriptTransition` | manuscript state transition is not allowed |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PUT /chapters/:id/schedule`
> Editor phụ trách set deadline gốc/hiện tại của chapter

**Quyền:** EDITOR (Bearer)

**Body** (`SetScheduleBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `originalDeadline` | string (regex, ISO 8601) ✍ | — | Deadline gốc khi tạo |
| `currentDeadline` | string (regex, ISO 8601) ✍ | — | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |

**Response 200** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesEditor` | current user is not the assigned series editor |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "originalDeadline": "2026-07-20T09:30:00.000Z",
  "currentDeadline": "2026-07-20T09:30:00.000Z"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /chapters/:id/schedule/extend`
> Editor gia hạn deadline → tạo ScheduleExtension (previous/new/reason), set extended=true

**Quyền:** EDITOR (Bearer)

**Body** (`ExtendDeadlineBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `newDeadline` | string (regex, ISO 8601) ✍ | ✅ |  |
| `reason` | string (0..1000 ký tự) ✍ | — | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 200** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesEditor` | current user is not the assigned series editor |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "newDeadline": "2026-07-20T09:30:00.000Z",
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/hold`
> Editor pauses chapter production with hold flag

**Quyền:** EDITOR (Bearer)

**Body** (`HoldChapterBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..∞ ký tự) ✍ | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `expectedReturnDate` | string (regex, ISO 8601) ✍ | — |  |

**Response 201** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesEditor` | current user is not the assigned series editor |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.ChapterNotHoldable` | manuscript must be IN_PRODUCTION..READY_FOR_PRINT to hold |
| 409 | `Error.ChapterAlreadyOnHold` | chapter is already on hold |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu",
  "expectedReturnDate": "2026-07-20T09:30:00.000Z"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /chapters/:id/resume`
> Editor resumes a chapter that is on hold

**Quyền:** EDITOR (Bearer)

**Response 201** (`ChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `nameId` | string | ✅ | ObjectId của Name (storyboard) |
| `chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `status` | enum `ChapterStatus` | ✅ | Chapter production status |
| `publishedAt` | string | ✅ | ISO 8601; null khi chưa xuất bản |
| `hold` | object | ✅ | null = chapter is not on hold |
| `hold.reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `hold.expectedReturnDate` | string | ✅ |  |
| `hold.heldBy` | string | ✅ |  |
| `hold.heldAt` | string | ✅ |  |
| `manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `schedule` | object | ✅ |  |
| `schedule.id` | string | ✅ | ObjectId của bản ghi |
| `schedule.chapterId` | string | ✅ | ObjectId của Chapter |
| `schedule.originalDeadline` | string | ✅ | Deadline gốc khi tạo |
| `schedule.currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `schedule.extended` | boolean | ✅ | true = đã từng gia hạn |
| `schedule.extensions` | object[] | ✅ | Lịch sử các lần gia hạn |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesEditor` | current user is not the assigned series editor |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |
| 409 | `Error.ChapterNotOnHold` | chapter is not on hold; nothing to resume |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "nameId": "507f1f77bcf86cd799439011",
    "chapterNumber": 1,
    "title": "Tiêu đề mẫu",
    "totalPages": 1,
    "status": "DRAFT",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "hold": {
      "reason": "Nội dung mẫu",
      "expectedReturnDate": "2026-07-20T09:30:00.000Z",
      "heldBy": "string",
      "heldAt": "2026-07-20T09:30:00.000Z"
    },
    "manuscriptStatus": "DRAFT",
    "schedule": {
      "id": "507f1f77bcf86cd799439011",
      "chapterId": "507f1f77bcf86cd799439011",
      "originalDeadline": "2026-07-20T09:30:00.000Z",
      "currentDeadline": "2026-07-20T09:30:00.000Z",
      "extended": false,
      "extensions": [
        {
          "extendedBy": "string",
          "previousDeadline": "2026-07-20T09:30:00.000Z",
          "newDeadline": "2026-07-20T09:30:00.000Z",
          "reason": "Nội dung mẫu",
          "extendedAt": "2026-07-20T09:30:00.000Z"
        }
      ]
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /chapters/:id/progress`
> Chapter progress dashboard for owner editor, mangaka, board, or super admin

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Response 200** (`ChapterProgressRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `chapterId` | string | ✅ | ObjectId của Chapter |
| `nameStatus` | enum `NameStatus` | ✅ | null = chapter không gắn Name |
| `totalPages` | number | ✅ | Tổng số trang của chương |
| `pagesReady` | number | ✅ | Page không có task hoặc mọi Task không-CANCELLED đều APPROVED |
| `pagesPending` | number | ✅ | `totalPages - pagesReady` |
| `taskBreakdown` | object | ✅ |  |
| `taskBreakdown.assigned` | number | ✅ |  |
| `taskBreakdown.inProgress` | number | ✅ |  |
| `taskBreakdown.submitted` | number | ✅ |  |
| `taskBreakdown.underReview` | number | ✅ |  |
| `taskBreakdown.approved` | number | ✅ |  |
| `taskBreakdown.revisionRequested` | number | ✅ |  |
| `taskBreakdown.onHold` | number | ✅ |  |
| `taskBreakdown.cancelled` | number | ✅ |  |
| `deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `remainingHours` | number | ✅ |  |
| `progressPct` | number | ✅ |  |
| `warningLevel` | enum(NONE, YELLOW, RED, CRITICAL) | ✅ | Deadline warning: NONE an toan, YELLOW nguy co, RED kho kip, CRITICAL qua han |
| `onHold` | boolean | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.ChapterAccessDenied` | caller is outside the chapter scope (owner mangaka / assigned editor / board / admin) |
| 404 | `Error.ChapterNotFound` | chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "chapterId": "507f1f77bcf86cd799439011",
    "nameStatus": "DRAFT",
    "totalPages": 1,
    "pagesReady": 1,
    "pagesPending": 1,
    "taskBreakdown": {
      "assigned": 0,
      "inProgress": 0,
      "submitted": 0,
      "underReview": 0,
      "approved": 0,
      "revisionRequested": 0,
      "onHold": 0,
      "cancelled": 0
    },
    "deadline": "2026-07-20T09:30:00.000Z",
    "remainingHours": 0,
    "progressPct": 50,
    "warningLevel": "NONE",
    "onHold": false
  }
}
```

<!-- payload-example:end -->

---

#### `POST /annotations`
> Tạo annotation/markup (TEXT/HIGHLIGHT/DRAWING + coordinates) trên target (Page/Region/Task/Manuscript/Name)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Body** (`CreateAnnotationBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `targetType` | enum `AnnotationTargetType` | ✅ | Annotation target: PAGE, REGION, TASK, MANUSCRIPT, NAME |
| `targetId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `annotationType` | enum `AnnotationType` | ✅ | Annotation type: TEXT, HIGHLIGHT, DRAWING |
| `coordinates` | object | — | Toạ độ vùng trên trang {x,y,width,height} — pixel trên ảnh gốc |
| `content` | string (0..5000 ký tự) ✍ | — | Nội dung text |
| `reviewStage` | enum `ReviewStage` | — | Review stage: ASSISTANT, MANGAKA, EDITOR |
| `taskId` | string ✍ | — | ObjectId của Task |

**Response 201** (`AnnotationRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `taskId` | string | ✅ | ObjectId của Task |
| `authorId` | string | ✅ |  |
| `authorRole` | string | ✅ | RoleCode của người tạo annotation: Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `targetType` | enum `AnnotationTargetType` | ✅ | Annotation target: PAGE, REGION, TASK, MANUSCRIPT, NAME |
| `targetId` | string | ✅ |  |
| `annotationType` | enum `AnnotationType` | ✅ | Annotation type: TEXT, HIGHLIGHT, DRAWING |
| `reviewStage` | enum `ReviewStage` | ✅ | Review stage: ASSISTANT, MANGAKA, EDITOR |
| `coordinates` | object | ✅ | Toạ độ vùng trên trang {x,y,width,height} — pixel trên ảnh gốc |
| `content` | string | ✅ | Nội dung text |
| `isResolved` | boolean | ✅ | true = annotation đã được xử lý xong |
| `resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 422 | — | Error.AnnotationTargetNotFound (targetId) - targetId does not exist (or malformed id) for the chosen targetType

Validation fail (targetType/targetId/annotationType/...) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "targetType": "PAGE",
  "targetId": "507f1f77bcf86cd799439011",
  "annotationType": "TEXT",
  "coordinates": {},
  "content": "Nội dung mẫu",
  "reviewStage": "ASSISTANT",
  "taskId": "507f1f77bcf86cd799439011"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "taskId": "507f1f77bcf86cd799439011",
    "authorId": "507f1f77bcf86cd799439011",
    "authorRole": "string",
    "targetType": "PAGE",
    "targetId": "507f1f77bcf86cd799439011",
    "annotationType": "TEXT",
    "reviewStage": "ASSISTANT",
    "coordinates": {},
    "content": "Nội dung mẫu",
    "isResolved": false,
    "resolvedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "author": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /annotations`
> List annotation theo targetType + targetId
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `targetType` | enum `AnnotationTargetType` | ✅ | Annotation target: PAGE, REGION, TASK, MANUSCRIPT, NAME |
| `targetId` | string (1..∞ ký tự) | ✅ |  |

**Response 200** (`AnnotationListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].taskId` | string | ✅ | ObjectId của Task |
| `items[].authorId` | string | ✅ |  |
| `items[].authorRole` | string | ✅ | RoleCode của người tạo annotation: Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `items[].targetType` | enum `AnnotationTargetType` | ✅ | Annotation target: PAGE, REGION, TASK, MANUSCRIPT, NAME |
| `items[].targetId` | string | ✅ |  |
| `items[].annotationType` | enum `AnnotationType` | ✅ | Annotation type: TEXT, HIGHLIGHT, DRAWING |
| `items[].reviewStage` | enum `ReviewStage` | ✅ | Review stage: ASSISTANT, MANGAKA, EDITOR |
| `items[].coordinates` | object | ✅ | Toạ độ vùng trên trang {x,y,width,height} — pixel trên ảnh gốc |
| `items[].content` | string | ✅ | Nội dung text |
| `items[].isResolved` | boolean | ✅ | true = annotation đã được xử lý xong |
| `items[].resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 422 | — | Thiếu/sai query targetType hoặc targetId |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "taskId": "507f1f77bcf86cd799439011",
        "authorId": "507f1f77bcf86cd799439011",
        "authorRole": "string",
        "targetType": "PAGE",
        "targetId": "507f1f77bcf86cd799439011",
        "annotationType": "TEXT",
        "reviewStage": "ASSISTANT",
        "coordinates": {},
        "content": "Nội dung mẫu",
        "isResolved": false,
        "resolvedAt": "2026-07-20T09:30:00.000Z",
        "createdAt": "2026-07-20T09:30:00.000Z",
        "author": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /annotations/:id/resolve`
> Đánh dấu annotation đã giải quyết (isResolved=true). Chỉ author.

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Response 200** (`AnnotationRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `taskId` | string | ✅ | ObjectId của Task |
| `authorId` | string | ✅ |  |
| `authorRole` | string | ✅ | RoleCode của người tạo annotation: Allowed role codes: MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN |
| `targetType` | enum `AnnotationTargetType` | ✅ | Annotation target: PAGE, REGION, TASK, MANUSCRIPT, NAME |
| `targetId` | string | ✅ |  |
| `annotationType` | enum `AnnotationType` | ✅ | Annotation type: TEXT, HIGHLIGHT, DRAWING |
| `reviewStage` | enum `ReviewStage` | ✅ | Review stage: ASSISTANT, MANGAKA, EDITOR |
| `coordinates` | object | ✅ | Toạ độ vùng trên trang {x,y,width,height} — pixel trên ảnh gốc |
| `content` | string | ✅ | Nội dung text |
| `isResolved` | boolean | ✅ | true = annotation đã được xử lý xong |
| `resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.AnnotationForbidden` | current user cannot update this annotation |
| 404 | `Error.AnnotationNotFound` | annotation does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "taskId": "507f1f77bcf86cd799439011",
    "authorId": "507f1f77bcf86cd799439011",
    "authorRole": "string",
    "targetType": "PAGE",
    "targetId": "507f1f77bcf86cd799439011",
    "annotationType": "TEXT",
    "reviewStage": "ASSISTANT",
    "coordinates": {},
    "content": "Nội dung mẫu",
    "isResolved": false,
    "resolvedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "author": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `DELETE /annotations/:id`
> Xoá annotation. Chỉ author.

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.AnnotationForbidden` | current user cannot update this annotation |
| 404 | `Error.AnnotationNotFound` | annotation does not exist |
---

## §6. Flow 3 — Region / Task / AI segmentation

**Nghiệp vụ:** trên mỗi trang `DRAFT`/`REVISING`, Mangaka khoanh Region hoặc dùng AI segment → tạo Task và giao Assistant đang được thuê → Assistant start/nộp TaskVersion → Mangaka approve/yêu cầu sửa. Task **không cascade status** sang Page/Manuscript; trạng thái Task là gate submit/resubmit và nguồn tính tiến độ. Page `COMPLETED` khóa mutation với `Error.PageNotEditable`.

### Happy path

1. **Mangaka** khoanh tay: `POST /pages/:id/regions` (coordinates + regionType) — hoặc nhờ AI:
   a. `POST /pages/:id/segment` `{mode: MODEL|HEURISTIC}` → 201 `{jobId}` (async).
   b. Poll `GET /ai-jobs/:id` tới `SUCCEEDED` (kèm `proposedRegions` — CHƯA ghi DB). Danh sách job của trang: `GET /pages/:id/ai-jobs`.
   c. `POST /ai-jobs/:id/apply` → ghi Region[] `createdBy=AI` + confidence (vùng MANUAL/đã confirm/đã có task được GIỮ nguyên).
2. Chỉnh vùng: `PATCH /regions/:id` (confirm / sửa toạ độ); xoá vùng: `DELETE /regions/:id`.
3. **Mangaka** giao việc: `POST /tasks` (pageId + **`regionIds[]`** — 0..N vùng trên cùng trang — + assistantId + taskType + deadline + priority + assetIds tham khảo) — hoặc `POST /tasks/batch` (all-or-nothing, tối đa 50, mỗi item 1 vùng).
4. **Assistant** `POST /tasks/:id/start` → tải file gốc + asset (signed GET §14) → làm → `POST /tasks/:id/submit` (kèm object key kết quả) → TaskVersion `PENDING`.
5. **Mangaka** review trên composite: `POST /tasks/:id/approve` (→ cascade) hoặc `POST /tasks/:id/request-revision` (kèm note — Assistant thấy annotation, sửa, start/submit lại, version++).
6. Assistant nghỉ giữa chừng (đổi availability ON_LEAVE/UNAVAILABLE ở hồ sơ) → task đang làm auto `ON_HOLD` → **Mangaka** `POST /tasks/:id/reassign` sang Assistant khác (người mới cũng phải đang được thuê).
7. Hủy việc: `POST /tasks/:id/cancel` (kèm lý do — giữ versions).

### Unhappy cases

| Tình huống | API | Kết quả |
|---|---|---|
| Khoanh vùng trang của series người khác | `POST /pages/:id/regions` | 403 `Error.NotSeriesOwner` |
| Coordinates âm / width-height ≤ 0 | regions create/patch | 422 |
| Segment khi page chưa có file | `POST /pages/:id/segment` | 422 `Error.PageHasNoFile` |
| Segment khi đã có job đang chạy trên trang | segment | 409 `Error.SegmentJobAlreadyRunning` |
| AI đang tắt (`AI_SERVICE_URL` trống) | segment | 503 `Error.AiNotEnabled` — **fallback khoanh tay, flow không nghẽn** |
| Apply job chưa SUCCEEDED / đã apply | `POST /ai-jobs/:id/apply` | 409 `Error.AiJobNotApplicable` |
| Xoá vùng đã có task APPROVED | `DELETE /regions/:id` | 409 `Error.RegionHasTasks` — vùng có task chưa xong thì cascade CANCELLED + notify Assistant |
| Giao task cho Assistant chưa được thuê / hết hạn thuê | `POST /tasks` / reassign | 409 `Error.AssistantNotHired` |
| `assetIds` chứa asset không tồn tại | tasks create/patch | 422 `Error.AssetNotFound` |
| Assistant khác start/submit task không phải của mình | start/submit | 403 `Error.NotTaskAssignee` |
| Chuyển trạng thái task sai bậc (submit khi chưa start...) | task lifecycle | 409 `Error.InvalidTaskTransition` |
| Reassign task không ở trạng thái cho phép | reassign | 409 `Error.TaskNotReassignable` |
| Thao tác task khi chapter đang hold | start/submit/approve | 409 `Error.ChapterOnHold` |
| Task sắp trễ deadline | (cron hourly) | notify Assistant + Mangaka (`TASK_DEADLINE_WARNING`) |

> **Scope đọc `GET /tasks`:** MANGAKA thấy task mình giao; ASSISTANT thấy task được giao cho mình. Filter: `assigneeId`, `status`, `regionId`, `pageId`.

### API Reference

#### `POST /pages/:id/regions`
> Mangaka khoanh vùng manual trên trang → Region

**Quyền:** MANGAKA (Bearer)

**Body** (`CreateRegionBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `coordinates` | object | ✅ | Toạ độ vùng trên trang (pixel, top-left origin; x,y ≥ 0; width,height > 0) |
| `coordinates.x` | number (≥ 0) | ✅ |  |
| `coordinates.y` | number (≥ 0) | ✅ |  |
| `coordinates.width` | number (≥ 0) | ✅ |  |
| `coordinates.height` | number (≥ 0) | ✅ |  |
| `regionType` | enum `RegionType` | — | Loại vùng trên trang: PANEL, BACKGROUND, SPEECH_BUBBLE, SFX, CHARACTER |

**Response 201** (`RegionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `pageId` | string | ✅ | ObjectId của Page |
| `coordinates` | object | ✅ | Toạ độ vùng trên trang (pixel, top-left origin; x,y ≥ 0; width,height > 0) |
| `coordinates.x` | number (≥ 0) | ✅ |  |
| `coordinates.y` | number (≥ 0) | ✅ |  |
| `coordinates.width` | number (≥ 0) | ✅ |  |
| `coordinates.height` | number (≥ 0) | ✅ |  |
| `regionType` | enum `RegionType` | ✅ | Loại vùng trên trang: PANEL, BACKGROUND, SPEECH_BUBBLE, SFX, CHARACTER |
| `createdBy` | string | ✅ | MANUAL \| AI |
| `confirmedByMangaka` | boolean | ✅ | true = Mangaka đã xác nhận vùng (vùng AI đề xuất cần confirm) |
| `confidenceScore` | number | ✅ | null khi MANUAL |
| `detectedSubtype` | string | ✅ | Original AI model class (frame/body/text-block/bubble/...) |
| `aiModelVersion` | string | ✅ | AI model version that produced this region; null for MANUAL |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.PageNotFound` | page does not exist |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "coordinates": {
    "x": 1,
    "y": 1,
    "width": 1,
    "height": 1
  },
  "regionType": "PANEL"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "pageId": "507f1f77bcf86cd799439011",
    "coordinates": {
      "x": 1,
      "y": 1,
      "width": 1,
      "height": 1
    },
    "regionType": "PANEL",
    "createdBy": "string",
    "confirmedByMangaka": false,
    "confidenceScore": 0,
    "detectedSubtype": "string",
    "aiModelVersion": "string"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /pages/:id/regions`
> Danh sách vùng của 1 trang (Mangaka sở hữu / Editor)

**Quyền:** MANGAKA, EDITOR (Bearer)

**Response 200** (`RegionListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].pageId` | string | ✅ | ObjectId của Page |
| `items[].coordinates` | object | ✅ | Toạ độ vùng trên trang (pixel, top-left origin; x,y ≥ 0; width,height > 0) |
| `items[].regionType` | enum `RegionType` | ✅ | Loại vùng trên trang: PANEL, BACKGROUND, SPEECH_BUBBLE, SFX, CHARACTER |
| `items[].createdBy` | string | ✅ | MANUAL \| AI |
| `items[].confirmedByMangaka` | boolean | ✅ | true = Mangaka đã xác nhận vùng (vùng AI đề xuất cần confirm) |
| `items[].confidenceScore` | number | ✅ | null khi MANUAL |
| `items[].detectedSubtype` | string | ✅ | Original AI model class (frame/body/text-block/bubble/...) |
| `items[].aiModelVersion` | string | ✅ | AI model version that produced this region; null for MANUAL |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.PageNotFound` | page does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "coordinates": {
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        "regionType": "PANEL",
        "createdBy": "string",
        "confirmedByMangaka": false,
        "confidenceScore": 0,
        "detectedSubtype": "string",
        "aiModelVersion": "string"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /regions/:id`
> Sửa vùng (partial)

**Quyền:** MANGAKA (Bearer)

**Body** (`UpdateRegionBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `coordinates` | object | — | Toạ độ vùng trên trang (pixel, top-left origin; x,y ≥ 0; width,height > 0) |
| `coordinates.x` | number (≥ 0) | ✅ |  |
| `coordinates.y` | number (≥ 0) | ✅ |  |
| `coordinates.width` | number (≥ 0) | ✅ |  |
| `coordinates.height` | number (≥ 0) | ✅ |  |
| `regionType` | enum `RegionType` | — | Loại vùng trên trang: PANEL, BACKGROUND, SPEECH_BUBBLE, SFX, CHARACTER |
| `confirmedByMangaka` | boolean ✍ | — | true = Mangaka đã xác nhận vùng (vùng AI đề xuất cần confirm) |

**Response 200** (`RegionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `pageId` | string | ✅ | ObjectId của Page |
| `coordinates` | object | ✅ | Toạ độ vùng trên trang (pixel, top-left origin; x,y ≥ 0; width,height > 0) |
| `coordinates.x` | number (≥ 0) | ✅ |  |
| `coordinates.y` | number (≥ 0) | ✅ |  |
| `coordinates.width` | number (≥ 0) | ✅ |  |
| `coordinates.height` | number (≥ 0) | ✅ |  |
| `regionType` | enum `RegionType` | ✅ | Loại vùng trên trang: PANEL, BACKGROUND, SPEECH_BUBBLE, SFX, CHARACTER |
| `createdBy` | string | ✅ | MANUAL \| AI |
| `confirmedByMangaka` | boolean | ✅ | true = Mangaka đã xác nhận vùng (vùng AI đề xuất cần confirm) |
| `confidenceScore` | number | ✅ | null khi MANUAL |
| `detectedSubtype` | string | ✅ | Original AI model class (frame/body/text-block/bubble/...) |
| `aiModelVersion` | string | ✅ | AI model version that produced this region; null for MANUAL |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.RegionNotFound` | region not found or invalid id |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "coordinates": {
    "x": 1,
    "y": 1,
    "width": 1,
    "height": 1
  },
  "regionType": "PANEL",
  "confirmedByMangaka": false
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "pageId": "507f1f77bcf86cd799439011",
    "coordinates": {
      "x": 1,
      "y": 1,
      "width": 1,
      "height": 1
    },
    "regionType": "PANEL",
    "createdBy": "string",
    "confirmedByMangaka": false,
    "confidenceScore": 0,
    "detectedSubtype": "string",
    "aiModelVersion": "string"
  }
}
```

<!-- payload-example:end -->

---

#### `DELETE /regions/:id`
> Xoá vùng → cascade CANCELLED task chưa kết thúc + notify Assistant (chặn nếu có APPROVED)

**Quyền:** MANGAKA (Bearer)

**Response 200** (`DeleteRegionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `regionId` | string | ✅ | ObjectId của Region (vùng trên trang) |
| `cancelledTaskIds` | string[] | ✅ | Task ids cascaded to CANCELLED |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.RegionNotFound` | region not found or invalid id |
| 409 | `Error.RegionHasApprovedTasks` | region has approved task(s); cannot delete |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "regionId": "507f1f77bcf86cd799439011",
    "cancelledTaskIds": [
      "507f1f77bcf86cd799439011"
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `POST /pages/:id/segment`
> Run async AI page segmentation and return a job id for polling

**Quyền:** MANGAKA (Bearer)

**Body** (`SegmentPageBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `mode` | enum `AiSegmentMode` | — | Segmentation mode: MODEL (YOLO deep learning) or HEURISTIC (OpenCV baseline) (default: `"MODEL"`) |

**Response 201** (`SegmentAcceptedRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `jobId` | string | ✅ | ObjectId AiJob để poll |
| `status` | enum `AiJobStatus` | ✅ | AI job lifecycle: QUEUED -> RUNNING -> SUCCEEDED \| FAILED |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.PageNotFound` | page does not exist |
| 409 | `Error.SegmentJobAlreadyRunning` | a segmentation job is already queued/running for this page |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |
| 422 | — | Error.PageHasNoFile (pageId) - page has no uploaded original file to segment

Validation fail |
| 503 | `Error.AiNotEnabled` | AI service is not configured (AI_SERVICE_URL empty); use manual regions |
| 503 | `Error.AiEnqueueFailed` | could not enqueue AI job (queue unavailable); use manual regions |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "mode": "MODEL"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "jobId": "507f1f77bcf86cd799439011",
    "status": "QUEUED"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /ai-jobs/:id`
> Poll one AI job status and proposed regions

**Quyền:** MANGAKA (Bearer)

**Response 200** (`AiJobRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `type` | enum `AiJobType` | ✅ | AI job type: SEGMENT; COLOR/NUMBER are reserved for Spec 3 |
| `mode` | enum `AiSegmentMode` | ✅ | Segmentation mode: MODEL (YOLO deep learning) or HEURISTIC (OpenCV baseline) |
| `pageId` | string | ✅ | ObjectId của Page |
| `status` | enum `AiJobStatus` | ✅ | AI job lifecycle: QUEUED -> RUNNING -> SUCCEEDED \| FAILED |
| `error` | string | ✅ | Error message when FAILED |
| `modelVersion` | string | ✅ |  |
| `proposedRegions` | object[] | ✅ | Returned only on job detail route |
| `proposedRegions[].regionType` | enum `RegionType` | ✅ | Loại vùng trên trang: PANEL, BACKGROUND, SPEECH_BUBBLE, SFX, CHARACTER |
| `proposedRegions[].detectedSubtype` | string | ✅ |  |
| `proposedRegions[].coordinates` | object | ✅ | Pixel bbox coordinates, top-left origin |
| `proposedRegions[].confidenceScore` | number (≥ 0, ≤ 1) | ✅ | Độ tin cậy AI 0–1 (null khi vùng tạo MANUAL) |
| `regionCount` | number | ✅ |  |
| `appliedAt` | string | ✅ | ISO timestamp; latest applied job is the active proposal |
| `startedAt` | string | ✅ |  |
| `finishedAt` | string | ✅ |  |
| `durationMs` | number | ✅ | Inference duration in milliseconds |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.AiJobNotFound` | AI job does not exist or does not belong to the current user |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "type": "SEGMENT",
    "mode": "MODEL",
    "pageId": "507f1f77bcf86cd799439011",
    "status": "QUEUED",
    "error": "string",
    "modelVersion": "string",
    "proposedRegions": [
      {
        "regionType": "PANEL",
        "detectedSubtype": "string",
        "coordinates": {
          "x": 0,
          "y": 0,
          "width": 0,
          "height": 0
        },
        "confidenceScore": 1
      }
    ],
    "regionCount": 1,
    "appliedAt": "2026-07-20T09:30:00.000Z",
    "startedAt": "2026-07-20T09:30:00.000Z",
    "finishedAt": "2026-07-20T09:30:00.000Z",
    "durationMs": 0,
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /pages/:id/ai-jobs`
> List AI proposals for one page without proposedRegions payload

**Quyền:** MANGAKA (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `type` | enum `AiJobType` | — | AI job type: SEGMENT; COLOR/NUMBER are reserved for Spec 3 (default: `"SEGMENT"`) |

**Response 200** (`AiJobListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].type` | enum `AiJobType` | ✅ | AI job type: SEGMENT; COLOR/NUMBER are reserved for Spec 3 |
| `items[].mode` | enum `AiSegmentMode` | ✅ | Segmentation mode: MODEL (YOLO deep learning) or HEURISTIC (OpenCV baseline) |
| `items[].pageId` | string | ✅ | ObjectId của Page |
| `items[].status` | enum `AiJobStatus` | ✅ | AI job lifecycle: QUEUED -> RUNNING -> SUCCEEDED \| FAILED |
| `items[].error` | string | ✅ | Error message when FAILED |
| `items[].modelVersion` | string | ✅ |  |
| `items[].regionCount` | number | ✅ |  |
| `items[].appliedAt` | string | ✅ | ISO timestamp; latest applied job is the active proposal |
| `items[].startedAt` | string | ✅ |  |
| `items[].finishedAt` | string | ✅ |  |
| `items[].durationMs` | number | ✅ | Inference duration in milliseconds |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.PageNotFound` | page does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "type": "SEGMENT",
        "mode": "MODEL",
        "pageId": "507f1f77bcf86cd799439011",
        "status": "QUEUED",
        "error": "string",
        "modelVersion": "string",
        "regionCount": 1,
        "appliedAt": "2026-07-20T09:30:00.000Z",
        "startedAt": "2026-07-20T09:30:00.000Z",
        "finishedAt": "2026-07-20T09:30:00.000Z",
        "durationMs": 0,
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `POST /ai-jobs/:id/apply`
> Apply one AI proposal into Region[] while preserving manual/confirmed/task-linked regions

**Quyền:** MANGAKA (Bearer)

**Response 201** (`ApplyAiJobRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |
| `created` | number | ✅ |  |
| `removed` | number | ✅ | Previous bare AI regions removed |
| `skipped` | number | ✅ | AI regions kept because they are confirmed or task-linked |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.AiJobNotFound` | AI job does not exist or does not belong to the current user |
| 404 | `Error.PageNotFound` | page does not exist |
| 409 | `Error.AiJobNotApplicable` | AI job is not in SUCCEEDED state or has no proposed regions |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu",
    "created": 0,
    "removed": 0,
    "skipped": 0
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tasks`
> Giao task cho Assistant (enforce BR-ASSIST-01)

**Quyền:** MANGAKA (Bearer)

**Body** (`CreateTaskBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `pageId` | string ✍ | ✅ | ObjectId của Page |
| `regionIds` | string[] ✍ 🆕 | — | **BREAKING (2026-07-21):** thay `regionId` (đơn). Các Region trên **cùng trang** cần xử lý (0..50). **Đều phải thuộc `pageId`** — nếu không / id không tồn tại → 404 `Error.RegionNotFound`. Rỗng/omit = giao cả trang (default: `[]`) |
| `assistantId` | string ✍ | ✅ | ObjectId User của Assistant |
| `taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `deadline` | string (regex, ISO 8601) ✍ | — | Hạn chót (ISO 8601 UTC) |
| `priority` | integer (≥ 0) ✍ | — | Độ ưu tiên task (số nhỏ = ưu tiên cao) (default: `0`) |
| `assetIds` | string[] ✍ | — | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) (default: `[]`) |

**Response 201** (`TaskRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `pageId` | string | ✅ | ObjectId của Page |
| `regionIds` | string[] 🆕 | ✅ | **BREAKING (2026-07-21):** thay `regionId`. Danh sách Region id task xử lý; `[]` = cả trang / task nhóm |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `status` | enum `TaskStatus` | ✅ | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `statusReason` | string | ✅ | Latest status-change reason for cancel/reassign |
| `priority` | number | ✅ | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `assetIds` | string[] | ✅ | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |
| `versions` | object[] | ✅ |  |
| `versions[].submittedBy` | string | ✅ |  |
| `versions[].versionNumber` | number | ✅ | Số thứ tự bản nộp |
| `versions[].file` | string | ✅ |  |
| `versions[].reviewStatus` | enum `TaskVersionReviewStatus` | ✅ | Trạng thái review của 1 bản nộp task: PENDING, APPROVED, REVISION_REQUESTED |
| `versions[].reviewerNote` | string | ✅ |  |
| `versions[].submittedAt` | string | ✅ | Thời điểm nộp (ISO 8601 UTC) |
| `versions[].submitter` | object \| null 🆕 | GET | `UserMini {id, displayName, avatar}` của Assistant nộp bản đó |
| `assistant` | object \| null 🆕 | GET | `UserMini` của Assistant được giao; `null` nếu id không còn tồn tại |
| `regions` | object[] 🆕 | GET | **BREAKING (2026-07-21):** thay embed `region` (đơn) → **mảng** RegionRes (toạ độ + loại vùng). Task 1 trang trả đủ vùng; task nhóm (nhiều trang) trả `[]`. Xem §0.10 |
| `assets` | object[] 🆕 | GET | **2026-07-21** — Ảnh reference Mangaka đính khi giao task (resolve từ `assetIds`). Mỗi phần tử `{id, filePath, name, assetType}`. **Assistant dùng `filePath` làm `key`** cho `POST /tasks/:id/download-url` để tải reference |
| `pageOriginalFile` | string \| null 🆕 | GET | **Object key ảnh GỐC của trang (bản Mangaka giao)** — ảnh nền để Assistant làm việc / Mangaka đối chiếu khi review |
| `pageDisplayFile` | string \| null 🆕 | GET | **Object key ảnh NÊN HIỂN THỊ** = `compositeFile ?? originalFile` của trang |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

> 🆕 **2026-07-21 — "2 ảnh" cho màn review (đọc kỹ, tránh nhầm).** Màn Mangaka review 1 task cần **2 ảnh khác nhau**:
> - **Bản Mangaka giao (ảnh nền)** = `pageOriginalFile` (crop theo `regions[].coordinates` nếu task gắn vùng — task có thể có **nhiều** vùng).
> - **Bản Assistant nộp (kết quả)** = `versions[latest].file` (bản mới nhất; lịch sử ở `versions[]`).
>
> ⚠️ **KHÔNG** phải v1/v2 của cùng assistant — đó là "nền gốc" vs "kết quả". Cả 2 đều là **object key**, muốn xem phải ký URL. Bản gốc Mangaka tự upload nên `/uploads/sign-download` OK; **bản Assistant nộp thì `/uploads/sign-download` sẽ 403** (Mangaka không phải uploader) → **phải dùng `POST /tasks/:id/download-url`** (xem route bên dưới). Assistant muốn tải ảnh gốc để làm việc, hoặc **tải ảnh reference Mangaka đính khi giao task (`assetIds`)**, cũng dùng chính route đó.

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.PageNotFound` | page does not exist |
| 409 | `Error.AssistantNotHired` | assistant has no ACTIVE studio assignment within hire period (BR-ASSIST-01) |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |
| 422 | — | Error.AssetNotFound (assetIds) - asset does not exist

Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "pageId": "507f1f77bcf86cd799439011",
  "regionIds": [
    "507f1f77bcf86cd799439011"
  ],
  "assistantId": "507f1f77bcf86cd799439011",
  "taskType": "BACKGROUND",
  "deadline": "2026-07-20T09:30:00.000Z",
  "priority": 0,
  "assetIds": [
    "507f1f77bcf86cd799439011"
  ]
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "pageId": "507f1f77bcf86cd799439011",
    "regionIds": [
      "507f1f77bcf86cd799439011"
    ],
    "assistantId": "507f1f77bcf86cd799439011",
    "taskType": "BACKGROUND",
    "status": "ASSIGNED",
    "statusReason": "Nội dung mẫu",
    "priority": 0,
    "deadline": "2026-07-20T09:30:00.000Z",
    "assetIds": [
      "507f1f77bcf86cd799439011"
    ],
    "versions": [
      {
        "submittedBy": "string",
        "versionNumber": 1,
        "file": "uploads/507f1f77bcf86cd799439011/anh.png",
        "reviewStatus": "PENDING",
        "reviewerNote": "Nội dung mẫu",
        "submittedAt": "2026-07-20T09:30:00.000Z",
        "submitter": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ],
    "createdAt": "2026-07-20T09:30:00.000Z",
    "groupId": "507f1f77bcf86cd799439011",
    "groupTitle": "Tiêu đề mẫu",
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assets": [
      {
        "id": "507f1f77bcf86cd799439011",
        "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
        "name": "Nguyễn Văn A",
        "assetType": "REFERENCE"
      }
    ],
    "regions": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "coordinates": {
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        "regionType": "PANEL",
        "createdBy": "string",
        "confirmedByMangaka": false,
        "confidenceScore": 0,
        "detectedSubtype": "string",
        "aiModelVersion": "string"
      }
    ],
    "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tasks/batch`
> Giao nhiều task (all-or-nothing)

**Quyền:** MANGAKA (Bearer)

**Body** (`BatchCreateTaskBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].pageId` | string | ✅ | ObjectId của Page |
| `items[].regionId` | string | — | ObjectId của Region (vùng trên trang) |
| `items[].assistantId` | string | ✅ | ObjectId User của Assistant |
| `items[].taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `items[].deadline` | string (regex, ISO 8601) | — | Hạn chót (ISO 8601 UTC) |
| `items[].priority` | integer (≥ 0) | — | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `items[].assetIds` | string[] | — | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |

**Response 201** (`TaskListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].pageId` | string | ✅ | ObjectId của Page |
| `items[].regionId` | string | ✅ | ObjectId của Region (vùng trên trang) |
| `items[].assistantId` | string | ✅ | ObjectId User của Assistant |
| `items[].taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `items[].status` | enum `TaskStatus` | ✅ | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `items[].statusReason` | string | ✅ | Latest status-change reason for cancel/reassign |
| `items[].priority` | number | ✅ | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `items[].deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `items[].assetIds` | string[] | ✅ | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |
| `items[].versions` | object[] | ✅ |  |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |
| `total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `limit` | number | ✅ | Số bản ghi mỗi trang |
| `offset` | number | ✅ | Số bản ghi bỏ qua (phân trang) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.PageNotFound` | page does not exist |
| 409 | `Error.AssistantNotHired` | assistant has no ACTIVE studio assignment within hire period (BR-ASSIST-01) |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |
| 422 | — | Error.AssetNotFound (assetIds) - asset does not exist

Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "items": [
    {
      "pageId": "507f1f77bcf86cd799439011",
      "regionId": "507f1f77bcf86cd799439011",
      "assistantId": "507f1f77bcf86cd799439011",
      "taskType": "BACKGROUND",
      "deadline": "2026-07-20T09:30:00.000Z",
      "priority": 0,
      "assetIds": [
        "507f1f77bcf86cd799439011"
      ]
    }
  ]
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "regionIds": [
          "507f1f77bcf86cd799439011"
        ],
        "assistantId": "507f1f77bcf86cd799439011",
        "taskType": "BACKGROUND",
        "status": "ASSIGNED",
        "statusReason": "Nội dung mẫu",
        "priority": 0,
        "deadline": "2026-07-20T09:30:00.000Z",
        "assetIds": [
          "507f1f77bcf86cd799439011"
        ],
        "versions": [
          {
            "submittedBy": "string",
            "versionNumber": 1,
            "file": "uploads/507f1f77bcf86cd799439011/anh.png",
            "reviewStatus": "PENDING",
            "reviewerNote": "Nội dung mẫu",
            "submittedAt": "2026-07-20T09:30:00.000Z",
            "submitter": {
              "id": "507f1f77bcf86cd799439011",
              "displayName": "Nguyễn Văn A",
              "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
            }
          }
        ],
        "createdAt": "2026-07-20T09:30:00.000Z",
        "groupId": "507f1f77bcf86cd799439011",
        "groupTitle": "Tiêu đề mẫu",
        "assistant": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "assets": [
          {
            "id": "507f1f77bcf86cd799439011",
            "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
            "name": "Nguyễn Văn A",
            "assetType": "REFERENCE"
          }
        ],
        "regions": [
          {
            "id": "507f1f77bcf86cd799439011",
            "pageId": "507f1f77bcf86cd799439011",
            "coordinates": {
              "x": 1,
              "y": 1,
              "width": 1,
              "height": 1
            },
            "regionType": "PANEL",
            "createdBy": "string",
            "confirmedByMangaka": false,
            "confidenceScore": 0,
            "detectedSubtype": "string",
            "aiModelVersion": "string"
          }
        ],
        "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "total": 1,
    "limit": 1,
    "offset": 1
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tasks/group`
> 🆕 Giao **một đầu việc trải nhiều trang** (vd "vẽ nền ch.5 trang 1–10")

**Quyền:** MANGAKA chủ series (Bearer)

**Nghiệp vụ:** trong studio thật, "vẽ nền chương 5" là *một* đầu việc chứ không phải 10 đầu việc rời. Route này cho phép giao một lần cho nhiều trang.

> **Dưới DB vẫn là N task, mỗi task thuộc đúng 1 trang**, chỉ dùng chung `groupId`. Đây là chủ ý, không phải hạn chế:
> - `Region` thuộc về **một** trang — task đa trang thật sự sẽ không mang được `regionIds`, mà "khoanh vùng rồi giao việc" là feature lõi.
> - Mangaka duyệt **từng trang** (nhìn từng trang mới duyệt được), và `pagesReady` / `progressPct` tính theo trang.
> - Xoá trang / xoá vùng cascade theo trang vẫn chạy đúng.
>
> Nên `groupId` là lớp **gom hiển thị + thao tác hàng loạt**, không đổi mô hình dữ liệu.

**Body** (`CreateTaskGroupBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `pageIds` | string[] (1..50, ObjectId 24-hex) | ✅ | Các trang cùng nhận đầu việc này — **all-or-nothing** |
| `assistantId` | string | ✅ | Trợ lý nhận việc (phải có `StudioAssignment` ACTIVE — BR-ASSIST-01) |
| `taskType` | enum `Specialization` | ✅ | Loại việc (BACKGROUND / SCREENTONE / …) |
| `groupTitle` | string (1..200) | — | Tên nhóm hiển thị, vd `"Vẽ nền ch.5"` |
| `deadline` | string (ISO 8601) | — | Áp cho mọi task trong nhóm |
| `priority` | integer (≥ 0) | — | Mặc định `0` |
| `assetIds` | string[] | — | Tài nguyên tham khảo dùng chung |

> **All-or-nothing:** backend validate **toàn bộ** `pageIds` trước (sở hữu · trang còn sửa được · chương không hold · trợ lý đã được thuê). Một trang sai → **không task nào được tạo**.
> Task tạo qua route này có `regionIds = []` (giao cả trang). Cần giao theo vùng thì dùng `POST /tasks` (nhiều vùng trên 1 trang) hoặc `POST /tasks/batch`.

**Response 201** (`TaskGroupRes` — đọc `res.data`):

| Field | Kiểu | Mô tả |
|---|---|---|
| `groupId` | string | Định danh nhóm (UUID, **không phải ObjectId**) |
| `groupTitle` | string \| null | Tên nhóm |
| `items` | `TaskRes[]` | Các task vừa tạo (mỗi trang 1 task) |
| `total` | number | Số task đã tạo |

**Lỗi nghiệp vụ:** giống `POST /tasks` — `Error.PageNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.AssistantNotHired` (409) · `Error.AssetNotFound` (404) · `Error.ChapterOnHold` (409) · `Error.PageNotEditable` (409).

**Ví dụ request body:**

```json
{
  "pageIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
  "assistantId": "507f1f77bcf86cd799439020",
  "taskType": "BACKGROUND",
  "groupTitle": "Vẽ nền ch.5"
}
```

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "pageIds": [
    "507f1f77bcf86cd799439011"
  ],
  "assistantId": "507f1f77bcf86cd799439011",
  "taskType": "BACKGROUND",
  "groupTitle": "Tiêu đề mẫu",
  "deadline": "2026-07-20T09:30:00.000Z",
  "priority": 0,
  "assetIds": [
    "507f1f77bcf86cd799439011"
  ]
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "groupId": "507f1f77bcf86cd799439011",
    "groupTitle": "Tiêu đề mẫu",
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "regionIds": [
          "507f1f77bcf86cd799439011"
        ],
        "assistantId": "507f1f77bcf86cd799439011",
        "taskType": "BACKGROUND",
        "status": "ASSIGNED",
        "statusReason": "Nội dung mẫu",
        "priority": 0,
        "deadline": "2026-07-20T09:30:00.000Z",
        "assetIds": [
          "507f1f77bcf86cd799439011"
        ],
        "versions": [
          {
            "submittedBy": "string",
            "versionNumber": 1,
            "file": "uploads/507f1f77bcf86cd799439011/anh.png",
            "reviewStatus": "PENDING",
            "reviewerNote": "Nội dung mẫu",
            "submittedAt": "2026-07-20T09:30:00.000Z",
            "submitter": {
              "id": "507f1f77bcf86cd799439011",
              "displayName": "Nguyễn Văn A",
              "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
            }
          }
        ],
        "createdAt": "2026-07-20T09:30:00.000Z",
        "groupId": "507f1f77bcf86cd799439011",
        "groupTitle": "Tiêu đề mẫu",
        "assistant": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "assets": [
          {
            "id": "507f1f77bcf86cd799439011",
            "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
            "name": "Nguyễn Văn A",
            "assetType": "REFERENCE"
          }
        ],
        "regions": [
          {
            "id": "507f1f77bcf86cd799439011",
            "pageId": "507f1f77bcf86cd799439011",
            "coordinates": {
              "x": 1,
              "y": 1,
              "width": 1,
              "height": 1
            },
            "regionType": "PANEL",
            "createdBy": "string",
            "confirmedByMangaka": false,
            "confidenceScore": 0,
            "detectedSubtype": "string",
            "aiModelVersion": "string"
          }
        ],
        "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "total": 1
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tasks/group/:groupId/approve`
> 🆕 Duyệt **cả nhóm việc** trong một lần bấm

**Quyền:** MANGAKA chủ series (Bearer)

**Nghiệp vụ:** duyệt mọi task trong nhóm đang ở `SUBMITTED` hoặc `UNDER_REVIEW`. Task chưa tới lượt (còn `ASSIGNED`/`IN_PROGRESS`/`REVISION_REQUESTED`) **được bỏ qua** và liệt kê ở `skipped` — nhóm hiếm khi chín cùng lúc nên không dùng all-or-nothing ở đây.

Mỗi task được duyệt đi qua **đúng luật duyệt lẻ**: `SUBMITTED → UNDER_REVIEW → APPROVED`, ghi kết quả review vào version mới nhất, và gửi notification cho trợ lý.

**Response 201** (`ApproveTaskGroupRes` — đọc `res.data`):

| Field | Kiểu | Mô tả |
|---|---|---|
| `groupId` | string | Nhóm vừa xử lý |
| `approved` | number | Số task vừa được duyệt |
| `skipped` | string[] | Task id bỏ qua vì chưa ở trạng thái duyệt được |

**Lỗi nghiệp vụ:** `Error.TaskNotFound` (404 — group không tồn tại) · `Error.NotSeriesOwner` (403) · `Error.ChapterOnHold` (409) · `Error.PageNotEditable` (409).

**Ví dụ response 201:**

```json
{
  "success": true,
  "message": "Thành công",
  "data": { "groupId": "8f14e45f-ceea-467a-9f4b-1a2c3d4e5f60", "approved": 6, "skipped": ["66f1a2b3c4d5e6f708192a3b"] }
}
```

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "groupId": "507f1f77bcf86cd799439011",
    "approved": 0,
    "skipped": [
      "string"
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /tasks`
> Danh sách task (Assistant = task được giao cho mình; Mangaka = task thuộc series mình sở hữu)
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA, ASSISTANT (Bearer)

> 🆕 **2026-07-21 — Mangaka KHÔNG còn phải truyền `pageId`.** Trước đây thiếu `pageId` là trả **rỗng**, nên muốn xem việc phải đi lần lượt series → chapter → page rồi mới gọi được. Nay gọi `GET /tasks` trần là ra **toàn bộ task thuộc mọi series mình sở hữu**, rồi lọc dần bằng các param bên dưới (kết hợp tự do):
>
> `GET /tasks` → tất cả · `?assistantId=` → việc của một trợ lý · `?seriesId=` → một series · `?chapterId=` → một chương · `?pageId=` → một trang · thêm `?status=` để lọc trạng thái.
>
> **Authz:** `seriesId`/`chapterId` không thuộc Mangaka đang gọi → trả **rỗng** (200, `total: 0`), không phải 403 — giữ đúng quy ước cũ của route này và không lộ sự tồn tại của series người khác. ID sai định dạng cũng trả rỗng, không 500.
> **Assistant:** luôn bị giới hạn ở task của chính mình; `seriesId`/`chapterId` chỉ là *bộ lọc thu hẹp*, không mở rộng quyền.

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `seriesId` | string | — | 🆕 Lọc theo series (Mangaka: chỉ series mình sở hữu) |
| `groupId` | string | — | 🆕 Lọc theo nhóm việc (UUID, không phải ObjectId) |
| `chapterId` | string | — | 🆕 Lọc theo chapter |
| `pageId` | string | — | ObjectId của Page |
| `regionId` | string | — | Lọc task theo vùng (Region id) |
| `assistantId` | string | — | ObjectId User của Assistant |
| `status` | enum `TaskStatus` | — | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `limit` | integer (≥ 0, ≤ 100) | — | Số bản ghi mỗi trang (default: `20`) |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (phân trang) (default: `0`) |

**Response 200** (`TaskListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].pageId` | string | ✅ | ObjectId của Page |
| `items[].regionId` | string | ✅ | ObjectId của Region (vùng trên trang) |
| `items[].assistantId` | string | ✅ | ObjectId User của Assistant |
| `items[].taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `items[].status` | enum `TaskStatus` | ✅ | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `items[].statusReason` | string | ✅ | Latest status-change reason for cancel/reassign |
| `items[].priority` | number | ✅ | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `items[].deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `items[].assetIds` | string[] | ✅ | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |
| `items[].versions` | object[] | ✅ |  |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |
| `total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `limit` | number | ✅ | Số bản ghi mỗi trang |
| `offset` | number | ✅ | Số bản ghi bỏ qua (phân trang) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "regionIds": [
          "507f1f77bcf86cd799439011"
        ],
        "assistantId": "507f1f77bcf86cd799439011",
        "taskType": "BACKGROUND",
        "status": "ASSIGNED",
        "statusReason": "Nội dung mẫu",
        "priority": 0,
        "deadline": "2026-07-20T09:30:00.000Z",
        "assetIds": [
          "507f1f77bcf86cd799439011"
        ],
        "versions": [
          {
            "submittedBy": "string",
            "versionNumber": 1,
            "file": "uploads/507f1f77bcf86cd799439011/anh.png",
            "reviewStatus": "PENDING",
            "reviewerNote": "Nội dung mẫu",
            "submittedAt": "2026-07-20T09:30:00.000Z",
            "submitter": {
              "id": "507f1f77bcf86cd799439011",
              "displayName": "Nguyễn Văn A",
              "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
            }
          }
        ],
        "createdAt": "2026-07-20T09:30:00.000Z",
        "groupId": "507f1f77bcf86cd799439011",
        "groupTitle": "Tiêu đề mẫu",
        "assistant": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "assets": [
          {
            "id": "507f1f77bcf86cd799439011",
            "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
            "name": "Nguyễn Văn A",
            "assetType": "REFERENCE"
          }
        ],
        "regions": [
          {
            "id": "507f1f77bcf86cd799439011",
            "pageId": "507f1f77bcf86cd799439011",
            "coordinates": {
              "x": 1,
              "y": 1,
              "width": 1,
              "height": 1
            },
            "regionType": "PANEL",
            "createdBy": "string",
            "confirmedByMangaka": false,
            "confidenceScore": 0,
            "detectedSubtype": "string",
            "aiModelVersion": "string"
          }
        ],
        "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    ],
    "total": 1,
    "limit": 1,
    "offset": 1
  }
}
```

<!-- payload-example:end -->

---

#### `GET /tasks/:id`
> Chi tiết task (Mangaka sở hữu / Assistant được giao)
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA, ASSISTANT (Bearer)

**Response 200** (`TaskRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `pageId` | string | ✅ | ObjectId của Page |
| `regionIds` | string[] 🆕 | ✅ | **BREAKING (2026-07-21):** thay `regionId`. Danh sách Region id task xử lý; `[]` = cả trang / task nhóm |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `status` | enum `TaskStatus` | ✅ | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `statusReason` | string | ✅ | Latest status-change reason for cancel/reassign |
| `priority` | number | ✅ | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `assetIds` | string[] | ✅ | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |
| `versions` | object[] | ✅ |  |
| `versions[].submittedBy` | string | ✅ |  |
| `versions[].versionNumber` | number | ✅ | Số thứ tự bản nộp |
| `versions[].file` | string | ✅ |  |
| `versions[].reviewStatus` | enum `TaskVersionReviewStatus` | ✅ | Trạng thái review của 1 bản nộp task: PENDING, APPROVED, REVISION_REQUESTED |
| `versions[].reviewerNote` | string | ✅ |  |
| `versions[].submittedAt` | string | ✅ | Thời điểm nộp (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.TaskNotFound` | task not found or invalid id |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "pageId": "507f1f77bcf86cd799439011",
    "regionIds": [
      "507f1f77bcf86cd799439011"
    ],
    "assistantId": "507f1f77bcf86cd799439011",
    "taskType": "BACKGROUND",
    "status": "ASSIGNED",
    "statusReason": "Nội dung mẫu",
    "priority": 0,
    "deadline": "2026-07-20T09:30:00.000Z",
    "assetIds": [
      "507f1f77bcf86cd799439011"
    ],
    "versions": [
      {
        "submittedBy": "string",
        "versionNumber": 1,
        "file": "uploads/507f1f77bcf86cd799439011/anh.png",
        "reviewStatus": "PENDING",
        "reviewerNote": "Nội dung mẫu",
        "submittedAt": "2026-07-20T09:30:00.000Z",
        "submitter": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ],
    "createdAt": "2026-07-20T09:30:00.000Z",
    "groupId": "507f1f77bcf86cd799439011",
    "groupTitle": "Tiêu đề mẫu",
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assets": [
      {
        "id": "507f1f77bcf86cd799439011",
        "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
        "name": "Nguyễn Văn A",
        "assetType": "REFERENCE"
      }
    ],
    "regions": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "coordinates": {
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        "regionType": "PANEL",
        "createdBy": "string",
        "confirmedByMangaka": false,
        "confidenceScore": 0,
        "detectedSubtype": "string",
        "aiModelVersion": "string"
      }
    ],
    "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tasks/:id/download-url`
> 🆕 **2026-07-21** — Ký signed URL tải **file thuộc task** (ảnh gốc trang Mangaka giao / bản Assistant nộp), authz theo quan hệ task

**Quyền:** MANGAKA (chủ series) · ASSISTANT (được giao) · EDITOR (phụ trách series) · BOARD_MEMBER · SUPER_ADMIN (Bearer)

**Nghiệp vụ (vì sao có route này):** `/uploads/sign-download` chỉ cho **người upload** hoặc EDITOR/BOARD/ADMIN tải. Nên trong luồng cộng tác: **Mangaka KHÔNG tải được bản Assistant nộp** (Assistant là uploader), **Assistant KHÔNG tải được ảnh gốc trang** (Mangaka là uploader), và **Assistant KHÔNG tải được ảnh reference Mangaka đính khi giao task** (`assetIds` — Mangaka là uploader). Route này đặt quyền theo **quan hệ task** và chỉ ký các key **thực sự thuộc task** (chống lấy key bừa).

**Body** (`TaskFileDownloadBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `key` | string | ✅ | Object key cần tải — phải là **một trong**: ảnh gốc/composite của trang task này · một `versions[].file` · **một file reference trong `assetIds` của task** 🆕 (2026-07-21). Key ngoài các nhóm này → 403 |

**Response 201** (`TaskFileDownloadRes` — đọc `res.data`): `{ downloadUrl, expiresAt }` — presigned GET URL có hạn (dùng thẳng, đừng cache lâu).

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.TaskFileForbidden` | caller không phải chủ series/assignee/editor/board của task, **hoặc** key không thuộc task |
| 404 | `Error.TaskNotFound` | task không tồn tại / id không phải ObjectId 24-hex |

**FE nên làm:** ở màn review (S-MGK-11), lấy `pageOriginalFile` + `versions[latest].file` từ `TaskRes`, rồi gọi route này cho từng key để có URL hiển thị 2 ảnh. Assistant ở màn làm việc dùng route này để tải `pageOriginalFile` **và các ảnh reference**: key reference lấy từ embed **`TaskRes.assets[].filePath`** 🆕 (BE resolve sẵn `assetIds` → key), truyền thẳng `filePath` vào `key`.

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "key": "uploads/507f1f77bcf86cd799439011/anh.png"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "downloadUrl": "uploads/507f1f77bcf86cd799439011/anh.png",
    "expiresAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /tasks/:id`
> Sửa task (assetIds/deadline/priority)

**Quyền:** MANGAKA (Bearer)

**Body** (`UpdateTaskBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `assetIds` | string[] ✍ | — | [] = clear; omit/null = giữ nguyên |
| `deadline` | string (regex, ISO 8601) ✍ | — | Hạn chót (ISO 8601 UTC) |
| `priority` | integer (≥ 0) ✍ | — | Độ ưu tiên task (số nhỏ = ưu tiên cao) |

**Response 200** (`TaskRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `pageId` | string | ✅ | ObjectId của Page |
| `regionIds` | string[] 🆕 | ✅ | **BREAKING (2026-07-21):** thay `regionId`. Danh sách Region id task xử lý; `[]` = cả trang / task nhóm |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `status` | enum `TaskStatus` | ✅ | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `statusReason` | string | ✅ | Latest status-change reason for cancel/reassign |
| `priority` | number | ✅ | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `assetIds` | string[] | ✅ | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |
| `versions` | object[] | ✅ |  |
| `versions[].submittedBy` | string | ✅ |  |
| `versions[].versionNumber` | number | ✅ | Số thứ tự bản nộp |
| `versions[].file` | string | ✅ |  |
| `versions[].reviewStatus` | enum `TaskVersionReviewStatus` | ✅ | Trạng thái review của 1 bản nộp task: PENDING, APPROVED, REVISION_REQUESTED |
| `versions[].reviewerNote` | string | ✅ |  |
| `versions[].submittedAt` | string | ✅ | Thời điểm nộp (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.TaskNotFound` | task not found or invalid id |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |
| 422 | — | Error.AssetNotFound (assetIds) - asset does not exist

Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "assetIds": [
    "507f1f77bcf86cd799439011"
  ],
  "deadline": "2026-07-20T09:30:00.000Z",
  "priority": 1
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "pageId": "507f1f77bcf86cd799439011",
    "regionIds": [
      "507f1f77bcf86cd799439011"
    ],
    "assistantId": "507f1f77bcf86cd799439011",
    "taskType": "BACKGROUND",
    "status": "ASSIGNED",
    "statusReason": "Nội dung mẫu",
    "priority": 0,
    "deadline": "2026-07-20T09:30:00.000Z",
    "assetIds": [
      "507f1f77bcf86cd799439011"
    ],
    "versions": [
      {
        "submittedBy": "string",
        "versionNumber": 1,
        "file": "uploads/507f1f77bcf86cd799439011/anh.png",
        "reviewStatus": "PENDING",
        "reviewerNote": "Nội dung mẫu",
        "submittedAt": "2026-07-20T09:30:00.000Z",
        "submitter": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ],
    "createdAt": "2026-07-20T09:30:00.000Z",
    "groupId": "507f1f77bcf86cd799439011",
    "groupTitle": "Tiêu đề mẫu",
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assets": [
      {
        "id": "507f1f77bcf86cd799439011",
        "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
        "name": "Nguyễn Văn A",
        "assetType": "REFERENCE"
      }
    ],
    "regions": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "coordinates": {
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        "regionType": "PANEL",
        "createdBy": "string",
        "confirmedByMangaka": false,
        "confidenceScore": 0,
        "detectedSubtype": "string",
        "aiModelVersion": "string"
      }
    ],
    "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tasks/:id/start`
> Assistant bắt đầu xử lý task → IN_PROGRESS (SRS §2.2a)

**Quyền:** ASSISTANT (Bearer)

**Response 201** (`TaskRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `pageId` | string | ✅ | ObjectId của Page |
| `regionIds` | string[] 🆕 | ✅ | **BREAKING (2026-07-21):** thay `regionId`. Danh sách Region id task xử lý; `[]` = cả trang / task nhóm |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `status` | enum `TaskStatus` | ✅ | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `statusReason` | string | ✅ | Latest status-change reason for cancel/reassign |
| `priority` | number | ✅ | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `assetIds` | string[] | ✅ | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |
| `versions` | object[] | ✅ |  |
| `versions[].submittedBy` | string | ✅ |  |
| `versions[].versionNumber` | number | ✅ | Số thứ tự bản nộp |
| `versions[].file` | string | ✅ |  |
| `versions[].reviewStatus` | enum `TaskVersionReviewStatus` | ✅ | Trạng thái review của 1 bản nộp task: PENDING, APPROVED, REVISION_REQUESTED |
| `versions[].reviewerNote` | string | ✅ |  |
| `versions[].submittedAt` | string | ✅ | Thời điểm nộp (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotTaskAssignee` | caller is not the assigned assistant of this task |
| 404 | `Error.TaskNotFound` | task not found or invalid id |
| 409 | `Error.InvalidTaskTransition` | invalid task status transition |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "pageId": "507f1f77bcf86cd799439011",
    "regionIds": [
      "507f1f77bcf86cd799439011"
    ],
    "assistantId": "507f1f77bcf86cd799439011",
    "taskType": "BACKGROUND",
    "status": "ASSIGNED",
    "statusReason": "Nội dung mẫu",
    "priority": 0,
    "deadline": "2026-07-20T09:30:00.000Z",
    "assetIds": [
      "507f1f77bcf86cd799439011"
    ],
    "versions": [
      {
        "submittedBy": "string",
        "versionNumber": 1,
        "file": "uploads/507f1f77bcf86cd799439011/anh.png",
        "reviewStatus": "PENDING",
        "reviewerNote": "Nội dung mẫu",
        "submittedAt": "2026-07-20T09:30:00.000Z",
        "submitter": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ],
    "createdAt": "2026-07-20T09:30:00.000Z",
    "groupId": "507f1f77bcf86cd799439011",
    "groupTitle": "Tiêu đề mẫu",
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assets": [
      {
        "id": "507f1f77bcf86cd799439011",
        "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
        "name": "Nguyễn Văn A",
        "assetType": "REFERENCE"
      }
    ],
    "regions": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "coordinates": {
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        "regionType": "PANEL",
        "createdBy": "string",
        "confirmedByMangaka": false,
        "confidenceScore": 0,
        "detectedSubtype": "string",
        "aiModelVersion": "string"
      }
    ],
    "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tasks/:id/submit`
> Assistant nộp kết quả → SUBMITTED + TaskVersion + cascade

**Quyền:** ASSISTANT (Bearer)

**Body** (`SubmitTaskBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `file` | string (1..∞ ký tự) ✍ | ✅ |  |

**Response 201** (`TaskRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `pageId` | string | ✅ | ObjectId của Page |
| `regionIds` | string[] 🆕 | ✅ | **BREAKING (2026-07-21):** thay `regionId`. Danh sách Region id task xử lý; `[]` = cả trang / task nhóm |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `status` | enum `TaskStatus` | ✅ | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `statusReason` | string | ✅ | Latest status-change reason for cancel/reassign |
| `priority` | number | ✅ | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `assetIds` | string[] | ✅ | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |
| `versions` | object[] | ✅ |  |
| `versions[].submittedBy` | string | ✅ |  |
| `versions[].versionNumber` | number | ✅ | Số thứ tự bản nộp |
| `versions[].file` | string | ✅ |  |
| `versions[].reviewStatus` | enum `TaskVersionReviewStatus` | ✅ | Trạng thái review của 1 bản nộp task: PENDING, APPROVED, REVISION_REQUESTED |
| `versions[].reviewerNote` | string | ✅ |  |
| `versions[].submittedAt` | string | ✅ | Thời điểm nộp (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotTaskAssignee` | caller is not the assigned assistant of this task |
| 404 | `Error.TaskNotFound` | task not found or invalid id |
| 409 | `Error.InvalidTaskTransition` | invalid task status transition |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "file": "uploads/507f1f77bcf86cd799439011/anh.png"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "pageId": "507f1f77bcf86cd799439011",
    "regionIds": [
      "507f1f77bcf86cd799439011"
    ],
    "assistantId": "507f1f77bcf86cd799439011",
    "taskType": "BACKGROUND",
    "status": "ASSIGNED",
    "statusReason": "Nội dung mẫu",
    "priority": 0,
    "deadline": "2026-07-20T09:30:00.000Z",
    "assetIds": [
      "507f1f77bcf86cd799439011"
    ],
    "versions": [
      {
        "submittedBy": "string",
        "versionNumber": 1,
        "file": "uploads/507f1f77bcf86cd799439011/anh.png",
        "reviewStatus": "PENDING",
        "reviewerNote": "Nội dung mẫu",
        "submittedAt": "2026-07-20T09:30:00.000Z",
        "submitter": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ],
    "createdAt": "2026-07-20T09:30:00.000Z",
    "groupId": "507f1f77bcf86cd799439011",
    "groupTitle": "Tiêu đề mẫu",
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assets": [
      {
        "id": "507f1f77bcf86cd799439011",
        "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
        "name": "Nguyễn Văn A",
        "assetType": "REFERENCE"
      }
    ],
    "regions": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "coordinates": {
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        "regionType": "PANEL",
        "createdBy": "string",
        "confirmedByMangaka": false,
        "confidenceScore": 0,
        "detectedSubtype": "string",
        "aiModelVersion": "string"
      }
    ],
    "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tasks/:id/approve`
> Mangaka duyệt task → APPROVED

**Quyền:** MANGAKA (Bearer)

**Response 201** (`TaskRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `pageId` | string | ✅ | ObjectId của Page |
| `regionIds` | string[] 🆕 | ✅ | **BREAKING (2026-07-21):** thay `regionId`. Danh sách Region id task xử lý; `[]` = cả trang / task nhóm |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `status` | enum `TaskStatus` | ✅ | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `statusReason` | string | ✅ | Latest status-change reason for cancel/reassign |
| `priority` | number | ✅ | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `assetIds` | string[] | ✅ | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |
| `versions` | object[] | ✅ |  |
| `versions[].submittedBy` | string | ✅ |  |
| `versions[].versionNumber` | number | ✅ | Số thứ tự bản nộp |
| `versions[].file` | string | ✅ |  |
| `versions[].reviewStatus` | enum `TaskVersionReviewStatus` | ✅ | Trạng thái review của 1 bản nộp task: PENDING, APPROVED, REVISION_REQUESTED |
| `versions[].reviewerNote` | string | ✅ |  |
| `versions[].submittedAt` | string | ✅ | Thời điểm nộp (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.TaskNotFound` | task not found or invalid id |
| 409 | `Error.InvalidTaskTransition` | invalid task status transition |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "pageId": "507f1f77bcf86cd799439011",
    "regionIds": [
      "507f1f77bcf86cd799439011"
    ],
    "assistantId": "507f1f77bcf86cd799439011",
    "taskType": "BACKGROUND",
    "status": "ASSIGNED",
    "statusReason": "Nội dung mẫu",
    "priority": 0,
    "deadline": "2026-07-20T09:30:00.000Z",
    "assetIds": [
      "507f1f77bcf86cd799439011"
    ],
    "versions": [
      {
        "submittedBy": "string",
        "versionNumber": 1,
        "file": "uploads/507f1f77bcf86cd799439011/anh.png",
        "reviewStatus": "PENDING",
        "reviewerNote": "Nội dung mẫu",
        "submittedAt": "2026-07-20T09:30:00.000Z",
        "submitter": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ],
    "createdAt": "2026-07-20T09:30:00.000Z",
    "groupId": "507f1f77bcf86cd799439011",
    "groupTitle": "Tiêu đề mẫu",
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assets": [
      {
        "id": "507f1f77bcf86cd799439011",
        "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
        "name": "Nguyễn Văn A",
        "assetType": "REFERENCE"
      }
    ],
    "regions": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "coordinates": {
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        "regionType": "PANEL",
        "createdBy": "string",
        "confirmedByMangaka": false,
        "confidenceScore": 0,
        "detectedSubtype": "string",
        "aiModelVersion": "string"
      }
    ],
    "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tasks/:id/request-revision`
> Mangaka yêu cầu sửa → REVISION_REQUESTED (markup riêng qua /annotations)

**Quyền:** MANGAKA (Bearer)

**Body** (`RequestRevisionBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reviewerNote` | string (1..1000 ký tự) ✍ | ✅ |  |

**Response 201** (`TaskRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `pageId` | string | ✅ | ObjectId của Page |
| `regionIds` | string[] 🆕 | ✅ | **BREAKING (2026-07-21):** thay `regionId`. Danh sách Region id task xử lý; `[]` = cả trang / task nhóm |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `status` | enum `TaskStatus` | ✅ | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `statusReason` | string | ✅ | Latest status-change reason for cancel/reassign |
| `priority` | number | ✅ | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `assetIds` | string[] | ✅ | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |
| `versions` | object[] | ✅ |  |
| `versions[].submittedBy` | string | ✅ |  |
| `versions[].versionNumber` | number | ✅ | Số thứ tự bản nộp |
| `versions[].file` | string | ✅ |  |
| `versions[].reviewStatus` | enum `TaskVersionReviewStatus` | ✅ | Trạng thái review của 1 bản nộp task: PENDING, APPROVED, REVISION_REQUESTED |
| `versions[].reviewerNote` | string | ✅ |  |
| `versions[].submittedAt` | string | ✅ | Thời điểm nộp (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.TaskNotFound` | task not found or invalid id |
| 409 | `Error.InvalidTaskTransition` | invalid task status transition |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reviewerNote": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "pageId": "507f1f77bcf86cd799439011",
    "regionIds": [
      "507f1f77bcf86cd799439011"
    ],
    "assistantId": "507f1f77bcf86cd799439011",
    "taskType": "BACKGROUND",
    "status": "ASSIGNED",
    "statusReason": "Nội dung mẫu",
    "priority": 0,
    "deadline": "2026-07-20T09:30:00.000Z",
    "assetIds": [
      "507f1f77bcf86cd799439011"
    ],
    "versions": [
      {
        "submittedBy": "string",
        "versionNumber": 1,
        "file": "uploads/507f1f77bcf86cd799439011/anh.png",
        "reviewStatus": "PENDING",
        "reviewerNote": "Nội dung mẫu",
        "submittedAt": "2026-07-20T09:30:00.000Z",
        "submitter": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ],
    "createdAt": "2026-07-20T09:30:00.000Z",
    "groupId": "507f1f77bcf86cd799439011",
    "groupTitle": "Tiêu đề mẫu",
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assets": [
      {
        "id": "507f1f77bcf86cd799439011",
        "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
        "name": "Nguyễn Văn A",
        "assetType": "REFERENCE"
      }
    ],
    "regions": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "coordinates": {
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        "regionType": "PANEL",
        "createdBy": "string",
        "confirmedByMangaka": false,
        "confidenceScore": 0,
        "detectedSubtype": "string",
        "aiModelVersion": "string"
      }
    ],
    "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tasks/:id/reassign`
> Giao lại task (ASSIGNED/IN_PROGRESS/REVISION_REQUESTED/ON_HOLD) cho Assistant khác → ASSIGNED

**Quyền:** MANGAKA (Bearer)

**Body** (`ReassignTaskBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `assistantId` | string ✍ | ✅ | ObjectId User của Assistant |

**Response 201** (`TaskRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `pageId` | string | ✅ | ObjectId của Page |
| `regionIds` | string[] 🆕 | ✅ | **BREAKING (2026-07-21):** thay `regionId`. Danh sách Region id task xử lý; `[]` = cả trang / task nhóm |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `status` | enum `TaskStatus` | ✅ | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `statusReason` | string | ✅ | Latest status-change reason for cancel/reassign |
| `priority` | number | ✅ | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `assetIds` | string[] | ✅ | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |
| `versions` | object[] | ✅ |  |
| `versions[].submittedBy` | string | ✅ |  |
| `versions[].versionNumber` | number | ✅ | Số thứ tự bản nộp |
| `versions[].file` | string | ✅ |  |
| `versions[].reviewStatus` | enum `TaskVersionReviewStatus` | ✅ | Trạng thái review của 1 bản nộp task: PENDING, APPROVED, REVISION_REQUESTED |
| `versions[].reviewerNote` | string | ✅ |  |
| `versions[].submittedAt` | string | ✅ | Thời điểm nộp (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.TaskNotFound` | task not found or invalid id |
| 409 | `Error.TaskNotReassignable` | only ASSIGNED/IN_PROGRESS/REVISION_REQUESTED/ON_HOLD tasks can be reassigned; review or cancel submitted tasks first |
| 409 | `Error.AssistantNotHired` | assistant has no ACTIVE studio assignment within hire period (BR-ASSIST-01) |
| 409 | `Error.ChapterOnHold` | chapter is on hold; resume before production mutations |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "assistantId": "507f1f77bcf86cd799439011"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "pageId": "507f1f77bcf86cd799439011",
    "regionIds": [
      "507f1f77bcf86cd799439011"
    ],
    "assistantId": "507f1f77bcf86cd799439011",
    "taskType": "BACKGROUND",
    "status": "ASSIGNED",
    "statusReason": "Nội dung mẫu",
    "priority": 0,
    "deadline": "2026-07-20T09:30:00.000Z",
    "assetIds": [
      "507f1f77bcf86cd799439011"
    ],
    "versions": [
      {
        "submittedBy": "string",
        "versionNumber": 1,
        "file": "uploads/507f1f77bcf86cd799439011/anh.png",
        "reviewStatus": "PENDING",
        "reviewerNote": "Nội dung mẫu",
        "submittedAt": "2026-07-20T09:30:00.000Z",
        "submitter": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ],
    "createdAt": "2026-07-20T09:30:00.000Z",
    "groupId": "507f1f77bcf86cd799439011",
    "groupTitle": "Tiêu đề mẫu",
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assets": [
      {
        "id": "507f1f77bcf86cd799439011",
        "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
        "name": "Nguyễn Văn A",
        "assetType": "REFERENCE"
      }
    ],
    "regions": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "coordinates": {
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        "regionType": "PANEL",
        "createdBy": "string",
        "confirmedByMangaka": false,
        "confidenceScore": 0,
        "detectedSubtype": "string",
        "aiModelVersion": "string"
      }
    ],
    "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tasks/:id/cancel`
> Mangaka cancels a non-terminal task -> CANCELLED and notifies assigned Assistant

**Quyền:** MANGAKA (Bearer)

**Body** (`CancelTaskBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..∞ ký tự) ✍ | — | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 201** (`TaskRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `pageId` | string | ✅ | ObjectId của Page |
| `regionIds` | string[] 🆕 | ✅ | **BREAKING (2026-07-21):** thay `regionId`. Danh sách Region id task xử lý; `[]` = cả trang / task nhóm |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `taskType` | enum `Specialization` | ✅ | Assistant specialization/task type |
| `status` | enum `TaskStatus` | ✅ | Task production status: ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED/REVISION_REQUESTED; ON_HOLD khi assistant nghỉ |
| `statusReason` | string | ✅ | Latest status-change reason for cancel/reassign |
| `priority` | number | ✅ | Độ ưu tiên task (số nhỏ = ưu tiên cao) |
| `deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `assetIds` | string[] | ✅ | Danh sách ObjectId Asset đính kèm (tạo qua POST /uploads/sign) |
| `versions` | object[] | ✅ |  |
| `versions[].submittedBy` | string | ✅ |  |
| `versions[].versionNumber` | number | ✅ | Số thứ tự bản nộp |
| `versions[].file` | string | ✅ |  |
| `versions[].reviewStatus` | enum `TaskVersionReviewStatus` | ✅ | Trạng thái review của 1 bản nộp task: PENDING, APPROVED, REVISION_REQUESTED |
| `versions[].reviewerNote` | string | ✅ |  |
| `versions[].submittedAt` | string | ✅ | Thời điểm nộp (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotSeriesOwner` | current user is not the series owner |
| 404 | `Error.TaskNotFound` | task not found or invalid id |
| 409 | `Error.TaskNotCancellable` | task is APPROVED/CANCELLED and cannot be cancelled |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "pageId": "507f1f77bcf86cd799439011",
    "regionIds": [
      "507f1f77bcf86cd799439011"
    ],
    "assistantId": "507f1f77bcf86cd799439011",
    "taskType": "BACKGROUND",
    "status": "ASSIGNED",
    "statusReason": "Nội dung mẫu",
    "priority": 0,
    "deadline": "2026-07-20T09:30:00.000Z",
    "assetIds": [
      "507f1f77bcf86cd799439011"
    ],
    "versions": [
      {
        "submittedBy": "string",
        "versionNumber": 1,
        "file": "uploads/507f1f77bcf86cd799439011/anh.png",
        "reviewStatus": "PENDING",
        "reviewerNote": "Nội dung mẫu",
        "submittedAt": "2026-07-20T09:30:00.000Z",
        "submitter": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ],
    "createdAt": "2026-07-20T09:30:00.000Z",
    "groupId": "507f1f77bcf86cd799439011",
    "groupTitle": "Tiêu đề mẫu",
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assets": [
      {
        "id": "507f1f77bcf86cd799439011",
        "filePath": "uploads/507f1f77bcf86cd799439011/anh.png",
        "name": "Nguyễn Văn A",
        "assetType": "REFERENCE"
      }
    ],
    "regions": [
      {
        "id": "507f1f77bcf86cd799439011",
        "pageId": "507f1f77bcf86cd799439011",
        "coordinates": {
          "x": 1,
          "y": 1,
          "width": 1,
          "height": 1
        },
        "regionType": "PANEL",
        "createdBy": "string",
        "confirmedByMangaka": false,
        "confidenceScore": 0,
        "detectedSubtype": "string",
        "aiModelVersion": "string"
      }
    ],
    "pageOriginalFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "pageDisplayFile": "uploads/507f1f77bcf86cd799439011/anh.png"
  }
}
```

<!-- payload-example:end -->

---

## §7. Flow 9 — Danh bạ Mangaka/Trợ lý & Studio (kèm Review/Reputation)

**Nghiệp vụ:** hệ thống có danh bạ Mangaka và **danh bạ tìm trợ lý**; lương/điều kiện cộng tác được deal **NGOÀI hệ thống** (không quản lý lương). Mangaka lọc Assistant theo tên/chuyên môn/lịch rảnh/rating → deal ngoài → gửi **CollaborationInvite** (bắt buộc khai thời hạn thuê hireStart–hireEnd + loại việc) → Assistant accept → sinh **StudioAssignment ACTIVE** → từ đó Flow 3 mới cho giao task. Hết hạn thuê tự coi như kết thúc (không cron). Sau khi hợp tác kết thúc, Mangaka đánh giá Assistant (và Editor đánh giá Mangaka) → nuôi **reputation** (Bayesian) → xếp hạng danh bạ.

### Happy path

1. **Mangaka** `GET /assistants?q=&specialization=&availableFrom=&availableTo=&level=` — tìm Assistant theo tên, danh bạ xếp theo isRecommended/reputation, ẨN email/phone. Editor/Board/Mangaka cũng có thể dùng `GET /mangakas?q=&genre=&level=` để tìm Mangaka theo tên/penName.
2. Deal ngoài hệ thống xong → `POST /collaboration-invites` (assistantId + seriesId + hireStart/hireEnd + taskTypes).
3. **Assistant** `POST /collaboration-invites/:id/accept` → StudioAssignment `ACTIVE` (hoặc `/decline`; Mangaka đổi ý → `/cancel`).
4. Làm việc theo Flow 3. Xem quan hệ: `GET /studio-assignments` (2 phía); Mangaka tổng quan xưởng: `GET /studio/overview`.
5. Kết thúc sớm: `POST /studio-assignments/:id/terminate` (kèm lý do) — hoặc để tự hết hạn `hireEnd`.
6. **Đánh giá sau hợp tác:** Mangaka `POST /assistant-reviews` (BẮT BUỘC kèm `studioAssignmentId` đã kết thúc, rating 1–5, upsert theo cặp — review lại = update). Editor đánh giá Mangaka: `POST /mangaka-reviews`. Đọc: `GET /assistant-reviews` / `GET /mangaka-reviews`.
7. Reputation tự tính: `score = (C·m + Σrating)/(C + count)` (m=3.5, C=5); `isRecommended` khi count ≥ 3 và score ≥ ngưỡng AppConfig.

### Unhappy cases

| Tình huống | API | Kết quả |
|---|---|---|
| `hireStart ≥ hireEnd` hoặc ngày quá khứ | `POST /collaboration-invites` | 422 `Error.InvalidHirePeriod` |
| Mời người không phải ASSISTANT | invites | 422 `Error.TargetNotAssistant` |
| Đã có collaboration ACTIVE cùng cặp | invites | 409 `Error.DuplicateActiveCollaboration` |
| Người không được mời bấm accept/decline | accept/decline | 403 `Error.NotInvitee` |
| Cancel invite không phải của mình | cancel | 403 `Error.NotInviteOwner` |
| Accept/decline/cancel khi invite hết PENDING | các action | 409 `Error.InviteNotPending` |
| Terminate assignment không còn ACTIVE | terminate | 409 `Error.AssignmentNotActive` |
| Review khi assignment CHƯA kết thúc / sai cặp | `POST /assistant-reviews` | 422 `Error.ReviewRequiresEndedAssignment` |
| Tự đánh giá chính mình | reviews | 422 `Error.CannotReviewSelf` |
| Review user chưa build profile | reviews | 404 `Error.ProfileNotFound` |
| rating ngoài 1–5 | reviews | 422 |

### API Reference

#### `GET /mangakas`
> Danh bạ Mangaka: tìm theo tên/penName, lọc genre/level, ưu tiên isRecommended/reputation (ẩn email/phone)

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `q` | string (1..100 ký tự) | — | Trim trước khi tìm; khớp `User.name`, `User.displayName` hoặc `MangakaProfile.penName`, không phân biệt hoa thường |
| `genre` | enum `Genre` | — | Lọc Mangaka có thể loại này trong `genres[]` |
| `level` | string (1..100 ký tự) | — | Lọc chính xác theo experienceLevel |
| `limit` | integer (1..100) | — | Số bản ghi mỗi trang (default: `20`) |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (default: `0`) |

**Response 200** (`MangakaDirectoryListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng Mangaka đã có profile, xếp theo isRecommended/reputation |
| `items[].userId` | string | ✅ | ObjectId User |
| `items[].displayName` | string \| null | ✅ | Tên hiển thị |
| `items[].avatar` | string \| null | ✅ | Object key R2 |
| `items[].penName` | string | ✅ | Bút danh |
| `items[].genres` | enum `Genre`[] | ✅ | Thể loại hồ sơ |
| `items[].experienceLevel` | string \| null | ✅ | Cấp kinh nghiệm |
| `items[].bio` | string \| null | ✅ | Giới thiệu |
| `items[].portfolioFiles` | string[] | ✅ | Object key portfolio |
| `items[].reputationScore` | number | ✅ | Điểm uy tín Bayesian-weighted |
| `items[].ratingAvg` | number | ✅ | Điểm đánh giá trung bình |
| `items[].ratingCount` | number | ✅ | Số lượt đánh giá |
| `items[].isRecommended` | boolean | ✅ | Nhãn đề xuất hệ thống |
| `total` | number | ✅ | Tổng số bản ghi khớp filter |
| `limit` | number | ✅ | Số bản ghi mỗi trang |
| `offset` | number | ✅ | Số bản ghi bỏ qua |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "userId": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
        "penName": "Bút danh mẫu",
        "genres": [
          "ACTION"
        ],
        "experienceLevel": "string",
        "bio": "Nội dung mẫu",
        "portfolioFiles": [
          "uploads/507f1f77bcf86cd799439011/anh.png"
        ],
        "reputationScore": 0,
        "ratingAvg": 0,
        "ratingCount": 1,
        "isRecommended": false
      }
    ],
    "total": 1,
    "limit": 1,
    "offset": 1
  }
}
```

<!-- payload-example:end -->

---

#### `GET /assistants`
> Danh bạ trợ lý: tìm theo tên, lọc specialization/level/availability, ưu tiên isRecommended/reputation (ẩn email/phone)

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `q` | string (1..100 ký tự) | — | Trim trước khi tìm; khớp `User.name` hoặc `User.displayName`, không phân biệt hoa thường |
| `specialization` | enum `Specialization` | — | Assistant specialization/task type |
| `level` | string (1..100 ký tự) | — |  |
| `availableFrom` | string (regex, ISO 8601) | — |  |
| `availableTo` | string (regex, ISO 8601) | — |  |
| `limit` | integer (1..100) | — | Số bản ghi mỗi trang (default: `20`) |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (phân trang) (default: `0`) |

**Response 200** (`AssistantDirectoryListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].userId` | string | ✅ | ObjectId của User |
| `items[].displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `items[].avatar` | string | ✅ | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |
| `items[].specializations` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `items[].experienceLevel` | string | ✅ | Cấp kinh nghiệm |
| `items[].portfolioFiles` | string[] | ✅ |  |
| `items[].availabilityStatus` | enum `AvailabilityStatus` | ✅ | Assistant availability: AVAILABLE, BUSY, ON_LEAVE, UNAVAILABLE |
| `items[].availabilityFrom` | string | ✅ |  |
| `items[].availabilityTo` | string | ✅ |  |
| `items[].reputationScore` | number | ✅ | Điểm uy tín Bayesian-weighted |
| `items[].ratingAvg` | number | ✅ | Điểm trung bình đánh giá |
| `items[].ratingCount` | number | ✅ | Số lượt đánh giá |
| `items[].isRecommended` | boolean | ✅ | true = hệ thống gắn nhãn đề xuất (ratingCount ≥ 3 và score ≥ ngưỡng AppConfig) |
| `total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `limit` | number | ✅ | Số bản ghi mỗi trang |
| `offset` | number | ✅ | Số bản ghi bỏ qua (phân trang) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "userId": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png",
        "specializations": [
          "BACKGROUND"
        ],
        "experienceLevel": "string",
        "portfolioFiles": [
          "uploads/507f1f77bcf86cd799439011/anh.png"
        ],
        "availabilityStatus": "AVAILABLE",
        "availabilityFrom": "string",
        "availabilityTo": "string",
        "reputationScore": 0,
        "ratingAvg": 0,
        "ratingCount": 1,
        "isRecommended": false
      }
    ],
    "total": 1,
    "limit": 1,
    "offset": 1
  }
}
```

<!-- payload-example:end -->

---

#### `POST /collaboration-invites`
> Mangaka mời Assistant cộng tác → invite PENDING + notify

**Quyền:** MANGAKA (Bearer)

**Body** (`CreateInviteBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `assistantId` | string ✍ | ✅ | ObjectId User của Assistant |
| `seriesId` | string ✍ | — | metadata; A4-a KHÔNG validate series tồn tại/sở hữu |
| `hireStart` | string (regex, ISO 8601) ✍ | ✅ | Ngày bắt đầu thuê (ISO) |
| `hireEnd` | string (regex, ISO 8601) ✍ | ✅ | Ngày kết thúc thuê (ISO) |
| `taskTypes` | enum `Specialization`[] | ✅ | Assistant specialization/task type |

**Response 201** (`InviteRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `seriesId` | string | ✅ | ObjectId của Series |
| `hireStart` | string | ✅ | Ngày bắt đầu thuê (ISO) |
| `hireEnd` | string | ✅ | Ngày kết thúc thuê (ISO) |
| `taskTypes` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `status` | enum `CollaborationInviteStatus` | ✅ | Trạng thái lời mời cộng tác: PENDING, ACCEPTED, DECLINED, EXPIRED, CANCELLED |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.AssistantNotFound` | assistant does not exist or is not active |
| 409 | `Error.DuplicateActiveCollaboration` | an active collaboration or pending invite already exists for this pair |
| 422 | `Error.TargetNotAssistant` | target user is not an assistant |
| 422 | — | Error.InvalidHirePeriod (hireEnd) - hire period is invalid (start must be before end, end in the future)

Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "assistantId": "507f1f77bcf86cd799439011",
  "seriesId": "507f1f77bcf86cd799439011",
  "hireStart": "2026-07-20T09:30:00.000Z",
  "hireEnd": "2026-07-20T09:30:00.000Z",
  "taskTypes": [
    "BACKGROUND"
  ]
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "assistantId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "hireStart": "string",
    "hireEnd": "string",
    "taskTypes": [
      "BACKGROUND"
    ],
    "status": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /collaboration-invites`
> Danh sách invite theo scope role (Mangaka=gửi, Assistant=nhận)
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA, ASSISTANT (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `status` | enum `CollaborationInviteStatus` | — | Trạng thái lời mời cộng tác: PENDING, ACCEPTED, DECLINED, EXPIRED, CANCELLED |
| `limit` | integer (≥ 0, ≤ 100) | — | Số bản ghi mỗi trang (default: `20`) |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (phân trang) (default: `0`) |

**Response 200** (`InviteListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `items[].assistantId` | string | ✅ | ObjectId User của Assistant |
| `items[].seriesId` | string | ✅ | ObjectId của Series |
| `items[].hireStart` | string | ✅ | Ngày bắt đầu thuê (ISO) |
| `items[].hireEnd` | string | ✅ | Ngày kết thúc thuê (ISO) |
| `items[].taskTypes` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `items[].status` | enum `CollaborationInviteStatus` | ✅ | Trạng thái lời mời cộng tác: PENDING, ACCEPTED, DECLINED, EXPIRED, CANCELLED |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |
| `total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `limit` | number | ✅ | Số bản ghi mỗi trang |
| `offset` | number | ✅ | Số bản ghi bỏ qua (phân trang) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "mangakaId": "507f1f77bcf86cd799439011",
        "assistantId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "hireStart": "string",
        "hireEnd": "string",
        "taskTypes": [
          "BACKGROUND"
        ],
        "status": "PENDING",
        "createdAt": "2026-07-20T09:30:00.000Z",
        "mangaka": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "assistant": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "series": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu"
        }
      }
    ],
    "total": 1,
    "limit": 1,
    "offset": 1
  }
}
```

<!-- payload-example:end -->

---

#### `GET /collaboration-invites/:id`
> Chi tiết 1 invite (chỉ owner hoặc invitee)
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA, ASSISTANT (Bearer)

**Response 200** (`InviteRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `seriesId` | string | ✅ | ObjectId của Series |
| `hireStart` | string | ✅ | Ngày bắt đầu thuê (ISO) |
| `hireEnd` | string | ✅ | Ngày kết thúc thuê (ISO) |
| `taskTypes` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `status` | enum `CollaborationInviteStatus` | ✅ | Trạng thái lời mời cộng tác: PENDING, ACCEPTED, DECLINED, EXPIRED, CANCELLED |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.InviteNotFound` | collaboration invite does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "assistantId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "hireStart": "string",
    "hireEnd": "string",
    "taskTypes": [
      "BACKGROUND"
    ],
    "status": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /collaboration-invites/:id/accept`
> Assistant chấp nhận invite → tạo StudioAssignment ACTIVE

**Quyền:** ASSISTANT (Bearer)

**Response 201** (`AssignmentRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `seriesId` | string | ✅ | ObjectId của Series |
| `hireStart` | string | ✅ | Ngày bắt đầu thuê (ISO) |
| `hireEnd` | string | ✅ | Ngày kết thúc thuê (ISO) |
| `assignedTaskTypes` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `status` | enum `StudioAssignmentStatus` | ✅ | Trạng thái hợp tác studio: ACTIVE, COMPLETED, TERMINATED |
| `terminatedReason` | string | ✅ |  |
| `activeNow` | boolean | ✅ | true = status ACTIVE và thời điểm hiện tại trong [hireStart, hireEnd] (lazy) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotInvitee` | current user is not the invitee |
| 404 | `Error.InviteNotFound` | collaboration invite does not exist |
| 409 | `Error.InviteNotPending` | invite is not in PENDING state |
| 409 | `Error.DuplicateActiveCollaboration` | an active collaboration or pending invite already exists for this pair |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "assistantId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "hireStart": "string",
    "hireEnd": "string",
    "assignedTaskTypes": [
      "BACKGROUND"
    ],
    "status": "ACTIVE",
    "terminatedReason": "Nội dung mẫu",
    "activeNow": false,
    "createdAt": "2026-07-20T09:30:00.000Z",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /collaboration-invites/:id/decline`
> Assistant từ chối invite → DECLINED

**Quyền:** ASSISTANT (Bearer)

**Response 201** (`InviteRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `seriesId` | string | ✅ | ObjectId của Series |
| `hireStart` | string | ✅ | Ngày bắt đầu thuê (ISO) |
| `hireEnd` | string | ✅ | Ngày kết thúc thuê (ISO) |
| `taskTypes` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `status` | enum `CollaborationInviteStatus` | ✅ | Trạng thái lời mời cộng tác: PENDING, ACCEPTED, DECLINED, EXPIRED, CANCELLED |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotInvitee` | current user is not the invitee |
| 404 | `Error.InviteNotFound` | collaboration invite does not exist |
| 409 | `Error.InviteNotPending` | invite is not in PENDING state |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "assistantId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "hireStart": "string",
    "hireEnd": "string",
    "taskTypes": [
      "BACKGROUND"
    ],
    "status": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /collaboration-invites/:id/cancel`
> Mangaka huỷ invite của mình → CANCELLED

**Quyền:** MANGAKA (Bearer)

**Response 201** (`InviteRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `seriesId` | string | ✅ | ObjectId của Series |
| `hireStart` | string | ✅ | Ngày bắt đầu thuê (ISO) |
| `hireEnd` | string | ✅ | Ngày kết thúc thuê (ISO) |
| `taskTypes` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `status` | enum `CollaborationInviteStatus` | ✅ | Trạng thái lời mời cộng tác: PENDING, ACCEPTED, DECLINED, EXPIRED, CANCELLED |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotInviteOwner` | current user is not the invite owner |
| 404 | `Error.InviteNotFound` | collaboration invite does not exist |
| 409 | `Error.InviteNotPending` | invite is not in PENDING state |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "assistantId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "hireStart": "string",
    "hireEnd": "string",
    "taskTypes": [
      "BACKGROUND"
    ],
    "status": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /studio-assignments`
> Danh sách assignment theo scope role (filter status / activeNow=true)
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA, ASSISTANT (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `status` | enum `StudioAssignmentStatus` | — | Trạng thái hợp tác studio: ACTIVE, COMPLETED, TERMINATED |
| `activeNow` | enum(true, false) | — |  |
| `limit` | integer (≥ 0, ≤ 100) | — | Số bản ghi mỗi trang (default: `20`) |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (phân trang) (default: `0`) |

**Response 200** (`AssignmentListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `items[].assistantId` | string | ✅ | ObjectId User của Assistant |
| `items[].seriesId` | string | ✅ | ObjectId của Series |
| `items[].hireStart` | string | ✅ | Ngày bắt đầu thuê (ISO) |
| `items[].hireEnd` | string | ✅ | Ngày kết thúc thuê (ISO) |
| `items[].assignedTaskTypes` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `items[].status` | enum `StudioAssignmentStatus` | ✅ | Trạng thái hợp tác studio: ACTIVE, COMPLETED, TERMINATED |
| `items[].terminatedReason` | string | ✅ |  |
| `items[].activeNow` | boolean | ✅ | true = status ACTIVE và thời điểm hiện tại trong [hireStart, hireEnd] (lazy) |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |
| `total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `limit` | number | ✅ | Số bản ghi mỗi trang |
| `offset` | number | ✅ | Số bản ghi bỏ qua (phân trang) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "mangakaId": "507f1f77bcf86cd799439011",
        "assistantId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "hireStart": "string",
        "hireEnd": "string",
        "assignedTaskTypes": [
          "BACKGROUND"
        ],
        "status": "ACTIVE",
        "terminatedReason": "Nội dung mẫu",
        "activeNow": false,
        "createdAt": "2026-07-20T09:30:00.000Z",
        "mangaka": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "assistant": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "series": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu"
        }
      }
    ],
    "total": 1,
    "limit": 1,
    "offset": 1
  }
}
```

<!-- payload-example:end -->

---

#### `GET /studio-assignments/:id`
> Chi tiết 1 assignment (chỉ mangaka owner hoặc assistant)
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA, ASSISTANT (Bearer)

**Response 200** (`AssignmentRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `seriesId` | string | ✅ | ObjectId của Series |
| `hireStart` | string | ✅ | Ngày bắt đầu thuê (ISO) |
| `hireEnd` | string | ✅ | Ngày kết thúc thuê (ISO) |
| `assignedTaskTypes` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `status` | enum `StudioAssignmentStatus` | ✅ | Trạng thái hợp tác studio: ACTIVE, COMPLETED, TERMINATED |
| `terminatedReason` | string | ✅ |  |
| `activeNow` | boolean | ✅ | true = status ACTIVE và thời điểm hiện tại trong [hireStart, hireEnd] (lazy) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.AssignmentNotFound` | studio assignment does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "assistantId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "hireStart": "string",
    "hireEnd": "string",
    "assignedTaskTypes": [
      "BACKGROUND"
    ],
    "status": "ACTIVE",
    "terminatedReason": "Nội dung mẫu",
    "activeNow": false,
    "createdAt": "2026-07-20T09:30:00.000Z",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /studio-assignments/:id/terminate`
> Mangaka kết thúc sớm assignment ACTIVE → TERMINATED + notify

**Quyền:** MANGAKA (Bearer)

**Body** (`TerminateAssignmentBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..500 ký tự) ✍ | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 201** (`AssignmentRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `assistantId` | string | ✅ | ObjectId User của Assistant |
| `groupId` | string \| null | ✅ | 🆕 Nhóm việc chứa task này (UUID); `null` = task lẻ |
| `groupTitle` | string \| null | ✅ | 🆕 Tên nhóm việc hiển thị |
| `seriesId` | string | ✅ | ObjectId của Series |
| `hireStart` | string | ✅ | Ngày bắt đầu thuê (ISO) |
| `hireEnd` | string | ✅ | Ngày kết thúc thuê (ISO) |
| `assignedTaskTypes` | enum `Specialization`[] | ✅ | Assistant specialization/task type |
| `status` | enum `StudioAssignmentStatus` | ✅ | Trạng thái hợp tác studio: ACTIVE, COMPLETED, TERMINATED |
| `terminatedReason` | string | ✅ |  |
| `activeNow` | boolean | ✅ | true = status ACTIVE và thời điểm hiện tại trong [hireStart, hireEnd] (lazy) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignmentOwner` | current user is not the owner of this assignment |
| 404 | `Error.AssignmentNotFound` | studio assignment does not exist |
| 409 | `Error.AssignmentNotActive` | studio assignment is not active |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "assistantId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "hireStart": "string",
    "hireEnd": "string",
    "assignedTaskTypes": [
      "BACKGROUND"
    ],
    "status": "ACTIVE",
    "terminatedReason": "Nội dung mẫu",
    "activeNow": false,
    "createdAt": "2026-07-20T09:30:00.000Z",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "assistant": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /studio/overview`
> Mangaka overview of active production chapters sorted by warning severity

**Quyền:** MANGAKA (Bearer)

**Response 200** (`StudioOverviewRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].chapterId` | string | ✅ | ObjectId của Chapter |
| `items[].seriesId` | string | ✅ | ObjectId của Series |
| `items[].seriesTitle` | string | ✅ |  |
| `items[].chapterNumber` | number | ✅ | Số thứ tự chương trong series |
| `items[].title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `items[].manuscriptStatus` | enum `ManuscriptStatus` | ✅ | Manuscript production status |
| `items[].deadline` | string | ✅ | Hạn chót (ISO 8601 UTC) |
| `items[].remainingHours` | number | ✅ |  |
| `items[].progressPct` | number | ✅ |  |
| `items[].warningLevel` | enum(NONE, YELLOW, RED, CRITICAL) | ✅ | Deadline warning: NONE an toan, YELLOW nguy co, RED kho kip, CRITICAL qua han |
| `items[].onHold` | boolean | ✅ |  |
| `items[].pagesReady` | number | ✅ | Page ready theo Task |
| `items[].pagesPending` | number | ✅ | Page chưa ready theo Task |
| `items[].totalPages` | number | ✅ | Tổng số trang của chương |
| `items[].openTasks` | number | ✅ |  |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "chapterId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "seriesTitle": "Tiêu đề mẫu",
        "chapterNumber": 1,
        "title": "Tiêu đề mẫu",
        "manuscriptStatus": "DRAFT",
        "deadline": "2026-07-20T09:30:00.000Z",
        "remainingHours": 0,
        "progressPct": 50,
        "warningLevel": "NONE",
        "onHold": false,
        "pagesReady": 1,
        "pagesPending": 1,
        "totalPages": 1,
        "openTasks": 0
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /dashboard/mangaka`
> Dashboard tổng hợp cho Mangaka trong **1 call** — studio overview + ranking series + badge chưa đọc + số vòng sửa còn mở. Thay cho việc FE gọi rời `GET /studio/overview` + `GET /rankings` + `GET /notifications` + `GET /revision-requests`.

**Quyền:** MANGAKA (Bearer) — role khác → 403.

**Response 200** (`MangakaDashboardRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `studio` | object[] | ✅ | **Y HỆT `items` của `GET /studio/overview`**; mỗi item dùng `pagesReady/pagesPending`, không còn `pagesCompleted` |
| `rankings` | object[] | ✅ | Ranking **kỳ gần nhất** của TỪNG series thuộc Mangaka (series chưa có ranking sẽ không xuất hiện) |
| `rankings[].seriesId` | string | ✅ | |
| `rankings[].seriesTitle` | string | ✅ | |
| `rankings[].seriesStatus` | enum `SeriesStatus` | ✅ | |
| `rankings[].rankPosition` | number \| null | ✅ | null nếu kỳ đó chưa xếp hạng series này |
| `rankings[].voteCount` | number | ✅ | Tổng trọng số phiếu kỳ gần nhất |
| `rankings[].previousRank` | number \| null | ✅ | |
| `rankings[].rankChange` | number \| null | ✅ | + tăng hạng, − tụt hạng so với kỳ trước |
| `rankings[].riskLevel` | enum `RiskLevel` | ✅ | NONE/LOW/MEDIUM/SEVERE |
| `rankings[].isAtRisk` | boolean | ✅ | |
| `rankings[].recordedAt` | string | ✅ | ISO 8601 UTC — thời điểm chốt ranking |
| `unreadNotifications` | number | ✅ | Số thông báo chưa đọc (badge) |
| `openRevisionRequests` | number | ✅ | Số vòng yêu cầu sửa còn mở mà Mangaka phải xử lý |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "studio": [
      {
        "chapterId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "seriesTitle": "Tiêu đề mẫu",
        "chapterNumber": 1,
        "title": "Tiêu đề mẫu",
        "manuscriptStatus": "DRAFT",
        "deadline": "2026-07-20T09:30:00.000Z",
        "remainingHours": 0,
        "progressPct": 50,
        "warningLevel": "NONE",
        "onHold": false,
        "pagesReady": 1,
        "pagesPending": 1,
        "totalPages": 1,
        "openTasks": 0
      }
    ],
    "rankings": [
      {
        "seriesId": "507f1f77bcf86cd799439011",
        "seriesTitle": "Tiêu đề mẫu",
        "seriesStatus": "DRAFT",
        "rankPosition": 1,
        "voteCount": 1,
        "previousRank": 1,
        "rankChange": 1,
        "riskLevel": "NONE",
        "isAtRisk": false,
        "recordedAt": "2026-07-20T09:30:00.000Z"
      }
    ],
    "unreadNotifications": 0,
    "openRevisionRequests": 0
  }
}
```

<!-- payload-example:end -->

---

#### `GET /dashboard/mangaka/earnings`
> Thu nhập Mangaka tổng hợp từ `PaymentRecord` (Flow 6). Tách khỏi `/dashboard/mangaka` vì màn tiền thường mở riêng và nặng hơn.

**Quyền:** MANGAKA (Bearer) — role khác → 403.

**Response 200** (`MangakaEarningsRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `totalPaid` | number | ✅ | Tổng tiền đã thực chi (`status=PAID`) |
| `totalPending` | number | ✅ | Đã kích hoạt/duyệt nhưng chưa chi (`TRIGGERED` + `APPROVED`) |
| `totalMissed` | number | ✅ | Mốc điều kiện không đạt (`MISSED`) |
| `byStatus` | object | ✅ | Map `PaymentRecordStatus` → `{count, amount}` |
| `byType` | object | ✅ | Map `PaymentType` → `{count, amount}` (CONDITION_PAYOUT / REVENUE_SHARE / COMPENSATION) |
| `recent[]` | object[] | ✅ | Các khoản gần nhất |
| `recent[].id` | string | ✅ | PaymentRecord ObjectId |
| `recent[].amount` | number | ✅ | |
| `recent[].status` | enum `PaymentRecordStatus` | ✅ | |
| `recent[].paymentType` | enum `PaymentType` | ✅ | |
| `recent[].seriesId` | string \| null | ✅ | null nếu khoản chi không gắn trực tiếp series |
| `recent[].period` | string \| null | ✅ | Kỳ thanh toán; null nếu loại khoản không theo kỳ |
| `recent[].paidAt` | string \| null | ✅ | ISO 8601 UTC; null khi chưa chi |
| `recent[].createdAt` | string | ✅ | ISO 8601 UTC |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "totalPaid": 1,
    "totalPending": 1,
    "totalMissed": 1,
    "byStatus": {},
    "byType": {},
    "recent": [
      {
        "id": "507f1f77bcf86cd799439011",
        "amount": 1000000,
        "status": "TRIGGERED",
        "paymentType": "CONDITION_PAYOUT",
        "seriesId": "507f1f77bcf86cd799439011",
        "period": "string",
        "paidAt": "2026-07-20T09:30:00.000Z",
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /dashboard/assistant`
> Dashboard Assistant trong 1 call — khối lượng task + số hợp tác đang hiệu lực + uy tín + badge.

**Quyền:** ASSISTANT (Bearer) — role khác → 403.

**Response 200** (`AssistantDashboardRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `tasks.byStatus` | object | ✅ | Map `TaskStatus` → số lượng (task của chính mình) |
| `tasks.openTotal` | number | ✅ | Tổng task đang mở (loại `APPROVED`/`CANCELLED`) |
| `activeAssignments` | number | ✅ | Số `StudioAssignment` ACTIVE còn trong `hire_period` |
| `reputation.ratingAvg` | number | ✅ | Điểm trung bình thô |
| `reputation.ratingCount` | number | ✅ | Số lượt đánh giá |
| `reputation.reputationScore` | number | ✅ | Điểm Bayesian (m=3.5, C=5) |
| `reputation.isRecommended` | boolean | ✅ | `ratingCount ≥ 3 && score ≥ ngưỡng AppConfig` |
| `unreadNotifications` | number | ✅ | Badge |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "tasks": {
      "byStatus": {},
      "openTotal": 1
    },
    "activeAssignments": 0,
    "reputation": {
      "ratingAvg": 0,
      "ratingCount": 1,
      "reputationScore": 0,
      "isRecommended": false
    },
    "unreadNotifications": 0
  }
}
```

<!-- payload-example:end -->

---

#### `GET /dashboard/editor`
> Dashboard Editor — hàng đợi review + phân bố series phụ trách + series nguy cơ + cảnh báo sản xuất + hợp đồng đang chờ.

**Quyền:** EDITOR (Bearer) — role khác → 403.

**Response 200** (`EditorDashboardRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `reviewQueue` | number | ✅ | Số series ở hàng đợi chờ claim (`IN_REVIEW` + chưa có editor) |
| `mySeries.byStatus` | object | ✅ | Map `SeriesStatus` → số lượng series mình phụ trách |
| `mySeries.total` | number | ✅ | |
| `atRisk[]` | object[] | ✅ | Series mình phụ trách đang ở vùng nguy cơ ranking |
| `atRisk[].seriesId` / `.title` | string | ✅ | |
| `atRisk[].riskLevel` | enum `RiskLevel` | ✅ | NONE/LOW/MEDIUM/SEVERE |
| `atRisk[].rankPosition` | number \| null | ✅ | null nếu kỳ gần nhất chưa xếp hạng series |
| `productionAlerts[]` | object[] | ✅ | **Cùng shape `StudioOverviewItem`** (có `pagesReady`/`pagesPending`/`warningLevel`) — chapter sắp/đã trễ deadline |
| `pendingContracts[]` | object[] | ✅ | Hợp đồng đang chờ thao tác |
| `pendingContracts[].contractId` / `.seriesId` | string | ✅ | |
| `pendingContracts[].status` | enum `ContractStatus` | ✅ | |
| `unreadNotifications` | number | ✅ | Badge |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "reviewQueue": 0,
    "mySeries": {
      "byStatus": {},
      "total": 1
    },
    "atRisk": [
      {
        "seriesId": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "riskLevel": "NONE",
        "rankPosition": 1
      }
    ],
    "productionAlerts": [
      {
        "chapterId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "seriesTitle": "Tiêu đề mẫu",
        "chapterNumber": 1,
        "title": "Tiêu đề mẫu",
        "manuscriptStatus": "DRAFT",
        "deadline": "2026-07-20T09:30:00.000Z",
        "remainingHours": 0,
        "progressPct": 50,
        "warningLevel": "NONE",
        "onHold": false,
        "pagesReady": 1,
        "pagesPending": 1,
        "totalPages": 1,
        "openTasks": 0
      }
    ],
    "pendingContracts": [
      {
        "contractId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "status": "DRAFT"
      }
    ],
    "unreadNotifications": 0
  }
}
```

<!-- payload-example:end -->

---

#### `GET /dashboard/board`
> Dashboard Board Member — quyết định đang chờ mình bỏ phiếu + phiên họp sắp tới + series nguy cơ nghiêm trọng.

**Quyền:** BOARD_MEMBER (Bearer) — role khác → 403.

**Response 200** (`BoardDashboardRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `pendingDecisions[]` | object[] | ✅ | Decision trong phiên ACTIVE mà mình thuộc roster |
| `pendingDecisions[].decisionId` | string | ✅ | BoardDecision ObjectId |
| `pendingDecisions[].boardSessionId` | string | ✅ | Phiên đang ACTIVE (dùng để join WS `/board`) |
| `pendingDecisions[].decisionType` | enum `DecisionType` | ✅ | SERIALIZATION/CANCELLATION/... |
| `pendingDecisions[].targetSeries` | object \| null | ✅ | `{id, title}`; null nếu decision không nhắm 1 series |
| `pendingDecisions[].phase` | enum `BoardSessionPhase` | ✅ | **PRESENTING/QA/VOTING — chỉ `VOTING` mới vote được** (Spec 16), sớm hơn → 409 `Error.VotingNotOpen` |
| `pendingDecisions[].result` | enum `BoardDecisionResult` | ✅ | FE **disable nút vote** khi `result ∉ {PENDING, PENDING_QUORUM}` (Spec 17) |
| `upcomingSessions` | number | ✅ | Số phiên họp sắp diễn ra |
| `atRiskSevere[]` | object[] | ✅ | Series `riskLevel=SEVERE` cần Board xem xét (Flow 5) |
| `atRiskSevere[].seriesId` / `.title` | string | ✅ | |
| `atRiskSevere[].rankPosition` | number \| null | ✅ | |
| `unreadNotifications` | number | ✅ | Badge |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "pendingDecisions": [
      {
        "decisionId": "507f1f77bcf86cd799439011",
        "boardSessionId": "507f1f77bcf86cd799439011",
        "decisionType": "CONTINUE",
        "targetSeries": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu"
        },
        "phase": "PRESENTING",
        "result": "PENDING"
      }
    ],
    "upcomingSessions": 0,
    "atRiskSevere": [
      {
        "seriesId": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "rankPosition": 1
      }
    ],
    "unreadNotifications": 0
  }
}
```

<!-- payload-example:end -->

---

#### `GET /dashboard/admin`
> Dashboard Super Admin — thống kê hệ thống + badge.

**Quyền:** SUPER_ADMIN (Bearer) — role khác → 403.

**Response 200** (`AdminDashboardRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `systemStats` | object | ✅ | **Y HỆT response `GET /admin/users/stats`** (tổng user, phân bố theo role/status…) |
| `unreadNotifications` | number | ✅ | Badge |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "systemStats": {
      "users": {
        "total": 1,
        "deleted": 0,
        "byStatus": {},
        "byRole": {}
      },
      "series": {
        "total": 1,
        "byStatus": {}
      },
      "chapters": {
        "total": 1,
        "published": 0
      },
      "tasks": {
        "total": 1,
        "byStatus": {}
      }
    },
    "unreadNotifications": 0
  }
}
```

<!-- payload-example:end -->

---

#### `POST /assistant-reviews`
> Mangaka đánh giá Assistant (rating 1-5 + comment) sau StudioAssignment → feed reputation (A-AUTH-07)

**Quyền:** MANGAKA (Bearer)

**Body** (`CreateAssistantReviewBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `assistantId` | string ✍ | ✅ | ObjectId User của Assistant |
| `rating` | integer (≥ 1, ≤ 5) ✍ | ✅ | Điểm đánh giá 1–5 (int) |
| `comment` | string (0..1000 ký tự) ✍ | — | Nhận xét text tự do |
| `studioAssignmentId` | string ✍ | ✅ |  |
| `seriesId` | string ✍ | — | ObjectId của Series |

**Response 201** (`ReviewRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `rating` | number | ✅ | Điểm đánh giá 1–5 (int) |
| `comment` | string | ✅ | Nhận xét text tự do |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |
| `reviewer` | object | — |  |
| `reviewer.id` | string | ✅ | ObjectId của bản ghi |
| `reviewer.displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `reviewer.avatar` | string | ✅ | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ProfileNotFound` | profile does not exist |
| 422 | `Error.CannotReviewSelf` | reviewer and target user must be different |
| 422 | `Error.ReviewRequiresEndedAssignment` | review requires an ended studio assignment between the pair |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "assistantId": "507f1f77bcf86cd799439011",
  "rating": 1,
  "comment": "Nội dung mẫu",
  "studioAssignmentId": "507f1f77bcf86cd799439011",
  "seriesId": "507f1f77bcf86cd799439011"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "rating": 0,
    "comment": "Nội dung mẫu",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewer": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /assistant-reviews`
> List review của 1 Assistant (phân trang)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `assistantId` | string (1..∞ ký tự) | ✅ | ObjectId User của Assistant |
| `limit` | integer (≥ 0) | — | Số bản ghi mỗi trang |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (phân trang) |

**Response 200** (`ReviewListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].rating` | number | ✅ | Điểm đánh giá 1–5 (int) |
| `items[].comment` | string | ✅ | Nhận xét text tự do |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |
| `items[].reviewer` | object | — |  |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "rating": 0,
        "comment": "Nội dung mẫu",
        "createdAt": "2026-07-20T09:30:00.000Z",
        "reviewer": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `POST /mangaka-reviews`
> Editor đánh giá Mangaka (rating 1-5 + comment) sau series/hợp tác → feed reputation (A-AUTH-07)

**Quyền:** EDITOR (Bearer)

**Body** (`CreateMangakaReviewBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `mangakaId` | string ✍ | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `rating` | integer (≥ 1, ≤ 5) ✍ | ✅ | Điểm đánh giá 1–5 (int) |
| `comment` | string (0..1000 ký tự) ✍ | — | Nhận xét text tự do |
| `seriesId` | string ✍ | — | ObjectId của Series |

**Response 201** (`ReviewRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `rating` | number | ✅ | Điểm đánh giá 1–5 (int) |
| `comment` | string | ✅ | Nhận xét text tự do |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |
| `reviewer` | object | — |  |
| `reviewer.id` | string | ✅ | ObjectId của bản ghi |
| `reviewer.displayName` | string | ✅ | Tên hiển thị (null = dùng name) |
| `reviewer.avatar` | string | ✅ | Object key ảnh đại diện trên R2 — FE đổi sang signed GET (§14) để hiển thị |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ProfileNotFound` | profile does not exist |
| 422 | `Error.CannotReviewSelf` | reviewer and target user must be different |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "mangakaId": "507f1f77bcf86cd799439011",
  "rating": 1,
  "comment": "Nội dung mẫu",
  "seriesId": "507f1f77bcf86cd799439011"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "rating": 0,
    "comment": "Nội dung mẫu",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewer": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /mangaka-reviews`
> List review của 1 Mangaka (phân trang)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `mangakaId` | string (1..∞ ký tự) | ✅ | ObjectId User của Mangaka chủ sở hữu |
| `limit` | integer (≥ 0) | — | Số bản ghi mỗi trang |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (phân trang) |

**Response 200** (`ReviewListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].rating` | number | ✅ | Điểm đánh giá 1–5 (int) |
| `items[].comment` | string | ✅ | Nhận xét text tự do |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |
| `items[].reviewer` | object | — |  |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "rating": 0,
        "comment": "Nội dung mẫu",
        "createdAt": "2026-07-20T09:30:00.000Z",
        "reviewer": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        }
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

## §8. Flow 10 — Deadline Negotiation (thương lượng deadline)

**Nghiệp vụ:** Editor vốn có quyền set/gia hạn deadline **đơn phương** (§5 bước 2). Flow này dành cho **thương lượng 2 chiều** (Mangaka xin dời, hoặc 2 bên bất đồng): propose → counter (turn-taking — chỉ phe đối diện được phản hồi) → agree → **Editor finalize** (ghi vào Schedule). Nếu thay đổi **ảnh hưởng slot xuất bản** (dời quá `DEADLINE_SLOT_GRACE_HOURS`, mặc định 48h — hệ thống tự đánh giá `affectsSlot`) hoặc 2 bên **bất đồng** (reject → ESCALATED) thì **Board phân xử** qua `board-resolve`.

### Happy path

1. **Mangaka hoặc Editor** (người trong cuộc của chapter) `POST /deadline-requests` `{chapterId, requestedDeadline, reason}` → `PROPOSED`. Hệ thống tự tính `affectsSlot`.
2. Phe đối diện: `POST /deadline-requests/:id/counter` (đề xuất mốc khác — flip lượt, lặp được) hoặc `POST .../agree` → `AGREED_BY_PARTIES`.
3. Không ảnh hưởng slot → **Editor** `POST .../finalize` → `APPROVED` + Schedule cập nhật (tái dùng cơ chế extension, giữ lịch sử).
4. Ảnh hưởng slot → tự sang `BOARD_REVIEW` → **Board** `POST .../board-resolve` (approve → cập nhật Schedule / reject).
5. Bất đồng: một phe `POST .../reject` → `ESCALATED` → Board `board-resolve` phân xử. Người tạo đổi ý: `POST .../withdraw` → `REJECTED`.

### Unhappy cases

| Tình huống | API | Kết quả |
|---|---|---|
| Người ngoài chapter tạo/thao tác | mọi route | 403 `Error.DeadlineRequestAccessDenied` |
| Đã có request đang mở trên chapter | `POST /deadline-requests` | 409 `Error.OpenDeadlineRequestExists` |
| Chapter đã PUBLISHED | create | 409 `Error.DeadlineRequestNotAllowed` |
| `requestedDeadline` trong quá khứ | create/counter | 422 |
| Tự counter/agree đề xuất của chính phe mình | counter/agree | 403 `Error.NotCounterparty` |
| Chuyển trạng thái sai (finalize khi chưa AGREED...) | mọi action | 409 `Error.InvalidDeadlineRequestTransition` |
| Finalize khi affectsSlot=true | finalize | 409 (phải chờ Board resolve) |
| Withdraw bởi người không tạo | withdraw | 403 |

### API Reference

#### `POST /deadline-requests`
> Mangaka/Editor tạo yêu cầu đổi deadline → PROPOSED

**Quyền:** MANGAKA, EDITOR (Bearer)

**Body** (`CreateDeadlineRequestBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `chapterId` | string (1..∞ ký tự) ✍ | ✅ | ObjectId của Chapter |
| `requestedDeadline` | string (regex, ISO 8601) ✍ | ✅ |  |
| `reason` | string (1..1000 ký tự) ✍ | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 201** (`DeadlineRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `scheduleId` | string | ✅ |  |
| `chapterId` | string | ✅ | ObjectId của Chapter |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ | Phe khởi tạo: 'MANGAKA' \| 'EDITOR' |
| `lastProposedBy` | string | ✅ | Phe đề xuất gần nhất |
| `currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `requestedDeadline` | string | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `affectsSlot` | boolean | ✅ |  |
| `status` | enum `DeadlineRequestStatus` | ✅ | Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW |
| `boardReviewedBy` | string | ✅ |  |
| `resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.DeadlineRequestAccessDenied` | current user cannot access or mutate this deadline request |
| 404 | `Error.DeadlineRequestNotFound` | deadline request, chapter, or schedule does not exist |
| 409 | `Error.OpenDeadlineRequestExists` | an open deadline negotiation already exists for this chapter |
| 409 | `Error.DeadlineRequestNotAllowed` | deadline action is not allowed for the current chapter or request state |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "chapterId": "507f1f77bcf86cd799439011",
  "requestedDeadline": "2026-07-20T09:30:00.000Z",
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "scheduleId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "lastProposedBy": "string",
    "currentDeadline": "2026-07-20T09:30:00.000Z",
    "requestedDeadline": "2026-07-20T09:30:00.000Z",
    "reason": "Nội dung mẫu",
    "affectsSlot": false,
    "status": "PROPOSED",
    "boardReviewedBy": "string",
    "resolvedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "chapter": {
      "id": "507f1f77bcf86cd799439011",
      "chapterNumber": 1,
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /deadline-requests`
> List deadline-request theo chapter (scope theo role)
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `chapterId` | string (1..∞ ký tự) | ✅ | ObjectId của Chapter |
| `status` | enum `DeadlineRequestStatus` | — | Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW |

**Response 200** (`DeadlineRequestListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].scheduleId` | string | ✅ |  |
| `items[].chapterId` | string | ✅ | ObjectId của Chapter |
| `items[].seriesId` | string | ✅ | ObjectId của Series |
| `items[].requestedBy` | string | ✅ | Phe khởi tạo: 'MANGAKA' \| 'EDITOR' |
| `items[].lastProposedBy` | string | ✅ | Phe đề xuất gần nhất |
| `items[].currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `items[].requestedDeadline` | string | ✅ |  |
| `items[].reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `items[].affectsSlot` | boolean | ✅ |  |
| `items[].status` | enum `DeadlineRequestStatus` | ✅ | Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW |
| `items[].boardReviewedBy` | string | ✅ |  |
| `items[].resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.DeadlineRequestAccessDenied` | current user cannot access or mutate this deadline request |
| 404 | `Error.DeadlineRequestNotFound` | deadline request, chapter, or schedule does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "scheduleId": "507f1f77bcf86cd799439011",
        "chapterId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "requestedBy": "string",
        "lastProposedBy": "string",
        "currentDeadline": "2026-07-20T09:30:00.000Z",
        "requestedDeadline": "2026-07-20T09:30:00.000Z",
        "reason": "Nội dung mẫu",
        "affectsSlot": false,
        "status": "PROPOSED",
        "boardReviewedBy": "string",
        "resolvedAt": "2026-07-20T09:30:00.000Z",
        "createdAt": "2026-07-20T09:30:00.000Z",
        "series": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu"
        },
        "chapter": {
          "id": "507f1f77bcf86cd799439011",
          "chapterNumber": 1,
          "title": "Tiêu đề mẫu"
        }
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /deadline-requests/:id`
> Chi tiết 1 deadline-request (scope theo role)
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Response 200** (`DeadlineRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `scheduleId` | string | ✅ |  |
| `chapterId` | string | ✅ | ObjectId của Chapter |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ | Phe khởi tạo: 'MANGAKA' \| 'EDITOR' |
| `lastProposedBy` | string | ✅ | Phe đề xuất gần nhất |
| `currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `requestedDeadline` | string | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `affectsSlot` | boolean | ✅ |  |
| `status` | enum `DeadlineRequestStatus` | ✅ | Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW |
| `boardReviewedBy` | string | ✅ |  |
| `resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.DeadlineRequestAccessDenied` | current user cannot access or mutate this deadline request |
| 404 | `Error.DeadlineRequestNotFound` | deadline request, chapter, or schedule does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "scheduleId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "lastProposedBy": "string",
    "currentDeadline": "2026-07-20T09:30:00.000Z",
    "requestedDeadline": "2026-07-20T09:30:00.000Z",
    "reason": "Nội dung mẫu",
    "affectsSlot": false,
    "status": "PROPOSED",
    "boardReviewedBy": "string",
    "resolvedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "chapter": {
      "id": "507f1f77bcf86cd799439011",
      "chapterNumber": 1,
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /deadline-requests/:id/counter`
> Bên kia đề xuất deadline khác → COUNTER_PROPOSED

**Quyền:** MANGAKA, EDITOR (Bearer)

**Body** (`CounterDeadlineBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `requestedDeadline` | string (regex, ISO 8601) ✍ | ✅ |  |
| `reason` | string (1..1000 ký tự) ✍ | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 201** (`DeadlineRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `scheduleId` | string | ✅ |  |
| `chapterId` | string | ✅ | ObjectId của Chapter |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ | Phe khởi tạo: 'MANGAKA' \| 'EDITOR' |
| `lastProposedBy` | string | ✅ | Phe đề xuất gần nhất |
| `currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `requestedDeadline` | string | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `affectsSlot` | boolean | ✅ |  |
| `status` | enum `DeadlineRequestStatus` | ✅ | Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW |
| `boardReviewedBy` | string | ✅ |  |
| `resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.DeadlineRequestAccessDenied` | current user cannot access or mutate this deadline request |
| 403 | `Error.NotCounterparty` | only the counterparty can perform this deadline negotiation action |
| 404 | `Error.DeadlineRequestNotFound` | deadline request, chapter, or schedule does not exist |
| 409 | `Error.InvalidDeadlineRequestTransition` | deadline request state transition is not allowed |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "requestedDeadline": "2026-07-20T09:30:00.000Z",
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "scheduleId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "lastProposedBy": "string",
    "currentDeadline": "2026-07-20T09:30:00.000Z",
    "requestedDeadline": "2026-07-20T09:30:00.000Z",
    "reason": "Nội dung mẫu",
    "affectsSlot": false,
    "status": "PROPOSED",
    "boardReviewedBy": "string",
    "resolvedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "chapter": {
      "id": "507f1f77bcf86cd799439011",
      "chapterNumber": 1,
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /deadline-requests/:id/agree`
> Bên kia đồng ý → AGREED_BY_PARTIES

**Quyền:** MANGAKA, EDITOR (Bearer)

**Response 201** (`DeadlineRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `scheduleId` | string | ✅ |  |
| `chapterId` | string | ✅ | ObjectId của Chapter |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ | Phe khởi tạo: 'MANGAKA' \| 'EDITOR' |
| `lastProposedBy` | string | ✅ | Phe đề xuất gần nhất |
| `currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `requestedDeadline` | string | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `affectsSlot` | boolean | ✅ |  |
| `status` | enum `DeadlineRequestStatus` | ✅ | Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW |
| `boardReviewedBy` | string | ✅ |  |
| `resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.DeadlineRequestAccessDenied` | current user cannot access or mutate this deadline request |
| 403 | `Error.NotCounterparty` | only the counterparty can perform this deadline negotiation action |
| 404 | `Error.DeadlineRequestNotFound` | deadline request, chapter, or schedule does not exist |
| 409 | `Error.InvalidDeadlineRequestTransition` | deadline request state transition is not allowed |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "scheduleId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "lastProposedBy": "string",
    "currentDeadline": "2026-07-20T09:30:00.000Z",
    "requestedDeadline": "2026-07-20T09:30:00.000Z",
    "reason": "Nội dung mẫu",
    "affectsSlot": false,
    "status": "PROPOSED",
    "boardReviewedBy": "string",
    "resolvedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "chapter": {
      "id": "507f1f77bcf86cd799439011",
      "chapterNumber": 1,
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /deadline-requests/:id/reject`
> Bên kia từ chối → ESCALATED (leo Board, defer B5)

**Quyền:** MANGAKA, EDITOR (Bearer)

**Body** (`DeadlineReasonBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..1000 ký tự) ✍ | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 201** (`DeadlineRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `scheduleId` | string | ✅ |  |
| `chapterId` | string | ✅ | ObjectId của Chapter |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ | Phe khởi tạo: 'MANGAKA' \| 'EDITOR' |
| `lastProposedBy` | string | ✅ | Phe đề xuất gần nhất |
| `currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `requestedDeadline` | string | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `affectsSlot` | boolean | ✅ |  |
| `status` | enum `DeadlineRequestStatus` | ✅ | Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW |
| `boardReviewedBy` | string | ✅ |  |
| `resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.DeadlineRequestAccessDenied` | current user cannot access or mutate this deadline request |
| 403 | `Error.NotCounterparty` | only the counterparty can perform this deadline negotiation action |
| 404 | `Error.DeadlineRequestNotFound` | deadline request, chapter, or schedule does not exist |
| 409 | `Error.InvalidDeadlineRequestTransition` | deadline request state transition is not allowed |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "scheduleId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "lastProposedBy": "string",
    "currentDeadline": "2026-07-20T09:30:00.000Z",
    "requestedDeadline": "2026-07-20T09:30:00.000Z",
    "reason": "Nội dung mẫu",
    "affectsSlot": false,
    "status": "PROPOSED",
    "boardReviewedBy": "string",
    "resolvedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "chapter": {
      "id": "507f1f77bcf86cd799439011",
      "chapterNumber": 1,
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /deadline-requests/:id/withdraw`
> Người khởi tạo rút yêu cầu → REJECTED (terminal)

**Quyền:** MANGAKA, EDITOR (Bearer)

**Response 201** (`DeadlineRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `scheduleId` | string | ✅ |  |
| `chapterId` | string | ✅ | ObjectId của Chapter |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ | Phe khởi tạo: 'MANGAKA' \| 'EDITOR' |
| `lastProposedBy` | string | ✅ | Phe đề xuất gần nhất |
| `currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `requestedDeadline` | string | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `affectsSlot` | boolean | ✅ |  |
| `status` | enum `DeadlineRequestStatus` | ✅ | Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW |
| `boardReviewedBy` | string | ✅ |  |
| `resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.DeadlineRequestAccessDenied` | current user cannot access or mutate this deadline request |
| 404 | `Error.DeadlineRequestNotFound` | deadline request, chapter, or schedule does not exist |
| 409 | `Error.InvalidDeadlineRequestTransition` | deadline request state transition is not allowed |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "scheduleId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "lastProposedBy": "string",
    "currentDeadline": "2026-07-20T09:30:00.000Z",
    "requestedDeadline": "2026-07-20T09:30:00.000Z",
    "reason": "Nội dung mẫu",
    "affectsSlot": false,
    "status": "PROPOSED",
    "boardReviewedBy": "string",
    "resolvedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "chapter": {
      "id": "507f1f77bcf86cd799439011",
      "chapterNumber": 1,
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /deadline-requests/:id/finalize`
> Editor chốt: !affectsSlot → APPROVED (cập nhật Schedule) | affectsSlot → BOARD_REVIEW (defer B5)

**Quyền:** EDITOR (Bearer)

**Response 201** (`DeadlineRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `scheduleId` | string | ✅ |  |
| `chapterId` | string | ✅ | ObjectId của Chapter |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ | Phe khởi tạo: 'MANGAKA' \| 'EDITOR' |
| `lastProposedBy` | string | ✅ | Phe đề xuất gần nhất |
| `currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `requestedDeadline` | string | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `affectsSlot` | boolean | ✅ |  |
| `status` | enum `DeadlineRequestStatus` | ✅ | Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW |
| `boardReviewedBy` | string | ✅ |  |
| `resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.DeadlineRequestAccessDenied` | current user cannot access or mutate this deadline request |
| 404 | `Error.DeadlineRequestNotFound` | deadline request, chapter, or schedule does not exist |
| 409 | `Error.InvalidDeadlineRequestTransition` | deadline request state transition is not allowed |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "scheduleId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "lastProposedBy": "string",
    "currentDeadline": "2026-07-20T09:30:00.000Z",
    "requestedDeadline": "2026-07-20T09:30:00.000Z",
    "reason": "Nội dung mẫu",
    "affectsSlot": false,
    "status": "PROPOSED",
    "boardReviewedBy": "string",
    "resolvedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "chapter": {
      "id": "507f1f77bcf86cd799439011",
      "chapterNumber": 1,
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /deadline-requests/:id/board-resolve`
> A-DL-03: Board chốt request BOARD_REVIEW/ESCALATED → APPROVED (cập nhật Schedule) | REJECTED

**Quyền:** BOARD_MEMBER (Bearer)

**Body** (`BoardResolveBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `decision` | enum `VoteValue` | ✅ | Board quyết định: APPROVE → cập nhật Schedule; REJECT → giữ nguyên |
| `note` | string (0..1000 ký tự) ✍ | — | Ghi chú text tự do |

**Response 201** (`DeadlineRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `scheduleId` | string | ✅ |  |
| `chapterId` | string | ✅ | ObjectId của Chapter |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ | Phe khởi tạo: 'MANGAKA' \| 'EDITOR' |
| `lastProposedBy` | string | ✅ | Phe đề xuất gần nhất |
| `currentDeadline` | string | ✅ | Deadline hiệu lực hiện tại (nguồn sự thật duy nhất) |
| `requestedDeadline` | string | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `affectsSlot` | boolean | ✅ |  |
| `status` | enum `DeadlineRequestStatus` | ✅ | Deadline negotiation status: PROPOSED, COUNTER_PROPOSED, AGREED_BY_PARTIES, APPROVED, REJECTED, ESCALATED, BOARD_REVIEW |
| `boardReviewedBy` | string | ✅ |  |
| `resolvedAt` | string | ✅ | Thời điểm resolve (ISO 8601 UTC) |
| `createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.DeadlineRequestNotFound` | deadline request, chapter, or schedule does not exist |
| 409 | `Error.DeadlineNotAwaitingBoard` | deadline request is not awaiting Board decision (must be BOARD_REVIEW or ESCALATED) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "decision": "APPROVE",
  "note": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "scheduleId": "507f1f77bcf86cd799439011",
    "chapterId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "lastProposedBy": "string",
    "currentDeadline": "2026-07-20T09:30:00.000Z",
    "requestedDeadline": "2026-07-20T09:30:00.000Z",
    "reason": "Nội dung mẫu",
    "affectsSlot": false,
    "status": "PROPOSED",
    "boardReviewedBy": "string",
    "resolvedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "chapter": {
      "id": "507f1f77bcf86cd799439011",
      "chapterNumber": 1,
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

## §9. Flow 4 — Survey / Guest Voting / Ranking

**Nghiệp vụ:** mỗi kỳ phát hành, Editor/Admin **mở kỳ bình chọn** (SurveyPeriod — mở TAY theo lịch tạp chí, không auto). Độc giả (**Guest — KHÔNG cần tài khoản**) vào trang public, xác thực email OTP, chọn tối đa 3 series → 1 danh tính = 1 phiếu/kỳ (BE chỉ lưu HMAC hash, không lưu email gốc). Kỳ đóng → Editor **finalize**: gộp phiếu online (có trọng số 0–1) + phiếu offline nhập tay (postcard, trọng số 1.0) → xếp hạng + tie-break → RankingRecord + đánh dấu **at-risk** (bottom 1/3; loại trừ series <8 chương published và series HIATUS) → notify Mangaka/Editor/Board. SEVERE (≥5 kỳ liên tiếp) → feed Board xem xét hủy (Flow 5).

### Happy path — phía Guest (public, không token) — CẬP NHẬT Spec 15

0. **Khám phá & đọc truyện (Spec 15 — route public mới, rate-limit IP `PUBLIC_RL_IP_MAX`/`WINDOW`, 429 kèm `retryAfter`):**
   - `GET /public/series?q=&genre=&demographic=&publicationType=&status=&limit=&offset=` → catalog series hậu-serialize (SERIALIZED/HIATUS/COMPLETING/CANCELLING/COMPLETED/CANCELLED); filter `publicationType` = WEEKLY/MONTHLY/IRREGULAR; 🆕 **`status=` để tách tab** "Đang phát hành" (`status=SERIALIZED`, ±`HIATUS`) vs "Đã hoàn thành" (`status=COMPLETED`) vs "Đã huỷ" (`status=CANCELLED`) — chỉ nhận trạng thái công khai, giá trị khác (vd DRAFT) → **422**; omit = trả toàn bộ. Mỗi item kèm `coverImageUrl` (**signed URL TTL ngắn — đừng cache URL**), `synopsis`, `publicationType`, `magazine`, `publishedChapterCount`.
   - `GET /public/series/:id` → chi tiết + danh sách chapter **PUBLISHED** (id, chapterNumber, title, publishedAt). Series tiền-serialize/id rác → 404 `Error.PublicSeriesNotFound`.
   - `GET /public/chapters/:id/pages` → đọc chapter: `{series, chapter, pages[{pageNumber, imageUrl}], prevChapterId, nextChapterId}`; `imageUrl` ký sẵn TTL ngắn — hết hạn thì gọi lại API. Chapter chưa PUBLISHED/id rác → 404 `Error.PublicChapterNotFound`.
1. `GET /vote/context` → kỳ `OPEN` hiện tại + danh sách series được vote (chỉ field public-safe) + `maxSeriesPerVote`. Không có kỳ mở → `{period:null, series:[]}` (200).
2. `POST /vote/otp` `{identity: email, captchaToken}` → OTP gửi email (rate-limit: 3/danh tính/24h, 10/IP/24h, cooldown 60s). **Spec 15: `captchaToken` được verify THẬT server-side (Google siteverify)** khi env `RECAPTCHA_SECRET` được set — token sai/score < threshold → **403 `Error.CaptchaRejected`, KHÔNG gửi OTP**. Secret rỗng (dev) = bỏ qua verify.
3. `POST /vote` `{surveyPeriodId, identity, otpCode, seriesIds[≤3], captchaToken}` → 200. **⚠ BREAKING Spec 15: body đổi `captchaScore` → `captchaToken` (required)** — server verify và tự tính score (score thấp → phiếu vẫn nhận nhưng weight 0.5 + flag). Cookie "đã vote" chỉ là UX — chống trùng thật nằm ở server. IP quota/kỳ nay **nguyên tử** (Redis reservation — hết race vượt trần khi request song song).
4. Sau khi kỳ `REFLECTED`:
   - `GET /vote/results/latest?publicationType=` → bảng xếp hạng **kỳ REFLECTED mới nhất** `{period, results[]}` — không cần biết id kỳ; chưa có kỳ nào chốt → `{period:null, results:[]}` (200).
   - `GET /vote/periods?limit=` → danh sách kỳ REFLECTED (dropdown lịch sử).
   - `GET /vote/results?surveyPeriodId=&publicationType=` → bảng xếp hạng kỳ cụ thể (KHÔNG lộ isAtRisk/riskLevel/isReliable).
   - **Filter `publicationType` (Spec 15.2 — bảng con WEEKLY/MONTHLY):** omit = bảng tổng; truyền WEEKLY/MONTHLY/IRREGULAR → chỉ trả series đúng nhịp đó. Mỗi item nay kèm `publicationType`. ⚠ `rankPosition` GIỮ NGUYÊN vị trí trên **bảng tổng** của kỳ (1 kỳ = 1 bảng chung, đúng mô hình tạp chí) — FE muốn hiển thị "hạng 1-2-3 của bảng WEEKLY" thì tự đánh số theo index (list đã sort).

### Happy path — phía vận hành (Editor/Board/Admin)

1. `POST /survey-periods` (issueNumber + thời gian mở/đóng) → `PATCH /survey-periods/:id/status` điều khiển `OPEN`/`CLOSED`.
2. Nhập phiếu giấy: `POST /survey-data/import` (danh sách seriesId + voteCount + reflectedIssueNumber).
3. `POST /survey-periods/:id/finalize` → tính ranking (async) → kỳ `REFLECTED`; xem: `GET /survey-periods/:id/rankings|votes|survey-data`.
4. Nội bộ: `GET /rankings/board?surveyPeriodId=` (bảng tổng — Board thấy đủ risk signal) · `GET /rankings?seriesId=&periods=12` (trend chart — scope: Mangaka series mình, Editor series phụ trách).
5. Config: `GET|PATCH /voting-config` (maxSeriesPerVote, rate-limit, cooldown, ipVotesPerPeriod, captchaThreshold...).

### Unhappy cases

| Tình huống | API | Kết quả |
|---|---|---|
| `identity` không phải email hợp lệ | `POST /vote/otp` / `/vote` | 422 |
| Thiếu `captchaToken` (breaking Spec 15) | `POST /vote/otp` / `/vote` | 422 |
| Captcha token sai / score < threshold (khi `RECAPTCHA_SECRET` set) | `POST /vote/otp` / `/vote` | 403 `Error.CaptchaRejected` |
| IP vượt trần request route public đọc | `GET /public/*`, `/vote/results/latest`, `/vote/periods` | 429 `code: PUBLIC_RATE_LIMITED` + `retryAfter` |
| Series ngoài public set / id rác | `GET /public/series/:id` | 404 `Error.PublicSeriesNotFound` |
| Chapter chưa PUBLISHED / id rác | `GET /public/chapters/:id/pages` | 404 `Error.PublicChapterNotFound` |
| Xin OTP lại trong 60s / vượt quota | `POST /vote/otp` | 429 `code: VOTE_OTP_RATE_LIMITED` + `retryAfter` |
| OTP sai / hết hạn (5') | `POST /vote` | 422 / 410 |
| Danh tính đã vote kỳ này | `POST /vote` | 409 (unique identity+period) |
| Cùng IP vote quá `ipVotesPerPeriod` | `POST /vote` | 429 — **check TRƯỚC verify OTP, không đốt OTP oan** |
| `seriesIds` trùng nhau trong 1 phiếu | `POST /vote` | 422 `Error.DuplicateSeriesInVote` |
| Series không tồn tại / không SERIALIZED / id rác | `POST /vote` | 422 `Error.SeriesNotVotable` |
| Chọn quá `maxSeriesPerVote` | `POST /vote` | 422 |
| Xem kết quả khi kỳ chưa REFLECTED | `GET /vote/results` | 409 `Error.SurveyPeriodNotFinalized` |
| Kỳ không tồn tại | results / finalize | 404 `Error.SurveyPeriodNotFound` |
| Finalize kỳ chưa CLOSED / finalize lại | finalize | 409 |
| captchaScore < threshold | `POST /vote` | phiếu vẫn nhận nhưng `isFlagged=true`, `voteWeight=0.5` (gian lận xác định → 0) |
| Kỳ quá ít phiếu (< ngưỡng AppConfig) | (finalize) | RankingRecord `isReliable=false`, KHÔNG kích hoạt cảnh báo at-risk |

### API Reference

#### `POST /survey-periods`
> Editor tạo kỳ bình chọn mới → DRAFT/OPEN/CLOSED

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Body** (`CreateSurveyPeriodBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `issueNumber` | integer (≥ 0) ✍ | — | Số kỳ phát hành áp dụng |
| `reflectedIssueNumber` | integer (≥ 0) ✍ | — | Số kỳ mà kết quả vote thực sự phản ánh (độ trễ nghiệp vụ báo giấy) |
| `startDate` | string (regex, ISO 8601) ✍ | ✅ |  |
| `endDate` | string (regex, ISO 8601) ✍ | ✅ |  |
| `status` | enum `SurveyStatus` | — | Vòng đời kỳ bình chọn: DRAFT → OPEN (đang nhận phiếu) → CLOSED → REFLECTED (đã chốt ranking, công khai được) |

**Response 201** (`SurveyPeriodRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `issueNumber` | integer | — | Số kỳ phát hành áp dụng |
| `reflectedIssueNumber` | integer | — | Số kỳ mà kết quả vote thực sự phản ánh (độ trễ nghiệp vụ báo giấy) |
| `startDate` | string (regex, ISO 8601) | ✅ |  |
| `endDate` | string (regex, ISO 8601) | ✅ |  |
| `status` | enum `SurveyStatus` | ✅ | Vòng đời kỳ bình chọn: DRAFT → OPEN (đang nhận phiếu) → CLOSED → REFLECTED (đã chốt ranking, công khai được) |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "issueNumber": 1,
  "reflectedIssueNumber": 1,
  "startDate": "2026-07-20T09:30:00.000Z",
  "endDate": "2026-07-20T09:30:00.000Z",
  "status": "DRAFT"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "issueNumber": 1,
    "reflectedIssueNumber": 1,
    "startDate": "2026-07-20T09:30:00.000Z",
    "endDate": "2026-07-20T09:30:00.000Z",
    "status": "DRAFT"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /survey-periods`
> Danh sách kỳ bình chọn

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Response 200** :

_(xem envelope §0 — data có thể null)_

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "issueNumber": 1,
      "reflectedIssueNumber": 1,
      "startDate": "2026-07-20T09:30:00.000Z",
      "endDate": "2026-07-20T09:30:00.000Z",
      "status": "DRAFT"
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `GET /survey-periods/:id`
> Chi tiết kỳ bình chọn

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Response 200** (`SurveyPeriodRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `issueNumber` | integer | — | Số kỳ phát hành áp dụng |
| `reflectedIssueNumber` | integer | — | Số kỳ mà kết quả vote thực sự phản ánh (độ trễ nghiệp vụ báo giấy) |
| `startDate` | string (regex, ISO 8601) | ✅ |  |
| `endDate` | string (regex, ISO 8601) | ✅ |  |
| `status` | enum `SurveyStatus` | ✅ | Vòng đời kỳ bình chọn: DRAFT → OPEN (đang nhận phiếu) → CLOSED → REFLECTED (đã chốt ranking, công khai được) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "issueNumber": 1,
    "reflectedIssueNumber": 1,
    "startDate": "2026-07-20T09:30:00.000Z",
    "endDate": "2026-07-20T09:30:00.000Z",
    "status": "DRAFT"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /survey-periods/:id/status`
> Editor cập nhật trạng thái kỳ bình chọn → OPEN/CLOSED/REFLECTED

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Body** (`UpdateSurveyPeriodStatusBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `status` | enum `SurveyStatus` | ✅ | Vòng đời kỳ bình chọn: DRAFT → OPEN (đang nhận phiếu) → CLOSED → REFLECTED (đã chốt ranking, công khai được) |

**Response 200** (`SurveyPeriodRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `issueNumber` | integer | — | Số kỳ phát hành áp dụng |
| `reflectedIssueNumber` | integer | — | Số kỳ mà kết quả vote thực sự phản ánh (độ trễ nghiệp vụ báo giấy) |
| `startDate` | string (regex, ISO 8601) | ✅ |  |
| `endDate` | string (regex, ISO 8601) | ✅ |  |
| `status` | enum `SurveyStatus` | ✅ | Vòng đời kỳ bình chọn: DRAFT → OPEN (đang nhận phiếu) → CLOSED → REFLECTED (đã chốt ranking, công khai được) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.SurveyPeriodNotFound` |  |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "status": "DRAFT"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "issueNumber": 1,
    "reflectedIssueNumber": 1,
    "startDate": "2026-07-20T09:30:00.000Z",
    "endDate": "2026-07-20T09:30:00.000Z",
    "status": "DRAFT"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /vote/context`
> Public — kỳ bình chọn OPEN hiện tại + danh sách series SERIALIZED cho trang vote Guest

**Quyền:** **PUBLIC** (không cần token)

**Response 200** (`VoteContextRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `period` | object | ✅ | null = hiện không có kỳ bình chọn OPEN |
| `period.id` | string | ✅ | ObjectId của bản ghi |
| `period.issueNumber` | integer | ✅ | Số kỳ phát hành áp dụng |
| `period.reflectedIssueNumber` | integer | ✅ | Số kỳ mà kết quả vote thực sự phản ánh (độ trễ nghiệp vụ báo giấy) |
| `period.startDate` | string | ✅ | ISO 8601 UTC |
| `period.endDate` | string | ✅ | ISO 8601 UTC |
| `series` | object[] | ✅ |  |
| `series[].id` | string | ✅ | ObjectId của bản ghi |
| `series[].title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `series[].coverImage` | string | ✅ | Object key R2 — Guest chưa xem được ảnh (public sign chưa có) |
| `series[].genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `series[].demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `maxSeriesPerVote` | integer | ✅ |  |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "period": {
      "id": "507f1f77bcf86cd799439011",
      "issueNumber": 1,
      "reflectedIssueNumber": 1,
      "startDate": "2026-07-20T09:30:00.000Z",
      "endDate": "2026-07-20T09:30:00.000Z"
    },
    "series": [
      {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu",
        "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
        "genres": [
          "ACTION"
        ],
        "demographic": "SHONEN"
      }
    ],
    "maxSeriesPerVote": 0
  }
}
```

<!-- payload-example:end -->

---

#### `POST /vote/otp`
> Reader yêu cầu OTP cho Guest Voting. Public.

**Quyền:** **PUBLIC** (không cần token)

**Body** (`VoteOtpRequestBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `identity` | string (regex) ✍ | ✅ | Email nhận OTP - hệ chạy EMAIL mode (Requiment 1.15d); SMS là mở rộng tương lai |
| `captchaToken` | string (1..∞ ký tự) ✍ | ✅ |  |

**Response 200** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 429 | `Error.VoteOtpRateLimit` |  |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "identity": "user@example.com",
  "captchaToken": "string"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /vote`
> Reader xác thực OTP và gửi vote. Public.

**Quyền:** **PUBLIC** (không cần token)

**Body** (`ReaderVoteBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `surveyPeriodId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `identity` | string (regex) ✍ | ✅ | Email đã nhận OTP |
| `otpCode` | string (4..∞ ký tự) ✍ | ✅ |  |
| `seriesIds` | string[] ✍ | ✅ |  |
| `captchaScore` | number (≥ 0, ≤ 1) ✍ | — |  |

**Response 200** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | `Error.SurveyPeriodNotOpen` |  |
| 400 | `Error.VoteOtpNotFound` |  |
| 404 | `Error.SurveyPeriodNotFound` |  |
| 409 | `Error.ReaderAlreadyVoted` |  |
| 422 | `Error.TooManySeriesSelected` | số series vượt maxSeriesPerVote (VotingConfig); trần cứng 3 theo Requiment §1.15 |
| 422 | `Error.DuplicateSeriesInVote` | seriesIds chứa id trùng nhau trong cùng một phiếu (PB-03) |
| 422 | `Error.SeriesNotVotable` | seriesIds chứa id rác/không tồn tại hoặc series không ở trạng thái SERIALIZED (PB-03) |
| 429 | `Error.VoteIpLimitExceeded` | IP này đã đạt trần số phiếu cho kỳ bình chọn (VotingConfig.ipVotesPerPeriod); chặn trước khi đốt OTP |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "surveyPeriodId": "507f1f77bcf86cd799439011",
  "identity": "user@example.com",
  "otpCode": "string",
  "seriesIds": [
    "507f1f77bcf86cd799439011"
  ],
  "captchaToken": "string"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /vote/results`
> Public — bảng xếp hạng của kỳ đã chốt (REFLECTED); ẩn tín hiệu biên tập nội bộ

**Quyền:** **PUBLIC** (không cần token)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `surveyPeriodId` | string (1..∞ ký tự) | ✅ |  |

**Response 200** (`VoteResultsRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `surveyPeriodId` | string | ✅ |  |
| `issueNumber` | integer | ✅ | Số kỳ phát hành áp dụng |
| `results` | object[] | ✅ |  |
| `results[].rankPosition` | integer | ✅ | Vị trí xếp hạng (1 = cao nhất) |
| `results[].seriesId` | string | ✅ | ObjectId của Series |
| `results[].seriesTitle` | string | ✅ | null nếu series đã bị xóa |
| `results[].voteCount` | number | ✅ | Tổng trọng số phiếu (online weighted + offline 1.0) |
| `results[].rankChange` | integer | ✅ | Thay đổi hạng so kỳ trước (+lên/-xuống) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.SurveyPeriodNotFound` |  |
| 409 | `Error.SurveyPeriodNotFinalized` | Kỳ bình chọn chưa REFLECTED (chưa finalize) — kết quả public chỉ xem được sau khi chốt |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "surveyPeriodId": "507f1f77bcf86cd799439011",
    "issueNumber": 1,
    "results": [
      {
        "rankPosition": 1,
        "seriesId": "507f1f77bcf86cd799439011",
        "seriesTitle": "Tiêu đề mẫu",
        "publicationType": "WEEKLY",
        "voteCount": 1,
        "rankChange": 1
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `POST /survey-data/import`
> Editor nhập vote offline từ postcard

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Body** (`ImportSurveyDataBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `surveyPeriodId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `issueNumber` | integer (≥ 0) ✍ | — | Số kỳ phát hành áp dụng |
| `reflectedIssueNumber` | integer (≥ 0) ✍ | — | Số kỳ mà kết quả vote thực sự phản ánh (độ trễ nghiệp vụ báo giấy) |
| `surveyDate` | string (regex, ISO 8601) ✍ | — |  |
| `entries` | object[] | ✅ |  |
| `entries[].seriesId` | string (1..∞ ký tự) | ✅ | ObjectId của Series |
| `entries[].voteCount` | integer (≥ 0) | ✅ | Tổng trọng số phiếu (online weighted + offline 1.0) |

**Response 201** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | `Error.SurveyDataImportNotAllowed` |  |
| 404 | `Error.SurveyPeriodNotFound` |  |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "surveyPeriodId": "507f1f77bcf86cd799439011",
  "issueNumber": 1,
  "reflectedIssueNumber": 1,
  "surveyDate": "2026-07-20T09:30:00.000Z",
  "entries": [
    {
      "seriesId": "507f1f77bcf86cd799439011",
      "voteCount": 1
    }
  ]
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /survey-periods/:id/finalize`
> Editor finalize ranking cho kỳ bình chọn

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Response 200** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | `Error.SurveyPeriodAlreadyFinalized` |  |
| 400 | `Error.SurveyDataImportNotAllowed` |  |
| 404 | `Error.SurveyPeriodNotFound` |  |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /survey-periods/:id/votes`
> Danh sách phiếu vote của kỳ bình chọn

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Response 200** :

_(xem envelope §0 — data có thể null)_

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "surveyPeriodId": "507f1f77bcf86cd799439011",
      "seriesIds": [
        "507f1f77bcf86cd799439011"
      ],
      "identityHash": "string",
      "authMethod": "EMAIL_OTP",
      "ipHash": "string",
      "captchaScore": 0,
      "voteWeight": 0,
      "isFlagged": false,
      "votedAt": "2026-07-20T09:30:00.000Z"
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `GET /survey-periods/:id/survey-data`
> Danh sách dữ liệu vote offline của kỳ bình chọn

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Response 200** :

_(xem envelope §0 — data có thể null)_

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "surveyPeriodId": "507f1f77bcf86cd799439011",
      "importedBy": "string",
      "surveyDate": "2026-07-20T09:30:00.000Z",
      "importedAt": "2026-07-20T09:30:00.000Z",
      "entries": [
        {
          "seriesId": "507f1f77bcf86cd799439011",
          "voteCount": 1
        }
      ]
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `GET /survey-periods/:id/rankings`
> Danh sách ranking của kỳ bình chọn

**Quyền:** EDITOR, SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Response 200** (`RankingRecordListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].seriesId` | string | ✅ | ObjectId của Series |
| `items[].rankPosition` | integer | — | Vị trí xếp hạng (1 = cao nhất) |
| `items[].voteCount` | number | ✅ | Tổng trọng số phiếu (online weighted + offline 1.0) |
| `items[].previousRank` | integer | ✅ | Hạng kỳ trước (null = kỳ đầu) |
| `items[].rankChange` | integer | ✅ | Thay đổi hạng so kỳ trước (+lên/-xuống) |
| `items[].isAtRisk` | boolean | ✅ | true = thuộc bottom 1/3 kỳ này (tín hiệu nội bộ) |
| `items[].riskLevel` | enum `RiskLevel` | ✅ | Mức nguy cơ của series theo kết quả ranking kỳ: NONE bình thường, LOW at-risk kỳ này, MEDIUM 3+ kỳ liên tiếp, SEVERE 5+ kỳ liên tiếp (feed Board) |
| `items[].consecutiveAtRiskCount` | integer | ✅ | Số kỳ liên tiếp nằm bottom 1/3 |
| `items[].isReliable` | boolean | ✅ | false = dữ liệu kỳ không đủ tin cậy (quá ít phiếu / chapter bị hold lâu) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "seriesId": "507f1f77bcf86cd799439011",
        "rankPosition": 1,
        "voteCount": 1,
        "previousRank": 1,
        "rankChange": 1,
        "isAtRisk": false,
        "riskLevel": "NONE",
        "consecutiveAtRiskCount": 1,
        "isReliable": false
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /rankings`
> PB-04: trend xếp hạng 1 series (scoped theo owner)

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `seriesId` | string (1..∞ ký tự) | ✅ | ObjectId của Series |
| `periods` | integer (≥ 1, ≤ 60) | — |  (default: `12`) |

**Response 200** (`BoardRankingListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].seriesId` | string | ✅ | ObjectId của Series |
| `items[].rankPosition` | integer | — | Vị trí xếp hạng (1 = cao nhất) |
| `items[].voteCount` | number | ✅ | Tổng trọng số phiếu (online weighted + offline 1.0) |
| `items[].previousRank` | integer | ✅ | Hạng kỳ trước (null = kỳ đầu) |
| `items[].rankChange` | integer | ✅ | Thay đổi hạng so kỳ trước (+lên/-xuống) |
| `items[].isAtRisk` | boolean | ✅ | true = thuộc bottom 1/3 kỳ này (tín hiệu nội bộ) |
| `items[].riskLevel` | enum `RiskLevel` | ✅ | Mức nguy cơ của series theo kết quả ranking kỳ: NONE bình thường, LOW at-risk kỳ này, MEDIUM 3+ kỳ liên tiếp, SEVERE 5+ kỳ liên tiếp (feed Board) |
| `items[].isReliable` | boolean | ✅ | false = dữ liệu kỳ không đủ tin cậy (quá ít phiếu / chapter bị hold lâu) |
| `items[].recordedAt` | string | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.RankingAccessDenied` | MANGAKA chỉ xem được series mình sở hữu; EDITOR chỉ xem được series mình phụ trách; BOARD/SUPER_ADMIN xem mọi series |
| 404 | `Error.SeriesNotFound` | series does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "seriesId": "507f1f77bcf86cd799439011",
        "rankPosition": 1,
        "voteCount": 1,
        "previousRank": 1,
        "rankChange": 1,
        "isAtRisk": false,
        "riskLevel": "NONE",
        "isReliable": false,
        "recordedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /rankings/board`
> PB-04: bảng xếp hạng toàn tạp chí 1 kỳ (full, mọi role nội bộ)

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `surveyPeriodId` | string | ✅ |  |

**Response 200** (`BoardRankingListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].seriesId` | string | ✅ | ObjectId của Series |
| `items[].rankPosition` | integer | — | Vị trí xếp hạng (1 = cao nhất) |
| `items[].voteCount` | number | ✅ | Tổng trọng số phiếu (online weighted + offline 1.0) |
| `items[].previousRank` | integer | ✅ | Hạng kỳ trước (null = kỳ đầu) |
| `items[].rankChange` | integer | ✅ | Thay đổi hạng so kỳ trước (+lên/-xuống) |
| `items[].isAtRisk` | boolean | ✅ | true = thuộc bottom 1/3 kỳ này (tín hiệu nội bộ) |
| `items[].riskLevel` | enum `RiskLevel` | ✅ | Mức nguy cơ của series theo kết quả ranking kỳ: NONE bình thường, LOW at-risk kỳ này, MEDIUM 3+ kỳ liên tiếp, SEVERE 5+ kỳ liên tiếp (feed Board) |
| `items[].isReliable` | boolean | ✅ | false = dữ liệu kỳ không đủ tin cậy (quá ít phiếu / chapter bị hold lâu) |
| `items[].recordedAt` | string | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.SurveyPeriodNotFound` |  |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "seriesId": "507f1f77bcf86cd799439011",
        "rankPosition": 1,
        "voteCount": 1,
        "previousRank": 1,
        "rankChange": 1,
        "isAtRisk": false,
        "riskLevel": "NONE",
        "isReliable": false,
        "recordedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /voting-config`
> Xem cấu hình bình chọn hiện tại

**Quyền:** SUPER_ADMIN (Bearer)

**Response 200** (`VotingConfigRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `authMode` | enum `VotingAuthMode` | ✅ |  |
| `maxSeriesPerVote` | integer | ✅ |  |
| `otpExpirySeconds` | integer | ✅ |  |
| `otpMaxAttempts` | integer | ✅ |  |
| `ipRateLimit` | integer | ✅ |  |
| `phoneRateLimit` | integer | ✅ |  |
| `otpCooldownSeconds` | integer | ✅ |  |
| `ipVotesPerPeriod` | integer | ✅ |  |
| `captchaThreshold` | number | ✅ |  |
| `updatedAt` | string (regex, ISO 8601) | ✅ | Thời điểm cập nhật gần nhất (ISO 8601 UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "authMode": "OTP",
    "maxSeriesPerVote": 0,
    "otpExpirySeconds": 0,
    "otpMaxAttempts": 0,
    "ipRateLimit": 1,
    "phoneRateLimit": 1,
    "otpCooldownSeconds": 0,
    "ipVotesPerPeriod": 0,
    "captchaThreshold": 0,
    "updatedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /voting-config`
> Super Admin cập nhật cấu hình bình chọn

**Quyền:** SUPER_ADMIN (Bearer)

**Body** (`VotingConfigBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `authMode` | enum `VotingAuthMode` | — |  |
| `maxSeriesPerVote` | integer (≥ 1) ✍ | — |  |
| `otpExpirySeconds` | integer (≥ 60) ✍ | — |  |
| `otpMaxAttempts` | integer (≥ 1) ✍ | — |  |
| `ipRateLimit` | integer (≥ 1) ✍ | — |  |
| `phoneRateLimit` | integer (≥ 1) ✍ | — |  |
| `otpCooldownSeconds` | integer (≥ 0) ✍ | — |  |
| `ipVotesPerPeriod` | integer (≥ 1) ✍ | — |  |
| `captchaThreshold` | number (≥ 0, ≤ 1) ✍ | — |  |

**Response 200** (`VotingConfigRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `authMode` | enum `VotingAuthMode` | ✅ |  |
| `maxSeriesPerVote` | integer | ✅ |  |
| `otpExpirySeconds` | integer | ✅ |  |
| `otpMaxAttempts` | integer | ✅ |  |
| `ipRateLimit` | integer | ✅ |  |
| `phoneRateLimit` | integer | ✅ |  |
| `otpCooldownSeconds` | integer | ✅ |  |
| `ipVotesPerPeriod` | integer | ✅ |  |
| `captchaThreshold` | number | ✅ |  |
| `updatedAt` | string (regex, ISO 8601) | ✅ | Thời điểm cập nhật gần nhất (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.VotingConfigNotFound` |  |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "authMode": "OTP",
  "maxSeriesPerVote": 1,
  "otpExpirySeconds": 60,
  "otpMaxAttempts": 1,
  "ipRateLimit": 1,
  "phoneRateLimit": 1,
  "otpCooldownSeconds": 1,
  "ipVotesPerPeriod": 1,
  "captchaThreshold": 1
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "authMode": "OTP",
    "maxSeriesPerVote": 0,
    "otpExpirySeconds": 0,
    "otpMaxAttempts": 0,
    "ipRateLimit": 1,
    "phoneRateLimit": 1,
    "otpCooldownSeconds": 0,
    "ipVotesPerPeriod": 0,
    "captchaThreshold": 0,
    "updatedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

## §10. Flow 5 — Series Lifecycle (hiatus / complete / cancel / đổi format)

**Nghiệp vụ:** series đang chạy có 4 ngã rẽ, đều quyết bởi **BoardDecision** (engine §3) trừ hiatus:
- **HIATUS** (Editor ghi nhận Mangaka nghỉ — không cần Board): dừng at-risk + dừng đồng hồ TIME_BOUND.
- **CONTINUE / CHANGE_FORMAT / COMPLETE / CANCEL**: Editor mở decision (type tương ứng) → Board vote → hệ thống **tự áp kết quả lên Series** (đổi publicationType; sang COMPLETING; sang CANCELLING + cấp `endingChapterAllowance`...). CHANGE_FORMAT/COMPLETION còn auto-sinh **Amendment DRAFT** (Flow 6) nhắc Editor cập nhật hợp đồng. CANCEL → tất toán hợp đồng (mốc đã đạt vẫn trả + compensation).
- Series `CANCELLING` được vẽ nốt đúng số chương Board cấp (Immediate Axe 1–2, thường 3–5) rồi Editor **chốt ending**; `COMPLETING` không giới hạn chương cuối.
- **Dashboard bảo vệ series:** Editor gom ranking trend + doanh số tankobon + report để cãi trước Board.

### Happy path

1. **Hiatus:** Editor `POST /series/:id/hiatus` `{reason}` → `HIATUS` (TIME_BOUND `DISABLED`); quay lại: `POST /series/:id/resume` → `SERIALIZED` (deadline TIME_BOUND dời đúng thời gian nghỉ). HIATUS quá lâu (> `hiatusTooLongDays`) → cron notify Editor + Board bàn tương lai.
2. **Kết thúc tự nhiên:** Mangaka/Editor `POST /series/:id/propose-completion` `{reason}` → notify Editor mở decision `COMPLETION` → Board APPROVE → `COMPLETING` → ra chương cuối → Editor `POST /series/:id/finalize-ending` → `COMPLETED` (hợp đồng `FULFILLED`).
3. **Hủy:** ranking SEVERE feed Board → decision `CANCELLATION` (kèm `endingChapterAllowance`) → APPROVE → `CANCELLING` (hợp đồng `TERMINATED` ngay; publish chương kết thúc được **bypass** contract-gate) → hết chương ending → Editor `finalize-ending` → `CANCELLED`.
4. **Mangaka không vẽ nổi ending:** Editor `POST /series/:id/force-cancel` → lấy chương cuối hiện có làm điểm dừng → `CANCELLED` (statusReason "no ending").
5. **Đổi format:** decision `FORMAT_CHANGE` APPROVED → Series đổi `publicationType` — **KHÔNG hồi tố deadline** chương đang làm; Editor được notify tự đặt deadline chương kế (§5 bước 2) + Amendment DRAFT sinh sẵn.
6. **Dữ liệu bảo vệ:** `POST /tankobon-sales` (Editor/Board nhập doanh số volume) · `GET /series/:id/defense-dashboard` (Editor phụ trách/Board — gộp ranking trend + tankobon + report + tuổi series).

### Unhappy cases

| Tình huống | API | Kết quả |
|---|---|---|
| Hiatus khi series không SERIALIZED / resume khi không HIATUS | hiatus/resume | 409 `Error.InvalidSeriesTransition` |
| Editor không phụ trách series gọi lifecycle | mọi route | 403 `Error.NotAssignedEditor` |
| propose-completion bởi người ngoài series | propose-completion | 403 |
| finalize-ending khi series không ở CANCELLING/COMPLETING | finalize-ending | 409 |
| force-cancel khi series không CANCELLING | force-cancel | 409 |
| Tạo chapter vượt allowance khi CANCELLING | `POST /chapters` (§5) | 409 `Error.EndingAllowanceExceeded` |
| Mangaka xem defense-dashboard | defense-dashboard | 403 (chỉ Editor phụ trách + Board) |
| unitsSold âm / thiếu field | tankobon-sales | 422 |
| Board decision EXPIRED (phiên bế mạc không đủ quorum) | (engine) | series GIỮ NGUYÊN trạng thái — mở phiên mới |

### API Reference

#### `POST /series/:id/hiatus`
> Editor cho series tạm ngưng (SERIALIZED→HIATUS). Dừng đồng hồ TIME_BOUND.

**Quyền:** EDITOR (Bearer)

**Body** (`HiatusBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..1000 ký tự) ✍ | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `expectedReturnDate` | string (regex, ISO 8601) ✍ | — |  |

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.InvalidSeriesTransition` | series state transition is not allowed |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu",
  "expectedReturnDate": "2026-07-20T09:30:00.000Z"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/resume`
> Editor cho series hoạt động lại (HIATUS→SERIALIZED). Dời deadline TIME_BOUND theo thời gian hiatus.

**Quyền:** EDITOR (Bearer)

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.InvalidSeriesTransition` | series state transition is not allowed |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/propose-completion`
> Đề xuất kết thúc series tự nhiên (Mangaka/Editor) — PB-06

**Quyền:** MANGAKA, EDITOR (Bearer)

**Body** (`ProposeCompletionBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reason` | string (1..1000 ký tự) ✍ | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `proposedEndingChapters` | integer ✍ | — |  |

**Response 200** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | current user cannot access this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.SeriesNotProposableForCompletion` |  |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reason": "Nội dung mẫu",
  "proposedEndingChapters": 0
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/finalize-ending`
> Editor chốt kết thúc: CANCELLING→CANCELLED / COMPLETING→COMPLETED.

**Quyền:** EDITOR (Bearer)

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.SeriesNotInEndingState` | Series không ở trạng thái CANCELLING/COMPLETING nên không thể chốt kết thúc. |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:id/force-cancel`
> Editor đóng series CANCELLING không ending (Req 1.11c) — PB-06

**Quyền:** EDITOR (Bearer)

**Response 200** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotAssignedEditor` | current editor is not assigned to this series |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.SeriesNotInCancellingState` |  |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /tankobon-sales`
> Nhập doanh số tankobon cho series (Editor/Board) — PB-08

**Quyền:** EDITOR, BOARD_MEMBER (Bearer)

**Body** (`CreateTankobonSalesBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `seriesId` | string ✍ | ✅ | Series ObjectId |
| `volumeNumber` | integer (≥ 0) ✍ | ✅ | Số volume tankobon |
| `unitsSold` | integer (≥ 0) ✍ | ✅ | Số bản bán ra |
| `period` | string (1..∞ ký tự) ✍ | ✅ | Free-text period label, e.g. "2026-Q2" |

**Response 201** (`TankobonSalesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `volumeNumber` | integer | ✅ | Số volume tankobon |
| `unitsSold` | integer | ✅ | Số bản bán ra |
| `period` | string | ✅ | Kỳ (chuỗi tự do, vd 2026-Q1) |
| `recordedBy` | string | ✅ |  |
| `createdAt` | string | ✅ | ISO 8601 UTC |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.SeriesNotFound` | series does not exist |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "seriesId": "507f1f77bcf86cd799439011",
  "volumeNumber": 1,
  "unitsSold": 1,
  "period": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "volumeNumber": 1,
    "unitsSold": 0,
    "period": "string",
    "recordedBy": "string",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /series/:id/defense-dashboard`
> Dashboard bảo vệ series: ranking trend + tankobon + reports (Editor phụ trách/Board) — PB-08

**Quyền:** EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Response 200** (`DefenseDashboardRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `seriesId` | string | ✅ | ObjectId của Series |
| `rankingTrend` | object[] | ✅ |  |
| `rankingTrend[].surveyPeriodId` | string | ✅ |  |
| `rankingTrend[].rankPosition` | integer | ✅ | Vị trí xếp hạng (1 = cao nhất) |
| `rankingTrend[].voteCount` | number | ✅ | Tổng trọng số phiếu (online weighted + offline 1.0) |
| `rankingTrend[].previousRank` | integer | ✅ | Hạng kỳ trước (null = kỳ đầu) |
| `rankingTrend[].rankChange` | integer | ✅ | Thay đổi hạng so kỳ trước (+lên/-xuống) |
| `rankingTrend[].isAtRisk` | boolean | ✅ | true = thuộc bottom 1/3 kỳ này (tín hiệu nội bộ) |
| `rankingTrend[].riskLevel` | string | ✅ |  |
| `rankingTrend[].recordedAt` | string | ✅ |  |
| `tankobon` | object | ✅ |  |
| `tankobon.totalUnitsSold` | integer | ✅ |  |
| `tankobon.volumes` | object[] | ✅ |  |
| `seriesReports` | object[] | ✅ |  |
| `seriesReports[].id` | string | ✅ | ObjectId của bản ghi |
| `seriesReports[].reportType` | string | ✅ |  |
| `seriesReports[].content` | string | ✅ | Nội dung text |
| `seriesReports[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |
| `serialization` | object | ✅ |  |
| `serialization.serializedSince` | string | ✅ | ISO of SERIALIZED transition, null if never |
| `serialization.chaptersPublished` | integer | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.DefenseDashboardAccessDenied` |  |
| 404 | `Error.SeriesNotFound` | series does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "seriesId": "507f1f77bcf86cd799439011",
    "rankingTrend": [
      {
        "surveyPeriodId": "507f1f77bcf86cd799439011",
        "rankPosition": 1,
        "voteCount": 1,
        "previousRank": 1,
        "rankChange": 1,
        "isAtRisk": false,
        "riskLevel": "string",
        "recordedAt": "2026-07-20T09:30:00.000Z"
      }
    ],
    "tankobon": {
      "totalUnitsSold": 1,
      "volumes": [
        {
          "volumeNumber": 1,
          "unitsSold": 0,
          "period": "string"
        }
      ]
    },
    "seriesReports": [
      {
        "id": "507f1f77bcf86cd799439011",
        "reportType": "string",
        "content": "Nội dung mẫu",
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    ],
    "serialization": {
      "serializedSince": "string",
      "chaptersPublished": 0
    }
  }
}
```

<!-- payload-example:end -->

---

## §11. Flow 7 — Reprint (tái bản)

**Nghiệp vụ:** Board/Editor muốn in lại series (hot-nhưng-cũ, kỷ niệm, tie-in) → tạo ReprintRequest (`AS_IS` in nguyên bản / `WITH_REVISION` sửa art). Nhánh rẽ theo **Ownership Principle**: HĐ gốc `FULL_BUYOUT` → Board tự duyệt (KHÔNG cần hỏi Mangaka; Mangaka gốc không hợp tác sửa → gán reviser khác); `REVENUE_SHARE` → **Mangaka phải đồng ý trước**. Tái bản **bỏ qua proposal/Name** — vào thẳng sản xuất từng ReprintChapter → Editor check → đủ hết → PUBLISHED (doanh thu REVENUE_SHARE chia qua route revenue Flow 6).

### Happy path

1. **Editor/Board** `POST /reprint-requests` (seriesId + revisionMode + reason + chapterRange) → `PENDING`.
2. HĐ gốc REVENUE_SHARE → **Mangaka** `PATCH /reprint-requests/:id/mangaka-review` (accept → `MANGAKA_APPROVED` / reject → `REJECTED_BY_MANGAKA`). FULL_BUYOUT → bỏ qua bước này.
3. **Board** `PATCH /reprint-requests/:id/board-approve` → vào sản xuất; hệ thống sinh ReprintChapter theo range.
4. `WITH_REVISION`: sửa manuscript từng chương `PATCH /reprint-requests/:id/chapters/:chapterId/manuscript` (object key bản sửa). Mangaka gốc không hợp tác (chỉ FULL_BUYOUT): `PATCH .../assign-reviser` `{reviserId, reviserType}`.
5. **Editor** duyệt từng chương: `PATCH .../chapters/:chapterId/approve` → chương cuối cùng APPROVED → request tự `PUBLISHED`.
6. Theo dõi: `GET /reprint-requests` (scope: Editor/Board đầy đủ; Mangaka thấy của series mình) + `GET .../chapters`.

### Unhappy cases

| Tình huống | API | Kết quả |
|---|---|---|
| Mangaka KHÁC review reprint không thuộc series mình | mangaka-review | 403 (ownership guard) |
| mangaka-review trên request FULL_BUYOUT | mangaka-review | 409 (không cần Mangaka — Ownership Principle) |
| Board approve khi REVENUE_SHARE chưa được Mangaka accept | board-approve | 409 `Error.InvalidReprintTransition` |
| assign-reviser khi không phải FULL_BUYOUT + WITH_REVISION | assign-reviser | 409 |
| reviserType=OTHER_MANGAKA nhưng reviserId không phải MANGAKA | assign-reviser | 422 |
| Sửa manuscript chương AS_IS | chapters/manuscript | 409 |
| Approve chương sai trạng thái | chapters/approve | 409 |
| id rác | mọi route `:id` | 404 |

### API Reference

#### `POST /reprint-requests`
> Editor tạo yêu cầu tái bản (B-RPT-01)

**Quyền:** EDITOR (Bearer)

**Body** (`CreateReprintRequestBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `seriesId` | string (1..∞ ký tự) ✍ | ✅ | ObjectId của Series |
| `revisionMode` | enum `ReprintRevisionMode` | ✅ |  |
| `reason` | string (1..∞ ký tự) ✍ | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `chapterRangeStart` | integer (≥ 0) ✍ | ✅ |  |
| `chapterRangeEnd` | integer (≥ 0) ✍ | ✅ |  |

**Response 201** (`ReprintRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ |  |
| `revisionMode` | enum `ReprintRevisionMode` | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `chapterRangeStart` | integer | ✅ |  |
| `chapterRangeEnd` | integer | ✅ |  |
| `status` | string | ✅ |  |
| `mangakaApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `publishedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `chapters` | object[] | ✅ |  |
| `chapters[].originalChapterId` | string | ✅ |  |
| `chapters[].manuscriptFile` | string | ✅ |  |
| `chapters[].status` | enum `ReprintChapterStatus` | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ActiveContractNotFound` | series has no FULLY_EXECUTED contract; cannot create/manipulate reprint request |
| 404 | `Error.OriginalChaptersNotFound` | no PUBLISHED original chapter exists in the requested chapter range |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "seriesId": "507f1f77bcf86cd799439011",
  "revisionMode": "AS_IS",
  "reason": "Nội dung mẫu",
  "chapterRangeStart": 1,
  "chapterRangeEnd": 1
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "revisionMode": "AS_IS",
    "reason": "Nội dung mẫu",
    "chapterRangeStart": 0,
    "chapterRangeEnd": 0,
    "status": "string",
    "mangakaApprovedAt": "2026-07-20T09:30:00.000Z",
    "boardApprovedAt": "2026-07-20T09:30:00.000Z",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "chapters": [
      {
        "originalChapterId": "507f1f77bcf86cd799439011",
        "manuscriptFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "status": "PENDING"
      }
    ],
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requester": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /reprint-requests`
> Danh sách yêu cầu tái bản (filter status/seriesId, scope theo role)
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** EDITOR, BOARD_MEMBER, MANGAKA, SUPER_ADMIN (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `status` | string | ✅ |  |
| `seriesId` | string | ✅ | ObjectId của Series |

**Response 200** :

_(xem envelope §0 — data có thể null)_

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "seriesId": "507f1f77bcf86cd799439011",
      "requestedBy": "string",
      "revisionMode": "AS_IS",
      "reason": "Nội dung mẫu",
      "chapterRangeStart": 0,
      "chapterRangeEnd": 0,
      "status": "string",
      "mangakaApprovedAt": "2026-07-20T09:30:00.000Z",
      "boardApprovedAt": "2026-07-20T09:30:00.000Z",
      "publishedAt": "2026-07-20T09:30:00.000Z",
      "createdAt": "2026-07-20T09:30:00.000Z",
      "chapters": [
        {
          "originalChapterId": "507f1f77bcf86cd799439011",
          "manuscriptFile": "uploads/507f1f77bcf86cd799439011/anh.png",
          "status": "PENDING"
        }
      ],
      "series": {
        "id": "507f1f77bcf86cd799439011",
        "title": "Tiêu đề mẫu"
      },
      "requester": {
        "id": "507f1f77bcf86cd799439011",
        "displayName": "Nguyễn Văn A",
        "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
      }
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `GET /reprint-requests/:id`
> Chi tiết yêu cầu tái bản
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** EDITOR, BOARD_MEMBER, MANGAKA, SUPER_ADMIN (Bearer)

**Response 200** (`ReprintRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ |  |
| `revisionMode` | enum `ReprintRevisionMode` | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `chapterRangeStart` | integer | ✅ |  |
| `chapterRangeEnd` | integer | ✅ |  |
| `status` | string | ✅ |  |
| `mangakaApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `publishedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `chapters` | object[] | ✅ |  |
| `chapters[].originalChapterId` | string | ✅ |  |
| `chapters[].manuscriptFile` | string | ✅ |  |
| `chapters[].status` | enum `ReprintChapterStatus` | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ReprintRequestNotFound` | reprint request does not exist (or id is not a valid ObjectId) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "revisionMode": "AS_IS",
    "reason": "Nội dung mẫu",
    "chapterRangeStart": 0,
    "chapterRangeEnd": 0,
    "status": "string",
    "mangakaApprovedAt": "2026-07-20T09:30:00.000Z",
    "boardApprovedAt": "2026-07-20T09:30:00.000Z",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "chapters": [
      {
        "originalChapterId": "507f1f77bcf86cd799439011",
        "manuscriptFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "status": "PENDING"
      }
    ],
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requester": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /reprint-requests/:id/mangaka-review`
> Mangaka chấp nhận/từ chối yêu cầu tái bản (B-RPT-02)

**Quyền:** MANGAKA (Bearer)

**Body** (`MangakaReviewReprintBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `accept` | boolean ✍ | ✅ |  |
| `reason` | string ✍ | — | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 200** (`ReprintRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ |  |
| `revisionMode` | enum `ReprintRevisionMode` | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `chapterRangeStart` | integer | ✅ |  |
| `chapterRangeEnd` | integer | ✅ |  |
| `status` | string | ✅ |  |
| `mangakaApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `publishedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `chapters` | object[] | ✅ |  |
| `chapters[].originalChapterId` | string | ✅ |  |
| `chapters[].manuscriptFile` | string | ✅ |  |
| `chapters[].status` | enum `ReprintChapterStatus` | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.ReprintActionNotAllowed` | mangaka review is only valid for REVENUE_SHARE contracts (Ownership Principle) |
| 404 | `Error.ReprintRequestNotFound` | reprint request does not exist (or id is not a valid ObjectId) |
| 409 | `Error.InvalidReprintTransition` | reprint request state transition is not allowed by REPRINT_REQUEST_TRANSITIONS |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "accept": false,
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "revisionMode": "AS_IS",
    "reason": "Nội dung mẫu",
    "chapterRangeStart": 0,
    "chapterRangeEnd": 0,
    "status": "string",
    "mangakaApprovedAt": "2026-07-20T09:30:00.000Z",
    "boardApprovedAt": "2026-07-20T09:30:00.000Z",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "chapters": [
      {
        "originalChapterId": "507f1f77bcf86cd799439011",
        "manuscriptFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "status": "PENDING"
      }
    ],
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requester": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /reprint-requests/:id/board-approve`
> Board duyệt/từ chối yêu cầu tái bản (B-RPT-02)

**Quyền:** BOARD_MEMBER (Bearer)

**Body** (`BoardApproveReprintBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `approve` | boolean ✍ | ✅ |  |
| `reason` | string ✍ | — | Lý do (text tự do, hiển thị cho bên liên quan) |

**Response 200** (`ReprintRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ |  |
| `revisionMode` | enum `ReprintRevisionMode` | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `chapterRangeStart` | integer | ✅ |  |
| `chapterRangeEnd` | integer | ✅ |  |
| `status` | string | ✅ |  |
| `mangakaApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `publishedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `chapters` | object[] | ✅ |  |
| `chapters[].originalChapterId` | string | ✅ |  |
| `chapters[].manuscriptFile` | string | ✅ |  |
| `chapters[].status` | enum `ReprintChapterStatus` | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ReprintRequestNotFound` | reprint request does not exist (or id is not a valid ObjectId) |
| 404 | `Error.ActiveContractNotFound` | series has no FULLY_EXECUTED contract; cannot create/manipulate reprint request |
| 409 | `Error.InvalidReprintTransition` | reprint request state transition is not allowed by REPRINT_REQUEST_TRANSITIONS |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "approve": false,
  "reason": "Nội dung mẫu"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "revisionMode": "AS_IS",
    "reason": "Nội dung mẫu",
    "chapterRangeStart": 0,
    "chapterRangeEnd": 0,
    "status": "string",
    "mangakaApprovedAt": "2026-07-20T09:30:00.000Z",
    "boardApprovedAt": "2026-07-20T09:30:00.000Z",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "chapters": [
      {
        "originalChapterId": "507f1f77bcf86cd799439011",
        "manuscriptFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "status": "PENDING"
      }
    ],
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requester": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /reprint-requests/:id/chapters`
> Danh sách chapter trong yêu cầu tái bản

**Quyền:** EDITOR, BOARD_MEMBER, MANGAKA, SUPER_ADMIN (Bearer)

**Response 200** :

_(xem envelope §0 — data có thể null)_

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ReprintRequestNotFound` | reprint request does not exist (or id is not a valid ObjectId) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": [
    {
      "originalChapterId": "507f1f77bcf86cd799439011",
      "manuscriptFile": "uploads/507f1f77bcf86cd799439011/anh.png",
      "status": "PENDING"
    }
  ]
}
```

<!-- payload-example:end -->

---

#### `GET /reprint-requests/:id/chapters/:chapterId`
> Chi tiết chapter trong yêu cầu tái bản

**Quyền:** EDITOR, BOARD_MEMBER, MANGAKA, SUPER_ADMIN (Bearer)

**Response 200** (`ReprintChapterRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `originalChapterId` | string | ✅ |  |
| `manuscriptFile` | string | ✅ |  |
| `status` | enum `ReprintChapterStatus` | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ReprintRequestNotFound` | reprint request does not exist (or id is not a valid ObjectId) |
| 404 | `Error.ReprintChapterNotFound` | embedded chapter is not part of this reprint request (or originalChapterId mismatch) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "originalChapterId": "507f1f77bcf86cd799439011",
    "manuscriptFile": "uploads/507f1f77bcf86cd799439011/anh.png",
    "status": "PENDING"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /reprint-requests/:id/chapters/:chapterId/assign-reviser`
> Gán reviser cho chapter tái bản WITH_REVISION (FULL_BUYOUT) — PB-07

**Quyền:** BOARD_MEMBER, EDITOR (Bearer)

**Body** (`AssignReviserBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `reviserId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `reviserType` | enum `ReviserType` | ✅ |  |

**Response 200** (`ReprintRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ |  |
| `revisionMode` | enum `ReprintRevisionMode` | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `chapterRangeStart` | integer | ✅ |  |
| `chapterRangeEnd` | integer | ✅ |  |
| `status` | string | ✅ |  |
| `mangakaApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `publishedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `chapters` | object[] | ✅ |  |
| `chapters[].originalChapterId` | string | ✅ |  |
| `chapters[].manuscriptFile` | string | ✅ |  |
| `chapters[].status` | enum `ReprintChapterStatus` | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ReprintRequestNotFound` | reprint request does not exist (or id is not a valid ObjectId) |
| 404 | `Error.ReprintChapterNotFound` | embedded chapter is not part of this reprint request (or originalChapterId mismatch) |
| 409 | `Error.ReprintNotWithRevision` | reviser can only be assigned when revisionMode = WITH_REVISION |
| 409 | `Error.ReviserOnlyForFullBuyout` | reviser can only be assigned when the active contract is FULL_BUYOUT |
| 422 | `Error.ReviserMangakaNotFound` | reviserType=OTHER_MANGAKA requires the target user to have role MANGAKA |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "reviserId": "507f1f77bcf86cd799439011",
  "reviserType": "INTERNAL_TEAM"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "revisionMode": "AS_IS",
    "reason": "Nội dung mẫu",
    "chapterRangeStart": 0,
    "chapterRangeEnd": 0,
    "status": "string",
    "mangakaApprovedAt": "2026-07-20T09:30:00.000Z",
    "boardApprovedAt": "2026-07-20T09:30:00.000Z",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "chapters": [
      {
        "originalChapterId": "507f1f77bcf86cd799439011",
        "manuscriptFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "status": "PENDING"
      }
    ],
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requester": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /reprint-requests/:id/chapters/:chapterId/manuscript`
> Mangaka cập nhật manuscript cho chapter tái bản

**Quyền:** MANGAKA (Bearer)

**Body** (`SubmitChapterManuscriptBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `originalChapterId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `manuscriptFile` | string (1..∞ ký tự) ✍ | ✅ |  |

**Response 200** (`ReprintRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ |  |
| `revisionMode` | enum `ReprintRevisionMode` | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `chapterRangeStart` | integer | ✅ |  |
| `chapterRangeEnd` | integer | ✅ |  |
| `status` | string | ✅ |  |
| `mangakaApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `publishedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `chapters` | object[] | ✅ |  |
| `chapters[].originalChapterId` | string | ✅ |  |
| `chapters[].manuscriptFile` | string | ✅ |  |
| `chapters[].status` | enum `ReprintChapterStatus` | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ReprintRequestNotFound` | reprint request does not exist (or id is not a valid ObjectId) |
| 404 | `Error.ReprintChapterNotFound` | embedded chapter is not part of this reprint request (or originalChapterId mismatch) |
| 409 | `Error.InvalidReprintTransition` | reprint request state transition is not allowed by REPRINT_REQUEST_TRANSITIONS |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "originalChapterId": "507f1f77bcf86cd799439011",
  "manuscriptFile": "uploads/507f1f77bcf86cd799439011/anh.png"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "revisionMode": "AS_IS",
    "reason": "Nội dung mẫu",
    "chapterRangeStart": 0,
    "chapterRangeEnd": 0,
    "status": "string",
    "mangakaApprovedAt": "2026-07-20T09:30:00.000Z",
    "boardApprovedAt": "2026-07-20T09:30:00.000Z",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "chapters": [
      {
        "originalChapterId": "507f1f77bcf86cd799439011",
        "manuscriptFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "status": "PENDING"
      }
    ],
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requester": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /reprint-requests/:id/chapters/:chapterId/approve`
> Editor duyệt chapter tái bản; auto-publish toàn bộ request khi mọi chapter đạt APPROVED

**Quyền:** EDITOR (Bearer)

**Body** (`EditorApproveChapterBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `originalChapterId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `approve` | boolean ✍ | ✅ |  |

**Response 200** (`ReprintRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestedBy` | string | ✅ |  |
| `revisionMode` | enum `ReprintRevisionMode` | ✅ |  |
| `reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `chapterRangeStart` | integer | ✅ |  |
| `chapterRangeEnd` | integer | ✅ |  |
| `status` | string | ✅ |  |
| `mangakaApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `boardApprovedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `publishedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `chapters` | object[] | ✅ |  |
| `chapters[].originalChapterId` | string | ✅ |  |
| `chapters[].manuscriptFile` | string | ✅ |  |
| `chapters[].status` | enum `ReprintChapterStatus` | ✅ |  |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.ReprintRequestNotFound` | reprint request does not exist (or id is not a valid ObjectId) |
| 404 | `Error.ReprintChapterNotFound` | embedded chapter is not part of this reprint request (or originalChapterId mismatch) |
| 409 | `Error.InvalidReprintTransition` | reprint request state transition is not allowed by REPRINT_REQUEST_TRANSITIONS |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "originalChapterId": "507f1f77bcf86cd799439011",
  "approve": false
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestedBy": "string",
    "revisionMode": "AS_IS",
    "reason": "Nội dung mẫu",
    "chapterRangeStart": 0,
    "chapterRangeEnd": 0,
    "status": "string",
    "mangakaApprovedAt": "2026-07-20T09:30:00.000Z",
    "boardApprovedAt": "2026-07-20T09:30:00.000Z",
    "publishedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "chapters": [
      {
        "originalChapterId": "507f1f77bcf86cd799439011",
        "manuscriptFile": "uploads/507f1f77bcf86cd799439011/anh.png",
        "status": "PENDING"
      }
    ],
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requester": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    }
  }
}
```

<!-- payload-example:end -->

---

## §12. Flow 8 — Transfer (chuyển nhượng series giữa các Mangaka)

**Nghiệp vụ:** Mangaka B muốn tiếp quản series của Mangaka A (vd Boruto). Board sàng lọc hồ sơ năng lực trước. Sau đó rẽ theo HĐ gốc:
- **FULL_BUYOUT** (NXB sở hữu 100% — A không còn gì để bán): Board toàn quyền → đóng HĐ A (`TERMINATED`, mốc chưa đạt MISSED) → **định giá lại** phần còn lại → ký HĐ MỚI FULL_BUYOUT cho B (điều kiện đếm theo đóng góp MỚI của B, không cộng dồn công A). KHÔNG cần A đồng ý — chỉ notify.
- **REVENUE_SHARE** (A còn % sở hữu): Editor **deal với A** → A đồng ý bán trọn (`FULL_TRANSFER`) hay một phần (`PARTIAL_TRANSFER`) → lập **TransferContract ký 3 bên** (A → B → Board, OTP) → cập nhật ownership. `PARTIAL_TRANSFER` → A thành **co-owner**: mỗi chapter mới phải A duyệt trước khi phát hành (`AWAITING_CO_OWNER_APPROVAL` — §5; quá hạn grace → escalate Board).

### Happy path

1. **Mangaka B** `POST /transfers/requests` (seriesId + plan + hồ sơ năng lực) → `SUBMITTED` (snapshot loại HĐ gốc). Xem: `GET /transfers/requests/mine`.
2. **Board** sàng lọc (`GET /transfers/requests/pending-board`): `POST /transfers/requests/:id/board-approve` hoặc `board-reject` (→ `REJECTED_BY_BOARD`).
3. **Nhánh FULL_BUYOUT:** Board `POST /transfers/requests/:id/assign-full-buyout` `{valuationAmount, conditions[]}` → đóng HĐ A + tạo HĐ mới cho B + `Series.mangakaId = B` + notify A. XONG.
4. **Nhánh REVENUE_SHARE:** Editor `POST /transfers/requests/:id/start-negotiation` → `NEGOTIATING` → deal ngoài với A → **Mangaka A** `POST .../mangaka-accept` (hoặc `mangaka-reject` → `REJECTED_BY_ORIGINAL_MANGAKA`).
5. **Editor** `POST /transfers/contracts` (transferType + transferAmount B trả A + newOwnershipSplit `{publisher, A, B}` tổng =100) → ký lần lượt `POST /transfers/contracts/:id/sign` (A → B → Board, OTP) → `FULLY_EXECUTED` → ownership cập nhật; PARTIAL → set `Series.coOwnerId = A`.
6. Xem chữ ký: `GET /transfers/contracts/:id/signatures`.

### Unhappy cases

| Tình huống | API | Kết quả |
|---|---|---|
| Series không có HĐ FULLY_EXECUTED | `POST /transfers/requests` | 4xx `Error.NoActiveContractFound` |
| Board thao tác khi request sai trạng thái | board-approve/reject | 409 `Error.InvalidStatusForScreening` |
| start-negotiation trên HĐ gốc FULL_BUYOUT | start-negotiation | 409 `Error.OnlyAppliesToRevenueShare` |
| A accept/reject khi chưa NEGOTIATING | mangaka-accept/reject | 409 `Error.RequestNotInNegotiatingStage` |
| Tạo TransferContract khi request sai trạng thái | `POST /transfers/contracts` | 409 `Error.InvalidTransferState` |
| `newOwnershipSplit` tổng ≠ 100 | `POST /transfers/contracts` | 422 `Error.InvalidOwnershipSplit` |
| Ký sai lượt / OTP sai | contracts/:id/sign | 409 / 422 |
| Sau PARTIAL_TRANSFER: chapter publish không chờ A | (Flow 2 §5) | Manuscript `AWAITING_CO_OWNER_APPROVAL`; A quá hạn → `ESCALATED` + Board notify |

### API Reference

#### `POST /transfers/requests`
> Mangaka B tạo yêu cầu chuyển nhượng tác phẩm → PENDING_SCREENING

**Quyền:** MANGAKA (Bearer)

**Body** (`CreateTransferRequestBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `seriesId` | string (1..∞ ký tự) ✍ | ✅ | ObjectId của Series |
| `planDescription` | string (1..∞ ký tự) ✍ | ✅ |  |
| `proposedType` | enum `TransferType` | ✅ | Kiểu chuyển nhượng (chỉ có nghĩa khi HĐ gốc REVENUE_SHARE): FULL_TRANSFER (B mua trọn phần của A, A ra đi) \| PARTIAL_TRANSFER (A giữ lại một phần → A thành co-owner, duyệt mỗi chapter mới — BR-TRANSFER-03) |
| `proposedPercentage` | number (≥ 0, ≤ 100) ✍ | — |  |

**Response 201** (`TransferRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestingMangakaId` | string | ✅ |  |
| `originalMangakaId` | string | ✅ |  |
| `originalContractType` | string | — |  |
| `proposedType` | string | — |  |
| `proposedPercentage` | number | — |  |
| `planDescription` | string | — |  |
| `originalContractId` | string | — |  |
| `status` | enum `TransferRequestStatus` | ✅ | Vòng đời yêu cầu chuyển nhượng: SUBMITTED → UNDER_REVIEW → NEGOTIATING/PROPOSED → ACCEPTED; nhánh từ chối/hủy: REJECTED_BY_BOARD \| REJECTED_BY_ORIGINAL_MANGAKA \| REJECTED \| CANCELLED |
| `boardDecisionId` | string | — |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | NO_ACTIVE_CONTRACT_FOUND_FOR_THIS_SERIES |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "seriesId": "507f1f77bcf86cd799439011",
  "planDescription": "Nội dung mẫu",
  "proposedType": "FULL_TRANSFER",
  "proposedPercentage": 1
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestingMangakaId": "507f1f77bcf86cd799439011",
    "originalMangakaId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requestingMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalContractType": "string",
    "proposedType": "string",
    "proposedPercentage": 50,
    "planDescription": "Nội dung mẫu",
    "originalContractId": "507f1f77bcf86cd799439011",
    "status": "SUBMITTED",
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /transfers/requests/mine`
> Danh sách yêu cầu chuyển nhượng của Mangaka hiện tại
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA (Bearer)

**Response 200** (`TransferRequestListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `data` | object[] | ✅ |  |
| `data[].id` | string | ✅ | ObjectId của bản ghi |
| `data[].seriesId` | string | ✅ | ObjectId của Series |
| `data[].requestingMangakaId` | string | ✅ |  |
| `data[].originalMangakaId` | string | ✅ |  |
| `data[].originalContractType` | string | — |  |
| `data[].proposedType` | string | — |  |
| `data[].proposedPercentage` | number | — |  |
| `data[].planDescription` | string | — |  |
| `data[].originalContractId` | string | — |  |
| `data[].status` | enum `TransferRequestStatus` | ✅ | Vòng đời yêu cầu chuyển nhượng: SUBMITTED → UNDER_REVIEW → NEGOTIATING/PROPOSED → ACCEPTED; nhánh từ chối/hủy: REJECTED_BY_BOARD \| REJECTED_BY_ORIGINAL_MANGAKA \| REJECTED \| CANCELLED |
| `data[].boardDecisionId` | string | — |  |
| `data[].createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "data": [
      {
        "id": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "requestingMangakaId": "507f1f77bcf86cd799439011",
        "originalMangakaId": "507f1f77bcf86cd799439011",
        "series": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu"
        },
        "requestingMangaka": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "originalMangaka": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "originalContractType": "string",
        "proposedType": "string",
        "proposedPercentage": 50,
        "planDescription": "Nội dung mẫu",
        "originalContractId": "507f1f77bcf86cd799439011",
        "status": "SUBMITTED",
        "boardDecisionId": "507f1f77bcf86cd799439011",
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /transfers/requests/pending-board`
> Danh sách yêu cầu chuyển nhượng chờ Board xử lý
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** BOARD_MEMBER (Bearer)

**Response 200** (`TransferRequestListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `data` | object[] | ✅ |  |
| `data[].id` | string | ✅ | ObjectId của bản ghi |
| `data[].seriesId` | string | ✅ | ObjectId của Series |
| `data[].requestingMangakaId` | string | ✅ |  |
| `data[].originalMangakaId` | string | ✅ |  |
| `data[].originalContractType` | string | — |  |
| `data[].proposedType` | string | — |  |
| `data[].proposedPercentage` | number | — |  |
| `data[].planDescription` | string | — |  |
| `data[].originalContractId` | string | — |  |
| `data[].status` | enum `TransferRequestStatus` | ✅ | Vòng đời yêu cầu chuyển nhượng: SUBMITTED → UNDER_REVIEW → NEGOTIATING/PROPOSED → ACCEPTED; nhánh từ chối/hủy: REJECTED_BY_BOARD \| REJECTED_BY_ORIGINAL_MANGAKA \| REJECTED \| CANCELLED |
| `data[].boardDecisionId` | string | — |  |
| `data[].createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "data": [
      {
        "id": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "requestingMangakaId": "507f1f77bcf86cd799439011",
        "originalMangakaId": "507f1f77bcf86cd799439011",
        "series": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu"
        },
        "requestingMangaka": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "originalMangaka": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "originalContractType": "string",
        "proposedType": "string",
        "proposedPercentage": 50,
        "planDescription": "Nội dung mẫu",
        "originalContractId": "507f1f77bcf86cd799439011",
        "status": "SUBMITTED",
        "boardDecisionId": "507f1f77bcf86cd799439011",
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /transfers/requests/:id`
> Chi tiết yêu cầu chuyển nhượng
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER (Bearer)

**Response 200** (`TransferRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestingMangakaId` | string | ✅ |  |
| `originalMangakaId` | string | ✅ |  |
| `originalContractType` | string | — |  |
| `proposedType` | string | — |  |
| `proposedPercentage` | number | — |  |
| `planDescription` | string | — |  |
| `originalContractId` | string | — |  |
| `status` | enum `TransferRequestStatus` | ✅ | Vòng đời yêu cầu chuyển nhượng: SUBMITTED → UNDER_REVIEW → NEGOTIATING/PROPOSED → ACCEPTED; nhánh từ chối/hủy: REJECTED_BY_BOARD \| REJECTED_BY_ORIGINAL_MANGAKA \| REJECTED \| CANCELLED |
| `boardDecisionId` | string | — |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | — | TRANSFER_REQUEST_NOT_FOUND |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestingMangakaId": "507f1f77bcf86cd799439011",
    "originalMangakaId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requestingMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalContractType": "string",
    "proposedType": "string",
    "proposedPercentage": 50,
    "planDescription": "Nội dung mẫu",
    "originalContractId": "507f1f77bcf86cd799439011",
    "status": "SUBMITTED",
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /transfers/requests/:id/board-approve`
> Board duyệt sàng lọc yêu cầu chuyển nhượng

**Quyền:** BOARD_MEMBER (Bearer)

**Body** (`BoardDecisionTransferBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `boardSessionId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `details` | string ✍ | — |  |

**Response 201** (`TransferRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestingMangakaId` | string | ✅ |  |
| `originalMangakaId` | string | ✅ |  |
| `originalContractType` | string | — |  |
| `proposedType` | string | — |  |
| `proposedPercentage` | number | — |  |
| `planDescription` | string | — |  |
| `originalContractId` | string | — |  |
| `status` | enum `TransferRequestStatus` | ✅ | Vòng đời yêu cầu chuyển nhượng: SUBMITTED → UNDER_REVIEW → NEGOTIATING/PROPOSED → ACCEPTED; nhánh từ chối/hủy: REJECTED_BY_BOARD \| REJECTED_BY_ORIGINAL_MANGAKA \| REJECTED \| CANCELLED |
| `boardDecisionId` | string | — |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | INVALID_STATUS_FOR_SCREENING |
| 404 | — | TRANSFER_REQUEST_NOT_FOUND |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "boardSessionId": "507f1f77bcf86cd799439011",
  "details": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestingMangakaId": "507f1f77bcf86cd799439011",
    "originalMangakaId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requestingMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalContractType": "string",
    "proposedType": "string",
    "proposedPercentage": 50,
    "planDescription": "Nội dung mẫu",
    "originalContractId": "507f1f77bcf86cd799439011",
    "status": "SUBMITTED",
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /transfers/requests/:id/board-reject`
> Board từ chối sàng lọc yêu cầu chuyển nhượng

**Quyền:** BOARD_MEMBER (Bearer)

**Body** (`BoardDecisionTransferBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `boardSessionId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `details` | string ✍ | — |  |

**Response 201** (`TransferRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestingMangakaId` | string | ✅ |  |
| `originalMangakaId` | string | ✅ |  |
| `originalContractType` | string | — |  |
| `proposedType` | string | — |  |
| `proposedPercentage` | number | — |  |
| `planDescription` | string | — |  |
| `originalContractId` | string | — |  |
| `status` | enum `TransferRequestStatus` | ✅ | Vòng đời yêu cầu chuyển nhượng: SUBMITTED → UNDER_REVIEW → NEGOTIATING/PROPOSED → ACCEPTED; nhánh từ chối/hủy: REJECTED_BY_BOARD \| REJECTED_BY_ORIGINAL_MANGAKA \| REJECTED \| CANCELLED |
| `boardDecisionId` | string | — |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | INVALID_STATUS_FOR_SCREENING |
| 404 | — | TRANSFER_REQUEST_NOT_FOUND |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "boardSessionId": "507f1f77bcf86cd799439011",
  "details": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestingMangakaId": "507f1f77bcf86cd799439011",
    "originalMangakaId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requestingMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalContractType": "string",
    "proposedType": "string",
    "proposedPercentage": 50,
    "planDescription": "Nội dung mẫu",
    "originalContractId": "507f1f77bcf86cd799439011",
    "status": "SUBMITTED",
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /transfers/requests/:id/assign-full-buyout`
> Board chọn Full Buyout → bàn giao series cho Mangaka B

**Quyền:** BOARD_MEMBER (Bearer)

**Body** (`AssignFullBuyoutBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `boardSessionId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `valuationAmount` | number (≥ 0) ✍ | ✅ | Giá trị định giá tác phẩm (Board quyết) |
| `conditions` | object[] | ✅ |  |
| `conditions[].description` | string (1..∞ ký tự) | ✅ |  |
| `conditions[].type` | enum `ConditionType` | ✅ | Allowed values: CHAPTER_MILESTONE, RECURRING_CHAPTER, RANKING_MILESTONE, TIME_BOUND |
| `conditions[].value` | number (≥ 0) | ✅ |  |

**Response 201** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | THIS_ACTION_ONLY_APPLIES_TO_FULL_BUYOUT_CONTRACTS |
| 400 | — | ORIGINAL_CONTRACT_ID_NOT_FOUND |
| 400 | `Error.ValuationRequired` | a positive valuationAmount is required for Full Buyout re-valuation (B-TRF-02) |
| 404 | — | TRANSFER_REQUEST_NOT_FOUND |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "boardSessionId": "507f1f77bcf86cd799439011",
  "valuationAmount": 1,
  "conditions": [
    {
      "description": "Nội dung mẫu",
      "type": "CHAPTER_MILESTONE",
      "value": 1
    }
  ]
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /transfers/requests/:id/start-negotiation`
> Editor bắt đầu thương lượng Revenue Share với Mangaka A

**Quyền:** EDITOR (Bearer)

**Response 201** (`TransferRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestingMangakaId` | string | ✅ |  |
| `originalMangakaId` | string | ✅ |  |
| `originalContractType` | string | — |  |
| `proposedType` | string | — |  |
| `proposedPercentage` | number | — |  |
| `planDescription` | string | — |  |
| `originalContractId` | string | — |  |
| `status` | enum `TransferRequestStatus` | ✅ | Vòng đời yêu cầu chuyển nhượng: SUBMITTED → UNDER_REVIEW → NEGOTIATING/PROPOSED → ACCEPTED; nhánh từ chối/hủy: REJECTED_BY_BOARD \| REJECTED_BY_ORIGINAL_MANGAKA \| REJECTED \| CANCELLED |
| `boardDecisionId` | string | — |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | THIS_ACTION_ONLY_APPLIES_TO_REVENUE_SHARE_CONTRACTS |
| 404 | — | TRANSFER_REQUEST_NOT_FOUND |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestingMangakaId": "507f1f77bcf86cd799439011",
    "originalMangakaId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requestingMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalContractType": "string",
    "proposedType": "string",
    "proposedPercentage": 50,
    "planDescription": "Nội dung mẫu",
    "originalContractId": "507f1f77bcf86cd799439011",
    "status": "SUBMITTED",
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /transfers/requests/:id/mangaka-accept`
> Mangaka A đồng ý chuyển nhượng tác phẩm

**Quyền:** MANGAKA (Bearer)

**Response 201** (`TransferRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestingMangakaId` | string | ✅ |  |
| `originalMangakaId` | string | ✅ |  |
| `originalContractType` | string | — |  |
| `proposedType` | string | — |  |
| `proposedPercentage` | number | — |  |
| `planDescription` | string | — |  |
| `originalContractId` | string | — |  |
| `status` | enum `TransferRequestStatus` | ✅ | Vòng đời yêu cầu chuyển nhượng: SUBMITTED → UNDER_REVIEW → NEGOTIATING/PROPOSED → ACCEPTED; nhánh từ chối/hủy: REJECTED_BY_BOARD \| REJECTED_BY_ORIGINAL_MANGAKA \| REJECTED \| CANCELLED |
| `boardDecisionId` | string | — |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | REQUEST_IS_NOT_IN_NEGOTIATING_STAGE |
| 404 | — | TRANSFER_REQUEST_NOT_FOUND |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestingMangakaId": "507f1f77bcf86cd799439011",
    "originalMangakaId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requestingMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalContractType": "string",
    "proposedType": "string",
    "proposedPercentage": 50,
    "planDescription": "Nội dung mẫu",
    "originalContractId": "507f1f77bcf86cd799439011",
    "status": "SUBMITTED",
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /transfers/requests/:id/mangaka-reject`
> Mangaka A từ chối chuyển nhượng tác phẩm

**Quyền:** MANGAKA (Bearer)

**Response 201** (`TransferRequestRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `requestingMangakaId` | string | ✅ |  |
| `originalMangakaId` | string | ✅ |  |
| `originalContractType` | string | — |  |
| `proposedType` | string | — |  |
| `proposedPercentage` | number | — |  |
| `planDescription` | string | — |  |
| `originalContractId` | string | — |  |
| `status` | enum `TransferRequestStatus` | ✅ | Vòng đời yêu cầu chuyển nhượng: SUBMITTED → UNDER_REVIEW → NEGOTIATING/PROPOSED → ACCEPTED; nhánh từ chối/hủy: REJECTED_BY_BOARD \| REJECTED_BY_ORIGINAL_MANGAKA \| REJECTED \| CANCELLED |
| `boardDecisionId` | string | — |  |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | REQUEST_IS_NOT_IN_NEGOTIATING_STAGE |
| 404 | — | TRANSFER_REQUEST_NOT_FOUND |

<!-- payload-example:begin -->

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "requestingMangakaId": "507f1f77bcf86cd799439011",
    "originalMangakaId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "requestingMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "originalContractType": "string",
    "proposedType": "string",
    "proposedPercentage": 50,
    "planDescription": "Nội dung mẫu",
    "originalContractId": "507f1f77bcf86cd799439011",
    "status": "SUBMITTED",
    "boardDecisionId": "507f1f77bcf86cd799439011",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /transfers/contracts`
> Editor tạo hợp đồng chuyển nhượng 3 bên → DRAFT (chỉ khi request UNDER_REVIEW)

**Quyền:** EDITOR (Bearer)

**Body** (`CreateTransferContractBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `transferRequestId` | string (1..∞ ký tự) ✍ | ✅ |  |
| `transferAmount` | number (≥ 0) ✍ | ✅ |  |
| `transferType` | enum `TransferType` | ✅ | Kiểu chuyển nhượng (chỉ có nghĩa khi HĐ gốc REVENUE_SHARE): FULL_TRANSFER (B mua trọn phần của A, A ra đi) \| PARTIAL_TRANSFER (A giữ lại một phần → A thành co-owner, duyệt mỗi chapter mới — BR-TRANSFER-03) |
| `newOwnershipSplit` | object | ✅ | Cấu hình chia tỷ lệ sở hữu doanh thu mới — tổng các giá trị PHẢI = 100 (%) |
| `coOwnerApprovalRequired` | boolean ✍ | — | (default: `false`) |

**Response 201** (`TransferContractRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `transferRequestId` | string | — |  |
| `seriesId` | string | — | ObjectId của Series |
| `fromMangakaId` | string | — |  |
| `toMangakaId` | string | — |  |
| `transferType` | string | — |  |
| `transferAmount` | number | — |  |
| `newOwnershipSplit` | any | — |  |
| `coOwnerApprovalRequired` | boolean | ✅ |  |
| `status` | enum `TransferContractStatus` | ✅ | Vòng đời hợp đồng chuyển nhượng 3 bên: DRAFT → A_SIGNED → B_SIGNED → BOARD_SIGNED → FULLY_EXECUTED \| VOIDED |
| `aSignedAt` | string (regex, ISO 8601) | — | ISO 8601 date-time (UTC) |
| `bSignedAt` | string (regex, ISO 8601) | — | ISO 8601 date-time (UTC) |
| `boardSignedAt` | string (regex, ISO 8601) | — | ISO 8601 date-time (UTC) |
| `createdAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |
| `signatures` | object[] | — |  |
| `signatures[].id` | string | ✅ | ObjectId của bản ghi |
| `signatures[].transferContractId` | string | ✅ |  |
| `signatures[].userId` | string | ✅ | ObjectId của User |
| `signatures[].role` | string | ✅ |  |
| `signatures[].signedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | — | TRANSFER_REQUEST_NOT_FOUND |
| 409 | `Error.InvalidTransferState` | transfer request is not in the required state for this action (B-TRF-03) |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "transferRequestId": "507f1f77bcf86cd799439011",
  "transferAmount": 1,
  "transferType": "FULL_TRANSFER",
  "newOwnershipSplit": {},
  "coOwnerApprovalRequired": false
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "transferRequestId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "fromMangakaId": "507f1f77bcf86cd799439011",
    "toMangakaId": "507f1f77bcf86cd799439011",
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    },
    "fromMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "toMangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "transferType": "string",
    "transferAmount": 1000000,
    "newOwnershipSplit": null,
    "coOwnerApprovalRequired": false,
    "status": "DRAFT",
    "aSignedAt": "2026-07-20T09:30:00.000Z",
    "bSignedAt": "2026-07-20T09:30:00.000Z",
    "boardSignedAt": "2026-07-20T09:30:00.000Z",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "signatures": [
      {
        "id": "507f1f77bcf86cd799439011",
        "transferContractId": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "role": "string",
        "signedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `POST /transfers/contracts/:id/sign`
> Mangaka/Board ký hợp đồng chuyển nhượng bằng OTP

**Quyền:** MANGAKA, BOARD_MEMBER (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `signerRole` | string | ✅ |  |

**Body** (`SignTransferContractBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `otpCode` | string (6..6 ký tự) ✍ | ✅ |  |

**Response 201** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 400 | — | USER_HAS_ALREADY_SIGNED_THIS_CONTRACT |
| 404 | — | TRANSFER_CONTRACT_NOT_FOUND |
| 404 | — | USER_OR_EMAIL_NOT_FOUND |
| 404 | — | TRANSFER_CONTRACT_NOT_FOUND_AFTER_UPDATE |
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "otpCode": "string"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /transfers/contracts/:id/signatures`
> Danh sách chữ ký của hợp đồng chuyển nhượng

**Quyền:** MANGAKA, EDITOR, BOARD_MEMBER (Bearer)

**Response 200** (`TransferSignatureListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `signatures` | object[] | ✅ |  |
| `signatures[].id` | string | ✅ | ObjectId của bản ghi |
| `signatures[].transferContractId` | string | ✅ |  |
| `signatures[].userId` | string | ✅ | ObjectId của User |
| `signatures[].role` | string | ✅ |  |
| `signatures[].signedAt` | string (regex, ISO 8601) | ✅ | ISO 8601 date-time (UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | — | TRANSFER_CONTRACT_NOT_FOUND |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "signatures": [
      {
        "id": "507f1f77bcf86cd799439011",
        "transferContractId": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "role": "string",
        "signedAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

## §13. Flow 12 + 13 — Franchise consent & Publication Version

### Flow 12 — Sequel/Franchise

**Nghiệp vụ:** series MỚI nối tiếp series cũ (sequel/spinoff/side-story/reboot — khác Transfer: đây là series mới, không đổi tác giả series cũ). Tạo qua Flow 1 bình thường, thêm `parentSeriesId` + `relationshipType` trong `POST /series/proposals`. **Ownership gate:** series gốc `REVENUE_SHARE` và tác giả khác → cần **Mangaka gốc đồng ý** (`franchiseConsentStatus=PENDING`, series con bị **chặn submit** tới khi APPROVED); `FULL_BUYOUT` → không cần consent.

1. Mangaka tạo proposal kèm `parentSeriesId` — parent không tồn tại → 422 `Error.ParentSeriesNotFound`.
2. Cần consent → Mangaka gốc được notify → `POST /series/:id/franchise-consent` `{action: approve|reject}`.
3. `PENDING`/`REJECTED` mà submit → 409 `Error.FranchiseConsentRequired`. APPROVED → Flow 1 chạy tiếp bình thường.

### Flow 13 — Publication Version (registry phiên bản phát hành)

**Nghiệp vụ:** registry CRUD thuần ghi nhận các phiên bản phát hành của series (ngôn ngữ, chiều đọc RTL/LTR, loại bản) — KHÔNG gắn state machine nào.

- Editor/Admin ghi: `POST /series/:seriesId/publication-versions` · `PATCH|DELETE /publication-versions/:id`.
- Đọc: `GET /series/:seriesId/publication-versions` · `GET /publication-versions/:id`.
- Unhappy: id rác/không tồn tại → 404; sai role ghi → 403; language/versionType thiếu → 422.

### API Reference

#### `POST /series/:id/franchise-consent`
> Mangaka gốc đồng ý/từ chối series phái sinh (A-SER-06). REJECTED chỉ block submit.

**Quyền:** MANGAKA (Bearer)

**Body** (`FranchiseConsentBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `approve` | boolean ✍ | ✅ |  |

**Response 201** (`SeriesRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `mangakaId` | string | ✅ | Chủ sở hữu series (Mangaka tạo proposal) |
| `editorId` | string | ✅ | Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận |
| `coOwnerId` | string | ✅ | Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có |
| `parentSeriesId` | string | ✅ | Series gốc nếu là kế nhiệm (sequel/spinoff) |
| `title` | string | ✅ | Tiêu đề (FE tự nhập) |
| `coverImage` | string | ✅ | Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL |
| `genres` | enum `Genre`[] | ✅ | Manga genre (mảng, nhiều thể loại / series) |
| `demographic` | enum `Demographic` | ✅ | Phân khúc độc giả: SHONEN, SEINEN, SHOJO, JOSEI, KODOMO |
| `publicationType` | enum `PublicationType` | ✅ | Publication cadence: WEEKLY, MONTHLY, IRREGULAR |
| `magazine` | string | ✅ | Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED |
| `startIssueNumber` | integer | ✅ | Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED |
| `status` | enum `SeriesStatus` | ✅ | Series state machine status |
| `statusReason` | string | ✅ | Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có |
| `relationshipType` | enum `RelationshipType` | ✅ | Relationship to parent series: SEQUEL, SPINOFF, SIDE_STORY, REBOOT |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus` | ✅ | Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết |
| `createdAt` | string | ✅ | ISO 8601 |
| `reviewStartedAt` | string | ✅ | Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series |
| `completionProposal` | object | ✅ | Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất |
| `completionProposal.proposedByRole` | string | ✅ | Vai trò người đề xuất (MANGAKA\|EDITOR) |
| `completionProposal.proposedById` | string | ✅ | UserId người đề xuất |
| `completionProposal.reason` | string | ✅ | Lý do đề xuất |
| `completionProposal.proposedEndingChapters` | integer | ✅ | Số chương kết thúc dự kiến; null nếu không ghi |
| `completionProposal.proposedAt` | string | ✅ | ISO 8601 |
| `proposal` | object | ✅ | Hồ sơ proposal (nhúng trong Series); null nếu chưa có |
| `proposal.nameId` | string | ✅ | Id Name chương mẫu gắn proposal |
| `proposal.synopsis` | string | ✅ | Tóm tắt cốt truyện |
| `proposal.characterDesigns` | string[] | ✅ | Mảng object key ảnh thiết kế nhân vật (R2) |
| `proposal.estimatedLength` | number | ✅ | Số chương ước tính |
| `proposal.status` | enum `ProposalStatus` | ✅ | Series proposal review status |
| `proposal.createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotOriginalMangaka` | only the parent series original mangaka can give franchise consent |
| 404 | `Error.SeriesNotFound` | series does not exist |
| 409 | `Error.NotFranchiseConsentTarget` | series is not a franchise pending consent |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "approve": false
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "mangakaId": "507f1f77bcf86cd799439011",
    "editorId": "507f1f77bcf86cd799439011",
    "mangaka": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "editor": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "coOwnerId": "507f1f77bcf86cd799439011",
    "parentSeriesId": "507f1f77bcf86cd799439011",
    "title": "Tiêu đề mẫu",
    "coverImage": "uploads/507f1f77bcf86cd799439011/anh.png",
    "genres": [
      "ACTION"
    ],
    "demographic": "SHONEN",
    "publicationType": "WEEKLY",
    "magazine": "string",
    "startIssueNumber": 1,
    "status": "DRAFT",
    "statusReason": "Nội dung mẫu",
    "relationshipType": "SEQUEL",
    "franchiseConsentStatus": "PENDING",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "reviewStartedAt": "2026-07-20T09:30:00.000Z",
    "completionProposal": {
      "proposedByRole": "string",
      "proposedById": "507f1f77bcf86cd799439011",
      "reason": "Nội dung mẫu",
      "proposedEndingChapters": 0,
      "proposedAt": "2026-07-20T09:30:00.000Z"
    },
    "proposal": {
      "nameId": "507f1f77bcf86cd799439011",
      "synopsis": "Nội dung mẫu",
      "characterDesigns": [
        "string"
      ],
      "estimatedLength": 0,
      "status": "DRAFT",
      "createdAt": "2026-07-20T09:30:00.000Z"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `POST /series/:seriesId/publication-versions`
> B-PUB-01: Tạo phiên bản phát hành cho series (Flow 13)

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Body** (`CreatePublicationVersionBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `language` | string (1..20 ký tự) ✍ | ✅ | Mã ngôn ngữ, vd JA/EN/VI |
| `readingDirection` | enum `ReadingDirection` | — | Reading direction: RTL (right-to-left, manga gốc) \| LTR (left-to-right, bản dịch phương Tây) (default: `"RTL"`) |
| `versionType` | enum(ORIGINAL, DIGITAL, FLIPPED, ) | — | ORIGINAL \| DIGITAL \| FLIPPED |
| `notes` | string (0..2000 ký tự) ✍ | — |  |

**Response 201** (`PublicationVersionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `language` | string | ✅ |  |
| `readingDirection` | enum `ReadingDirection` | ✅ | Reading direction: RTL (right-to-left, manga gốc) \| LTR (left-to-right, bản dịch phương Tây) |
| `versionType` | string | ✅ | ORIGINAL \| DIGITAL \| FLIPPED (hoặc null nếu không set) |
| `notes` | string | ✅ |  |
| `createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | current user cannot access this series |
| 404 | `Error.SeriesNotFound` | series does not exist |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "language": "string",
  "readingDirection": "RTL",
  "versionType": "ORIGINAL",
  "notes": "Nội dung mẫu"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "language": "string",
    "readingDirection": "RTL",
    "versionType": "string",
    "notes": "Nội dung mẫu",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /series/:seriesId/publication-versions`
> List phiên bản phát hành của series (scope theo role)

**Quyền:** EDITOR, BOARD_MEMBER, SUPER_ADMIN, MANGAKA (Bearer)

**Response 200** (`PublicationVersionListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].seriesId` | string | ✅ | ObjectId của Series |
| `items[].language` | string | ✅ |  |
| `items[].readingDirection` | enum `ReadingDirection` | ✅ | Reading direction: RTL (right-to-left, manga gốc) \| LTR (left-to-right, bản dịch phương Tây) |
| `items[].versionType` | string | ✅ | ORIGINAL \| DIGITAL \| FLIPPED (hoặc null nếu không set) |
| `items[].notes` | string | ✅ |  |
| `items[].createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | current user cannot access this series |
| 404 | `Error.SeriesNotFound` | series does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "language": "string",
        "readingDirection": "RTL",
        "versionType": "string",
        "notes": "Nội dung mẫu",
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    ]
  }
}
```

<!-- payload-example:end -->

---

#### `GET /publication-versions/:id`
> Chi tiết 1 phiên bản phát hành

**Quyền:** EDITOR, BOARD_MEMBER, SUPER_ADMIN, MANGAKA (Bearer)

**Response 200** (`PublicationVersionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `language` | string | ✅ |  |
| `readingDirection` | enum `ReadingDirection` | ✅ | Reading direction: RTL (right-to-left, manga gốc) \| LTR (left-to-right, bản dịch phương Tây) |
| `versionType` | string | ✅ | ORIGINAL \| DIGITAL \| FLIPPED (hoặc null nếu không set) |
| `notes` | string | ✅ |  |
| `createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | current user cannot access this series |
| 404 | `Error.PublicationVersionNotFound` | publication version does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "language": "string",
    "readingDirection": "RTL",
    "versionType": "string",
    "notes": "Nội dung mẫu",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /publication-versions/:id`
> Sửa (partial) phiên bản phát hành

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Body** (`UpdatePublicationVersionBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `language` | string (1..20 ký tự) ✍ | — |  |
| `readingDirection` | enum `ReadingDirection` | — | Reading direction: RTL (right-to-left, manga gốc) \| LTR (left-to-right, bản dịch phương Tây) |
| `versionType` | enum(ORIGINAL, DIGITAL, FLIPPED, ) | — |  |
| `notes` | string (0..2000 ký tự) ✍ | — |  |

**Response 200** (`PublicationVersionRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `seriesId` | string | ✅ | ObjectId của Series |
| `language` | string | ✅ |  |
| `readingDirection` | enum `ReadingDirection` | ✅ | Reading direction: RTL (right-to-left, manga gốc) \| LTR (left-to-right, bản dịch phương Tây) |
| `versionType` | string | ✅ | ORIGINAL \| DIGITAL \| FLIPPED (hoặc null nếu không set) |
| `notes` | string | ✅ |  |
| `createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | current user cannot access this series |
| 404 | `Error.PublicationVersionNotFound` | publication version does not exist |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "language": "string",
  "readingDirection": "RTL",
  "versionType": "ORIGINAL",
  "notes": "Nội dung mẫu"
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "language": "string",
    "readingDirection": "RTL",
    "versionType": "string",
    "notes": "Nội dung mẫu",
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `DELETE /publication-versions/:id`
> Xóa phiên bản phát hành

**Quyền:** EDITOR, SUPER_ADMIN (Bearer)

**Response 200** (`MessageRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `message` | string | ✅ | Message hiển thị cho user |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.SeriesAccessDenied` | current user cannot access this series |
| 404 | `Error.PublicationVersionNotFound` | publication version does not exist |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "message": "Nội dung mẫu"
  }
}
```

<!-- payload-example:end -->

---

## §14. Cross-cutting: Upload R2, Notification, Audit, AppConfig

### Upload / Download file (mọi user đã đăng nhập)

Chu trình chuẩn (mọi field file trong hệ đều đi đường này):
1. `POST /uploads/sign` `{fileName, contentType, contentLength, assetType?}` → `{assetId, key, uploadUrl, requiredHeaders, expiresAt}`.
2. FE `PUT` bytes **thẳng lên `uploadUrl`** với đúng `requiredHeaders` (Content-Type đã pin vào chữ ký — sai type/size R2 từ chối 403).
3. Gửi `key` vào API nghiệp vụ (coverImage, namePages, originalFile, portfolio, assetIds...).
4. Hiển thị: `POST /uploads/sign-download` `{key}` → `{downloadUrl, expiresAt}` (RBAC: chủ upload hoặc EDITOR/BOARD/ADMIN — khác → 403 `Error.DownloadForbidden`).

Unhappy: contentType ngoài allowlist → 422 `Error.UnsupportedFileType`; quá 15MB → 422 `Error.FileTooLarge`; key không tồn tại → 404 `Error.AssetNotFound`. Asset xin URL nhưng không upload → cron tự dọn.

### Notification (mọi user)

- `GET /notifications?isRead=&type=&limit=&offset=` — filter `isRead` 3 trạng thái (omit=tất cả), response luôn kèm `unreadCount` (badge — độc lập filter). Scope cứng theo user hiện tại.
- `PATCH /notifications/:id/read` (idempotent; của người khác/không tồn tại → 404 `Error.NotificationNotFound`) · `PATCH /notifications/read-all` → `{updated}`.
- Các notification review lặp có định danh vòng/bản nộp trong `content`: proposal/Name/manuscript/task request-revision và resubmit dùng `(round N)`; `TASK_SUBMITTED` dùng `(version N)`. Vì dedupe key có hash content, mỗi vòng/version sinh notification mới nhưng retry cùng payload vẫn được dedupe.
- Name resubmit nay phát `NAME_RESUBMITTED` cho Editor đang phụ trách; người yêu cầu sửa nhận `REVISION_RESOLVED` khi recipient đánh dấu vòng đó đã xử lý.
- Realtime = polling. Deep-link theo `referenceType` prefix — xem §0.6.

### Revision tracking (người trong vòng review)

Mỗi action request-revision của proposal, Name, manuscript hoặc task tự sinh một `RevisionRequest` có `reason`, `round`, người yêu cầu và người phải sửa. Đây là checklist lịch sử, **không phải gate resubmit**: còn vòng chưa resolve vẫn được tiếp tục flow. Mangaka/Assistant chỉ resolve vòng mà mình là `recipientId`; Editor theo dõi các vòng mình đã yêu cầu; Board/Admin có quyền xem toàn bộ.

### Audit log (SUPER_ADMIN + BOARD_MEMBER)

`GET /audit?entityType=&entityId=&actorId=&limit=&offset=` — truy vết mọi chuyển trạng thái/moderation/config: ai (`actorId` null = hệ thống), entity nào, từ→đến trạng thái, lý do, lúc nào. Phục vụ màn hình lịch sử/minh bạch.

### AppConfig (SUPER_ADMIN)

`GET /admin/app-config` · `PATCH /admin/app-config` — registry tham số nghiệp vụ runtime (không cần deploy lại): `nameMaxReviewRounds` (ngưỡng cảnh báo Name lặp, default 8) · `maxUploadBytes` (trần upload, default 15MB, cứng ≤50MB) · `reputationRecommendThreshold` (ngưỡng isRecommended) · `coOwnerApprovalGraceDays` (hạn co-owner duyệt chapter) · `hiatusTooLongDays` (ngưỡng cron cảnh báo hiatus) · `lowVoteReliabilityThreshold` (ngưỡng kỳ vote "không đủ tin cậy") · `assignmentGraceDays`. Cache 30s — PATCH xong đợi ~30s mới chắc chắn áp.

### API Reference

#### `POST /uploads/sign`
> Xin signed URL upload (presigned PUT) lên R2; validate type/size; tạo Asset; trả uploadUrl + key

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Body** (`SignUploadBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `fileName` | string (1..255 ký tự) ✍ | ✅ | Tên file gốc (dùng sinh object key an toàn) |
| `contentType` | enum(image/png, image/jpeg, image/webp, application/pdf) | ✅ | Loại file cho phép: image/png · image/jpeg · image/webp · application/pdf |
| `contentLength` | integer (≥ 0) ✍ | ✅ | Bytes - must be less than or equal to maxUploadBytes from AppConfig (default 15MB) |
| `assetType` | enum `AssetType` | — | Uploaded asset type |

**Response 201** (`SignUploadRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `assetId` | string | ✅ |  |
| `key` | string | ✅ | Object key trên R2 |
| `uploadUrl` | string | ✅ | Presigned PUT URL — FE upload thẳng R2, hết hạn theo expiresAt |
| `requiredHeaders` | object | ✅ | Header BẮT BUỘC gửi kèm khi PUT (Content-Type đã pin vào chữ ký) |
| `expiresAt` | string | ✅ | Hạn hiệu lực (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 422 | `Error.UnsupportedFileType` | file type is not allowed |
| 422 | `Error.FileTooLarge` | file exceeds upload size limit |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "fileName": "uploads/507f1f77bcf86cd799439011/anh.png",
  "contentType": "image/png",
  "contentLength": 1,
  "assetType": "REFERENCE"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "assetId": "507f1f77bcf86cd799439011",
    "key": "uploads/507f1f77bcf86cd799439011/anh.png",
    "uploadUrl": "uploads/507f1f77bcf86cd799439011/anh.png",
    "requiredHeaders": {},
    "expiresAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `POST /uploads/sign-download`
> Xin signed URL download (presigned GET) cho 1 object key (chủ sở hữu / EDITOR / BOARD)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Body** (`SignDownloadBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `key` | string (1..∞ ký tự) ✍ | ✅ | Object key trên R2 |

**Response 201** (`SignDownloadRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `downloadUrl` | string | ✅ | Presigned GET URL tạm thời |
| `expiresAt` | string | ✅ | Hạn hiệu lực (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.DownloadForbidden` | current user cannot download this asset |
| 404 | `Error.AssetNotFound` | asset does not exist |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "key": "uploads/507f1f77bcf86cd799439011/anh.png"
}
```

**Ví dụ response 201** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "downloadUrl": "uploads/507f1f77bcf86cd799439011/anh.png",
    "expiresAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `GET /notifications`
> List thông báo của user hiện tại (filter isRead/type, kèm unreadCount cho badge)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `isRead` | enum(true, false) | — | true = user đã đọc thông báo |
| `type` | enum `NotificationType` | — | Notification type: SYSTEM, CONTRACT, TASK, DEADLINE, SURVEY, BOARD, REVIEW |
| `limit` | integer (≥ 0, ≤ 100) | — | Số bản ghi mỗi trang (default: `20`) |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (phân trang) (default: `0`) |

**Response 200** (`NotificationListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].type` | enum `NotificationType` | ✅ | Notification type: SYSTEM, CONTRACT, TASK, DEADLINE, SURVEY, BOARD, REVIEW |
| `items[].referenceId` | string | ✅ | ID thực thể liên quan (chapter/task/...) |
| `items[].referenceType` | string | ✅ | Mã action liên quan đến referenceId, ví dụ TASK_APPROVED hoặc CHAPTER_PUBLISHED |
| `items[].content` | string | ✅ | Nội dung hiển thị; notification mới luôn có content |
| `items[].isRead` | boolean | ✅ | true = user đã đọc thông báo |
| `items[].createdAt` | string | ✅ | ISO 8601 |
| `total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `unreadCount` | number | ✅ | Tổng số chưa đọc (độc lập filter, dùng cho badge) |
| `limit` | number | ✅ | Số bản ghi mỗi trang |
| `offset` | number | ✅ | Số bản ghi bỏ qua (phân trang) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "type": "SYSTEM",
        "referenceId": "507f1f77bcf86cd799439011",
        "referenceType": "string",
        "content": "Nội dung mẫu",
        "isRead": false,
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    ],
    "total": 1,
    "unreadCount": 1,
    "limit": 1,
    "offset": 1
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /notifications/:id/read`
> Đánh dấu 1 thông báo đã đọc (idempotent)

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Response 200** (`NotificationRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `type` | enum `NotificationType` | ✅ | Notification type: SYSTEM, CONTRACT, TASK, DEADLINE, SURVEY, BOARD, REVIEW |
| `referenceId` | string | ✅ | ID thực thể liên quan (chapter/task/...) |
| `referenceType` | string | ✅ | Mã action liên quan đến referenceId, ví dụ TASK_APPROVED hoặc CHAPTER_PUBLISHED |
| `content` | string | ✅ | Nội dung hiển thị; notification mới luôn có content |
| `isRead` | boolean | ✅ | true = user đã đọc thông báo |
| `createdAt` | string | ✅ | ISO 8601 |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 404 | `Error.NotificationNotFound` | notification does not exist or does not belong to the current user |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "type": "SYSTEM",
    "referenceId": "507f1f77bcf86cd799439011",
    "referenceType": "string",
    "content": "Nội dung mẫu",
    "isRead": false,
    "createdAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /notifications/read-all`
> Đánh dấu tất cả thông báo chưa đọc của user là đã đọc

**Quyền:** Mọi user đã đăng nhập (Bearer)

**Response 200** (`ReadAllRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `updated` | number | ✅ | Số notification vừa được đánh dấu đã đọc |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "updated": 0
  }
}
```

<!-- payload-example:end -->

---

#### `GET /revision-requests`
> List lịch sử vòng yêu cầu sửa; scope theo người trong cuộc, Board/Admin xem tất cả
> 🆕 **Spec 20:** response kèm object hiển thị (UserMini/series/chapter — xem bảng §0.10), field id cũ giữ nguyên.

**Quyền:** MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN (Bearer)

**Query params** (`ListRevisionRequestsQuery`, `.strict()`):

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `targetType` | enum `RevisionTargetType` | — | `PROPOSAL`, `NAME`, `MANUSCRIPT`, `TASK` |
| `targetId` | string | — | seriesId / nameId / chapterId / taskId theo targetType; id không phải 24-hex trả danh sách rỗng, không 500 |
| `isResolved` | enum(`true`, `false`) | — | Omit = tất cả; `true` = đã xử lý; `false` = còn tồn |
| `limit` | integer (1..100) | — | Default `20` |
| `offset` | integer (≥ 0) | — | Default `0` |

MANGAKA/ASSISTANT/EDITOR chỉ thấy row có `recipientId = mình` hoặc `requestedBy = mình`; BOARD_MEMBER/SUPER_ADMIN thấy tất cả.

**Response 200** (`RevisionRequestListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Sắp xếp mới nhất trước |
| `items[].id` | string | ✅ | ObjectId RevisionRequest |
| `items[].targetType` | enum `RevisionTargetType` | ✅ | Loại target |
| `items[].targetId` | string | ✅ | ID target nghiệp vụ |
| `items[].seriesId` | string \| null | ✅ | null với TASK |
| `items[].round` | number | ✅ | Số vòng trên cùng `(targetType,targetId)`, bắt đầu từ 1 |
| `items[].reason` | string | ✅ | Nội dung cần sửa |
| `items[].requestedBy` | string | ✅ | User yêu cầu sửa |
| `items[].recipientId` | string | ✅ | User phải sửa; chỉ user này resolve được |
| `items[].isResolved` | boolean | ✅ | Đã đánh dấu xử lý xong hay chưa |
| `items[].resolvedAt` | string \| null | ✅ | ISO 8601 |
| `items[].resolvedBy` | string \| null | ✅ | User đã resolve |
| `items[].createdAt` | string | ✅ | ISO 8601 |
| `total` | number | ✅ | Tổng bản ghi khớp filter/scope |
| `limit` | number | ✅ | Kích thước trang |
| `offset` | number | ✅ | Số bản ghi bỏ qua |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "targetType": "PROPOSAL",
        "targetId": "507f1f77bcf86cd799439011",
        "seriesId": "507f1f77bcf86cd799439011",
        "round": 0,
        "reason": "Nội dung mẫu",
        "requestedBy": "string",
        "recipientId": "507f1f77bcf86cd799439011",
        "isResolved": false,
        "resolvedAt": "2026-07-20T09:30:00.000Z",
        "resolvedBy": "string",
        "createdAt": "2026-07-20T09:30:00.000Z",
        "requester": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "recipient": {
          "id": "507f1f77bcf86cd799439011",
          "displayName": "Nguyễn Văn A",
          "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
        },
        "series": {
          "id": "507f1f77bcf86cd799439011",
          "title": "Tiêu đề mẫu"
        }
      }
    ],
    "total": 1,
    "limit": 1,
    "offset": 1
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /revision-requests/:id/resolve`
> Người phải sửa đánh dấu một vòng đã xử lý xong; idempotent

**Quyền:** MANGAKA, ASSISTANT (Bearer), đồng thời caller phải đúng `recipientId`

**Body:** không có.

**Response 200:** `RevisionRequestRes` — cùng shape một phần tử ở route list. Nếu đã resolve, trả nguyên bản ghi và không phát notification lặp. Resolve cạnh tranh dùng compare-and-set: đúng một request đổi state và phát `REVISION_RESOLVED` cho `requestedBy`.

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 403 | `Error.NotRevisionRecipient` | caller không phải người phải sửa của vòng này |
| 404 | `Error.RevisionRequestNotFound` | revision request không tồn tại hoặc id không hợp lệ |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "targetType": "PROPOSAL",
    "targetId": "507f1f77bcf86cd799439011",
    "seriesId": "507f1f77bcf86cd799439011",
    "round": 0,
    "reason": "Nội dung mẫu",
    "requestedBy": "string",
    "recipientId": "507f1f77bcf86cd799439011",
    "isResolved": false,
    "resolvedAt": "2026-07-20T09:30:00.000Z",
    "resolvedBy": "string",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "requester": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "recipient": {
      "id": "507f1f77bcf86cd799439011",
      "displayName": "Nguyễn Văn A",
      "avatar": "uploads/507f1f77bcf86cd799439011/anh.png"
    },
    "series": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Tiêu đề mẫu"
    }
  }
}
```

<!-- payload-example:end -->

---

#### `GET /audit`
> List audit logs for privileged audit viewers

**Quyền:** SUPER_ADMIN, BOARD_MEMBER (Bearer)

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `entityType` | enum `AuditEntityType` | — | Audited entity type: SERIES, MANUSCRIPT, PAGE, CHAPTER, TASK, DEADLINE_REQUEST, USER, REGION, APP_CONFIG, CONTRACT, BOARD_DECISION, REPRINT_REQUEST, TRANSFER_REQUEST |
| `entityId` | string | — | Id entity bị tác động |
| `actorId` | string | — | Id user thao tác |
| `action` | string | — | TRANSITION \| HOLD \| RESUME \| BAN \| ... (string chuẩn hóa) |
| `limit` | integer (≥ 0, ≤ 100) | — | Số bản ghi mỗi trang (default: `20`) |
| `offset` | integer (≥ 0) | — | Số bản ghi bỏ qua (phân trang) (default: `0`) |

**Response 200** (`AuditLogListRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `items` | object[] | ✅ | Mảng bản ghi (phần tử xem các dòng con) |
| `items[].id` | string | ✅ | ObjectId của bản ghi |
| `items[].actorId` | string | ✅ | null = hành động hệ thống (cron/listener) |
| `items[].entityType` | enum `AuditEntityType` | ✅ | Audited entity type: SERIES, MANUSCRIPT, PAGE, CHAPTER, TASK, DEADLINE_REQUEST, USER, REGION, APP_CONFIG, CONTRACT, BOARD_DECISION, REPRINT_REQUEST, TRANSFER_REQUEST |
| `items[].entityId` | string | ✅ |  |
| `items[].action` | string | ✅ |  |
| `items[].fromState` | string | ✅ |  |
| `items[].toState` | string | ✅ |  |
| `items[].reason` | string | ✅ | Lý do (text tự do, hiển thị cho bên liên quan) |
| `items[].createdAt` | string | ✅ | Thời điểm tạo (ISO 8601 UTC) |
| `total` | number | ✅ | Tổng số bản ghi khớp filter (phân trang) |
| `limit` | number | ✅ | Số bản ghi mỗi trang |
| `offset` | number | ✅ | Số bản ghi bỏ qua (phân trang) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "actorId": "507f1f77bcf86cd799439011",
        "entityType": "SERIES",
        "entityId": "507f1f77bcf86cd799439011",
        "action": "string",
        "fromState": "string",
        "toState": "string",
        "reason": "Nội dung mẫu",
        "createdAt": "2026-07-20T09:30:00.000Z"
      }
    ],
    "total": 1,
    "limit": 1,
    "offset": 1
  }
}
```

<!-- payload-example:end -->

---

#### `GET /admin/app-config`
> Super Admin reads runtime app configuration

**Quyền:** SUPER_ADMIN (Bearer)

**Response 200** (`AppConfigRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `updatedBy` | string | ✅ | Admin user id that last updated app config |
| `coOwnerApprovalGraceDays` | integer (≥ 0) | ✅ | Grace days for co-owner approval flows |
| `nameMaxReviewRounds` | integer (≥ 0) | ✅ | Maximum name review rounds before loop warning |
| `reputationRecommendThreshold` | number (≥ 1, ≤ 5) | ✅ | Minimum reputation score for recommendations |
| `hiatusTooLongDays` | integer (≥ 0) | ✅ | Days before a hiatus is considered too long |
| `lowVoteReliabilityThreshold` | integer (≥ 0) | ✅ | Vote count below which reliability is low |
| `maxUploadBytes` | integer (≥ 0, ≤ 52428800) | ✅ | Maximum upload size in bytes |
| `assignmentGraceDays` | integer (≥ 0) | ✅ | Grace days around assignment lifecycle checks |
| `updatedAt` | string | ✅ | Thời điểm cập nhật gần nhất (ISO 8601 UTC) |

<!-- payload-example:begin -->

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "updatedBy": "string",
    "coOwnerApprovalGraceDays": 1,
    "nameMaxReviewRounds": 1,
    "reputationRecommendThreshold": 1,
    "hiatusTooLongDays": 1,
    "lowVoteReliabilityThreshold": 1,
    "maxUploadBytes": 1,
    "assignmentGraceDays": 1,
    "updatedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

#### `PATCH /admin/app-config`
> Super Admin updates runtime app configuration

**Quyền:** SUPER_ADMIN (Bearer)

**Body** (`PatchAppConfigBody`):

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `coOwnerApprovalGraceDays` | integer (≥ 0) ✍ | — | Grace days for co-owner approval flows |
| `nameMaxReviewRounds` | integer ✍ | — | Maximum name review rounds before loop warning |
| `reputationRecommendThreshold` | number (≥ 1, ≤ 5) ✍ | — | Minimum reputation score for recommendations |
| `hiatusTooLongDays` | integer ✍ | — | Days before a hiatus is considered too long |
| `lowVoteReliabilityThreshold` | integer (≥ 0) ✍ | — | Vote count below which reliability is low |
| `maxUploadBytes` | integer (≤ 52428800) ✍ | — | Maximum upload size in bytes; hard cap is 50MB |
| `assignmentGraceDays` | integer (≥ 0) ✍ | — | Grace days around assignment lifecycle checks |

**Response 200** (`AppConfigRes` — đọc `res.data`):

| Field | Kiểu | Có mặt | Mô tả |
|---|---|---|---|
| `id` | string | ✅ | ObjectId của bản ghi |
| `updatedBy` | string | ✅ | Admin user id that last updated app config |
| `coOwnerApprovalGraceDays` | integer (≥ 0) | ✅ | Grace days for co-owner approval flows |
| `nameMaxReviewRounds` | integer (≥ 0) | ✅ | Maximum name review rounds before loop warning |
| `reputationRecommendThreshold` | number (≥ 1, ≤ 5) | ✅ | Minimum reputation score for recommendations |
| `hiatusTooLongDays` | integer (≥ 0) | ✅ | Days before a hiatus is considered too long |
| `lowVoteReliabilityThreshold` | integer (≥ 0) | ✅ | Vote count below which reliability is low |
| `maxUploadBytes` | integer (≥ 0, ≤ 52428800) | ✅ | Maximum upload size in bytes |
| `assignmentGraceDays` | integer (≥ 0) | ✅ | Grace days around assignment lifecycle checks |
| `updatedAt` | string | ✅ | Thời điểm cập nhật gần nhất (ISO 8601 UTC) |

**Lỗi nghiệp vụ:**

| Status | Code | Khi nào |
|---|---|---|
| 422 | — | Validation fail |

<!-- payload-example:begin -->

**Ví dụ request body:**

```json
{
  "coOwnerApprovalGraceDays": 1,
  "nameMaxReviewRounds": 1,
  "reputationRecommendThreshold": 1,
  "hiatusTooLongDays": 0,
  "lowVoteReliabilityThreshold": 1,
  "maxUploadBytes": 0,
  "assignmentGraceDays": 1
}
```

**Ví dụ response 200** (đã bọc envelope — FE đọc `data`):

```json
{
  "success": true,
  "message": "Thành công",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "updatedBy": "string",
    "coOwnerApprovalGraceDays": 1,
    "nameMaxReviewRounds": 1,
    "reputationRecommendThreshold": 1,
    "hiatusTooLongDays": 1,
    "lowVoteReliabilityThreshold": 1,
    "maxUploadBytes": 1,
    "assignmentGraceDays": 1,
    "updatedAt": "2026-07-20T09:30:00.000Z"
  }
}
```

<!-- payload-example:end -->

---

## §15. WebSocket `/board` — realtime phiên họp Hội đồng

Socket.IO namespace **`/board`** (server cùng host API). Duy nhất chỗ này có realtime — mọi thứ khác polling.

**Kết nối (BẮT BUỘC JWT):**

```js
const socket = io(`${API_ORIGIN}/board`, {
  auth: { token: accessToken }   // hoặc header Authorization: Bearer <token>
})
```

- Thiếu/sai token → server `disconnect` ngay khi handshake.
- Join room phiên họp: `socket.emit('joinSession', { sessionId })` → chỉ **creator / thành viên roster (`allowedEditorIds`) / SUPER_ADMIN** được vào; ngoài danh sách → `{status: 'DENIED'}`; sessionId rác → từ chối.
- Gửi chat Q&A: `socket.emit('sendMessage', {sessionId, content}, ack)`; `content` được trim, dài 1..1000. Ack thành công: `{status:'SUCCESS', message: BoardMessageRes}`. Ack bị từ chối: `{status:'DENIED', reason}` với `NOT_PARTICIPANT`, `SESSION_NOT_ACTIVE`, `VOTING_PHASE`, `INVALID_INPUT`. Lỗi persist ngoài dự kiến trả `{status:'ERROR'}` và không làm crash socket.
- Sự kiện nhận **`messageReceived`**: payload `BoardMessageRes = {id, sessionId, sender:{id,displayName,avatar}, content, phase, createdAt}`; server broadcast vào room `session_<id>` sau khi lưu thành công.
- Sự kiện nhận **`phaseChanged`**: payload `{sessionId, phase}`; server broadcast sau `PATCH /board/sessions/:id/phase` thành công.
- Sự kiện nhận: **`voteProgressUpdated`** — bắn mỗi khi có phiếu mới (payload: tiến độ vote của decision trong phiên) → FE cập nhật màn hình họp trực tiếp. Kết quả chốt (APPROVED/REJECTED) vẫn nên đối chiếu bằng `GET /board/decisions/:id`.
- **Origin (Spec 13):** namespace `/board` dùng chung whitelist `CORS_ORIGINS` với HTTP (§0.8). Origin FE phải nằm trong danh sách, nếu không handshake WebSocket bị browser chặn. (Nội bộ: adapter Redis của Socket.IO nay dùng connection riêng, không ảnh hưởng contract FE.)

**Ví dụ đầy đủ (socket.io-client):**

```js
import { io } from 'socket.io-client'

const socket = io(`${API_ORIGIN}/board`, { auth: { token: accessToken } })

socket.on('connect', () => {
  socket.emit('joinSession', { sessionId })
  // Sau reconnect: refetch GET session + messages + decisions?boardSessionId=...
})
socket.emit('sendMessage', { sessionId, content: 'Câu hỏi cho người trình bày' }, (ack) => {
  if (ack.status === 'DENIED') showChatDeniedReason(ack.reason)
})
socket.on('messageReceived', (message) => appendBoardMessage(message))
socket.on('phaseChanged', ({ phase }) => updateMeetingPhase(phase))
socket.on('voteProgressUpdated', (payload) => updateBoardScreen(payload))
socket.on('disconnect', (reason) => {
  // reason 'io server disconnect' + ngay lúc handshake ⇒ token thiếu/sai
})
```

## §16. Changelog v2 → v3 (FE PHẢI đọc nếu đã code theo v2)

### 2026-07-21 (khuya) — Task nhiều vùng / 1 trang · download-url phủ reference (2 BREAKING, 1 additive)

> Route inventory **giữ nguyên** (chỉ đổi shape body/response của `POST /tasks` + `TaskRes`). Đã build/tsc/unit **1258/1258** + flowtest flow-02/03 (DB thật) xanh.

**🔴 BREAKING 1 — `POST /tasks` giao 1 task cho NHIỀU vùng trên cùng trang**
- Body: **bỏ `regionId` (string), thêm `regionIds` (string[])** — 0..50 vùng, **tất cả phải thuộc `pageId`**. Rỗng/omit = giao cả trang.
- Vùng không tồn tại hoặc thuộc trang khác → **404 `Error.RegionNotFound`**.
- `POST /tasks/batch` và `POST /tasks/group` **GIỮ NGUYÊN body** (batch item vẫn `regionId` đơn; group vẫn chỉ `pageIds`). Chỉ `POST /tasks` đổi.
- **FE sửa:** form giao việc gửi `regionIds: [...]` thay vì `regionId`. Cho phép chọn nhiều vùng cùng lúc trên 1 trang.

**🔴 BREAKING 2 — `TaskRes`: `regionId` → `regionIds`, embed `region` → `regions[]`**
- Field `regionId` (string|null) **thay bằng** `regionIds` (string[]).
- Embed `region` (object|null, thêm ở entry "2026-07-21 — Page API mở rộng" bên dưới) **thay bằng** `regions` (object[] — mảng RegionRes). Task 1 trang trả đủ vùng đã chọn; task nhóm (nhiều trang) trả `[]`.
- **FE sửa:** đọc `task.regionIds` / `task.regions[]` thay vì `regionId` / `region`. Màn Assistant vẽ **tất cả** khung vùng trong `regions[]`.

**🆕 ADDITIVE — `download-url` phủ ảnh reference (`assetIds`) + `TaskRes.assets[]`**
- `POST /tasks/:id/download-url` nay cho tải cả **ảnh reference Mangaka đính khi giao task** (trước chỉ ảnh trang + version). Vá đúng gap: Assistant trước KHÔNG có đường tải reference.
- `TaskRes` thêm embed **`assets: [{id, filePath, name, assetType}]`** (GET list/detail) = resolve sẵn `assetIds` → object key. **Assistant dùng `assets[].filePath` làm `key`** cho `download-url`. (`assetIds` cũ giữ nguyên.)

---

### 2026-07-21 (bổ sung chiều) — `displayFile`, sửa ảnh trang xuất bản, lọc task theo series/chapter

> Cùng ngày với entry bên dưới. Route inventory **giữ nguyên 261** (chỉ thêm query param + field response).

**🔴 SỬA BUG XUẤT BẢN — độc giả đang thấy bản vẽ THÔ**

`GET /public/chapters/:id/pages` trước đây serve `originalFile` (bản pencil/ink của Mangaka), nên **toàn bộ phần nền / screentone / hiệu ứng do trợ lý làm không bao giờ tới mắt độc giả**. Nay serve `compositeFile ?? originalFile`.

Shape response **không đổi** (vẫn `pages[].imageUrl`) — FE không phải sửa gì; chỉ là ảnh trả về nay đúng bản hoàn chỉnh.

**🆕 ADDITIVE — `PageRes.displayFile`**

Mọi response chứa Page (`GET /chapters/:id/pages`, `POST /chapters/:id/pages`, `PATCH /pages/:pageId`) nay có thêm:

```
displayFile = compositeFile ?? originalFile
```

FE chỉ cần render **một** field này là ra đúng ảnh trong mọi trạng thái, không phải tự viết fallback. `originalFile` và `compositeFile` **giữ nguyên** — code cũ đang đọc `compositeFile` vẫn chạy y hệt, không breaking.

> **Vì sao không gộp 2 cột làm 1:** `originalFile` là *bản gốc* mà AI segmentation phải chạy trên đó và Assistant phải tải về để làm việc; `compositeFile` là *thành phẩm* sau khi ghép việc của trợ lý. Gộp lại thì AI sẽ segment lên ảnh đã có nền, trợ lý thứ hai nhận trang đã bake sẵn việc của người trước, và không có đường quay lại. `displayFile` cho FE sự đơn giản của một field mà không mất hai nguồn đó.

**🔄 ĐIỀU CHỈNH — `PATCH /pages/:pageId` KHÔNG nhận `originalFile`**

Entry trước (sáng cùng ngày) có nói PATCH nhận thêm `originalFile`. **Đã rút lại** vì lý do trên. Body cuối cùng: **`compositeFile` + `pageNumber`**. Gửi `originalFile` → **422** (như trước khi có thay đổi nào). Muốn thay bản gốc: `DELETE /pages/:pageId` rồi `POST /chapters/:id/pages` lại.

**🆕 ADDITIVE — `GET /tasks` lọc theo `seriesId` / `chapterId`, Mangaka không cần `pageId`**

Trước đây Mangaka gọi `GET /tasks` mà thiếu `pageId` thì nhận **rỗng** → muốn xem việc phải lần lượt series → chapter → page. Nay:

- `GET /tasks` → toàn bộ task thuộc mọi series Mangaka sở hữu
- `?assistantId=` · `?seriesId=` · `?chapterId=` · `?pageId=` · `?status=` — kết hợp tự do để lọc dần

`seriesId`/`chapterId` không thuộc mình → **rỗng** (200, `total: 0`), không 403. Assistant vẫn chỉ thấy task của chính mình.

**🆕 Mã lỗi mới — `Error.PageHasApprovedTasks` (409)**

`DELETE /pages/:pageId` và `DELETE /chapters/:id/pages` nay **từ chối** khi trang có task đã `APPROVED`, để không xoá mất công trợ lý đã được duyệt. Đồng bộ với hành vi sẵn có của `DELETE /regions/:id` (`Error.RegionHasApprovedTasks`).


### 2026-07-21 (tối, 2) — Lọc series theo status · TaskRes 2 ảnh · tải file theo task (0 breaking, 3 additive)

> Route inventory **263 → 264** (1 route mới). Nguồn: Swagger runtime + flowtest flow-02/03/04.

**🆕 ADDITIVE 1 — `GET /public/series?status=`**: tách tab "Đang phát hành" (`status=SERIALIZED`) / "Đã hoàn thành" (`status=COMPLETED`) / "Đã huỷ" (`status=CANCELLED`) bằng 1 param. Chỉ nhận trạng thái công khai; giá trị khác → 422; omit = toàn bộ như cũ.

**🆕 ADDITIVE 2 — `TaskRes` thêm `pageOriginalFile` + `pageDisplayFile`** (có ở GET list/detail): màn review lấy đủ **2 ảnh** — nền Mangaka giao (`pageOriginalFile`) + bản Assistant nộp (`versions[latest].file`) — trong 1 response, khỏi join sang page.

**🆕 ADDITIVE 3 — route mới `POST /tasks/:id/download-url`**: ký signed URL cho file **thuộc task** với authz theo quan hệ task. Sửa lỗ hổng: Mangaka trước KHÔNG tải được bản Assistant nộp (403 ở `/uploads/sign-download`), Assistant KHÔNG tải được ảnh gốc trang. FE ở màn review/làm việc **chuyển sang route này** để lấy URL ảnh của task (thay vì `/uploads/sign-download`).

---

### 2026-07-21 (tối) — Auto-renumber trang · dọn R2 khi xoá · siết publish theo trang chưa duyệt (0 breaking, 3 additive)

> 0 route mới (vẫn 263). Nguồn đối chiếu: Swagger runtime + flowtest flow-02 (F02-P23/P24).

**🆕 ADDITIVE 1 — Xoá trang tự dồn số (`DELETE /pages/:pageId` + bulk)**
Sau khi xoá, backend dồn số các trang còn lại về `1..N` liên tục (atomic). `[1,2,3,4]` xoá 3 → `[1,2,3]`. **FE không phải PATCH lại số** — GET lại list là thấy số liền mạch. Nếu FE đang cache số trang thì refetch sau khi xoá.

**🆕 ADDITIVE 2 — Xoá trang dọn luôn file R2**
File gốc + composite của trang được xoá khỏi object storage (best-effort). FE không phải làm gì.

**🆕 ADDITIVE 3 — Publish siết trang chưa duyệt: `Error.PagesNotReadyForPublish` (409)**
`POST /chapters/:id/publish`: nếu bản thảo đã `READY_FOR_PRINT` nhưng còn trang chưa `COMPLETED` (trang thêm sau khi Editor duyệt) → 409. Mục đích: độc giả/Editor chỉ thấy trang đã qua duyệt. Cách gỡ: nộp lại bản thảo cho trang mới được duyệt, hoặc xoá trang thừa. **Không breaking** — chỉ thêm 1 nhánh 409 cho ca dữ liệu bất thường.

---

### 2026-07-21 — Page API mở rộng + siết quyền đọc trang + Assistant lấy được toạ độ vùng (1 breaking, 4 additive)

> Route inventory **259 → 261**. Nguồn đối chiếu: Swagger runtime `GET /api-json` sau khi land.

**🔴 BREAKING — `GET /chapters/:id/pages` nay có scoping theo sở hữu/phân công**

Trước đây route này chỉ yêu cầu đăng nhập, **không kiểm ai đang gọi** ⇒ bất kỳ user nào (Mangaka đối thủ, Assistant của studio khác, Editor không phụ trách) đều đọc được `originalFile` của **mọi chapter** trong hệ thống. Đây là lỗ hổng so với BR-AUTH-00.

Nay quyền là: **MANGAKA chủ series · EDITOR phụ trách · ASSISTANT có `StudioAssignment` ACTIVE với Mangaka đó · BOARD_MEMBER · SUPER_ADMIN**. Ngoài phạm vi → **403 `Error.ChapterAccessDenied`**.

**FE sửa gì:** màn hình nào đang gọi route này phải xử lý nhánh 403 (trước đây luôn 200). Nếu màn đọc trang của Assistant đang hoạt động nhờ route này, Assistant đó phải có `StudioAssignment` ACTIVE — đúng bằng điều kiện đã cần để được giao task (BR-ASSIST-01), nên luồng thật không đổi.

**🆕 ADDITIVE 1 — `TaskRes` nhúng thêm `region` (quan trọng cho màn Assistant)** ⚠️ **ĐÃ THAY** ở entry "2026-07-21 (khuya)" bên trên: `region` (đơn) → **`regions[]`** (mảng). Đọc entry mới nhất.

`GET /tasks` và `GET /tasks/:id` nay trả kèm object `region` đầy đủ toạ độ (`{id, pageId, coordinates{x,y,width,height}, regionType, createdBy, confirmedByMangaka, confidenceScore, detectedSubtype, aiModelVersion}`), `null` nếu task không gắn vùng.

**Vì sao cần:** `TaskRes` trước đây chỉ có `regionId` trần, mà `GET /pages/:id/regions` là MANGAKA/EDITOR-only ⇒ **Assistant không có API hợp lệ nào để biết vùng mình phải làm nằm ở đâu trên trang**. Nay vẽ được khung vùng từ đúng một call, không phải nới quyền route region. Xem §0.10.

**🆕 ADDITIVE 2 — `PATCH /pages/:pageId` nhận thêm `originalFile` và `pageNumber`**

Body `.strict()` trước đây **chỉ** nhận `compositeFile` (gửi `originalFile` → 422). Nay nhận cả 3 field, partial-update (omit/`null` = giữ nguyên). Đổi `pageNumber` sang số đã có trang khác dùng trong cùng chapter → **409 `Error.DuplicatePageNumber`** (mã lỗi mới); gửi lại đúng số hiện tại của chính nó → 200.

**🆕 ADDITIVE 3 — `DELETE /pages/:pageId`**

Xoá một trang, cascade xoá Region + Task của trang trong một transaction; trả `{pageId, deletedRegions, deletedTasks}`. Chỉ xoá được khi Page `DRAFT`/`REVISING` (Page `COMPLETED` → 409 `Error.PageNotEditable`, đúng Spec 19). Trợ lý mất task được notify.

**🆕 ADDITIVE 4 — `DELETE /chapters/:id/pages` (bulk, all-or-nothing)**

Body `{pageIds: string[]}` (1..50). Backend validate toàn bộ trước — một id sai (không tồn tại / thuộc chapter khác / `COMPLETED`) thì **không trang nào bị xoá**. Trả `{deletedPages, deletedRegions, deletedTasks}`.

**Mã lỗi mới cần thêm vào bảng map của FE:** `Error.DuplicatePageNumber` (409). `Error.ChapterAccessDenied` đã tồn tại từ trước nhưng nay xuất hiện thêm ở `GET /chapters/:id/pages`.


### 2026-07-20 — Chuẩn hoá `code` lỗi + payload example (2 breaking, 1 additive)

**🔴 BREAKING 1 — mọi `code` legacy đổi sang `Error.PascalCase`.** FE nào `switch`/`if` theo chuỗi `code`
phải cập nhật. `statusCode`, `message` (tiếng Việt), `errors[]`, `retryAfter` **giữ nguyên** — nếu FE chỉ
hiển thị `message` thì không phải sửa gì.

| Nhóm | Code cũ | Code mới |
|---|---|---|
| Guard 401 | `Unauthorized` | `Error.Unauthorized` |
| Guard 401 | `Access token is required` | `Error.AccessTokenRequired` |
| Guard 401 | `Invalid access token` | `Error.InvalidAccessToken` |
| Guard 403 | `You do not have permission to access this resource` | `Error.ForbiddenResource` |
| Rate-limit 429 | `AUTH_OTP_RATE_LIMITED` | `Error.OtpRateLimited` |
| Rate-limit 429 | `PUBLIC_RATE_LIMITED` | `Error.PublicRateLimited` |
| Rate-limit 429 | `VOTE_OTP_RATE_LIMITED` | `Error.VoteOtpRateLimit` |
| Contract | `CONTRACT_NOT_FOUND` | `Error.ContractNotFound` |
| Contract | `REVENUE_NOT_APPLICABLE` | `Error.RevenueNotApplicable` |
| Contract | `ONLY_ASSIGNED_EDITOR_CAN_EDIT` | `Error.NotAssignedContractEditor` |
| Contract | `INVALID_CONTRACT_STATUS_FOR_THIS_ACTION` | `Error.InvalidContractStatus` |
| Contract | `CONTRACT_ALREADY_SIGNED_BY_THIS_PARTY` | `Error.ContractAlreadySigned` |
| Contract | `BOARD_DECISION_NOT_FOUND` | `Error.ContractBoardDecisionMissing` |
| Contract | `NOT_AUTHORIZED_IN_BOARD` | `Error.NotAuthorizedInBoard` |
| Contract | `BOARD_MEMBER_ALREADY_SIGNED` | `Error.BoardMemberAlreadySigned` |
| Contract | `MangakaSignNotRequired` | `Error.MangakaSignNotRequired` |
| Payment | `PAYMENT_RECORD_NOT_FOUND` | `Error.PaymentRecordNotFound` |
| Payment | `INVALID_STATUS_FOR_APPROVAL_EXPECTED_TRIGGERED` | `Error.PaymentNotApprovable` |
| Payment | `INVALID_STATUS_FOR_PAYMENT_EXPECTED_APPROVED` | `Error.PaymentNotPayable` |
| Payment | `PAYMENT_ALREADY_PAID_CANNOT_CANCEL` | `Error.PaymentAlreadyPaid` |
| Payment | `RECEIVER_USER_NOT_FOUND` | `Error.PaymentReceiverNotFound` |
| Payment | `INVALID_AMOUNT_MUST_BE_GREATER_THAN_0` | `Error.InvalidPaymentAmount` |
| Payment | `PAYMENT_CONDITION_NOT_FOUND` | `Error.PaymentConditionNotFound` |
| Payment | `PAYMENT_CONDITION_NOT_EDITABLE_STATUS_ACHIEVED_OR_MISSED` | `Error.PaymentConditionNotEditable` |
| Payment | `ONLY_ASSIGNED_EDITOR_CAN_MANAGE_PAYMENT_CONDITIONS` | `Error.NotAssignedPaymentEditor` |
| Payment | `INVALID_THRESHOLD_CONFIG` | `Error.InvalidThresholdConfig` |
| Payment | `RECURRING_CHAPTER_REQUIRES_IS_RECURRING_TRUE` | `Error.RecurringChapterRequiresRecurring` |
| Transfer | `NO_ACTIVE_CONTRACT_FOUND_FOR_THIS_SERIES` | `Error.NoActiveContractForSeries` |
| Transfer | `TRANSFER_REQUEST_NOT_FOUND` | `Error.TransferRequestNotFound` |
| Transfer | `INVALID_STATUS_FOR_SCREENING` | `Error.InvalidStatusForScreening` |
| Transfer | `THIS_ACTION_ONLY_APPLIES_TO_FULL_BUYOUT_CONTRACTS` | `Error.OnlyAppliesToFullBuyout` |
| Transfer | `ORIGINAL_CONTRACT_ID_NOT_FOUND` | `Error.OriginalContractNotFound` |
| Transfer | `THIS_ACTION_ONLY_APPLIES_TO_REVENUE_SHARE_CONTRACTS` | `Error.OnlyAppliesToRevenueShare` |
| Transfer | `REQUEST_IS_NOT_IN_NEGOTIATING_STAGE` | `Error.RequestNotInNegotiatingStage` |
| Transfer | `TRANSFER_CONTRACT_NOT_FOUND` | `Error.TransferContractNotFound` |
| Transfer | `USER_OR_EMAIL_NOT_FOUND` | `Error.TransferSignerNotFound` |
| Transfer | `USER_HAS_ALREADY_SIGNED_THIS_CONTRACT` | `Error.TransferAlreadySigned` |
| Transfer | `TRANSFER_CONTRACT_NOT_FOUND_AFTER_UPDATE` | `Error.TransferContractNotFoundAfterUpdate` |
| Transfer | `YOU_ARE_NOT_THE_CO_OWNER_FOR_THIS_CHAPTER` | `Error.NotChapterCoOwner` |
| Transfer | `CHAPTER_APPROVAL_IS_NOT_PENDING` | `Error.ChapterApprovalNotPending` |

**🔴 BREAKING 2 — 429 rate-limit không còn `code` riêng tách khỏi `message`.** Trước đây `message` là
`Error.OtpRateLimited` còn `code` là `AUTH_OTP_RATE_LIMITED` (2 mã cho 1 lỗi). Nay `code` = `Error.OtpRateLimited`.

**✅ ADDITIVE — payload example JSON.** Mỗi route trong guide nay có block **"Ví dụ request body"** +
**"Ví dụ response"** (đã bọc envelope). Lưu ý khi đọc:

- Example **sinh tự động từ Swagger runtime** (`scripts/gen-payload-examples.mjs`) → luôn khớp schema thật, nhưng
  **giá trị chỉ là mẫu**, không phải data thật.
- **Bảng field phía trên vẫn là nguồn chuẩn** về kiểu/enum/bắt buộc. Chỗ nào example ghi `"string"` nghĩa là
  schema khai string tự do (không suy ra được mẫu cụ thể) — đọc bảng để biết ràng buộc.
- Field ngày giờ hiển thị dạng ISO UTC (`2026-07-20T09:30:00.000Z`) — FE tự đổi sang UTC+7 khi render.

**Breaking (v2 → v3):**

| # | Thay đổi | Chi tiết |
|---|---|---|
| 1 | **Tách vai route Name (Spec 12)** | `/series/:id/names/*` giờ CHỈ còn proposal-Name (đọc + lifecycle). Chapter-Name chuyển hết sang `/chapters/:id/names/*` (đủ GET list/detail, request-revision, resubmit, approve, PUT/POST pages, **DELETE mới**). Gọi chapter-Name qua route series → 404 |
| 2 | `GET /series/:id/names` bỏ query `kind` | Gửi `?kind=` → 422 (strict). Thêm phân trang `limit`/`offset` |
| 3 | `NameRes` thêm field `chapterId` | null = proposal-Name; có giá trị = Name của chapter đó |
| 4 | `PaymentRecord` response **bỏ field `userId`** | FE nào đọc field này phải bỏ |
| 5 | Reprint/Board đổi error shape | SCREAMING_SNAKE cũ → chuẩn `Error.PascalCase` toàn hệ |
| 6 | Guest voting đổi field | `phoneNumber` → **`identity`** (email); response ghi `authMethod: EMAIL_OTP` |
| 7 | `POST /chapters` body | `{seriesId, chapterNumber, title?}` — KHÔNG còn `nameId` (chapter-first, Spec 10) |
| 8 | **Manuscript request-revision bắt buộc reason (Spec 14)** | `POST /chapters/:id/manuscript/request-revision` thiếu/rỗng `reason` nay trả 422 (trước đây field optional) |
| 9 | **Chapter-Name sinh ở `DRAFT` (Spec 14 / Option A)** | `POST /chapters/:id/names` nay trả Name `DRAFT` (không còn tự `SUBMITTED`). FE **phải thêm bước** `POST /chapters/:id/names/:nameId/submit` để nộp. Ở `DRAFT` mới sửa được trang (`.../pages`); sau `SUBMITTED` sửa trang → 409. |

**Mới (chưa có trong v2):**

- `GET/PATCH /me` (mọi role — sửa name/displayName/avatar/phone; `''` = xoá displayName/avatar).
- `PUT|GET /me/staff-profile` (EDITOR/BOARD) + `GET /staff/:userId` — hồ sơ nhân sự NXB, khai `specialtyGenres`.
- `GET /board/suggest-members?seriesId=` + `POST /board/sessions` cho phép **bỏ trống `allowedEditorIds`** (kèm `seriesId`) để auto-assign roster theo thể loại.
- `PATCH|DELETE /chapters/:id` · `DELETE /chapters/:id/names/:nameId`.
- `POST /series/:id/propose-completion` / `force-cancel` / `finalize-ending` / `hiatus` / `resume` / `franchise-consent`.
- `POST /series/:id/reopen` / `reopen-review` (Spec 22: nộp lại hồ sơ và re-pitch sau Board reject).
- Toàn bộ BE-B: contracts + amendments + payments, board engine, survey/vote/rankings (2 route public `GET /vote/context`, `GET /vote/results`), reprint, transfer, publication-versions, tankobon + defense-dashboard.
- Notification `referenceType` action-specific (`<ENTITY>_<ACTION>`) — deep-link theo prefix (§0.6).
- Spec 14: `GET /revision-requests`, `PATCH /revision-requests/:id/resolve`, `PATCH /series/:id`, `GET /mangakas`; `GET /assistants` thêm query `q` tìm theo tên.
- Notification review nay có `round`/`version` trong content; Name resubmit phát `NAME_RESUBMITTED`, resolve vòng phát `REVISION_RESOLVED`.
- WS `/board` bắt buộc JWT (v2 chưa có auth contract); origin WS dùng chung whitelist `CORS_ORIGINS` (§0.8).
- **Spec 13 (hạ tầng):** CORS env-driven `CORS_ORIGINS` — origin FE phải được whitelist (§0.8); notification đã chống trùng (không còn bản lặp, §0.9); route auth/OTP thất bại (422/409) **không còn** đốt cooldown → đăng ký lại ngay không dính 429 oan (cooldown default 60s→30s).
- **Option A (Spec 14):** `POST /chapters/:id/names/:nameId/submit` (chapter-Name `DRAFT→SUBMITTED`) — xem breaking #9.
- Swagger: field ngày giờ đã có `format: date-time` (đọc type chính xác từ `/api-json`).
- **Spec 18 — Dashboard role-based (6 route):** `GET /dashboard/mangaka` · `/dashboard/mangaka/earnings` · `/dashboard/assistant` · `/dashboard/editor` · `/dashboard/board` · `/dashboard/admin` — mỗi route đúng 1 role (sai role → 403), tự scope theo token. Route cũ **`/me/dashboard` không còn tồn tại**. `studio`/`productionAlerts` dùng progress theo Task (`pagesReady/pagesPending`).
- **Spec 17 (Board quorum & vote hardening):** luật chốt vote đổi → quorum = `ceil(2/3 × roster phiên)`, APPROVE phải > `1/2 roster` (đa số tuyệt đối; ABSTAIN/vắng = chưa đồng thuận) — xem route vote. Vote lại decision đã chốt → **409 `Error.DecisionAlreadyFinalized`** (FE disable nút vote khi `result ∉ {PENDING, PENDING_QUORUM}`). `GET /board/decisions` thêm query **`targetSeriesId`** (hỏi decision theo series). `GET /board/config` **lazy-seed** (hết 404 trên DB mới). `BoardConfig.quorumMin` giờ chỉ là sĩ số roster mặc định, KHÔNG phải quorum đếm phiếu.
- 4 mã lỗi mới của Spec 14: `Error.RevisionRequestNotFound`, `Error.NotRevisionRecipient`, `Error.SeriesNotEditable`, `Error.SeriesMetadataConflict`. Các mã mới trước đó: `Error.NotEnoughBoardMembers`, `Error.RosterSourceRequired`, `Error.NameNotDeletable`; vote thêm `Error.DuplicateSeriesInVote`, `Error.SeriesNotVotable`; transfer thêm `Error.InvalidOwnershipSplit`; reviews thêm `Error.ProfileNotFound`.

---

*Bản nền sinh + đối chiếu từ Swagger runtime commit `c953e0c` — 2026-07-12; đồng bộ Spec 13 (Infra Hardening: CORS/notification-dedupe/WS) + Spec 14 (Revision/Series-metadata/Directory-search/OTP-rate-limit) + Option A (chapter-Name `DRAFT`+submit) từ schema/controller ngày 2026-07-15 (branch `feat/background_jobs-track`). Khi hoàn tất verify tích hợp, regenerate phần reference để chốt lại route count và Swagger contract toàn hệ.*

### Spec 15 (2026-07-16) — Public Reader & Voting Completion ⚠ FE PHẢI đọc

1. **⚠ BREAKING `POST /vote`:** body bỏ `captchaScore`, thêm **`captchaToken` (required)** — server verify reCAPTCHA thật (Google siteverify) và tự tính score. Thiếu token → 422; token sai/score thấp (khi BE bật `RECAPTCHA_SECRET`) → 403 `Error.CaptchaRejected`. `POST /vote/otp` cũng verify token thật (trước chỉ nhận rồi bỏ qua).
2. **5 route public MỚI (không token, rate-limit IP — 429 `code: PUBLIC_RATE_LIMITED` + `retryAfter`):**
   - `GET /public/series` — catalog (q/genre/demographic/**publicationType**/limit/offset), trả `coverImageUrl` **đã ký sẵn TTL ngắn** + `synopsis` + `publishedChapterCount`.
   - `GET /public/series/:id` — chi tiết + danh sách chapter PUBLISHED. 404 `Error.PublicSeriesNotFound`.
   - `GET /public/chapters/:id/pages` — đọc chapter: pages (imageUrl ký sẵn) + prev/nextChapterId. 404 `Error.PublicChapterNotFound`.
   - `GET /vote/results/latest` — bảng xếp hạng kỳ REFLECTED mới nhất `{period, results[]}`; chưa có kỳ → `{period:null, results:[]}`.
   - `GET /vote/periods?limit=` — lịch sử kỳ REFLECTED (dropdown).
3. **IP vote quota nguyên tử (Spec 15.1):** hết race vượt trần khi 2 request song song; hành vi FE không đổi (vẫn 429 `Error.VoteIpLimitExceeded`).
4. Ảnh public là **signed URL TTL ngắn** (`PUBLIC_SIGN_TTL_SECONDS`, default 900s) — cache theo key+TTL, hết hạn gọi lại API; KHÔNG lưu URL vào state lâu dài.
5. **Spec 15.2 (2026-07-16):** `GET /vote/results` + `GET /vote/results/latest` thêm query optional **`publicationType`** (WEEKLY/MONTHLY/IRREGULAR — bảng xếp hạng con theo nhịp); mỗi `results[]` item thêm field **`publicationType`** (additive, không breaking). `rankPosition` giữ vị trí bảng tổng — FE đánh số bảng con theo index.

### Spec 16 (2026-07-17) — Board Meeting Room & response enrichment

1. **Additive REST routes:** `PATCH /board/sessions/:id/phase` và `GET /board/sessions/:id/messages`; thêm query `mine/status` cho sessions, `boardSessionId` cho decisions, `seriesId/boardDecisionId` cho reports.
2. **Additive response fields:** mọi `BoardSessionRes` có `phase`; hai read routes session có thêm `creator`, `members`; read routes của `BoardDecisionRes` có `targetSeries`; `GET /series` và `GET /series/:id` có `mangaka`, `editor`. Các field enrichment chỉ được bảo đảm ở route read, FE không nên trông chờ chúng trong mutation response.
3. **WebSocket additive:** thêm `sendMessage`, `messageReceived`, `phaseChanged`; chat bị khóa trong phase `VOTING` với reason `VOTING_PHASE`.
4. **Validation chặt hơn:** decision `SERIALIZATION` bắt buộc `details.magazine`, `details.startIssueNumber`, `details.publicationType`.
5. **Mã lỗi mới:** 409 `Error.InvalidPhaseTransition`, 409 `Error.VotingNotOpen`, 403 `Error.NotSessionParticipant`; `Error.BoardSessionNotOpen` giữ status 409.
6. **Tương thích:** không breaking REST về route/field cũ; thay đổi hành vi duy nhất FE Board phải xử lý là vote nay chỉ hợp lệ khi session `ACTIVE` **và** phase `VOTING`. UI creator cần nút chuyển phase trước khi mở biểu quyết.
7. **(polish 2026-07-17) Mã lỗi contract tách đúng ngữ nghĩa — ⚠ FE map lỗi contract cần cập nhật:**
   - **`Error.NotContractMangaka`** (403, path `mangakaId`) — thay `ONLY_ASSIGNED_EDITOR_CAN_EDIT` ở các path SAI-MANGAKA: `PATCH /contracts/:id/status` (nhánh mangaka approve), `POST /contracts/:id/request-changes`, `POST /contracts/:id/signatures/mangaka`, `GET /contracts/:id/status` (mangaka xem HĐ người khác), `POST .../amendments/:id/sign/mangaka`, `POST .../amendments/:id/reject`.
   - **`Error.ContractAccessDenied`** (403, path `id`) — thay `ONLY_ASSIGNED_EDITOR_CAN_EDIT` ở guard XEM hợp đồng/phụ lục ngoài scope: `GET /contracts/:id`, `GET /contracts/:id/versions[/:versionId]`, `GET /contracts/:contractId/amendments[/:id]`.
   - `ONLY_ASSIGNED_EDITOR_CAN_EDIT` **vẫn giữ** cho các path editor-semantic (editor khác sửa/gửi HĐ, tạo/sửa amendment, revenue nhánh editor).

### Spec 17 (2026-07-17) — Board quorum & vote hardening

1. **Luật chốt vote đổi (hành vi):** trước đây do hệ thống thiếu seed `BoardConfig` nên **1 phiếu APPROVE là đủ chốt** (bug prod). Nay: quorum = `ceil(2/3 × số thành viên roster của phiên)`, và APPROVE phải **> `approveMajorityRatio × roster`** (default 0.5 → quá bán tuyệt đối cả roster). Phiếu `ABSTAIN`/vắng làm khó đạt hơn (mẫu số là cả roster). Kết quả: `PENDING_QUORUM` (chưa đủ người) → `PENDING` (đủ người, chưa ngã ngũ) → `APPROVED`/`REJECTED` (khóa cứng khi toán học không thể đổi chiều).
2. **Mã lỗi mới:** 409 `Error.DecisionAlreadyFinalized` — vote lại decision đã `APPROVED`/`REJECTED`/`EXPIRED`. **FE nên disable nút vote khi `result ∉ {PENDING, PENDING_QUORUM}`.**
3. **Additive query:** `GET /board/decisions?targetSeriesId=` — hỏi decision theo series (kết hợp được `boardSessionId`); id rác → `[]`.
4. **`GET /board/config` lazy-seed:** hết 404 trên DB mới (tự tạo default `boardTotalMembers=5, quorumMin=3, ratio=0.5`).
5. **Đổi ngữ nghĩa field:** `BoardConfig.quorumMin` nay = **sĩ số roster mặc định** khi auto-assign phiên, KHÔNG còn là quorum đếm phiếu. FE hiển thị/sửa config cần đổi label.
6. **Tương thích:** không breaking REST route/field. Thay đổi FE Board phải xử lý: đọc `result` để khóa nút vote, và cập nhật hiểu biết "1 phiếu không còn chốt được".

### Spec 18 (2026-07-18) — Role Dashboards ⚠ có 1 breaking

> Mỗi role có **1 endpoint tổng hợp riêng**, thay cho việc FE ghép 4–5 call rời ở màn trang chủ. Route inventory 251 → **257**.

| # | Thay đổi | FE phải đổi |
|---|---|---|
| 1 | 🔴 **Bỏ `GET /me/dashboard`** | Route **không còn tồn tại** (404) — đổi sang `GET /dashboard/mangaka`. Đây là breaking duy nhất của Spec 18. |
| 2 | **6 route mới** `/dashboard/*` | `mangaka` · `mangaka/earnings` · `assistant` · `editor` · `board` · `admin` — mỗi route `@Roles` đúng 1 role, gọi sai role → **403**. Xem API Reference §7. |
| 3 | Scoping tự động | Không cần truyền id: BE tự lọc theo `mangakaId`/`editorId`/`assistantId`/roster Board của chính token. |
| 4 | Tiền tách riêng | Thu nhập Mangaka **không** nằm trong `/dashboard/mangaka` mà ở `/dashboard/mangaka/earnings` (màn tiền mở riêng). |
| 5 | Dùng lại shape cũ | `studio` (Mangaka) và `productionAlerts` (Editor) dùng **đúng `StudioOverviewItem`** của `GET /studio/overview` → tái dùng component, không cần map lại. |

> ⚠️ Các field `pagesReady`/`pagesPending` trong `studio`/`productionAlerts` chịu ảnh hưởng của **Spec 19** bên dưới — đọc tiếp.

### Spec 19 (2026-07-18) — Page Lifecycle Simplification ⚠ FE PHẢI đọc

| # | Breaking | FE phải đổi |
|---|---|---|
| 1 | `PageStatus`: `NOT_STARTED|IN_PROGRESS|COMPOSITE_READY|COMPLETED` → `DRAFT|COMPLETED|REVISING` | Không suy trạng thái từ Task và không tự PATCH status; render đúng 3 badge mới. |
| 2 | `ManuscriptStatus` bỏ `COMPOSITE_REVIEW` | Stepper đi thẳng `IN_PRODUCTION→EDITOR_REVIEW`. |
| 3 | Bỏ endpoint composite-ready; route inventory `257→256` | Xóa call/bước fallback composite; submit trực tiếp khi gate task đạt. |
| 4 | `PATCH /pages/:pageId` bỏ field `status` | Body `.strict()` chỉ nhận **`compositeFile`**. Gửi `status` **hoặc `originalFile`** → 422 (`originalFile` chỉ set lúc `POST /chapters/:id/pages`, không sửa qua PATCH). Ngoài ra page phải ở `DRAFT`/`REVISING`, nếu `COMPLETED` → 409 `Error.PageNotEditable`. |
| 5 | Progress/overview/dashboard đổi field | `GET /chapters/:id/progress`, `GET /studio/overview`, `GET /dashboard/mangaka`: bỏ `pagesCompleted/pagesInProgress/pagesNotStarted`, dùng `pagesReady/pagesPending`; `progressPct` đo theo Task. |
| 6 | Error contract đổi | Bỏ `Error.PagesNotAllCompleted`; thêm 409 `Error.NoPagesToSubmit`, `Error.TasksNotAllApproved`, `Error.RevisionNotResolved`, `Error.PageNotEditable`. |
| 7 | Page `COMPLETED` khóa sửa | Mutation Page/Region/Task/AI trả 409 `Error.PageNotEditable`; UI chuyển editor sang read-only tới khi backend mở `REVISING`. |
| 8 | Resubmit bắt buộc resolve trước | Resolve hết RevisionRequest `MANUSCRIPT` đang mở trước khi gọi resubmit; còn request → 409 `Error.RevisionNotResolved`. |

**Flow backend-driven:** submit bulk `DRAFT→COMPLETED`; Editor request-revision và co-owner reject bulk `COMPLETED→REVISING`; resubmit bulk `REVISING|DRAFT→COMPLETED`. Task approve không còn cascade Page/Manuscript.

### Spec 20 (2026-07-18) — Response Name Enrichment (additive — không breaking)

1. Các response GET của Contract/Payment/Transfer/Reprint/Deadline/Task/Studio/Annotation/Revision được thêm object hiển thị theo bảng §0.10; mọi field ID cũ được giữ nguyên.
2. `UserMini` thống nhất `{id, displayName, avatar}` với fallback `displayName ?? name`; series/chapter dùng mini object chỉ chứa field render cần thiết.
3. Embed được đảm bảo ở read path; mutation path có thể không có embed và FE refetch GET nếu cần. Dữ liệu cũ có ID dangling trả `null` thay vì làm GET thất bại.
4. Lookup giữ tên user soft-deleted để lịch sử vẫn đọc được; thay đổi không thêm/bỏ route, route inventory giữ **256**.

### Spec 21 (2026-07-18) — Vietnamese Messages + stable error `code` (breaking FE)

1. **Envelope lỗi luôn có `code`:** shape chuẩn là `{success:false,statusCode,code,message,errors?}`; các metadata chuyên biệt như `retryAfter` vẫn được giữ nguyên.
2. **`message` đổi semantics:** trước đây thường chứa mã `Error.*`, nay là câu tiếng Việt hiển thị trực tiếp. FE phải phân nhánh bằng `code`, tuyệt đối không so sánh `message`.
3. **Validation 422 đổi contract:** top-level dùng `code: "Error.ValidationFailed"`; từng `errors[].message` đã là tiếng Việt và `errors[].path` vẫn dùng để map field.
4. **Thông báo thành công/nghiệp vụ được Việt hoá:** default success đổi `"Success"` → `"Thành công"`; notification và message module cũng dùng tiếng Việt.
5. **Mã máy giữ tương thích:** toàn bộ `Error.*` giữ nguyên; mã raw BE-B/rate-limit như `AUTH_OTP_RATE_LIMITED` và `PUBLIC_RATE_LIMITED` vẫn là giá trị của `code`. Route/schema nghiệp vụ không đổi, inventory giữ **256**.

### Spec 22 (2026-07-18) — Series Reopen & Re-pitch (additive)

1. **Hai route mới:** `POST /series/:id/reopen` (MANGAKA, không body) và `POST /series/:id/reopen-review` (EDITOR, body `{reason}`); route inventory **256→258**.
2. **Ba trạng thái không còn terminal:** `ABANDONED|WITHDRAWN→DRAFT`; `REJECTED→IN_REVIEW|WITHDRAWN|ABANDONED`. FE bỏ logic ẩn/khóa toàn bộ action chỉ vì gặp ba status này.
3. **UI Mangaka:** ở `ABANDONED`/`WITHDRAWN` hiện **Nộp lại**; ở `REJECTED` hiện lý do Board + **Rút hẳn** và chờ Editor mở rework. Reopen về `DRAFT` sẽ bỏ Editor cũ; sau submit, series quay lại hàng đợi claim.
4. **UI Editor:** ở `REJECTED`, Editor phụ trách hiện **Mở lại chỉnh sửa**, **Bỏ series** và action rút/pitch tương ứng. Reopen-review giữ Editor, đưa proposal về `PROPOSAL_REVISION`; sau approve lại thì pitch và tạo Board Decision mới.
5. **Proposal-Name:** sau reopen-review, Editor có thể yêu cầu `APPROVED→REVISION` chỉ với proposal-Name khi series `IN_REVIEW`; chapter-Name APPROVED vẫn bị khóa. Không thêm enum hay mã lỗi mới; dùng lại `Error.InvalidSeriesTransition`, `Error.NotSeriesOwner`, `Error.NotAssignedEditor`.

### 2026-07-19 — Contract creation gate + Board Decision embed (contract)

1. **`POST /contracts` siết validate** (thêm 4 mã lỗi — FE map thêm): 404 `Error.BoardDecisionNotFound` · 409 `Error.InvalidSerializationDecision` (decision phải là `SERIALIZATION` + `APPROVED` của đúng series) · 409 `Error.ContractMangakaMismatch` (`mangakaId` phải là chủ series) · 409 `Error.OpenContractExists` (series/decision đã có hợp đồng chưa kết thúc). Body **không đổi** (3 field id vốn đã bắt buộc).
2. **`GET /contracts` + `GET /contracts/:id` thêm embed `boardDecision`** `{id, decisionType, result, decidedAt, boardSession{id, title, startTime}}` — FE render "duyệt tại phiên [title] ngày [startTime]" trực tiếp, không cần gọi `/board/decisions`. Additive, field `boardDecisionId` cũ giữ nguyên.

### 2026-07-20 — Contract PDF + `reason` bắt buộc + siết quyền Board + read-cache

> Đợt này có **3 breaking** (mục 1–3) và **2 additive** (mục 4–5). Route inventory **258→259**.

**1. 🔴 BREAKING — `POST /contracts/:id/request-changes` bắt buộc body `{reason}`**

- Trước: gọi không body. Nay: `{ reason: string }` (1–1000 ký tự, schema `.strict()`). Thiếu/rỗng/quá dài/gửi field lạ → **422**.
- Vì sao: Editor nhận thông báo "Mangaka yêu cầu chỉnh sửa" mà không biết **sửa điều khoản nào** → phải hỏi ngoài hệ thống, gãy vòng thương lượng BR-CONTRACT-02.
- Lý do được ghi **2 nơi**: nội dung Notification gửi Editor, và `AuditLog.reason` (tra `GET /audit?entityType=CONTRACT&entityId=:id`). Notification bị đánh dấu đã đọc; audit là bản ghi bền.
- ⚠ Tên field là **`reason`** (đồng bộ với `manuscript/request-revision`, `series/reopen-review`, `DeadlineRequest`), **không phải `note`**. Gửi `note` → 422 vì schema `.strict()`.
- **FE sửa:** thêm ô nhập lý do (textarea, required, maxlength 1000) vào dialog "Yêu cầu chỉnh sửa" ở màn chi tiết hợp đồng.

**2. 🔴 BREAKING — `POST /contracts/:id/board-request-changes` bắt buộc body `{reason}`**

- Y hệt mục 1, phía Hội đồng.
- ⚠ Route này reset **CẢ HAI** chữ ký (`mangakaSignedAt` + `boardSignedAt` → `null`) và đưa HĐ về `NEGOTIATION` — hai bên phải gật lại từ đầu. FE nên có confirm dialog.

**3. 🔴 BREAKING (quyền, không đổi shape) — `board-approve` / `board-request-changes` siết theo roster phiên họp**

- Trước: **bất kỳ** `BOARD_MEMBER` nào trong hệ thống cũng bấm được, kể cả người không dự phiên họp ra quyết định serial hoá cho hợp đồng đó.
- Nay: caller phải nằm trong `contract.boardDecision.boardSession.allowedEditorIds` — **cùng nguồn sự thật** mà bước ký `/signatures/board` vẫn dùng.
- Phân biệt 2 bước (nghiệp vụ **không đổi**): **XEM XÉT** điều khoản = 1 board member trong roster là đủ (đại diện); **KÝ** = toàn bộ roster phải ký mới `FULLY_EXECUTED`.
- Mã lỗi mới: **403 `NOT_AUTHORIZED_IN_BOARD`** (ngoài roster) · **400 `BOARD_DECISION_NOT_FOUND`** (HĐ chưa gắn quyết định Hội đồng).
- ⚠ Guard **authz đứng trước transition** → người ngoài roster luôn nhận 403 kể cả khi HĐ đang ở trạng thái không duyệt được (cố ý — không lộ trạng thái HĐ ra ngoài Hội đồng).
- **FE sửa:** ẩn/disable nút Duyệt và Yêu cầu sửa nếu `currentUser.id` không có trong roster. Roster lấy từ embed `boardDecision.boardSession` ở `GET /contracts/:id` (§0.10).

**4. 🆕 Additive — route mới `GET /contracts/:id/pdf` (258→259 route)**

- Xuất hợp đồng đã ký ra **PDF tiếng Việt**, trả `{ downloadUrl, expiresAt, key }` (presigned GET, mặc định 600s).
- Quyền: EDITOR/MANGAKA/BOARD_MEMBER, cùng luật xem như `GET /contracts/:id`.
- **Chỉ xuất khi `status` ∈ `FULLY_EXECUTED | FULFILLED | TERMINATED | TERMINATED_BY_BREACH | EXPIRED`** — khác → **409 `Error.ContractNotExecutedForPdf`** (mã mới, FE map thêm). Không có bản nháp/watermark.
- **Idempotent theo phiên bản nội dung:** `key = contracts/{id}/contract-v{n}-a{m}.pdf`. Gọi lại → cùng `key`, không render lại. Amendment `FULLY_EXECUTED` → lần gọi sau ra key mới, file cũ giữ làm vết.
- Enum `AssetType` thêm giá trị **`DOCUMENT`** (file hệ thống tự sinh) — FE không tạo loại này qua `POST /uploads/sign`.
- **FE làm:** nút "Tải hợp đồng PDF" ở màn chi tiết HĐ, chỉ hiện khi status hợp lệ → mở `downloadUrl` (đừng gắn header `Authorization` vào URL đã ký).

**5. 🆕 Additive — read-cache nhóm route public/ranking (§0.11)**

- Shape response **không đổi**; dữ liệu có thể trễ tối đa TTL (public 120s · vote-context 60s · ranking 600s · kết quả kỳ đã REFLECTED 3600s) sau hành động ghi, nhưng thường tươi hơn nhiều vì hệ thống chủ động xoá cache theo sự kiện nghiệp vụ.
- Route scope theo user (`/dashboard/*`, `/notifications`, list series đã đăng nhập) **không** cache → luôn tươi.
- ⚠ **Signed URL ảnh không bị cache** — 2 lần gọi cùng route trả URL ảnh khác chuỗi nhau dù nội dung giống hệt. **Đừng dùng URL ảnh làm key so sánh/diff/cache phía FE**, dùng `id`.
- Redis chết → route vẫn 200 (đọc thẳng DB, fail-open).
