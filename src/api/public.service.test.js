import { afterEach, describe, expect, it, vi } from "vitest";
import { publicApi } from "./public.service";

afterEach(() => vi.unstubAllGlobals());

function stubSuccess(data = {}) {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data }),
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("public API contracts", () => {
  it("discovers open periods and loads context/live with a period id", async () => {
    const fetch = stubSuccess({ items: [] });

    await publicApi.getOpenVotePeriods();
    await publicApi.getVoteContext("period-1");
    await publicApi.getVoteLive("period-1");

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      expect.stringMatching(/\/vote\/periods\/open$/),
      expect.stringMatching(/\/vote\/context\?periodId=period-1$/),
      expect.stringMatching(/\/vote\/live\?periodId=period-1$/),
    ]);
  });

  it("sends only documented ranking query parameters", async () => {
    const fetch = stubSuccess({ items: [] });

    await publicApi.getLatestRankingResults({
      magazine: "Kirameki",
      publicationType: "WEEKLY",
    });
    await publicApi.getVotePeriods({
      magazine: "Kirameki",
      publicationType: "WEEKLY",
      limit: 24,
    });
    await publicApi.getRankingResults("period-1");
    await publicApi.getAggregateRankings({
      magazine: "Kirameki",
      publicationType: "WEEKLY",
      level: "YEAR",
      year: 2026,
    });

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      expect.stringMatching(
        /\/vote\/results\/latest\?magazine=Kirameki&publicationType=WEEKLY$/,
      ),
      expect.stringMatching(
        /\/vote\/periods\?magazine=Kirameki&publicationType=WEEKLY&limit=24$/,
      ),
      expect.stringMatching(/\/vote\/results\?surveyPeriodId=period-1$/),
      expect.stringMatching(
        /\/rankings\/aggregate\?magazine=Kirameki&publicationType=WEEKLY&level=YEAR&year=2026$/,
      ),
    ]);
  });
});
