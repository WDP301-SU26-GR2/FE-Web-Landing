import { request } from "./client";
import { toQueryString } from "./query";

export const publicApi = {
  /** GET /public/series — catalog (filter q/genre/demographic/publicationType/status/statusGroup) */
  getCatalog: (params) => request(`/public/series${toQueryString(params)}`),

  /** GET /public/series/:id — series detail + chapters */
  getSeriesDetail: (seriesId) => request(`/public/series/${seriesId}`),

  /** GET /public/chapters/:id/pages — read chapter pages */
  getChapterPages: (chapterId) => request(`/public/chapters/${chapterId}/pages`),

  /** GET /public/magazines — public danh mục tạp chí (Spec 15 §2.4) cho Landing GUEST dựng dropdown */
  getMagazines: () => request("/public/magazines"),

  /** GET /vote/periods/open — entry point of vote flow; returns array of OPEN periods */
  getOpenVotePeriods: (filters) =>
    request(`/vote/periods/open${toQueryString(filters)}`),

  /** GET /vote/context?periodId=... — required `periodId` per guide §3.1 */
  getVoteContext: (periodId) =>
    request(`/vote/context${toQueryString({ periodId })}`),

  /** GET /vote/live?periodId=... — live tally (NOT cached) */
  getVoteLive: (periodId) => request(`/vote/live${toQueryString({ periodId })}`),

  /** POST /vote/otp — ALWAYS requires captchaToken (v3) */
  sendVoteOtp: ({ identity, captchaToken }) =>
    request("/vote/otp", {
      method: "POST",
      body: JSON.stringify({ identity, captchaToken }),
    }),

  /** POST /vote — submit vote; requires captchaToken (independent of /vote/otp token) */
  submitVote: (payload) =>
    request("/vote", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** GET /vote/results/latest — REFLECTED ranking for the latest period */
  getLatestRankingResults: ({ magazine, publicationType }) =>
    request(`/vote/results/latest${toQueryString({ magazine, publicationType })}`),

  /** GET /vote/periods — list of REFLECTED periods (history dropdown) */
  getVotePeriods: ({ magazine, publicationType, limit = 12 }) =>
    request(`/vote/periods${toQueryString({ magazine, publicationType, limit })}`),

  /** GET /vote/results?surveyPeriodId=... — results of a specific period */
  getRankingResults: (surveyPeriodId) =>
    request(`/vote/results${toQueryString({ surveyPeriodId })}`),

  /** GET /rankings/aggregate — aggregated ranking by month/year */
  getAggregateRankings: (params) =>
    request(`/rankings/aggregate${toQueryString(params)}`),
};
