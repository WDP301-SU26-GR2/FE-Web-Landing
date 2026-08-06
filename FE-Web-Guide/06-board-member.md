# §06 — BOARD_MEMBER (Thành viên Hội đồng Biên tập)

> 🔴 **2026-08-06 — xem [`08-spec-2026-08-06-magazines-decisions-flows.md`](08-spec-2026-08-06-magazines-decisions-flows.md) (có FLOW ③ phiên họp chi tiết):** `DecisionType` còn **8 giá trị** (bỏ `CONTINUE`/`CANCEL`/`HIATUS`/`ENDING_ALLOWANCE`; "giữ bộ truyện" = mở `CANCELLATION` rồi vote **REJECT**); `POST /board/decisions` siết gate (1 series = 1 quyết định mở); báo cáo trùng → 409 `BoardReportAlreadyExists`; `reportType` text tự do.
>
> **Nguồn:** đọc trực tiếp `BE-dev/src/modules/board/*` (controller/gateway/services/schemas/errors — trọng tâm), `BE-dev/src/modules/contract/*` (contract + amendment + payment-condition controller), `BE-dev/src/modules/payment/*`, `BE-dev/src/modules/reprint/*`, `BE-dev/src/modules/transfer/*`, `BE-dev/src/modules/deadline/*`, `BE-dev/src/modules/series/*`, `BE-dev/src/modules/tankobon/*`, `BE-dev/src/modules/survey/*`, `BE-dev/src/modules/publication/*`, `BE-dev/src/modules/audit/*`, `BE-dev/src/modules/users/*`, `BE-dev/src/modules/chapter/*`, `BE-dev/src/modules/storyboard/*`, `BE-dev/src/modules/revision/*`, `BE-dev/src/modules/task/*`, đối chiếu quyền route với `BE-dev/test/flows/route-roles.ts`. Ngày dựng: 2026-07-27; cập nhật Spec 28: 2026-08-01; §87 contract 2-phase: 2026-08-02.
> Đọc trước [`00-INDEX.md`](00-INDEX.md) (mục lục) và **bắt buộc** [`01-conventions-and-auth.md`](01-conventions-and-auth.md) (envelope, lỗi, phân trang, upload R2, enum §7, `GET/PATCH /me`) — file này KHÔNG lặp lại các quy ước đó.
> Enum ghi dạng `enum X` → tra giá trị đầy đủ ở `01-conventions-and-auth.md` §7.

---

## 0. Tổng quan phạm vi — 80 route độc quyền BOARD_MEMBER

Đối chiếu `test/flows/route-roles.ts` (sinh tự động từ Reflect metadata runtime — nguồn sự thật duy nhất về quyền): BOARD_MEMBER có đúng **80 route** trong `allowed[]` sau Spec 30/31 (78 + 2 route đọc `GET /series-requests` và `GET /series-requests/:id` — Hội đồng theo dõi yêu cầu của tác giả, KHÔNG duyệt: duyệt là việc của biên tập viên phụ trách). Hai route proposal-Name đã bị xoá; hai route chapter-Name được đổi sang Storyboard.

| # | Method | Path | Nhóm |
|---|---|---|---|
| 1 | GET | `/board/config` | §2 Board |
| 2 | GET | `/board/decisions` | §2 Board |
| 3 | GET | `/board/decisions/:id` | §2 Board |
| 4 | POST | `/board/decisions/:id/vote` | §2 Board |
| 5 | GET | `/board/decisions/:id/votes` | §2 Board |
| 6 | GET | `/board/reports` | §2 Board |
| 7 | GET | `/board/reports/:id` | §2 Board |
| 8 | GET | `/board/sessions` | §2 Board |
| 9 | GET | `/board/sessions/:id` | §2 Board |
| 10 | GET | `/board/sessions/:id/messages` | §2 Board |
| 11 | GET | `/dashboard/board` | §2 Board |
| 12 | GET | `/contracts` | §3 Contract |
| 13 | GET | `/contracts/:id` | §3 Contract |
| 14 | GET | `/contracts/:id/pdf` | §3 Contract |
| 15 | GET | `/contracts/:id/versions` | §3 Contract |
| 16 | GET | `/contracts/:id/versions/:versionId` | §3 Contract |
| 17 | GET/POST | `/contracts/:id/comments` | §3 Contract (🆕 §87 comment tư vấn) |
| 18 | POST | `/contracts/:id/claim` · `/release` | §3 Contract (🆕 §87 nhận/nhả đại diện) |
| 19 | POST | `/contracts/:id/sign-representative` | §3 Contract (🆕 §87 đại diện ký OTP) |
| 20 | POST | `/contracts/:id/revenue` | §3 Contract |
| 21 | GET | `/contracts/:id/status` | §3 Contract |
| 22 | GET | `/contracts/:contractId/amendments` | §3 Contract |
| 23 | GET | `/contracts/:contractId/amendments/:id` | §3 Contract |
| 24 | POST | `/contracts/:contractId/amendments/:id/sign/board` | §3 Contract |
| 25 | GET | `/contracts/:contractId/payment-conditions` | §3 Contract |
| 26 | GET | `/payments` | §4 Payment |
| 27 | GET | `/payments/:id` | §4 Payment |
| 28 | PATCH | `/payments/:id/approve` | §4 Payment |
| 29 | PATCH | `/payments/:id/pay` | §4 Payment |
| 30 | PATCH | `/payments/:id/cancel` | §4 Payment |
| 31 | GET | `/payments/contracts/:id/payments` | §4 Payment |
| 32 | GET | `/payments/series/:id/payments` | §4 Payment |
| 33 | GET | `/payments/users/:id/payments` | §4 Payment |
| 34 | GET | `/reprint-requests` | §5 Reprint |
| 35 | GET | `/reprint-requests/:id` | §5 Reprint |
| 36 | PATCH | `/reprint-requests/:id/board-approve` | §5 Reprint |
| 37 | GET | `/reprint-requests/:id/chapters` | §5 Reprint |
| 38 | GET | `/reprint-requests/:id/chapters/:chapterId` | §5 Reprint |
| 39 | PATCH | `/reprint-requests/:id/chapters/:chapterId/assign-reviser` | §5 Reprint |
| 40 | POST | `/transfers/contracts/:id/sign` | §5 Transfer |
| 40b 🆕 | GET | `/transfers/contracts/:id` | §5 Transfer (Spec 27) |
| 41 | GET | `/transfers/contracts/:id/signatures` | §5 Transfer |
| 42 | GET | `/transfers/requests/:id` | §5 Transfer |
| 43 | GET | `/transfers/requests/pending-board` | §5 Transfer |
| 44 | POST | `/transfers/requests/:id/assign-full-buyout` | §5 Transfer |
| 45 | POST | `/transfers/requests/:id/board-approve` | §5 Transfer |
| 46 | POST | `/transfers/requests/:id/board-reject` | §5 Transfer |
| 47 | GET | `/deadline-requests` | §5 Deadline |
| 48 | GET | `/deadline-requests/:id` | §5 Deadline |
| 49 | POST | `/deadline-requests/:id/board-resolve` | §5 Deadline |
| 50 | GET | `/series` | §6 Series |
| 51 | GET | `/series/:id` | §6 Series |
| 52 | GET | `/series/:id/defense-dashboard` | §6 Series |
| 55 | GET | `/publication-versions/:id` | §6 Publication |
| 56 | GET | `/series/:seriesId/publication-versions` | §6 Publication |
| 57 | GET | `/survey-periods` | §6 Survey |
| 58 | GET | `/survey-periods/:id` | §6 Survey |
| 59 | GET | `/survey-periods/:id/rankings` | §6 Survey |
| 60 | GET | `/survey-periods/:id/survey-data` | §6 Survey |
| 61 | GET | `/survey-periods/:id/votes` | §6 Survey |
| 62 | GET | `/rankings` | §6 Survey |
| 63 | GET | `/rankings/board` | §6 Survey |
| 63b 🆕 | GET | `/rankings/internal/aggregate` | §6 Survey (W1 — aggregate nội bộ giữ risk signal) |
| 64 | GET | `/audit` | §6 Audit |
| 65 | GET | `/assistants` | §6 Reference |
| 66 | GET | `/mangakas` | §6 Reference |
| 67 | GET | `/me/staff-profile` | §6 Reference |
| 68 | PUT | `/me/staff-profile` | §6 Reference |
| 69 | POST | `/tankobon-sales` | §6 Reference |
| 70 | GET | `/chapters/:id/storyboards` | §6 Production ref |
| 71 | GET | `/storyboards/:id` | §6 Production ref |
| 72 | GET | `/chapters/:id/pages` | §6 Production ref |
| 73 | GET | `/chapters/:id/progress` | §6 Production ref |
| 74 | GET | `/chapters/:id/stages` | §6 Production ref |
| 75 | GET | `/revision-requests` | §6 Production ref |
| 76 | POST | `/tasks/:id/download-url` | §6 Production ref |

Ngoài 80 route này, Board còn dùng các route **AUTH** dùng chung mọi role (xem `01-conventions-and-auth.md` §5.8, §3, §4): `GET/PATCH /me`, `POST /uploads/sign` + `/sign-download`, `GET /notifications` + đánh dấu đã đọc, `GET /assistants/:userId`/`GET /mangakas/:userId`/`GET /staff/:userId` (xem hồ sơ công khai), `GET /chapters` + `GET /chapters/:id` (đọc chi tiết chapter — có manuscript/schedule).

⚠️ **Khác biệt lớn nhất so với guide cũ / Requiment gốc:** Board KHÔNG có route `POST /board/decisions` (tạo quyết định) — chỉ **EDITOR/SUPER_ADMIN** tạo được. Board cũng KHÔNG tự tạo/mở/kết thúc phiên họp (`POST /board/sessions`, `PATCH .../start`, `.../conclude`, `.../phase` đều chỉ EDITOR/SUPER_ADMIN). Vai trò của Board trong module `board` chỉ có: **xem** (config/sessions/decisions/reports/messages) và **bỏ phiếu** (`POST /board/decisions/:id/vote`). Toàn bộ phần "vận hành phiên họp" (mời, mở phase, chốt phiên) là việc của Editor — Board chỉ là người dự họp và bỏ phiếu qua UI.

---

## 1. Bối cảnh nghiệp vụ (Requiment §2.4 + Flow 1/5/6/7/8)

Hội đồng Biên tập (Editorial Board) là cơ quan ra quyết định tập thể cho 3 nhóm việc:

1. **Bỏ phiếu quyết định** (`board` module) — thông qua/từ chối serial hoá series mới (Flow 1), quyết định CONTINUE/CANCEL/FORMAT_CHANGE/COMPLETION cho series đang chạy (Flow 5), phê duyệt điều khoản hợp đồng, tái bản, chuyển nhượng (Flow 6/7/8) — tất cả đi qua cùng một cơ chế `BoardDecision` + `Vote`.
2. **Ký duyệt tác vụ đơn lẻ sau khi đã có quyết định tập thể** — ví dụ sau khi `BoardDecision` loại `TRANSFER` APPROVED, một Board member gọi `POST /transfers/requests/:id/board-approve` để hiện thực hoá quyết định đó lên `TransferRequest`. Các route "board-approve" ở module transfer/reprint **không tự nó là một cuộc bỏ phiếu mới** — chúng đọc lại quyết định đã chốt ở `board` module rồi áp dụng. 🔴 §87: **Contract ban đầu KHÔNG còn theo mô hình này** — duyệt HĐ qua comment + đại diện claim/sign (§3), không qua BoardDecision.
3. **Duyệt chi tiền** (`payment` module) — Board là người approve/pay/cancel từng `PaymentRecord`.

### 1.1. Quan hệ giữa `BoardDecision` và các module nghiệp vụ khác

`BoardDecision` có `decisionType` (`SERIALIZATION` · `CANCELLATION` · `FORMAT_CHANGE` · `COMPLETION` · `CONTRACT` · `REPRINT` · `TRANSFER` · …) và khi APPROVED/REJECTED sẽ **tự động kích hoạt side-effect** ở module tương ứng (nghe qua domain event `BoardDecisionFinalized`, best-effort — không rollback nếu lỗi):

| `decisionType` | Khi APPROVED | Khi REJECTED |
|---|---|---|
| `SERIALIZATION` | `SeriesSerializeService.serialize` — Series `PITCHED → SERIALIZED`, gán `magazine`/`startIssueNumber`/`publicationType` từ `details` | Series → `REJECTED`, notify Mangaka + Editor |
| `CANCELLATION` | `SeriesLifecycleService.cancel` — Series → `CANCELLING`, `endingChapterAllowance` (1–10 chương) từ `details` | không đổi |
| `COMPLETION` | `SeriesLifecycleService.complete` — Series → `COMPLETING` | không đổi |
| `FORMAT_CHANGE` | `SeriesLifecycleService.changeFormat` — chỉ đổi `publicationType`, **không** đổi `status`. ⚠ **bắt buộc `details.publicationType`** (xem cảnh báo dưới bảng) | không đổi |
| `CONTRACT` | 🔴 §87: duyệt HĐ ban đầu **KHÔNG** qua BoardDecision/vote nữa — dùng comment tư vấn + 1 đại diện claim + `sign-representative` (Nhóm B). BoardDecision loại `CONTRACT` chỉ còn cho Amendment/Transfer. | — |
| `TRANSFER` | Không tự động — Board member phải tự gọi các route `board-approve`/`board-reject`/`assign-full-buyout` ở `transfers/requests/:id/...` (Nhóm D), route sẽ tự đọc lại `BoardDecision` này qua `boardDecisionId` để xác thực | — |
| `REPRINT` | Route `board-approve` của reprint (Nhóm D) là bước quyết định trực tiếp (KHÔNG cần `BoardDecision` loại `REPRINT` trước) | — |

→ **FE quan trọng cần nhớ:** với `SERIALIZATION`/`CANCELLATION`/`COMPLETION`/`FORMAT_CHANGE`, sau khi bỏ phiếu đủ để APPROVED thì **không cần thao tác gì thêm** — Series tự chuyển trạng thái. Với `CONTRACT`/`TRANSFER`, bỏ phiếu APPROVED chỉ là bước 1 — Board member (bất kỳ ai trong roster phiên đó) còn phải vào Contract/Transfer detail bấm nút hành động tương ứng để "thực thi" quyết định.

> ✅ **ĐÃ FIX (§84, 2026-07-29) — `FORMAT_CHANGE` không còn silent no-op.**
> **Trước:** tạo decision `FORMAT_CHANGE` mà thiếu `details.publicationType` vẫn được nhận **201**; Board vote
> APPROVED xong listener chỉ ghi `logger.warn` rồi `return` ⇒ series **đứng yên**, không notify, không sinh
> Amendment — mà UI vẫn báo thành công. Guide cũ phải dặn FE tự validate client-side.
> **Nay:** `POST /board/decisions` **chặn ngay ở tầng Zod** → **422** với `errors[].path = "details.publicationType"`
> nếu thiếu hoặc không thuộc `WEEKLY | MONTHLY | IRREGULAR`. Không còn tồn tại decision `FORMAT_CHANGE` vô nghĩa.
> **FE:** vẫn nên validate client-side để báo sớm, nhưng **không còn là lớp bảo vệ duy nhất**; hãy hiển thị
> `errors[].message` từ 422 thay vì tự đoán.

---

## 2. Nhóm A — Board Session / Decision / Vote (module `board`)

### 2.1. Vòng đời phiên họp — `BoardSessionStatus`

```
UPCOMING → ACTIVE → CONCLUDED
```

Forward-only, không lùi (`BOARD_SESSION_TRANSITIONS` trong `board-session-state.service.ts`). Board **không** có route đổi trạng thái này — chỉ EDITOR/SUPER_ADMIN (`PATCH /board/sessions/:id/start`, `.../conclude`).

### 2.2. Giai đoạn trong phiên — `BoardSessionPhase`

```
PRESENTING → QA → VOTING
```

Forward-only **và cho phép nhảy cóc** (`PATCH /board/sessions/:id/phase` — chỉ Editor/creator hoặc Super Admin gọi được, KHÔNG phải route của Board). Board chỉ **đọc** phase hiện tại qua `GET /board/sessions/:id` hoặc nhận event `phaseChanged` qua WebSocket.

- **Chat Q&A chỉ mở ở `PRESENTING`/`QA`** — bị khoá hoàn toàn khi phase = `VOTING` (gửi tin nhắn lúc đó → gateway trả `{ status: 'DENIED', reason: 'VOTING_PHASE' }`, không phải lỗi HTTP vì đây là kênh WebSocket).
- **Bỏ phiếu chỉ mở ở `VOTING`** — gọi `POST /board/decisions/:id/vote` khi phase khác `VOTING` → 409 `Error.VotingNotOpen`.
- Session phải `ACTIVE` (không phải `UPCOMING`/`CONCLUDED`) để vừa chat vừa vote được.

### 2.3. Quorum & Majority — verify trực tiếp từ `board-decision-workflow.service.ts` (KHÔNG suy đoán)

Mỗi `BoardDecision` gắn với đúng 1 `BoardSession`; `rosterSize` = `session.allowedEditorIds.length` (số thành viên được mời họp phiên đó, **không phải** tổng số Board Member toàn hệ thống). Mỗi lần có phiếu mới, `recalculateDecisionResult` tính lại:

```ts
quorumMet   = totalVotes >= Math.ceil((rosterSize * 2) / 3)      // đủ 2/3 roster đã bỏ phiếu (kể cả ABSTAIN)
winThreshold = rosterSize * majorityRatio                         // majorityRatio = BoardConfig.approveMajorityRatio, mặc định 0.5
result =
  !quorumMet                                    → 'PENDING_QUORUM'
  approveCount > winThreshold                   → 'APPROVED'
  rejectCount >= rosterSize - winThreshold
    || totalVotes >= rosterSize (mọi người đã bỏ phiếu) → 'REJECTED'
  còn lại (đủ quorum nhưng chưa đủ đa số 1 bên, vẫn còn phiếu chưa bỏ)  → 'PENDING'
```

Điểm mấu chốt cần FE hiểu đúng:

- **`ABSTAIN` được tính vào `totalVotes`** (ảnh hưởng `quorumMet` và điều kiện `totalVotes >= rosterSize`) nhưng **không cộng vào `approveCount` lẫn `rejectCount`** — bỏ phiếu trắng làm khó đạt ngưỡng `APPROVED` hơn (vì mẫu số so sánh là `rosterSize`, không phải số phiếu thực tế đã bỏ).
- **Majority tính trên tổng `rosterSize`, KHÔNG phải trên số phiếu đã bỏ** — ví dụ roster 3 người, 2 người đã bỏ phiếu APPROVE, quorum đã đạt (`2 >= ceil(2)`), nhưng `approveCount=2` chưa `> 1.53` → sai, thật ra `2 > 1.53` đúng nên đã APPROVED ngay khi đủ 2 phiếu approve (đã verify bằng test `roster 3, votes ['APPROVE','APPROVE'] → APPROVED`). Nhưng nếu roster 3 mà 1 approve + 1 reject → `PENDING` (chưa đủ 2/3 tổng roster đồng thuận 1 phía), phải chờ phiếu thứ 3.
- **Hoà phiếu / không đạt đồng thuận sau khi TOÀN BỘ roster đã bỏ phiếu → mặc định REJECTED** (điều kiện `totalVotes >= rosterSize` fallback về REJECTED nếu chưa đủ điều kiện APPROVED). Đây là câu trả lời thật của code cho câu hỏi "trường hợp hoà phiếu xử lý thế nào?" nêu trong Requiment §2.4.a — **hệ thống KHÔNG có cơ chế "Tổng biên tập quyết định cuối cùng"** như đề xuất gốc; hoà phiếu (hoặc bất kỳ kết quả nào không đạt ngưỡng approve) khi đã bỏ phiếu hết roster sẽ tự động **REJECTED**. Đã verify bằng test `roster 3, votes ['REJECT','REJECT'] → REJECTED` và `roster 3, votes ['APPROVE','REJECT','ABSTAIN'] → REJECTED`.
- `BoardConfig` mặc định (`board.repo.ts:197` lazy-seed khi DB chưa có row, KHÔNG phải `board.constant.ts`): `boardTotalMembers=5`, `quorumMin=3` (chỉ dùng cho auto-suggest roster, KHÔNG phải công thức quorum đếm phiếu ở trên), `approveMajorityRatio=0.5` (verify trực tiếp `board.repo.ts:197` + fallback `board-decision-workflow.service.ts:89` — **KHÔNG phải 0.51**, một vài chỗ tài liệu cũ ghi nhầm 0.51).
- Quyết định đã `APPROVED`/`REJECTED`/`EXPIRED` là **terminal** — vote thêm → 409 `Error.DecisionAlreadyFinalized`. `EXPIRED` xảy ra khi Editor `conclude` phiên họp mà quyết định còn `PENDING_QUORUM`/`PENDING` (xem `board.messages.ts` → `sessionConcludedWithExpired`) — Board không có route tự expire.
- Mỗi Board member **chỉ bỏ phiếu 1 lần** cho 1 decision (`decision.votes.some(v => v.voterId === voterId)` → 409 `Error.VoterAlreadyVoted`), không sửa được phiếu đã gửi (không có route update vote).

### 2.4. WebSocket `/board` (Socket.IO namespace `board`)

Nguồn: `src/modules/board/board.gateway.ts`. Đây là **kênh WebSocket duy nhất** của toàn hệ thống dành cho phiên họp Hội đồng (kênh `/vote` khác là public, phục vụ tally bình chọn độc giả — xem `02-guest-reader.md`).

**Kết nối:** connect tới namespace `board` (vd `io(BASE_URL + '/board', { auth: { token: accessToken } })` — JWT truyền qua `handshake.auth.token` hoặc header `Authorization: Bearer <token>`). Server verify token ngay lúc `handleConnection`; thiếu/sai token → server tự `disconnect(true)` ngay (không có sự kiện lỗi riêng, FE bắt event `disconnect`).

**Client → Server (emit):**

| Event | Payload | Kết quả |
|---|---|---|
| `joinSession` | `{ sessionId }` | Vào room `session_<id>`. Chỉ cho phép nếu `roleName === SUPER_ADMIN` **hoặc** `session.creatorId === userId` **hoặc** `session.allowedEditorIds.includes(userId)` (Board member trong roster phiên đó). `sessionId` không phải ObjectId hợp lệ hoặc không tìm thấy session → trả `{ status: 'DENIED' }`. Thành công → `{ status: 'SUCCESS', message }` |
| `sendMessage` | `{ sessionId, content }` | Chỉ khi: là participant, `session.status === ACTIVE`, `session.phase !== VOTING`, `content` sau `trim()` dài 1–1000 ký tự. Sai bất kỳ điều kiện nào → `{ status: 'DENIED', reason }` với `reason` ∈ `NOT_PARTICIPANT` \| `SESSION_NOT_ACTIVE` \| `VOTING_PHASE` \| `INVALID_INPUT`. Thành công → lưu `BoardMessage` DB rồi broadcast |

**Server → Client (nhận):**

| Event | Payload | Khi nào bắn |
|---|---|---|
| `phaseChanged` | `{ sessionId, phase: enum BoardSessionPhase }` | Editor/creator gọi `PATCH /board/sessions/:id/phase` thành công — broadcast tới room `session_<id>` |
| `messageReceived` | `BoardMessageView` (`{ id, sessionId, sender: {id, displayName, avatar}, content, phase, createdAt }`) | Ai đó `sendMessage` thành công trong room |
| `voteProgressUpdated` | `{ decisionId, approveCount, rejectCount, totalVotes, quorumMet, result: enum BoardDecisionResult \| null }` | Sau mỗi lần `POST /board/decisions/:id/vote` thành công (kể cả khi chưa đủ quorum) — dùng để hiển thị tally realtime trong phòng họp |

Realtime hoàn toàn là **side-effect sau khi đã ghi DB** — lỗi broadcast (server chưa init, Redis adapter hỏng) chỉ log, **không** làm API HTTP tương ứng trả lỗi. FE không nên coi thiếu event realtime là dấu hiệu request thất bại — luôn tin theo response HTTP, dùng WS chỉ để đồng bộ UI người khác trong phòng.

### 2.5. Route chi tiết

#### `GET /board/config` — xem cấu hình biểu quyết hiện tại

Không tham số. Response `BoardConfigRes`:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | |
| `updatedBy` | string \| null | userId Super Admin sửa gần nhất |
| `boardTotalMembers` | number | Luôn số lẻ (validate ở PATCH) |
| `quorumMin` | number | Sĩ số roster mặc định khi auto-assign — **KHÔNG PHẢI** công thức quorum đếm phiếu ở §2.3 |
| `approveMajorityRatio` | number | Tỷ lệ dùng trong `winThreshold` (mặc định **0.5**, verify `board.repo.ts:197`) |
| `isDefault` | boolean (tuỳ) | |
| `updatedAt` | string (ISO) | |

**Lỗi:** `Error.BoardConfigNotFound` (404) — hiếm khi gặp (chỉ khi DB chưa seed config nào).

#### `GET /board/sessions` — danh sách phiên họp

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `mine` | tuỳ | `'true'\|'false'` | `true` = chỉ phiên mà mình là creator hoặc nằm trong `allowedEditorIds` |
| `status` | tuỳ | `enum BoardSessionStatus` | |

Response: mảng `BoardSessionListItemRes` (bớt `members`/`allowedEditorIds`/`description` so với detail):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id`, `title` | string | |
| `creatorId` | string | Editor tạo phiên |
| `status` | `enum BoardSessionStatus` | |
| `phase` | `enum BoardSessionPhase` | |
| `creator` | `{id, displayName, avatar}` | Mini profile |
| `startTime` | string (ISO) | |
| `endTime` | string \| null | |
| `createdAt`, `updatedAt` | string (ISO) | |

#### `GET /board/sessions/:id` — chi tiết phiên họp

Thêm so với list: `description`, `allowedEditorIds: string[]`, `members: UserMini[]` (resolve từ `allowedEditorIds`).
**Lỗi:** `Error.BoardSessionNotFound` (404).

#### `GET /board/sessions/:id/messages` — lịch sử chat Q&A (phân trang)

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `limit` | tuỳ | number (1–200, default 50) | |
| `offset` | tuỳ | number (default 0) | |

Response: `{ items: BoardMessageRes[], total }`. Mỗi item: `{ id, sessionId, sender: UserMini, content, phase, createdAt }` (`phase` = phase lúc tin nhắn được gửi, có thể khác phase hiện tại của phiên).
**Lỗi:** `Error.BoardSessionNotFound` (404) · `Error.NotSessionParticipant` (403 — không phải creator/roster/Super Admin).

#### `GET /board/decisions` — danh sách quyết định

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `boardSessionId` | tuỳ | string | Lọc theo phiên — id không hợp lệ → trả mảng rỗng (không lỗi) |
| `targetSeriesId` | tuỳ | string | Lọc theo series mục tiêu — tương tự |

Response: mảng `BoardDecisionListItemRes` (bớt `votes`/`details`/`allowedEditorIds` so với detail):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | |
| `targetSeriesId` | string \| null | |
| `targetSeries` | `{id, title}` \| null | Enrich — null nếu decision không gắn series (vd `CONTRACT`/`TRANSFER` có thể gắn series khác nguồn) |
| `boardSessionId` | string | |
| `decisionType` | `enum DecisionType` \| null | |
| `result` | `enum BoardDecisionResult` \| null | |
| `totalVotes` / `approveCount` / `rejectCount` | number | |
| `quorumMet` | boolean | |
| `endingChapterAllowance` | number \| null | Chỉ có ý nghĩa với `decisionType=CANCELLATION` |
| `decidedAt` | string \| null | null tới khi APPROVED/REJECTED |
| `createdAt` | string (tuỳ) | |

#### `GET /board/decisions/:id` — chi tiết quyết định

Thêm: `details: Record<string, unknown> \| null` (payload tự do theo `decisionType` — vd `{magazine, startIssueNumber, publicationType}` cho `SERIALIZATION`, `{endingChapterAllowance}` cho `CANCELLATION`), `allowedEditorIds: string[]`, `votes: BoardVoteRes[]`.
**Lỗi:** `Error.BoardDecisionNotFound` (404).

#### `GET /board/decisions/:id/votes` — danh sách phiếu (mảng thẳng, không bọc `items`)

Mỗi `BoardVoteRes`: `{ voterId, voteValue: enum VoteValue, note: string|null, votedAt }`.
**Lỗi:** `Error.BoardDecisionNotFound` (404).

#### `POST /board/decisions/:id/vote` — bỏ phiếu ★ hành động trung tâm của role này

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `voteValue` | ✅ | `enum VoteValue` | `APPROVE` \| `REJECT` \| `ABSTAIN` |
| `note` | tuỳ | string (≤300) | Lý do — nên khuyến khích FE bắt buộc nhập khi `REJECT`/`ABSTAIN` dù BE không ép |

Response: `MessageResDto { message: "Đã ghi nhận phiếu biểu quyết" }` — **không** trả lại `BoardDecisionRes` mới; FE muốn thấy tally cập nhật phải gọi lại `GET /board/decisions/:id` hoặc lắng WS `voteProgressUpdated`.

**Lỗi:**

| Status | `Error.*` | Điều kiện |
|---|---|---|
| 404 | `BoardDecisionNotFound` | id sai/không tồn tại |
| 404 | `BoardSessionNotFound` | phiên gắn với decision không còn (hiếm) |
| 409 | `BoardSessionNotOpen` | `session.status !== ACTIVE` |
| 403 | `VoterNotAllowed` | `userId` không nằm trong `session.allowedEditorIds` (không phải thành viên roster phiên này — dù đúng role BOARD_MEMBER) |
| 409 | `VotingNotOpen` | `session.phase !== VOTING` |
| 409 | `DecisionAlreadyFinalized` | decision đã `APPROVED`/`REJECTED`/`EXPIRED` |
| 409 | `VoterAlreadyVoted` | đã bỏ phiếu quyết định này rồi |
| 422 | Validation | thiếu `voteValue`/sai enum/`note` > 300 ký tự |

#### `GET /board/reports` / `GET /board/reports/:id` — báo cáo phân tích Editor chuẩn bị cho phiên

| Query (list) | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `seriesId` | tuỳ | string | Toàn bộ report của 1 series |
| `boardDecisionId` | tuỳ | string | |

Response mỗi `SeriesReportRes`: `{ id, seriesId, boardDecisionId, preparedBy, reportType, content, attachments: string[] (object key R2), createdAt }`. Đây chính là nguồn dữ liệu "Hồ sơ bảo vệ của Editor" trong Requiment §2.4.b — Board đọc report này song song với `GET /series/:id/defense-dashboard` (§6) trước khi bỏ phiếu quyết định vòng đời series.
**Lỗi:** `Error.BoardReportNotFound` (404, chỉ ở detail).

#### `GET /dashboard/board` — dashboard tổng quan

Không tham số. Response `BoardDashboardRes`:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `pendingDecisions` | mảng `{decisionId, boardSessionId, decisionType, targetSeries: {id,title}\|null, phase, result}` | Quyết định thuộc phiên **đang có** Board tham gia (dựa trên `boardActiveSessions(userId)`), lọc bỏ record thiếu `decisionType`/`result`/`phase` |
| `upcomingSessions` | number | Đếm phiên `UPCOMING` mà mình nằm trong roster |
| `atRiskSevere` | mảng `{seriesId, title, rankPosition}` | Series đang ở `riskLevel=SEVERE` (cache dùng chung `ranking:severe`, TTL theo `RANKING_SHARED_TTL_SEC`) — chính là "danh sách series nguy cơ cần xem xét" nêu ở Requiment §2.4.c. 🆕 **2026-08-05:** bộ truyện đã chốt số phận (`CANCELLING`/`COMPLETING`/`CANCELLED`/`COMPLETED`) **không còn** lọt vào đây — trước đây bộ truyện đã hoàn thành vẫn có thể bị báo "nguy cơ bị huỷ". `HIATUS` vẫn loại như cũ. Shape response KHÔNG đổi, chỉ đổi giá trị `isAtRisk`/`riskLevel`. |
| `unreadNotifications` | number | Badge chuông |

Không có bảng lỗi riêng (không `@ApiErrors`).

---

## 3. Nhóm B — Contract sign/approve (module `contract`)

### 3.1. Trạng thái hợp đồng & vai trò Board (`ContractStatus`, `CONTRACT_TRANSITIONS` trong `contract.constant.ts`)

> 🔴 **§87 (2026-08-01) — flow ký đổi sang 2-PHASE.** State machine mới:
```
DRAFT → BOARD_REVIEW → AWAITING_MANGAKA → FULLY_EXECUTED
AWAITING_MANGAKA → ACTIVATION_PENDING → FULLY_EXECUTED  (chỉ HĐ thay thế của giao dịch FULL_BUYOUT transfer)
AWAITING_MANGAKA → REJECTED_BY_MANGAKA  (Mangaka từ chối → Editor redraft HĐ mới)
DRAFT|BOARD_REVIEW|AWAITING_MANGAKA → VOIDED
FULLY_EXECUTED → FULFILLED | TERMINATED | TERMINATED_BY_BREACH | EXPIRED
```

⚠️ **Board KHÔNG có route "định giá" riêng.** `valuationAmount`/`contractType`/tỷ lệ sở hữu do **Editor** nhập ở `POST /contracts` (EDITOR-only). Board tham gia ở **Phase 1 nội bộ**: đọc + comment tư vấn, cử **1 đại diện** ký.

🔴 **Duyệt HĐ KHÔNG dùng BoardDecision/vote nữa** (§87, BR-CONTRACT-08). Không còn `board-approve`/`board-request-changes`/`signatures/board` (đã XOÁ). Thay bằng: comment tư vấn (non-binding) + **1 đại diện claim** (là người duy nhất quyết + ký thay NXB). Board tham gia đúng chuỗi sau:

1. **`GET/POST /contracts/:id/comments`** — khi HĐ `BOARD_REVIEW`, Board trong roster (roster = `allowedEditorIds` của `BoardDecision` SERIALIZATION gắn HĐ) để **comment tư vấn** (text, non-binding). Editor đọc để sửa điều khoản.
2. **`POST /contracts/:id/claim`** — **1 Board member nhận làm ĐẠI DIỆN** (atomic first-come; chỉ người trong roster). Đại diện là người **duy nhất** quyết (khi comment mâu thuẫn, Editor theo ý đại diện) và ký thay NXB. Trùng → 409 `Error.ContractRepresentativeAlreadyClaimed`.
3. **`POST /contracts/:id/release`** — đại diện nhả (chỉ **trước khi ký**).
4. **`POST /contracts/:id/sign-representative`** — đại diện **ký OTP** → `BOARD_REVIEW → AWAITING_MANGAKA` (khoá điều khoản, chuyển sang Phase 2 Mangaka). **Chỉ đại diện ký — KHÔNG cần toàn bộ roster.**
   - Nếu không ai claim quá `boardRepClaimGraceDays` → Super Admin gán qua `POST /contracts/:id/assign-representative` (route SUPER_ADMIN).

### 3.2. Route chi tiết

#### `GET /contracts` — danh sách theo scope role

Không tham số (không phân trang — trả toàn bộ theo scope). Board xem **toàn bộ hợp đồng hệ thống** (`assertCanView` cho qua ngay nếu `roleName === BOARD_MEMBER`, không lọc theo sở hữu như Editor/Mangaka). Response mảng `ContractListItemRes` (bớt `boardDecision`, `terminationClause`, `sourceTransferRequestId`, `mangakaSignedAt`, `representativeSignedAt`, `mangakaRejectedAt`, `rejectionReason` so với detail — vẫn giữ `representativeId`/`representative`/`supersedesContractId`).

#### `GET /contracts/:id` — chi tiết hợp đồng

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id`, `seriesId`, `mangakaId` | string | |
| `editorId` | string \| null | |
| `series` / `mangaka` / `editor` | mini profile | |
| `boardDecisionId` | string \| null | |
| `boardDecision` | `{id, decisionType, result, decidedAt, boardSession:{id,title,startTime}}` \| null | Căn cứ pháp lý của hợp đồng |
| `sourceTransferRequestId` | string \| null | Có giá trị nếu hợp đồng sinh ra từ luồng Transfer (Flow 8) |
| `contractType` | `enum ContractType` | `FULL_BUYOUT` \| `REVENUE_SHARE` |
| `valuationAmount`, `publisherOwnershipPct`, `mangakaOwnershipPct` | number \| null | |
| `terminationClause` | string \| null | |
| `contractStart`, `contractEnd` | string (ISO) \| null | |
| `status` | `enum ContractStatus` | 2-phase (§87) |
| `mangakaSignedAt` | string \| null | thời điểm Mangaka ký (Phase 2) |
| `representativeId` / `representative` | string \| null / UserMini \| null | 🆕 §87 — Board đại diện đã claim/gán |
| `representativeSignedAt` | string \| null | 🆕 §87 — thời điểm đại diện ký (kết thúc Phase 1) |
| `supersedesContractId` | string \| null | 🆕 §87 — trỏ HĐ bị Mangaka từ chối trước đó (nếu là bản redraft) |
| `rejectionReason` / `mangakaRejectedAt` | string \| null / string \| null | 🆕 §87 — lý do + thời điểm Mangaka từ chối |
| `createdAt` | string | |

> ⚠ **Đã bỏ `boardSignedAt`** khỏi `ContractRes` (§87 — không còn ký toàn roster). Amendment vẫn giữ `boardSignedAt` riêng.

**Lỗi:** `Error.ContractNotFound` (404) · `Error.ContractAccessDenied` (403 — không áp dụng cho Board vì Board luôn qua được check).

#### `GET /contracts/:id/versions` / `GET /contracts/:id/versions/:versionId` — lịch sử phiên bản điều khoản

Mỗi `ContractVersionRes`: `{ id, contractId, versionNumber, valuationAmount, publisherOwnershipPct, mangakaOwnershipPct, terminationClause, editedById, note, createdAt }` — snapshot mỗi lần Editor `PATCH /contracts/:id`.
**Lỗi:** `Error.ContractNotFound` (404, cả 2 route).

#### `GET /contracts/:id/pdf` — tải PDF hợp đồng đã ký

Response: `{ downloadUrl, expiresAt, key }` — presigned GET URL có hạn.
**Lỗi:** `Error.ContractNotFound` (404) · `Error.ContractAccessDenied` (403) · `Error.ContractNotExecutedForPdf` (409 — chỉ xuất được từ `FULLY_EXECUTED`/`FULFILLED`/`TERMINATED`/`TERMINATED_BY_BREACH`/`EXPIRED` trở đi, DRAFT/NEGOTIATION/... chưa có PDF).

#### `GET /contracts/:id/status` — tiến độ ký

Response `ContractStatusProgressRes`:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id`, `status` | | |
| `mangaka.isSigned` / `mangaka.signedAt` | boolean / string\|null | Phase 2 — Mangaka đã ký chưa |
| `representative.id` | string \| null | 🆕 §87 — id Board đại diện; `null` = chưa ai claim |
| `representative.claimed` | boolean | đã có đại diện chưa |
| `representative.signed` / `representative.signedAt` | boolean / string\|null | đại diện đã ký (kết thúc Phase 1) chưa |

> 🔴 §87: `boardProgress{totalRequired/signedEditors/pendingEditors}` (model ký toàn roster cũ) **đã thay** bằng `representative{...}` — chỉ 1 đại diện ký. FE bỏ UI "đang chờ x/y thành viên", thay bằng "đại diện: [tên] — đã/chưa ký".

**Lỗi:** `Error.ContractNotFound` (404) · `Error.NotContractMangaka` (403, chỉ áp dụng khi role=MANGAKA khác chủ hợp đồng — Board luôn qua).

> ⚠ **Đã XOÁ** (§87): `POST /contracts/:id/board-approve`, `.../board-request-changes`, `.../signatures/board`. Board không còn "duyệt tập thể" hay "ký toàn roster" — thay bằng comment + đại diện dưới đây.

#### `GET /contracts/:id/comments` — Đọc comment tư vấn (BOARD_MEMBER · EDITOR · SUPER_ADMIN) 🆕 §87

Response mảng `{ id, contractId, authorId, author (UserMini), content, createdAt }`.
**Lỗi:** `Error.ContractNotFound` (404) · `Error.ContractAccessDenied` (403).

#### `POST /contracts/:id/comments` — Board để comment tư vấn (BOARD_MEMBER) 🆕 §87

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `content` | ✅ | string (1–2000) | góp ý điều khoản (non-binding) |

Chỉ khi HĐ `BOARD_REVIEW` và người gọi thuộc roster.
**Lỗi:** `Error.ContractNotFound` (404) · `Error.ContractNotInBoardReview` (409) · `Error.NotInContractBoardRoster` (403).

#### `POST /contracts/:id/claim` — Nhận làm đại diện Board (BOARD_MEMBER) 🆕 §87

Không body. `BOARD_REVIEW`, người gọi ∈ roster, chưa ai claim → gán `representativeId = caller` (atomic).
**Lỗi:** `Error.ContractNotFound` (404) · `Error.ContractNotInBoardReview` (409) · `Error.NotInContractBoardRoster` (403) · `Error.ContractRepresentativeAlreadyClaimed` (409 — đã có người khác nhận).

#### `POST /contracts/:id/release` — Đại diện nhả (BOARD_MEMBER) 🆕 §87

Không body. Chỉ khi caller = đại diện hiện tại **và chưa ký**.
**Lỗi:** `Error.ContractNotFound` (404) · `Error.NotContractRepresentative` (403).

#### `POST /contracts/:id/sign-representative` — Đại diện ký OTP → `AWAITING_MANGAKA` (BOARD_MEMBER) 🆕 §87

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `otpCode` | ✅ | string (6 ký tự) | OTP `purpose=SIGNING_CONTRACT`, hệ thống tự gửi email khi HĐ vào trạng thái ký được (không có route "xin OTP ký" riêng) |

Chỉ đại diện đã claim mới ký; ký xong → `BOARD_REVIEW → AWAITING_MANGAKA` (khoá điều khoản, sang Phase 2).
**Lỗi:** `Error.ContractNotFound` (404) · `Error.ContractNoRepresentative` (409 — chưa ai claim) · `Error.NotContractRepresentative` (403) · `Error.ContractNotSignableYet` (409 — không ở `BOARD_REVIEW`) · OTP sai → 422/410 (như convention OTP).

> Không ai claim quá `AppConfig.boardRepClaimGraceDays` → Super Admin gán qua `POST /contracts/:id/assign-representative` (SUPER_ADMIN, xem `07-super-admin.md`).

Response `ContractSignRes`: `{ status, message, contract }`. Chỉ **đại diện ký** (1 người) → HĐ `BOARD_REVIEW → AWAITING_MANGAKA` (sang Phase 2 Mangaka). KHÔNG còn "chờ toàn roster ký".

**Lỗi:** `Error.ContractNotFound` (404) · `Error.ContractNoRepresentative` (409 — chưa ai claim đại diện) · `Error.NotContractRepresentative` (403 — không phải đại diện đã claim) · `Error.ContractNotSignableYet` / `Error.ContractNotInBoardReview` (409 — HĐ không ở `BOARD_REVIEW`) · `Error.ContractAlreadySigned` (400) · OTP sai/hết hạn → 422/410.

#### `POST /contracts/:id/revenue` — nhập doanh thu kỳ (chỉ `REVENUE_SHARE` đã `FULLY_EXECUTED`)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `revenue` | ✅ | number (>0) | |
| `period` | ✅ | string | Nhãn kỳ tự do, vd `"2026-Q2"` |

Response: `MessageResDto`. Ghi nhận xong hệ thống tự tính chia theo `ownership split` qua domain event `RevenueReported` (async — không trả kết quả chia ngay trong response này; FE muốn xem breakdown phải qua `GET /payments?contractId=...`).
**Lỗi:** `Error.ContractNotFound` (404) · `Error.RevenueNotApplicable` (409 — sai `contractType`/`status`) · `Error.NotAssignedEditor` (403 — chỉ áp dụng khi role=EDITOR không phụ trách; Board luôn qua).

#### `GET /contracts/:contractId/amendments` / `GET .../amendments/:id` — phụ lục hợp đồng

List item (`AmendmentListItemRes`) bớt `signatures`, `changedClauses`, `reason`, `terminationClause`, `voidReason`, `mangakaSignedAt`, `boardSignedAt` so với detail. Detail đầy đủ:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `status` | `enum ContractAmendmentStatus` | `DRAFT → PENDING_SIGNATURES → FULLY_EXECUTED`, hoặc `VOIDED` |
| `triggerSource` | `enum AmendmentTrigger` | `MANUAL` \| `FORMAT_CHANGE` \| `COMPLETION` — 2 loại sau do hệ thống tự sinh khi Board duyệt `FORMAT_CHANGE`/`COMPLETION` (Flow 5) |
| `changedClauses` | string[] | Mô tả điều khoản thay đổi |
| `valuationAmount`, `publisherOwnershipPct`, `mangakaOwnershipPct`, `terminationClause`, `contractStart`, `contractEnd` | number/string \| null | Field nào null = không đổi so với hợp đồng gốc |
| `mangakaSignedAt`, `boardSignedAt`, `fullyExecutedAt` | string \| null | |
| `voidReason` | string \| null | |
| `createdBy` / `creator` | string \| mini profile | |
| `signatures` | `{id, amendmentId, userId, role, signedAt}[]` (tuỳ) | |

**Lỗi:** `Error.ContractNotFound`/`Error.AmendmentNotFound` (404) · `Error.ContractAccessDenied` (403, không áp dụng cho Board).

#### `POST /contracts/:contractId/amendments/:id/sign/board` — ký phụ lục OTP

Body: `{ otpCode: string (6 ký tự) }`. ⚠ **Amendment vẫn giữ cơ chế đa-ký cũ** (NGOÀI phạm vi §87 — khác hẳn HĐ chính nay chỉ 1 đại diện ký): **cần TOÀN BỘ roster ký** (`countBoardSignatures >= allowedEditorIds.length` mới set `boardSignedAt` trên amendment); khi cả Mangaka lẫn Board ký đủ → amendment `FULLY_EXECUTED`.
**Lỗi:** `Error.AmendmentNotPendingSignatures` (409) · `Error.NotAuthorizedInBoard` (403) · `Error.BoardMemberAlreadySigned` (400).

#### `GET /contracts/:contractId/payment-conditions` — điều kiện thanh toán của hợp đồng

Response `{ data: PaymentConditionModel[] }`, mỗi item:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id`, `contractId` | string | |
| `conditionType` | `enum ConditionType` | `CHAPTER_MILESTONE` · `RECURRING_CHAPTER` · `RANKING_MILESTONE` · `TIME_BOUND` |
| `thresholdConfig` | JSON tự do | Shape phụ thuộc `conditionType` (vd `{chapter:12}`, `{every:4}`, `{topRank:5}`, `{deadline:'2026-12-31'}`) |
| `payoutAmount` / `payoutPct` | number \| null | |
| `isRecurring` | boolean | |
| `status` | `enum PaymentConditionStatus` | |
| `lastTriggeredValue` | number \| null | |
| `achievedAt` | string \| null | |

**Lỗi:** `Error.ContractNotFound` (404) · `Error.NotAssignedPaymentEditor` (403, không áp dụng cho Board — Board luôn qua theo cùng rule `assertCanView`).

---

## 4. Nhóm C — Payment (module `payment`, Board là người duyệt chi)

### 4.1. Vòng đời `PaymentRecordStatus`

```
TRIGGERED → APPROVED → PAID
(TRIGGERED | APPROVED) → CANCELLED   (không huỷ được khi đã PAID)
```

`PaymentRecord` được **hệ thống tự tạo** (`TRIGGERED`) khi điều kiện thanh toán đạt (milestone chương, ranking, mốc thời gian, doanh thu…) hoặc khi có payment thủ công khác nguồn (`PaymentSource`: `CONTRACT` · `REPRINT` · `TRANSFER` · `TERMINATION` · `MANUAL`). Board không tạo payment thủ công qua route nào — chỉ **approve/pay/cancel** cái đã tồn tại.

### 4.2. Route chi tiết

#### `GET /payments` — danh sách toàn hệ thống

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `status` | tuỳ | `enum PaymentRecordStatus` | |
| `receiverId`, `seriesId`, `contractId` | tuỳ | string | |
| `paymentType` | tuỳ | `enum PaymentType` | |
| `paymentSource` | tuỳ | `enum PaymentSource` | |

Response `{ data: PaymentRecordListItemRes[] }` — list item bớt `description`, `note`, `cancelReason`, `transactionReference`, `paymentMethod`, `approvedBy`, `approvedAt`, `cancelledAt`, `createdBy`, `conditionId`, `approver` so với detail (gọn cho bảng danh sách; muốn xem đủ phải mở detail).

#### `GET /payments/:id` — chi tiết

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id`, `contractId`, `conditionId` | string \| null | |
| `receiverId` | string | |
| `seriesId` | string \| null | |
| `description` | string \| null | |
| `approvedBy` / `approvedAt` | string \| null | |
| `paymentType` | `enum PaymentType` | `CONDITION_PAYOUT` · `REVENUE_SHARE` · `COMPENSATION` · `CHAPTER_MILESTONE` · `RECURRING_CHAPTER` · `RANKING_MILESTONE` · `TIME_BOUND` · `TRANSFER` |
| `paymentSource` | `enum PaymentSource` | |
| `amount` | number | |
| `period` | string \| null | |
| `paymentMethod` / `transactionReference` | string \| null | Chỉ có sau khi `pay` |
| `status` | `enum PaymentRecordStatus` | |
| `paidAt` / `cancelledAt` / `cancelReason` / `note` | | |
| `createdBy` | string \| null | |
| `createdAt` | string | |
| `series` / `receiver` / `approver` | mini profile (tuỳ) | `approver` = null nếu chưa duyệt |

**Lỗi:** `Error.PaymentRecordNotFound` (404) · `Error.PaymentAccessDenied` (403, không áp dụng cho Board — Board + Super Admin luôn `isPrivileged`).

#### `PATCH /payments/:id/approve` — duyệt chi → `APPROVED`

Không body — người duyệt lấy từ token (chống giả mạo). Response `PaymentRecordRes`.
**Lỗi:** `Error.PaymentRecordNotFound` (404) · `Error.PaymentNotApprovable` (400 — chỉ duyệt được khi đang `TRIGGERED`).

#### `PATCH /payments/:id/pay` — xác nhận đã chi → `PAID`

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `paymentMethod` | ✅ | string | |
| `transactionReference` | ✅ | string | Mã tham chiếu giao dịch (ngân hàng/ví…) |
| `note` | tuỳ | string | |

**Lỗi:** `Error.PaymentRecordNotFound` (404) · `Error.PaymentNotPayable` (400 — chỉ chi được khi đang `APPROVED`, tức phải `approve` trước).

#### `PATCH /payments/:id/cancel` — huỷ (chưa `PAID`)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `cancelReason` | ✅ | string | |

**Lỗi:** `Error.PaymentRecordNotFound` (404) · `Error.PaymentAlreadyPaid` (400 — không huỷ được payment đã `PAID`; huỷ được cả `TRIGGERED` lẫn `APPROVED`).

#### `GET /payments/contracts/:id/payments` / `GET /payments/series/:id/payments` / `GET /payments/users/:id/payments`

3 route liệt kê payment theo `contractId`/`seriesId`/`receiverId` — cùng shape `{ data: PaymentRecordListItemRes[] }`. Board (và Super Admin) luôn xem được toàn bộ, không bị chặn scope sở hữu như Editor/Mangaka.
**Lỗi:** `Error.PaymentAccessDenied` (403, không áp dụng cho Board) — id không phải ObjectId hợp lệ → trả `{ data: [] }` (không lỗi).

---

## 5. Nhóm D — Reprint / Transfer / Deadline

### 5.1. Reprint (`module reprint`) — vòng đời `ReprintRequestStatus`

```
PENDING/PROPOSED → (REVENUE_SHARE: MANGAKA_REVIEW →) MANGAKA_APPROVED → BOARD_APPROVED → IN_PRODUCTION → APPROVED → PUBLISHED
                 → (FULL_BUYOUT: bỏ qua bước Mangaka) ─────────────────→ BOARD_APPROVED → ...
Bất kỳ lúc nào trước BOARD_APPROVED đều có thể → REJECTED (Board từ chối) hoặc REJECTED_BY_MANGAKA (Mangaka từ chối, chỉ REVENUE_SHARE)
```

- Hợp đồng `REVENUE_SHARE`: cần Mangaka đồng ý (`PATCH /reprint-requests/:id/mangaka-review`, route của Mangaka) **trước** khi Board duyệt.
- Hợp đồng `FULL_BUYOUT`: Board toàn quyền quyết, không cần qua bước Mangaka review.
- Sau `BOARD_APPROVED`, request tự `PUBLISHED` khi **toàn bộ** chapter nhúng (`chapters[]`) đạt `APPROVED` (Editor duyệt từng chapter qua route riêng, không phải route Board).

#### `GET /reprint-requests` — danh sách (scope theo role, Board xem toàn bộ)

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `status` | tuỳ | string | |
| `seriesId` | tuỳ | string | |

Response mảng `ReprintRequestListItemRes` (bớt `chapters`, `reason`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id`, `seriesId` | string | |
| `requestedBy` | string \| null | |
| `revisionMode` | `enum ReprintRevisionMode` \| null | `AS_IS` \| `WITH_REVISION` |
| `chapterRangeStart`/`chapterRangeEnd` | number \| null | |
| `status` | string (giá trị `ReprintRequestStatus`) | |
| `mangakaApprovedAt`/`boardApprovedAt`/`publishedAt` | string \| null | |
| `createdAt` | string | |
| `series` / `requester` | mini profile (tuỳ) | |

#### `GET /reprint-requests/:id` — chi tiết (thêm `chapters[]`, `reason`)

Mỗi phần tử `chapters[]`: `{ originalChapterId, manuscriptFile, status: enum ReprintChapterStatus }` (`PENDING → IN_REVISION → READY → APPROVED → PUBLISHED`).
**Lỗi:** `Error.ReprintRequestNotFound` (404).

#### `GET /reprint-requests/:id/chapters` / `GET .../chapters/:chapterId` — xem riêng danh sách/1 chapter tái bản

Cùng shape phần tử `chapters[]` ở trên.
**Lỗi:** `Error.ReprintRequestNotFound` / `Error.ReprintChapterNotFound` (404).

#### `PATCH /reprint-requests/:id/board-approve` — Board duyệt/từ chối yêu cầu tái bản

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `approve` | ✅ | boolean | `true` → `BOARD_APPROVED`; `false` → `REJECTED` |
| `reason` | tuỳ | string | |

Điều kiện chuyển trạng thái theo `contractType`: `FULL_BUYOUT` yêu cầu đang `PENDING`/`PROPOSED`; `REVENUE_SHARE` yêu cầu đang `MANGAKA_APPROVED`/`MANGAKA_REVIEW` (đã qua Mangaka).
**Lỗi:** `Error.ReprintRequestNotFound` (404) · `Error.ActiveContractNotFound` (404 — series không có hợp đồng `FULLY_EXECUTED`) · `Error.InvalidReprintTransition` (409).

#### `PATCH /reprint-requests/:id/chapters/:chapterId/assign-reviser` — gán người sửa lại chapter (PB-07)

Chỉ áp dụng khi `revisionMode=WITH_REVISION` **và** hợp đồng `FULL_BUYOUT`.

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `reviserId` | ✅ | string | |
| `reviserType` | ✅ | `enum ReviserType` | `INTERNAL_TEAM` \| `OTHER_MANGAKA` — nếu `OTHER_MANGAKA` thì `reviserId` phải là user có role MANGAKA |

**Lỗi:** `Error.ReprintRequestNotFound`/`Error.ReprintChapterNotFound` (404) · `Error.ReprintNotWithRevision` (409) · `Error.ReviserOnlyForFullBuyout` (409) · `Error.ReviserMangakaNotFound` (422) · `Error.ReprintActionNotAllowed` (403 — không phải Editor phụ trách/Super Admin/Board với quyền `canAssignReviser`).

### 5.2. Transfer (`module transfer`) — vòng đời `TransferRequestStatus`

```
SUBMITTED → (Board sàng lọc) UNDER_REVIEW | REJECTED_BY_BOARD
UNDER_REVIEW → NEGOTIATING (Editor bắt đầu thương lượng, REVENUE_SHARE)
             → AWAITING_REPLACEMENT_SIGNATURES (Board chọn FULL_BUYOUT — assign-full-buyout)
             → AWAITING_TRANSFER_SIGNATURES (Editor tạo hợp đồng 3 bên — REVENUE_SHARE)
NEGOTIATING → UNDER_REVIEW | REJECTED_BY_ORIGINAL_MANGAKA (Mangaka A từ chối)
AWAITING_REPLACEMENT_SIGNATURES | AWAITING_TRANSFER_SIGNATURES → COMPLETED (đủ chữ ký 3 bên)
```

Board tham gia ở **2 điểm quyết định** + **1 điểm ký**:

1. **Sàng lọc ban đầu** — `board-approve`/`board-reject` khi request đang `SUBMITTED`, cần một `BoardDecision` loại `TRANSFER` đã `APPROVED`/`REJECTED` tương ứng (đọc qua `boardDecisionId` truyền lên — decision đó phải: đúng `decisionType=TRANSFER`, đúng `targetSeriesId`, đúng `result` mong đợi, và **caller phải nằm trong `allowedEditorIds` của chính session đã ra quyết định đó** — không phải "Board Member bất kỳ").
2. **Chọn phương án `FULL_BUYOUT`** — `assign-full-buyout` khi request đang `UNDER_REVIEW`: Board định giá lại + đặt điều kiện thanh toán mới, hệ thống tạo hợp đồng thay thế (`ACTIVATION_PENDING`).
3. **Ký hợp đồng chuyển nhượng 3 bên** — `POST /transfers/contracts/:id/sign` khi vai trò suy ra là `BOARD` (`deriveSignerRole`), theo thứ tự bắt buộc `DRAFT (Mangaka A ký) → A_SIGNED (Mangaka B ký) → B_SIGNED (Board ký) → BOARD_SIGNED → FULLY_EXECUTED` (Board luôn ký **sau cùng**, không thể ký trước khi cả 2 Mangaka đã ký).

#### `GET /transfers/requests/pending-board` — hàng đợi chờ Board sàng lọc

Không tham số. Response `{ data: TransferRequestListItemRes[] }` — chỉ các request đang `SUBMITTED`.

#### `GET /transfers/requests/:id` — chi tiết 1 yêu cầu

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id`, `seriesId` | string | |
| `requestingMangakaId` (Mangaka B — người muốn nhận) / `originalMangakaId` (Mangaka A — chủ hiện tại) | string | |
| `series` / `requestingMangaka` / `originalMangaka` | mini profile | |
| `originalContractType` | string \| null | `FULL_BUYOUT` \| `REVENUE_SHARE` của hợp đồng gốc |
| `proposedType` | string \| null | `enum TransferType`: `FULL_TRANSFER` \| `PARTIAL_TRANSFER` |
| `proposedPercentage` | number \| null | Chỉ có khi `PARTIAL_TRANSFER` |
| `planDescription` | string \| null | (bớt ở list item) |
| `originalContractId` | string \| null | |
| `status` | `enum TransferRequestStatus` | |
| `boardDecisionId` | string \| null | |
| `createdAt` | string | |

**Lỗi:** `Error.TransferRequestNotFound` (404) · `Error.TransferAccessDenied` (403, không áp dụng cho Board — Board luôn `canViewRequest` true).

#### `POST /transfers/requests/:id/board-approve` / `.../board-reject` — sàng lọc ban đầu

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `boardDecisionId` | tuỳ* | string | *Bắt buộc chọn đúng 1 trong 2: `boardDecisionId` hoặc `boardSessionId` (deprecated, chỉ dùng khi phiên chỉ có đúng 1 decision TRANSFER terminal) |
| `boardSessionId` | tuỳ* | string | Deprecated compat |
| `details` | tuỳ | string | |

**Lỗi:** `Error.TransferRequestNotFound` (404) · `Error.InvalidStatusForScreening` (400 — request không `SUBMITTED`) · `Error.TransferAccessDenied` (403 — caller không thuộc `allowedEditorIds` của chính decision đó) · `Error.InvalidTransferBoardDecision` (422 — decision sai loại/sai series/sai result mong đợi) · `Error.TransferDecisionReferenceRequired` (422 — gửi cả 2 hoặc không gửi field nào).

#### `POST /transfers/requests/:id/assign-full-buyout` — chọn phương án mua đứt

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `valuationAmount` | ✅ | number (>0) | Định giá lại tác phẩm |
| `conditions` | ✅ | mảng `{description, type: enum ConditionType, value: number>0}` (≥1 phần tử) | Điều kiện thanh toán cho hợp đồng thay thế |
| `boardSessionId` | tuỳ | string | Deprecated, bị bỏ qua — hệ thống tự dùng `request.boardDecisionId` |

Response: `MessageResDto { message, newContractId }`. Request chuyển `UNDER_REVIEW → AWAITING_REPLACEMENT_SIGNATURES`; hợp đồng thay thế tạo ở trạng thái `ACTIVATION_PENDING` (chưa `FULLY_EXECUTED`, chờ đủ chữ ký + hợp đồng gốc bị terminate).
**Lỗi:** `Error.TransferRequestNotFound` (404) · `Error.OnlyAppliesToFullBuyout` (400 — hợp đồng gốc không phải `FULL_BUYOUT`) · `Error.OriginalContractNotFound` (400) · `Error.ValuationRequired` (400) · `Error.TransferAccessDenied` (403) · `Error.InvalidTransferBoardDecision` (422).

#### `POST /transfers/contracts/:id/sign` — ký hợp đồng chuyển nhượng 3 bên bằng OTP

**Lấy `:id` (`transferContractId`) ở đâu — 🆕 Spec 27 (2026-07-29):** đọc field **`transferContractId`** trên `GET /transfers/requests/pending-board` hoặc `GET /transfers/requests/:id` (`null` khi Editor chưa soạn hợp đồng). Trước Spec 27 field này không tồn tại ⇒ Board không có đường lấy id để ký; nếu bạn đọc code/tài liệu cũ hơn 2026-07-29 thì đó là lý do.

🔔 **Nay CÓ notification tới lượt ký (§84, 2026-07-29).** Board ký **thứ ba** (sau A rồi B). Khi Mangaka B ký
xong, **toàn bộ roster Board của phiên** nhận notification `NotificationType.CONTRACT` với
`referenceType: 'TRANSFER_CONTRACT_AWAITING_SIGNATURE'` và `referenceId = transferContractId` (dùng thẳng cho
`GET /transfers/contracts/:id` + `POST /transfers/contracts/:id/sign`). Trước §84 chuỗi ký im lặng hoàn toàn —
Board phải tự vào `pending-board` dò. Notification là **best-effort**: vẫn phải coi route GET là nguồn sự thật.

⚠️ **Đừng nhầm với `originalContractId`** — đó là **Contract (hợp đồng XUẤT BẢN)** cũ của series, khác entity, không dùng được với `/transfers/contracts/:id/*`.

**Board ký SAU CÙNG nên bắt buộc đọc điều khoản trước:** gọi 🆕 **`GET /transfers/contracts/:id`** (route mới, Board xem được) để thấy `transferAmount`, `newOwnershipSplit`, `coOwnerApprovalRequired`, `status` và danh sách chữ ký A/B — trước đó chỉ có route xem chữ ký, tức Board ký mà không thấy điều khoản. Chi tiết field xem `03-mangaka.md` §5.6 (cùng shape, cùng RBAC).

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `otpCode` | ✅ | string (6 ký tự) | |

Khi Board ký (vai trò cuối `BOARD`, điều kiện `contract.status === B_SIGNED`) → hệ thống tự động: chuyển hợp đồng `BOARD_SIGNED → FULLY_EXECUTED`, **chuyển quyền sở hữu series** (`Series.mangakaId` = Mangaka B; nếu `PARTIAL_TRANSFER` thì Mangaka A thành `coOwnerId` kèm `coOwnerApprovalRequired=true`), và `TransferRequest` → `COMPLETED`.
**Lỗi:** `Error.TransferContractNotFound` (404) · `Error.TransferSignerNotFound` (404 — user/email không hợp lệ) · `Error.TransferAlreadySigned` (400) · `Error.TransferContractNotFoundAfterUpdate` (404, hiếm) · `Error.TransferAccessDenied` (403 — không suy ra được vai trò ký hợp lệ, hoặc sai thứ tự `expectedStatus` cho vai trò đó → `Error.InvalidTransferState` 409).

#### `GET /transfers/contracts/:id/signatures` — danh sách chữ ký

Response: `{ signatures: [{id, transferContractId, userId, role: enum TransferSignerRole, signedAt}] }`.
**Lỗi:** `Error.TransferContractNotFound` (404) · `Error.TransferAccessDenied` (403, Board luôn qua nếu thuộc `boardMemberIds` của decision gắn với request).

⚠️ **BR-TRANSFER-03 (PARTIAL_TRANSFER co-owner approval) — Board KHÔNG có route xử lý.** Sau khi `PARTIAL_TRANSFER` hoàn tất, mỗi chapter mới của series phải Mangaka A (co-owner) approve trước khi `PUBLISHED` (`POST /chapters/:id/co-owner-approve` / `co-owner-reject` — route **MANGAKA-only**, xem `03-mangaka.md`). Nếu A không phản hồi quá N ngày, `coowner-escalation.cron.ts` (chạy hàng ngày) chỉ **tự đổi status `ESCALATED` + gửi notification cho Board** — hệ thống **không có route nào cho Board tự quyết/ép buộc** kết quả co-owner approval này. FE Board không nên dựng UI "Board xử lý escalation" cho case này — chỉ hiển thị notification/trạng thái `ESCALATED` như thông tin tham khảo; xử lý thực tế phải qua kênh ngoài hệ thống (liên hệ trực tiếp Mangaka A) hoặc Board cân nhắc đưa ra quyết định Series Lifecycle (Flow 5) nếu bế tắc kéo dài.

### 5.3. Deadline (`module deadline`) — vòng đời `DeadlineRequestStatus`

```
PROPOSED ⇄ COUNTER_PROPOSED (thương lượng qua lại giữa Mangaka/Editor)
  → AGREED_BY_PARTIES → (Editor finalize) APPROVED | BOARD_REVIEW (nếu affectsSlot)
  → ESCALATED (bên kia reject) → (Board) APPROVED | REJECTED
BOARD_REVIEW → (Board) APPROVED | REJECTED
```

Board chỉ vào cuộc khi request đã leo thang tới `BOARD_REVIEW` (đổi lịch ảnh hưởng slot xuất bản, Editor tự finalize thấy `affectsSlot=true`) hoặc `ESCALATED` (một bên từ chối đề xuất của bên kia).

#### `GET /deadline-requests` — danh sách theo chapter

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `chapterId` | ✅ | string | |
| `status` | tuỳ | `enum DeadlineRequestStatus` | |

Response: `{ items: DeadlineRequestListItemRes[] }` (bớt `reason`, `boardReviewedBy`, `scheduleId`, `resolvedAt`).

#### `GET /deadline-requests/:id` — chi tiết

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id`, `scheduleId`, `chapterId`, `seriesId` | string \| null | |
| `requestedBy` | string \| null | `'MANGAKA'` \| `'EDITOR'` — phe khởi tạo |
| `lastProposedBy` | string \| null | Phe đề xuất gần nhất |
| `currentDeadline` / `requestedDeadline` | string \| null | |
| `reason` | string \| null | |
| `affectsSlot` | boolean | Có ảnh hưởng lịch xuất bản slot hay không — quyết định route `finalize` đi `APPROVED` thẳng hay phải qua `BOARD_REVIEW` |
| `status` | `enum DeadlineRequestStatus` | |
| `boardReviewedBy` | string \| null | |
| `resolvedAt` | string \| null | |
| `createdAt` | string | |
| `series` / `chapter` | mini profile (tuỳ) | |

**Lỗi:** `Error.DeadlineRequestNotFound` (404) · `Error.DeadlineRequestAccessDenied` (403, không áp dụng cho Board).

#### `POST /deadline-requests/:id/board-resolve` — Board chốt

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `decision` | ✅ | `'APPROVE'` \| `'REJECT'` | |
| `note` | tuỳ | string (≤1000, nullish) | |

`APPROVE` → request → `APPROVED` **và** tự động cập nhật `Schedule` của chapter (gọi `extendDeadlineByBoard`, ghi `reason` = lý do gốc của request hoặc mặc định "Deadline resolved by Board (A5)") — deadline mới có hiệu lực ngay, không cần Editor làm gì thêm. `REJECT` → `REJECTED`, giữ nguyên deadline cũ.
**Lỗi:** `Error.DeadlineRequestNotFound` (404) · `Error.DeadlineNotAwaitingBoard` (409 — request không ở `BOARD_REVIEW`/`ESCALATED`).

---

## 6. Nhóm E — Series / Survey / Publication / Audit / Reference (đọc-chủ yếu)

### 6.1. Series (module `series` + `name`)

Board xem **toàn bộ series** trừ 2 trạng thái bị ẩn: `DRAFT`, `WITHDRAWN` (`BOARD_HIDDEN_STATES` trong `series-query.service.ts` — series chưa nộp hoặc đã rút thì Board không cần thấy).

#### `GET /series` — danh sách

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `status` | tuỳ | `enum SeriesStatus` | |
| `limit` | tuỳ | number (≤100, default 20) | |
| `offset` | tuỳ | number (default 0) | |

Response: `{ items: SeriesListItemRes[], total, limit, offset }` — list item bớt `proposal`, `completionProposal`, `statusReason`, `reviewStartedAt`, `franchiseConsentStatus`, `coOwnerId`, `parentSeriesId`, `relationshipType`, `startIssueNumber`.

#### `GET /series/:id` — chi tiết (đầy đủ field, xem `01` không lặp — tham chiếu bảng đủ ở trên)

Field đáng chú ý cho Board: `magazine`/`startIssueNumber` (slot Board chọn khi serial hoá qua `BoardDecision.details`, null tới khi `SERIALIZED`), `completionProposal` (đề xuất kết thúc tự nhiên từ Mangaka/Editor — null nếu chưa có, Board xem để chuẩn bị bỏ phiếu `COMPLETION`), `proposal` (hồ sơ ban đầu — `synopsis`, `characterDesigns`, `estimatedLength`).
**Lỗi:** `Error.SeriesAccessDenied` (403, không áp dụng — Board qua theo state whitelist ở trên) · `Error.SeriesNotFound` (404).

**Flow 11 (Sequel/Franchise) — không có route/section riêng vì KHÔNG cần:** series phái sinh chỉ thêm 2 field khai báo lúc tạo proposal (`parentSeriesId`, `relationshipType` ∈ `SEQUEL/SPINOFF/SIDE_STORY/REBOOT`) rồi chạy lại nguyên vẹn Flow 1 (pitch/vote — §2) + Flow 6 (hợp đồng riêng — §3) như series thường; Board không có hành động nào khác biệt. `franchiseConsentStatus` (field trên `Series`, xuất hiện ở `GET /series/:id` chi tiết, bị lược khỏi list) chỉ liên quan tới **Mangaka gốc** của series cha khi series cha đang `REVENUE_SHARE` — hệ thống chặn pitch series phái sinh (`Error.franchiseConsentRequired`, 409) tới khi Mangaka gốc đồng ý; nếu series cha `FULL_BUYOUT` thì bỏ qua field này (Board toàn quyền). Board chỉ cần đọc field này để biết series phái sinh có đang bị chặn ở bước Mangaka gốc consent hay đã sẵn sàng vào vote — không có action nào của Board tác động lên field này.

#### Storyboard pages của proposal (Spec 28)

Hai route `/series/:id/names*` đã xoá. Board đọc `proposal.storyboardPages[]` trực tiếp trong `GET /series/:id`, cùng `synopsis` và `characterDesigns`, trước khi bỏ phiếu `SERIALIZATION`. Các trang này không có lifecycle Storyboard độc lập.

### 6.2. Series Defense Dashboard — `GET /series/:id/defense-dashboard`

Nguồn: `tankobon.controller.ts` → `TankobonService.defenseDashboard`. Đây chính là "Dữ liệu đầu vào cho quyết định" mô tả ở Requiment §2.4.b, gom cả 3 nguồn: ranking trend, doanh số tankobon, hồ sơ bảo vệ của Editor.

Response `DefenseDashboardRes`:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `rankingTrend` | mảng `{surveyPeriodId, rankPosition, voteCount, previousRank, rankChange, isAtRisk, riskLevel: enum RiskLevel, recordedAt}` | 12 kỳ gần nhất |
| `tankobon.totalUnitsSold` | number | |
| `tankobon.volumes` | `{volumeNumber, unitsSold, period}[]` | |
| `seriesReports` | `{id, reportType, content, createdAt}[]` | Chính là `SeriesReport` cùng nguồn với `GET /board/reports` |
| `serialization.serializedSince` | string \| null | ISO thời điểm chuyển `SERIALIZED` gần nhất, null nếu chưa từng |
| `serialization.chaptersPublished` | number | |

**Lỗi:** `Error.SeriesNotFound` (404) · `Error.DefenseDashboardAccessDenied` (403, không áp dụng cho Board — chỉ chặn role không phải Board/Super Admin/Editor phụ trách).

### 6.3. `POST /tankobon-sales` — nhập doanh số tankobon (PB-08)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `seriesId` | ✅ | string | |
| `volumeNumber` | ✅ | number (int >0) | |
| `unitsSold` | ✅ | number (int ≥0) | |
| `period` | ✅ | string | Nhãn tự do, vd `"2026-Q2"` |

Response `TankobonSalesRes`: `{ id, seriesId, volumeNumber, unitsSold, period, recordedBy, createdAt }`.
**Lỗi:** `Error.SeriesNotFound` (404).

### 6.4. Publication Versions (module `publication`)

#### `GET /series/:seriesId/publication-versions` / `GET /publication-versions/:id`

Response `{ items: PublicationVersionRes[] }` (list) hoặc object đơn (detail): `{ id, seriesId, language, readingDirection: enum ReadingDirection, versionType: 'ORIGINAL'|'DIGITAL'|'FLIPPED'|null, notes, createdAt }`. Board chỉ đọc — không tạo/sửa/xoá (route đó chỉ Editor/Super Admin).
**Lỗi:** `Error.SeriesNotFound` / `Error.PublicationVersionNotFound` (404) · `Error.SeriesAccessDenied` (403, không áp dụng cho Board).

### 6.5. Survey / Ranking (module `survey`) — nguồn dữ liệu Requiment §2.4.c

#### `GET /survey-periods` / `GET /survey-periods/:id` — kỳ bình chọn

🆕 **W1 (2026-08-02):** `GET /survey-periods` nay có **filter + phân trang** (`?magazine=&publicationType=&status=&limit=&offset=`) và response ĐỔI SHAPE thành **`{ items: SurveyPeriodRes[], total, limit, offset }`** (breaking — trước là mảng thô). `GET /survey-periods/:id` giữ nguyên `SurveyPeriodRes`.

`SurveyPeriodRes`: `{ id, magazine, publicationType: enum PublicationType, eligibleSeriesIds: string[], issueNumber, reflectedIssueNumber, startDate, endDate, status: enum SurveyStatus }`. `reflectedIssueNumber` = số kỳ tạp chí mà kết quả **thực sự phản ánh** (lệch ~8 tuần so với `issueNumber` — đúng như Requiment mô tả).

#### `GET /survey-periods/:id/votes` — phiếu vote độc giả thô

Mảng `ReaderVoteListItemRes` (bớt `identityHash`/`ipHash`/`captchaScore` vì lý do privacy): `{ id, surveyPeriodId, seriesIds: string[], publicationType, authMethod, voteWeight, isFlagged, votedAt }`.

#### `GET /survey-periods/:id/survey-data` — dữ liệu vote offline (Editor nhập tay từ postcard)

Mảng `SurveyDataRes`: `{ id, surveyPeriodId, importedBy, surveyDate, importedAt, entries: [...] }` — đây chính là kênh "nhập dữ liệu bình chọn từ độc giả" theo cách truyền thống nêu ở Requiment §2.4.c (song song với vote online tự động ghi nhận qua `POST /vote` của Guest).

#### `GET /survey-periods/:id/rankings` — ranking đã tính cho 1 kỳ

Response `{ items: RankingRecordRes[] }`, mỗi item đầy đủ nội bộ (khác bản public đã ẩn tín hiệu biên tập): `{ seriesId, surveyPeriodId, magazine, publicationType, issueNumber, rankPosition, voteCount, normalizedScore, previousRank, rankChange, isAtRisk, riskLevel: enum RiskLevel, consecutiveAtRiskCount, isReliable }`. `consecutiveAtRiskCount` = số kỳ liên tiếp nằm vùng nguy cơ — chính là ngưỡng "N kỳ liên tiếp" (Requiment gợi ý 5–8) dùng để đánh dấu series cần Board xem xét hủy/đổi format.

#### `GET /rankings/board` — bảng xếp hạng toàn tạp chí 1 kỳ (full, không scope owner)

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `surveyPeriodId` | ✅ | string | |

Response `{ items: BoardRankingItem[] }` — giống `RankingRecordRes` nhưng **bớt** `consecutiveAtRiskCount` (không cần thiết ở view toàn tạp chí), thêm `recordedAt`.
**Lỗi:** `Error.SurveyPeriodNotFound` (404).

✅ **Xem xếp hạng TỔNG HỢP nhiều kỳ CÓ tín hiệu nguy cơ — route nội bộ MỚI (W1, 2026-08-02):** **`GET /rankings/internal/aggregate?magazine=&publicationType=&level=MONTH|YEAR&year=&month=`** (BOARD_MEMBER/EDITOR/MANGAKA/SUPER_ADMIN). Là bản nội bộ của `/rankings/aggregate` (public): gộp nhiều kỳ REFLECTED theo `averageNormalizedScore`, NHƯNG mỗi item **có thêm `isAtRisk`/`riskLevel`/`isReliable`** (lấy record kỳ mới nhất) — chính là thứ Board cần để đánh giá series nguy cơ qua thời gian. `isProvisional=true` = series tham gia quá ít kỳ → chưa đáng tin.
- Route public `GET /rankings/aggregate` vẫn tồn tại nhưng **ẩn** 3 tín hiệu trên — chỉ dùng cho Guest.
- Vẫn chỉ gom theo **tháng/năm dương lịch**. Muốn "N kỳ liên tiếp nguy cơ" của 1 series → `consecutiveAtRiskCount` ở `GET /survey-periods/:id/rankings`, hoặc `GET /rankings?seriesId=&periods=N`.

#### `GET /rankings` — trend ranking của 1 series (scoped theo owner, Board luôn qua)

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `seriesId` | ✅ | string | |
| `periods` | tuỳ | number (1–60, default 12) | |

Response cùng shape `BoardRankingListRes` ở trên, lọc chỉ giữ record thuộc kỳ đã `REFLECTED` (có `magazine`+`publicationType`).
**Lỗi:** `Error.RankingAccessDenied` (403, không áp dụng cho Board) · `Error.SeriesNotFound` (404).

### 6.6. `GET /audit` — nhật ký audit toàn hệ thống

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `entityType` | tuỳ | `enum AuditEntityType` | |
| `entityId` | tuỳ | string | |
| `actorId` | tuỳ | string | |
| `action` | tuỳ | string | `TRANSITION` \| `HOLD` \| `RESUME` \| `BAN` \| … (chuỗi tự do đã chuẩn hoá theo module) |
| `limit`/`offset` | tuỳ | number | ≤100/default 20, default 0 |

Response `{ items: AuditLogRes[], total, limit, offset }`, mỗi item: `{ id, actorId (null=hệ thống), entityType, entityId, action, fromState, toState, reason, createdAt }`. Đây là công cụ Board dùng để **truy vết phiếu bầu/quyết định lịch sử** — đúng ghi chú "Điểm cần bổ sung" trong Requiment §2.4.a (dù entity `Vote` không có route riêng, lịch sử transition + audit log là nguồn thay thế).

### 6.7. Danh bạ tham chiếu (module `users`)

#### `GET /assistants` — danh bạ trợ lý

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `q` | tuỳ | string (1–100) | Tìm theo `name`/`displayName` |
| `level` | tuỳ | string | |
| `availableFrom`/`availableTo` | tuỳ | ISO datetime (có offset) | |
| `limit`/`offset` | tuỳ | number | |

Response `{ items, total, limit, offset }` — mỗi item **kèm `email`/`phoneNumber` để liên hệ** (2026-08-04), ưu tiên sắp xếp theo `isRecommended`/`reputationScore`. ⚠ Chỉ liệt kê Assistant đã build hồ sơ.

#### `GET /mangakas` — danh bạ Mangaka

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `q` | tuỳ | string | Tìm theo `name`/`displayName`/`penName` |
| `genre` | tuỳ | `enum Genre` | |
| `level` | tuỳ | string | |
| `limit`/`offset` | tuỳ | number | |

Response cùng dạng phân trang, mỗi item **kèm `email`/`phoneNumber` để liên hệ** (2026-08-04). ⚠ Chỉ liệt kê Mangaka đã build hồ sơ.

#### `GET/PUT /me/staff-profile` — hồ sơ nghiệp vụ của chính Board member

`PUT` (full upsert, KHÔNG phải partial-patch — gửi thiếu field nào bị ghi đè về default rỗng):

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `specialtyGenres` | tuỳ (default `[]`) | `enum Genre[]` | **Dùng để auto-assign Board vào phiên pitch (PB-05)** — xem `GET /board/suggest-members` mà Editor gọi khi tạo session không truyền sẵn `allowedEditorIds`: hệ thống chấm điểm ứng viên theo số genre giao nhau với series, Board member khai càng đúng sở trường càng dễ được mời |
| `demographics` | tuỳ (default `[]`) | `enum Demographic[]` | |
| `bio` | tuỳ | string (≤2000) | |
| `yearsOfExperience` | tuỳ | number (0–80) | |

`GET` response `StaffProfileRes`: `{ userId, role: {id,code,description}, demographics, bio, yearsOfExperience, displayName, avatar, hasProfile }` (lưu ý: response **không echo lại `specialtyGenres`** trong `StaffProfileRes` — field này chỉ dùng nội bộ cho thuật toán suggest, không hiển thị lại qua GET; FE muốn hiển thị lại giá trị vừa lưu nên tự giữ state phía client sau khi PUT).
**Lỗi:** `Error.ProfileNotFound` (404, hiếm gặp trong luồng thường).

### 6.8. Production reference (đọc để nắm tiến độ sản xuất trước khi bỏ phiếu/duyệt)

7 route sau đây **không nằm trong danh sách định hướng ban đầu** của nhiệm vụ (chỉ liệt kê Series/Survey/Publication/Audit/Reference) nhưng có thật trong `route-roles.ts` với `BOARD_MEMBER` trong `allowed[]`:

#### `GET /chapters/:id/storyboards` / `GET /storyboards/:id` — Storyboard của chapter (thực tế 0..1)

Response dùng `StoryboardRes`: `{ id, chapterId, status: enum StoryboardStatus, version, submittedAt, pages: [{pageNumber, fileUrl}] }`.
**Lỗi:** `Error.ChapterNotFound` (404) · `Error.StoryboardNotFound` (404, chỉ detail).

#### `GET /chapters/:id/pages` — danh sách trang của chapter

Response mảng `PageRes` (scope theo sở hữu/phụ trách với Mangaka/Editor/Assistant, nhưng Board xem không giới hạn scope). Field chính: `pageNumber`, `status: enum PageStatus` (`DRAFT`/`COMPLETED`/`REVISING`), `originalFile`/`compositeFile` (object key R2).
**Lỗi:** `Error.ChapterNotFound` (404) · `Error.ChapterAccessDenied` (403, không áp dụng cho Board).

#### `GET /chapters/:id/progress` — dashboard tiến độ 1 chapter

Response `ChapterProgressRes`:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `storyboardStatus` | `enum StoryboardStatus` \| null | null nếu chapter chưa có Storyboard |
| `totalPages`/`pagesReady`/`pagesPending` | number | |
| `taskBreakdown` | `Record<enum TaskStatus, number>` zero-filled | |
| `deadline`/`remainingHours` | string/number \| null | |
| `progressPct` | number | |
| `warningLevel` | `enum WarningLevel` (tính runtime, không nằm trong `schema.prisma` — xem `01` §7 cuối) | `NONE`/`YELLOW`/`RED`/`CRITICAL` theo ngưỡng ngày còn lại × % hoàn thành |
| `onHold` | boolean | |
| `currentStage` | `{id, name, order, status: enum ProductionStageStatus}` \| null | |

**Lỗi:** `Error.ChapterNotFound` (404) · `Error.ChapterAccessDenied` (403, không áp dụng cho Board).

#### `GET /chapters/:id/stages` — danh sách giai đoạn sản xuất + analytics

Response `StageListRes` — mảng `ProductionStage` (`LOCKED`/`ACTIVE`/`COMPLETED`) kèm phân tích thời lượng mỗi giai đoạn.
**Lỗi:** `Error.StageAccessDenied` (403, không áp dụng cho Board).

> 🔴 **`status` đi lùi được (Spec 26, 2026-07-28).** Khi Editor trả bản thảo về sửa, Mangaka có quyền mở lại một
> giai đoạn đã xong: giai đoạn đó `COMPLETED → ACTIVE`, **mọi giai đoạn sau nó về `LOCKED`**, `completedAt` quay về
> `null` và `analytics.stageDurationMs` đếm lại cho vòng sửa hiện tại. Đọc số liệu này như **"vòng sửa hiện tại"**,
> không phải tổng tích luỹ — nếu không sẽ tưởng chương bị tụt tiến độ hoặc mất dữ liệu.

#### `GET /revision-requests` — vòng yêu cầu sửa (toàn hệ thống với Board)

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `targetType` | tuỳ | `enum RevisionTargetType` | `PROPOSAL`/`NAME`/`MANUSCRIPT`/`TASK` |
| `targetId` | tuỳ | string | |
| `isResolved` | tuỳ | `'true'\|'false'` | omit = tất cả |
| `limit`/`offset` | tuỳ | number | |

Response `{ items: RevisionRequestRes[], total, limit, offset }`, mỗi item: `{ id, targetType, targetId, seriesId, round, reason, requestedBy, recipientId, isResolved, resolvedAt, resolvedBy, createdAt, requester, recipient, resolver, series }`.
⚠️ **Không có route `GET /revision-requests/:id`** — mọi field (kể cả `reason`/`resolver`) phải lấy từ chính list này, không tách list-item gọn hơn (khác các list khác trong guide này).

#### `POST /tasks/:id/download-url` — ký URL tải file của 1 task

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `key` | ✅ | string | Phải là 1 trong các key thực sự thuộc task (ảnh gốc/composite trang, file version Assistant nộp, asset reference Mangaka đính) |

Response: `{ downloadUrl, expiresAt }`. Board (cùng Super Admin) được xem **không giới hạn theo sở hữu** — chỉ cần `key` đúng thuộc task đó.
**Lỗi:** `Error.TaskNotFound` (404) · `Error.TaskFileForbidden` (403 — `key` không thuộc allowlist của task, dù đúng quyền role).

---

## 7. Đối chiếu hoàn thiện — 80/80 route

Đã viết đủ **80/80 route** BOARD_MEMBER theo `route-roles.ts` (không route nào bỏ sót; 2 route /series-requests mới của Spec 30 là read-only để theo dõi). 7 route production-reference (`/chapters/:id/storyboards`, `/storyboards/:id`, `/chapters/:id/pages`, `/chapters/:id/progress`, `/chapters/:id/stages`, `/revision-requests`, `/tasks/:id/download-url`) được mô tả ở §6.8.

### Phát hiện đáng chú ý so với guide cũ / Requiment gốc

1. **Board KHÔNG vận hành phiên họp** — không tạo/mở/chuyển phase/kết thúc session, không tự tạo `BoardDecision`. Toàn bộ việc đó là của Editor/Super Admin; Board chỉ dự họp (chat khi không phải VOTING), bỏ phiếu, và xem.
2. **Công thức quorum/majority xác nhận bằng test, không suy đoán:** quorum = `totalVotes >= ceil(rosterSize*2/3)`; majority so với **tổng roster** (`approveCount > rosterSize*ratio`), không phải so với số phiếu đã bỏ; `ABSTAIN` tính vào quorum nhưng không tính vào approve/reject. Roster ở đây là `session.allowedEditorIds` (số người được mời họp phiên đó), không phải tổng Board Member toàn hệ thống.
3. **Hoà phiếu → mặc định REJECTED**, không có cơ chế "Tổng biên tập quyết định cuối" như Requiment gốc đề xuất — đây là điểm quan trọng cần báo lại team nghiệp vụ nếu họ mong đợi hành vi khác.
4. **`BoardDecision` loại `CONTRACT`/`TRANSFER` không tự động thực thi** khi APPROVED — Board phải chủ động vào Contract/Transfer detail bấm route hành động tương ứng (khác `SERIALIZATION`/`CANCELLATION`/`COMPLETION`/`FORMAT_CHANGE` tự động áp lên Series qua event listener).
5. **🔴 §87 — HĐ ban đầu nay 2-phase, KHÔNG còn "board-approve" tập thể hay "ký toàn roster".** Phase 1: Board comment tư vấn (không vote) → **1 đại diện** `claim` → `sign-representative` (chỉ 1 người ký). Phase 2: Mangaka accept/reject. UI Board cần: danh sách comment + nút "Nhận làm đại diện" (claim) + nút "Ký (OTP)" chỉ hiện cho đại diện. *(Chỉ **Amendment** — sửa HĐ sau `FULLY_EXECUTED` — mới còn giữ cơ chế đa-ký cũ.)*
6. **`GET /revision-requests` không có route detail** — toàn bộ field phải lấy từ list (đã có `resolver` embed để không cần thêm lookup tên).
7. `defense-dashboard` không nằm trong module `series` như brief gợi ý mà thực tế sống trong module `tankobon.controller.ts` — cùng chỗ với `POST /tankobon-sales`, phản ánh đúng thiết kế: 2 route này cùng phục vụ 1 màn hình "bảo vệ series" (Requiment §2.4.b).
