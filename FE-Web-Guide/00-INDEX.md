# FE Web Guide — Manga Creation Workflow System

> **Đối tượng đọc:** dev FE web (React/Next/Vue...). Mỗi role có 1 file riêng — chỉ đọc file role bạn đang code, cộng với file `01-conventions-and-auth.md` (đọc 1 lần, dùng chung mọi role).
> **Nguồn dữ liệu:** đọc trực tiếp từ `BE-dev/src/modules/*` (controller/schema/dto/errors/messages), `BE-dev/prisma/schema.prisma`, `BE-dev/test/flows/route-roles.ts` (mapping route↔role sinh tự động từ Reflect metadata runtime — nguồn sự thật duy nhất về quyền), và `Docs/Requiment-SRS/Requiment.md` (nghiệp vụ gốc, các Flow 1–13).
> ⚠️ **Bộ guide này THAY THẾ hoàn toàn** `FE-API-Guide-v3.md` và `FE-Mobile-RN-Guide.md` (bản cũ, dựng theo flow — do code/nghiệp vụ đã đổi nhiều đợt sau đó nên 2 file cũ có thể sai lệch; đừng dùng lại làm nguồn).
> 🔴 **2026-08-06 — DANH MỤC TẠP CHÍ · SIẾT QUYẾT ĐỊNH HỘI ĐỒNG · HUỶ HĐ NHÁP. Route 285 → 291. Xem file mới [`08-spec-2026-08-06-magazines-decisions-flows.md`](08-spec-2026-08-06-magazines-decisions-flows.md) (delta contract đầy đủ + 3 FLOW: tạp chí/ranking/kỳ vote · COMPLETING/CANCELLING · phiên họp Hội đồng).**
> - 🔴 BREAKING `DecisionType` còn **8 giá trị** (xoá `CONTINUE`/`CANCEL`/`HIATUS`/`ENDING_ALLOWANCE` → 422; `SERIES_CONTRACT_APPROVAL` nội bộ → 422). "Giữ bộ truyện" = mở `CANCELLATION` rồi vote REJECT.
> - 🔴 BREAKING `POST /board/decisions` thêm 5 lỗi: 404 `SeriesNotFound` · 409 `DecisionTypeNotAllowedForSeriesStatus` · 409 `OpenBoardDecisionExists` · 422 `MagazineNotRegistered` · 422 `PublicationTypeNotSupportedByMagazine`.
> - 🔴 BREAKING `POST /board/reports` trùng quyết định → 409 `Error.BoardReportAlreadyExists` (trước là `RecordAlreadyExists`).
> - 🆕 6 route: `GET /magazines` (EDITOR/BOARD/SA) · `POST`/`PATCH`/`DELETE /admin/magazines[/:name]` (SA) · `PATCH /admin/series/:id/slot` (SA) · `POST /contracts/:id/void` (EDITOR).
> - 🆕 `ChapterRes`/`StoryboardRes`/`SeriesRes` thêm `message?` (mô tả hành động ở response mutation); 4 `referenceType` thông báo mới.
>
> **Cập nhật 2026-08-04:** runtime có **284 route**; `route-roles.ts` regenerate từ Reflect metadata (`PUBLIC=23`, `AUTH=18`, `ROLES=243`). Role-specific (route có `@Roles` chứa role đó): SUPER_ADMIN 79 · MANGAKA 127 · ASSISTANT 18 · EDITOR 123 · BOARD_MEMBER 80.
>
> 🔴 **2026-08-05 — CỔNG HỢP ĐỒNG chuyển lên bước MỞ CHƯƠNG + vá logic kỳ bình chọn. Route **284 → 285**;
> per-role mới: SUPER_ADMIN **80** · MANGAKA 127 · EDITOR 123 · BOARD_MEMBER 80 · ASSISTANT 18 (PUBLIC 23 / AUTH 18 / ROLES 244).**
> 1. **BREAKING — `POST /chapters` nay có thể trả `409 Error.ContractNotExecuted`.** BR-CONTRACT-05 trước đây chỉ
>    chặn ở `POST /chapters/:id/publish` ⇒ tác giả vẽ trọn chương, biên tập viên duyệt xong mới ăn lỗi. Nay chặn
>    ngay từ lúc mở chương: `SERIALIZED` cần hợp đồng **đang `FULLY_EXECUTED`**; `CANCELLING`/`COMPLETING` chỉ cần
>    **đã từng** hiệu lực. FE nên disable nút "Tạo chương" khi bộ truyện chưa có hợp đồng. Xem `03-mangaka.md`.
> 2. **Vá lỗ xuất bản không hợp đồng:** trước đây bộ truyện `CANCELLING`/`COMPLETING` **bỏ qua hẳn** kiểm hợp đồng
>    ⇒ bộ truyện CHƯA TỪNG ký vẫn xuất bản được không giới hạn (`COMPLETING` lại không có trần số chương). Nay
>    chỉ nới sang nhánh "đã từng hiệu lực", không bỏ kiểm.
> 3. 🆕 **`GET /series` thêm filter `?magazine=&publicationType=`** (additive, không breaking) — dùng để Super Admin
>    dựng đúng danh sách `eligibleSeriesIds` khi mở kỳ bình chọn. Xem `05-editor.md` #1 · `07-super-admin.md` §Survey.
> 4. **Vá đánh giá nguy cơ:** bộ truyện `CANCELLED`/`COMPLETED`/`CANCELLING`/`COMPLETING` (kết thúc **giữa kỳ**) nay
>    được loại khỏi `isAtRisk`/`riskLevel` lúc `finalize` — trước đây bộ truyện đã hoàn thành vẫn có thể bị báo
>    "nguy cơ bị huỷ" cho Hội đồng. `HIATUS` vẫn loại như cũ.
> 5. 🆕 **`GET /survey-periods/eligible-series` (SUPER_ADMIN, +1 route)** — trả đúng danh sách series được phép đưa
>    vào `eligibleSeriesIds`, dùng **chung hằng số** với validate của `POST /survey-periods` nên không bao giờ lệch.
>    Query bắt buộc `magazine` + `publicationType`.
> 6. **BR-VOTE-05 nới eligibility:** `CANCELLING`/`COMPLETING` **nay được vào kỳ bình chọn** (vẫn đang đăng chương
>    kết thúc trên tạp chí kỳ đó); trước chỉ nhận `SERIALIZED`. `HIATUS`/`CANCELLED`/`COMPLETED`/`DRAFT` vẫn chặn
>    → 422 `Error.SeriesNotVotable`. Xem `07-super-admin.md` §Survey.
>
> 🔴 **Spec 30 (2026-08-04) — TÁC GIẢ XIN RÚT / TẠM NGƯNG / KẾT THÚC SỚM + 2 THAY ĐỔI BREAKING.**
> Thêm **6 route `/series-requests`** (+6 → tổng 284): tác giả gửi yêu cầu kèm lý do, biên tập viên phụ trách duyệt hoặc từ chối.
>
> | # | Thay đổi | Ảnh hưởng FE |
> |---|---|---|
> | 1 | 🔴 **BREAKING — `POST /series/:id/withdraw` nay trả 409 ở 2 trạng thái.** `DRAFT` → 409 `Error.SeriesRequestRequired` (chưa nộp thì không có gì để rút — dùng `DELETE /series/proposals/:id`). `READY_TO_PITCH` → 409 cùng mã (hồ sơ đã sẵn sàng trình Hội đồng nên phải qua yêu cầu chính thức). `IN_REVIEW`/`REJECTED` **giữ nguyên** rút thẳng. | `03-mangaka.md` §1.3 — nút "Rút hồ sơ" phải rẽ nhánh theo `series.status` |
> | 2 | 🔴 **BREAKING — `POST /series/:id/propose-completion` siết về EDITOR-only.** MANGAKA gọi → **403**. Tác giả nay đi `POST /series-requests` với `requestType=COMPLETION`. | `03-mangaka.md` §1.4 · `05-editor.md` #15 |
> | 3 | 🆕 **6 route `/series-requests`** — `POST` (MANGAKA tạo) · `GET` list + `GET /:id` (MANGAKA/EDITOR/BOARD/SUPER_ADMIN) · `POST /:id/accept` + `/:id/reject` (EDITOR) · `POST /:id/cancel` (MANGAKA). | `03-mangaka.md` §1.4 · `05-editor.md` §1.6 |
> | 4 | 🆕 **HIATUS nay đóng băng sản xuất.** Khi series vào `HIATUS`, backend tự `hold` mọi chương chưa xuất bản (`ChapterHold.source=SERIES_HIATUS`); `resume` gỡ băng **và dời hạn nộp** đúng số ms đã tạm ngưng. Hold do biên tập viên bấm tay (`source=MANUAL`) **không bị đụng**. Trợ lý đang giữ việc dở cũng nhận thông báo. | `05-editor.md` #11/#12 · `04-assistant.md` |
> | 5 | 🆕 `Series` thêm field **`hiatusExpectedReturnDate`** (trước đây ngày quay lại bị nối vào chuỗi `statusReason`, không đọc máy được). | `03-mangaka.md` §1.3 · `05-editor.md` #11 |
>
> 🔴 **Spec 31 (2026-08-04) — HẠN NỘP & CHẶN TIỀN PHI LÝ.**
>
> | # | Thay đổi | Ảnh hưởng FE |
> |---|---|---|
> | 1 | 🔴 **Công việc quá hạn nay TỰ HUỶ.** Quá hạn + `AppConfig.taskOverdueGraceHours` (mặc định **24 giờ**) → cron chuyển `CANCELLED`, báo cả trợ lý lẫn tác giả (`TASK_AUTO_CANCELLED`). **Không** áp cho `SUBMITTED`/`UNDER_REVIEW` (đã nộp, lỗi ở khâu duyệt), `ON_HOLD` (đang chờ giao lại), việc thuộc chương đang `hold` hoặc bộ truyện `HIATUS`, và việc không có hạn nộp. | `04-assistant.md` · `03-mangaka.md` §3.5 — danh sách việc có thể tự rụng |
> | 2 | 🆕 **Cảnh báo hạn nộp phân biệt nhịp phát hành + biết tiến độ.** `referenceType` đổi thành **`DEADLINE_WARNING:{level}:{ngày}`** (`level` ∈ `YELLOW`/`RED`/`CRITICAL`). Cùng mức trong ngày chỉ báo 1 lần; leo thang YELLOW→RED sinh thông báo mới. Chapter đã đủ tiến độ → **không** cảnh báo. FE match theo **prefix `DEADLINE_WARNING`** vẫn chạy (không breaking). | `01-conventions-and-auth.md` §Notification |
> | 3 | 🆕 `TASK_DEADLINE_OVERDUE:{ngày}` — việc vừa quá hạn nhưng còn trong ân hạn (trước đây bị bỏ sót hoàn toàn). | `04-assistant.md` |
> | 4 | 🔴 **Mọi field tiền nay chặn trên + bắt số nguyên.** `valuationAmount`, `payoutAmount`, `payment.amount`, `transferAmount`: phải là **số nguyên** (VND không có hào), `> 0` hoặc `≥ 0` tuỳ field, và **≤ 100.000.000.000** (100 tỷ). `unitsSold` ≤ 1.000.000.000. Vi phạm → **422**. | `05-editor.md` §Contract · `06-board-member.md` · `07-super-admin.md` |
> | 5 | 🆕 `AppConfig` thêm **`taskOverdueGraceHours`** (int, 0–168 giờ). | `07-super-admin.md` §AppConfig |
>
> 🔴 **§87 (2026-08-01) — CONTRACT flow đổi sang 2-PHASE (BREAKING).** State machine mới: `DRAFT → BOARD_REVIEW → AWAITING_MANGAKA → FULLY_EXECUTED` (+ `ACTIVATION_PENDING` cho HĐ replacement, `REJECTED_BY_MANGAKA`). **Phase 1 nội bộ** (Editor ↔ Board): Editor `submit-review` → Board để `comments` tư vấn (không vote) → **1 Board `claim` làm đại diện** → đại diện `sign-representative` (OTP). **Phase 2** (Mangaka): chỉ `sign-mangaka` (accept, OTP) hoặc `reject` (+lý do → Editor `redraft` HĐ mới). **Đã XOÁ** 4 route cũ: `PATCH /contracts/:id/status`, `POST .../request-changes`, `.../board-approve`, `.../board-request-changes`. Thêm validate tiền (valuation>0, FULL_BUYOUT 100/0, REVENUE_SHARE ∈(0,100) tổng 100, contractEnd>start, trần ownership-aware). Chi tiết: `05-editor.md` §Contract · `06-board-member.md` §Contract · `03-mangaka.md` §Contract.
>
> 🆕 **W1 + W5 (2026-08-02) — ranking nội bộ + bảo mật metrics.** (1) **`GET /rankings/internal/aggregate`** MỚI (MANGAKA/EDITOR/BOARD/SUPER_ADMIN) — bản nội bộ của `/rankings/aggregate` public, gộp nhiều kỳ NHƯNG giữ `isAtRisk`/`riskLevel`/`isReliable`. (2) **`GET /survey-periods`** nay có filter `?magazine=&publicationType=&status=&limit=&offset=` + response ĐỔI SHAPE `{items,total,limit,offset}` (breaking) + mở thêm cho **MANGAKA**. (3) **`GET /metrics`** nay cần header `x-api-key` → thiếu/sai = 401. Tổng route **277 → 278**. Chi tiết: `03-mangaka.md` §6.3 · `06-board-member.md` §6.5 · `07-super-admin.md` §11/§14.
>
> 🔴 **§88 / Spec 29 (2026-08-02) — Messages tiếng Việt + `NotificationRes.title`.** Mọi text hiển thị (response/notification/email/validate) nay 100% tiếng Việt theo từ điển chuẩn (`AGENTS.md §7.1`); **mã lỗi `Error.*` KHÔNG đổi** → FE nhánh theo `code` không vỡ. `NotificationRes` thêm field **`title`** (suy từ `referenceType`, có ở cả notification cũ) — FE hiển thị `title` làm tiêu đề, `content` làm nội dung. Xem `01-conventions-and-auth.md` §Notification.
>
> 🆕 **Spec 27 (2026-07-29) — Flow 8 vá lỗ "ký mù + không lấy được id":** thêm **`GET /transfers/contracts/:id`** (Mangaka A/B · Editor phụ trách · Board trong roster · Super Admin) để **đọc điều khoản trước khi ký**, và thêm field **`transferContractId`** vào cả 3 route GET TransferRequest (`/mine`, `/pending-board`, `/:id`) để các bên **khám phá được id hợp đồng**. Trước đó `transferContractId` không lộ ra bất kỳ đường GET nào ⇒ chỉ Editor (người tạo) biết id, Mangaka/Board không có cách nào ký. Chi tiết: `03-mangaka.md` §5.6 · `05-editor.md` #33b/#34 · `06-board-member.md` §5.2.
>
> 🆕 **Spec 28 (2026-07-29) — Public author display name:** `GET /public/series` và `GET /public/series/:id` thêm `author: { displayName: string | null }` để Web có thể hiện bút danh Mangaka ở catalog/trang chi tiết. Đây là contract privacy tối thiểu: **không** trả id/email/tên pháp lý/số điện thoại/avatar và không fallback `displayName` sang `name`. `/vote/context` cùng toàn bộ màn vote/ranking vẫn **ẩn tác giả** để tránh thiên vị. Xem `02-guest-reader.md` §2.1–§2.2.
>
> 🔴 **Spec 28 consolidation (2026-08-01) — BREAKING:** proposal nhận/trả `storyboardPages[]` embedded và chỉ duyệt một lần; xoá 7 route `/series/:id/names/*`. Entity `Storyboard` chỉ thuộc chapter; 10 route chapter đổi sang `/chapters/:id/storyboards/:storyboardId/*`. `nameId/nameStatus/NameStatus/NameKind` đổi thành `storyboardId/storyboardStatus/StoryboardStatus` (không còn kind); notification `NAME_*` đổi `STORYBOARD_*`; AppConfig dùng `storyboardMaxReviewRounds`. Tổng route 279 → **273**.
>
> 🔴 **§84 (2026-07-29) — 3 thay đổi, 1 BREAKING. Route inventory KHÔNG đổi (vẫn 279), chỉ đổi quyền + hành vi:**
>
> | # | Thay đổi | Ảnh hưởng FE |
> |---|---|---|
> | 1 | **BREAKING — 4 route vận hành kỳ bình chọn → SUPER_ADMIN-only** (`POST /survey-periods`, `PATCH /survey-periods/:id/status`, `POST /survey-data/import`, `POST /survey-periods/:id/finalize`). Editor gọi → **403**. Lý do: `SurveyPeriod` là đơn vị theo **kỳ phát hành của cả tạp chí**, còn Editor/Tantou chỉ phụ trách vài series; `finalize` còn là xung đột lợi ích. Editor **giữ nguyên mọi quyền ĐỌC**. EDITOR: 123 → **119** route. | Gỡ màn vận hành kỳ khỏi Editor (`05-editor.md` Nhóm E) → chuyển sang Admin (`07-super-admin.md` §14) |
> | 2 | **`FORMAT_CHANGE` hết silent no-op** — thiếu `details.publicationType` nay bị chặn **422** ngay ở `POST /board/decisions` (trước: nhận 201 rồi series đứng yên, không ai biết). | `06-board-member.md` §1 — đọc `errors[].message`, không tự đoán |
> | 3 | **Chuỗi ký Transfer hết im lặng** — nay có notification ở cả 3 mốc (soạn xong → A+B; A ký → B; B ký → Board roster). | `03-mangaka.md` §5.6 · `06-board-member.md` §5.2 |

---

## Cách dùng bộ guide

1. Đọc `01-conventions-and-auth.md` **trước tiên** — response envelope, quy tắc lỗi, phân trang, upload file R2, enum dictionary đầy đủ (66 enum), FE env vars, và toàn bộ flow Auth/Tài khoản (đăng ký/đăng nhập/quên mật khẩu/đổi mật khẩu/hồ sơ `/me`) dùng chung mọi role.
2. Chọn file role bạn cần code (mỗi role 1 file, tự chứa toàn bộ flow + API + field/enum của role đó):

| File | Role | Phạm vi |
|---|---|---|
| [`02-guest-reader.md`](02-guest-reader.md) | Guest / Reader (không cần đăng nhập) | Catalog truyện, đọc chapter, bình chọn (OTP + reCAPTCHA), bảng xếp hạng công khai |
| [`03-mangaka.md`](03-mangaka.md) | MANGAKA | Toàn bộ vòng đời: tạo proposal (kèm `storyboardPages`) → Storyboard chapter → chapter/page/production stage → giao task/AI phân vùng → studio/trợ lý → hợp đồng (Phase 2 accept/reject) → deadline → transfer/reprint (phần Mangaka) → dashboard/ranking |
| [`04-assistant.md`](04-assistant.md) | ASSISTANT | Nhận lời mời cộng tác, nhận & xử lý task, hồ sơ/lịch rảnh, dashboard |
| [`05-editor.md`](05-editor.md) | EDITOR | Claim series, review proposal/Name/manuscript, đặt deadline, pitch Board, quản lý hợp đồng/reprint/transfer (phía NXB), Board session (phía tổ chức họp), publication version |
| [`06-board-member.md`](06-board-member.md) | BOARD_MEMBER | Vote quyết định (serialize/hủy/format change/reprint/transfer), duyệt hợp đồng & payment, phiên họp (WebSocket `/board`) |
| [`07-super-admin.md`](07-super-admin.md) | SUPER_ADMIN | Quản lý user (tạo Editor/Board, ban/restore), app-config, audit log, voting-config, board-config, thống kê hệ thống |

3. Mỗi route trong file role có: mô tả mục đích trong flow, bảng field request/response (bắt buộc? kiểu/enum? ghi chú), danh sách lỗi có thể gặp, và narrative happy-path + unhappy-path khi flow có nhiều bước/state machine.
4. Enum trong bảng field ghi dạng `enum X` → tra giá trị đầy đủ ở `01-conventions-and-auth.md` §7.

## Vai trò & phân quyền (tổng quan)

Hệ thống có 5 role đăng nhập (`RoleCode`: `MANGAKA`, `ASSISTANT`, `EDITOR`, `BOARD_MEMBER`, `SUPER_ADMIN`) + Guest (không cần tài khoản). Một API có thể phục vụ nhiều role cùng lúc (vd `GET /series/:id` cả Mangaka/Editor/Board/Admin đều gọi được nhưng thấy dữ liệu theo scope khác nhau) — mỗi file role mô tả API đó **theo góc nhìn hành động của role mình**, không lặp lại toàn văn ở mọi file.

## Không nằm trong scope FE Web

- Module `ai` (AI service Python riêng) — chỉ được **gọi qua** route `POST /pages/:id/segment` trong `03-mangaka.md`, không có API riêng cho FE cấu hình model.
- `GET /health/*` — hạ tầng/observability, không phải API nghiệp vụ FE.
- `GET /metrics` — Prometheus. 🆕 **W5 (2026-08-02): nay yêu cầu header `x-api-key`** (khớp `API_KEY` nội bộ); thiếu/sai key → **401** `Error.InvalidMetricsApiKey` (so sánh constant-time, không lộ key). Chỉ scraper hạ tầng gọi — FE không đụng.
