# §04 — ASSISTANT (Trợ lý vẽ)

> **Nguồn:** đọc trực tiếp `BE-dev/src/modules/dashboard/assistant-dashboard.*`, `BE-dev/src/modules/users/{users.controller.ts, schemas/users-schemas.ts, services/assistant-profile.service.ts}`, `BE-dev/src/modules/studio/*`, `BE-dev/src/modules/task/*` (controller/schemas/dto/errors/services), `BE-dev/src/modules/annotation/*`, `BE-dev/src/modules/revision/*`, `BE-dev/src/modules/chapter/{chapter.controller.ts, services/page.service.ts, services/chapter-page-access.service.ts}`, đối chiếu quyền route với `BE-dev/test/flows/route-roles.ts`. Ngày dựng: 2026-07-27.
> Đọc trước [`00-INDEX.md`](00-INDEX.md) (mục lục) và **bắt buộc** [`01-conventions-and-auth.md`](01-conventions-and-auth.md) (envelope, lỗi, phân trang, upload R2, enum §7, `GET/PATCH /me`) — file này KHÔNG lặp lại các quy ước đó.
> Enum ghi dạng `enum X` → tra giá trị đầy đủ ở `01-conventions-and-auth.md` §7.

---

## 0. Tổng quan phạm vi — 18 route độc quyền ASSISTANT

Đối chiếu `test/flows/route-roles.ts` (nguồn sự thật duy nhất về quyền, sinh tự động từ Reflect metadata runtime): ASSISTANT có đúng **18 route** trong `allowed[]`.

| # | Method | Path | Mục |
|---|---|---|---|
| 1 | GET | `/dashboard/assistant` | §1 Dashboard |
| 2 | GET | `/me/assistant-profile` | §2 Hồ sơ & lịch rảnh |
| 3 | PUT | `/me/assistant-profile` | §2 Hồ sơ & lịch rảnh |
| 4 | GET | `/collaboration-invites` | §3 Lời mời cộng tác |
| 5 | GET | `/collaboration-invites/:id` | §3 Lời mời cộng tác |
| 6 | POST | `/collaboration-invites/:id/accept` | §3 Lời mời cộng tác |
| 7 | POST | `/collaboration-invites/:id/decline` | §3 Lời mời cộng tác |
| 8 | GET | `/studio-assignments` | §4 Cộng tác của tôi |
| 9 | GET | `/studio-assignments/:id` | §4 Cộng tác của tôi |
| 10 | GET | `/chapters/:id/pages` | §5 Xem trang chapter |
| 11 | GET | `/tasks` | §6 Task Workspace |
| 12 | GET | `/tasks/:id` | §6 Task Workspace |
| 13 | POST | `/tasks/:id/start` | §6 Task Workspace |
| 14 | POST | `/tasks/:id/submit` | §6 Task Workspace |
| 15 | POST | `/tasks/:id/download-url` | §6 Task Workspace |
| 16 | GET | `/annotations` | §7 Annotation feedback |
| 17 | GET | `/revision-requests` | §8 Vòng yêu cầu sửa |
| 18 | PATCH | `/revision-requests/:id/resolve` | §8 Vòng yêu cầu sửa |

⚠️ **Route #10 (`GET /chapters/:id/pages`) không nằm trong danh sách 17 route được liệt kê ban đầu khi giao việc viết guide này** — bị bỏ sót trong bản brief, nhưng có thật trong `route-roles.ts` (dòng con trong khối `chapters/:id/pages`, `allowed` chứa `RoleCode.ASSISTANT`). Đây đúng là **18 route** như `00-INDEX.md`/`01-conventions-and-auth.md` §8 đã khai (bảng tổng quan ghi "ASSISTANT → 126... 18 route"). Đã bổ sung ở §5.

Ngoài 18 route độc quyền này, Assistant còn dùng các route **AUTH** dùng chung mọi role (xem `01-conventions-and-auth.md` §5.8, §3, §4): `GET/PATCH /me`, `POST /uploads/sign` + `/sign-download`, `GET /notifications` + đánh dấu đã đọc, `GET /assistant-reviews` (xem đánh giá Mangaka dành cho mình), `GET /mangakas/:userId`/`GET /staff/:userId` (xem hồ sơ công khai Mangaka/Editor liên quan).

---

## 1. Dashboard — `GET /dashboard/assistant`

Nguồn: `assistant-dashboard.controller.ts` → `AssistantDashboardFacade` → `assistant-dashboard.service.ts`.

Tổng hợp nhanh: khối lượng task theo trạng thái, số hợp tác đang hiệu lực, reputation, số thông báo chưa đọc. Không có tham số.

**Response** (payload trong `data`, không bọc `items`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `tasks.byStatus` | `Record<enum TaskStatus, number>` | Đếm task của Assistant theo từng trạng thái, **zero-filled** (mọi giá trị `TaskStatus` đều có key, kể cả 0) |
| `tasks.openTotal` | number | = `ASSIGNED + IN_PROGRESS + REVISION_REQUESTED` (việc đang cần xử lý — dùng làm badge) |
| `activeAssignments` | number | Số `StudioAssignment` đang `ACTIVE` tại thời điểm gọi (không cần `activeNow` lọc thêm) |
| `reputation.ratingAvg` | number | Điểm đánh giá trung bình từ Mangaka (0 nếu chưa có review) |
| `reputation.ratingCount` | number | Số lượt đánh giá |
| `reputation.reputationScore` | number | Điểm tổng hợp nội bộ |
| `reputation.isRecommended` | boolean | Có được gắn nhãn "đề xuất" trong danh bạ không |
| `unreadNotifications` | number | Badge chuông thông báo |

Không có bảng lỗi riêng (route không có `@ApiErrors`) — chỉ có thể gặp lỗi chung (401/403 theo `01` §1).

> **Lưu ý nghiệp vụ quan trọng (khác với Requiment gốc §2.2b):** Requiment gốc đề xuất "theo dõi thu nhập theo tháng, đơn giá theo loại task" — nhưng theo **Flow 9** (Requiment dòng 1377), hệ thống đã **deprecate PaymentConfig/EarningRecord cho Assistant**: *"Hệ thống chỉ là danh bạ tìm trợ lý. Thuê và lương là việc giữa Mangaka và Assistant, deal ngoài hệ thống — hệ thống không quản lý lương trợ lý."* Đối chiếu code: dashboard Assistant **không có field thu nhập/earnings** nào — chỉ có `tasks`, `activeAssignments`, `reputation`, `unreadNotifications`. FE **không được** tự bịa ra màn "thu nhập tháng này" vì BE không có API nào phục vụ việc đó.

---

## 2. Hồ sơ & lịch rảnh — `GET/PUT /me/assistant-profile`

Nguồn: `users.controller.ts` (`getMyAssistantProfile`/`upsertAssistantProfile`) → `users.service.ts` → `services/assistant-profile.service.ts`. Model 1:1 lazy — chưa từng PUT thì GET vẫn trả 200 với `hasProfile: false` và field rỗng/mặc định (không 404).

### `PUT /me/assistant-profile` — tạo/cập nhật hồ sơ (full upsert, không phải partial-patch)

| Field | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `specializations` | tuỳ (default `[]`) | `enum Specialization[]` | Gửi thiếu = ghi đè thành `[]` (đây là **PUT full-body**, không theo quy tắc "omit giữ nguyên" của PATCH ở `01` §2) |
| `experienceLevel` | tuỳ | string | Tự do, không enum |
| `portfolioFiles` | tuỳ (default `[]`) | string[] | Mảng object key R2 (ảnh mẫu) — xin key qua `POST /uploads/sign` trước |
| `availabilityStatus` | tuỳ | `enum AvailabilityStatus` | **Xem tác động đặc biệt bên dưới** |
| `availabilityFrom` | tuỳ | ISO datetime (có offset) | Bắt đầu khoảng rảnh khai báo |
| `availabilityTo` | tuỳ | ISO datetime (có offset) | Kết thúc khoảng rảnh khai báo |

Schema `.strict()` — gửi field lạ → 422. Vì đây là full-object upsert (không có field nào đánh dấu ⛔ read-only ở body), FE nên luôn gửi lại **toàn bộ** state hiện tại (kể cả field không đổi) để tránh vô tình xoá `specializations`/`portfolioFiles` đã có (client tự giữ state, không dựa vào "omit = giữ nguyên" như PATCH).

### `GET /me/assistant-profile` — response (dùng chung shape cho cả GET và response của PUT)

| Field | Kiểu | Ghi chú |
|---|---|---|
| `userId` | string | — |
| `specializations` | `enum Specialization[]` | |
| `experienceLevel` | string \| null | |
| `portfolioFiles` | string[] | Object key — cần `POST /uploads/sign-download` để hiển thị |
| `availabilityStatus` | `enum AvailabilityStatus` \| null | |
| `availabilityFrom` / `availabilityTo` | string (ISO) \| null | |
| `reputationScore` / `ratingAvg` / `ratingCount` / `isRecommended` | number/number/number/boolean | ⛔ read-only, do hệ thống tính (từ `assistant-reviews`) |
| `displayName` / `avatar` | string \| null | ⛔ read-only, lấy từ `User` |
| `hasProfile` | boolean | ⛔ `false` = chưa từng PUT — mọi field profile là default rỗng |

**Lỗi:** `Error.ProfileNotFound` (404) — chỉ xảy ra khi `userId` trong token không phải Assistant hợp lệ (trường hợp hiếm, gần như không FE nào gặp trong luồng bình thường).

### ⚠️ Tác động thật của `availabilityStatus = ON_LEAVE` / `UNAVAILABLE` (đã verify qua code, không suy đoán)

Đây là điểm **quan trọng nhất** của màn hồ sơ — đúng như Flow 9 mô tả *"Assistant nghỉ → ON_LEAVE/UNAVAILABLE → task IN_PROGRESS → ON_HOLD → Mangaka reassign"*, cơ chế thật (`assistant-profile.service.ts` → domain event `AssistantAvailabilityChanged` → `assistant-availability.listener.ts`):

- Khi PUT gửi `availabilityStatus` là `ON_LEAVE` **hoặc** `UNAVAILABLE` (không phải `AVAILABLE`/`BUSY`), hệ thống **tự động chuyển toàn bộ task hiện đang giao cho Assistant này sang `ON_HOLD`** — nhưng **chỉ** những task đang ở trạng thái `ASSIGNED`, `IN_PROGRESS`, hoặc `REVISION_REQUESTED` (hằng số `ON_HOLD_SOURCE_STATUSES`). Task đang `SUBMITTED`/`UNDER_REVIEW` (đã ở tay Mangaka chờ duyệt) **không bị đụng** — Mangaka vẫn review bình thường.
- Đây là side-effect **ngầm** — PUT chỉ trả về `AssistantProfileRes`, không báo "N task đã bị tạm dừng" trong response. FE nên chủ động cảnh báo người dùng trước khi họ đổi sang `ON_LEAVE`/`UNAVAILABLE` (vd toast: "Các công việc đang làm dở sẽ tạm dừng chờ Mangaka giao lại").
- Không có route nào cho Assistant tự mở lại task `ON_HOLD` — chỉ Mangaka `POST /tasks/:id/reassign` (giao lại, kể cả giao lại **cho chính Assistant đó** sau khi họ đổi lại `AVAILABLE`) mới đưa task về `ASSIGNED`.
- Đổi ngược về `AVAILABLE`/`BUSY` **không** tự động mở lại task đã `ON_HOLD` — phải chờ Mangaka reassign.

---

## 3. Lời mời cộng tác — `collaboration-invites`

Nguồn: `studio.controller.ts` + `services/collaboration-invite.service.ts`. Đúng theo Flow 9: Mangaka gửi mời (route của Mangaka, xem `03-mangaka.md`) → Assistant nhận, xem, Accept/Decline.

### `GET /collaboration-invites` — danh sách lời mời của tôi (scope = nhận)

Vì route dùng chung Mangaka/Assistant, khi caller là ASSISTANT thì scope tự động lọc `assistantId = mình` (Mangaka thấy lời mời mình gửi).

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `status` | tuỳ | `enum CollaborationInviteStatus` | Lọc theo trạng thái |
| `limit` | tuỳ | number (≤100, default 20) | |
| `offset` | tuỳ | number (default 0) | |

**Response:** `{ items: InviteListItem[], total, limit, offset }`. `InviteListItem` = `InviteRes` **bỏ field `taskTypes`** (gọn cho danh sách — muốn xem `taskTypes` phải gọi detail).

### `GET /collaboration-invites/:id` — chi tiết 1 lời mời (đầy đủ `taskTypes`)

| Field response | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | |
| `mangakaId` | string | |
| `assistantId` | string | |
| `seriesId` | string \| null | Metadata — BE **không validate** series có tồn tại/đúng sở hữu (ghi rõ trong code) |
| `hireStart` / `hireEnd` | string (ISO) \| null | Khoảng thời gian thuê |
| `taskTypes` | `enum Specialization[]` | Loại việc dự kiến giao — chỉ có ở detail, không có ở list |
| `status` | `enum CollaborationInviteStatus` | ⛔ read-only |
| `createdAt` | string | |
| `mangaka` | `{id, displayName, avatar}` \| null | Mini profile người mời |
| `assistant` | `{id, displayName, avatar}` \| null | Mini profile chính mình |
| `series` | `{id, title}` \| null | |

**Lỗi:** `Error.InviteNotFound` (404) — bao gồm cả trường hợp id hợp lệ nhưng Assistant không phải người nhận/gửi (service so `mangakaId`/`assistantId` với `userId`, không khớp → 404, **không phải 403** — tránh lộ thông tin tồn tại của invite người khác).

### `POST /collaboration-invites/:id/accept` — chấp nhận → tạo `StudioAssignment ACTIVE`

Không có body. Response: `AssignmentRes` (giống shape ở §4) — **KHÔNG** trả lại `InviteRes`.

| Lỗi | Status | Điều kiện |
|---|---|---|
| `Error.InviteNotFound` | 404 | Id sai/không phải invite gửi cho mình |
| `Error.NotInvitee` | 403 | Invite tồn tại nhưng không dành cho mình (`invite.assistantId !== userId`) |
| `Error.InviteNotPending` | 409 | Invite đã `ACCEPTED`/`DECLINED`/`EXPIRED`/`CANCELLED` |
| `Error.DuplicateActiveCollaboration` | 409 | Hai bên đã có 1 `StudioAssignment ACTIVE` khác từ trước (race condition hiếm — 2 invite cùng lúc) |

### `POST /collaboration-invites/:id/decline` — từ chối → `DECLINED`

Không có body. Response: `InviteRes` (status đã đổi `DECLINED`).

| Lỗi | Status |
|---|---|
| `Error.InviteNotFound` | 404 |
| `Error.NotInvitee` | 403 |
| `Error.InviteNotPending` | 409 |

Cả accept/decline đều bắn notification cho Mangaka (`INVITE_ACCEPTED`/`INVITE_DECLINED`, `type: SYSTEM`).

---

## 4. Cộng tác của tôi — `studio-assignments` (chỉ đọc với Assistant)

Nguồn: cùng `studio.controller.ts` + `services/studio-assignment.service.ts`. Assistant **không** có route `terminate` (chỉ Mangaka mới kết thúc sớm hợp tác — `POST /studio-assignments/:id/terminate` bị `@Roles(MANGAKA)` chặn).

### `GET /studio-assignments` — danh sách hợp tác của tôi

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `status` | tuỳ | `enum StudioAssignmentStatus` | |
| `activeNow` | tuỳ | `'true'\|'false'` | `true` = chỉ lấy assignment `status=ACTIVE` **và** thời điểm hiện tại nằm trong `[hireStart, hireEnd]`. Đây là filter **AND độc lập** với `status` — gửi cả `status=COMPLETED&activeNow=true` sẽ ra rỗng (không mâu thuẫn ngầm) |
| `limit`/`offset` | tuỳ | number | |

**Response:** `{ items: AssignmentListItem[], total, limit, offset }`. `AssignmentListItem` = `AssignmentRes` bỏ `assignedTaskTypes` + `terminatedReason`.

### `GET /studio-assignments/:id` — chi tiết

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | |
| `mangakaId` / `assistantId` | string | |
| `seriesId` | string \| null | |
| `hireStart` / `hireEnd` | string (ISO) \| null | |
| `assignedTaskTypes` | `enum Specialization[]` | Copy từ `taskTypes` của invite gốc lúc accept |
| `status` | `enum StudioAssignmentStatus` | ⛔ read-only |
| `terminatedReason` | string \| null | Lý do nếu Mangaka đã `terminate` sớm |
| `activeNow` | boolean | ⛔ tính lazy tại thời điểm response — không lưu DB |
| `createdAt` | string | |
| `mangaka` / `assistant` / `series` | mini object \| null | |

**Lỗi:** `Error.AssignmentNotFound` (404) — cả khi id sai lẫn khi assignment không thuộc về mình (`canAccess` kiểm `assistantId === userId` khi role Assistant) → 404 sạch, không 403.

**Ý nghĩa nghiệp vụ (BR-ASSIST-01/03, Flow 9):** `StudioAssignment ACTIVE` + thời điểm giao task nằm trong `hireStart..hireEnd` là điều kiện **duy nhất** để Mangaka giao task được cho Assistant (`AssistantNotHiredException` nếu không thoả — lỗi này Assistant không tự gây ra, chỉ Mangaka gặp khi tạo task). Hết `hireEnd` → assignment vẫn hiển thị `ACTIVE` trong DB nhưng `activeNow=false`; task dở đang có grace period tiếp tục theo lifecycle riêng của Task, không tự động bị huỷ khi hết hạn thuê.

---

## 5. Xem trang chapter — `GET /chapters/:id/pages` (route thứ 18, bổ sung)

Nguồn: `chapter.controller.ts` (`listPages`) → `chapter.service.ts` → `services/page.service.ts` → `services/chapter-page-access.service.ts`.

Route này KHÔNG có trong danh sách 17 route ban đầu được giao nhưng **có thật** trong `route-roles.ts` với `allowed` chứa `RoleCode.ASSISTANT`. Dùng để Assistant xem toàn bộ trang của 1 chapter (không chỉ trang có task giao riêng) — hữu ích để xem tổng thể chapter đang cộng tác.

**Điều kiện truy cập (verify trong `chapter-page-access.service.ts::assertReadAccess`):** Assistant chỉ xem được nếu có `StudioAssignment ACTIVE` với đúng Mangaka sở hữu series của chapter đó (`findActiveForPair(series.mangakaId, userId)`) — **không** yêu cầu phải có task cụ thể trên chapter, chỉ cần đang có hợp tác hiệu lực với Mangaka.

**Response:** `{ items: PageRes[] }` (không phân trang, không bọc `total/limit/offset`).

| Field (`PageRes`) | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | |
| `chapterId` | string | |
| `pageNumber` | number | |
| `originalFile` | string \| null | Object key file gốc — **không dùng trực tiếp** `POST /uploads/sign-download` (Assistant không phải uploader, dễ bị 403) — xem cơ chế tải đúng ở §6 |
| `compositeFile` | string \| null | Object key bản ghép |
| `compositeRevision` | number | |
| `canvasWidth` / `canvasHeight` | number \| null | |
| `displayFile` | string \| null | ⛔ `= compositeFile ?? originalFile` — field BE đã tính sẵn để FE khỏi tự fallback |
| `status` | `enum PageStatus` | ⛔ read-only |
| `createdAt` | string | |

**Lỗi:** `Error.ChapterNotFound` (404) · `Error.ChapterAccessDenied` (403 — không có `StudioAssignment ACTIVE` với Mangaka sở hữu).

⚠️ Field `originalFile`/`compositeFile` ở route này chỉ là **object key** để biết trang có file gì — muốn thực sự tải ảnh, Assistant vẫn phải qua `POST /tasks/:id/download-url` (§6.4) với 1 `taskId` cụ thể đang giao cho mình trên trang đó (route generic `/uploads/sign-download` sẽ trả `Error.DownloadForbidden` vì Assistant không phải uploader của Page).

---

## 6. Task Workspace — vòng đời task (phần quan trọng nhất)

Nguồn: `task.controller.ts`, `schemas/task-schemas.ts`, `errors/task.errors.ts`, `services/task-review.service.ts`, `services/task-media.service.ts`, `services/task-state.service.ts`, `task.constant.ts`, `task.mapper.ts`, `repositories/task-hydration.repository.ts`.

### 6.0. State machine thật (`TASK_TRANSITIONS`, `task.constant.ts`)

```
ASSIGNED ──start()──► IN_PROGRESS ──submit()──► SUBMITTED ──(Mangaka)──► UNDER_REVIEW
                                                                              │
                                                        ┌─────────────────────┴─────────────────────┐
                                                        ▼                                             ▼
                                                    APPROVED (terminal)                    REVISION_REQUESTED
                                                                                                       │
                                                                                          Assistant sửa & submit() lại
                                                                                          (REVISION_REQUESTED → IN_PROGRESS
                                                                                           hoặc thẳng → SUBMITTED)
```

- Mọi trạng thái không-`APPROVED`/`CANCELLED` đều có thể bị Mangaka đưa sang `ON_HOLD` (đổi availability của chính Assistant — xem §2 — hoặc lý do khác), rồi từ `ON_HOLD` chỉ có thể → `ASSIGNED` (Mangaka `reassign`) hoặc → `CANCELLED`.
- `APPROVED` và `CANCELLED` là **terminal** — Assistant không có hành động gì thêm trên task đó.
- 🔴 **Thêm một lý do bị `CANCELLED` (Spec 26, 2026-07-28):** khi Editor trả bản thảo về sửa, Mangaka phải **mở lại**
  một giai đoạn sản xuất; BE chặn mở lại nếu giai đoạn đó (hoặc bất kỳ giai đoạn nào sau nó) **còn task đang mở**.
  Nên Mangaka có thể `cancel` task của bạn để mở lại được. Lý do sẽ nằm ở `statusReason` — FE hiển thị nó thay vì
  chỉ báo "đã huỷ" trống không.
- 🔴 **Task có thể xuất hiện trở lại trên một chương tưởng đã xong.** Sau khi mở lại giai đoạn, Mangaka giao task mới
  cho đúng chương đã từng nộp cho Editor. Danh sách task của Assistant vì thế **không đơn điệu tăng theo chương mới** —
  đừng ẩn chương chỉ vì trước đó đã thấy nó ở trạng thái hoàn tất.
- **Assistant chỉ có 2 route thay đổi trạng thái: `start` (ASSIGNED→IN_PROGRESS) và `submit` (IN_PROGRESS/REVISION_REQUESTED→SUBMITTED).** Mọi transition khác (`approve`, `request-revision`, `cancel`, `reassign`, `ON_HOLD`) đều do Mangaka hoặc hệ thống (availability listener) thực hiện.
- Vi phạm state machine (vd gọi `start` khi task đã `SUBMITTED`) → `Error.InvalidTaskTransition` (409).

### 6.1. `GET /tasks` — danh sách task được giao cho tôi

Scope: khi role = ASSISTANT, backend **tự khoá** `assistantId = mình` (không cần — và không thể — truyền `assistantId` filter để xem task người khác; tham số `assistantId` trong query bị bỏ qua với role Assistant, chỉ Mangaka mới dùng được).

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `seriesId` / `chapterId` / `pageId` / `regionId` / `groupId` | tuỳ | string | Lọc thêm — với Assistant đây chỉ là bộ lọc bổ sung trên tập task đã giao cho mình, **không** phải authz (không sở hữu series vẫn lọc được, chỉ là kết quả rỗng nếu series đó Assistant không có task nào) |
| `status` | tuỳ | `enum TaskStatus` | |
| `limit`/`offset` | tuỳ | number | |

Gửi id không đúng ObjectId format ở bất kỳ filter nào → trả `{items: [], total: 0, ...}` (rỗng), **không phải lỗi**.

**Response `TaskListItemRes`** (shape gọn — SO VỚI detail thì **thiếu** `versions`, `assets`, `description`, `stageInputFile*`, `pageOriginalFile`, `statusReason`, `startedAt`, `completedAt`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id`, `pageId` | string | |
| `regionIds` | string[] | Rỗng = giao cả trang hoặc task nhóm nhiều trang |
| `assistantId` | string \| null | = chính mình |
| `taskType` | `enum Specialization` \| null | |
| `status` | `enum TaskStatus` | |
| `stageId` | string \| null | null = task legacy (chapter không dùng stage-mode) |
| `priority` | number | Chỉ để hiển thị thứ tự ưu tiên — **không phải state machine**, không khoá mở task |
| `deadline` | string (ISO) \| null | |
| `assetIds` | string[] | |
| `groupId` / `groupTitle` | string \| null | Nếu task thuộc 1 nhóm việc trải nhiều trang |
| `createdAt` | string | |
| `assistant` | mini object \| null | Chính mình |
| `regions` | `RegionRes[]` | **Có ở cả list và detail** — xem cấu trúc ở §6.2 |
| `pageDisplayFile` | string \| null | ⛔ = `compositeFile ?? originalFile` của trang — dùng để render thumbnail nhanh trong danh sách |

→ Dùng `GET /tasks` để render danh sách/Kanban theo status; **click vào 1 task phải gọi `GET /tasks/:id`** để lấy đủ `assets`/`versions`/`pageOriginalFile`/`stageInputFile` — KHÔNG có sẵn ở list.

### 6.2. `GET /tasks/:id` — chi tiết đầy đủ (dùng khi mở workspace xử lý)

**Lỗi:** `Error.TaskNotFound` (404) — dùng chung cho cả "không tồn tại" lẫn "task này không giao cho mình" (`task.assistantId !== userId` → 404, không phải 403, tránh lộ sự tồn tại của task người khác).

**Response `TaskRes`** — đầy đủ so với §6.1, cộng thêm:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `statusReason` | string \| null | Lý do lần đổi trạng thái gần nhất (vd khi bị `CANCELLED`/`reassign`/hold) |
| `description` | string \| null | Yêu cầu cụ thể Mangaka ghi khi giao task — **khoá** (không đổi được) sau khi task rời `ASSIGNED` |
| `startedAt` | string \| null | Mốc Assistant bấm "Bắt đầu" lần đầu |
| `completedAt` | string \| null | Mốc Mangaka duyệt (`APPROVED`) |
| `stageInputFile` | string \| null | **Nếu chapter dùng stage-mode**: object key input snapshot BẤT BIẾN của stage đang active — đây chính là file cần xử lý theo Requiment §2.2a bước 3 ("với stage-mode, input chính là `stageInputFile` snapshot bất biến; page original chỉ để tham khảo") |
| `stageInputSourceType` | `enum AiSegmentSource` \| null | Input snapshot lấy từ `ORIGINAL` hay `COMPOSITE` |
| `stageInputRevision` | number \| null | Revision của input snapshot (đổi khi stage trước re-run) |

> 🔴 **`stageInputFile` có thể `null` với task CŨ (Spec 26, 2026-07-28).** Khi Mangaka **mở lại** một giai đoạn để
> sửa bài theo yêu cầu Editor, bản ghi snapshot của **các giai đoạn phía sau** bị xoá (sẽ tạo lại khi giai đoạn vừa
> mở được chốt). Task đã `APPROVED` thuộc các giai đoạn đó sẽ trả `stageInputFile: null`.
> **Đây KHÔNG phải lỗi** — task đã xong, đề bài của nó không còn ý nghĩa vận hành.
> FE: ẩn ô "ảnh đề bài" + ẩn nút tải `stageInputFile` khi field này `null`, đừng hiện lỗi.
> Task **đang mở** thì luôn có `stageInputFile` (BE chặn mở lại giai đoạn khi còn task chưa đóng).
| `versions` | `TaskVersionRes[]` | Lịch sử **mọi** lần Assistant submit — xem bảng dưới |
| `assets` | `{id, filePath, name, assetType}[]` | Ảnh **reference** Mangaka đính kèm lúc giao task (resolve từ `assetIds`) — `filePath` là object key, truyền vào `POST /tasks/:id/download-url` để tải |
| `pageOriginalFile` | string \| null | Object key ảnh **GỐC** của trang (bản Mangaka giao, **legacy path** — chapter không stage-mode dùng file này làm input chính) |
| `pageDisplayFile` | string \| null | Ảnh nên hiển thị để preview nhanh (không phải file cần xử lý) |

`TaskVersionRes` (mỗi phần tử trong `versions[]`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `versionNumber` | number | 1, 2, 3... tăng dần mỗi lần Assistant `submit` |
| `submittedBy` | string \| null | userId người nộp (luôn là Assistant) |
| `submitter` | mini object \| null | Tên hiển thị người nộp |
| `file` | string \| null | Object key kết quả version này |
| `reviewStatus` | `enum TaskVersionReviewStatus` | `PENDING` (chưa Mangaka duyệt) / `APPROVED` / `REVISION_REQUESTED` — chỉ version **mới nhất** được cập nhật khi Mangaka approve/request-revision |
| `reviewerNote` | string \| null | Ghi chú Mangaka để lại khi yêu cầu sửa (= `reviewerNote` gửi ở `request-revision`) |
| `submittedAt` | string (ISO) | |

**Vùng cần xử lý (`regions[]`)** — mỗi phần tử `RegionRes`:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id`, `pageId` | string | |
| `coordinates` | `{x, y, width, height}` \| null | Pixel, top-left origin, `x,y ≥ 0`, `width,height > 0` |
| `regionType` | `enum RegionType` \| null | |
| `createdBy` | string \| null | `'MANUAL'` hoặc `'AI'` — Assistant chỉ đọc, không tạo/sửa region (route `POST/PATCH/DELETE .../regions` chỉ `@Roles(MANGAKA)`/`(MANGAKA, EDITOR)`, Assistant không có quyền) |
| `confirmedByMangaka` | boolean | |
| `confidenceScore` | number \| null | Chỉ có khi AI tạo |
| `detectedSubtype` / `aiModelVersion` | string \| null | Metadata AI |

⚠️ Nếu task là **task nhóm** (`groupId` khác null, tạo qua `POST /tasks/group` — 1 đầu việc trải nhiều trang), `regions` trả về **`[]`** vì region gắn theo từng trang riêng lẻ, không theo nhóm.

### 6.3. `POST /tasks/:id/start` — Bắt đầu xử lý (ASSIGNED → IN_PROGRESS)

Không có body. Ghi nhận `startedAt` lần đầu (không ghi đè nếu gọi lại — `setStartedAtIfUnset`).

| Lỗi | Status | Điều kiện |
|---|---|---|
| `Error.TaskNotFound` | 404 | Task không tồn tại |
| `Error.NotTaskAssignee` | 403 | `task.assistantId !== userId` |
| `Error.PageNotFound` | 404 | Trang chứa task không tồn tại (hiếm) |
| `Error.ChapterOnHold` | 409 | Chapter đang tạm dừng sản xuất (Editor hold) |
| `Error.PageNotEditable` | 409 | Trang không ở `DRAFT`/`REVISING` (đang `COMPLETED` — Editor đang final-check) |
| `Error.InvalidTaskTransition` | 409 | Task không ở `ASSIGNED` (đã start rồi, hoặc đã `ON_HOLD`/`CANCELLED`...) |

### 6.4. Tải file gốc + tài liệu tham khảo — `POST /tasks/:id/download-url`

**Đây chính là cơ chế Assistant lấy ảnh cần xử lý mà KHÔNG bị chặn bởi route sign-download chung** (đọc `task-media.service.ts`, comment gốc trong code: *"Generic `/uploads/sign-download` chỉ cho uploader HOẶC EDITOR/BOARD/ADMIN → Mangaka KHÔNG tải được file version của Assistant, Assistant KHÔNG tải được ảnh gốc trang. Đây là lỗ hổng của model cộng tác."* → route riêng này authz theo **quan hệ task**, không theo quyền sở hữu upload).

| Field body | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `key` | ✅ | string | Object key cần tải — **phải** là 1 trong các key hợp lệ của task (xem danh sách dưới), key khác → 403 |

**Các `key` hợp lệ để Assistant xin tải (allowlist thật trong code, verify từng cái):**
- `page.originalFile` — ảnh gốc trang (legacy, chapter không stage-mode)
- `page.compositeFile` — bản ghép hiện tại của trang (nếu có)
- `stageInputFile` (= `stageInputKey` của `ProductionStagePage`) — **input snapshot bất biến của stage** (dùng khi chapter chạy stage-mode — đây là file chính cần xử lý theo Requiment §2.2a)
- `task.versions[].file` — mọi file version đã từng nộp (kể cả version cũ, để so sánh)
- Mọi `filePath` trong `task.assets[]` — ảnh **reference** Mangaka đính kèm khi giao task

**Response:** `{ downloadUrl: string, expiresAt: string }` — presigned GET URL có hạn (không cache lâu, xin lại khi cần hiển thị, theo quy tắc chung ở `01` §3).

| Lỗi | Status | Điều kiện |
|---|---|---|
| `Error.TaskNotFound` | 404 | Task không tồn tại |
| `Error.TaskFileForbidden` | 403 | (a) không có quan hệ gì với task (không phải assignee/owner/editor/board/admin), hoặc (b) `key` gửi lên không nằm trong allowlist của task đó (chống spoof key sang file không liên quan) |

Route này mở cho cả `MANGAKA, ASSISTANT, EDITOR, BOARD_MEMBER, SUPER_ADMIN` — nhưng allowlist key + check quan hệ áp dụng như nhau cho mọi role gọi.

### 6.5. `POST /tasks/:id/submit` — Nộp kết quả (IN_PROGRESS/REVISION_REQUESTED → SUBMITTED)

| Field body | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `file` | ✅ | string (object key R2) | Kết quả xử lý — xin key qua `POST /uploads/sign` rồi PUT lên R2 trước (quy trình 3 bước ở `01` §3) |

Mỗi lần gọi tạo **1 `TaskVersion` mới** (`versionNumber` tự tăng: lần 1 = version 1, sửa lại sau `REVISION_REQUESTED` = version 2, 3...). Task chuyển sang `SUBMITTED`, Mangaka nhận notification `TASK_SUBMITTED` (`type: REVIEW`) rồi tự chuyển `UNDER_REVIEW` khi mở review (route `approve`/`request-revision` của Mangaka tự transition `SUBMITTED→UNDER_REVIEW→APPROVED/REVISION_REQUESTED` trong 1 lần gọi).

| Lỗi | Status | Điều kiện |
|---|---|---|
| `Error.TaskNotFound` | 404 | |
| `Error.NotTaskAssignee` | 403 | Không phải task của mình |
| `Error.PageNotFound` | 404 | |
| `Error.ChapterOnHold` | 409 | |
| `Error.PageNotEditable` | 409 | |
| `Error.InvalidTaskTransition` | 409 | Task không ở `IN_PROGRESS`/`REVISION_REQUESTED` (vd gọi submit khi còn `ASSIGNED` — phải `start` trước) |

**Response:** `TaskRes` đầy đủ (giống §6.2), `versions[]` đã có version vừa nộp ở cuối mảng với `reviewStatus: 'PENDING'`.

### 6.6. Vòng lặp Reject → sửa → nộp lại (REVISION_REQUESTED)

Đúng theo Requiment §2.2a bước 6a/7a và Flow 3: khi Mangaka gọi `POST /tasks/:id/request-revision` (route của Mangaka — xem `03-mangaka.md`), backend:
1. Transition task `SUBMITTED/UNDER_REVIEW → REVISION_REQUESTED`.
2. Ghi `reviewStatus: 'REVISION_REQUESTED'` + `reviewerNote` vào **version mới nhất** (không tạo version mới).
3. Mở 1 `RevisionRequest` mới (`targetType: TASK`, `recipientId = assistantId`, `round` tự tăng theo target) — xem chi tiết ở §8.
4. Notify Assistant `TASK_REVISION_REQUESTED` kèm nội dung `reviewerNote` + số vòng (`round`).
5. Mangaka **annotate** trực tiếp lên trang qua `POST /annotations` (route riêng của Mangaka) để chỉ rõ vị trí cần sửa — Assistant đọc annotation này qua `GET /annotations` (§7), KHÔNG nằm trong response của task.

Assistant xử lý: đọc `reviewerNote` (trong `versions[cuối].reviewerNote`) + annotation liên quan → sửa → gọi lại `POST /tasks/:id/submit` với file mới → tạo `TaskVersion` tiếp theo (version 2, 3...) → quay lại `SUBMITTED` → lặp cho đến khi Mangaka `approve`.

### 6.7. Khi bị `ON_HOLD` (đổi lịch rảnh hoặc lý do khác)

Xem cơ chế đầy đủ ở §2. Khi đang `ON_HOLD`, Assistant **không có hành động nào** trên task đó nữa (không `start`/`submit` được — muốn gọi cũng bị `InvalidTaskTransitionException` vì `ON_HOLD` không nằm trong nguồn cho phép của `start`/`submit`). Phải chờ Mangaka `POST /tasks/:id/reassign` (có thể reassign lại **cho chính mình** nếu chỉ tạm nghỉ, hoặc cho Assistant khác nếu đổi người) để task quay về `ASSIGNED`.

Nếu Mangaka reassign task này cho **Assistant khác**: task biến mất khỏi `GET /tasks` và `GET /tasks/:id` trả 404 cho Assistant cũ ngay lập tức (scope theo `assistantId` hiện tại, không giữ lịch sử truy cập cho người cũ) — Assistant cũ chỉ còn nhận được 1 notification `TASK_REASSIGNED` là dấu vết cuối cùng.

---

## 7. Đọc annotation feedback từ Mangaka — `GET /annotations`

Nguồn: `annotation.controller.ts` → `annotation.service.ts` → `services/annotation-access.service.ts` (hàm `listScope` — đây là nơi quyết định scope thật, đọc kỹ vì khác hẳn Mangaka/Editor).

Assistant **không có quyền tạo** annotation (`POST /annotations` chỉ `@Roles(MANGAKA, EDITOR)`) — chỉ đọc.

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `targetType` | ✅ | `enum AnnotationTargetType` | Route bắt buộc cả 2 field để tránh trả toàn bộ annotation hệ thống |
| `targetId` | ✅ | string | |
| `limit`/`offset` | tuỳ | number | |

**Scope thật của Assistant (`listScope`, đã verify — KHÔNG suy đoán):**
- Nếu `targetType = TASK` **và** `targetId` là task đang giao cho chính mình (`task.assistantId === userId`) → xem **toàn bộ** annotation gắn trực tiếp vào task đó.
- Nếu `targetType = PAGE` hoặc `REGION` → hệ thống tìm các `taskId` mà Assistant **đang được giao** trên đúng `targetId` (trang/vùng) đó (`findAssignedTaskIdsForTarget`), rồi **chỉ trả annotation có `taskId` nằm trong danh sách đó**. Không có task nào khớp → `Error.AnnotationForbidden` (403), kể cả khi annotation trên trang đó có tồn tại (thuộc task của Assistant khác).
- `targetType = MANUSCRIPT` hoặc `NAME` → Assistant **luôn bị từ chối** (403) — 2 loại review này là giữa Mangaka/Editor, Assistant không tham gia.
- `total` trong response cũng được đếm theo cùng scope đã lọc (không lộ số lượng annotation Assistant không được xem).

**Response:** `{ items: AnnotationRes[], total, limit, offset }`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | |
| `taskId` | string \| null | Task annotation này gắn vào (nếu có) |
| `authorId` | string \| null | userId Mangaka/Editor tạo annotation |
| `authorRole` | string \| null | `RoleCode` của người tạo (tra `01` §7.1) |
| `author` | mini object \| null | Tên hiển thị người tạo |
| `targetType` | `enum AnnotationTargetType` \| null | |
| `targetId` | string \| null | |
| `annotationType` | `enum AnnotationType` \| null | `TEXT`/`HIGHLIGHT`/`DRAWING` |
| `reviewStage` | `enum ReviewStage` \| null | Giai đoạn review (`ASSISTANT`/`MANGAKA`/`EDITOR`) — cho biết annotation này thuộc vòng review nào |
| `coordinates` | object \| null | Toạ độ khoanh vùng trên trang (tự do, tuỳ `annotationType`) |
| `content` | string \| null | Nội dung ghi chú — **đây là phần Assistant cần đọc để biết sửa gì** |
| `isResolved` | boolean | |
| `resolvedAt` | string \| null | |
| `createdAt` | string | |

**Lỗi:** `Error.AnnotationForbidden` (403 — như mô tả scope trên) · `Error.AnnotationTargetNotFound` (422, path `targetId` — target không tồn tại).

⚠️ Route `DELETE /annotations/:id` và `PATCH /annotations/:id/resolve` là route `AUTH` chung (không role-gate), nhưng cả hai đều check `annotation.authorId === userId` — vì Assistant không bao giờ là author (chỉ Mangaka/Editor tạo được), nên về bản chất **Assistant gọi 2 route này luôn nhận `Error.AnnotationForbidden` (403)**. FE không cần hiện nút resolve/xoá annotation cho Assistant.

---

## 8. Xử lý vòng yêu cầu sửa — `revision-requests`

Nguồn: `revision.controller.ts` → `revision.service.ts`. Đây là cơ chế theo dõi **"đã sửa xong vòng nào chưa"** tách biệt với `TaskVersion.reviewStatus` — mỗi lần Mangaka `request-revision` mở 1 `RevisionRequest` mới (`round` tăng dần theo target), Assistant là **recipient** khi `targetType = TASK`.

### `GET /revision-requests` — danh sách vòng sửa liên quan đến tôi

| Query | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `targetType` | tuỳ | `enum RevisionTargetType` | Lọc thêm (Assistant chỉ thấy `TASK` — `PROPOSAL`/`NAME`/`MANUSCRIPT` là của Mangaka/Editor) |
| `targetId` | tuỳ | string | vd `taskId` |
| `isResolved` | tuỳ | `'true'\|'false'` | Omit = tất cả |
| `limit`/`offset` | tuỳ | number | |

**Scope:** không privileged (Board/Admin) → tự động lọc `OR: [{recipientId: mình}, {requestedBy: mình}]`. Assistant chỉ có thể là `recipientId` (không bao giờ là `requestedBy` vì chỉ Mangaka gọi `request-revision`) — nên thực tế Assistant chỉ thấy các vòng sửa **mình phải xử lý**.

**Response:** `{ items: RevisionRequestRes[], total, limit, offset }`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | string | |
| `targetType` | `enum RevisionTargetType` | Với Assistant luôn là `TASK` |
| `targetId` | string | = `taskId` |
| `seriesId` | string \| null | ⛔ luôn `null` với `targetType=TASK` |
| `round` | number | Lần yêu cầu sửa thứ mấy trên task này (1, 2, 3...) — **đối chiếu** với `versionNumber` để biết version nào ứng với vòng nào |
| `reason` | string | Nội dung Mangaka ghi khi yêu cầu sửa (= `reviewerNote` gửi ở `request-revision`) — **PHẢI đọc trước khi resolve** |
| `requestedBy` | string | userId Mangaka |
| `recipientId` | string | ⛔ = chính mình — chỉ người này resolve được |
| `isResolved` | boolean | |
| `resolvedAt` | string \| null | |
| `resolvedBy` | string \| null | |
| `requester` | mini object \| null | Mangaka |
| `recipient` | mini object \| null | Chính mình |
| `resolver` | mini object \| null | Người đã resolve (null nếu chưa) |
| `series` | mini object \| null | ⛔ null với TASK |

### `PATCH /revision-requests/:id/resolve` — đánh dấu đã sửa xong vòng này

Không có body. **Idempotent** — gọi lại khi đã `isResolved=true` trả về nguyên trạng, không lỗi, không tạo lại notification.

| Lỗi | Status | Điều kiện |
|---|---|---|
| `Error.RevisionRequestNotFound` | 404 | Id sai/không tồn tại |
| `Error.NotRevisionRecipient` | 403 | `recipientId !== userId` (không phải vòng sửa của mình) |

**Ý nghĩa nghiệp vụ — lưu ý quan trọng cho FE:** `resolve` route này **không** tự động submit lại task hay đổi `TaskStatus` — nó chỉ đánh dấu "tôi đã xử lý xong yêu cầu sửa này" cho mục đích theo dõi/thống kê (bắn notification `REVISION_RESOLVED` cho Mangaka). Hành động **thực sự** đưa task quay lại `SUBMITTED` để Mangaka review lại vẫn là gọi `POST /tasks/:id/submit` (§6.5) với file đã sửa. FE nên hướng dẫn Assistant: sửa xong → upload → `submit` task trước, **rồi mới** (hoặc đồng thời) `resolve` revision-request tương ứng — tránh để Assistant tưởng nhầm bấm "Đánh dấu đã sửa" là xong việc mà quên nộp lại file.

---

## Tổng kết đối chiếu Requiment gốc — điểm khác biệt đáng chú ý

- **Thu nhập Assistant**: Requiment §2.2b đề xuất dashboard thu nhập theo tháng/đơn giá task — đã bị **Flow 9 (Bổ sung) deprecate hoàn toàn** (BR-ASSIST-02: *"Hệ thống không lưu/hiển thị/tính lương Assistant"*). Không có route nào cho việc này — xem §1.
- **Reassign**: Requiment gốc đề cập trạng thái `REASSIGNED` như 1 status riêng; code thật **không có** `TaskStatus.REASSIGNED` — reassign chỉ là hành động đưa task về lại `ASSIGNED` (giữ nguyên enum `TaskStatus`, không thêm state), lịch sử người cũ chỉ còn trong `statusReason`/audit log, không có field "assistant trước đó" trong `TaskRes`.
- **Cơ chế tải file**: đây là phần dễ hiểu sai nhất nếu chỉ đọc guide cũ hoặc suy đoán theo `01` §3 (upload chung) — Assistant **KHÔNG** dùng `POST /uploads/sign-download` để tải ảnh gốc/reference của task (sẽ bị 403 vì không phải uploader), mà bắt buộc qua `POST /tasks/:id/download-url` (route riêng module task, authz theo quan hệ task) — đã trình bày kỹ ở §6.4.
- **`priority`**: Requiment gốc dòng 556 làm rõ "chỉ là thông tin ưu tiên hiển thị/điều phối, không phải state machine mở khóa task" — khớp đúng với code (`priority` chỉ là field number tự do, không tham gia `TASK_TRANSITIONS`).
