# Real Public API Data Design

## Goal

Đảm bảo toàn bộ Guest Reader UI dùng dữ liệu trả về từ public API theo `FE-Web-Guide`, không suy diễn từ dữ liệu trang hiện tại và không hiển thị dữ liệu nghiệp vụ giả.

## Design

- App gọi `/vote/periods/open` theo flow Guest và truyền nguyên danh sách kỳ mở xuống `RankingPanel`; panel lấy `items[].magazine`, loại trùng/rỗng và render bằng native select.
- Các endpoint vote/ranking giữ đúng contract của `FE-Web-Guide/02-guest-reader.md`: `/vote/periods/open`, `/vote/context?periodId`, `/vote/live?periodId`, `/vote/results/latest`, `/vote/periods`, `/vote/results`, `/rankings/aggregate`.
- Dữ liệu cover trong context/live chỉ được bổ sung bằng URL đã ký từ public catalog cùng series; không dùng cover key như URL.
- Hiển thị author theo `author.displayName`; khi API trả null dùng empty state trung tính, không fallback sang tên giả.
- Các placeholder hình ảnh/nội dung chỉ mô tả trạng thái thiếu dữ liệu, không chứa dữ liệu nghiệp vụ giả.

## Verification

- Unit test helper discovery magazine và query/API contract.
- `npm test`.
- `npm run build`.
- Quét `src` và bundle build để xác nhận không còn mock/fake/demo data runtime.
