/**
 * Aggregator cho catalog series — tách riêng để test và reuse được.
 *
 * Lưu ý: getActiveCatalog dùng statusGroup=ACTIVE (1 request) thay vì gọi
 * 3 API song song (SERIALIZED + COMPLETING + CANCELLING), tránh trip rate-limit.
 * Spec 02 §2.1: "statusGroup: Gom series vẫn đang phát hành: SERIALIZED +
 * COMPLETING + CANCELLING. Không gửi đồng thời với status."
 */
import { publicApi } from "./public.service";

export async function getActiveCatalog(filters = {}, page = 0) {
  const SERIES_PER_PAGE = 8;
  return publicApi.getCatalog({
    ...filters,
    statusGroup: "ACTIVE",
    limit: SERIES_PER_PAGE,
    offset: page * SERIES_PER_PAGE,
  });
}
