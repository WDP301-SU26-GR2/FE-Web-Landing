import { useCallback, useEffect, useState } from "react";
import { publicApi } from "../api/public.service";
import { getActiveCatalog } from "../api/catalog-aggregator";

const SERIES_PER_PAGE = 8;

/**
 * Hook quản lý catalog series với debounced filter + pagination.
 * Tách khỏi App để có thể test độc lập và reuse ở page khác.
 */
export function useCatalog({ query, genre, demographic, publicationType, tab, page, revision }) {
  const [series, setSeries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const filters = { q: query, genre, demographic, publicationType };
        const data =
          tab === "ACTIVE"
            ? await getActiveCatalog(filters, page)
            : await publicApi.getCatalog({
                ...filters,
                limit: SERIES_PER_PAGE,
                offset: page * SERIES_PER_PAGE,
                status: tab,
              });
        if (!active) return;
        setSeries(data.items || []);
        setTotal(data.total || 0);
        setError("");
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [query, genre, demographic, publicationType, tab, page, revision]);

  const retry = useCallback(() => {
    // Trigger retry bằng cách toggle revision state từ parent.
    // Parent sẽ gọi setCatalogRevision(prev => prev + 1).
    setError("");
  }, []);

  return { series, total, loading, error, retry, perPage: SERIES_PER_PAGE };
}
