import { request } from "./client";
import { VOTE_CAPTCHA_TOKEN } from "../config/env";

const query = (params = {}) => {
  const value = new URLSearchParams();
  Object.entries(params).forEach(([key, item]) => {
    if (item !== undefined && item !== null && item !== "") value.set(key, String(item));
  });
  const text = value.toString();
  return text ? `?${text}` : "";
};

export const publicApi = {
  getCatalog: (params) => request(`/public/series${query(params)}`),
  getSeriesDetail: (seriesId) => request(`/public/series/${seriesId}`),
  getChapterPages: (chapterId) => request(`/public/chapters/${chapterId}/pages`),

  getVoteContext: (publicationType) =>
    request(`/vote/context${query({ publicationType })}`),
  sendVoteOtp: (identity, captchaToken = VOTE_CAPTCHA_TOKEN) =>
    request("/vote/otp", {
      method: "POST",
      body: JSON.stringify({ identity, captchaToken }),
    }),
  submitVote: ({ captchaToken = VOTE_CAPTCHA_TOKEN, ...payload }) =>
    request("/vote", {
      method: "POST",
      body: JSON.stringify({ ...payload, captchaToken }),
    }),

  getLatestRankingResults: (publicationType) =>
    request(`/vote/results/latest${query({ publicationType })}`),
  getVotePeriods: (limit = 50) => request(`/vote/periods${query({ limit })}`),
  getRankingResults: (surveyPeriodId, publicationType) =>
    request(`/vote/results${query({ surveyPeriodId, publicationType })}`),
};
