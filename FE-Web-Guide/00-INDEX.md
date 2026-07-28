# FE Web Guide — Manga Creation Workflow System

> **Đối tượng đọc:** dev FE web (React/Next/Vue...). Mỗi role có 1 file riêng — chỉ đọc file role bạn đang code, cộng với file `01-conventions-and-auth.md` (đọc 1 lần, dùng chung mọi role).
> **Nguồn dữ liệu:** đọc trực tiếp từ `BE-dev/src/modules/*` (controller/schema/dto/errors/messages), `BE-dev/prisma/schema.prisma`, `BE-dev/test/flows/route-roles.ts` (mapping route↔role sinh tự động từ Reflect metadata runtime — nguồn sự thật duy nhất về quyền), và `Docs/Requiment-SRS/Requiment.md` (nghiệp vụ gốc, các Flow 1–13).
> ⚠️ **Bộ guide này THAY THẾ hoàn toàn** `FE-API-Guide-v3.md` và `FE-Mobile-RN-Guide.md` (bản cũ, dựng theo flow — do code/nghiệp vụ đã đổi nhiều đợt sau đó nên 2 file cũ có thể sai lệch; đừng dùng lại làm nguồn).
> **Ngày dựng:** 2026-07-27. Baseline BE lúc dựng: **277 route** (cập nhật 2026-07-28: **278 route** sau Spec 26 — stage reopen; xem §2.7.1 `03-mangaka.md`) (`pnpm build`/`tsc` 0 lỗi, unit 2234/274 suite, flowtest 16/16 — xem `Docs/Epic-UserStory/PROGRESS-BE-A.md` §82 nếu cần biết trạng thái BE tại thời điểm này).

---

## Cách dùng bộ guide

1. Đọc `01-conventions-and-auth.md` **trước tiên** — response envelope, quy tắc lỗi, phân trang, upload file R2, enum dictionary đầy đủ (66 enum), FE env vars, và toàn bộ flow Auth/Tài khoản (đăng ký/đăng nhập/quên mật khẩu/đổi mật khẩu/hồ sơ `/me`) dùng chung mọi role.
2. Chọn file role bạn cần code (mỗi role 1 file, tự chứa toàn bộ flow + API + field/enum của role đó):

| File | Role | Phạm vi |
|---|---|---|
| [`02-guest-reader.md`](02-guest-reader.md) | Guest / Reader (không cần đăng nhập) | Catalog truyện, đọc chapter, bình chọn (OTP + reCAPTCHA), bảng xếp hạng công khai |
| [`03-mangaka.md`](03-mangaka.md) | MANGAKA | Toàn bộ vòng đời: tạo proposal → Name → chapter/page/production stage → giao task/AI phân vùng → studio/trợ lý → hợp đồng/thanh toán → deadline → transfer/reprint (phần Mangaka) → dashboard/ranking |
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
- `GET /health/*`, `GET /metrics` — dùng cho hạ tầng/observability (Prometheus), không phải API nghiệp vụ FE.
