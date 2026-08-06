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

  it("loads the public magazine catalog without query parameters", async () => {
    const fetch = stubSuccess({
      items: [{ name: "Jump", publicationTypes: ["WEEKLY"] }],
    });

    const result = await publicApi.getMagazines();

    expect(result).toEqual({
      items: [{ name: "Jump", publicationTypes: ["WEEKLY"] }],
    });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      expect.stringMatching(/\/public\/magazines$/),
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

  it("uses status filter per active status type for the active catalog", async () => {
    const fetch = stubSuccess({ items: [] });

    await Promise.all(
      ["SERIALIZED", "COMPLETING", "CANCELLING"].map((status) =>
        publicApi.getCatalog({ status, limit: 8, offset: 0 }),
      ),
    );

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      expect.stringMatching(/\/public\/series\?status=SERIALIZED&limit=8&offset=0$/),
      expect.stringMatching(/\/public\/series\?status=COMPLETING&limit=8&offset=0$/),
      expect.stringMatching(/\/public\/series\?status=CANCELLING&limit=8&offset=0$/),
    ]);
  });

  it("sends the strict public OTP and ballot bodies", async () => {
    const fetch = stubSuccess({});
    const ballot = {
      surveyPeriodId: "period-1",
      identity: "reader@example.com",
      otpCode: "123456",
      seriesIds: ["series-1", "series-2"],
      captchaToken: "fresh-captcha-token",
    };

    await publicApi.sendVoteOtp({
      identity: ballot.identity,
      captchaToken: ballot.captchaToken,
    });
    await publicApi.submitVote(ballot);

    expect(fetch.mock.calls[0][0]).toMatch(/\/vote\/otp$/);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        identity: ballot.identity,
        captchaToken: ballot.captchaToken,
      }),
    });
    expect(fetch.mock.calls[1][0]).toMatch(/\/vote$/);
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(ballot),
    });
  });
});
