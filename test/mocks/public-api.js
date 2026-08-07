import { vi } from "vitest";

/**
 * Factory tạo mock publicApi với các method mặc định (resolved/rejected tuỳ).
 * Dùng trong tests để giảm boilerplate vi.mock() ở mỗi test file.
 *
 * @param {Partial<Record<keyof import("../api/public.service").PublicApi, unknown>>} overrides
 * @returns {Record<string, ReturnType<typeof vi.fn>>}
 */
export function createPublicApiMock(overrides = {}) {
  const mock = {
    getCatalog: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 }),
    getSeriesDetail: vi.fn().mockResolvedValue({ id: "s-1", title: "Test Series", chapters: [] }),
    getChapterPages: vi.fn().mockResolvedValue({ series: {}, chapter: {}, pages: [], prevChapterId: null, nextChapterId: null }),
    getMagazines: vi.fn().mockResolvedValue({ items: [] }),
    getOpenVotePeriods: vi.fn().mockResolvedValue({ items: [] }),
    getVoteContext: vi.fn().mockResolvedValue({ period: {}, series: [], maxSeriesPerVote: 3 }),
    getVoteLive: vi.fn().mockResolvedValue({ periodId: "", tally: [], totalVotes: 0 }),
    sendVoteOtp: vi.fn().mockResolvedValue({ message: "OTP sent" }),
    submitVote: vi.fn().mockResolvedValue({ message: "Vote recorded" }),
    getLatestRankingResults: vi.fn().mockResolvedValue({ period: null, results: [] }),
    getVotePeriods: vi.fn().mockResolvedValue({ items: [] }),
    getRankingResults: vi.fn().mockResolvedValue({ results: [] }),
    getAggregateRankings: vi.fn().mockResolvedValue({ items: [], reflectedIssueCount: 0 }),
  };

  return Object.assign(mock, overrides);
}
