import { request } from "./client";
import { toQueryString } from "./query";

export const publicApi = {
  getCatalog: (params) => request(`/public/series${toQueryString(params)}`),
  getSeriesDetail: (seriesId) => request(`/public/series/${seriesId}`),
  getChapterPages: (chapterId) => request(`/public/chapters/${chapterId}/pages`),

  getOpenVotePeriods: (filters) =>
    request(`/vote/periods/open${toQueryString(filters)}`),
  getVoteContext: (periodId) =>
    request(`/vote/context${toQueryString({ periodId })}`),
  getVoteLive: (periodId) => request(`/vote/live${toQueryString({ periodId })}`),
  sendVoteOtp: ({ identity, captchaToken }) =>
    request("/vote/otp", {
      method: "POST",
      body: JSON.stringify({ identity, captchaToken }),
    }),
  submitVote: (payload) =>
    request("/vote", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getLatestRankingResults: ({ magazine, publicationType }) =>
    request(`/vote/results/latest${toQueryString({ magazine, publicationType })}`),
  getVotePeriods: ({ magazine, publicationType, limit = 12 }) =>
    request(`/vote/periods${toQueryString({ magazine, publicationType, limit })}`),
  getRankingResults: (surveyPeriodId) =>
    request(`/vote/results${toQueryString({ surveyPeriodId })}`),
  getAggregateRankings: (params) =>
    request(`/rankings/aggregate${toQueryString(params)}`),
};
