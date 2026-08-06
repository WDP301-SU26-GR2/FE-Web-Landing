# 08 — Spec 2026-08-06: Danh mục tạp chí · Siết quyết định Hội đồng · Huỷ HĐ nháp + 3 FLOW quan trọng

> **Đối tượng:** dev FE web + mobile. File này là **delta contract** của đợt vá 2026-08-06 (nhóm A–F) **cộng 3 flow** để nối API cho chuẩn.
> **Route inventory: 285 → 291** (thêm 6 route). Nguồn sự thật vẫn là `BE-dev/test/flows/route-roles.ts`.
> **Đọc kèm:** `05-editor.md` (Board decision · Contract), `06-board-member.md` (Board), `07-super-admin.md` (AppConfig · Survey), `01-conventions-and-auth.md` (envelope · notification).

---

## 0. TL;DR — cái gì đổi

| Nhóm | Thay đổi | Loại |
|---|---|---|
| **Danh mục tạp chí** | 4 route mới: `GET /magazines` · `POST` / `PATCH` / `DELETE /admin/magazines[/:name]` | 🆕 |
| **Sửa slot bộ truyện** | `PATCH /admin/series/:id/slot` (Super Admin sửa magazine/kỳ/nhịp đã lỡ nhập sai) | 🆕 |
| **Huỷ HĐ nháp** | `POST /contracts/:id/void` (Editor huỷ hợp đồng đang soạn) | 🆕 |
| **`DecisionType` gọn còn 8 giá trị** | Xoá `CONTINUE`/`CANCEL`/`HIATUS`/`ENDING_ALLOWANCE` khỏi enum → gửi lên **422** | 🔴 BREAKING |
| **Siết `POST /board/decisions`** | 3 gate mới: 404 series không tồn tại · 409 loại quyết định sai trạng thái series · 409 series đã có quyết định mở · 422 tạp chí ∉ danh mục · 422 nhịp không hợp tạp chí | 🔴 BREAKING |
| **Báo cáo trùng quyết định** | `POST /board/reports` trùng → **409 `Error.BoardReportAlreadyExists`** (trước là `Error.RecordAlreadyExists`) | 🔴 BREAKING |
| **Field `message` ở response mutation** | `ChapterRes` / `StoryboardRes` / `SeriesRes` thêm `message?` — FE phân biệt "đã duyệt phác thảo / đã duyệt bản thảo / đã xuất bản…" | 🆕 additive |
| **4 `referenceType` thông báo mới** | `CONTRACT_REPRESENTATIVE_SIGNED` · `CONTRACT_COMMENT_ADDED` · `STORYBOARD_SUBMITTED` · `CONTRACT_VOIDED` | 🆕 additive |

---

## 1. Danh mục tạp chí (Magazine Registry)

**Vì sao có:** trước đây `magazine` là **text tự do** Editor gõ tay khi mở quyết định serial hoá → lỡ gõ "ko có" là nó lọt lên `GET /public/series?magazine=` và không sửa lại được. Nay tạp chí là **danh mục do Super Admin quản lý**; Editor **chỉ được chọn**, không tự sinh.

Mỗi tạp chí mang theo **danh sách nhịp phát hành nó chấp nhận** (`publicationTypes`), ví dụ `FT Jump` chỉ `WEEKLY`, `FT Jump SQ` nhận `MONTHLY` + `IRREGULAR`.

### 1.1. `GET /magazines` — EDITOR · BOARD_MEMBER · SUPER_ADMIN

> ⚠️ **KHÔNG phải `/admin/magazines`.** Editor cần route này để dựng dropdown khi mở quyết định `SERIALIZATION`.

```jsonc
// 200 → data:
{ "items": [
  { "name": "FT Jump",    "publicationTypes": ["WEEKLY"] },
  { "name": "FT Jump SQ", "publicationTypes": ["MONTHLY", "IRREGULAR"] }
]}
```
FE dựng **dropdown 2 tầng**: chọn tạp chí → `publicationType` chỉ hiện các nhịp trong `publicationTypes` của tạp chí đó.

### 1.2. `POST /admin/magazines` — SUPER_ADMIN
```jsonc
// body (.strict)
{ "name": "FT Jump", "publicationTypes": ["WEEKLY"] }
// 201 → data: { "name": "FT Jump", "publicationTypes": ["WEEKLY"] }
```
- `name` tự **normalize** (trim + gộp khoảng trắng thừa) rồi mới lưu.
- `publicationTypes`: mảng ≥ 1 phần tử, **không trùng** (trùng → 422), giá trị ∈ `WEEKLY|MONTHLY|IRREGULAR`.
- Trùng tên (không phân biệt hoa/thường) → **409 `Error.MagazineAlreadyExists`**.

### 1.3. `PATCH /admin/magazines/:name` — SUPER_ADMIN
> 🔵 **NGỮ NGHĨA quan trọng: PATCH gửi TRẠNG THÁI CUỐI CÙNG của mảng (replace), KHÔNG có thao tác "thêm 1 nhịp"/"bỏ 1 nhịp" riêng.**

```jsonc
// body (.strict) — CHỈ publicationTypes; KHÔNG đổi được tên (gửi kèm name → 422)
{ "publicationTypes": ["WEEKLY", "MONTHLY"] }
```
```
FT Jump đang = ["WEEKLY"]
Thêm MONTHLY → PATCH { "publicationTypes": ["WEEKLY","MONTHLY"] }   ✅ mở rộng luôn cho
Bỏ   WEEKLY  → PATCH { "publicationTypes": ["MONTHLY"] }
               BE tự tính phần bị bỏ = ["WEEKLY"] → nếu còn Series/SurveyPeriod dùng cặp
               ("FT Jump","WEEKLY") → 409 Error.PublicationTypeInUse; không ai dùng → 200
```
⚠️ **FE phải gửi ĐỦ** danh sách hiện có + phần muốn thêm. **Gửi thiếu = ra lệnh xoá nhịp đó.**
- Không tìm thấy tạp chí → **404 `Error.MagazineNotFound`**.

### 1.4. `DELETE /admin/magazines/:name` — SUPER_ADMIN
- Còn `Series` **hoặc** `SurveyPeriod` dùng tạp chí này → **409 `Error.MagazineInUse`** (không cho xoá).
- Không tìm thấy → **404 `Error.MagazineNotFound`**.
- OK → `200 { message: "Đã xoá tạp chí khỏi danh mục" }`.

### 1.5. `PATCH /admin/series/:id/slot` — SUPER_ADMIN (đường sửa dữ liệu đã hỏng)
Dùng khi series đã lỡ có `magazine` rác/sai nhịp (không sửa được qua `PATCH /series/:id` vì route đó của Mangaka/Editor).
```jsonc
// body (.strict) — mọi field optional, gửi cái nào sửa cái đó
{ "magazine": "FT Jump", "startIssueNumber": 12, "publicationType": "WEEKLY" }
// 200 → data: { message: "Đã cập nhật slot bộ truyện" }
```
- Chỉ nhận series `status ∈ {SERIALIZED, HIATUS, COMPLETING, CANCELLING}` (đã có slot); khác → **409 `Error.SeriesSlotNotEditable`**.
- `magazine` phải ∈ danh mục + nhịp hợp lệ (như §2.3), sai → **422**. Series không tồn tại → **404**.

---

## 2. `POST /board/decisions` — siết validate (BREAKING)

### 2.1. `DecisionType` nay chỉ còn **8 giá trị**
```
SERIALIZATION · CANCELLATION · COMPLETION · FORMAT_CHANGE · REPRINT · TRANSFER · CONTRACT · SERIES_CONTRACT_APPROVAL
```
- **Đã xoá** `CONTINUE`, `CANCEL`, `HIATUS`, `ENDING_ALLOWANCE` → gửi lên **422**. FE **bỏ khỏi mọi dropdown**.
- `SERIES_CONTRACT_APPROVAL` là **nội bộ** (BE tự tạo cho luồng hợp đồng) → FE gửi trực tiếp cũng **422**. Không đưa vào dropdown.
- ❓ **"Hội đồng quyết định GIỮ NGUYÊN bộ truyện" thì làm sao?** → mở quyết định **`CANCELLATION`** rồi Hội đồng **bỏ phiếu REJECT**. Kết quả `REJECTED`, bộ truyện giữ `SERIALIZED`, lý do lưu ở `Vote.note`. (Không còn `CONTINUE`.)

### 2.2. Gate trạng thái series (chỉ khi `targetSeriesId != null`)
Thứ tự kiểm: tồn tại → loại×trạng thái → tạp chí → đã-có-quyết-định-mở.

| Lỗi | Khi nào | Ý nghĩa cho FE |
|---|---|---|
| **404 `Error.SeriesNotFound`** | `targetSeriesId` rác/không tồn tại | id sai |
| **409 `Error.DecisionTypeNotAllowedForSeriesStatus`** | loại quyết định không hợp trạng thái series (bảng dưới) | disable option theo status |
| **409 `Error.OpenBoardDecisionExists`** | series đã có 1 quyết định **chưa chốt** (kể cả ở phiên khác) | phải chốt/để phiên bế mạc cái cũ trước |

**Bảng loại quyết định × trạng thái series hợp lệ** (loại không có trong bảng = REPRINT/TRANSFER/CONTRACT → không kiểm status, do module khác sở hữu vòng đời):

| `decisionType` | Trạng thái series hợp lệ |
|---|---|
| `SERIALIZATION` | `PITCHED` |
| `CANCELLATION` · `COMPLETION` · `FORMAT_CHANGE` | `SERIALIZED` · `HIATUS` |

### 2.3. Gate tạp chí (SERIALIZATION + FORMAT_CHANGE)
| Lỗi | Khi nào | path |
|---|---|---|
| **422 `Error.MagazineNotRegistered`** | `SERIALIZATION`, `details.magazine` **∉ danh mục** | `details.magazine` |
| **422 `Error.PublicationTypeNotSupportedByMagazine`** | nhịp không nằm trong `publicationTypes` của tạp chí (SERIALIZATION theo `details.magazine`; FORMAT_CHANGE theo **magazine hiện tại của series**) | `details.publicationType` |

> Danh mục **rỗng** (chưa seed) → cả 2 gate được bỏ qua (thoát hiểm). Vì vậy Super Admin **phải seed `/admin/magazines` trước** khi Editor mở serial hoá thật.

### 2.4. Báo cáo 1:1 với quyết định
- `POST /board/reports` cho một `boardDecisionId` đã có báo cáo → **409 `Error.BoardReportAlreadyExists`** (mỗi quyết định đúng **1** báo cáo). Trước đây rơi vào `Error.RecordAlreadyExists` chung.
- `reportType` là **text tự do** (không phải enum) — cho nhập bình thường (vd "hồ sơ bảo vệ", "phân tích xếp hạng", "kế hoạch kết thúc").

---

## 3. `POST /contracts/:id/void` — huỷ hợp đồng nháp (Editor)
```jsonc
// body (.strict)
{ "reason": "Soạn nhầm điều khoản" }   // 1..1000 ký tự
// 201 → data: Contract (status = VOIDED)
```
- Chỉ **Editor phụ trách** hợp đồng (`contract.editorId`), khác → **403 `Error.NotAssignedContractEditor`**.
- Chỉ huỷ được khi hợp đồng ở **`DRAFT`** hoặc **`BOARD_REVIEW`**; từ `AWAITING_MANGAKA` trở đi → **409 `Error.InvalidContractTransition`** (đại diện Hội đồng đã ký thì phải đi đường Mangaka từ chối rồi Editor `redraft`).
- Huỷ ở `BOARD_REVIEW` → hệ thống thông báo **tác giả** (`CONTRACT_VOIDED`) + **roster Hội đồng** (đang chờ nhận vai đại diện). Huỷ ở `DRAFT` → không báo tác giả (họ chưa biết HĐ tồn tại).
- Hợp đồng `VOIDED` **không chặn** Editor soạn HĐ mới cho cùng bộ truyện.

---

## 4. Field `message` ở response mutation + 4 notification mới

### 4.1. `message?` trên `ChapterRes` / `StoryboardRes` / `SeriesRes`
Response của các route mutating nay kèm `data.message` mô tả hành động — FE hiển thị toast/timeline chuẩn thay vì tự đoán:

| Route | `data.message` |
|---|---|
| `POST /chapters/:id/storyboards/:sid/submit` | Đã nộp bản phác thảo cho biên tập viên |
| `.../storyboards/:sid/approve` | Đã duyệt bản phác thảo — tác giả có thể bắt đầu vẽ bản chính |
| `.../storyboards/:sid/request-revision` | Đã gửi yêu cầu chỉnh sửa bản phác thảo |
| `POST /chapters/:id/manuscript/submit` | Đã nộp bản thảo cho biên tập viên |
| `.../manuscript/request-revision` | Đã gửi yêu cầu chỉnh sửa bản thảo |
| `.../manuscript/resubmit` | Đã nộp lại bản thảo |
| `.../manuscript/approve` | Đã duyệt bản thảo — sẵn sàng in |
| `POST /chapters/:id/publish` | Đã xuất bản chương truyện |
| `POST /series/:id/reopen` | Đã mở lại hồ sơ… **Hồ sơ sẽ quay lại hàng đợi chung, biên tập viên khác có thể nhận.** |

> `message` chỉ có ở response **mutation**; ở `GET`/list nó absent — đừng phụ thuộc để render list.

### 4.2. 4 `referenceType` thông báo mới (deep-link theo prefix như cũ)
| `referenceType` | Người nhận | Khi nào |
|---|---|---|
| `CONTRACT_REPRESENTATIVE_SIGNED` | Editor phụ trách HĐ | Đại diện Hội đồng vừa ký (HĐ chờ tác giả) |
| `CONTRACT_COMMENT_ADDED` | Editor phụ trách HĐ | Board thêm góp ý HĐ (gộp 1 thông báo/HĐ — bấm vào xem `GET /contracts/:id/comments`) |
| `STORYBOARD_SUBMITTED` | Editor phụ trách series | Tác giả nộp bản phác thảo chương |
| `CONTRACT_VOIDED` | Tác giả + roster Hội đồng | HĐ đang soạn (BOARD_REVIEW) bị huỷ |

---

# PHẦN B — 3 FLOW CHI TIẾT (để nối API cho chuẩn)

## FLOW ① — Admin: Tạp chí → Kỳ bình chọn → Ranking

Ba thứ này **móc xích bằng chuỗi `magazine`**: tạp chí là danh mục gốc, kỳ bình chọn (`SurveyPeriod`) thuộc về (tạp chí + nhịp + số kỳ), ranking (`RankingRecord`) sinh ra khi chốt kỳ. Tất cả thao tác **vận hành** thuộc **SUPER_ADMIN** (Editor chỉ ĐỌC ranking để bảo vệ series).

### B1. Vòng đời danh mục tạp chí (CRUD)
```
[Super Admin] GET /magazines                     → xem danh mục hiện có
      │
      ├─ thêm:  POST /admin/magazines { name, publicationTypes }
      ├─ sửa nhịp: PATCH /admin/magazines/:name { publicationTypes }   (gửi TRẠNG THÁI CUỐI)
      │            └─ thu hẹp nhịp đang dùng → 409 PublicationTypeInUse
      └─ xoá:   DELETE /admin/magazines/:name
                 └─ còn series/kỳ dùng → 409 MagazineInUse
```
👉 **Đây là bước NỀN.** Nếu danh mục rỗng, Editor mở serial hoá sẽ "lọt" magazine bậy (gate bypass). Seed tạp chí **trước tiên**.

### B2. Mở & vận hành kỳ bình chọn (đã có từ trước — nhắc để nối đúng)
```
1) [SA] GET /survey-periods/eligible-series?magazine=&publicationType=
        → danh sách series ĐỦ ĐIỀU KIỆN (status ∈ SERIALIZED|CANCELLING|COMPLETING, khớp magazine+nhịp).
          Dùng CHUNG hằng số với validate của POST /survey-periods ⇒ không bao giờ lệch.
2) [SA] POST /survey-periods { magazine, publicationType, issueNumber, startDate, endDate, eligibleSeriesIds[] }
        → tạo kỳ DRAFT. magazine tự normalize; eligibleSeriesIds validate từng id.
3) [SA] PATCH /survey-periods/:id/status  (DRAFT→OPEN→CLOSED; KHÔNG PATCH REFLECTED)
        → OPEN: eligibleSeriesIds thành SNAPSHOT bất biến.
   [Guest] POST /vote/otp → POST /vote  (public, xem 02-guest-reader.md)
   [SA] POST /survey-data/import  (kỳ CLOSED — nhập phiếu postcard offline, optional)
4) [SA] POST /survey-periods/:id/finalize  (kỳ CLOSED)
        → tạo RankingRecord cho MỌI eligible series (kể cả 0 phiếu) + CLOSED→REFLECTED
        → emit ranking.finalized; đánh dấu isAtRisk/riskLevel (loại series HIATUS + đã-chốt-số-phận).
```
> ⚠️ **Chuỗi `magazine` phải KHỚP TUYỆT ĐỐI** giữa `Series.magazine` và `SurveyPeriod.magazine`. Từ đợt này BE **normalize cả hai bằng cùng một hàm** khi ghi → hết cảnh "mở kỳ thấy 0 series mà không báo lỗi". FE vẫn nên cho SA **chọn magazine từ `GET /magazines`** (không gõ tay) ở mọi form.

### B3. Đọc ranking (mọi role trong phạm vi)
```
Public:  GET /vote/results?surveyPeriodId=   (chỉ khi REFLECTED)
         GET /vote/results/latest?magazine=&publicationType=
         GET /rankings/aggregate?magazine=&publicationType=&level=MONTH|YEAR&year=&month=
Editor/Board/SA: GET các route ranking/survey (đọc để làm hồ sơ bảo vệ series — KHÔNG bị siết).
```

---

## FLOW ② — `COMPLETING` / `CANCELLING` xuất hiện từ đâu & đi tới đâu

Hai trạng thái này **KHÔNG do FE set trực tiếp**. Chúng sinh ra **duy nhất** khi Hội đồng **chốt (APPROVED)** một quyết định vòng đời, rồi kết thúc bằng 1 route finalize của Editor phụ trách:

```
                    Board APPROVE CANCELLATION            Editor: POST /series/:id/finalize-ending
 SERIALIZED ───────────────────────────────► CANCELLING ──────────────────────────────────► CANCELLED
 hoặc HIATUS                                     │                POST /series/:id/force-cancel
                                                 └───────────────────────────────────────────► CANCELLED (không có ending)

                    Board APPROVE COMPLETION             Editor: POST /series/:id/finalize-ending
 SERIALIZED ───────────────────────────────► COMPLETING ──────────────────────────────────► COMPLETED
 hoặc HIATUS
```

**3 điều FE cần nhớ:**
1. **Tác giả KHÔNG tự chuyển COMPLETING.** Muốn kết thúc sớm, tác giả gửi `POST /series-requests { requestType: COMPLETION }` → Editor accept **chỉ mở đường** trình Hội đồng (KHÁC `HIATUS`: accept đổi status ngay). Việc đổi sang `COMPLETING` chỉ xảy ra khi **Board APPROVE** quyết định `COMPLETION`.
2. **`CANCELLING`/`COMPLETING` VẪN đang phát hành:** tạo chương kết được, xuất bản được, **vẫn được đưa vào kỳ bình chọn** (khác `HIATUS` — bị loại vì kỳ đó không có chương mới). Nhưng lúc `finalize` ranking, series đã-chốt-số-phận này **không** bị gắn cờ "nguy cơ bị huỷ".
3. **Chỉ Editor phụ trách** chốt được `finalize-ending`. `endingChapterAllowance` (3–5 chương, Immediate Axe 1–2) do Board đặt trong quyết định `CANCELLATION` (`details.endingChapterAllowance`, 1..10).

**Cổng liên quan cần disable/enable trên UI:** ở `CANCELLING`/`COMPLETING`, nút "Tạo chương" (`POST /chapters`) vẫn mở (đã từng có hợp đồng hiệu lực là đủ); nhưng số chương bị chặn khi vượt allowance (CANCELLING).

---

## FLOW ③ — Phiên họp Hội đồng: tạo phiên → thêm quyết định cho series → báo cáo → bỏ phiếu

Một **phiên họp** (`BoardSession`) có thể bàn **nhiều bộ truyện**, mỗi bộ truyện **một quyết định** (`BoardDecision`). Phiên chạy **3 giai đoạn FORWARD-ONLY**: `PRESENTING → QA → VOTING`.

```
① [Editor/SA] POST /board/sessions
     body: { title, startTime, endTime?, allowedEditorIds?[≥3 lẻ], seriesId?, rosterSize? }
     - Omit allowedEditorIds → BE auto-assign roster theo thể loại series (cần seriesId), LUÔN lẻ & ≥3.
     - Preview roster trước: GET /board/suggest-members?seriesId=
     → session PRESENTING.

② [Editor phụ trách] POST /board/decisions  (mở 1 quyết định cho MỖI bộ truyện)
     body: { boardSessionId, targetSeriesId, decisionType, details, transferRequestId? }
     GATE (xem §2): decisionType ∈ 8 · series tồn tại · loại×status hợp lệ · magazine ∈ danh mục
                    · series CHƯA có quyết định mở nào (409 OpenBoardDecisionExists).
     Ví dụ SERIALIZATION: details = { magazine, startIssueNumber, publicationType }  (magazine CHỌN từ GET /magazines)
     Ví dụ CANCELLATION:  details = { endingChapterAllowance?: 1..10 }

③ [Editor phụ trách] POST /board/reports  (đính báo cáo phân tích cho quyết định — tuỳ chọn, tối đa 1/quyết định)
     body: { seriesId, boardDecisionId, reportType (text tự do), content, attachments[]? }
     trùng quyết định → 409 BoardReportAlreadyExists.

④ [Người tạo phiên] PATCH /board/sessions/:id/phase { phase }  (PRESENTING→QA→VOTING, cho nhảy cóc, KHÔNG lùi)
     - QA: Hội đồng hỏi đáp qua chat (WebSocket /board + GET /board/sessions/:id/messages). Cần JWT lúc handshake.
     - VOTING: chat khoá, chỉ bỏ phiếu.

⑤ [Board member ∈ roster / Editor] POST /board/decisions/:id/vote { voteValue: APPROVE|REJECT|ABSTAIN, note? }
     - Quorum = ceil(2/3 × rosterSize). APPROVED khi approve > 50% TOÀN roster (absolute majority).
     - Đủ điều kiện → decision APPROVED/REJECTED → emit board.decision.finalized → listener áp lên Series:
         SERIALIZATION APPROVED → Series SERIALIZED (+ set slot từ details)
         CANCELLATION  APPROVED → Series CANCELLING   |  REJECTED → Series GIỮ NGUYÊN (đây là "CONTINUE")
         COMPLETION    APPROVED → Series COMPLETING
         FORMAT_CHANGE APPROVED → đổi publicationType (Amendment)
     - Chưa đủ quorum khi phiên bế mạc → decision EXPIRED (mở lại phiên mới để vote lại).

⑥ Phiên đóng: tự động khi quá endTime, hoặc thủ công. Quyết định treo → EXPIRED.
```

**FE lưu ý:**
- **1 series = tối đa 1 quyết định chưa chốt** tại một thời điểm (kể cả ở phiên khác). Nếu bấm mở quyết định mới mà dính `409 OpenBoardDecisionExists`, phải chờ quyết định cũ chốt hoặc phiên cũ bế mạc.
- Roster **luôn lẻ** — nếu truyền `allowedEditorIds` chẵn → 422.
- `Vote.note` là chỗ ghi lý do (đặc biệt khi REJECT một `CANCELLATION` để "giữ bộ truyện").
- Card danh sách quyết định (`GET /board/decisions`) đã có sẵn `approveCount/rejectCount/totalVotes/quorumMet` → không cần tải `votes[]` để hiện "3/5 phiếu".

---

## 5. Checklist tích hợp FE (đợt 2026-08-06)
- [ ] Bỏ `CONTINUE`/`CANCEL`/`HIATUS`/`ENDING_ALLOWANCE`/`SERIES_CONTRACT_APPROVAL` khỏi mọi dropdown `decisionType`.
- [ ] Form mở serial hoá: magazine **chọn từ `GET /magazines`** (dropdown 2 tầng magazine→nhịp), không gõ tay.
- [ ] Bắt 5 lỗi mới ở `POST /board/decisions` (404 SeriesNotFound · 409 DecisionTypeNotAllowedForSeriesStatus · 409 OpenBoardDecisionExists · 422 MagazineNotRegistered · 422 PublicationTypeNotSupportedByMagazine).
- [ ] `POST /board/reports` map lại mã trùng → `Error.BoardReportAlreadyExists`.
- [ ] Màn Super Admin: thêm mục quản lý tạp chí (4 route) + nút "Sửa slot" (`PATCH /admin/series/:id/slot`).
- [ ] Màn Editor: nút "Huỷ hợp đồng" (`POST /contracts/:id/void`) chỉ hiện khi HĐ ở `DRAFT`/`BOARD_REVIEW`.
- [ ] Hiển thị `data.message` ở toast cho các route mutation storyboard/manuscript/chapter/reopen.
- [ ] Đăng ký deep-link cho 4 `referenceType` thông báo mới.
