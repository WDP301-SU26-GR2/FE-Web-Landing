# §05 — EDITOR (Biên tập viên phụ trách — Tantou)

> 🔴 **2026-08-06 — xem [`08-spec-2026-08-06-magazines-decisions-flows.md`](08-spec-2026-08-06-magazines-decisions-flows.md):** magazine nay **chọn từ `GET /magazines`** (không gõ tay) khi mở quyết định `SERIALIZATION`; `POST /board/decisions` thêm 5 lỗi mới; `DecisionType` còn 8 giá trị; nút **Huỷ HĐ nháp** `POST /contracts/:id/void` (chỉ DRAFT/BOARD_REVIEW).
>
> **Nguồn:** code runtime + `route-roles.ts`; sau Spec 30/31 có đúng **123 route** chứa `RoleCode.EDITOR` trong `allowed[]` (+4 route /series-requests: GET list · GET :id · POST :id/accept · POST :id/reject).
> File này giả định bạn đã đọc `01-conventions-and-auth.md` (envelope, lỗi, phân trang, upload R2 §3, enum dictionary §7, FE env vars). Enum trong bảng field ghi `enum X` — tra giá trị đầy đủ ở đó.

---

## 0. Tổng quan vai trò

Editor (**Tantou** — biên tập viên phụ trách) là trung gian giữa Mangaka và Editorial Board. Theo `Requiment.md` §2.3, ba nhiệm vụ chính:

1. **Review & Feedback trực tiếp** — 2 giai đoạn khác nhau: review **Storyboard** (góp ý flow kể chuyện, bố cục panel, thoại — trước khi Mangaka vẽ chính thức) và **Final Check** trên **Manuscript** hoàn chỉnh (chính tả, đối chiếu Storyboard đã duyệt, quy định xuất bản) — sau khi Mangaka đã tổng hợp bản composite.
2. **Quản lý hồ sơ Series trước Hội đồng** — chuẩn bị hồ sơ **pitch** (series mới) và hồ sơ **bảo vệ** (series đang chạy bị đe doạ huỷ vì ranking thấp) — xem Nhóm A + defense-dashboard.
3. **Theo dõi tiến độ Studio real-time** — dashboard chapter progress (giai đoạn Name, `pagesReady`/`pagesPending`, task breakdown, stage hiện tại, bottleneck, cảnh báo deadline) — xem Nhóm B.

Editor còn giữ vai trò nghiệp vụ khác không nằm trong Proposal gốc nhưng có trong các Flow bổ sung: **soạn thảo hợp đồng** (Flow 6 — trung gian, không tự quyết điều khoản), **khởi tạo/đàm phán chuyển nhượng** (Flow 8), **tạo yêu cầu tái bản** (Flow 7), **tổ chức phiên họp Hội đồng** (board session), và **quản trị kỳ bình chọn độc giả** (Flow 4).

Route được nhóm thành 5 phần, đúng số route xác nhận lại từ `route-roles.ts`:

| Nhóm | Chủ đề | Số route |
|---|---|---|
| A | Series review/claim/lifecycle | 16 |
| B | Chapter/Storyboard/Production + task file download | 18 |
| C | Board session (Editor tổ chức họp) | 17 |
| D | Contract/Payment/Reprint/Transfer/Tankobon | 40 |
| E | Deadline/Survey/Publication/Dashboard/Directory/Reviews/Revision/Annotation/Ranking | 30 |
| **Tổng** | | **121** |

> W1 (2026-08-02): nhóm E +1 route `GET /rankings/internal/aggregate` (aggregate nội bộ giữ risk signal); `GET /survey-periods` thêm filter/phân trang. Editor ROLES-only tổng = **119** (route-roles.ts).

> ⚠ Số đếm nhóm là **route Editor gọi được** (gồm ROLES chứa EDITOR + một số route AUTH); D tăng 35→40 sau §87 (thêm `submit-review`/`redraft`/`comments`, bỏ `PATCH status`). Nguồn chuẩn tuyệt đối vẫn là `route-roles.ts` (tổng hệ thống 277).

> 🔴 **§84 (2026-07-29):** Nhóm E giảm 33 → **29**. 4 route vận hành kỳ bình chọn (`POST /survey-periods`,
> `PATCH /survey-periods/:id/status`, `POST /survey-data/import`, `POST /survey-periods/:id/finalize`) chuyển
> sang **SUPER_ADMIN-only** — Editor gọi → **403**. Quyền ĐỌC survey/ranking giữ nguyên. Xem Narrative Flow 4.

> ⚠️ Task brief gốc liệt kê Nhóm B có 16 route và Nhóm C có 18 route — đối chiếu `route-roles.ts` thực tế: Nhóm B có **17** (thiếu `POST /tasks/:id/download-url`, đã bổ sung ở cuối Nhóm B) và Nhóm C có **17** (không phải 18 — `GET/PATCH /board/config` chỉ 1 route `GET` cho Editor, `PATCH /board/config/:id` là `SUPER_ADMIN` riêng). Xem xác nhận cuối file.

---

## Nhóm A — Series: Review / Claim / Vòng đời (16 route)

### Narrative — Flow 1 (Series Proposal & Serialization)

Mangaka tạo proposal có `storyboardPages[]` embedded → `POST /series/:id/submit` đưa Series vào hàng đợi review chung. Editor bất kỳ:

1. **`POST /series/:id/claim`** — nhận series từ hàng đợi (atomic — 1 người thắng, người sau bị từ chối `Error.SeriesAlreadyClaimed`).
2. **Cửa sổ ân hạn** — trước khi có hành động review đầu tiên (approve/request-revision/reject bất kỳ), Editor còn có thể **`POST /series/:id/release`** để nhả lại hàng đợi. Hành động review đầu tiên set `reviewStartedAt` → khoá nhả vĩnh viễn (`Error.ReviewAlreadyStarted`).
3. Editor review **một vòng proposal duy nhất** (`proposal/request-revision` ↔ `proposal/resubmit`). `proposal/approve` chuyển Series thẳng sang `READY_TO_PITCH`.
4. **`POST /series/:id/pitch`** — gửi lên Board (Series → `PITCHED`), tạo Board Decision `SERIALIZATION` (xem Nhóm C).
5. Board approve → Series `SERIALIZED` (nghe qua listener, không phải route Editor). Board reject → Series `REJECTED`, Editor có thể **`POST /series/:id/reopen-review`** để mở lại vòng sửa (Series `REJECTED` → `IN_REVIEW`, giữ nguyên Editor phụ trách) và pitch lại ở kỳ họp sau.
6. **`POST /series/:id/reject`** — Editor từ chối hẳn concept (không phải yêu cầu sửa) → Series `ABANDONED`.

### Narrative — Flow 5 (Series Lifecycle Decision, phần Editor thực thi quyết định Board)

Board quyết định CANCEL/COMPLETE ở board module → hệ thống tự chuyển Series `CANCELLING`/`COMPLETING` (listener, không phải route Editor gọi trực tiếp). Editor thao tác tiếp:

- **`POST /series/:id/finalize-ending`** — chốt kết thúc: `CANCELLING → CANCELLED` hoặc `COMPLETING → COMPLETED`. Sai trạng thái → `Error.SeriesNotInEndingState`.
- **`POST /series/:id/force-cancel`** — (Req 1.11c) đóng series `CANCELLING` **không có ending** khi Mangaka không thể vẽ chương cuối — chuyển thẳng `CANCELLED`, ghi lý do cố định `forceCancelNoEnding`. Chỉ hợp lệ khi đang `CANCELLING` (`Error.SeriesNotInCancellingState`).
- **`POST /series/:id/hiatus`** / **`POST /series/:id/resume`** — Editor tự quyết tạm ngưng/hoạt động lại (không cần Board): `SERIALIZED ↔ HIATUS`. `hiatus` dừng đồng hồ `TIME_BOUND` payment condition (BR-CONTRACT-07); `resume` dời deadline theo đúng số ms đã tạm ngưng.
- **`POST /series/:id/propose-completion`** — (PB-06, 🔴 **Spec 30: EDITOR-only**, Mangaka gọi → 403) Editor đề xuất kết thúc tự nhiên **mềm**: KHÔNG đổi `status`, chỉ set field `completionProposal` (tác giả nhận notification). Chỉ hợp lệ khi Series `SERIALIZED`/`HIATUS` (`Error.SeriesNotProposableForCompletion`).
- **`/series-requests`** (🆕 Spec 30) — hàng chờ **duyệt yêu cầu của tác giả**: rút hồ sơ (`WITHDRAW`), tạm ngưng (`HIATUS`), kết thúc sớm (`COMPLETION`). Xem §1.6.

### Narrative — Flow 11 (Sequel/Franchise)

Không có route/nhóm riêng — series phái sinh (sequel/spinoff/side-story/reboot của series đã có, vd Dragon Ball → Dragon Ball Super, khác tác giả) chạy lại **nguyên vẹn Flow 1 ở trên** (claim → review → pitch → Board vote) cộng thêm Flow 6 khi ký hợp đồng riêng — không có bước Editor nào khác biệt. Chỉ cần biết 2 field khai báo lúc Mangaka tạo proposal: `parentSeriesId` (ObjectId series gốc) + `relationshipType` (enum `SEQUEL\|SPINOFF\|SIDE_STORY\|REBOOT`), cả 2 hiển thị ở `GET /series/:id` (route #2 trên). Nếu series gốc đang `REVENUE_SHARE`, Mangaka gốc phải đồng ý franchise trước — field `franchiseConsentStatus` (route #2) phản ánh trạng thái đó; gate này chặn ở **route `POST /series/:id/submit` của Mangaka** (`Error.FranchiseConsentRequired`, 409 — không phải route Editor nào), Editor chỉ cần đọc field để biết vì sao 1 proposal phái sinh chưa vào được hàng đợi review. Nếu series gốc `FULL_BUYOUT` thì bỏ qua field này hoàn toàn (Board toàn quyền).

### Narrative — Hồ sơ trước Board (defense-dashboard, proposal aggregate)

`GET /series/:id/defense-dashboard` tổng hợp ranking trend + tankobon + series reports. Trang phác thảo proposal đọc tại `GET /series/:id → proposal.storyboardPages`; không còn route review phác thảo proposal riêng.

### 1. `GET /series` — Danh sách series theo scope

Editor thấy: series mình phụ trách (`editorId = mình`) **+** series đang ở hàng đợi (`status=IN_REVIEW`, `editorId` trống).

**Query:**

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `status` | tuỳ | enum `SeriesStatus` | lọc thêm theo trạng thái |
| `magazine` | tuỳ | string | **MỚI 2026-08-05** — lọc theo tạp chí, khớp tuyệt đối (đã trim) |
| `publicationType` | tuỳ | enum `PublicationType` | **MỚI 2026-08-05** — `WEEKLY`/`MONTHLY`/`IRREGULAR` |
| `limit` | tuỳ | number | mặc định 20, tối đa 100 |
| `offset` | tuỳ | number | mặc định 0 |

**Response** — `{ items: SeriesListItem[], total, limit, offset }`. `SeriesListItem` = `SeriesRes` (xem route #2) bỏ bớt `proposal`/`completionProposal`/`statusReason`/`reviewStartedAt`/`franchiseConsentStatus`/`coOwnerId`/`parentSeriesId`/`relationshipType`/`startIssueNumber`.

Không có lỗi domain (chỉ 401/422 chuẩn).

### 2. `GET /series/:id` — Chi tiết 1 series (kèm proposal)

| Field response | Kiểu/enum | Ghi chú |
|---|---|---|
| `id`, `mangakaId`, `editorId` | string/null | `editorId=null` = đang ở hàng đợi |
| `mangaka`, `editor` | UserMini | thông tin hiển thị |
| `coOwnerId` | string/null | đồng sở hữu sau PARTIAL_TRANSFER |
| `parentSeriesId`, `relationshipType` | string/null, enum `RelationshipType` | franchise (Flow 11) |
| `title`, `coverImage`, `genres[]`, `demographic`, `publicationType` | | `coverImage` = object key R2 |
| `magazine`, `startIssueNumber` | string/null, number/null | Board chọn khi serial hoá; null tới khi `SERIALIZED` |
| `status` | enum `SeriesStatus` | |
| `statusReason` | string/null | lý do lần đổi status gần nhất |
| `franchiseConsentStatus` | enum `FranchiseConsentStatus`/null | gate franchise |
| `reviewStartedAt` | string/null | có giá trị = khoá `release` |
| `completionProposal` | object/null | `{ proposedByRole, proposedById, reason, proposedEndingChapters, proposedAt }` |
| `proposal` | object/null | `{ synopsis, characterDesigns[], storyboardPages[], estimatedLength, status: ProposalStatus, createdAt }` |

**Lỗi:** `Error.SeriesNotFound` (404) · `Error.SeriesAccessDenied` (403 — không phải editor phụ trách và không phải hàng đợi).

### 3. `PATCH /series/:id` — Sửa metadata

Mangaka chủ HOẶC Editor phụ trách đều gọi được (route dùng chung, mỗi role sửa metadata trình bày — KHÔNG đụng field nghiệp vụ Board sở hữu như `magazine`/`genres`/`demographic`).

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `title` | tuỳ | string (1-200) | |
| `coverImage` | tuỳ | string/null | object key R2; `''` = xoá ảnh bìa |
| `synopsis` | tuỳ | string/null (≤5000) | `''` = xoá |
| `characterDesigns` | tuỳ | string[]/null | object key R2; `[]` = xoá hết |

**Lỗi:** `Error.SeriesNotFound` · `Error.SeriesAccessDenied` · `Error.SeriesNotEditable` (409 — series đã kết thúc, xem `SERIES_METADATA_TERMINAL_STATUSES` = COMPLETED/CANCELLED/ABANDONED/WITHDRAWN/REJECTED) · `Error.SeriesMetadataConflict` (409 optimistic conflict).

### 4. `POST /series/:id/claim` — Nhận series từ hàng đợi

Không body. Atomic update — nhiều Editor bấm cùng lúc chỉ 1 người thắng.

**Lỗi:** `Error.SeriesNotFound` (404) · `Error.SeriesAlreadyClaimed` (409 — series đã có editor khác, hoặc chính route thua trong race).

### 5. `POST /series/:id/release` — Nhả lại hàng đợi

Không body. Chỉ hợp lệ **trước** hành động review đầu tiên.

**Lỗi:** `Error.SeriesNotFound` · `Error.NotAssignedEditor` (403 — không phải editor phụ trách series này) · `Error.ReviewAlreadyStarted` (409).

### 6. `POST /series/:id/reject` — Từ chối hẳn concept

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `reason` | ✅ | string (1-1000) | |

→ Series `ABANDONED`, ghi `statusReason`. **Lỗi:** `Error.NotAssignedEditor` · `Error.SeriesNotFound` · `Error.InvalidProposalState` (409).

### 7. `POST /series/:id/proposal/approve` — Duyệt proposal

Không body. → `ProposalStatus.PROPOSAL_APPROVED`; nếu Name mẫu cũng `APPROVED` → Series tự `READY_TO_PITCH`.

**Lỗi:** `Error.NotAssignedEditor` · `Error.SeriesNotFound` · `Error.InvalidProposalState`.

### 8. `POST /series/:id/proposal/request-revision` — Yêu cầu sửa proposal

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `reason` | ✅ | string (1-1000) | |

→ `ProposalStatus.PROPOSAL_REVISION`; set `reviewStartedAt` nếu chưa có (khoá `release`).

**Lỗi:** như route #7.

### 9. `POST /series/:id/reopen-review` — Mở lại vòng sửa sau khi Board từ chối

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `reason` | ✅ | string (1-1000) | |

→ `REJECTED → IN_REVIEW`, giữ nguyên `editorId`. **Lỗi:** `Error.NotAssignedEditor` · `Error.SeriesNotFound` · `Error.InvalidSeriesTransition` (409 — chỉ từ `REJECTED`).

### 10. `POST /series/:id/pitch` — Gửi lên Board

Không body. Chỉ hợp lệ khi `READY_TO_PITCH`. → Series `PITCHED` (tạo Board Decision `SERIALIZATION` là bước riêng ở board module — xem Nhóm C).

**Lỗi:** `Error.NotAssignedEditor` · `Error.SeriesNotFound` · `Error.SeriesNotReadyToPitch` (409).

### 11. `POST /series/:id/hiatus` — Tạm ngưng series

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `reason` | ✅ | string (1-1000) | |
| `expectedReturnDate` | tuỳ | ISO datetime | ngày dự kiến quay lại |

→ `SERIALIZED → HIATUS`. **Lỗi:** `Error.NotAssignedEditor` · `Error.SeriesNotFound` · `Error.InvalidSeriesTransition`.

🆕 **Spec 30 — tạm ngưng nay ĐÓNG BĂNG cả dây chuyền sản xuất** (trước đây chỉ đổi status, chương vẫn chạy và
vẫn bị hối hạn nộp dù tác giả đang nghỉ):

- Backend tự `hold` **mọi chương chưa `PUBLISHED`** của bộ truyện, đánh dấu `ChapterHold.source = SERIES_HIATUS`.
- Chương nào **biên tập viên đã hold tay** từ trước (`source = MANUAL`) thì **giữ nguyên**, không bị đè.
- Cron cảnh báo hạn nộp **bỏ qua** bộ truyện đang `HIATUS` → hết spam.
- **Trợ lý** đang giữ việc chưa xong cũng nhận thông báo `SERIES_HIATUS_STARTED` (trước chỉ báo tác giả + biên tập viên).
- `expectedReturnDate` nay lưu vào field riêng **`Series.hiatusExpectedReturnDate`** (đọc được qua `GET /series/:id`),
  không còn bị nối vào chuỗi `statusReason` như trước.

### 12. `POST /series/:id/resume` — Hoạt động lại

Không body. → `HIATUS → SERIALIZED`, dời deadline `TIME_BOUND` theo đúng số ms đã tạm ngưng.

🆕 **Spec 30 — resume nay còn làm 2 việc:**

- **Gỡ băng** đúng những chương do hiatus đóng (`source = SERIES_HIATUS`); hold `MANUAL` **không bị đụng**.
- **Dời hạn nộp sản xuất** của các chương đó thêm đúng số ms đã tạm ngưng, ghi một `ScheduleExtension`
  (`extended = true`, lý do "Dời hạn nộp bù thời gian bộ truyện tạm ngưng"). Trước đây chỉ dời deadline **tiền**
  (`TIME_BOUND`) mà bỏ quên deadline **sản xuất** — tác giả nghỉ 1 tháng xong quay lại vẫn thấy hạn cũ đã quá.
- Trợ lý nhận thông báo `SERIES_RESUMED`.

**Lỗi:** như route #11.

### 13. `POST /series/:id/force-cancel` — Đóng series huỷ không ending

Không body. Chỉ hợp lệ khi `CANCELLING`.

**Lỗi:** `Error.NotAssignedEditor` · `Error.SeriesNotInCancellingState` (409) · `Error.SeriesNotFound`.

### 14. `POST /series/:id/finalize-ending` — Chốt kết thúc

Không body. Chỉ hợp lệ khi `CANCELLING` (→ `CANCELLED`) hoặc `COMPLETING` (→ `COMPLETED`).

**Lỗi:** `Error.NotAssignedEditor` · `Error.SeriesNotFound` · `Error.SeriesNotInEndingState` (409).

### 15. `POST /series/:id/propose-completion` — Đề xuất kết thúc tự nhiên (PB-06)

🔴 **Spec 30 — nay là route RIÊNG của EDITOR** (trước dùng chung Mangaka/Editor). MANGAKA gọi → **403**.
Đây là kênh **mềm**: biên tập viên thả ý tưởng kết thúc cho tác giả biết, không cần ai duyệt.
Chiều ngược lại — tác giả muốn kết thúc — nay đi kênh **chính thức** `POST /series-requests`
(`requestType=COMPLETION`) và biên tập viên phải duyệt (§1.6).

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `reason` | ✅ | string (1-1000) | |
| `proposedEndingChapters` | tuỳ | number int dương/null | số chương kết thúc dự kiến |

→ KHÔNG đổi `status`; chỉ set `completionProposal`. **Tác giả** nhận notification `SERIES_COMPLETION_PROPOSED`.

---

### 1.6. Duyệt yêu cầu của tác giả — `/series-requests` (Spec 30) ⭐ MỚI

Tác giả gửi yêu cầu **rút hồ sơ / tạm ngưng / kết thúc sớm** kèm lý do; **biên tập viên phụ trách** quyết.
Chỉ đúng biên tập viên đang phụ trách bộ truyện (`series.editorId === userId`) mới duyệt được — người khác **403**.

**Chấp nhận từng loại dẫn tới hệ quả KHÁC NHAU — đọc kỹ trước khi làm UI:**

| `requestType` | Bấm "Chấp nhận" thì backend làm gì | Biên tập viên còn phải làm gì nữa |
|---|---|---|
| `WITHDRAW` | Bộ truyện → `WITHDRAWN` **ngay** | Xong |
| `HIATUS` | Bộ truyện → `HIATUS` **ngay** + đóng băng chương (xem #11) | Xong — **không cần Hội đồng** |
| `COMPLETION` | ⚠️ **KHÔNG đổi trạng thái bộ truyện.** Chỉ ghi nhận đã đồng ý | **Phải** mở phiên Hội đồng: `POST /board/reports` → `POST /board/decisions` (`decisionType=COMPLETION`) → `POST /board/sessions`. Hội đồng duyệt xong bộ truyện mới `COMPLETING → COMPLETED` |

> 🔑 Lý do bất đối xứng: tạm ngưng **đảo ngược được**, không sửa điều khoản hợp đồng, giữ chỗ trên tạp chí → biên tập viên
> tự quyết. Kết thúc là **vĩnh viễn**, kéo theo sửa hợp đồng (`ContractAmendmentRequested`) và **trả slot** tạp chí
> (Hội đồng phải xếp bộ truyện thay thế) → bắt buộc qua Hội đồng.

#### `GET /series-requests` — hàng chờ duyệt

Query: `seriesId?` · `status?` · `requestType?` · `limit` (1–100, default 20) · `offset`.
Phạm vi biên tập viên = yêu cầu thuộc các bộ truyện mình phụ trách. Response `{ items, total, limit, offset }`.
**Gợi ý UI:** lọc `status=PENDING` làm badge "cần xử lý".

#### `POST /series-requests/:id/accept` — chấp nhận

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `note` | tuỳ | string (≤1000) | Ghi chú gửi kèm cho tác giả |
| `expectedReturnDate` | tuỳ | string ISO 8601 | **Chỉ HIATUS** — ghi đè ngày tác giả xin (vd tác giả xin nghỉ 3 tháng, biên tập viên duyệt 1 tháng). Bỏ trống = giữ ngày tác giả xin |

Response 201 `SeriesRequestRes`. Lỗi: `Error.SeriesRequestAccessDenied` (403 — không phải biên tập viên phụ trách) ·
`Error.SeriesRequestNotAllowed` (409 — trạng thái bộ truyện đã đổi trong lúc yêu cầu treo, **kiểm lại lúc duyệt**) ·
`Error.InvalidSeriesRequestTransition` (409 — đã xử lý rồi) · `Error.SeriesRequestNotFound` (404).

#### `POST /series-requests/:id/reject` — từ chối

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `reason` | ✅ | string (1–1000) | **Bắt buộc.** Thiếu → 422 |

Bộ truyện **giữ nguyên trạng thái**. Tác giả nhận thông báo `SERIES_REQUEST_REJECTED` **kèm lý do**.

> 💡 Lý do bắt buộc nêu lý do: tác giả đang xin nghỉ vì kiệt sức/sức khoẻ mà bị từ chối cụt lủn thì rất tệ.
> FE nên bắt buộc nhập ở form, đừng để người dùng chạm 422.

**Lỗi:** `Error.SeriesAccessDenied` (403 — không phải Mangaka chủ/Editor phụ trách) · `Error.SeriesNotProposableForCompletion` (409 — chỉ `SERIALIZED`/`HIATUS`) · `Error.SeriesNotFound`.

### 16. `GET /series/:id/defense-dashboard` — Dashboard bảo vệ series

Editor phụ trách HOẶC Board/Admin. (Route thực tế nằm ở module `tankobon`, path `series/:id/defense-dashboard`.)

**Response:**

| Field | Kiểu | Ghi chú |
|---|---|---|
| `seriesId` | string | |
| `rankingTrend[]` | array | mỗi item: `surveyPeriodId, rankPosition, voteCount, previousRank, rankChange, isAtRisk, riskLevel (enum RiskLevel), recordedAt` — 12 kỳ gần nhất |
| `tankobon.totalUnitsSold` | number | |
| `tankobon.volumes[]` | array | `{ volumeNumber, unitsSold, period }` |
| `seriesReports[]` | array | `{ id, reportType, content, createdAt }` — báo cáo Editor đã nộp cho Board |
| `serialization.serializedSince` | string/null | ISO thời điểm chuyển `SERIALIZED` |
| `serialization.chaptersPublished` | number | |

**Lỗi:** `Error.SeriesNotFound` (404, path `seriesId`) · `Error.DefenseDashboardAccessDenied` (403 — không phải editor phụ trách/board/admin).

### Proposal storyboard pages (Spec 28)

Các route `/series/:id/names/*` đã xoá. Editor đọc `proposal.storyboardPages` trong `GET /series/:id` và review toàn bộ hồ sơ qua `proposal/request-revision` hoặc `proposal/approve`.

---

## Nhóm B — Chapter / Storyboard / Production (18 route)

### Narrative — Flow 2 (Chapter Production, phần Editor)

Chapter-first: Mangaka tạo Chapter slot (`chapterNumber` + `title`) → `Manuscript(DRAFT)` + `Schedule` khởi tạo cùng lúc. Editor **đặt deadline ngay** (`PUT /chapters/:id/schedule`).

Mangaka tạo Storyboard (`POST /chapters/:id/storyboards`) → Editor review vòng 2 (giai đoạn 1 theo Requiment §2.3a): `POST /storyboards/:id/request-revision` ↔ Mangaka `POST /storyboards/:id/resubmit`, loop tới `POST /storyboards/:id/approve` → mở gate cho Mangaka upload page (penciling).

Production stage chạy qua (module `task`, phần lớn route Mangaka/Assistant) — Editor chỉ **đọc** tiến độ: `GET /chapters/:id/progress` (dashboard cảnh báo — xem bảng ngưỡng dưới), `GET /chapters/:id/stages` (danh sách stage + analytics + bottleneck), `GET /chapters/:id/stages/:stageId/pages` (input/output snapshot), `GET /chapters/:id/pages`, `GET /pages/:id/regions`.

Khi Mangaka `POST /chapters/:id/manuscript/submit` → Manuscript `EDITOR_REVIEW` — đây là **giai đoạn 2 (Final Check)** theo Requiment §2.3a: Editor kiểm chính tả, đối chiếu Name đã duyệt, quy định xuất bản.

- **`POST /chapters/:id/manuscript/approve`** → `READY_FOR_PRINT`.
- **`POST /chapters/:id/manuscript/request-revision`** → `EDITOR_REVISION` (kèm tạo `RevisionRequest`, Mangaka phải resolve hết trước khi resubmit).

`READY_FOR_PRINT` → **`POST /chapters/:id/publish`** → `PUBLISHED` (chặn nếu series chưa có `Contract.FULLY_EXECUTED` — BR-CONTRACT-05 — hoặc còn trang chưa `COMPLETED`).

### Narrative — Nhánh ngoại lệ (hold/resume, deadline)

- **`POST /chapters/:id/hold`** — Editor tạm dừng sản xuất (Mangaka ốm, lấy tư liệu...). Set `Chapter.hold` (composite, KHÔNG có `ChapterStatus.ON_HOLD` riêng) + đẩy vào `holdHistory[]`. Không tạo được task/complete stage/submit manuscript khi đang hold.
- **`POST /chapters/:id/resume`** — Chapter trở về trạng thái sản xuất trước đó.
- **`PATCH /chapters/:id/schedule/extend`** — Editor thương lượng gia hạn deadline (đơn phương, khi KHÔNG bất đồng/không ảnh hưởng slot). Nếu gia hạn đơn phương vẫn không đủ hoặc hai bên bất đồng → đây KHÔNG còn là route này nữa, phải chuyển sang cơ chế `DeadlineRequest` đầy đủ (`POST /deadline-requests` → loop `counter`/`reject` → `ESCALATED`/`BOARD_REVIEW` → Board `board-resolve`) — xem **Flow 10 chi tiết ở Nhóm E** (§Narrative Flow 10). Route `extend` này và luồng `DeadlineRequest` là **2 cơ chế riêng biệt trên cùng `Schedule`**, không tự động nối tiếp nhau — FE phải tự điều hướng "gia hạn đơn giản" (route này) vs "có tranh chấp/leo thang" (module `deadline`) tuỳ tình huống.
- **Storyboard lặp quá ngưỡng cảnh báo (`AppConfig.storyboardMaxReviewRounds`, mặc định 8, PATCH được qua `07-super-admin.md`):** không có route/field API riêng — cảnh báo tới bằng **notification** khi Mangaka resubmit Storyboard lần thứ N ≥ ngưỡng: `NotificationType.REVIEW`, `referenceType: 'STORYBOARD_LOOP_WARNING'`, `referenceId` = storyboard id. FE đọc qua `GET /notifications` (xem `01-conventions-and-auth.md`) như mọi notification khác; không có endpoint cảnh báo loop hay cơ chế tự leo thang Board riêng.

### Ngưỡng cảnh báo `WarningLevel` (đọc ở `GET /chapters/:id/progress`, tính runtime — KHÔNG lưu DB)

| `publicationType` | `YELLOW` | `RED` | `CRITICAL` |
|---|---|---|---|
| `WEEKLY` | còn ≤48h & progress < 70% | còn ≤24h & progress < 90% | quá deadline |
| `MONTHLY`/`IRREGULAR` | còn ≤120h & progress < 60% | còn ≤48h & progress < 85% | quá deadline |

### 1. `POST /chapters/:id/hold` — Tạm dừng sản xuất

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `reason` | ✅ | string (≥1) | |
| `expectedReturnDate` | tuỳ | ISO datetime | |

**Response** = `ChapterRes` (xem bảng field ở route #7 Nhóm A tương tự — thực ra định nghĩa ở đây): `id, seriesId, storyboardId, chapterNumber, title, totalPages, status (ChapterStatus), publishedAt, hold {reason, expectedReturnDate, heldBy, heldAt}/null, manuscriptStatus (ManuscriptStatus)/null, schedule {id, chapterId, originalDeadline, currentDeadline, extended, extensions[]}/null`.

**Lỗi:** `Error.ChapterNotFound` · `Error.NotSeriesEditor` (403) · `Error.ChapterNotHoldable` (409) · `Error.ChapterAlreadyOnHold` (409).

### 2. `POST /chapters/:id/resume` — Tiếp tục sản xuất

Không body. Response = `ChapterRes`. **Lỗi:** `Error.ChapterNotFound` · `Error.NotSeriesEditor` · `Error.ChapterNotOnHold` (409).

### 3. `POST /chapters/:id/publish` — Xuất bản chapter

Không body. Chỉ hợp lệ khi Manuscript `READY_FOR_PRINT` và mọi Page đã `COMPLETED`; series phải có `Contract.FULLY_EXECUTED`.

⚠️ **Flow 8 (Transfer) — PARTIAL_TRANSFER co-owner gate, cùng route này, KHÔNG có tham số bật/tắt.** Nếu `Series.coOwnerId` có giá trị (sau `PARTIAL_TRANSFER`, xem `06-board-member.md` §5.2), route publish **tự động** chuyển Manuscript sang `AWAITING_CO_OWNER_APPROVAL` thay vì thẳng `PUBLISHED` (`chapter-publish.service.ts`) — response vẫn 2xx nhưng `manuscript.status` KHÔNG phải `PUBLISHED`, chapter thật sự lên sóng chỉ sau khi Mangaka A (co-owner) gọi `POST /chapters/:id/co-owner-approve` (route Mangaka, xem `03-mangaka.md`). Editor cần đọc lại `manuscript.status` sau khi gọi route này để biết publish đã xong hay đang chờ co-owner; nếu A không phản hồi quá N ngày (`AppConfig.coOwnerApprovalGraceDays`), cron tự đánh dấu `ESCALATED` + báo Board — Editor **không có route** để tự đẩy nhanh bước này (xem ghi chú tương tự ở `06-board-member.md` §5.2).

**Lỗi:** `Error.NotSeriesEditor` · `Error.ChapterNotFound` · `Error.InvalidManuscriptTransition` (409) · `Error.ContractNotExecuted` (409 — BR-CONTRACT-05) · `Error.ChapterOnHold` (409) · `Error.PagesNotReadyForPublish` (409).

### 4. `PUT /chapters/:id/schedule` — Đặt deadline

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `originalDeadline` | tuỳ | ISO datetime | mốc gốc |
| `currentDeadline` | tuỳ | ISO datetime | mốc hiện tại |

**Lỗi:** `Error.NotSeriesEditor` · `Error.ChapterNotFound`.

### 5. `PATCH /chapters/:id/schedule/extend` — Gia hạn deadline

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `newDeadline` | ✅ | ISO datetime | |
| `reason` | tuỳ | string (≤1000) | |

→ tạo `ScheduleExtension {extendedBy, previousDeadline, newDeadline, reason, extendedAt}` trong `schedule.extensions[]`, set `extended=true`.

**Lỗi:** `Error.NotSeriesEditor` · `Error.ChapterNotFound`.

### 6. `GET /chapters/:id/storyboards` — List Storyboard của chapter

Response `{items: StoryboardRes[]}`; Storyboard luôn thuộc chapter và không còn `kind/chapterNumber`.

### 7. `GET /chapters/:id/storyboards/:storyboardId` — Chi tiết Storyboard

Lỗi: `Error.ChapterNotFound` · `Error.SeriesAccessDenied` · `Error.StoryboardNotFound`.

### 8. `POST /chapters/:id/storyboards/:storyboardId/approve` — Duyệt Storyboard chapter

Không body. → `APPROVED`, emit `storyboard.approved`, seed ProductionStage và mở gate upload page.

### 9. `POST /chapters/:id/storyboards/:storyboardId/request-revision` — Yêu cầu sửa Storyboard

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `reason` | ✅ | string (1-1000) | |

**Lỗi:** `Error.NotAssignedEditor` · `Error.StoryboardNotFound` · `Error.InvalidStoryboardState`.

### 10. `GET /chapters/:id/pages` — List trang của chapter

Editor phụ trách (cùng route với Mangaka/Assistant/Board/Admin, scope theo quyền sở hữu/phân công).

**Response** — `{ items: PageRes[] }`. `PageRes`: `id, chapterId, pageNumber, originalFile (object key/null), compositeFile (object key/null), compositeRevision, canvasWidth/canvasHeight (int/null), displayFile (= compositeFile ?? originalFile), status (PageStatus), createdAt`.

**Lỗi:** `Error.ChapterNotFound` · `Error.ChapterAccessDenied`.

### 11. `GET /chapters/:id/progress` — Dashboard tiến độ chapter

**Response:**

| Field | Kiểu | Ghi chú |
|---|---|---|
| `chapterId` | string | |
| `storyboardStatus` | enum `StoryboardStatus`/null | null = chapter chưa có Storyboard |
| `totalPages`, `pagesReady`, `pagesPending` | number | `pagesReady` = trang hết task mở |
| `taskBreakdown` | object | `{assigned, inProgress, submitted, underReview, approved, revisionRequested, onHold, cancelled}` |
| `deadline` | string/null | |
| `remainingHours` | number/null | |
| `progressPct` | number | = `pagesReady/totalPages`; = 1 khi bản thảo đã rời tay Mangaka (đang/qua duyệt Editor, chờ co-owner, hoặc đã publish) |
| `warningLevel` | enum `WarningLevel` (read-only, tính runtime) | xem bảng ngưỡng ở trên |
| `onHold` | boolean | |
| `currentStage` | object/null | `{id, name, order, status: ProductionStageStatus}` |

**Lỗi:** `Error.ChapterNotFound` · `Error.ChapterAccessDenied`.

### 12. `GET /chapters/:id/stages` — Danh sách stage sản xuất + analytics

**Response:**

| Field | Kiểu | Ghi chú |
|---|---|---|
| `stages[]` | array | mỗi stage: `id, chapterId, order, name, taskTypes[] (enum Specialization), isFinalCheck, status (ProductionStageStatus), deadline, startedAt, completedAt, analytics, warnings[]?` |
| `analytics` | object | `{taskCount, approvedCount, openCount, totalTaskDurationMs, avgTaskDurationMs, lateTaskCount, stageDurationMs, longestTask {taskId, taskType, assistantId, durationMs}/null}` |
| `currentStage` | object/null | `{id, name, order}` |
| `bottleneckStage` | object/null | `{stageId, name, stageDurationMs}` — stage tốn thời gian nhất |

**Lỗi:** `Error.StageAccessDenied`.

> 🔴 **Trạng thái stage nay ĐI LÙI ĐƯỢC (Spec 26, 2026-07-28).** Sau khi Editor gọi `request-revision`, Mangaka có
> quyền **mở lại** một stage đã xong (`POST /chapters/:id/stages/:stageId/reopen`, chỉ Mangaka). Khi đó:
> `COMPLETED → ACTIVE` cho stage được mở, và **mọi stage phía sau về `LOCKED`**.
>
> Hệ quả cho UI Editor:
> - **Đừng giả định `status` chỉ tiến một chiều**, đừng cache trạng thái stage qua các lần poll.
> - `completedAt` của stage vừa mở lại quay về `null`; `startedAt` được đặt lại ⇒ `analytics.stageDurationMs`
>   đếm lại từ đầu cho **vòng sửa hiện tại**, không phải tổng thời gian tích luỹ. Nếu màn hình có biểu đồ tiến độ
>   thì nên ghi nhãn "vòng sửa hiện tại" để khỏi gây hiểu nhầm là dữ liệu bị mất.
> - `bottleneckStage` cũng tính lại theo đó.
> - Editor **không** có route mở lại (403); đây thuần tuý là thay đổi hiển thị.

### 13. `GET /chapters/:id/stages/:stageId/pages` — Input/output snapshot của stage

**Response** — `{ items: StagePageRes[] }`. `StagePageRes`: `stageId, pageId, inputSourceType (enum AiSegmentSource), inputFileKey, inputRevision, outputSourceType (enum AiSegmentSource)/null, outputFileKey/null, outputRevision/null, outputConfirmedAt/null, outputConfirmedBy/null, outputReady (boolean)`.

**Lỗi:** `Error.StageAccessDenied` · `Error.StageNotFound`.

### 14. `POST /chapters/:id/manuscript/approve` — Duyệt manuscript (Final Check OK)

Không body. → `READY_FOR_PRINT`.

**Lỗi:** `Error.NotSeriesEditor` · `Error.ChapterNotFound` · `Error.InvalidManuscriptTransition` · `Error.ChapterOnHold`.

### 15. `POST /chapters/:id/manuscript/request-revision` — Yêu cầu sửa manuscript

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `reason` | ✅ | string (1-1000) | bắt buộc — Mangaka phải biết sửa gì |

→ `EDITOR_REVISION`; bulk `Page COMPLETED → REVISING`; mở `RevisionRequest` (targetType `MANUSCRIPT`).

**Lỗi:** `Error.NotSeriesEditor` · `Error.ChapterNotFound` · `Error.InvalidManuscriptTransition` (409) · `Error.ChapterOnHold` · `Error.NoPagesToSubmit` (409) · `Error.TasksNotAllApproved` (409) · `Error.RevisionNotResolved` (409 — vẫn còn `RevisionRequest` mở khác).

### 16. `GET /pages/:id/regions` — Danh sách vùng của 1 trang

Editor xem vùng Mangaka đã khoanh (Region — dùng để giao task cho Assistant, xem chi tiết ở `03-mangaka.md`/`04-assistant.md`).

**Response** — `{ items: RegionRes[] }`. `RegionRes`: `id, pageId, coordinates/null, regionType (enum RegionType)/null, createdBy ("MANUAL"|"AI")/null, confirmedByMangaka (boolean), confidenceScore (number/null — null khi MANUAL), detectedSubtype (string/null), aiModelVersion (string/null)`.

**Lỗi:** `Error.PageNotFound` · `Error.NotSeriesOwner` (403 — thực ra route này scope theo series, guard tên là owner nhưng áp dụng cho cả Editor phụ trách qua service).

### 17. `POST /tasks/:id/download-url` — Ký URL tải file của task

*(Không nằm trong danh sách gợi ý ban đầu của task brief — xác nhận có thật trong `route-roles.ts`, thuộc production tracking nên đặt ở đây.)* Editor (cùng Mangaka/Assistant/Board/Admin) ký signed URL tải ảnh gốc trang hoặc file version Assistant đã nộp, khi `/uploads/sign-download` (uploader-only, xem 01 §3) không phủ được quan hệ này.

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `key` | ✅ | string | object key — PHẢI thuộc task (ảnh gốc/composite trang, file version, hoặc asset tham khảo) |

**Response:** `{ downloadUrl, expiresAt }` (giống `/uploads/sign-download`, presigned GET có hạn).

**Lỗi:** `Error.TaskNotFound` (404) · `Error.TaskFileForbidden` (403, path `key` — key không thuộc task hoặc role không có quan hệ với task).

---

## Nhóm C — Board Session (17 route)

### Narrative — Editor là người tổ chức phòng họp

Theo Flow 1/5, sau khi Editor pitch series hoặc khi có series nguy cơ (Flow 4/5), Editor **tạo phiên họp** Hội đồng:

1. **`GET /board/suggest-members`** — gợi ý roster theo thể loại series (PB-05, luôn số lẻ ≥3).
2. **`POST /board/sessions`** — tạo `BoardSession` (`status=UPCOMING`), roster `allowedEditorIds` (tự động theo `seriesId` nếu không truyền tay).
3. **`PATCH /board/sessions/:id/start`** — kích hoạt → `ACTIVE`.
4. Trong phiên: **`POST /board/decisions`** (Editor tạo quyết định nháp — `PENDING`), `PATCH /board/sessions/:id/phase` chuyển `PRESENTING → QA → VOTING` (forward-only, được nhảy cóc — chỉ creator/SUPER_ADMIN).
5. Thảo luận Q&A qua chat **WebSocket namespace `/board`** (xem dưới) — ghi lại lịch sử bằng `GET /board/sessions/:id/messages`.
6. Board Member (và Editor — route `vote` cho phép cả `BOARD_MEMBER, EDITOR`) **`POST /board/decisions/:id/vote`** khi phase `VOTING`.
7. **`PATCH /board/sessions/:id/conclude`** — Editor (creator) kết thúc phiên → `CONCLUDED`; mọi Decision chưa đủ quorum tự động `EXPIRED` (phải mở phiên mới để vote lại).
8. **`POST /board/reports`** — Editor soạn báo cáo phân tích series đính kèm phiên họp (dùng cho pitch/bảo vệ — bổ trợ `defense-dashboard` ở Nhóm A).

### WebSocket `/board` (Socket.IO namespace `board`)

- Auth: JWT truyền qua `handshake.auth.token` hoặc header `Authorization: Bearer` lúc connect — sai/thiếu → server disconnect ngay.
- Client emit `joinSession({ sessionId })` → server join room `session_<sessionId>` nếu `userId` là creator/roster/`SUPER_ADMIN`, trả `{status: 'SUCCESS'|'DENIED', message?}`.
- Client emit `sendMessage({ sessionId, content })` → server ghi `BoardMessage` (gắn `phase` hiện tại) rồi broadcast `messageReceived` cho cả room.
- Server tự broadcast: `phaseChanged({sessionId, phase})` khi `PATCH /board/sessions/:id/phase` được gọi; `voteProgressUpdated({decisionId, approveCount, rejectCount, totalVotes, quorumMet, result})` sau mỗi `POST /board/decisions/:id/vote` (lỗi socket không làm vote 500 — best-effort).

### 1-2. `GET/POST /board/sessions` — Danh sách / Tạo phiên họp

**POST body:**

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `title` | ✅ | string (5-100) | phải chưa có phiên trùng title đang mở |
| `startTime` | ✅ | ISO datetime | phải ở tương lai |
| `endTime` | tuỳ | ISO datetime | phải sau `startTime`; bỏ trống = chỉ kết thúc thủ công |
| `description` | tuỳ | string (≤500) | |
| `allowedEditorIds` | tuỳ | string[] (≥3) | bỏ trống → tự phân công theo `seriesId` |
| `seriesId` | tuỳ | ObjectId | **bắt buộc** nếu bỏ `allowedEditorIds` |
| `rosterSize` | tuỳ | number int (≥3) | mặc định `BoardConfig.quorumMin` (5, cấu hình default) |

Roster length **phải lẻ** (chống hoà phiếu).

**GET query:** `mine` ('true'/'false' — chỉ phiên mình là creator/roster), `status` (enum `BoardSessionStatus`).

**Response `BoardSessionRes`:** `id, title, description, creatorId, status (BoardSessionStatus), phase (BoardSessionPhase), creator (UserMini), members (UserMini[]), allowedEditorIds[], startTime, endTime/null, createdAt, updatedAt`. List item bỏ `members`/`allowedEditorIds`/`description`.

**Lỗi POST:** `Error.BoardSessionAlreadyExists` (409) · `Error.InvalidBoardMembers` (422 — roster chẵn/rỗng) · `Error.RosterSourceRequired` (422 — thiếu cả `allowedEditorIds` lẫn `seriesId`) · `Error.NotEnoughBoardMembers` (422) · `Error.RosterSizeTooLarge` (422 — vượt `BOARD_ROSTER_HARD_MAX`=9) · `Error.SeriesNotFound` (404).

### 3. `GET /board/sessions/:id` — Chi tiết phiên họp

**Lỗi:** `Error.BoardSessionNotFound`.

### 4. `PATCH /board/sessions/:id/start` — Kích hoạt phiên họp

Không body. → `UPCOMING → ACTIVE`.

**Lỗi:** `Error.BoardSessionNotFound` · `Error.BoardSessionNotOpen` (409) · `Error.InvalidBoardSessionTransition` (409).

### 5. `PATCH /board/sessions/:id/conclude` — Kết thúc phiên họp

Không body. Chỉ creator hoặc `SUPER_ADMIN`. → `CONCLUDED`; Decision chưa quorum → `EXPIRED`.

**Lỗi:** `Error.BoardSessionNotFound` · `Error.NotSessionCreator` (403) · `Error.InvalidBoardSessionTransition`.

### 6. `PATCH /board/sessions/:id/phase` — Chuyển phase

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `phase` | ✅ | enum `BoardSessionPhase` | forward-only (`PRESENTING → QA → VOTING`), cho phép nhảy cóc, không lùi được |

Chỉ creator/`SUPER_ADMIN`. Broadcast WS `phaseChanged`.

**Lỗi:** `Error.BoardSessionNotFound` · `Error.NotSessionCreator` · `Error.BoardSessionNotOpen` · `Error.InvalidPhaseTransition` (409 — lùi phase).

### 7. `GET /board/sessions/:id/messages` — Lịch sử chat Q&A

Query: `limit` (mặc định 50, tối đa 200), `offset`. Chỉ creator/roster/`SUPER_ADMIN`.

**Response** — `{ items: BoardMessageRes[], total }`. `BoardMessageRes`: `id, sessionId, sender (UserMini), content, phase (BoardSessionPhase — phase lúc gửi), createdAt`.

**Lỗi:** `Error.BoardSessionNotFound` · `Error.NotSessionParticipant` (403).

### 8. `GET /board/suggest-members` — Gợi ý roster theo thể loại

Query: `seriesId` (ObjectId, bắt buộc), `size` (tuỳ, ≥3).

**Response:** `{ items: [{userId, displayName, avatar, specialtyGenres[] (Genre), matchedGenres[] (Genre — giao với thể loại series), score (number), hasProfile}], size (luôn lẻ ≥3) }`.

**Lỗi:** `Error.SeriesNotFound` · `Error.NotEnoughBoardMembers` · `Error.RosterSizeTooLarge`.

### 9-10. `GET/POST /board/decisions` — Danh sách / Tạo quyết định

**POST body** (Editor tạo nháp `PENDING`):

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `boardSessionId` | ✅ | string | |
| `decisionType` | ✅ | enum `DecisionType` | |
| `targetSeriesId` | tuỳ | string/null | |
| `details` | tuỳ | JSON | shape phụ thuộc `decisionType`: `SERIALIZATION` bắt buộc `{magazine (string), startIssueNumber (int>0), publicationType (WEEKLY\|MONTHLY\|IRREGULAR)}`; `CANCELLATION` optional `{endingChapterAllowance (int 1-10)}`; **`FORMAT_CHANGE` bắt buộc `{publicationType (WEEKLY\|MONTHLY\|IRREGULAR)}`** |

⚠️ **`FORMAT_CHANGE` thiếu `details.publicationType` → silent no-op, KHÔNG có lỗi HTTP nào báo.** Khi decision `FORMAT_CHANGE` được `APPROVED`, listener `series-integration.listener.ts` gọi `SeriesLifecycleService.changeFormat(seriesId, details?.publicationType)`; nếu field này thiếu/sai enum, service chỉ `logger.warn` phía server rồi return — Series **KHÔNG đổi** `publicationType`, không notify, không tạo Amendment (`ContractAmendmentRequested`) — và cả POST /board/decisions lẫn vote đều trả 2xx bình thường. FE bắt buộc validate `publicationType` bắt buộc ở client **trước** khi cho phép tạo decision `FORMAT_CHANGE` (schema hiện không enforce field này ở tầng Zod), nếu không sẽ có case Board vote APPROVED nhưng series đứng yên mà không ai biết vì sao.
| `allowedEditorIds` | tuỳ | string[] | override roster riêng cho decision này |

**GET query:** `boardSessionId`, `targetSeriesId` (đều optional filter).

**Response `BoardDecisionRes`:** `id, targetSeriesId/null, targetSeries {id,title}/null, boardSessionId, decisionType (DecisionType)/null, result (BoardDecisionResult)/null, totalVotes, approveCount, rejectCount, quorumMet, endingChapterAllowance/null, details (JSON)/null, decidedAt/null, allowedEditorIds[], votes[] (BoardVoteRes[]), createdAt`. List item bỏ `votes`/`details`/`allowedEditorIds`.

**Lỗi POST:** `Error.BoardSessionNotFound` · `Error.InvalidBoardMembers`.

### 11. `GET /board/decisions/:id` — Chi tiết quyết định

**Lỗi:** `Error.BoardDecisionNotFound`.

### 12. `POST /board/decisions/:id/vote` — Bỏ phiếu

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `voteValue` | ✅ | enum `VoteValue` | |
| `note` | tuỳ | string (≤300) | lý do |

Editor (route cho phép cả `BOARD_MEMBER, EDITOR`) chỉ vote được nếu nằm trong `allowedEditorIds` của decision và phiên đang phase `VOTING`.

**Lỗi:** `Error.BoardDecisionNotFound` · `Error.BoardSessionNotFound` · `Error.BoardSessionNotOpen` (409) · `Error.VotingNotOpen` (409 — chưa tới phase VOTING) · `Error.DecisionAlreadyFinalized` (409) · `Error.VoterNotAllowed` (403 — không thuộc roster) · `Error.VoterAlreadyVoted` (409).

### 13. `GET /board/decisions/:id/votes` — Danh sách phiếu

**Response:** `[BoardVoteRes]` — mỗi phiếu: `voterId/null, voteValue (VoteValue)/null, note/null, votedAt`.

**Lỗi:** `Error.BoardDecisionNotFound`.

### 14-15. `GET/POST /board/reports` — Danh sách / Tạo báo cáo phân tích series

**POST body:**

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `seriesId` | ✅ | string | |
| `boardDecisionId` | ✅ | string | quyết định liên quan |
| `reportType` | tuỳ | string | |
| `content` | ✅ | string | nội dung phân tích |
| `attachments` | tuỳ | string[] | object key R2 |

**GET query:** `seriesId`, `boardDecisionId` (optional filter).

**Response `SeriesReportRes`:** `id, seriesId/null, boardDecisionId/null, preparedBy/null, reportType/null, content/null, attachments[], createdAt`.

**Lỗi POST:** `Error.BoardDecisionNotFound` · `Error.BoardSessionNotFound` · `Error.BoardSessionClosedReport` (400 — phiên đã `CONCLUDED`) · `Error.EditorNotInvited` (403 — không trong roster phiên).

### 16. `GET /board/reports/:id` — Chi tiết báo cáo

**Lỗi:** `Error.BoardReportNotFound`.

### 17. `GET /board/config` — Xem cấu hình biểu quyết

**Response `BoardConfigRes`:** `id, updatedBy/null, boardTotalMembers (number, luôn lẻ), quorumMin (sĩ số roster mặc định khi auto-assign — KHÔNG phải quorum đếm phiếu), approveMajorityRatio (number — mặc định 0.5, verify `board.repo.ts:197`), isDefault?, updatedAt`.

Không có lỗi domain riêng cho GET (route `PATCH /board/config/:id` là `SUPER_ADMIN`-only, không thuộc phạm vi Editor).

---

## Nhóm D — Contract / Payment / Reprint / Transfer / Tankobon (40 route)

### Narrative — Flow 6 (Publishing Contract & Conditional Payment)

> 🔴 **§87 (2026-08-01) — flow ký đổi sang 2-PHASE.** State machine: `DRAFT → BOARD_REVIEW → AWAITING_MANGAKA → FULLY_EXECUTED` (+ `ACTIVATION_PENDING` cho HĐ replacement transfer; `REJECTED_BY_MANGAKA`; `VOIDED` khi hủy trước ký). **Đã XOÁ 4 route cũ:** `PATCH /contracts/:id/status`, `POST .../request-changes`, `.../board-approve`, `.../board-request-changes`. Không còn `MANGAKA_REVIEW/MANGAKA_APPROVED/BOARD_APPROVED/NEGOTIATION` — bỏ mọi UI cũ.

Sau khi Board approve serial hoá (Flow 1), **Editor soạn Contract**. Editor là trung gian ở **Phase 1**, không tham gia ký:

1. **`POST /contracts`** → `DRAFT`. Editor tự nhập `valuationAmount`/`contractType`/ownership split/`terminationClause`/thời hạn (validate tiền ở AC dưới).
2. **`POST /contracts/:contractId/payment-conditions`** — thêm điều kiện giải ngân (chỉ khi `DRAFT`/`BOARD_REVIEW`): `CHAPTER_MILESTONE` (mốc tuyệt đối), `RECURRING_CHAPTER` (lặp vô hạn — series serial mở), `RANKING_MILESTONE`, `TIME_BOUND`. **Trần ownership-aware:** Σ payout của `CHAPTER_MILESTONE`+`TIME_BOUND` ≤ (FULL_BUYOUT ? valuation : publisherOwnershipPct%×valuation); `RECURRING_CHAPTER`+`RANKING_MILESTONE` không tính vào trần → vượt → 422 `Error.InvalidContractMoney`.
3. **`PATCH /contracts/:id`** — chỉnh điều khoản (chỉ khi `DRAFT`/`BOARD_REVIEW`; mỗi lần tạo `ContractVersion`).
4. **`POST /contracts/:id/submit-review`** → `DRAFT → BOARD_REVIEW` (mở **Phase 1 nội bộ**). Board đọc, để `comments` tư vấn (không vote), rồi **1 Board `claim` làm đại diện**; Editor đọc comment → sửa điều khoản (bước 3) theo ý **đại diện**.
5. **Đại diện Board `sign-representative` (OTP)** → `BOARD_REVIEW → AWAITING_MANGAKA` (khoá điều khoản, Editor hết sửa được). *(Route Board — xem `06-board-member.md`.)*
6. **Phase 2 — Mangaka**: `sign-mangaka` (accept, OTP → `FULLY_EXECUTED`, emit `contract.executed`) hoặc `reject` (+lý do → `REJECTED_BY_MANGAKA`). *(Route Mangaka — xem `03-mangaka.md`.)*
7. Nếu Mangaka **reject** → Editor **`POST /contracts/:id/redraft`** → clone HĐ MỚI (`supersedesContractId` trỏ HĐ bị từ chối), bắt đầu lại từ `DRAFT`. KHÔNG có vòng thương lượng trên HĐ cũ.
8. **`POST /contracts/:id/revenue`** — nhập doanh thu kỳ cho HĐ `REVENUE_SHARE` (`FULLY_EXECUTED`) → hệ thống chia theo % sở hữu → tạo `PaymentRecord`.
9. Sửa điều khoản sau `FULLY_EXECUTED` (Flow 5 CHANGE_FORMAT/COMPLETE) → **ContractAmendment** (vẫn giữ cơ chế đa-ký cũ, NGOÀI phạm vi §87): `POST /contracts/:contractId/amendments` (DRAFT) → `PATCH` sửa → `POST .../submit` → Mangaka/Board ký (route riêng) → `FULLY_EXECUTED` hoặc `POST .../void`.

### Narrative — Flow 7 (Reprint)

Editor (hoặc Board) thấy series "hot nhưng cũ" → **`POST /reprint-requests`** (`revisionMode: AS_IS|WITH_REVISION`, phạm vi chương). Nếu `contract_type=FULL_BUYOUT` → Board duyệt nội bộ luôn (không cần Mangaka); nếu `REVENUE_SHARE` → phải qua `PATCH .../mangaka-review` (route Mangaka) trước. Sau khi `APPROVED` → vào thẳng luồng xuất bản (bỏ qua proposal/Name): mỗi `ReprintChapter` được Mangaka nộp manuscript (hoặc — nếu `WITH_REVISION` + `FULL_BUYOUT` mà Mangaka gốc không hợp tác — **`PATCH .../assign-reviser`** giao cho `INTERNAL_TEAM`/`OTHER_MANGAKA`), rồi Editor **`PATCH .../approve`** từng chapter; khi mọi chapter `APPROVED` → tự động publish toàn request.

### Narrative — Flow 8 (Transfer, phần Editor)

Board sàng lọc `TransferRequest` xong (route Board) → nếu gốc `REVENUE_SHARE`, Board giao Editor đàm phán: **`POST /transfers/requests/:id/start-negotiation`** (`UNDER_REVIEW → NEGOTIATING`) → Editor deal với Mangaka A (ngoài hệ thống) → A đồng ý/từ chối (route Mangaka) → Editor **`POST /transfers/contracts`** soạn `TransferContract` 3 bên (transferAmount, transferType, newOwnershipSplit) → A → B → Board ký OTP (route riêng từng bên) → `FULLY_EXECUTED` → `TransferRequest.COMPLETED`.

### 1-2. `GET/POST /contracts` — Danh sách / Tạo hợp đồng nháp

**POST body:**

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `seriesId` | ✅ | string | phải `SERIALIZED` |
| `mangakaId` | ✅ | string | phải khớp `Series.mangakaId` |
| `boardDecisionId` | ✅ | string | Decision `SERIALIZATION` đã `APPROVED` |
| `contractType` | ✅ | enum `ContractType` | `FULL_BUYOUT` \| `REVENUE_SHARE` |
| `valuationAmount` | ✅ | number **> 0** | 0 đồng → 422 `Error.InvalidContractMoney` |
| `publisherOwnershipPct`, `mangakaOwnershipPct` | ✅ | number 0-100 | **FULL_BUYOUT** ⇒ BE ép `100`/`0`; **REVENUE_SHARE** ⇒ cả 2 ∈ (0,100) và tổng = 100 (Mangaka 0% bị chặn) — sai → 422 `Error.InvalidContractMoney` |
| `terminationClause` | ✅ | string | |
| `contractStart`, `contractEnd` | ✅ | ISO datetime | `contractEnd` **>** `contractStart` |

**Response `ContractRes` (§87):** `id, seriesId, mangakaId, editorId/null, series (SeriesMini), mangaka (UserMini), editor (UserMini)/null, boardDecisionId/null, boardDecision {id, decisionType, result, decidedAt, boardSession{id,title,startTime}}/null, sourceTransferRequestId/null, contractType (ContractType), valuationAmount/null, publisherOwnershipPct/null, mangakaOwnershipPct/null, terminationClause/null, contractStart/null, contractEnd/null, status (ContractStatus), mangakaSignedAt/null, **representativeId/null, representative (UserMini)/null, representativeSignedAt/null, supersedesContractId/null, rejectionReason/null, mangakaRejectedAt/null**, createdAt`. ⚠ **Đã bỏ `boardSignedAt`**. List item bỏ `boardDecision`/`terminationClause`/`sourceTransferRequestId`/`mangakaSignedAt`/`representativeSignedAt`/`mangakaRejectedAt`/`rejectionReason` (giữ `representativeId`/`representative`/`supersedesContractId`).

**Lỗi POST:** `Error.SeriesNotSerialized` (409) · `Error.BoardDecisionNotFound` (404) · `Error.InvalidSerializationDecision` (409) · `Error.ContractMangakaMismatch` (409) · `Error.OpenContractExists` (409 — series/decision đã có hợp đồng chưa kết thúc) · `Error.ContractNotFound`.

### 3. `GET /contracts/:id/pdf` — Tải PDF hợp đồng đã ký

Chỉ từ `FULLY_EXECUTED` trở đi.

**Response:** `{ downloadUrl, expiresAt, key }` (presigned GET, xem quy ước upload/download ở 01 §3).

**Lỗi:** `Error.ContractNotFound` · `Error.ContractAccessDenied` · `Error.ContractNotExecutedForPdf` (409).

### 4. `GET /contracts/:id` — Chi tiết hợp đồng

**Lỗi:** `Error.ContractNotFound` · `Error.ContractAccessDenied`.

### 5-6. `GET /contracts/:id/versions[/:versionId]` — Lịch sử phiên bản hợp đồng

**Response `ContractVersionRes`:** `id, contractId, versionNumber, valuationAmount/null, publisherOwnershipPct/null, mangakaOwnershipPct/null, terminationClause/null, editedById, note/null, createdAt`.

**Lỗi:** `Error.ContractNotFound` · `Error.ContractAccessDenied`.

### 7. `PATCH /contracts/:id` — Sửa điều khoản (Editor phụ trách)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `contractType` | tuỳ | enum `ContractType` | |
| `valuationAmount` | tuỳ | number ≥0 | |
| `publisherOwnershipPct`, `mangakaOwnershipPct` | tuỳ | number 0-100 | gửi 1 → phải gửi cả 2, tổng=100 (bỏ qua nếu `FULL_BUYOUT`) |
| `terminationClause` | tuỳ | string | |
| `contractStart`, `contractEnd` | tuỳ | ISO datetime | |
| `note` | tuỳ | string (≤500) | lý do lịch sử phiên bản |

Chỉ hợp lệ khi `CONTRACT_EDITABLE_STATUSES` = **`DRAFT`/`BOARD_REVIEW`** (§87); sang `AWAITING_MANGAKA` là khoá. Mỗi lần sửa tạo `ContractVersion` mới (truy vết). Vi phạm trần tiền/ownership → 422 `Error.InvalidContractMoney`; sai trạng thái → 409 `Error.InvalidContractTransition`; không phải editor phụ trách → 403.

### 8. `GET /contracts/:id/status` — Trạng thái + tiến độ ký

**Response `ContractStatusProgressRes` (§87):** `id, status (ContractStatus), mangaka {id, isSigned, signedAt/null}, representative {id/null, claimed, signed, signedAt/null}`. ⚠ **Đã thay** `boardProgress{...}` (model ký toàn roster cũ) bằng `representative{...}` — chỉ 1 đại diện ký.

**Lỗi:** `Error.ContractNotFound` · `Error.NotContractMangaka` (403 — chỉ áp dụng phía Mangaka; Editor gọi không bị chặn).

### 8b. `GET /contracts/:id/comments` — Đọc comment tư vấn của Board (Phase 1) 🆕 §87

Editor đọc comment Board để lại (khi HĐ `BOARD_REVIEW`) rồi sửa điều khoản theo ý đại diện. Response mảng `{ id, contractId, authorId, author (UserMini), content, createdAt }`.

**Lỗi:** `Error.ContractNotFound` (404) · `Error.ContractAccessDenied` (403).

### 9. `POST /contracts/:id/submit-review` — Gửi Hội đồng duyệt (Phase 1) 🆕 §87

Không body. `DRAFT → BOARD_REVIEW`. Mở Phase 1: Board đọc + comment tư vấn + claim đại diện.

**Lỗi:** `Error.ContractNotFound` · `Error.NotAssignedContractEditor` (403) · `Error.InvalidContractTransition` (409 — không ở `DRAFT`) · `Error.InvalidContractMoney` (422 — tiền/ownership/trần chưa hợp lệ, chặn trước khi vào review).

### 9b. `POST /contracts/:id/redraft` — Soạn lại HĐ sau khi Mangaka từ chối 🆕 §87

Không body (hoặc `{ note? }`). Chỉ khi HĐ ở `REJECTED_BY_MANGAKA` → clone điều khoản + payment-conditions sang **HĐ MỚI** (`DRAFT`, `supersedesContractId` = HĐ cũ), trả về HĐ mới. Bắt đầu lại từ bước 1.

**Lỗi:** `Error.ContractNotFound` · `Error.NotAssignedContractEditor` (403) · `Error.ContractRedraftNotAllowed` (409 — HĐ không ở `REJECTED_BY_MANGAKA`).

> ⚠ **Route `PATCH /contracts/:id/status` đã bị XOÁ** (§87). Việc chuyển trạng thái nay do các action tường minh: `submit-review` (Editor), `sign-representative` (Board), `sign-mangaka`/`reject` (Mangaka).

### 10. `POST /contracts/:id/revenue` — Nhập doanh thu kỳ (REVENUE_SHARE)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `revenue` | ✅ | number dương | |
| `period` | ✅ | string | vd `"2026-Q2"` |

→ tạo `PaymentRecord` loại `REVENUE_SHARE` chia theo % sở hữu.

**Lỗi:** `Error.ContractNotFound` · `Error.RevenueNotApplicable` (409 — không phải `REVENUE_SHARE` + `FULLY_EXECUTED`) · `Error.NotAssignedContractEditor`.

### 11-12. `GET/POST /contracts/:contractId/amendments` — Danh sách / Tạo phụ lục

**POST body:**

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `changedClauses` | ✅ | string[] (≥1) | mô tả điều khoản thay đổi |
| `reason` | tuỳ | string | |
| `valuationAmount` | tuỳ | number dương | |
| `publisherOwnershipPct`, `mangakaOwnershipPct` | tuỳ | number 0-100 | gửi 1 → phải gửi cả 2, tổng=100 |
| `terminationClause` | tuỳ | string | |
| `contractStart`, `contractEnd` | tuỳ | ISO datetime | start phải trước end |

Chỉ hợp lệ khi Contract `FULLY_EXECUTED` (BR-CONTRACT-01) và chưa có amendment nào đang mở.

**Response `AmendmentRes`:** `id, contractId, changedClauses[], reason/null, status (ContractAmendmentStatus), triggerSource (AmendmentTrigger), valuationAmount/null, publisherOwnershipPct/null, mangakaOwnershipPct/null, terminationClause/null, contractStart/null, contractEnd/null, mangakaSignedAt/null, boardSignedAt/null, fullyExecutedAt/null, voidReason/null, createdBy/null, creator (UserMini)/null, createdAt, signatures[]? ({id, amendmentId, userId, role, signedAt})`. List item bỏ `signatures`/`changedClauses`/`reason`/`terminationClause`/`voidReason`/`mangakaSignedAt`/`boardSignedAt`.

**Lỗi:** `Error.ContractNotFound` · `Error.ContractNotAmendable` (409) · `Error.NotAssignedContractEditor` · `Error.OpenAmendmentExists` (409) · `Error.OwnershipMismatch` (422) · `Error.ContractAccessDenied` (GET).

### 13. `GET /contracts/:contractId/amendments/:id` — Chi tiết phụ lục

**Lỗi:** `Error.AmendmentNotFound` · `Error.ContractAccessDenied`.

### 14. `PATCH /contracts/:contractId/amendments/:id` — Sửa phụ lục (chỉ DRAFT)

Body: cùng field tuỳ chọn như POST (partial). Sửa → **reset toàn bộ chữ ký** đã có.

**Lỗi:** `Error.AmendmentNotFound` · `Error.AmendmentNotEditable` (409) · `Error.OwnershipMismatch`.

### 15. `POST /contracts/:contractId/amendments/:id/submit` — Trình ký

Không body. `DRAFT → PENDING_SIGNATURES`. Phải có ít nhất 1 field thay đổi so với hợp đồng gốc.

**Lỗi:** `Error.AmendmentNotFound` · `Error.AmendmentNotSubmittable` (409) · `Error.AmendmentNoChanges` (422).

### 16. `POST /contracts/:contractId/amendments/:id/void` — Huỷ phụ lục

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `voidReason` | ✅ | string (≥1) | |

Chỉ hợp lệ khi chưa terminal (`FULLY_EXECUTED`/`VOIDED`) → `VOIDED`.

**Lỗi:** `Error.AmendmentNotFound` · `Error.AmendmentNotVoidable` (409) · `Error.NotAssignedContractEditor`.

### 17-18. `GET/POST /contracts/:contractId/payment-conditions` — Danh sách / Tạo điều kiện thanh toán

**POST body:**

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `conditionType` | ✅ | enum `ConditionType` | |
| `thresholdConfig` | ✅ | JSON (shape theo `conditionType`) | `CHAPTER_MILESTONE`: `{chapter: int>0}` · `RECURRING_CHAPTER`: `{every: int>0}` (bắt buộc `isRecurring=true`) · `RANKING_MILESTONE`: `{topRank: int>0}` · `TIME_BOUND`: `{deadline: "YYYY-MM-DD"}` |
| `isRecurring` | tuỳ | boolean | mặc định `false` |
| `payoutAmount` | tuỳ | number ≥0 | phải có 1 trong `payoutAmount`/`payoutPct` |
| `payoutPct` | tuỳ | number 0-100 | |

**Response `PaymentConditionRes`:** `id, contractId, conditionType (ConditionType), thresholdConfig (JSON)/null, payoutAmount/null, payoutPct/null, isRecurring, status (PaymentConditionStatus), lastTriggeredValue/null, achievedAt/null`.

**Lỗi:** `Error.ContractNotFound` · `Error.NotAssignedPaymentEditor` (403).

### 19-20. `PATCH /contracts/:contractId/payment-conditions/:conditionId[/disable]` — Sửa / Vô hiệu hoá

**PATCH body (sửa):** `thresholdConfig`, `payoutAmount`, `payoutPct`, `isRecurring` — tuỳ chọn nhưng phải gửi ít nhất 1 field.

**Lỗi:** `Error.ContractNotFound` · `Error.NotAssignedPaymentEditor` · `Error.PaymentConditionNotFound` · `Error.PaymentConditionNotEditable` (409 — đã `PAID`/`CANCELLED`/`MISSED`/`DISABLED`).

### 21. `GET /payments/:id` — Chi tiết 1 payment record

**Response `PaymentRecordRes`:** `id, contractId, conditionId/null, receiverId, seriesId/null, description/null, approvedBy/null, approvedAt/null, paymentType (PaymentType), paymentSource (PaymentSource), amount, period/null, paymentMethod/null, transactionReference/null, status (PaymentRecordStatus), paidAt/null, cancelledAt/null, cancelReason/null, note/null, createdBy/null, createdAt, series (SeriesMini)/null, receiver (UserMini), approver (UserMini)/null`.

**Lỗi:** `Error.PaymentRecordNotFound` · `Error.PaymentAccessDenied` (403 — ngoài phạm vi editor phụ trách contract/series).

### 22. `GET /payments/contracts/:id/payments` — Payment theo contract

**Response** — `{ data: PaymentRecordListItem[] }` (bỏ `description/note/cancelReason/transactionReference/paymentMethod/approvedBy/approvedAt/cancelledAt/createdBy/conditionId/approver`).

**Lỗi:** `Error.PaymentAccessDenied`.

### 23. `GET /payments/series/:id/payments` — Payment theo series

Cùng shape route #22. **Lỗi:** `Error.PaymentAccessDenied`.

### 24. `POST /tankobon-sales` — Nhập doanh số tankobon

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `seriesId` | ✅ | string | |
| `volumeNumber` | ✅ | number int dương | |
| `unitsSold` | ✅ | number int ≥0 | |
| `period` | ✅ | string (≥1) | vd `"2026-Q2"` |

**Response:** `{ id, seriesId, volumeNumber, unitsSold, period, recordedBy, createdAt }`.

**Lỗi:** `Error.SeriesNotFound` (404, path `seriesId`).

### 25-26. `GET/POST /reprint-requests` — Danh sách / Tạo yêu cầu tái bản

**POST body:**

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `seriesId` | ✅ | string | phải có `Contract.FULLY_EXECUTED` |
| `revisionMode` | ✅ | enum `ReprintRevisionMode` | `AS_IS` \| `WITH_REVISION` |
| `reason` | ✅ | string (≥1) | |
| `chapterRangeStart`, `chapterRangeEnd` | ✅ | number int dương | `end ≥ start`; phải có chapter `PUBLISHED` trong khoảng |

**GET query:** `status`, `seriesId` (optional).

**Response `ReprintRequestRes`:** `id, seriesId, requestedBy/null, revisionMode (ReprintRevisionMode)/null, reason/null, chapterRangeStart/null, chapterRangeEnd/null, status (string — ReprintRequestStatus), mangakaApprovedAt/null, boardApprovedAt/null, publishedAt/null, createdAt, chapters[] (ReprintChapter), series (SeriesMini)/null, requester (UserMini)/null`. `ReprintChapter`: `{originalChapterId, manuscriptFile, status: ReprintChapterStatus}`. List item bỏ `chapters`/`reason`.

**Lỗi POST:** `Error.ActiveContractNotFound` (404, path `seriesId`) · `Error.OriginalChaptersNotFound` (404) · `Error.ReprintActionNotAllowed` (403).

### 27. `GET /reprint-requests/:id` — Chi tiết yêu cầu tái bản

**Lỗi:** `Error.ReprintRequestNotFound`.

### 28-29. `GET /reprint-requests/:id/chapters[/:chapterId]` — Danh sách / Chi tiết chapter tái bản

**Lỗi:** `Error.ReprintRequestNotFound` · `Error.ReprintChapterNotFound`.

### 30. `PATCH /reprint-requests/:id/chapters/:chapterId/approve` — Duyệt chapter tái bản

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `originalChapterId` | ✅ | string | |
| `approve` | ✅ | boolean | `false` = yêu cầu sửa lại |

Khi mọi chapter trong request đạt `APPROVED` → tự động publish toàn bộ `ReprintRequest`.

**Lỗi:** `Error.ReprintRequestNotFound` · `Error.ReprintChapterNotFound` · `Error.InvalidReprintTransition` (409) · `Error.ReprintActionNotAllowed` (403).

### 31. `PATCH /reprint-requests/:id/chapters/:chapterId/assign-reviser` — Gán reviser (PB-07)

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `reviserId` | ✅ | string | |
| `reviserType` | ✅ | enum `ReviserType` | `INTERNAL_TEAM` \| `OTHER_MANGAKA` |

Chỉ áp dụng khi `revisionMode=WITH_REVISION` VÀ contract gốc `FULL_BUYOUT`.

**Lỗi:** `Error.ReprintRequestNotFound` · `Error.ReprintChapterNotFound` · `Error.ReprintNotWithRevision` (409) · `Error.ReviserOnlyForFullBuyout` (409) · `Error.ReviserMangakaNotFound` (422 — `reviserType=OTHER_MANGAKA` nhưng `reviserId` không phải role MANGAKA) · `Error.ReprintActionNotAllowed`.

### 32. `POST /transfers/contracts` — Tạo hợp đồng chuyển nhượng 3 bên

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `transferRequestId` | ✅ | string | request phải `UNDER_REVIEW` |
| `transferAmount` | ✅ | number dương | B trả A |
| `transferType` | ✅ | enum `TransferType` | `FULL_TRANSFER` \| `PARTIAL_TRANSFER` |
| `newOwnershipSplit` | ✅ | Record\<string, number\> | tổng phải = 100 |
| `coOwnerApprovalRequired` | tuỳ | boolean | mặc định `false` — bật khi `PARTIAL_TRANSFER` (A giữ phần → co-owner duyệt chapter mới) |

**Response `TransferContractRes`:** `id, transferRequestId/null, seriesId/null, fromMangakaId/null, toMangakaId/null, series (SeriesMini)/null, fromMangaka/toMangaka (UserMini)/null, transferType/null, transferAmount/null, newOwnershipSplit/null, coOwnerApprovalRequired, status (TransferContractStatus), aSignedAt?, bSignedAt?, boardSignedAt?, createdAt, signatures[]?`.

**Lỗi:** `Error.TransferRequestNotFound` · `Error.InvalidTransferState` (409) · `Error.TransferAccessDenied` (403).

### 33. `GET /transfers/contracts/:id/signatures` — Danh sách chữ ký hợp đồng chuyển nhượng

**Response:** `{ signatures: [{id, transferContractId, userId, role: TransferSignerRole, signedAt}] }`.

**Lỗi:** `Error.TransferContractNotFound` · `Error.TransferAccessDenied`.

### 33b. `GET /transfers/contracts/:id` — 🆕 Chi tiết hợp đồng chuyển nhượng (Spec 27, 2026-07-29)

Editor phụ trách series đọc lại hợp đồng mình đã soạn (route #32) — điều khoản + tiến độ ký của cả 3 bên trong 1 lần gọi. Cùng RBAC với `/signatures` (Mangaka A/B, Editor phụ trách, Board trong roster, Super Admin).

**Response `TransferContractRes`:** `id, transferRequestId, seriesId, fromMangakaId, toMangakaId, series/fromMangaka/toMangaka (Mini)/null, transferType (TransferType)/null, transferAmount/null, newOwnershipSplit (Record<string,number>)/null, coOwnerApprovalRequired (bool), status (TransferContractStatus), createdAt, signatures[]`.

Thứ tự ký bắt buộc đọc từ `status`: `DRAFT` (chờ A) → `A_SIGNED` (chờ B) → `B_SIGNED` (chờ Board) → `BOARD_SIGNED` → `FULLY_EXECUTED`. Editor **không** ký hợp đồng chuyển nhượng (chỉ soạn) — dùng route này để theo dõi và nhắc bên còn thiếu.

**Lỗi:** `Error.TransferContractNotFound` (404, kể cả id rác) · `Error.TransferAccessDenied` (403).

### 34. `GET /transfers/requests/:id` — Chi tiết yêu cầu chuyển nhượng

**Response `TransferRequestRes`:** `id, seriesId, requestingMangakaId, originalMangakaId, series/requestingMangaka/originalMangaka (Mini)/null, originalContractType/null, proposedType/null, proposedPercentage/null, planDescription/null, originalContractId/null, `**`transferContractId/null`**` (🆕 Spec 27), status (TransferRequestStatus), boardDecisionId/null, createdAt`.

🆕 **`transferContractId`** — id hợp đồng **chuyển nhượng** đã soạn cho yêu cầu này (`null` nếu chưa soạn). Dùng để gọi route #33b/#33. ⚠️ Đừng nhầm với `originalContractId` = **Contract (hợp đồng xuất bản)** cũ của series, khác entity, không dùng được với `/transfers/contracts/:id/*`. Field chỉ đảm bảo ở route GET request; response route mutation không mang (quy ước Spec 20).

**Lỗi:** `Error.TransferRequestNotFound` · `Error.TransferAccessDenied`.

### 35. `POST /transfers/requests/:id/start-negotiation` — Bắt đầu đàm phán (REVENUE_SHARE)

Không body. `UNDER_REVIEW → NEGOTIATING`. Chỉ áp dụng khi hợp đồng gốc `REVENUE_SHARE`.

**Lỗi:** `Error.TransferRequestNotFound` · `Error.OnlyAppliesToRevenueShare` (409) · `Error.TransferAccessDenied`.

---

## Nhóm E — Deadline / Survey / Publication / Dashboard / Directory / Reviews / Revision / Annotation (29 route)

### Narrative — Flow 10 (Deadline Negotiation)

Editor có quyền gia hạn đơn phương (`PATCH /chapters/:id/schedule/extend`, Nhóm B) khi không có bất đồng. Flow này xử lý khi **bất đồng** hoặc thay đổi **ảnh hưởng slot xuất bản**:

1. Mangaka hoặc Editor **`POST /deadline-requests`** → `PROPOSED`.
2. Bên kia: **`POST .../counter`** (đề xuất khác → `COUNTER_PROPOSED`, loop) hoặc **`POST .../agree`** (→ `AGREED_BY_PARTIES`) hoặc **`POST .../reject`** (bất đồng → `ESCALATED`, Board quyết định cuối) hoặc bên khởi tạo **`POST .../withdraw`** (→ `REJECTED` terminal).
3. Khi `AGREED_BY_PARTIES`: Editor **`POST .../finalize`** — nếu **không** ảnh hưởng slot → `APPROVED` ngay (cập nhật Schedule); nếu ảnh hưởng slot → `BOARD_REVIEW` (Board tự quyết qua route riêng `POST /deadline-requests/:id/board-resolve`, không thuộc phạm vi Editor).

### Narrative — Flow 4 (Survey/Ranking) — 🔴 **BREAKING 2026-07-29: Editor nay CHỈ ĐỌC**

> **Đổi quyền (§84).** Kỳ bình chọn (`SurveyPeriod`) là đơn vị theo **KỲ PHÁT HÀNH của cả tạp chí**, không phải
> theo series. Editor/Tantou chỉ phụ trách một vài series nên **không còn thẩm quyền vận hành kỳ**; riêng
> `finalize` còn là **xung đột lợi ích** vì nó chốt xếp hạng so sánh toàn bộ series, gồm cả series của chính Editor.
> 4 route dưới đây nay **SUPER_ADMIN-only** — Editor gọi sẽ nhận **403**:
>
> | Route | Trước | Nay |
> |---|---|---|
> | `POST /survey-periods` | EDITOR + SUPER_ADMIN | **SUPER_ADMIN** |
> | `PATCH /survey-periods/:id/status` | EDITOR + SUPER_ADMIN | **SUPER_ADMIN** |
> | `POST /survey-data/import` | EDITOR + SUPER_ADMIN | **SUPER_ADMIN** |
> | `POST /survey-periods/:id/finalize` | EDITOR + SUPER_ADMIN | **SUPER_ADMIN** |
>
> **FE phải làm:** ẩn/bỏ mọi nút mở kỳ · đổi trạng thái kỳ · nhập postcard · chốt ranking khỏi màn Editor.
> Luồng vận hành kỳ xem `07-super-admin.md` §14.

**Editor GIỮ NGUYÊN toàn bộ quyền ĐỌC** (cần để bảo vệ series trước Hội đồng — Requiment §2.3b):

- `GET /survey-periods` · `GET /survey-periods/:id` — danh sách/chi tiết kỳ.
- `GET /survey-periods/:id/rankings` — bảng xếp hạng kỳ (kèm `riskLevel`, `consecutiveAtRiskCount`).
- `GET /survey-periods/:id/votes` · `GET /survey-periods/:id/survey-data` — dữ liệu phiếu của kỳ.
- `GET /rankings?seriesId=&periods=` — trend 1 series (scope theo owner).
- `GET /rankings/board?surveyPeriodId=` — bảng toàn tạp chí 1 kỳ. ⚠ **bắt buộc `surveyPeriodId`**; thiếu → **404** (không phải 403).

### Narrative — Publication Version (registry độc lập, không gắn flow)

`PublicationVersion` ghi nhận các phiên bản phát hành (ngôn ngữ, chiều đọc RTL/LTR, ORIGINAL/DIGITAL/FLIPPED) — CRUD thuần, Editor toàn quyền tạo/sửa/xoá cho series.

### Narrative — Dashboard, Directory, Reviews, Revision, Annotation

- **`GET /dashboard/editor`** — tổng hợp review queue + series theo status + series nguy cơ + cảnh báo production + hợp đồng đang chờ.
- **`GET/PUT /me/staff-profile`** — hồ sơ nghiệp vụ Editor (specialtyGenres dùng để auto-assign Board — PB-05).
- **`GET /assistants`**, **`GET /mangakas`** — danh bạ để Editor tham khảo (không thao tác tuyển dụng — đó là việc của Mangaka).
- **`POST /mangaka-reviews`** — Editor đánh giá Mangaka sau hợp tác (feed reputation).
- **`GET /revision-requests`** — Editor xem lại lịch sử vòng yêu cầu sửa mình đã tạo (Name/Manuscript).
- **`GET/POST /annotations`** — Editor tạo markup trực tiếp trên Name/Manuscript (Requiment §2.3a) — TEXT/HIGHLIGHT/DRAWING kèm toạ độ.

### 1-2. `GET/POST /deadline-requests` — Danh sách / Tạo yêu cầu đổi deadline

**POST body:**

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `chapterId` | ✅ | string | chưa có deadline-request nào đang mở cho chapter này |
| `requestedDeadline` | ✅ | ISO datetime | phải ở tương lai |
| `reason` | ✅ | string (1-1000) | |

**GET query:** `chapterId` (✅ bắt buộc), `status` (tuỳ, enum `DeadlineRequestStatus`).

**Response `DeadlineRequestRes`:** `id, scheduleId, chapterId/null, seriesId/null, requestedBy ("MANGAKA"|"EDITOR")/null, lastProposedBy/null, currentDeadline/null, requestedDeadline/null, reason/null, affectsSlot (boolean), status (DeadlineRequestStatus), boardReviewedBy/null, resolvedAt/null, createdAt, series (SeriesMini)/null, chapter (ChapterMini)/null`. List item bỏ `reason`/`boardReviewedBy`/`scheduleId`/`resolvedAt`.

**Lỗi POST:** `Error.DeadlineRequestNotFound` · `Error.DeadlineRequestAccessDenied` (403) · `Error.OpenDeadlineRequestExists` (409) · `Error.DeadlineRequestNotAllowed` (409).

### 3. `GET /deadline-requests/:id` — Chi tiết

**Lỗi:** `Error.DeadlineRequestNotFound` · `Error.DeadlineRequestAccessDenied`.

### 4. `POST /deadline-requests/:id/agree` — Đồng ý đề xuất

Không body. → `AGREED_BY_PARTIES`. Chỉ bên đối ứng (không phải người vừa đề xuất) gọi được.

**Lỗi:** `Error.DeadlineRequestNotFound` · `Error.DeadlineRequestAccessDenied` · `Error.NotCounterparty` (403) · `Error.InvalidDeadlineRequestTransition` (409).

### 5. `POST /deadline-requests/:id/counter` — Đề xuất deadline khác

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `requestedDeadline` | ✅ | ISO datetime | tương lai |
| `reason` | ✅ | string (1-1000) | |

→ `COUNTER_PROPOSED`. **Lỗi:** như route #4.

### 6. `POST /deadline-requests/:id/finalize` — Chốt (chỉ Editor)

Không body. Chỉ hợp lệ khi `AGREED_BY_PARTIES`. `!affectsSlot` → `APPROVED` (cập nhật Schedule ngay); `affectsSlot` → `BOARD_REVIEW`.

**Lỗi:** `Error.DeadlineRequestNotFound` · `Error.DeadlineRequestAccessDenied` · `Error.InvalidDeadlineRequestTransition`.

### 7. `POST /deadline-requests/:id/reject` — Từ chối (bất đồng)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `reason` | ✅ | string (1-1000) | |

→ `ESCALATED` (Board phân xử cuối). **Lỗi:** `Error.DeadlineRequestNotFound` · `Error.DeadlineRequestAccessDenied` · `Error.NotCounterparty` · `Error.InvalidDeadlineRequestTransition`.

### 8. `POST /deadline-requests/:id/withdraw` — Rút yêu cầu

Không body. Chỉ người khởi tạo. → `REJECTED` (terminal).

**Lỗi:** `Error.DeadlineRequestNotFound` · `Error.DeadlineRequestAccessDenied` · `Error.InvalidDeadlineRequestTransition`.

### 9. ~~`POST /survey-data/import`~~ — 🔴 **CHUYỂN SANG SUPER_ADMIN (§84)**

> Editor gọi → **403**. Xem `07-super-admin.md` §14. Giữ mô tả body bên dưới để đối chiếu lịch sử.

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `surveyPeriodId` | ✅ | string | |
| `issueNumber` | tuỳ | number int dương | |
| `reflectedIssueNumber` | tuỳ | number int dương | kỳ mà kết quả thực sự phản ánh (độ trễ 8 tuần — chỉ áp dụng offline) |
| `surveyDate` | tuỳ | ISO datetime | |
| `entries` | ✅ | array (≥1) | mỗi entry: `{seriesId, voteCount (int ≥0)}` |

**Lỗi:** `Error.SurveyPeriodNotFound` · `Error.SurveyDataImportNotAllowed` (400 — kỳ đã `REFLECTED`).

### 10-11. `GET /survey-periods` (Editor ✅) / ~~`POST /survey-periods`~~ (🔴 **SUPER_ADMIN — §84**)

> **`GET` giữ nguyên cho Editor.** Riêng **`POST` nay SUPER_ADMIN-only** — Editor gọi → **403**.
> Xem `07-super-admin.md` §14. Body dưới đây giữ để đối chiếu.
>
> 🆕 **W1 (2026-08-02) — `GET /survey-periods` nay CÓ filter + phân trang, và ĐỔI SHAPE (breaking):** query `?magazine=&publicationType=&status=&limit=(1-100,default 20)&offset=(default 0)`; response nay là **`{ items: SurveyPeriodRes[], total, limit, offset }`** thay vì mảng thô. Route cũng mở thêm cho **MANGAKA** (nội bộ). FE Editor đang đọc mảng trực tiếp phải sửa sang `.items`.

**POST body:**

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `issueNumber` | ✅ | number int dương | |
| `reflectedIssueNumber` | tuỳ | number int dương | |
| `magazine` | ✅ | string | |
| `publicationType` | ✅ | enum `PublicationType` | |
| `eligibleSeriesIds` | ✅ | string[] (≥1, không trùng) | |
| `startDate`, `endDate` | ✅ | ISO datetime | start < end |
| `status` | tuỳ | enum `SurveyStatus` (chỉ `DRAFT`/`OPEN`/`CLOSED`) | KHÔNG được tạo thẳng `REFLECTED` |

**Response `SurveyPeriodRes`:** `id, magazine/null, publicationType (PublicationType)/null, eligibleSeriesIds[], issueNumber?, reflectedIssueNumber?, startDate, endDate, status (SurveyStatus)`.

Không lỗi domain khai báo riêng cho POST (validate qua Zod 422).

### 12. `GET /survey-periods/:id` — Chi tiết kỳ bình chọn

Không error khai báo (404 chuẩn nếu không tồn tại — cần verify qua service, ở mức guide vẫn có thể trả `Error.SurveyPeriodNotFound`).

### 13. `GET /survey-periods/:id/votes` — Danh sách phiếu vote của kỳ

**Response:** `[ReaderVoteListItem]` — mỗi item: `id, surveyPeriodId, seriesIds[], publicationType (PublicationType)/null, authMethod ("EMAIL_OTP"|"PHONE_OTP"|"CAPTCHA_ONLY")/null, voteWeight (number), isFlagged (boolean), votedAt` (ẩn `identityHash`/`ipHash`/`captchaScore` — tín hiệu nội bộ).

### 14. `GET /survey-periods/:id/survey-data` — Danh sách dữ liệu vote offline

**Response:** `[SurveyDataRes]` — `id, surveyPeriodId, importedBy/null, surveyDate/null, importedAt, entries[] ({seriesId/null, voteCount})`.

### 15. ~~`PATCH /survey-periods/:id/status`~~ — 🔴 **CHUYỂN SANG SUPER_ADMIN (§84)**

> Editor gọi → **403**. Xem `07-super-admin.md` §14.

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `status` | ✅ | enum `SurveyStatus` (chỉ `OPEN`/`CLOSED`) | chuyển sang `REFLECTED` phải qua route `finalize`, không đặt trực tiếp ở đây |

**Lỗi:** `Error.SurveyPeriodNotFound`.

### 16. ~~`POST /survey-periods/:id/finalize`~~ — 🔴 **CHUYỂN SANG SUPER_ADMIN (§84)**

> Editor gọi → **403**. Chốt ranking so sánh TOÀN BỘ series trong kỳ nên không thể do Editor phụ trách
> một vài series trong đó thực hiện (xung đột lợi ích). Xem `07-super-admin.md` §14.

Không body. Tổng hợp online (weighted) + offline (weight=1.0), tạo `RankingRecord` cho mỗi series, so sánh kỳ trước, đánh dấu nguy cơ. Kỳ → `REFLECTED`.

**Lỗi:** `Error.SurveyPeriodNotFound` · `Error.SurveyPeriodAlreadyFinalized` (400) · `Error.SurveyDataImportNotAllowed`.

### 17. `GET /survey-periods/:id/rankings` — Ranking của kỳ

**Response:** `{ items: RankingRecordRes[] }`. `RankingRecordRes`: `seriesId, surveyPeriodId, magazine/null, publicationType (PublicationType)/null, issueNumber/null, rankPosition?, voteCount, normalizedScore, previousRank/null, rankChange/null, isAtRisk (boolean), riskLevel (RiskLevel), consecutiveAtRiskCount, isReliable (boolean — false khi kỳ quá ít phiếu)`.

### 18. `POST /tankobon-sales` — (đã mô tả ở Nhóm D #24, route dùng chung Editor/Board)

### 19-20. `GET/DELETE`/`PATCH /publication-versions/:id` — Chi tiết / Xoá / Sửa

**PATCH body:**

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `language` | tuỳ | string (1-20)/null | vd `JA`/`EN`/`VI` |
| `readingDirection` | tuỳ | enum `ReadingDirection`/null | |
| `versionType` | tuỳ | `'ORIGINAL'\|'DIGITAL'\|'FLIPPED'`/null | (không phải enum Prisma — literal string) |
| `notes` | tuỳ | string (≤2000)/null | |

**Response `PublicationVersionRes`:** `id, seriesId, language, readingDirection (ReadingDirection), versionType/null, notes/null, createdAt`.

**Lỗi:** `Error.PublicationVersionNotFound` · `Error.SeriesAccessDenied`.

### 21-22. `GET/POST /series/:seriesId/publication-versions` — Danh sách / Tạo phiên bản

**POST body:** giống bảng field PATCH ở trên nhưng `language` **bắt buộc**, `readingDirection` mặc định `RTL`.

**Lỗi:** `Error.SeriesNotFound` · `Error.SeriesAccessDenied`.

### 23. `GET /rankings` — Trend ranking 1 series (scope theo owner)

Query: `seriesId` (✅), `periods` (tuỳ, 1-60, mặc định 12).

**Response:** `{ items: BoardRankingItem[] }` — như `RankingRecordRes` (bỏ `consecutiveAtRiskCount`, thêm `recordedAt`).

**Lỗi:** `Error.RankingAccessDenied` (403) · `Error.SeriesNotFound`.

### 24. `GET /rankings/board` — Bảng xếp hạng toàn tạp chí 1 kỳ

Query: `surveyPeriodId` (✅).

**Response:** cùng shape route #23. **Lỗi:** `Error.SurveyPeriodNotFound`.

### 24b. ⚠️ Xem xếp hạng TỔNG HỢP nhiều kỳ (weekly/monthly cộng dồn) — chỉ có route PUBLIC

Không có API nội bộ nào trả bảng xếp hạng gộp nhiều kỳ. Hiện chỉ có **`GET /rankings/aggregate?magazine=&publicationType=&level=MONTH|YEAR&year=&month=`** — route **`@IsPublic()`** (mô tả đầy đủ ở `02-guest-reader.md` §4.4). FE Editor cứ gọi thẳng route này (có/không gửi token đều được), nhưng phải biết 2 giới hạn:

- **Mất tín hiệu nội bộ:** payload public **không có** `isAtRisk`, `riskLevel`, `isReliable`, `consecutiveAtRiskCount`. Muốn đánh giá series nguy cơ theo nhiều kỳ, phải tự ghép: gọi `GET /rankings?seriesId=&periods=N` (route #23, tối đa 60 kỳ, có đủ tín hiệu nội bộ) cho **từng** series — hoặc đọc `consecutiveAtRiskCount` ở `GET /survey-periods/:id/rankings` (route #17) của kỳ mới nhất, field đó đã là bộ đếm "N kỳ liên tiếp nằm vùng nguy cơ".
- **Chỉ gom theo tháng/năm dương lịch** (`level=MONTH` bắt buộc kèm `month`, hoặc `level=YEAR`) — **không** hỗ trợ "10 kỳ gần nhất". Rank tính theo `averageNormalizedScore`; item có `isProvisional=true` nghĩa là series đó tham gia quá ít kỳ trong khoảng (dưới `AppConfig.rankingAggregateMinCoverageRatio`) nên số liệu chưa đáng tin.

Ngoài ra `GET /survey-periods` (route #10) **không có filter nào** — không `magazine`, không `publicationType`, không `status`, không phân trang. Muốn lọc "các kỳ WEEKLY của tạp chí X" thì lọc client-side sau khi lấy full list, hoặc dùng route public `GET /vote/periods?magazine=&publicationType=&limit=` (chỉ trả kỳ đã `REFLECTED`).

### 25. `GET /dashboard/editor` — Dashboard tổng quan Editor

**Response:**

| Field | Kiểu | Ghi chú |
|---|---|---|
| `reviewQueue` | number | số series đang ở hàng đợi review chung (`IN_REVIEW`, chưa ai nhận) |
| `mySeries.byStatus` | Record\<SeriesStatus, number\> | zero-filled mọi status |
| `mySeries.total` | number | |
| `atRisk[]` | array | `{seriesId, title, riskLevel (RiskLevel), rankPosition/null}` |
| `productionAlerts[]` | array | `StudioOverviewItem` (chapter có `warningLevel != NONE`) — field giống `GET /chapters/:id/progress` nhưng thêm `seriesId, seriesTitle, chapterNumber, title` |
| `pendingContracts[]` | array | `{contractId, seriesId, status (ContractStatus)}` |
| `unreadNotifications` | number | |

### 26-27. `GET/PUT /me/staff-profile` — Hồ sơ Editor/Board

**PUT body:**

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `specialtyGenres` | tuỳ | Genre[] | mặc định `[]`; dùng auto-assign Board (PB-05) |
| `demographics` | tuỳ | Demographic[] | mặc định `[]` |
| `bio` | tuỳ | string (≤2000) | |
| `yearsOfExperience` | tuỳ | number int 0-80 | |

**Response `StaffProfileRes`:** `userId, role (RoleCode), specialtyGenres[], demographics[], bio/null, yearsOfExperience/null, displayName/null, avatar/null, hasProfile (false = chưa build hồ sơ)`.

**Lỗi GET:** `Error.ProfileNotFound` (404 — thực tế GET luôn trả default rỗng với `hasProfile=false`, hiếm khi 404).

### 28. `GET /assistants` — Danh bạ trợ lý

Query: `q`, `specialization` (enum `Specialization`), `level`, `availableFrom`/`availableTo` (ISO datetime), `limit`/`offset`.

**Response:** `{ items: AssistantDirectoryItem[], total, limit, offset }`. Item: `userId, displayName/null, avatar/null, email, phoneNumber, specializations[] (Specialization), experienceLevel/null, portfolioFiles[], availabilityStatus (AvailabilityStatus)/null, availabilityFrom/null, availabilityTo/null, reputationScore, ratingAvg, ratingCount, isRecommended` (**kèm `email`/`phoneNumber` để liên hệ** — 2026-08-04). ⚠ Chỉ liệt kê Assistant đã build hồ sơ.

### 29. `GET /mangakas` — Danh bạ Mangaka

Query: `q`, `genre` (enum `Genre`), `level`, `limit`/`offset`.

**Response:** `{ items: MangakaDirectoryItem[], total, limit, offset }`. Item: `userId, displayName/null, avatar/null, email, phoneNumber, penName, genres[] (Genre), experienceLevel/null, bio/null, portfolioFiles[], reputationScore, ratingAvg, ratingCount, isRecommended` (**kèm `email`/`phoneNumber` để liên hệ** — 2026-08-04). ⚠ Chỉ liệt kê Mangaka đã build hồ sơ.

### 30. `POST /mangaka-reviews` — Editor đánh giá Mangaka

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `mangakaId` | ✅ | string | không được trùng chính mình |
| `rating` | ✅ | number int 1-5 | |
| `comment` | tuỳ | string (≤1000) | |
| `seriesId` | tuỳ | string | |

**Response `ReviewRes`:** `id, rating, comment/null, createdAt, reviewer? {id, displayName/null, avatar/null}`.

**Lỗi:** `Error.CannotReviewSelf` (422, path `targetId`) · `Error.ProfileNotFound` (404 — Mangaka đích chưa build hồ sơ).

### 31. `GET /revision-requests` — Danh sách vòng yêu cầu sửa

Query: `targetType` (enum `RevisionTargetType`), `targetId`, `isResolved` ('true'/'false'), `limit`/`offset`. Editor thấy các vòng mình đã `requestedBy`.

**Response:** `{ items: RevisionRequestRes[], total, limit, offset }`. Item: `id, targetType (RevisionTargetType), targetId, seriesId/null, round (number — lần thứ mấy), reason, requestedBy, recipientId, isResolved, resolvedAt/null, resolvedBy/null, createdAt, requester?/recipient?/resolver? (UserMini), series? (SeriesMini)`. ⚠️ Module này **không có route detail** (`GET /revision-requests/:id` không tồn tại) — mọi field ở trên chỉ xuất hiện qua route list này.

### 32. `GET /annotations` — Danh sách annotation

Query: `targetType` (✅ enum `AnnotationTargetType`), `targetId` (✅), `limit`/`offset`.

**Response:** `{ items: AnnotationRes[], total, limit, offset }`. Item: `id, taskId/null, authorId/null, authorRole (RoleCode)/null, targetType (AnnotationTargetType)/null, targetId/null, annotationType (AnnotationType)/null, reviewStage (ReviewStage)/null, coordinates (JSON)/null, content/null, isResolved, resolvedAt/null, createdAt, author? (UserMini)`.

**Lỗi:** `Error.AnnotationForbidden` (403) · `Error.AnnotationTargetNotFound` (422, path `targetId`).

### 33. `POST /annotations` — Tạo markup annotation

| Field | Bắt buộc | Kiểu/enum | Ghi chú |
|---|---|---|---|
| `targetType` | ✅ | enum `AnnotationTargetType` | `PAGE`\|`REGION`\|`TASK`\|`MANUSCRIPT`\|`NAME` |
| `targetId` | ✅ | string | |
| `annotationType` | ✅ | enum `AnnotationType` | `TEXT`\|`HIGHLIGHT`\|`DRAWING` |
| `coordinates` | tuỳ | Record\<string, unknown\> | toạ độ khoanh vùng |
| `content` | tuỳ | string (≤5000) | nội dung ghi chú |
| `reviewStage` | tuỳ | enum `ReviewStage` | `ASSISTANT`\|`MANGAKA`\|`EDITOR` — Editor dùng để phân biệt đang review giai đoạn nào (Requiment §2.3a) |
| `taskId` | tuỳ | string | gắn với task đang review (nếu có) |

**Response** = `AnnotationRes` (route #32).

**Lỗi:** `Error.AnnotationForbidden` (403) · `Error.AnnotationTargetNotFound` (422) · `Error.AnnotationTaskBindingInvalid` (422, path `taskId` — task không khớp target).

> Route `PATCH /annotations/:id/resolve` và `DELETE /annotations/:id` là `AUTH` (mọi role tự resolve/xoá annotation MÌNH tạo) — không thuộc danh sách 116 route role-specific Editor, xem `01-conventions-and-auth.md` §8.

---

## Xác nhận phạm vi

**Đã viết đủ 116/116 route** đối chiếu `test/flows/route-roles.ts` (`RoleCode.EDITOR` trong `allowed[]`). Đối chiếu theo nhóm:

- Nhóm A (Series) — 20/20.
- Nhóm B (Chapter/Name-chapter/Production) — 17/17 (**bổ sung `POST /tasks/:id/download-url`** — route brief ban đầu không liệt kê route này, xác minh có thật trong `route-roles.ts` và thuộc phạm vi Editor theo dõi/tải file production).
- Nhóm C (Board) — 17/17 (**điều chỉnh** so với brief ban đầu ghi 18 — `PATCH /board/config/:id` là `SUPER_ADMIN`-only, Editor chỉ có `GET /board/config`).
- Nhóm D (Contract/Payment/Reprint/Transfer/Tankobon) — 40/40 (§87 thêm submit-review/redraft/comments, bỏ PATCH status).
- Nhóm E (Deadline/Survey/Publication/Dashboard/Directory/Reviews/Revision/Annotation) — **29/29** (§84: −4 — 4 route vận hành kỳ bình chọn chuyển sang SUPER_ADMIN, xem Narrative Flow 4).

### Phát hiện đáng chú ý so với guide cũ / brief ban đầu

1. **Contract Phase 1 (§87): Editor chuyển trạng thái bằng action tường minh, KHÔNG PATCH status** — Editor gọi `POST /contracts/:id/submit-review` (DRAFT→BOARD_REVIEW) và `POST /contracts/:id/redraft` (sau khi Mangaka reject). Editor **không ký** (đại diện Board + Mangaka ký). Route `PATCH /contracts/:id/status` đã bị xoá.
2. **`POST /series/:id/propose-completion` KHÔNG đổi `Series.status`** — chỉ set field `completionProposal` (soft signal, PB-06). Dễ nhầm với `finalize-ending`/`force-cancel` (đổi status thật) — 3 route dễ gây nhầm lẫn cho FE nếu không đọc kỹ.
3. **`revision-requests` và `annotations` không có route detail** (`GET /:id` không tồn tại ở cả 2 module) — toàn bộ field (kể cả `content`/`reason` dài) chỉ xuất hiện qua route list phân trang; FE không thể "lazy-load chi tiết" theo id, phải giữ nguyên field đầy đủ từ response list.
4. **`GET /board/config` không có cặp PATCH cho Editor** — khác trực giác REST thường thấy (GET/PATCH cùng role); PATCH là `SUPER_ADMIN`-only.
5. **Reprint & Transfer đều có "khoá ownership"** — `Contract.contract_type` (FULL_BUYOUT/REVENUE_SHARE) quyết định Editor có phải xin phép Mangaka hay không ở nhiều bước (reprint mangaka-review, transfer negotiation) — FE nên hiển thị rõ contract_type ngay trên UI để giải thích vì sao có/không có bước chờ Mangaka.
6. **`GET /chapters/:id/stages` và `.../pages`** dùng chung route path với Mangaka nhưng Editor chỉ đọc — không có route ghi (POST/PATCH/DELETE stage) nào cấp cho Editor, đúng với vai trò "theo dõi tiến độ real-time" chứ không can thiệp sản xuất.
