# §03 — MANGAKA (Tác giả)

> **Nguồn:** đọc trực tiếp `BE-dev/src/modules/{series,name,chapter,task,ai,studio,reviews,users,contract,payment,transfer,reprint,deadline,publication,survey,dashboard,revision,annotation}/*` (controller/schemas/dto/errors/messages/services/constant) + `BE-dev/prisma/schema.prisma`, đối chiếu quyền route với `BE-dev/test/flows/route-roles.ts` (nguồn sự thật duy nhất, sinh tự động từ Reflect metadata runtime). Đối chiếu nghiệp vụ gốc với `Docs/Requiment-SRS/Requiment.md` mục 2.1 + Flow 1/2/3/6/7/8/9/10/11. Ngày dựng: 2026-07-27.
> Đọc trước [`00-INDEX.md`](00-INDEX.md) và **bắt buộc** [`01-conventions-and-auth.md`](01-conventions-and-auth.md) (envelope, lỗi, phân trang, upload R2, enum §7, `GET/PATCH /me`) — file này KHÔNG lặp lại các quy ước đó.
> Enum ghi dạng `enum X` → tra giá trị đầy đủ ở `01-conventions-and-auth.md` §7. Mini-object dùng lặp lại nhiều nơi: `UserMiniSchema = {id, displayName, avatar}` (`displayName` = `user.displayName ?? user.name`), `SeriesMiniSchema = {id, title}`, `ChapterMiniSchema = {id, chapterNumber, title}`.

---

## 0. Tổng quan phạm vi — 127 route role-specific MANGAKA

Đối chiếu `test/flows/route-roles.ts` sau Spec 30/31: MANGAKA có đúng **127 route** trong `allowed[]`.
Chênh lệch so với bản 124 trước đó: **+4** route `/series-requests` (`POST` · `GET` · `GET /:id` · `POST /:id/cancel`)
**−1** route `POST /series/:id/propose-completion` (siết về EDITOR-only). Chia 6 nhóm theo module:

| Nhóm | Module | Số route | Mục |
|---|---|---|---|
| A | `series` + proposal embedded | 12 | §1 |
| B | `chapter` + `storyboard` + `production-stage` | **29** | §2 |
| C | `task` + `ai` (Region/Task/AI) | 20 | §3 |
| D | `studio` + `reviews` + `users` (directory/profile) | 13 | §4 |
| E | `contract` + `payment` + `transfer` + `reprint` | 31 | §5 |
| F | `deadline` + `publication` + `survey` (rankings) + `dashboard` + `revision` + `annotation` | 17 | §6 |

Ngoài 127 route role-specific này, Mangaka còn dùng các route **AUTH** dùng chung mọi role (xem `01` §5.8, §3, §4).

**Xác nhận theo generator: 127 route có `allowed[]` chứa MANGAKA**; PUBLIC/AUTH dùng chung được mô tả trong file convention.

---

## 1. Nhóm A — Series / Proposal / Franchise — 12 route

### 1.1. Narrative flow (Flow 1 — Series Proposal & Serialization)

State machine thật (`series.constant.ts` → `SERIES_TRANSITIONS`) không có state phác thảo proposal riêng; proposal review nằm trong `ProposalStatus`:

```
DRAFT → IN_REVIEW → READY_TO_PITCH → PITCHED → SERIALIZED → {HIATUS ⇄ SERIALIZED} → {COMPLETING → COMPLETED | CANCELLING → CANCELLED}
IN_REVIEW → ABANDONED | WITHDRAWN
PITCHED → REJECTED (do Board — Flow 5)
REJECTED → IN_REVIEW | WITHDRAWN | ABANDONED (Editor mở lại / 2 bên rút)
ABANDONED | WITHDRAWN → DRAFT (Mangaka tự mở lại — POST /series/:id/reopen)
```

`Series.proposal.status` (embedded `SeriesProposal`, enum `ProposalStatus`) chạy song song: `DRAFT → PROPOSAL_REVIEW → PROPOSAL_REVISION ⇄ PROPOSAL_REVIEW → PROPOSAL_APPROVED`. Khi cả proposal **và** Name mẫu đều `APPROVED` → `SeriesStateService.tryAdvanceToReadyToPitch` tự đẩy `Series.status` từ `IN_REVIEW` sang `READY_TO_PITCH` (Mangaka không tự bấm nút này — nó là hệ quả tự động khi Editor duyệt xong cả 2 phía).

**Happy path (góc nhìn Mangaka):**

1. `POST /series/proposals` — tạo `Series(DRAFT)` + `SeriesProposal(DRAFT)` + 1 `Name(kind=PROPOSAL, status=DRAFT)` chương mẫu trong 1 lần gọi.
2. (tuỳ chọn) `PUT /series/proposals/:id` sửa nội dung proposal nhiều lần khi còn `DRAFT`.
3. `POST /series/:id/submit` — mở đồng thời 2 vòng review: `proposal.status → PROPOSAL_REVIEW`, Name mẫu → `SUBMITTED`, `Series.status → IN_REVIEW` (vào hàng đợi chung, chưa có Editor).
4. Editor tự `claim` (route Editor, xem `05-editor.md`) → review proposal + Name (loop `PROPOSAL_REVISION` ⇄ `PROPOSAL_REVIEW`, Name loop qua module Name §2).
5. Mangaka `POST /series/:id/proposal/resubmit` sau mỗi vòng sửa proposal.
6. Cả 2 phía `APPROVED` → tự động `READY_TO_PITCH` → Editor `pitch` lên Board (route Editor) → Board vote → `SERIALIZED` hoặc `REJECTED`.
7. `REJECTED` → Mangaka có thể `withdraw` (→ `WITHDRAWN`) hoặc chờ Editor `reopen-review`; từ `ABANDONED`/`WITHDRAWN` Mangaka `reopen` (→ `DRAFT`, mất Editor cũ, vào lại hàng đợi khi submit lại).
   ⚠️ **Spec 30:** ở `READY_TO_PITCH` **không** rút thẳng được nữa — phải gửi yêu cầu `POST /series-requests` (§1.4); ở `DRAFT` thì dùng `DELETE /series/proposals/:id` thay vì `withdraw`.
8. Khi đã `SERIALIZED`: Mangaka còn dùng `PATCH /series/:id` (sửa metadata trình bày), `POST /series/:id/franchise-consent` (nếu mình là Mangaka **gốc** của 1 series phái sinh đang xin phép), và **`POST /series-requests`** để xin **tạm ngưng** (`HIATUS`) hoặc **kết thúc sớm** (`COMPLETION`) — xem §1.4. *(Spec 30: `propose-completion` nay là route của biên tập viên, Mangaka gọi sẽ 403.)*

### 1.2. Bảng unhappy case (chung nhóm A)

| Tình huống | Status/Error | Khi nào |
|---|---|---|
| Sửa/xoá proposal khi không phải `DRAFT`/`PROPOSAL_REVISION` | 409 `Error.ProposalNotEditable` / `Error.ProposalNotDeletable` | Đã submit, đang review, hoặc đã qua giai đoạn proposal |
| Submit khi proposal thiếu dữ liệu hoặc series không `DRAFT` | 409 `Error.InvalidProposalState` | `proposal` không hợp lệ hoặc `status !== DRAFT` |
| Submit series phái sinh (`parentSeriesId` set, gốc `REVENUE_SHARE` + `FULLY_EXECUTED`, khác Mangaka) chưa được gốc đồng ý | 409 `Error.FranchiseConsentRequired` | `franchiseConsentStatus` đang `PENDING`/`REJECTED` |
| Gọi action không phải chủ sở hữu | 403 `Error.NotSeriesOwner` | `series.mangakaId !== userId` |
| Chuyển trạng thái sai bước | 409 `Error.InvalidSeriesTransition` / `Error.InvalidProposalState` | Không khớp `SERIES_TRANSITIONS`/vòng đời proposal |
| `parentSeriesId` gửi lên không tồn tại | 422 `Error.ParentSeriesNotFound` (path `parentSeriesId`) | Lúc `POST /series/proposals` |
| Đề xuất kết thúc khi series không `SERIALIZED`/`HIATUS` | 409 `Error.SeriesNotProposableForCompletion` | vd series đang `COMPLETING`/`CANCELLING` |
| Xem series không thuộc mình | 403 `Error.SeriesAccessDenied` | `GET /series/:id` scope theo `mangakaId` |
| Id không phải ObjectId hợp lệ | 404 `Error.SeriesNotFound` | Guard chuẩn `01` §1 |

### 1.3. Chi tiết từng route

#### `GET /series` — danh sách series của tôi

Query `ListSeriesQuery`: `status` (tuỳ, `enum SeriesStatus`), **`magazine`** (tuỳ, string — MỚI 2026-08-05), **`publicationType`** (tuỳ, `enum PublicationType` — MỚI 2026-08-05), `limit` (≤100, default 20), `offset` (default 0). Scope Mangaka = chỉ series `mangakaId === userId`.

Response `{ items: SeriesListItem[], total, limit, offset }` — `SeriesListItem` = `SeriesRes` **bỏ** `proposal`, `completionProposal`, `statusReason`, `reviewStartedAt`, `franchiseConsentStatus`, `coOwnerId`, `parentSeriesId`, `relationshipType`, `startIssueNumber` (gọn cho list — cần các field này thì gọi detail).

#### `GET /series/:id` — chi tiết 1 series (kèm proposal)

Response `SeriesRes` — field quan trọng FE cần:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `status` | `enum SeriesStatus` | Điều hướng UI theo state machine §1.1 |
| `editorId` / `editor` | string\|null / `UserMini`\|null | `null` = đang ở hàng đợi chưa ai nhận |
| `magazine` / `startIssueNumber` | string\|null / number\|null | Board set khi `SERIALIZED`; trước đó luôn `null` |
| `franchiseConsentStatus` | `enum FranchiseConsentStatus`\|null | `null` = không phải series phái sinh cần gate; `PENDING` = đang chờ Mangaka gốc |
| `reviewStartedAt` | string\|null | Có giá trị = Editor đã bắt đầu review, **khoá nhả** (Editor không release được nữa) |
| `completionProposal` | object\|null | `{proposedByRole, proposedById, reason, proposedEndingChapters, proposedAt}` — đề xuất kết thúc tự nhiên PB-06 |
| `proposal` | object\|null | `{synopsis, characterDesigns[], storyboardPages[], estimatedLength, status: ProposalStatus, createdAt}` |

Lỗi: `Error.SeriesNotFound` (404) · `Error.SeriesAccessDenied` (403).

#### `PATCH /series/:id` — sửa metadata trình bày

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `title` | tuỳ | string (1-200) | |
| `coverImage` | tuỳ | string\|null | Object key R2; `''` = xoá ảnh bìa; omit/`null` = giữ nguyên |
| `synopsis` | tuỳ | string\|null | `''` = xoá |
| `characterDesigns` | tuỳ | string[]\|null | Object key R2; `[]` = xoá hết mảng |

Cho sửa ở **mọi** giai đoạn trừ khi series đã kết thúc (`SERIES_METADATA_TERMINAL_STATUSES`: `COMPLETED`/`CANCELLED`/`ABANDONED`/`WITHDRAWN`/`REJECTED`). Field concept/roster (genres/demographic) và field Board sở hữu (slot) **không** có trong schema này — gửi lên bị `.strict()` từ chối 422.

Lỗi: `Error.SeriesNotFound` (404) · `Error.SeriesAccessDenied` (403) · `Error.SeriesNotEditable` (409, path `status` — series đã kết thúc) · `Error.SeriesMetadataConflict` (409, path `metadata` — ghi đồng thời xung đột, tải lại thử lại).

#### `POST /series/proposals` — tạo proposal mới

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `title` | ✅ | string (1-200) | |
| `coverImage` | tuỳ | string | Object key R2 |
| `genres` | tuỳ (default `[]`) | `enum Genre[]` | |
| `demographic` | tuỳ | `enum Demographic` | |
| `publicationType` | tuỳ | `enum PublicationType` | |
| `synopsis` | tuỳ | string (≤5000) | |
| `characterDesigns` | tuỳ (default `[]`) | string[] | Object key R2 |
| `estimatedLength` | tuỳ | number (int ≥1) | Số chương ước tính |
| `storyboardPages` | tuỳ (default `[]`) | `{pageNumber, fileUrl}[]` | Trang phác thảo nhúng thẳng trong proposal (Spec 28); có thể để rỗng, cập nhật sau qua `PUT /series/proposals/:id` |
| `parentSeriesId` | tuỳ | string | Khai franchise — series gốc (Flow 11) |
| `relationshipType` | tuỳ | `enum RelationshipType` | Bắt buộc có ý nghĩa khi có `parentSeriesId` |

Response 201 **`SeriesRes` phẳng** (Spec 28 — KHÔNG còn `{series, name}`; proposal nằm ở `SeriesRes.proposal` với `storyboardPages[]` embedded). Lỗi: `Error.ParentSeriesNotFound` (422, path `parentSeriesId`).

#### `PUT /series/proposals/:id` — sửa proposal (partial)

Các field partial dạng `.nullish()` — omit/`null` giữ nguyên. `storyboardPages` nhận trực tiếp: mảng rỗng clear, mảng mới replace toàn bộ; chỉ sửa khi Series DRAFT hoặc proposal PROPOSAL_REVISION.

Lỗi: `Error.NotSeriesOwner` (403) · `Error.SeriesNotFound` (404) · `Error.ProposalNotEditable` (409).

#### `DELETE /series/proposals/:id` — xoá hẳn draft tạo nhầm

Chỉ khi `Series.status === DRAFT`. Xoá cả aggregate proposal (Spec 28 — proposal embed trong Series, không có Name row riêng). Response `MessageResDto` (`"Đã xoá bản đề xuất"`). Lỗi: `Error.NotSeriesOwner` (403) · `Error.SeriesNotFound` (404) · `Error.ProposalNotDeletable` (409).

#### `POST /series/:id/submit` — nộp hồ sơ vào hàng đợi review

Không body. Response 201 **`SeriesRes` phẳng** (Spec 28 — proposal `PROPOSAL_REVIEW` + Series `IN_REVIEW`, đọc ở `SeriesRes.proposal`). Lỗi: `Error.NotSeriesOwner` (403) · `Error.SeriesNotFound` (404) · `Error.InvalidProposalState` (409 — không `DRAFT`) · `Error.FranchiseConsentRequired` (409) · **`Error.MangakaProfileRequired` (409 — 2026-08-04: Mangaka phải build hồ sơ (`PUT /me/mangaka-profile`) trước khi nộp để biên tập viên xét track record; FE bắt lỗi này → điều hướng sang màn hoàn thiện hồ sơ)**.

#### `POST /series/:id/proposal/resubmit` — nộp lại proposal sau revision

Không body. Chỉ khi `proposal.status === PROPOSAL_REVISION`. Response 201 `SeriesRes`. Lỗi: `Error.NotSeriesOwner` (403) · `Error.InvalidProposalState` (409).

#### `POST /series/:id/withdraw` — Mangaka rút hồ sơ

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `reason` | ✅ | string (1-1000) |

🔴 **BREAKING (Spec 30) — route này KHÔNG còn dùng được ở mọi trạng thái.** Rẽ nhánh theo `series.status`:

| `series.status` | Gọi route này | FE phải làm gì |
|---|---|---|
| `DRAFT` | ❌ **409 `Error.SeriesRequestRequired`** | Chưa nộp thì không có gì để "rút" — hiện nút **Xoá hồ sơ** gọi `DELETE /series/proposals/:id`, hoặc cứ để nguyên ở nháp |
| `IN_REVIEW` | ✅ rút thẳng, không cần ai duyệt | Giữ nguyên nút "Rút hồ sơ". Biên tập viên đã nhận series sẽ được thông báo (`SERIES_WITHDRAWN_IN_REVIEW`) |
| `READY_TO_PITCH` | ❌ **409 `Error.SeriesRequestRequired`** | Biên tập viên đã bỏ công chuẩn bị hồ sơ pitch → phải **gửi yêu cầu** `POST /series-requests` (`requestType=WITHDRAW`) và chờ duyệt — xem §1.4 |
| `PITCHED` trở đi | ❌ 409 `Error.InvalidSeriesTransition` | Đã ra Hội đồng, không rút được nữa |
| `REJECTED` | ✅ rút thẳng | Giữ nguyên |

Transition chạy trước (state machine chặn), rồi mới ghi `proposal.status = WITHDRAWN`. Response 201 `SeriesRes`. Lỗi: `Error.NotSeriesOwner` (403) · `Error.SeriesNotFound` (404) · `Error.SeriesRequestRequired` (409 — 2 trạng thái ở bảng trên) · `Error.InvalidSeriesTransition` (409).

#### `POST /series/:id/reopen` — mở lại hồ sơ đã `ABANDONED`/`WITHDRAWN`

Không body. → `Series.status = DRAFT`, bỏ `editorId` cũ, Name mẫu proposal reset về `DRAFT`. Response 201 `SeriesRes`. Lỗi: `Error.NotSeriesOwner` (403) · `Error.SeriesNotFound` (404) · `Error.InvalidSeriesTransition` (409 — chỉ `ABANDONED`/`WITHDRAWN` mới reopen được).

#### `POST /series/:id/franchise-consent` — Mangaka **gốc** đồng ý/từ chối series phái sinh

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `approve` | ✅ | boolean | `true` = đồng ý → `APPROVED`; `false` → `REJECTED` (chỉ chặn **submit** của series phái sinh, không xoá series) |

Chỉ gọi được bởi Mangaka của series **gốc** (`parentSeries.mangakaId === userId`), KHÔNG phải Mangaka của series phái sinh. Lỗi: `Error.SeriesNotFound` (404) · `Error.NotOriginalMangaka` (403 — không phải chủ series gốc) · `Error.NotFranchiseConsentTarget` (409 — series phái sinh không ở trạng thái `PENDING` chờ đồng ý, vd gốc là `FULL_BUYOUT` nên không cần gate).

#### ~~`POST /series/:id/propose-completion`~~ — 🔴 **MANGAKA KHÔNG còn gọi được (Spec 30)**

Route này đã siết về **EDITOR-only**; MANGAKA gọi → **403**. Tác giả muốn kết thúc sớm thì gửi yêu cầu chính thức
`POST /series-requests` với `requestType=COMPLETION` (§1.4). Field `Series.completionProposal` vẫn còn trong response
`SeriesRes` — nay chỉ do biên tập viên set, tác giả **đọc** để biết biên tập viên đang đề xuất kết thúc.

---

### 1.4. Yêu cầu rút / tạm ngưng / kết thúc sớm — `/series-requests` (Spec 30) ⭐ MỚI

**Nghiệp vụ:** tác giả không tự ý đổi vận mệnh bộ truyện ở những mốc mà biên tập viên/Hội đồng đã đầu tư công sức.
Tác giả **gửi yêu cầu kèm lý do** → biên tập viên phụ trách **chấp nhận** hoặc **từ chối kèm lý do**.

**Ba loại yêu cầu và điều kiện gửi:**

| `requestType` | Chỉ gửi được khi `series.status` | Khi biên tập viên **chấp nhận** thì điều gì xảy ra |
|---|---|---|
| `WITHDRAW` | `READY_TO_PITCH` | Bộ truyện → **`WITHDRAWN`** ngay |
| `HIATUS` | `SERIALIZED` | Bộ truyện → **`HIATUS`** ngay + **đóng băng toàn bộ chương chưa xuất bản** (không cần Hội đồng) |
| `COMPLETION` | `SERIALIZED` hoặc `HIATUS` | ⚠️ **CHƯA đổi trạng thái gì cả.** Chỉ đánh dấu yêu cầu `ACCEPTED`. Biên tập viên còn phải mở phiên Hội đồng (`BoardDecision` loại `COMPLETION`); Hội đồng duyệt xong bộ truyện mới `COMPLETING → COMPLETED` |

> 🔑 **FE đừng hiểu nhầm:** chấp nhận `COMPLETION` **không** kết thúc bộ truyện. Màn hình phải hiển thị rõ
> "Biên tập viên đã đồng ý, đang chờ Hội đồng xét duyệt" — nếu hiện "Đã kết thúc" là sai nghiệp vụ.

**Bất biến:** mỗi bộ truyện chỉ có **tối đa 1 yêu cầu `PENDING`**. Gửi cái thứ hai → 409 `Error.OpenSeriesRequestExists`.
Muốn đổi ý thì `cancel` cái cũ rồi gửi lại.

**Vòng đời:** `PENDING → ACCEPTED | REJECTED | CANCELLED` (cả ba là điểm cuối, không quay lại được).

#### `POST /series-requests` — gửi yêu cầu (MANGAKA chủ bộ truyện)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `seriesId` | ✅ | string (ObjectId) | |
| `requestType` | ✅ | `enum SeriesRequestType` = `WITHDRAW`\|`HIATUS`\|`COMPLETION` | |
| `reason` | ✅ | string (1–1000, trim) | Biên tập viên đọc cái này để quyết |
| `expectedReturnDate` | tuỳ | string ISO 8601 | **Chỉ HIATUS** — ngày dự kiến quay lại. Biên tập viên có quyền ghi đè khi duyệt |
| `proposedEndingChapters` | tuỳ | number (int 1–50) | **Chỉ COMPLETION** — số chương xin thêm để kết truyện |

Response **201** `SeriesRequestRes`. Lỗi: `Error.SeriesRequestAccessDenied` (403 — không phải chủ bộ truyện) ·
`Error.SeriesRequestNotAllowed` (409 — trạng thái bộ truyện không cho gửi loại này) ·
`Error.OpenSeriesRequestExists` (409) · `Error.SeriesRequestNotFound` (404 — id rác/không tồn tại).

#### `GET /series-requests` — danh sách yêu cầu của tôi

Query: `seriesId?` · `status?` (`enum SeriesRequestStatus`) · `requestType?` · `limit` (1–100, default 20) · `offset` (default 0).
Phạm vi tác giả = yêu cầu thuộc các bộ truyện mình sở hữu. Response `{ items: SeriesRequestRes[], total, limit, offset }`.

#### `GET /series-requests/:id` — chi tiết

Lỗi: `Error.SeriesRequestNotFound` (404) · `Error.SeriesRequestAccessDenied` (403 — ngoài phạm vi).

#### `POST /series-requests/:id/cancel` — tự rút lại yêu cầu (MANGAKA, chỉ khi `PENDING`)

Không body. Response 201. Biên tập viên phụ trách nhận thông báo `SERIES_REQUEST_CANCELLED`.
Lỗi: `Error.SeriesRequestAccessDenied` (403 — không phải người tạo) ·
`Error.InvalidSeriesRequestTransition` (409 — yêu cầu đã được xử lý trước đó).

#### `SeriesRequestRes` — shape đầy đủ

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` / `seriesId` / `requestedBy` | string | |
| `requestType` | `enum SeriesRequestType` | |
| `reason` | string | Lý do tác giả nêu |
| `expectedReturnDate` | string ISO \| null | Chỉ HIATUS |
| `proposedEndingChapters` | number \| null | Chỉ COMPLETION |
| `status` | `enum SeriesRequestStatus` | `PENDING`/`ACCEPTED`/`REJECTED`/`CANCELLED` |
| `decidedBy` / `decidedAt` | string \| null | Biên tập viên đã quyết và thời điểm |
| `decisionNote` | string \| null | Ghi chú khi **chấp nhận** (tuỳ chọn) |
| `rejectReason` | string \| null | Lý do khi **từ chối** (bắt buộc phía BE) — FE **phải** hiển thị cho tác giả |
| `createdAt` / `updatedAt` | string ISO | |

**Thông báo tác giả sẽ nhận:** `SERIES_REQUEST_ACCEPTED` ("Yêu cầu được chấp nhận") ·
`SERIES_REQUEST_REJECTED` ("Yêu cầu bị từ chối" — `content` có kèm lý do).

#### Proposal storyboard pages (Spec 28 — không có route riêng)

`GET /series/:id` trả `proposal.storyboardPages`. Tạo/sửa qua `POST /series/proposals` và `PUT /series/proposals/:id`; `storyboardPages: []` clear, omit/`null` giữ nguyên. Toàn bộ `/series/:id/names/*` đã bị xoá và phải trả 404.

---

## 2. Nhóm B — Chapter / Storyboard / Page / Production Stage

### 2.1. Narrative flow (Flow 2 + Flow 3 — chapter-first + stage hard-gate)

```
POST /chapters (chapterNumber+title) → Chapter(DRAFT) + Manuscript(DRAFT) + Schedule rỗng
    ↓
POST /chapters/:id/storyboards → Storyboard(DRAFT) → submit → Editor review (loop) → APPROVED
    ↓ [Gate #1: upload page CHỈ khi Name APPROVED]
POST /chapters/:id/pages (originalFile) → Page(DRAFT); Name APPROVED lần đầu → backend seed 4 ProductionStage:
    INKING=ACTIVE, DETAILING/LETTERING/FINAL_CHECK=LOCKED
    ↓
[Vòng lặp mỗi ProductionStage ACTIVE — xem §3 nhóm C để tạo Region/Task/AI]
    Mọi task không-CANCELLED của stage → APPROVED
    ↓
PUT /chapters/:id/stages/:stageId/outputs — xác nhận output MỌI Page của stage (upload composite mới HOẶC reuseInput=true)
    ↓
POST /chapters/:id/stages/:stageId/complete — chốt stage, mở stage kế (snapshot output → input bất biến của stage sau)
    ↓ [lặp lại tới FINAL_CHECK ACTIVE — stage này KHÔNG nhận task, chỉ là gate]
POST /chapters/:id/manuscript/submit → bulk Page DRAFT→COMPLETED, Manuscript→EDITOR_REVIEW
    ↓
┌─ Editor OK → READY_FOR_PRINT → (co-owner gate nếu có PARTIAL_TRANSFER) → publish → PUBLISHED
└─ Editor yêu cầu sửa → EDITOR_REVISION (kèm Annotation trên manuscript) → bulk Page COMPLETED→REVISING
      → 🔴 POST /chapters/:id/stages/:stageId/reopen — mở lại stage cần sửa (bắt buộc: sau khi submit thì
        MỌI stage đều COMPLETED, không mở lại thì không giao task / không sửa ảnh được gì — xem §2.7.1)
      → [giao task lại ở stage vừa mở] → confirm outputs → complete → (dây chuyền các stage sau tự mở lại)
      → resolve hết RevisionRequest mở → POST manuscript/resubmit → EDITOR_REVIEW (loop)
        ⚠ resubmit → 409 Error.ProductionNotFinalized nếu còn stage sản xuất đang ACTIVE
```

`ManuscriptStatus` (`chapter.constant.ts` → `MANUSCRIPT_TRANSITIONS`): `DRAFT → IN_PRODUCTION → EDITOR_REVIEW ⇄ EDITOR_REVISION → READY_FOR_PRINT → {PUBLISHED | AWAITING_CO_OWNER_APPROVAL → {PUBLISHED | EDITOR_REVISION}}`. `Chapter.status` (`ChapterStatus`) **dẫn xuất** từ Manuscript (`deriveChapterStatus`): `DRAFT`→`DRAFT`, `PUBLISHED`→`PUBLISHED`, còn lại (mọi giai đoạn production) →`IN_PRODUCTION`.

`PageStatus` là **backend-driven hoàn toàn** — Mangaka không tự set: `DRAFT` khi tạo, chuyển `COMPLETED` khi manuscript submit (bulk), chuyển `REVISING` khi Editor trả sửa, về `COMPLETED` khi resubmit. "Trang sẵn sàng" (`pagesReady`, dùng cho progress §2.4) là **suy ra** từ Task — trang không có task nào không-`CANCELLED` đang mở thì tính là ready, không phải trạng thái người dùng bấm.

### 2.2. Bảng unhappy case chung nhóm B

| Tình huống | Status/Error | Khi nào |
|---|---|---|
| Chapter đang `hold` (Editor tạm dừng) | 409 `Error.ChapterOnHold` | Mọi thao tác tạo page/task/submit khi `Chapter.hold != null` |
| Upload page khi Name chưa `APPROVED` | 409 `Error.ChapterNameNotApproved` | Gate #1 Flow 2 |
| Sửa/xoá page khi không `DRAFT`/`REVISING` | 409 `Error.PageNotEditable` | Page đang `COMPLETED` (ở tay Editor) |
| Xoá page có task đã `APPROVED` | 409 `Error.PageHasApprovedTasks` | Bảo toàn công đã duyệt |
| Submit manuscript thiếu trang / còn task chưa duyệt hết / stage chưa xong | 409 `Error.NoPagesToSubmit` / `Error.TasksNotAllApproved` / `Error.ProductionNotFinalized` | Gate cuối trước `EDITOR_REVIEW` |
| Trùng số chương/trang trong cùng phạm vi | 409 `Error.DuplicateChapterNumber` / `Error.DuplicatePageNumber` | |
| Đổi `chapterNumber` khi không phải `DRAFT` | 409 `Error.ChapterNumberLocked` | Chapter-first: số chương khoá sau khi rời DRAFT |
| Sửa/xoá stage khi đã có task hoặc đã `COMPLETED` | 409 `Error.StageNotEditable` / `Error.StageNotDeletable` | |
| Complete stage khi còn task mở hoặc chưa confirm output đủ page | 409 `Error.StageHasOpenTasks` / `Error.StageOutputNotReady` | |
| Không phải chủ sở hữu series | 403 `Error.NotSeriesOwner` / `Error.StageAccessDenied` | |
| Series đã hết ending allowance (CANCELLING) | 409 `Error.EndingAllowanceExceeded` | Tạo chapter mới khi Board đã giới hạn số chương kết thúc |

### 2.3. Chapter — CRUD & lifecycle

#### `POST /chapters` — tạo chapter slot (chapter-first)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `seriesId` | ✅ | string | Phải là series mình sở hữu, đã `SERIALIZED`/`CANCELLING`/`COMPLETING` |
| `chapterNumber` | ✅ | number (int, dương) | Không trùng trong series |
| `title` | tuỳ | string (≤200) | |

→ tạo `Chapter(DRAFT)` + `Manuscript(DRAFT)` + `Schedule` rỗng (Editor set deadline sau, §6). Response 201 `ChapterRes`. Lỗi: `Error.NotSeriesOwner` (403) · `Error.ChapterNotFound` (404 — seriesId sai) · `Error.DuplicateChapterNumber` (409) · `Error.SeriesNotSerialized` (409) · `Error.EndingAllowanceExceeded` (409 — series `CANCELLING` đã đạt trần Board cấp) · 🔴 **`Error.ContractNotExecuted` (409 — MỚI 2026-08-05)**.

> 🔴 **BREAKING 2026-08-05 — cổng hợp đồng (BR-CONTRACT-05) chuyển lên bước MỞ CHƯƠNG.**
> Trước đây chỉ chặn ở `POST /chapters/:id/publish`, nên tác giả vẽ trọn chương rồi biên tập viên duyệt xong mới
> nhận 409. Nay chặn ngay từ `POST /chapters`:
> - Bộ truyện `SERIALIZED` → bắt buộc có hợp đồng đang **`FULLY_EXECUTED`**.
> - Bộ truyện `CANCELLING`/`COMPLETING` → chỉ cần **đã từng** có hợp đồng hiệu lực (huỷ series làm hợp đồng
>   chuyển `TERMINATED`, nhưng chương kết thúc vẫn phải mở được).
>
> **FE cần làm:** ở màn tạo chương, kiểm tra bộ truyện đã có hợp đồng hiệu lực chưa (`GET /contracts?seriesId=`)
> để disable nút + hiện lời nhắc "chờ ký hợp đồng", thay vì để người dùng bấm rồi ăn 409. Thông báo lỗi:
> *"Bộ truyện chưa có hợp đồng hiệu lực nên chưa thể xuất bản"*.

#### `PATCH /chapters/:id` — sửa title/chapterNumber

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `title` | tuỳ | string(≤200)\|null | omit/null giữ nguyên; sửa được tới trước `PUBLISHED` |
| `chapterNumber` | tuỳ | number\|null | **Chỉ sửa được khi `Chapter.status === DRAFT`** |

Lỗi: `Error.ChapterNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.ChapterNotEditable` (409 — title khi đã `PUBLISHED`) · `Error.ChapterNumberLocked` (409 — đổi số khi không `DRAFT`) · `Error.DuplicateChapterNumber` (409).

#### `DELETE /chapters/:id` — xoá chapter DRAFT

Chỉ khi `Chapter.status === DRAFT`. Cascade Name/Manuscript/Schedule/Pages. Response `MessageResDto` (`"Đã xoá chương"`). Lỗi: `Error.ChapterNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.ChapterNotDeletable` (409).

#### `GET /chapters/:id/progress` — dashboard tiến độ 1 chapter

Response `ChapterProgressRes` — field quan trọng:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `storyboardStatus` | `enum StoryboardStatus`\|null | null = chưa gắn Storyboard |
| `pagesReady` / `pagesPending` | number | Suy ra từ Task (xem §2.1) |
| `taskBreakdown` | object | Đếm theo từng `TaskStatus` (assigned/inProgress/submitted/underReview/approved/revisionRequested/onHold/cancelled) |
| `progressPct` | number (0-1) | `pagesReady/totalPages`; **= 1** khi bản thảo đã rời tay Mangaka (đang/đã qua Editor review, chờ co-owner, hoặc đã publish) |
| `warningLevel` | `enum WarningLevel` (read-only, tính runtime — KHÔNG có trong schema.prisma) | `NONE`/`YELLOW`/`RED`/`CRITICAL` — xem ngưỡng bảng dưới |
| `currentStage` | `{id,name,order,status}`\|null | Stage `ACTIVE` hiện tại; `null` = chapter legacy không dùng stage |
| `onHold` | boolean | |

**Ngưỡng `warningLevel`** (`computeWarningLevel`, `chapter.constant.ts`) — không có deadline → `NONE`; đã trễ (`remainingHours < 0`) → `CRITICAL`; còn lại theo `PublicationType`:

| `publicationType` | `YELLOW` khi | `RED` khi |
|---|---|---|
| `WEEKLY` | còn ≤48h **và** `progressPct < 0.7` | còn ≤24h **và** `progressPct < 0.9` |
| Khác (MONTHLY/IRREGULAR) | còn ≤120h **và** `progressPct < 0.6` | còn ≤48h **và** `progressPct < 0.85` |

Lỗi: `Error.ChapterNotFound` (404) · `Error.ChapterAccessDenied` (403).

#### `GET /studio/overview` — tổng quan mọi chapter đang sản xuất

Không tham số. Response `{ items: StudioOverviewItem[] }` — mỗi item gồm `chapterId, seriesId, seriesTitle, chapterNumber, title, manuscriptStatus, deadline, remainingHours, progressPct, warningLevel, onHold, pagesReady, pagesPending, totalPages, openTasks` — sắp theo mức cảnh báo giảm dần rồi tới deadline gần nhất. Dùng làm màn "Studio" tổng cho Mangaka theo dõi nhiều chapter cùng lúc.

### 2.4. Manuscript submit/resubmit + Co-owner gate

#### `POST /chapters/:id/manuscript/submit` — nộp bản thảo cho Editor final check

Không body. Điều kiện: có ít nhất 1 page, mọi task không-`CANCELLED` đã `APPROVED`, mọi `ProductionStage` (nếu có) đã tới `FINAL_CHECK ACTIVE`. → backend complete `FINAL_CHECK`, bulk `Page DRAFT→COMPLETED`, `Manuscript→EDITOR_REVIEW`. Response 201 `ChapterRes`. Lỗi: `Error.NotSeriesOwner` (403) · `Error.ChapterNotFound` (404) · `Error.InvalidManuscriptTransition` (409) · `Error.ChapterOnHold` (409) · `Error.NoPagesToSubmit` (409) · `Error.TasksNotAllApproved` (409) · `Error.ProductionNotFinalized` (409, path `chapterId` — còn stage chưa `COMPLETED`/chưa tới `FINAL_CHECK`).

#### `POST /chapters/:id/manuscript/resubmit` — nộp lại sau `EDITOR_REVISION`

Không body. Yêu cầu đã resolve hết `RevisionRequest` mở (kiểm tra ở phía Editor request-revision, không phải ở route này). → `EDITOR_REVIEW`. Response 201 `ChapterRes`. Lỗi: `Error.NotSeriesOwner` (403) · `Error.ChapterNotFound` (404) · `Error.InvalidManuscriptTransition` (409) · `Error.ChapterOnHold` (409).

#### `POST /chapters/:id/co-owner-approve` / `co-owner-reject` — A-CHP-06 (PARTIAL_TRANSFER)

Chỉ xuất hiện khi series đã qua chuyển nhượng `PARTIAL_TRANSFER` (Flow 8) và Manuscript đang `AWAITING_CO_OWNER_APPROVAL`. Người gọi phải là **co-owner** (`Series.coOwnerId === userId`), KHÔNG phải Mangaka chính.

- `co-owner-approve`: không body → `Manuscript.status = PUBLISHED` trực tiếp (bỏ qua gate publish thường của Editor).
- `co-owner-reject`: body `{ reason?: string (≤1000, optional) }` → `Manuscript.status = EDITOR_REVISION` (buộc Mangaka chính sửa lại).

Lỗi (cả 2 route): `Error.NotCoOwner` (403) · `Error.CoOwnerApprovalNotPending` (409, path `status`) · `Error.CoOwnerApprovalNotFound` (404) · `Error.ChapterNotFound` (404) · `Error.InvalidManuscriptTransition` (409).

### 2.5. Page

#### `POST /chapters/:id/pages` — upload trang (penciling/inking)

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `pageNumber` | ✅ | number (int ≥1) |
| `originalFile` | ✅ | string (object key R2 — file gốc **bất biến**) |

Response 201 `PageRes`. Lỗi: `Error.NotSeriesOwner` (403) · `Error.ChapterNotFound` (404) · `Error.ChapterOnHold` (409) · `Error.ChapterStoryboardNotApproved` (409, path `storyboardId`) · `Error.ProductionPageSetLocked` (409).

#### `GET /chapters/:id/pages` — list trang (scoped)

Không query đặc biệt. Response `{ items: PageRes[] }`. `PageRes` gồm `id, chapterId, pageNumber, originalFile, compositeFile, compositeRevision, canvasWidth, canvasHeight, displayFile (=compositeFile ?? originalFile — FE dùng field này để render, khỏi tự fallback), status: enum PageStatus, createdAt`.

#### `PATCH /pages/:pageId` — cập nhật file/số trang

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `compositeFile` | tuỳ | string\|null | Object key bản tổng hợp; omit/null giữ nguyên |
| `pageNumber` | tuỳ | number\|null | Đổi số trang; trùng trong chapter → 409 |

Lỗi: `Error.NotSeriesOwner` (403) · `Error.PageNotFound` (404) · `Error.PageNotEditable` (409) · `Error.ChapterOnHold` (409) · `Error.DuplicatePageNumber` (409) · `Error.StageOutputInvalid` (422, path `items` — hiếm gặp ở route này, chủ yếu dùng khi động tới output stage).

#### `DELETE /pages/:pageId` — xoá 1 trang (cascade Region+Task)

Response `DeletePageRes = { pageId, deletedRegions, deletedTasks }`. Lỗi: `Error.NotSeriesOwner` (403) · `Error.PageNotFound` (404) · `Error.PageNotEditable` (409) · `Error.PageHasApprovedTasks` (409) · `Error.ChapterOnHold` (409) · `Error.ProductionPageSetLocked` (409).

#### `DELETE /chapters/:id/pages` — xoá nhiều trang (all-or-nothing, ≤50)

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `pageIds` | ✅ | string[] ObjectId (1-50) |

Response `DeletePagesBulkRes = { deletedPages, deletedRegions, deletedTasks }`. Lỗi giống route xoá đơn (áp cho từng page — **1 page fail thì cả batch fail**, không xoá 1 phần).

### 2.6. Storyboard của Chapter (Spec 28)

Base path `/chapters/:id/storyboards`; response `StoryboardRes = {id,seriesId,chapterId,status,version,submittedAt,pages}` và không còn `kind/chapterNumber`.

- `POST /chapters/:id/storyboards` body `{storyboardPages:[{pageNumber,fileUrl}]}` tạo Storyboard `DRAFT`.
- `GET /chapters/:id/storyboards` và `GET /chapters/:id/storyboards/:storyboardId` đọc theo scope.
- `POST .../:storyboardId/submit` chuyển `DRAFT→SUBMITTED`; `POST .../resubmit` chuyển `REVISION→IN_REVIEW`, tăng version và cảnh báo theo `storyboardMaxReviewRounds`.
- `PUT .../:storyboardId/pages` replace toàn bộ; `POST .../:storyboardId/pages` append một trang, chỉ khi `DRAFT/REVISION`.
- `DELETE .../:storyboardId` chỉ khi Chapter DRAFT và Storyboard chưa APPROVED.

Mã lỗi dùng prefix Storyboard: `Error.StoryboardNotFound`, `Error.InvalidStoryboardState`, `Error.ChapterNotDraftForStoryboard`, `Error.ChapterStoryboardAlreadyExists`, `Error.StoryboardNotDeletable`.

### 2.7. Production Stage (Spec production-stages 2026-07-22/24)

#### 2.7.0. Mô hình tư duy — dây chuyền bàn giao có biên nhận

Một chapter được vẽ theo **dây chuyền**: bản mực thô → tô nền/screentone → đặt chữ → kiểm cuối. Mỗi công đoạn là
`ProductionStage`, và với **mỗi trang** trong mỗi công đoạn, BE giữ một biên nhận `ProductionStagePage` gồm 2 nửa:

| Nửa | Tên field | Nghĩa | Ai ghi |
|---|---|---|---|
| **INPUT** | `inputFileKey` · `inputSourceType` · `inputRevision` | **Đề bài** — ảnh mà công đoạn này bắt đầu từ đó. **BẤT BIẾN** suốt thời gian stage mở | BE tự ghi, **không API nào sửa được** |
| **OUTPUT** | `outputFileKey` · `outputSourceType` · `outputRevision` · `outputConfirmedAt/By` | **Kết quả** — ảnh công đoạn này giao nộp. Mangaka xác nhận | Mangaka qua `PUT .../outputs` |

**Luật nối chuỗi (một dòng duy nhất cần nhớ):**

> `complete(stage N)` ⇒ **output của N trở thành input của N+1**, sao chép nguyên văn cả 3 field.

Vì sao thiết kế vậy, không dùng thẳng `page.compositeFile`? Vì `compositeFile` là **ảnh hiện hành thay đổi liên tục**.
Nếu Assistant nhận việc theo `compositeFile`, Mangaka đổi ảnh giữa chừng là Assistant đang vẽ trên một đề bài đã biến
mất. Snapshot input giải quyết đúng chuyện đó: **đề bài của một người đã nhận việc thì không ai đổi được nữa.**

```
        Page.originalFile = orig.png  (bản Mangaka upload, KHÔNG có API sửa)
                    │
   ┌────────────────▼────────────────┐
   │ STAGE 1 INKING        [ACTIVE]  │  input  = ORIGINAL / orig.png / rev 1
   │  task INKING → Assistant        │  output = COMPOSITE / ink.png / rev 1   ← Mangaka confirm
   └────────────────┬────────────────┘
                    │ complete(1) — output copy sang input của 2
   ┌────────────────▼────────────────┐
   │ STAGE 2 DETAILING     [ACTIVE]  │  input  = COMPOSITE / ink.png / rev 1
   │  task BACKGROUND/SCREENTONE/…   │  output = COMPOSITE / detail.png / rev 2
   └────────────────┬────────────────┘
                    │ complete(2)
   ┌────────────────▼────────────────┐
   │ STAGE 3 LETTERING     [ACTIVE]  │  input  = COMPOSITE / detail.png / rev 2
   │  task LETTERING                 │  output = COMPOSITE / letter.png / rev 3
   └────────────────┬────────────────┘
                    │ complete(3)
   ┌────────────────▼────────────────┐
   │ STAGE 4 FINAL_CHECK   [ACTIVE]  │  input  = COMPOSITE / letter.png / rev 3
   │  taskTypes = []  → KHÔNG giao   │  output = (tuỳ chọn, xem dưới)
   │  việc được, chỉ là CỔNG nộp bài │
   └────────────────┬────────────────┘
                    │ POST /chapters/:id/manuscript/submit   (nút "Nộp bản thảo")
                    ▼          → FINAL_CHECK tự COMPLETED, Manuscript → EDITOR_REVIEW
```

**Ý nghĩa từng field cho FE:**

- `inputFileKey` — ảnh **hiển thị làm đề bài** ở màn workspace. Assistant đọc nó qua `TaskRes.stageInputFile`;
  Mangaka đọc qua `GET /chapters/:id/stages/:stageId/pages`. Muốn xem thì xin signed URL (`POST /uploads/sign-download`;
  Assistant dùng `GET /tasks/:id/download-url`).
- `inputSourceType` / `outputSourceType` — `ORIGINAL` = ảnh gốc Mangaka vẽ tay, `COMPOSITE` = bản đã qua xử lý.
  Chỉ stage 1 mới có `ORIGINAL`; từ stage 2 trở đi là `COMPOSITE` (trừ khi stage trước dùng `reuseInput`, khi đó
  `ORIGINAL` được truyền tiếp). Field này để module AI biết đang phân tích ảnh thô hay ảnh đã ghép.
- `inputRevision` / `outputRevision` — bộ đếm **chỉ tăng**, theo từng Page (`Page.compositeRevision`). Dùng để phân
  biệt các vòng: `letter.png rev 3` (bản Editor chê) khác hẳn `letter-v2.png rev 4` (bản sửa). FE hiển thị "phiên bản
  thứ N" từ đây.
- `outputConfirmedAt` / `outputReady` — `outputReady = true` nghĩa là trang đó đã chốt xong ở công đoạn này.
  FE dùng để vẽ progress "đã chốt 8/12 trang".

#### 2.7.0b. Trình tự Mangaka thao tác trong MỘT công đoạn

```
1. GET  /chapters/:id/stages                    → biết stage nào đang ACTIVE
2. GET  /chapters/:id/stages/:stageId/pages     → lấy input từng trang (đề bài)
3. [nhóm C] POST /pages/:id/regions  +  POST /tasks (kèm stageId)
                                                → giao việc; Assistant nhận stageInputFile = input ở bước 2
4. Assistant submit → Mangaka POST /tasks/:id/approve
5. PUT  /chapters/:id/stages/:stageId/outputs   → chốt kết quả CHO MỌI TRANG (bắt buộc đủ 100% trang)
6. POST /chapters/:id/stages/:stageId/complete  → đóng công đoạn, mở công đoạn kế
```

Bước 5 có **2 lựa chọn cho từng trang**, và đây là chỗ FE hay nhầm nhất:

| Gửi gì | Nghĩa | Ảnh hưởng |
|---|---|---|
| `{ pageId, fileKey: "<ảnh mới>" }` | Công đoạn này **có làm ra ảnh mới** | `outputRevision = compositeRevision + 1`; **đồng thời cập nhật `Page.compositeFile`** ⇒ đổi ảnh hiển thị của trang |
| `{ pageId, reuseInput: true }` | Công đoạn này **không đổi gì trên trang này** | output = input nguyên văn; **KHÔNG** đụng `Page.compositeFile` |

Gửi **đúng một** trong hai (gửi cả hai hoặc không gửi gì → 422 `Error.StageOutputInvalid`).
Phải gửi đủ **mọi** trang của chapter trong một lần gọi, nếu thiếu → 422.

#### 2.7.0c. Ba điều kiện để `complete` một công đoạn

1. Stage đang `ACTIVE`, và **không phải `FINAL_CHECK`** (→ 409 `Error.FinalCheckNotCompletable`).
2. Không còn task nào đang mở ở stage đó (`ASSIGNED`/`IN_PROGRESS`/`SUBMITTED`/`UNDER_REVIEW`/`REVISION_REQUESTED`/`ON_HOLD`)
   → 409 `Error.StageHasOpenTasks`. Task `APPROVED`/`CANCELLED` không chặn.
3. **Mọi** trang đã `outputReady` → 409 `Error.StageOutputNotReady`.

#### 2.7.0d. FINAL_CHECK khác các stage kia ở chỗ nào

- `taskTypes = []` ⇒ **không giao được task nào**. Đây là chốt Mangaka **tự xem lại toàn bộ**, không có Assistant.
- **Không bấm "hoàn thành giai đoạn"** cho nó (409). Nó được đóng bởi **nút "Nộp bản thảo"** (`submit`)
  hoặc **"Nộp lại"** (`resubmit`).
- ⚠️ `submit` **chỉ đòi FINAL_CHECK đang `ACTIVE`**, KHÔNG đòi confirm output ở giai đoạn này. Nên xác nhận output ở
  FINAL_CHECK là **tuỳ chọn** — chỉ cần khi Mangaka muốn tráo một bản tổng hợp cuối khác với output của LETTERING.

#### 2.7.0e. Khoá & mở khoá — vì sao đang sản xuất thì sửa gì cũng bị chặn

| Muốn làm | Điều kiện | Lỗi khi không thoả |
|---|---|---|
| Thêm / xoá trang | **Stage đầu tiên** (INKING) phải `ACTIVE` | 409 `Error.ProductionPageSetLocked` |
| `PATCH /pages/:id` đổi `compositeFile` | Chapter **không có stage nào** (chapter legacy) | 422 `Error.StageOutputInvalid` |
| Tạo task / chạy AI | Phải truyền `stageId` của stage đang `ACTIVE`, và `taskType` ∈ `taskTypes` của stage đó | 422 `Error.StageRequired` · 409 `Error.StageLocked` · 422 `Error.TaskTypeNotInStage` |
| Sửa `Page` / `Region` / Task | `Page.status` ∈ {`DRAFT`, `REVISING`} | 409 `Error.PageNotEditable` |

`Page.originalFile` **chỉ set được lúc tạo trang** — không có API nào đổi. Muốn ảnh gốc khác thì xoá trang tạo lại
(và chỉ xoá được khi INKING đang `ACTIVE` + trang không có task `APPROVED`).

Template mặc định seed lúc Name chapter được duyệt lần đầu (`DEFAULT_STAGE_TEMPLATE`):

| `order` | `name` | `taskTypes` cho phép | `isFinalCheck` |
|---|---|---|---|
| 1 | `INKING` | `INKING` | false |
| 2 | `DETAILING` | `BACKGROUND`, `SCREENTONE`, `EFFECT_LINES`, `COLORING` | false |
| 3 | `LETTERING` | `LETTERING` | false |
| 4 | `FINAL_CHECK` | (rỗng) | true — không nhận task, chỉ là gate submit manuscript |

Chỉ **một** stage `ACTIVE` tại một thời điểm; `LOCKED` → `ACTIVE` khi stage trước `COMPLETED`. Task tạo trong stage nào thì `taskType` phải thuộc `taskTypes` của stage đó (kiểm tra ở nhóm C).

#### `GET /chapters/:id/stages` — danh sách stage + analytics

Response `StageListRes`:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `stages[]` | array | Mỗi phần tử: `{id, chapterId, order, name, taskTypes: enum Specialization[], isFinalCheck, status: enum ProductionStageStatus, deadline, startedAt, completedAt, analytics, warnings?}` |
| `analytics` | object | `{taskCount, approvedCount, openCount, totalTaskDurationMs, avgTaskDurationMs, lateTaskCount, stageDurationMs, longestTask: {taskId,taskType,assistantId,durationMs}\|null}` |
| `currentStage` | `{id,name,order}`\|null | Stage `ACTIVE` hiện tại |
| `bottleneckStage` | `{stageId,name,stageDurationMs}`\|null | Stage tốn thời gian nhất (so `stageDurationMs`) |

Lỗi: `Error.StageAccessDenied` (403).

#### `POST /chapters/:id/stages` — chèn custom stage

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `name` | ✅ | string (1-120) | |
| `taskTypes` | tuỳ (default `[]`) | `enum Specialization[]` | |
| `afterStageId` | ✅ | ObjectId | Chèn ngay **sau** stage này (chỉ chèn được trong vùng chưa mở — chưa `ACTIVE`/`COMPLETED`) |

Lỗi: `Error.StageAccessDenied` (403) · `Error.StageNotFound` (404) · **`Error.StageNotInsertable`** (409).

> 🔴 **ĐỔI MÃ LỖI (Spec 26, 2026-07-28):** trước đây route này trả `Error.StageNotDeletable` (sai ngữ nghĩa —
> nói về "xoá" cho một thao tác "chèn"). Nay là **`Error.StageNotInsertable`**. `DELETE .../stages/:stageId` vẫn
> giữ `Error.StageNotDeletable`. **FE phải cập nhật bảng ánh xạ mã lỗi.**

> ⚠️ **Sau khi đã nộp bản thảo thì KHÔNG chèn được stage mới** — mọi stage lúc đó đều `COMPLETED` nên không còn
> điểm neo hợp lệ. Muốn thêm stage sửa bài thì phải `reopen` một stage trước đã (xem §2.7.1).

> ⚠️ `taskTypes` có default `[]`. Stage rỗng `taskTypes` thì **không giao được task nào** cho stage đó
> (`Error.TaskTypeNotInStage`) — **form tạo stage của FE phải bắt buộc chọn ≥1 `taskType`.** Lỡ tạo rồi thì
> stage đang `LOCKED` vẫn xoá được bằng `DELETE .../stages/:stageId`.

#### `PATCH /chapters/:id/stages/:stageId` — sửa tên/deadline

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `name` | tuỳ | string (1-120) |
| `deadline` | tuỳ | ISO datetime (có offset)\|null |

Chỉ sửa được stage chưa `COMPLETED`. Lỗi: `Error.StageAccessDenied` (403) · `Error.StageNotFound` (404) · `Error.StageNotEditable` (409).

#### `DELETE /chapters/:id/stages/:stageId` — xoá stage `LOCKED` chưa có task

Lỗi: `Error.StageAccessDenied` (403) · `Error.StageNotFound` (404) · `Error.StageNotDeletable` (409 — đã có task, đã mở, hoặc là `FINAL_CHECK`).

#### `POST /chapters/:id/stages/:stageId/complete` — hoàn thành stage, mở stage kế

Không body. Điều kiện: stage đang `ACTIVE`, không còn task mở (`STAGE_OPEN_TASK_STATUSES`), và **mọi** Page trong chapter đã confirm output (route dưới). Response 201 `MessageResDto`. Lỗi: `Error.StageAccessDenied` (403) · `Error.StageNotFound` (404) · `Error.StageNotActive` (409) · `Error.StageHasOpenTasks` (409) · `Error.StageOutputNotReady` (409) · **`Error.FinalCheckNotCompletable`** (409).

> 🔴 **KHÔNG gọi route này cho `FINAL_CHECK` (Spec 26, 2026-07-28)** → 409 `Error.FinalCheckNotCompletable`.
> **FE phải ẩn nút "Hoàn thành giai đoạn" khi `stage.isFinalCheck === true`.**
> `FINAL_CHECK` được đóng bằng **nút "Nộp bản thảo"** (`POST /chapters/:id/manuscript/submit`), không phải nút hoàn thành.
> (Trước Spec 26 BE cho bấm, và bấm xong thì chapter **kẹt vĩnh viễn**: submit đòi `FINAL_CHECK` đang `ACTIVE`,
> mà không có đường nào mở lại. Nay đã chặn.)

#### `GET /chapters/:id/stages/:stageId/pages` — input/output snapshot từng Page

Response `{ items: StagePage[] }` — mỗi phần tử: `{stageId, pageId, inputSourceType: enum AiSegmentSource, inputFileKey, inputRevision, outputSourceType, outputFileKey, outputRevision, outputConfirmedAt, outputConfirmedBy, outputReady: boolean}`. Lỗi: `Error.StageAccessDenied` (403) · `Error.StageNotFound` (404).

#### `PUT /chapters/:id/stages/:stageId/outputs` — xác nhận output cho toàn bộ Page

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `items` | ✅ | array (1-200) | Mỗi phần tử: `{pageId, fileKey?}` **hoặc** `{pageId, reuseInput: true}` — chọn **đúng 1** trong 2 (`fileKey` hoặc `reuseInput`), không cả hai không cả không |

Response 200 `{ items: StagePage[] }` (giống shape GET ở trên). Lỗi: `Error.StageAccessDenied` (403) · `Error.StageNotFound` (404) · `Error.StageNotActive` (409) · `Error.StageHasOpenTasks` (409) · `Error.StagePageNotFound` (404, path `pageId`) · `Error.StageOutputInvalid` (422, path `items`) · `Error.ProductionNotFinalized` (409).

---

### 2.7.1. Sửa bài sau khi Editor trả về — mở lại giai đoạn (Spec 26, 2026-07-28) ⭐ MỚI

**Vấn đề trước Spec 26:** nộp bản thảo xong thì **mọi** stage thành `COMPLETED`, không còn stage `ACTIVE` nào.
Editor trả về sửa (`EDITOR_REVISION`, Page về `REVISING`) nhưng Mangaka **không làm gì được**: giao task → 409
`Error.StageLocked`, `PATCH /pages/:id` sửa `compositeFile` → 422, thêm/xoá trang → 409 `Error.ProductionPageSetLocked`.
Vòng review của Editor trở thành vòng lặp rỗng. Nay đã có đường mở lại.

#### `POST /chapters/:id/stages/:stageId/reopen` — mở lại một stage đã `COMPLETED`

Không body. Response **201**:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `message` | string | `"Đã mở lại giai đoạn sản xuất"` (đọc ở **top-level** envelope, không nằm trong `data`) |
| `stageId` | string | Stage vừa mở lại, nay `ACTIVE` |
| `relockedStageIds` | string[] | Các stage phía sau đã bị đưa về `LOCKED` |
| `clearedStagePages` | number | Số bản ghi StagePage của các stage phía sau đã bị xoá |

Lỗi: `Error.StageAccessDenied` (403 — không phải Mangaka sở hữu) · `Error.ChapterOnHold` (409) ·
**`Error.StageReopenNotAllowed`** (409 — bản thảo không ở `EDITOR_REVISION`) · `Error.StageNotFound` (404) ·
**`Error.StageNotReopenable`** (409 — stage không ở `COMPLETED`) · `Error.StageHasOpenTasks` (409).

**Điều kiện mở được:** bản thảo phải đang `EDITOR_REVISION` **và** stage đang `COMPLETED` **và** stage đó cùng mọi
stage sau nó **không còn task đang mở**. Còn task mở thì FE hiện thông báo kèm link `POST /tasks/:id/cancel`.

**Tác động (một transaction):**

```
reopen(DETAILING) trên chuỗi [INKING ✓][DETAILING ✓][LETTERING ✓][FINAL_CHECK ✓]
  → [INKING ✓] [DETAILING ▶ ACTIVE] [LETTERING 🔒] [FINAL_CHECK 🔒]
```

- Stage được mở: `status=ACTIVE`, `startedAt` reset, `completedAt=null`; **`outputConfirmedAt/By` bị xoá** để buộc
  xác nhận lại — nhưng `outputFileKey/outputRevision/outputSourceType` **được GIỮ** (xem cảnh báo dưới).
- `inputFileKey/inputRevision/inputSourceType` **không đổi** — đây là snapshot bất biến, chính là ảnh Assistant nhận.
- Mọi stage phía sau: về `LOCKED`, bản ghi StagePage **bị xoá** và sẽ được tạo lại khi stage này `complete`.
- `Page.compositeFile` **không rollback** — vẫn là ảnh chốt gần nhất cho tới khi confirm output mới.
- Task `APPROVED` cũ được giữ làm lịch sử ⇒ `GET /tasks?stageId=` trả **lẫn** task cũ và task mới; FE lọc theo `status`
  nếu cần tách. Task cũ ở các stage bị relock trả `stageInputFile: null` (bản ghi StagePage đã xoá) — **không phải lỗi**,
  ẩn ô "ảnh đề bài" khi null.

#### 🔴 Cạm bẫy quan trọng nhất: `reuseInput` trên stage vừa mở lại

Trên một stage **vừa reopen**, `reuseInput: true` nghĩa là **"giai đoạn này không đóng góp gì"** — output bị đặt
bằng input, tức ảnh **TRƯỚC** giai đoạn đó. Đây **không** phải "giữ nguyên kết quả cũ".

Hậu quả nếu FE dùng nhầm: stage kế tiếp nhận input tụt về ảnh cũ, và Assistant sẽ vẽ đè lên bản **đã mất phần việc**
của giai đoạn vừa mở lại (BE-A đã tái hiện được bằng dữ liệu thật khi verify).

**Cách làm ĐÚNG với trang không cần sửa:** đọc `outputFileKey` (BE cố ý giữ lại sau reopen) từ
`GET /chapters/:id/stages/:stageId/pages`, rồi gửi lại chính nó:

```jsonc
// Trang 1 cần sửa → file mới.  Trang 2 giữ nguyên → echo lại outputFileKey cũ.
{ "items": [
    { "pageId": "<p1>", "fileKey": "<file Assistant vừa nộp>" },
    { "pageId": "<p2>", "fileKey": "<đúng outputFileKey đang có sẵn của p2>" }
] }
```

⚠️ **Đừng gửi `reuseInput: true`** cho trang chỉ muốn giữ nguyên. Chỉ dùng `reuseInput` khi thật sự muốn **bỏ**
phần việc của giai đoạn đó cho trang ấy.

#### Hai cách sửa bài — chọn theo `reason` của Editor

| | Editor chê phần việc mà một stage sẵn có phụ trách | Việc sửa không thuộc stage nào sẵn có |
|---|---|---|
| **Làm gì** | `reopen` đúng stage đó → giao task → confirm outputs → `complete` | `reopen` một stage làm **neo** → `POST /chapters/:id/stages` với `afterStageId` = stage vừa reopen → `complete` stage neo → stage mới thành `ACTIVE` |
| **Stage neo có phải làm lại thật không** | Có, đó chính là việc cần sửa | Không — confirm giữ nguyên cho mọi trang rồi complete luôn |

🔴 **Không chèn được stage mới nếu chưa reopen** (mọi stage đều `COMPLETED` ⇒ không còn neo hợp lệ), và
**không đặt được stage sau `FINAL_CHECK`** — stage mới luôn chèn vào **trước** `FINAL_CHECK`, `order` của
`FINAL_CHECK` tự dời xuống.

#### Mở khoá thêm/xoá trang

`POST /chapters/:id/pages` và `DELETE /pages/:id` gate theo **stage đầu tiên** phải `ACTIVE`. Nên trong lúc
`REVISING`, muốn thêm/xoá trang thì phải `reopen` **stage 1 (INKING)** — hợp lý vì trang mới bắt buộc đi qua
toàn bộ dây chuyền. Reopen stage 3 thì page-set vẫn khoá (`Error.ProductionPageSetLocked`).

#### Nộp lại sau khi sửa

`POST /chapters/:id/manuscript/resubmit` nay trả **409 `Error.ProductionNotFinalized`** nếu còn **bất kỳ stage sản
xuất nào (`isFinalCheck === false`) đang `ACTIVE`**. Phải đóng hết chuỗi cho tới khi `FINAL_CHECK` `ACTIVE` (hoặc mọi
stage `COMPLETED`) rồi mới nộp lại được. Thông báo gợi ý: *"Còn giai đoạn sản xuất đang mở — hoàn thành trước khi nộp lại."*
`resubmit` cũng tự đóng `FINAL_CHECK` giống `submit`.

---

## 3. Nhóm C — Region / Task / AI (giao việc cho Assistant) — 20 route

### 3.1. Narrative flow (Flow 3 — Task Assignment & Tracking)

```
[Stage ACTIVE của chapter]
    ↓ (tuỳ chọn) POST /pages/:id/segment (AI đề xuất region, async job) → poll GET /ai-jobs/:id
    ↓                                                                     → GET /pages/:id/ai-jobs (list, không kèm proposedRegions)
    ↓ (nếu OK) POST /ai-jobs/:id/apply → ghi Region[] (giữ nguyên region MANUAL/confirmed/đã gắn task)
    ↓ (hoặc) POST /pages/:id/regions (khoanh tay) → PATCH/DELETE /regions/:id để chỉnh
    ↓
POST /tasks (1 task = 1 page, 0..N region) | POST /tasks/batch (N task, mỗi task 1 region) | POST /tasks/group (1 việc, N trang → N task chung groupId)
    ↓ giao cho Assistant (đã có StudioAssignment ACTIVE + trong hireStart–hireEnd — BR-ASSIST-01, xem nhóm D)
    ↓
Assistant: start → IN_PROGRESS → submit → SUBMITTED (route Assistant, xem 04-assistant.md)
    ↓
Mangaka review (đơn vị = TASK, không phải Page):
  ├─ POST /tasks/:id/approve → APPROVED (set completedAt, tính duration)
  ├─ POST /tasks/:id/request-revision (kèm Annotation riêng qua POST /annotations) → REVISION_REQUESTED
  ├─ POST /tasks/:id/cancel → CANCELLED
  └─ POST /tasks/:id/reassign → ASSIGNED (Assistant khác, giữ lịch sử version cũ)
    ↓
POST /tasks/group/:groupId/approve — duyệt hàng loạt (chỉ SUBMITTED/UNDER_REVIEW; task chưa tới lượt liệt kê trong `skipped`)
```

`TaskStatus` (`task.constant.ts` → `TASK_TRANSITIONS`):

```
ASSIGNED → {IN_PROGRESS, ON_HOLD, CANCELLED}
IN_PROGRESS → {SUBMITTED, ON_HOLD, ASSIGNED, CANCELLED}
SUBMITTED → {UNDER_REVIEW, ON_HOLD, CANCELLED}
UNDER_REVIEW → {APPROVED, REVISION_REQUESTED, ON_HOLD, CANCELLED}
REVISION_REQUESTED → {IN_PROGRESS, SUBMITTED, ON_HOLD, ASSIGNED, CANCELLED}
ON_HOLD → {ASSIGNED, CANCELLED}
APPROVED / CANCELLED → (terminal)
```

`reassign` chỉ áp dụng khi task ở `ASSIGNED`/`IN_PROGRESS`/`REVISION_REQUESTED`/`ON_HOLD`; `cancel` áp dụng mọi trạng thái trừ `APPROVED`/`CANCELLED`; duyệt-cả-nhóm chỉ nhận task `SUBMITTED`/`UNDER_REVIEW`.

### 3.2. Bảng unhappy case chung nhóm C

| Tình huống | Status/Error | Khi nào |
|---|---|---|
| Region/Task đụng vào trang không phải mình sở hữu | 403 `Error.NotSeriesOwner` | |
| Sửa/xoá task khi chapter đang hold hoặc page không editable | 409 `Error.ChapterOnHold` / `Error.PageNotEditable` | |
| Giao task cho Assistant chưa có hợp tác hiệu lực | 409 `Error.AssistantNotHired` (path `assistantId`) | Không có `StudioAssignment ACTIVE` trong `hireStart–hireEnd` (BR-ASSIST-01) |
| `assetIds` tham chiếu asset không tồn tại | 422 `Error.AssetNotFound` (path `assetIds`) | |
| Xoá region đã có task `APPROVED` | 409 `Error.RegionHasApprovedTasks` | Bảo toàn công đã duyệt |
| Sửa `description` sau khi task rời `ASSIGNED` | 409 `Error.TaskDescriptionLocked` (path `description`) | Chỉ sửa mô tả khi còn `ASSIGNED`; từ `IN_PROGRESS` phải dùng revision/cancel/reassign |
| Chuyển trạng thái task sai bước | 409 `Error.InvalidTaskTransition` (path `status`) | Không khớp `TASK_TRANSITIONS` |
| AI chưa bật (`AI_SERVICE_URL` rỗng) | 503 `Error.AiNotEnabled` | |
| Trang chưa có file gốc | 422 `Error.PageHasNoFile` | Gọi `/segment` khi `Page.originalFile` rỗng |
| Đã có AI job đang chạy trên trang | 409 `Error.SegmentJobAlreadyRunning` | |
| Apply AI job không còn hợp lệ (stage đã đổi/khác input) | 409 `Error.AiJobNotApplicable` / `Error.AiJobSourceStale` | |

### 3.3. Region

#### `POST /pages/:id/regions` — khoanh vùng thủ công

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `coordinates` | ✅ | `{x≥0, y≥0, width>0, height>0}` | Pixel, top-left origin |
| `regionType` | tuỳ | `enum RegionType` | |

Response 201 `RegionRes`. Lỗi: `Error.PageNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.ChapterOnHold` (409) · `Error.PageNotEditable` (409).

#### `GET /pages/:id/regions` — list vùng của 1 trang

Response `{ items: RegionRes[] }`. `RegionRes`: `{id, pageId, coordinates, regionType, createdBy: 'MANUAL'|'AI', confirmedByMangaka, confidenceScore (null nếu MANUAL), detectedSubtype, aiModelVersion}`.

#### `PATCH /regions/:id` — sửa vùng (partial)

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `coordinates` | tuỳ | như trên \| null (giữ nguyên) |
| `regionType` | tuỳ | `enum RegionType`\|null |
| `confirmedByMangaka` | tuỳ | boolean\|null |

Lỗi: `Error.RegionNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.ChapterOnHold` (409) · `Error.PageNotEditable` (409).

#### `DELETE /regions/:id` — xoá vùng (cascade cancel task)

Response `DeleteRegionRes = { regionId, cancelledTaskIds: string[] }` — task chưa kết thúc gắn với vùng này tự động `CANCELLED` + báo Assistant. Lỗi: `Error.RegionNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.RegionHasApprovedTasks` (409) · `Error.ChapterOnHold` (409) · `Error.PageNotEditable` (409).

### 3.4. AI segmentation

#### `POST /pages/:id/segment` — chạy AI phân vùng (async)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `mode` | tuỳ (default `MODEL`) | `enum AiSegmentMode` | `MODEL`\|`HEURISTIC` |
| `stageId` | tuỳ | ObjectId | Bắt buộc **thực tế** khi chapter đang stage-mode (route validate qua `StageRequiredException` nếu thiếu) |

Response 201 `{ jobId, status: enum AiJobStatus }` — poll qua `GET /ai-jobs/:id`. Lỗi: `Error.PageNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.PageHasNoFile` (422) · `Error.AiNotEnabled` (503) · `Error.SegmentJobAlreadyRunning` (409) · `Error.AiEnqueueFailed` (503) · `Error.StageRequired` (422) · `Error.StageNotFound` (404) · `Error.StageLocked` (409) · `Error.StagePageNotFound` (404) · `Error.ChapterOnHold` (409).

#### `GET /ai-jobs/:id` — poll 1 job

Response `AiJobRes`: `{id, type: enum AiJobType, mode: enum AiSegmentMode|null, pageId, sourceType: enum AiSegmentSource, sourceFileKey, sourceRevision, sourceStageId, sourceWidth, sourceHeight, status: enum AiJobStatus, error (message khi FAILED), modelVersion, proposedRegions (CHỈ có ở route detail này, KHÔNG có ở list), regionCount, appliedAt, startedAt, finishedAt, durationMs, createdAt}`. Mỗi `proposedRegions[]`: `{regionType, detectedSubtype, coordinates, confidenceScore (0-1), suggestedForStage}`. Lỗi: `Error.AiJobNotFound` (404).

#### `GET /pages/:id/ai-jobs` — list job của 1 trang (không kèm `proposedRegions`)

Query `type` (default `SEGMENT`). Response `{ items: AiJobListItem[] }` (= `AiJobRes` bỏ `proposedRegions`). Lỗi: `Error.PageNotFound` (404) · `Error.NotSeriesOwner` (403).

#### `POST /ai-jobs/:id/apply` — áp đề xuất AI vào `Region[]`

Không body. Giữ nguyên region `MANUAL`/`confirmedByMangaka=true`/đã gắn task; region AI cũ (chưa dùng) bị xoá thay bằng đề xuất mới. Response 201 `{ message, created, removed, skipped }`. Lỗi: `Error.AiJobNotFound` (404) · `Error.AiJobNotApplicable` (409) · `Error.AiJobSourceStale` (409) · `Error.AiSourceCanvasMismatch` (422) · `Error.PageNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.ChapterOnHold` (409).

### 3.5. Task

#### `POST /tasks` — giao 1 task (1 trang, 0..N vùng)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `pageId` | ✅ | string | |
| `regionIds` | tuỳ (default `[]`, ≤50) | string[] | Rỗng = giao cả trang |
| `assistantId` | ✅ | string | Phải có `StudioAssignment ACTIVE` hợp lệ |
| `taskType` | ✅ | `enum Specialization` | Phải thuộc `taskTypes` của stage `ACTIVE` (nếu chapter dùng stage) |
| `stageId` | tuỳ | string | Bắt buộc thực tế với chapter có stage; **không đổi được sau khi tạo** |
| `description` | tuỳ | string (1-2000) | Chỉ sửa được khi còn `ASSIGNED` |
| `deadline` | tuỳ | ISO datetime (offset) | |
| `priority` | tuỳ (default 0) | number (int ≥0) | Chỉ để hiển thị/ưu tiên, không phải state machine |
| `assetIds` | tuỳ (default `[]`) | string[] | Reference image đính kèm |

Response 201 `TaskRes` (đầy đủ field, xem bảng response bên dưới). Lỗi: `Error.PageNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.AssistantNotHired` (409) · `Error.AssetNotFound` (422) · `Error.ChapterOnHold` (409) · `Error.PageNotEditable` (409).

**`TaskRes` — field response quan trọng:**

| Field | Kiểu | Ghi chú |
|---|---|---|
| `status` | `enum TaskStatus` | |
| `statusReason` | string\|null | Lý do lần đổi trạng thái gần nhất (cancel/reassign) |
| `stageInputFile` / `stageInputSourceType` / `stageInputRevision` | | Snapshot input bất biến của stage — chỉ có khi task gắn stage |
| `versions[]` | `TaskVersion[]` | `{submittedBy, versionNumber, file, reviewStatus: enum TaskVersionReviewStatus, reviewerNote, submittedAt, submitter?}` — lịch sử mọi lần Assistant nộp |
| `assistant` | `UserMini`\|null | Có ở GET list/detail |
| `assets[]` | | `{id, filePath (dùng cho `download-url`), name, assetType}` — có ở GET list/detail |
| `regions[]` | | Có ở GET list/detail; task nhóm nhiều trang trả `[]` |
| `pageOriginalFile` / `pageDisplayFile` | | Object key để ký signed URL review — có ở GET list/detail |
| `groupId` / `groupTitle` | string\|null | Nhóm việc (task group) chứa task này |

#### `POST /tasks/batch` — giao nhiều task (all-or-nothing, ≤50)

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `items` | ✅ | mảng, mỗi phần tử **1 vùng** (`regionId?` optional, không phải `regionIds[]`) — cùng field còn lại như `POST /tasks` |

Response 201 `{ items: TaskRes[], total, limit, offset }`. Lỗi giống `POST /tasks`.

#### `POST /tasks/group` — giao 1 đầu việc trải nhiều trang

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `pageIds` | ✅ | ObjectId[] (1-50) | Backend tạo N task, mỗi trang 1 task, chung `groupId` |
| `assistantId` / `taskType` / `stageId` / `description` / `deadline` / `priority` / `assetIds` | | như `POST /tasks` | |
| `groupTitle` | tuỳ | string (1-200) | Tên hiển thị nhóm, vd "Vẽ nền ch.5" |

Response 201 `TaskGroupRes = { groupId, groupTitle, items: TaskRes[], total }`. Region/tiến độ/duyệt vẫn theo **từng trang** — group chỉ để gom hiển thị + thao tác hàng loạt.

#### `POST /tasks/group/:groupId/approve` — duyệt cả nhóm

Không body. Chỉ duyệt task đang `SUBMITTED`/`UNDER_REVIEW`; task khác trạng thái bị bỏ qua. Response 201 `{ groupId, approved: number, skipped: string[] }`.

#### `PATCH /tasks/:id` — sửa task

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `assetIds` | tuỳ | string[]\|null | `[]` = xoá hết; omit/null giữ nguyên |
| `description` | tuỳ | string\|null | **Chỉ sửa được khi `status === ASSIGNED`** |
| `deadline` | tuỳ | ISO datetime\|null | |
| `priority` | tuỳ | number\|null | |

Lỗi: `Error.TaskNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.AssetNotFound` (422) · `Error.TaskDescriptionLocked` (409) · `Error.ChapterOnHold` (409) · `Error.PageNotEditable` (409).

#### `GET /tasks/:id` — chi tiết task

Lỗi: `Error.TaskNotFound` (404) (403 ngầm khi không đúng scope sở hữu — trả 404 để không lộ tồn tại).

#### `POST /tasks/:id/download-url` — ký signed URL tải file của task

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `key` | ✅ | string | Phải là 1 trong các object key **thuộc task này** (ảnh gốc trang hoặc file version) |

Response 201 `{ downloadUrl, expiresAt }`. Lỗi: `Error.TaskNotFound` (404) · `Error.TaskFileForbidden` (403, path `key` — key không thuộc task).

#### `GET /tasks` — list task (scope theo role)

Query `ListTasksQuery`: `seriesId?`, `chapterId?`, `pageId?`, `regionId?`, `groupId?`, `assistantId?`, `status?` (`enum TaskStatus`), `limit` (≤100, default 20), `offset` (default 0). Mangaka **không cần** `pageId` — mặc định toàn bộ task thuộc series mình sở hữu, lọc dần. Scope không thuộc mình → trả rỗng (không 403). Response `{ items: TaskListItem[], total, limit, offset }` (`TaskListItem` = `TaskRes` bỏ `versions/assets/description/stageInputFile/stageInputSourceType/stageInputRevision/pageOriginalFile/statusReason/startedAt/completedAt` — gọn cho list).

#### `POST /tasks/:id/approve` — duyệt task

Không body → `APPROVED` (set `completedAt`). Lỗi: `Error.TaskNotFound` (404) · `Error.PageNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.ChapterOnHold` (409) · `Error.PageNotEditable` (409) · `Error.InvalidTaskTransition` (409 — task chưa ở trạng thái duyệt được, xem `TASK_TRANSITIONS`).

#### `POST /tasks/:id/request-revision` — yêu cầu sửa

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `reviewerNote` | ✅ | string (1-1000) |

→ `REVISION_REQUESTED`. Markup chi tiết tạo **riêng** qua `POST /annotations` (targetType=`PAGE`, `taskId` = task này). Lỗi giống `approve`.

#### `POST /tasks/:id/cancel` — huỷ task

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `reason` | tuỳ | string |

→ `CANCELLED`. Lỗi: `Error.TaskNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.PageNotEditable` (409) · `Error.TaskNotCancellable` (409 — đã `APPROVED`/`CANCELLED`).

#### `POST /tasks/:id/reassign` — giao lại cho Assistant khác

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `assistantId` | ✅ | string |

→ `ASSIGNED` (assistant mới), giữ lịch sử version cũ. Lỗi: `Error.TaskNotFound` (404) · `Error.NotSeriesOwner` (403) · `Error.TaskNotReassignable` (409) · `Error.AssistantNotHired` (409) · `Error.ChapterOnHold` (409) · `Error.PageNotEditable` (409).

---

## 4. Nhóm D — Studio (danh bạ + hợp tác) / Review / Hồ sơ Mangaka — 13 route

### 4.1. Narrative flow (Flow 9 — Assistant Directory)

Hệ thống **chỉ là danh bạ** — lương/deal thoả thuận ngoài hệ thống, KHÔNG lưu.

```
GET /assistants (danh bạ, lọc specialization/level/availability) → chọn 1 Assistant
    ↓
POST /collaboration-invites (series + hireStart–hireEnd bắt buộc + taskTypes) → PENDING
    ↓
Assistant accept (route Assistant) → StudioAssignment(ACTIVE) tự tạo
    ↓
[Flow 3 hoạt động] — chỉ giao task được cho Assistant có assignment ACTIVE + trong hire period
    ↓
Hết hạn hợp tác sớm → POST /studio-assignments/:id/terminate (Mangaka chủ động kết thúc)
    ↓
(tuỳ chọn, sau khi hợp tác) POST /assistant-reviews — rating 1-5 + comment → feed reputation
```

### 4.2. Bảng unhappy case

| Tình huống | Status/Error | Khi nào |
|---|---|---|
| Mời người không phải Assistant | 422 `Error.TargetNotAssistant` (path `assistantId`) | |
| `hireStart`/`hireEnd` không hợp lệ (start≥end, end quá khứ) | 422 `Error.InvalidHirePeriod` (path `hireEnd`) | |
| Đã có hợp tác `ACTIVE` khác với đúng cặp Mangaka-Assistant | 409 `Error.DuplicateActiveCollaboration` (path `assistantId`) | |
| Huỷ/xem invite không phải của mình | 403 `Error.NotInviteOwner` / 404 `Error.InviteNotFound` | |
| Terminate assignment không phải `ACTIVE` | 409 `Error.AssignmentNotActive` | |
| Đánh giá chính mình | 422 `Error.CannotReviewSelf` (path `targetId`) | |
| Đánh giá khi hợp tác chưa kết thúc | 422 `Error.ReviewRequiresEndedAssignment` (path `studioAssignmentId`) | Chỉ review sau khi assignment không còn `ACTIVE` |

### 4.3. Collaboration Invite

#### `POST /collaboration-invites` — mời Assistant cộng tác

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `assistantId` | ✅ | string | |
| `seriesId` | tuỳ | string | Metadata — **không validate** series tồn tại/sở hữu |
| `hireStart` | ✅ | ISO datetime (offset) | |
| `hireEnd` | ✅ | ISO datetime (offset) | Phải sau `hireStart` |
| `taskTypes` | ✅ (≥1) | `enum Specialization[]` | |

Response 201 `InviteRes`. Lỗi: `Error.AssistantNotFound` (404) · `Error.TargetNotAssistant` (422) · `Error.InvalidHirePeriod` (422) · `Error.DuplicateActiveCollaboration` (409).

#### `GET /collaboration-invites` — list (scope = mình gửi)

Query `status?` (`enum CollaborationInviteStatus`), `limit`/`offset`. Response `{ items: InviteListItem[], total, limit, offset }` (`InviteListItem` = `InviteRes` bỏ `taskTypes`).

#### `GET /collaboration-invites/:id` — chi tiết (đủ `taskTypes`)

`InviteRes`: `{id, mangakaId, assistantId, seriesId, hireStart, hireEnd, taskTypes, status: enum CollaborationInviteStatus, createdAt, mangaka?, assistant?, series?}`. Lỗi: `Error.InviteNotFound` (404 — bao gồm cả trường hợp không phải người gửi/nhận, tránh lộ dữ liệu).

#### `POST /collaboration-invites/:id/cancel` — huỷ invite của mình

Chỉ khi `PENDING`. → `CANCELLED`. Lỗi: `Error.InviteNotFound` (404) · `Error.NotInviteOwner` (403) · `Error.InviteNotPending` (409).

### 4.4. Studio Assignment

#### `GET /studio-assignments` — list hợp tác (scope = mình là Mangaka)

Query `status?` (`enum StudioAssignmentStatus`), `activeNow?` (`'true'|'false'`, lọc đang hiệu lực **và** trong `hireStart–hireEnd`), `limit`/`offset`. Response `{ items: AssignmentListItem[], total, limit, offset }` (bỏ `assignedTaskTypes`, `terminatedReason`).

#### `GET /studio-assignments/:id` — chi tiết

`AssignmentRes`: `{id, mangakaId, assistantId, seriesId, hireStart, hireEnd, assignedTaskTypes, status: enum StudioAssignmentStatus, terminatedReason, activeNow: boolean (tính lazy: ACTIVE và trong khoảng thời gian), createdAt, mangaka?, assistant?, series?}`. Lỗi: `Error.AssignmentNotFound` (404).

#### `POST /studio-assignments/:id/terminate` — kết thúc sớm

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `reason` | ✅ | string (1-500) |

→ `TERMINATED`. Lỗi: `Error.AssignmentNotFound` (404) · `Error.NotAssignmentOwner` (403) · `Error.AssignmentNotActive` (409).

### 4.5. Danh bạ + Đánh giá + Hồ sơ

#### `GET /assistants` — danh bạ trợ lý

Query `ListAssistantsQuery`: `q?` (tìm tên, ≤100), `specialization?` (`enum Specialization`), `level?`, `availableFrom?`/`availableTo?` (ISO datetime), `limit`/`offset`. Response `{ items: AssistantDirectoryItem[], total, limit, offset }` — mỗi item **kèm `email`/`phoneNumber` để liên hệ** (2026-08-04), gồm `{userId, displayName, avatar, email, phoneNumber, specializations, experienceLevel, portfolioFiles, availabilityStatus, availabilityFrom, availabilityTo, reputationScore, ratingAvg, ratingCount, isRecommended}`, ưu tiên `isRecommended`/reputation cao. ⚠ Danh bạ **chỉ liệt kê Assistant đã build hồ sơ** (`PUT /me/assistant-profile`); người mới đăng ký chưa build hồ sơ sẽ không xuất hiện.

#### `GET /mangakas` — danh bạ mangaka (đối xứng, dùng khi xem đồng nghiệp/franchise)

Query `ListMangakasQuery`: `q?`, `genre?` (`enum Genre`), `level?`, `limit`/`offset`. Response `{ items: MangakaDirectoryItem[], total, limit, offset }` — `{userId, displayName, avatar, email, phoneNumber, penName, genres, experienceLevel, bio, portfolioFiles, reputationScore, ratingAvg, ratingCount, isRecommended}` (**kèm `email`/`phoneNumber` để liên hệ** — 2026-08-04). ⚠ Chỉ liệt kê Mangaka đã build hồ sơ (`PUT /me/mangaka-profile`).

#### `POST /assistant-reviews` — đánh giá Assistant sau hợp tác

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `assistantId` | ✅ | string | |
| `rating` | ✅ | number (int 1-5) | |
| `comment` | tuỳ | string (≤1000) | |
| `studioAssignmentId` | ✅ | string | Assignment phải **không còn `ACTIVE`** |
| `seriesId` | tuỳ | string | |

`@@unique([mangakaId, assistantId])` ở DB — mỗi cặp chỉ review 1 lần (gọi lại → Prisma P2002 → 409). Response 201 `ReviewRes`. Lỗi: `Error.CannotReviewSelf` (422) · `Error.ReviewRequiresEndedAssignment` (422) · `Error.ProfileNotFound` (404 — hồ sơ Assistant chưa tồn tại).

#### `GET/PUT /me/mangaka-profile` — hồ sơ nghiệp vụ Mangaka

`PUT` (full upsert, **không phải patch** — gửi thiếu field nào thì field đó ghi đè về default):

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `penName` | ✅ | string (1-100) | |
| `genres` | tuỳ (default `[]`) | `enum Genre[]` | |
| `experienceLevel` | tuỳ | string | Tự do |
| `bio` | tuỳ | string | |
| `portfolioFiles` | tuỳ (default `[]`) | string[] | Object key R2 |

`GET` trả cùng shape: thêm `userId, reputationScore, ratingAvg, ratingCount, isRecommended` (⛔ read-only, tính từ `mangaka-reviews` do Editor chấm), `displayName?/avatar?`, `email`/`phoneNumber` (⛔ từ `User` — danh bạ nội bộ hiển thị contact, áp cả `GET /mangakas/:userId`), `hasProfile: boolean` (`false` = chưa từng PUT — field khác là default rỗng, **không phải 404**). Lỗi `GET`: `Error.ProfileNotFound` (404, hiếm gặp).

---

## 5. Nhóm E — Contract / Payment / Transfer / Reprint — 31 route

### 5.0. Nguyên tắc nền: Ownership Principle (áp toàn bộ nhóm E)

`Contract.contractType` là biến điều khiển xuyên suốt Flow 6/7/8:

| `contractType` | Quyền kiểm soát |
|---|---|
| `FULL_BUYOUT` | NXB (Board) toàn quyền tái bản/chuyển nhượng — **không cần hỏi Mangaka gốc** |
| `REVENUE_SHARE` | Mangaka giữ % sở hữu → **mọi quyết định lớn phải có Mangaka đồng ý** |

### 5.1. Contract — Narrative flow (Flow 6)

> 🔴 **§87 (2026-08-01) — flow ký đổi sang 2-PHASE.** Mangaka chỉ tham gia **Phase 2** (cuối), chỉ **accept hoặc reject**, KHÔNG có vòng thương lượng. State machine (`contract.constant.ts` → `CONTRACT_TRANSITIONS`):

```
DRAFT → BOARD_REVIEW → AWAITING_MANGAKA → FULLY_EXECUTED
AWAITING_MANGAKA → ACTIVATION_PENDING → FULLY_EXECUTED   (HĐ thay thế sau Transfer FULL_BUYOUT)
AWAITING_MANGAKA → REJECTED_BY_MANGAKA                    (Mangaka từ chối → Editor redraft HĐ MỚI)
DRAFT|BOARD_REVIEW|AWAITING_MANGAKA → VOIDED             (hủy trước ký)
FULLY_EXECUTED → {FULFILLED | TERMINATED | TERMINATED_BY_BREACH | EXPIRED}
```

⚠ **Đã XOÁ** (không còn route/status): `PATCH /contracts/:id/status`, `POST /contracts/:id/request-changes`, `POST /contracts/:id/signatures/mangaka`, và các status `MANGAKA_REVIEW`/`MANGAKA_APPROVED`/`BOARD_APPROVED`/`NEGOTIATION`/`MANGAKA_SIGNED`.

**Luồng mới với Mangaka:** Editor soạn HĐ → gửi Hội đồng duyệt (Phase 1 nội bộ: Board comment + 1 đại diện ký). Khi đại diện ký xong, HĐ sang **`AWAITING_MANGAKA`** → tới lượt Mangaka (nhận notification `CONTRACT`). Mangaka mở HĐ đọc điều khoản (`GET /contracts/:id`, `GET /contracts/:id/pdf` chỉ có sau executed) rồi chọn:

- **Đồng ý** → **`POST /contracts/:id/sign-mangaka { otpCode }`** (ký OTP) → `FULLY_EXECUTED` (hoặc `ACTIVATION_PENDING` nếu là HĐ replacement transfer) → emit `contract.executed`. Khoá, mọi thay đổi sau đó qua `ContractAmendment`.
- **Từ chối** → **`POST /contracts/:id/reject { reason }`** → `REJECTED_BY_MANGAKA` (terminal). KHÔNG quay vòng — Editor sẽ **redraft** một HĐ MỚI (clone điều khoản, `supersedesContractId`), Mangaka nhận HĐ mới để accept/reject lại.

**Giải ngân tự động** (Mangaka chỉ xem, không thao tác): mỗi `PaymentCondition` tự trigger khi đạt mốc (chapter/ranking/thời gian) → `PaymentRecord(TRIGGERED)` → Board duyệt → `PAID`.

### 5.2. Bảng unhappy case chung Contract/Amendment

| Tình huống | Status/Error | Khi nào |
|---|---|---|
| Xem/thao tác hợp đồng không phải của mình | 403 `Error.ContractAccessDenied` / `Error.NotContractMangaka` | |
| Accept/reject khi HĐ chưa `AWAITING_MANGAKA` | 409 `Error.ContractNotAwaitingMangaka` / `Error.InvalidContractTransition` | `sign-mangaka` / `reject` |
| Ký khi HĐ chưa sẵn sàng | 409 `Error.ContractNotSignableYet` (path `status`) | `sign-mangaka` |
| Ký lại lần 2 | 400 `Error.ContractAlreadySigned` | |
| Xuất PDF khi chưa `FULLY_EXECUTED` trở lên | 409 `Error.ContractNotExecutedForPdf` | `GET /contracts/:id/pdf` |
| Ký/từ chối phụ lục khi không `PENDING_SIGNATURES` | 409 `Error.AmendmentNotPendingSignatures` | |
| Ký/từ chối phụ lục của hợp đồng `FULL_BUYOUT` | 409 `Error.MangakaSignNotRequired` | Board toàn quyền, Mangaka không có vai trò ký |

#### `GET /contracts` — danh sách hợp đồng theo scope

Không query. **Response là mảng thô** `ContractListItemDto[]` (KHÔNG bọc `{items,total,...}` — khác quy ước phân trang chung, xem `01` §2). Mỗi item = `ContractRes` bỏ `boardDecision`, `terminationClause`, `sourceTransferRequestId`, `mangakaSignedAt`, `representativeSignedAt`, `mangakaRejectedAt`, `rejectionReason` (giữ `representativeId`/`representative`/`supersedesContractId`).

#### `GET /contracts/:id` — chi tiết hợp đồng

`ContractRes` (§87) — field quan trọng: `status: enum ContractStatus`, `contractType`, `valuationAmount`, `publisherOwnershipPct`/`mangakaOwnershipPct`, `terminationClause`, `contractStart`/`contractEnd`, `mangakaSignedAt` (null = Mangaka chưa ký), **`representativeId`/`representative` (Board đại diện), `representativeSignedAt` (đại diện đã ký chưa — quyết định HĐ đã sang lượt Mangaka hay chưa), `supersedesContractId` (HĐ này là bản redraft của HĐ nào), `rejectionReason`/`mangakaRejectedAt`**, `boardDecision` (`{id, decisionType, result, decidedAt, boardSession:{...}}`). ⚠ **Đã bỏ `boardSignedAt`**. Lỗi: `Error.ContractNotFound` (404) · `Error.ContractAccessDenied` (403).

#### `GET /contracts/:id/pdf` — tải PDF hợp đồng đã ký

Chỉ từ `FULLY_EXECUTED` trở lên (`PDF_EXPORTABLE_STATUSES`: `FULLY_EXECUTED`/`FULFILLED`/`TERMINATED`/`TERMINATED_BY_BREACH`/`EXPIRED`). Response `{ downloadUrl, expiresAt, key }`. Lỗi: `Error.ContractNotFound` (404) · `Error.ContractAccessDenied` (403) · `Error.ContractNotExecutedForPdf` (409).

#### `GET /contracts/:id/status` — trạng thái + tiến độ ký

Response `ContractStatusProgressRes` (§87): `{id, status, mangaka:{id,isSigned,signedAt}, representative:{id/null, claimed, signed, signedAt}}`. ⚠ Đã thay `boardProgress{...}` bằng `representative{...}` (chỉ 1 đại diện ký). Lỗi: `Error.ContractNotFound` (404) · `Error.NotContractMangaka` (403).

#### `POST /contracts/:id/sign-mangaka` — Accept + ký OTP (Phase 2) 🆕 §87

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `otpCode` | ✅ | string (đúng 6 ký tự) |

Chỉ khi HĐ `AWAITING_MANGAKA`. OTP `purpose=SIGNING_CONTRACT` (hệ thống gửi email khi HĐ tới `AWAITING_MANGAKA`). Ký xong → `FULLY_EXECUTED` (hoặc `ACTIVATION_PENDING` nếu HĐ replacement transfer) + emit `contract.executed`. Response 201 `ContractRes`.
Lỗi: `Error.ContractNotFound` (404) · `Error.NotContractMangaka` (403) · `Error.ContractNotAwaitingMangaka` / `Error.ContractNotSignableYet` (409) · `Error.ContractAlreadySigned` (400) · OTP sai/hết hạn → 422/410.

#### `POST /contracts/:id/reject` — Từ chối hợp đồng (Phase 2) 🆕 §87

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `reason` | ✅ | string (1-1000) |

Chỉ khi HĐ `AWAITING_MANGAKA` → `REJECTED_BY_MANGAKA` (terminal). Editor phải `redraft` HĐ mới; Mangaka sẽ nhận HĐ mới sau. Response 201 `ContractRes`.
Lỗi: `Error.ContractNotFound` (404) · `Error.NotContractMangaka` (403) · `Error.ContractNotAwaitingMangaka` / `Error.InvalidContractTransition` (409).

#### `GET /contracts/:id/versions` — lịch sử phiên bản

Response mảng thô `ContractVersionResDto[]` (không bọc). Mỗi phần tử: `{id, contractId, versionNumber, valuationAmount, publisherOwnershipPct, mangakaOwnershipPct, terminationClause, editedById, note, createdAt}`.

#### `GET /contracts/:id/versions/:versionId` — chi tiết 1 phiên bản

Cùng shape phần tử ở trên. Lỗi: `Error.ContractNotFound` (404) · `Error.ContractAccessDenied` (403).

### 5.3. Contract Amendment (Spec 4 — phụ lục sau `FULLY_EXECUTED`)

#### `GET /contracts/:contractId/amendments` — list phụ lục

Response mảng thô `AmendmentListItemDto[]` (= `AmendmentRes` bỏ `signatures/changedClauses/reason/terminationClause/voidReason/mangakaSignedAt/boardSignedAt`).

#### `GET /contracts/:contractId/amendments/:id` — chi tiết phụ lục

`AmendmentRes`: `{id, contractId, changedClauses: string[], reason, status: enum ContractAmendmentStatus, triggerSource: enum AmendmentTrigger, valuationAmount, publisherOwnershipPct, mangakaOwnershipPct, terminationClause, contractStart, contractEnd, mangakaSignedAt, boardSignedAt, fullyExecutedAt, voidReason, createdBy, creator?, createdAt, signatures?: [{id,amendmentId,userId,role,signedAt}]}`. Lỗi: `Error.AmendmentNotFound` (404) · `Error.ContractAccessDenied` (403).

#### `POST /contracts/:contractId/amendments/:id/sign/mangaka` — ký phụ lục

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `otpCode` | ✅ | string (6 ký tự) |

Chỉ áp dụng với hợp đồng `REVENUE_SHARE` (FULL_BUYOUT không cần Mangaka ký). Response 201 `AmendmentRes`. Lỗi: `Error.AmendmentNotPendingSignatures` (409) · `Error.MangakaSignNotRequired` (409) · `Error.NotContractMangaka` (403).

#### `POST /contracts/:contractId/amendments/:id/reject` — từ chối phụ lục

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `reason` | ✅ | string (≥1) |

→ về `DRAFT` (Editor sửa lại). Response 200 `AmendmentRes`. Lỗi: `Error.AmendmentNotPendingSignatures` (409) · `Error.MangakaSignNotRequired` (409) · `Error.NotContractMangaka` (403).

### 5.4. Payment Condition (chỉ đọc với Mangaka)

#### `GET /contracts/:contractId/payment-conditions` — danh sách điều kiện thanh toán

Response `PaymentConditionListRes = { data: PaymentConditionModel[] }` (bọc `data`, không phải `items`). Mỗi phần tử: `{id, contractId, conditionType: enum ConditionType, thresholdConfig (JSON tuỳ loại — vd `{chapter:N}` cho `CHAPTER_MILESTONE`, `{every:N}` cho `RECURRING_CHAPTER`, `{topRank:N}` cho `RANKING_MILESTONE`, `{deadline:"YYYY-MM-DD"}` cho `TIME_BOUND`), payoutAmount, payoutPct, isRecurring, status: enum PaymentConditionStatus, lastTriggeredValue, achievedAt}`. Lỗi: `Error.ContractNotFound` (404) · `Error.NotAssignedPaymentEditor` (403 — thực ra route cho phép MANGAKA/BOARD đọc, lỗi này chủ yếu áp cho Editor sai phụ trách).

### 5.5. Payment Record (chỉ đọc với Mangaka)

#### `GET /payments/:id` — chi tiết 1 khoản thanh toán

`PaymentRecordRes`: `{id, contractId, conditionId, receiverId, seriesId, description, approvedBy, approvedAt, paymentType: enum PaymentType, paymentSource: enum PaymentSource, amount, period, paymentMethod, transactionReference, status: enum PaymentRecordStatus, paidAt, cancelledAt, cancelReason, note, createdBy, createdAt, series?, receiver?, approver?}`. Lỗi: `Error.PaymentRecordNotFound` (404) · `Error.PaymentAccessDenied` — thực ra code `Error.PaymentAccessDenied` (403).

#### `GET /payments/contracts/:id/payments` / `GET /payments/series/:id/payments` / `GET /payments/users/:id/payments`

Không query đặc biệt (lọc theo path param). Response `PaymentRecordList = { data: PaymentRecordListItem[] }` (item bỏ bớt field audit-only: `description/note/cancelReason/transactionReference/paymentMethod/approvedBy/approvedAt/cancelledAt/createdBy/conditionId/approver`). `GET /payments/users/:id/payments`: Mangaka chỉ xem được của **chính mình** (`id === userId`), người khác → 403. Lỗi cả 3 route: `Error.PaymentAccessDenied` (403).

### 5.6. Transfer (Flow 8 — Chuyển nhượng)

**Narrative (nhánh Mangaka B — bên nhận):**

```
POST /transfers/requests (seriesId + planDescription + proposedType + proposedPercentage nếu PARTIAL) → SUBMITTED
    ↓
Board xem xét sơ bộ (route Board): board-approve/board-reject
    ↓
[Contract.contractType GỐC]
  FULL_BUYOUT → Board tự xử lý toàn bộ (assign-full-buyout) → COMPLETED, B nhận series ngay, KHÔNG cần B thao tác gì thêm
  REVENUE_SHARE → Editor start-negotiation → NEGOTIATING
      → Mangaka A (chủ gốc) mangaka-accept/mangaka-reject (route của A, KHÔNG phải B)
      → A đồng ý → Editor tạo TransferContract 3 bên
      → Ký: A → B → Board → FULLY_EXECUTED → COMPLETED
```

Mangaka **B** (bên xin nhận) dùng: `POST /transfers/requests`, `GET .../mine`, `GET .../:id`. Mangaka **A** (chủ gốc, REVENUE_SHARE) dùng: `POST .../:id/mangaka-accept`, `POST .../:id/mangaka-reject`. Cả 2 bên dùng chung: `POST /transfers/contracts/:id/sign`, `GET .../signatures`.

**Bảng unhappy case:**

| Tình huống | Status/Error | Khi nào |
|---|---|---|
| Series đã có Mangaka gửi request (chính mình đang sở hữu) | 409 `Error.TransferRequesterAlreadyOwnsSeries` | |
| Mangaka gửi request không phải `ACTIVE` | 403 `Error.TransferRequestingMangakaInactive` | BR-TRANSFER-01 |
| `proposedType`/`proposedPercentage` không khớp quy tắc | 422 `Error.InvalidTransferProposal` (path `proposedPercentage`) | `PARTIAL_TRANSFER` thiếu %/​≥100, hoặc `FULL_TRANSFER` mà có % |
| Accept/reject khi không ở `NEGOTIATING` | 400 `Error.RequestNotInNegotiatingStage` | |
| Xem/ký request không thuộc mình | 403 `Error.TransferAccessDenied` | |
| Ký lại lần 2 | 400 `Error.TransferAlreadySigned` | |
| OTP/email không khớp user | 404 `Error.TransferSignerNotFound` | |

#### `POST /transfers/requests` — Mangaka B tạo yêu cầu

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `seriesId` | ✅ | ObjectId | Series đang có Mangaka khác sở hữu |
| `planDescription` | ✅ | string (≥1) | Kế hoạch/hồ sơ năng lực |
| `proposedType` | ✅ | `enum TransferType` | `FULL_TRANSFER`\|`PARTIAL_TRANSFER` |
| `proposedPercentage` | tuỳ | number (0-100, dương) | **Bắt buộc và <100** nếu `PARTIAL_TRANSFER`; **cấm gửi** nếu `FULL_TRANSFER` |

Response 201 `TransferRequestRes`. Lỗi: `Error.NoActiveContractForSeries` (400) · `Error.TransferRequestingMangakaInactive` (403) · `Error.TransferRequesterAlreadyOwnsSeries` (409) · `Error.InvalidTransferProposal` (422).

#### `GET /transfers/requests/mine` — danh sách yêu cầu của tôi

Không query. Response `TransferRequestListRes = { data: TransferRequestListItem[] }` (15 field — giống detail nhưng bỏ `planDescription`).
⚠️ Route trả yêu cầu mà mình là **một trong hai phía** — cả tư cách B (người xin nhận) lẫn A (chủ gốc bị xin). Nếu bạn chưa từng gửi/nhận yêu cầu nào thì mảng rỗng là đúng, không phải lỗi.

#### `GET /transfers/requests/:id` — chi tiết

`TransferRequestRes`: `{id, seriesId, requestingMangakaId, originalMangakaId, series?, requestingMangaka?, originalMangaka?, originalContractType, proposedType, proposedPercentage, planDescription, originalContractId, `**`transferContractId`**`, status: enum TransferRequestStatus, boardDecisionId, createdAt}`. Lỗi: `Error.TransferRequestNotFound` (404) · `Error.TransferAccessDenied` (403).

🆕 **`transferContractId`** (Spec 27, 2026-07-29) — id hợp đồng **chuyển nhượng** đã soạn cho yêu cầu này; `null` khi Editor chưa soạn. **Đây là cách duy nhất Mangaka lấy được id để gọi `GET /transfers/contracts/:id` và `POST /transfers/contracts/:id/sign`.** Có mặt ở cả `/mine` lẫn `/:id`. ⚠️ Field này **chỉ đảm bảo ở 3 route GET request**; response của các route mutation (`POST /transfers/requests`, `mangaka-accept`, `mangaka-reject`…) **không mang** field này — đúng quy ước embed additive (Spec 20), và ở các mốc đó hợp đồng chưa tồn tại nên cũng không mất gì.

#### `POST /transfers/requests/:id/mangaka-accept` / `mangaka-reject` — Mangaka **A** (chủ gốc) phản hồi

Không body. Chỉ khi `status === NEGOTIATING`. `accept` → tiếp tục soạn `TransferContract`; `reject` → `REJECTED_BY_ORIGINAL_MANGAKA`. Lỗi: `Error.TransferRequestNotFound` (404) · `Error.RequestNotInNegotiatingStage` (400) · `Error.TransferAccessDenied` (403).

#### `POST /transfers/contracts/:id/sign` — ký hợp đồng chuyển nhượng 3 bên

**Lấy `:id` (`transferContractId`) ở đâu — 🆕 Spec 27 (2026-07-29):** đọc field **`transferContractId`** ở bất kỳ route GET request nào (`GET /transfers/requests/mine`, `GET /transfers/requests/:id`). Field này `null` khi Editor chưa soạn hợp đồng, có giá trị ngay khi Editor tạo xong. Trước Spec 27 field này **không tồn tại** ⇒ Mangaka không có đường lấy id để ký (chỉ Editor thấy id trong response lúc tạo); nếu bạn đọc tài liệu/code cũ hơn 2026-07-29 thì đó là lý do.

🔔 **Nay CÓ notification chủ động (§84, 2026-07-29) — không phải tự vào dò nữa.** Trước đó cả chuỗi ký
A → B → Hội đồng **im lặng hoàn toàn**: hợp đồng soạn xong không ai được báo, A ký xong B không biết đến lượt.
Nay mỗi mốc đều bắn notification (`NotificationType.CONTRACT`, đọc qua `GET /notifications`):

| Thời điểm | Người nhận | `referenceType` | `referenceId` |
|---|---|---|---|
| Editor soạn xong hợp đồng | **Mangaka A** (ký trước) + **Mangaka B** | `TRANSFER_CONTRACT_DRAFTED` | `transferContractId` |
| A ký xong → tới lượt B | **Mangaka B** | `TRANSFER_CONTRACT_AWAITING_SIGNATURE` | `transferContractId` |
| B ký xong → tới lượt Hội đồng | **Board roster của phiên** | `TRANSFER_CONTRACT_AWAITING_SIGNATURE` | `transferContractId` |
| Hoàn tất chuyển nhượng | Mangaka B | `TRANSFER_SETTLEMENT_COMPLETED` | `transferRequestId` |

⚠️ `referenceId` của 3 dòng đầu là **`transferContractId`** (dùng thẳng cho `GET /transfers/contracts/:id`),
dòng cuối là **`transferRequestId`** — đừng dùng lẫn. Notification là **best-effort** (`notifySafe`): nếu hệ thống
thông báo lỗi thì hợp đồng **vẫn được tạo/ký bình thường** — FE không được coi "không thấy notification" là
"chưa có hợp đồng", vẫn phải đọc `transferContractId` từ route GET làm nguồn sự thật.

⚠️ **Đừng nhầm `originalContractId` với `transferContractId`** — `originalContractId` là **Contract (hợp đồng XUẤT BẢN)** đang có hiệu lực của series, dùng làm căn cứ chuyển nhượng; nó **không** gọi được với `/transfers/contracts/:id/*`.

**Nên gọi `GET /transfers/contracts/:id` (🆕 Spec 27, mô tả ngay dưới) TRƯỚC khi ký** để đọc điều khoản — nếu không thì đang ký mù.

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `otpCode` | ✅ | string (6 ký tự) |

Vai trò ký (`TransferSignerRole`): `MANGAKA_A` (chủ gốc) → `MANGAKA_B` (bên nhận) → `BOARD`. Route dùng chung MANGAKA (cả A lẫn B) và BOARD_MEMBER — service tự xác định vai trò theo `userId`. Response 201 `MessageResDto`. Lỗi: `Error.TransferContractNotFound` (404) · `Error.TransferSignerNotFound` (404) · `Error.TransferAlreadySigned` (400) · `Error.TransferContractNotFoundAfterUpdate` (404) · `Error.TransferAccessDenied` (403).

#### `GET /transfers/contracts/:id` — 🆕 chi tiết hợp đồng chuyển nhượng (đọc điều khoản trước khi ký)

Không tham số ngoài `:id`. Cho phép: **Mangaka A** (bên nhượng) · **Mangaka B** (bên nhận) · **Editor phụ trách series** · **Board member trong roster quyết định TRANSFER** · **Super Admin**. Mangaka ngoài giao dịch → 403.

| Field response | Kiểu | Ghi chú |
|---|---|---|
| `id`, `transferRequestId`, `seriesId` | string \| null | |
| `fromMangakaId` / `toMangakaId` | string \| null | A (nhượng) / B (nhận) |
| `series`, `fromMangaka`, `toMangaka` | mini embed | hiển thị tên, không phải logic |
| `transferType` | `enum TransferType` | `FULL_TRANSFER` \| `PARTIAL_TRANSFER` |
| `transferAmount` | number \| null | **số tiền B trả A** |
| `newOwnershipSplit` | `Record<string, number>` \| null | tỷ lệ sở hữu MỚI, tổng = 100. `null` nếu dữ liệu cũ ghi sai shape (BE narrow an toàn thay vì ném lỗi) |
| `coOwnerApprovalRequired` | boolean | `true` ⇒ sau khi ký xong, mỗi chapter mới phải A duyệt (BR-TRANSFER-03) |
| `status` | `enum TransferContractStatus` | `DRAFT → A_SIGNED → B_SIGNED → BOARD_SIGNED → FULLY_EXECUTED` (hoặc `VOIDED`) |
| `createdAt` | string (ISO) | |
| `signatures[]` | array | `{id, transferContractId, userId, role: enum TransferSignerRole, signedAt}` |

**Dùng `status` để biết tới lượt ai ký:** `DRAFT` = chờ A · `A_SIGNED` = chờ B · `B_SIGNED` = chờ Board. Ký sai lượt → `Error.InvalidTransferState` (409).
**Lỗi:** `Error.TransferContractNotFound` (404 — kể cả id rác không phải ObjectId) · `Error.TransferAccessDenied` (403).

#### `GET /transfers/contracts/:id/signatures` — danh sách chữ ký

Response `{ signatures: [{id, transferContractId, userId, role: enum TransferSignerRole, signedAt}] }`. Lỗi: `Error.TransferContractNotFound` (404) · `Error.TransferAccessDenied` (403).
> Route này là **tập con** của `GET /transfers/contracts/:id` ở trên (cùng RBAC). Nếu cần cả điều khoản lẫn chữ ký thì gọi route detail, khỏi gọi 2 lần.

### 5.7. Reprint (Flow 7 — Tái bản, chỉ đọc + phản hồi với Mangaka)

**Narrative:** Editor tạo `ReprintRequest` → nếu `FULL_BUYOUT` gốc, Board tự duyệt nội bộ (Mangaka **không** tham gia review, nhưng vẫn có thể được `assign-reviser` nếu revisionMode=`WITH_REVISION` và Mangaka gốc không hợp tác thì Board giao Mangaka khác/đội nội bộ); nếu `REVENUE_SHARE` gốc, Mangaka phải review:

```
PROPOSED → [REVENUE_SHARE] PATCH /reprint-requests/:id/mangaka-review {accept:true|false}
    accept → MANGAKA_REVIEW (chờ Board) → Board duyệt → APPROVED → IN_PRODUCTION
    reject → REJECTED_BY_MANGAKA
    ↓ [IN_PRODUCTION] mỗi ReprintChapter (map theo originalChapterId):
        AS_IS → dùng nguyên bản gốc
        WITH_REVISION → Mangaka sửa qua PATCH .../chapters/:chapterId/manuscript {manuscriptFile}
    ↓ Editor duyệt từng chapter (route Editor) → khi TẤT CẢ chapter APPROVED → tự động publish → PUBLISHED
```

**Bảng unhappy case:**

| Tình huống | Status/Error | Khi nào |
|---|---|---|
| Chuyển trạng thái sai bước | 409 `Error.InvalidReprintTransition` (path `status`) | |
| Hành động không được phép theo Ownership Principle | 403 `Error.ReprintActionNotAllowed` (path `status`) | vd Mangaka cố review request `FULL_BUYOUT` |
| Cập nhật manuscript cho chapter không tồn tại trong request | 404 `Error.ReprintChapterNotFound` | |

#### `GET /reprint-requests` — danh sách (scope theo role)

Query raw (không qua Zod strict — sai giá trị **không** trả 422, chỉ lọc không khớp): `status?` (string), `seriesId?` (string). Response mảng thô `[ReprintRequestListItem]` (bỏ `chapters`, `reason`).

#### `GET /reprint-requests/:id` — chi tiết

`ReprintRequestRes`: `{id, seriesId, requestedBy, revisionMode: enum ReprintRevisionMode|null, reason, chapterRangeStart, chapterRangeEnd, status: enum ReprintRequestStatus, mangakaApprovedAt, boardApprovedAt, publishedAt, createdAt, chapters: ReprintChapter[], series?, requester?}`. Với Mangaka, `chapters[]` đã lọc chỉ những chapter mình có quyền đọc (`filterReadableChapters`). Lỗi: `Error.ReprintRequestNotFound` (404).

#### `GET /reprint-requests/:id/chapters` — danh sách chapter trong request

Response mảng thô `[ReprintChapterRes]`. Mỗi phần tử: `{originalChapterId, manuscriptFile, status: enum ReprintChapterStatus, reviserId, reviserType: enum ReviserType|null}` (embedded type, KHÔNG có `id` riêng — định danh bằng `originalChapterId`).

#### `GET /reprint-requests/:id/chapters/:chapterId` — chi tiết 1 chapter

⚠ `:chapterId` chính là **`originalChapterId`** của chapter gốc đã `PUBLISHED` (không phải id riêng của bản ghi tái bản). Lỗi: `Error.ReprintRequestNotFound` (404) · `Error.ReprintChapterNotFound` (404).

#### `PATCH /reprint-requests/:id/chapters/:chapterId/manuscript` — nộp bản thảo sửa đổi

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `originalChapterId` | ✅ | string (khớp `:chapterId`) |
| `manuscriptFile` | ✅ | string (object key R2) |

Chỉ áp dụng khi `revisionMode = WITH_REVISION`. Response 200 `ReprintRequestRes`. Lỗi: `Error.ReprintRequestNotFound` (404) · `Error.ReprintChapterNotFound` (404) · `Error.InvalidReprintTransition` (409) · `Error.ReprintActionNotAllowed` (403).

#### `PATCH /reprint-requests/:id/mangaka-review` — Mangaka phản hồi (chỉ áp dụng `REVENUE_SHARE`)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `accept` | ✅ | boolean | `true`→`MANGAKA_APPROVED`-ish (chờ Board); `false`→`REJECTED_BY_MANGAKA` |
| `reason` | tuỳ | string | |

Lỗi: `Error.ReprintRequestNotFound` (404) · `Error.ReprintActionNotAllowed` (403 — vd request gốc `FULL_BUYOUT`) · `Error.InvalidReprintTransition` (409).

---

## 6. Nhóm F — Deadline / Publication / Ranking / Dashboard / Revision / Annotation — 17 route

### 6.1. Deadline Negotiation (Flow 10)

State machine (`deadline.constant.ts` → `DEADLINE_REQUEST_TRANSITIONS`):

```
PROPOSED → {COUNTER_PROPOSED, AGREED_BY_PARTIES, ESCALATED, REJECTED}
COUNTER_PROPOSED → {COUNTER_PROPOSED (lặp), AGREED_BY_PARTIES, ESCALATED, REJECTED}
AGREED_BY_PARTIES → {APPROVED (Editor chốt, !affectsSlot), BOARD_REVIEW (affectsSlot)}
BOARD_REVIEW / ESCALATED → {APPROVED, REJECTED}   (Board quyết — route riêng, không phải MANGAKA)
```

Bên khởi tạo (`requestedBy`) tạo `POST /deadline-requests`; bên kia (`resolveSide` — so `series.mangakaId`/`series.editorId` với `userId`) phản hồi bằng `counter`/`agree`/`reject`; chỉ người khởi tạo mới `withdraw` được. `affectsSlot` tự tính (`computeAffectsSlot`): deadline mới trễ hơn deadline hiện tại quá `graceHours` → coi là ảnh hưởng slot xuất bản → phải qua Board, không cho Editor tự chốt.

**Bảng unhappy case:**

| Tình huống | Status/Error | Khi nào |
|---|---|---|
| Chapter đã có deadline-request đang mở | 409 `Error.OpenDeadlineRequestExists` | Mỗi chapter chỉ 1 request mở tại 1 thời điểm |
| Không phải Mangaka/Editor của chapter | 403 `Error.DeadlineRequestAccessDenied` (thực chất `Error.DeadlineRequestAccessDenied`) | |
| Phản hồi (`counter`/`agree`/`reject`) không phải bên đối ứng | 403 `Error.NotCounterparty` | |
| Chuyển trạng thái sai bước | 409 `Error.InvalidDeadlineRequestTransition` | |
| Tạo request khi điều kiện không cho phép | 409 `Error.DeadlineRequestNotAllowed` | vd chapter đã publish |

#### `POST /deadline-requests` — tạo yêu cầu đổi deadline

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `chapterId` | ✅ | string | |
| `requestedDeadline` | ✅ | ISO datetime (offset) | Phải ở tương lai |
| `reason` | ✅ | string (1-1000) | |

Response 201 `DeadlineRequestRes`. Lỗi: `Error.DeadlineRequestNotFound` (404) · `Error.DeadlineRequestAccessDenied` (403) · `Error.OpenDeadlineRequestExists` (409) · `Error.DeadlineRequestNotAllowed` (409).

#### `POST /deadline-requests/:id/counter` — đề xuất deadline khác

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `requestedDeadline` | ✅ | ISO datetime (tương lai) |
| `reason` | ✅ | string (1-1000) |

→ `COUNTER_PROPOSED`. Lỗi: `Error.DeadlineRequestNotFound` (404) · `Error.DeadlineRequestAccessDenied` (403) · `Error.NotCounterparty` (403) · `Error.InvalidDeadlineRequestTransition` (409).

#### `POST /deadline-requests/:id/agree` — đồng ý deadline hiện đề xuất

Không body → `AGREED_BY_PARTIES`. Lỗi giống `counter`.

#### `POST /deadline-requests/:id/reject` — từ chối (bất đồng)

| Field | Bắt buộc | Kiểu |
|---|---|---|
| `reason` | ✅ | string (1-1000) |

→ `ESCALATED` (leo Board). Lỗi giống `counter`.

#### `POST /deadline-requests/:id/withdraw` — người khởi tạo rút yêu cầu

Không body → `REJECTED` (terminal). Lỗi: `Error.DeadlineRequestNotFound` (404) · `Error.DeadlineRequestAccessDenied` (403) · `Error.InvalidDeadlineRequestTransition` (409).

#### `GET /deadline-requests` — list theo chapter

Query: `chapterId` (✅ bắt buộc), `status?` (`enum DeadlineRequestStatus`). Response `{ items: DeadlineRequestListItem[] }` (bỏ `reason/boardReviewedBy/scheduleId/resolvedAt`).

#### `GET /deadline-requests/:id` — chi tiết

`DeadlineRequestRes`: `{id, scheduleId, chapterId, seriesId, requestedBy ('MANGAKA'|'EDITOR'), lastProposedBy, currentDeadline, requestedDeadline, reason, affectsSlot: boolean, status: enum DeadlineRequestStatus, boardReviewedBy, resolvedAt, createdAt, series?, chapter?}`. Lỗi: `Error.DeadlineRequestNotFound` (404) · `Error.DeadlineRequestAccessDenied` (403).

### 6.2. Publication Version (chỉ đọc với Mangaka)

#### `GET /series/:seriesId/publication-versions` — list phiên bản phát hành

Response `{ items: PublicationVersionRes[] }`. Mỗi phần tử: `{id, seriesId, language, readingDirection: enum ReadingDirection, versionType ('ORIGINAL'|'DIGITAL'|'FLIPPED'|null — literal string, KHÔNG phải Prisma enum), notes, createdAt}`. Lỗi: `Error.SeriesNotFound` (404) · `Error.SeriesAccessDenied` (403).

#### `GET /publication-versions/:id` — chi tiết 1 phiên bản

Cùng shape trên. Lỗi: `Error.PublicationVersionNotFound` (404) · `Error.SeriesAccessDenied` (403).

### 6.3. Ranking (Flow 4/5 — chỉ đọc)

#### `GET /rankings` — trend xếp hạng 1 series (scoped theo owner)

Query `GetSeriesTrendQuery`: `seriesId` (✅), `periods` (tuỳ, 1-60, default 12). Response `{ items: BoardRankingItem[] }` — mỗi phần tử: `{seriesId, surveyPeriodId, magazine, publicationType, issueNumber, rankPosition?, voteCount, normalizedScore, previousRank, rankChange, isAtRisk, riskLevel: enum RiskLevel, isReliable, recordedAt}` (bỏ `consecutiveAtRiskCount` so với bản đầy đủ). Lỗi: `Error.RankingAccessDenied` (403 — series không thuộc mình) · `Error.SeriesNotFound` (404, code thật trả `Error.SeriesNotFound` dù tên exception là `SeriesNotFoundForRankingException`).

#### `GET /rankings/board` — bảng xếp hạng toàn tạp chí 1 kỳ (full, mọi role nội bộ — không scope owner)

Query `surveyPeriodId` (string, path qua `@Query`). Response cùng shape `BoardRankingListRes` ở trên nhưng liệt kê **mọi** series trong kỳ đó (không giới hạn series của mình — dùng để Mangaka so sánh vị trí mình với series khác). Lỗi: `Error.SurveyPeriodNotFound` (404).

✅ **Lấy `surveyPeriodId` ở đâu? (W1 — 2026-08-02: Mangaka NAY GỌI ĐƯỢC `GET /survey-periods`).** 3 đường:
1. **`GET /survey-periods?magazine=&publicationType=&status=&limit=&offset=`** 🆕 — route nội bộ nay mở cho **MANGAKA** (+EDITOR/BOARD/SUPER_ADMIN). Có **filter** (magazine/publicationType/status) + **phân trang**; response nay là **`{ items, total, limit, offset }`** (⚠ trước là mảng thô — breaking). Mỗi item = `SurveyPeriodRes` (kèm `id`). Đây là cách chuẩn để Mangaka lấy `surveyPeriodId`.
2. **`GET /vote/periods?magazine=&publicationType=&limit=`** — route public (kỳ đã `REFLECTED`), vẫn dùng được.
3. `GET /dashboard/mangaka` chỉ có `recordedAt` (không có `surveyPeriodId`) — chỉ hiển thị hạng gần nhất.

✅ **Ranking tổng hợp nhiều kỳ CÓ tín hiệu nguy cơ (W1):** **`GET /rankings/internal/aggregate?magazine=&publicationType=&level=MONTH|YEAR&year=&month=`** 🆕 — bản nội bộ của `/rankings/aggregate`, gộp nhiều kỳ REFLECTED theo `averageNormalizedScore` NHƯNG mỗi item **có thêm `isAtRisk`/`riskLevel`/`isReliable`** (record kỳ mới nhất). Mangaka gọi được. (Route public `/rankings/aggregate` vẫn ẩn 3 tín hiệu này.) Muốn xu hướng 1 series thì dùng `GET /rankings?seriesId=&periods=N` như trên.

> **Lưu ý nghiệp vụ (đối chiếu Requiment 2.1d):** Requiment mô tả "ranking phản ánh kết quả bình chọn từ ~8 tuần trước" cho mô hình postcard giấy — nhưng hệ thống số hoá vote online **ghi nhận tức thời, không có độ trễ nhân tạo** (xem Flow 4 note "Quyết định logic về độ trễ 8 tuần"). Field `issueNumber` (kỳ áp dụng) và `reflectedIssueNumber` (kỳ dữ liệu thực phản ánh) chỉ khác nhau khi Editor **nhập offline** (postcard); vote online mặc định 2 trường bằng nhau. Series mới có `< 8 chương` hoặc đang `HIATUS` được loại trừ khỏi đánh giá nguy cơ (`isAtRisk`).

### 6.4. Dashboard

#### `GET /dashboard/mangaka` — dashboard tổng hợp

Không tham số. Response `MangakaDashboardRes`:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `studio` | `StudioOverviewItem[]` | Giống hệt `GET /studio/overview` §2.3 |
| `rankings` | `DashboardRankingItem[]` | Ranking **kỳ gần nhất** của từng series thuộc Mangaka — `{seriesId, seriesTitle, seriesStatus: enum SeriesStatus, rankPosition, voteCount, previousRank, rankChange, riskLevel: enum RiskLevel, isAtRisk, recordedAt}` |
| `unreadNotifications` | number | Badge chuông |
| `openRevisionRequests` | number | Số vòng yêu cầu sửa còn mở mà Mangaka phải xử lý (dùng cùng nguồn `GET /revision-requests`) |

#### `GET /dashboard/mangaka/earnings` — thu nhập tổng hợp từ `PaymentRecord`

Response `MangakaEarningsRes`: `{totalPaid, totalPending, totalMissed, byStatus: Record<enum PaymentRecordStatus, {count,amount}> (zero-filled), byType: Record<enum PaymentType, {count,amount}> (zero-filled), recent: [{id, amount, status: enum PaymentRecordStatus, paymentType: enum PaymentType, seriesId, period, paidAt, createdAt}]}`.

### 6.5. Revision Request (theo dõi vòng yêu cầu sửa xuyên suốt mọi module)

`RevisionRequest` là entity dùng chung cho **4 nguồn** request-revision: Proposal (§1), Name (§1/§2), Manuscript (§2), Task (§3) — mỗi nguồn tăng `round` riêng theo `targetType+targetId`.

#### `GET /revision-requests` — list (scope: mình yêu cầu hoặc mình phải sửa)

Query `ListRevisionRequestsQuery`: `targetType?` (`enum RevisionTargetType`), `targetId?`, `isResolved?` (`'true'|'false'`, omit = tất cả), `limit`/`offset`. Response `{ items: RevisionRequestRes[], total, limit, offset }` — **không có route detail riêng** (`GET /revision-requests/:id` không tồn tại) nên list trả **đầy đủ** field, không rút gọn:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `targetType` | `enum RevisionTargetType` | `PROPOSAL`\|`NAME`\|`MANUSCRIPT`\|`TASK` |
| `targetId` | string | `seriesId`\|`storyboardId`\|`chapterId`\|`taskId` tuỳ `targetType` |
| `round` | number | Lần yêu cầu sửa thứ mấy trên cùng target |
| `reason` | string | Nội dung cần sửa — **bắt buộc đọc trước khi resolve** |
| `recipientId` | string | Người phải sửa — chỉ người này resolve được |
| `isResolved` / `resolvedAt` / `resolvedBy` | | |
| `resolver` | `UserMini`\|null | Tên người đã resolve (bù cho việc Mangaka không có endpoint resolve id→tên Assistant) |
| `series` | `SeriesMini`\|null | |

#### `PATCH /revision-requests/:id/resolve` — đánh dấu đã sửa xong

Không body, idempotent (gọi lại khi đã `isResolved=true` không lỗi). Chỉ **`recipientId === userId`** mới resolve được. Response 200 `RevisionRequestRes`. Lỗi: `Error.RevisionRequestNotFound` (404) · `Error.NotRevisionRecipient` (403).

### 6.6. Annotation (markup review — dùng chung Task review §3, Manuscript review §2, Name review §1)

#### `POST /annotations` — tạo markup

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `targetType` | ✅ | `enum AnnotationTargetType` | `PAGE`\|`REGION`\|`TASK`\|`MANUSCRIPT`\|`NAME` |
| `targetId` | ✅ | string | |
| `annotationType` | ✅ | `enum AnnotationType` | `TEXT`\|`HIGHLIGHT`\|`DRAWING` |
| `coordinates` | tuỳ | object tự do (record) | Toạ độ vẽ tay/khoanh vùng — FE tự định nghĩa shape |
| `content` | tuỳ | string (≤5000) | Nội dung ghi chú |
| `reviewStage` | tuỳ | `enum ReviewStage` | `ASSISTANT`\|`MANGAKA`\|`EDITOR` — ngữ cảnh đang review ai |
| `taskId` | tuỳ | string | Bắt buộc thực tế khi review task (Flow 3 — Mangaka annotate khi `request-revision` một task) |

Response 201 `AnnotationRes`. Lỗi: `Error.AnnotationForbidden` (403) · `Error.AnnotationTargetNotFound` (422, path `targetId`) · `Error.AnnotationTaskBindingInvalid` (422, path `taskId` — `taskId` không khớp `targetId`/`targetType`).

#### `GET /annotations` — list theo target (bắt buộc cả `targetType`+`targetId`)

Query `ListAnnotationQuery`: `targetType` (✅, `enum AnnotationTargetType`), `targetId` (✅), `limit`/`offset` (≤100, default 20). **Không có route detail riêng** (`GET /annotations/:id` không tồn tại) nên list trả đầy đủ `content` (không rút gọn) — bù bằng phân trang bắt buộc. Response `{ items: AnnotationRes[], total, limit, offset }`. `AnnotationRes`: `{id, taskId, authorId, authorRole (RoleCode của người tạo), targetType, targetId, annotationType, reviewStage, coordinates, content, isResolved, resolvedAt, createdAt, author?}`. Lỗi: `Error.AnnotationForbidden` (403) · `Error.AnnotationTargetNotFound` (422).

> Route dùng chung (AUTH, không thuộc 127 nhưng Mangaka cũng dùng): `PATCH /annotations/:id/resolve` (chỉ author tự resolve) và `DELETE /annotations/:id` (chỉ author tự xoá) — lỗi `Error.AnnotationForbidden` (403) / `Error.AnnotationNotFound` (404).

---

## 7. Xác nhận cuối cùng & phát hiện đáng chú ý

**Đủ 127/127 route** (Spec 30/31, 2026-08-04) — script parse `route-roles.ts` cho đúng **127** route có `RoleCode.MANGAKA` trong `allowed[]`. So với Spec 28 (123): contract Phase-2 §87 net **−1** (bỏ `PATCH /contracts/:id/status`, `request-changes`, `signatures/mangaka`; thêm `sign-mangaka`, `reject`) → 122; rồi **W1 +2** (mở `GET /survey-periods` cho Mangaka + thêm `GET /rankings/internal/aggregate`) → 124; rồi **Spec 30: +4 /series-requests −1 propose-completion** → **127**. *(Số breakdown A–F theo nhóm chỉ mang tính điều hướng; nguồn chuẩn tuyệt đối là `route-roles.ts`.)*

**Phát hiện đáng chú ý so với 2 guide cũ (`FE-API-Guide-v3.md`/`FE-Mobile-RN-Guide.md` — chỉ liếc văn phong, không dùng làm nguồn):**

1. **Contract Phase 2 (§87): Mangaka chỉ có 2 action** — `POST /contracts/:id/sign-mangaka` (accept + OTP) hoặc `POST /contracts/:id/reject` (+lý do), chỉ khi HĐ `AWAITING_MANGAKA`. KHÔNG còn `PATCH /contracts/:id/status`/`request-changes` (đã xoá) và KHÔNG có vòng thương lượng — reject là terminal, Editor redraft HĐ mới.
2. **Đơn vị duyệt sản xuất là Task, không phải Page** — `PageStatus` hoàn toàn backend-driven (không có route cho Mangaka set trực tiếp); "trang sẵn sàng" là suy ra từ Task, khớp đúng ghi chú SRS §2.1c nhưng dễ bị hiểu nhầm nếu chỉ đọc tên enum.
3. **`GET /contracts`, `GET /contracts/:id/versions`, `GET /contracts/:contractId/amendments`, `GET /reprint-requests` và các route con của nó trả MẢNG THÔ**, không bọc `{items,total,limit,offset}` như đa số route khác — FE phải xử lý 2 kiểu response khác nhau tuỳ route (đã ghi rõ trong từng mục ở trên).
4. **`reprint-requests/:id/chapters/:chapterId`** — `:chapterId` param thực chất là `originalChapterId` (id của chapter gốc đã `PUBLISHED`), KHÔNG phải id riêng của bản ghi `ReprintChapter` (embedded type không có `id`).
5. **`RevisionRequest`/`Annotation` list trả đầy đủ field** (không tách list-item rút gọn như đa số resource khác) vì 2 module này **không có route detail riêng** — đây là fix có chủ đích gần đây (thấy note "Spec 25" trong code) để tránh mất field `reason`/`content`/`resolver` khỏi mọi đường GET.
6. **Franchise consent (`franchise-consent`)** chỉ gọi được bởi Mangaka của series **gốc**, không phải Mangaka của series phái sinh đang tạo — dễ nhầm vai trò nếu chỉ đọc tên route.
7. **`AssistantProfile`/`MangakaProfile` dùng PUT full-upsert** (không phải PATCH partial) — gửi thiếu field nào thì field đó về default (`[]`/`undefined`), khác hẳn quy tắc "omit = giữ nguyên" của các PATCH khác trong hệ thống (xem `01` §2 ngoại lệ).
8. **Không có route nào cho Mangaka tự đặt/gia hạn deadline chapter trực tiếp** (`PUT /chapters/:id/schedule`, `PATCH .../schedule/extend` là EDITOR-only) — Mangaka chỉ tác động deadline qua `deadline-requests` (thương lượng, Flow 10).

Không phát hiện enum nào ngoài 66 enum đã liệt kê ở `01` §7 trong toàn bộ 124 route (đã verify từng schema Zod).
