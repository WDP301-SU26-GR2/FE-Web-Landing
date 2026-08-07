import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VotePanel } from "./VotePanel";

// Mock tất cả dependency bên ngoài (API, socket, reCAPTCHA, env).
vi.mock("../api/public.service", () => ({
  publicApi: {
    getOpenVotePeriods: vi.fn(),
    getVoteContext: vi.fn(),
    getVoteLive: vi.fn(),
    sendVoteOtp: vi.fn(),
    submitVote: vi.fn(),
    getCatalog: vi.fn(),
  },
}));

vi.mock("../config/env", () => ({
  IS_RECAPTCHA_CONFIGURED: true,
}));

vi.mock("../lib/recaptcha", () => ({
  getRecaptchaToken: vi.fn().mockResolvedValue("mock-captcha-token"),
}));

vi.mock("../lib/vote-socket", () => ({
  subscribeToVoteTally: vi.fn().mockReturnValue(() => {}),
}));

import { publicApi } from "../api/public.service";
import { getRecaptchaToken } from "../lib/recaptcha";

afterEach(() => {
  vi.clearAllMocks();
});

describe("VotePanel", () => {
  const openPeriods = [
    {
      id: "p-weekly",
      magazine: "Jump",
      publicationType: "WEEKLY",
      issueNumber: 7,
    },
  ];

  const voteContext = {
    period: { id: "p-weekly", magazine: "Jump", publicationType: "WEEKLY" },
    series: [
      { id: "s-1", title: "Hero Story", genres: ["ACTION"] },
      { id: "s-2", title: "Slice of Cake", genres: ["SLICE_OF_LIFE"] },
      { id: "s-3", title: "Mystery Tales", genres: ["MYSTERY"] },
    ],
    maxSeriesPerVote: 3,
  };

  it("shows tabs for each open period", async () => {
    publicApi.getOpenVotePeriods.mockResolvedValue({ items: openPeriods });

    render(<VotePanel />);

    // Tab được render là <button aria-pressed> trong tablist.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Jump · Hàng tuần · Kỳ #7/ }),
      ).toBeInTheDocument();
    });
  });

  it("shows empty state when no open periods", async () => {
    publicApi.getOpenVotePeriods.mockResolvedValue({ items: [] });

    render(<VotePanel />);

    expect(await screen.findByText(/Chưa có kỳ bình chọn/i)).toBeInTheDocument();
  });

  it("limits series selection to maxSeriesPerVote from context", async () => {
    publicApi.getOpenVotePeriods.mockResolvedValue({ items: openPeriods });
    publicApi.getVoteContext.mockResolvedValue(voteContext);
    publicApi.getVoteLive.mockResolvedValue({
      periodId: "p-weekly",
      tally: [],
      totalVotes: 0,
    });
    publicApi.getCatalog.mockResolvedValue({ items: [] });

    const user = userEvent.setup();
    render(<VotePanel />);

    // Đợi context load xong → có 3 series buttons.
    await waitFor(() => {
      expect(screen.getByText("Hero Story")).toBeInTheDocument();
    });

    // Click button.vote-select đầu tiên bằng cách tìm theo text.
    // Mantra: click on element containing title → React propagates lên button cha.
    // Nếu không, dùng parent button bằng cách getByRole + filter.
    const selectAllButtons = () =>
      screen.getAllByRole("button").filter((b) =>
        b.classList.contains("vote-select"),
      );

    await waitFor(() => {
      expect(selectAllButtons()).toHaveLength(3);
    });

    await user.click(selectAllButtons()[0]);
    await waitFor(() => {
      // Sau click: button đầu có aria-pressed=true
      expect(selectAllButtons().filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    });

    await user.click(selectAllButtons()[1]);
    await waitFor(() => {
      expect(selectAllButtons().filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(2);
    });

    await user.click(selectAllButtons()[2]);
    await waitFor(() => {
      expect(selectAllButtons().filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(3);
    });
  });

  it("validates email format before sending OTP", async () => {
    publicApi.getOpenVotePeriods.mockResolvedValue({ items: openPeriods });
    publicApi.getVoteContext.mockResolvedValue(voteContext);
    publicApi.getVoteLive.mockResolvedValue({ tally: [], totalVotes: 0 });
    publicApi.getCatalog.mockResolvedValue({ items: [] });

    const user = userEvent.setup();
    render(<VotePanel />);

    await waitFor(() => {
      expect(screen.getByText("Hero Story")).toBeInTheDocument();
    });

    // Chọn 1 series.
    await user.click(screen.getByRole("button", { name: /Hero Story/i }));

    // Nhập email sai format.
    const emailInput = screen.getByPlaceholderText(/Email của bạn/i);
    await user.type(emailInput, "not-an-email");

    // Bấm "Nhận mã OTP".
    const otpButton = screen.getByRole("button", { name: /Nhận mã OTP/i });
    await user.click(otpButton);

    // Phải hiện thông báo lỗi validation, KHÔNG gọi sendVoteOtp.
    expect(await screen.findByText(/Vui lòng nhập địa chỉ email hợp lệ/i)).toBeInTheDocument();
    expect(publicApi.sendVoteOtp).not.toHaveBeenCalled();
  });

  it("sends OTP and then submits ballot with captcha", async () => {
    publicApi.getOpenVotePeriods.mockResolvedValue({ items: openPeriods });
    publicApi.getVoteContext.mockResolvedValue(voteContext);
    publicApi.getVoteLive.mockResolvedValue({ tally: [], totalVotes: 0 });
    publicApi.getCatalog.mockResolvedValue({ items: [] });
    publicApi.sendVoteOtp.mockResolvedValue({ message: "OTP sent" });
    publicApi.submitVote.mockResolvedValue({ message: "Vote recorded" });

    const user = userEvent.setup();
    render(<VotePanel />);

    await waitFor(() => {
      expect(screen.getByText("Hero Story")).toBeInTheDocument();
    });

    // Chọn 2 series.
    await user.click(screen.getByRole("button", { name: /Hero Story/i }));
    await user.click(screen.getByRole("button", { name: /Slice of Cake/i }));

    // Nhập email hợp lệ.
    const emailInput = screen.getByPlaceholderText(/Email của bạn/i);
    await user.type(emailInput, "reader@example.com");

    // Bấm "Nhận mã OTP" → gọi sendVoteOtp với captcha.
    await user.click(screen.getByRole("button", { name: /Nhận mã OTP/i }));

    await waitFor(() => {
      expect(publicApi.sendVoteOtp).toHaveBeenCalledWith({
        identity: "reader@example.com",
        captchaToken: "mock-captcha-token",
      });
    });
    expect(getRecaptchaToken).toHaveBeenCalledWith("vote_otp");

    // Nhập OTP + bấm "Gửi lá phiếu".
    const otpInput = screen.getByPlaceholderText(/Mã OTP/i);
    await user.type(otpInput, "123456");
    await user.click(screen.getByRole("button", { name: /Gửi lá phiếu/i }));

    await waitFor(() => {
      expect(publicApi.submitVote).toHaveBeenCalledWith({
        surveyPeriodId: "p-weekly",
        identity: "reader@example.com",
        otpCode: "123456",
        seriesIds: ["s-1", "s-2"],
        captchaToken: "mock-captcha-token",
      });
    });
    expect(getRecaptchaToken).toHaveBeenCalledWith("vote_submit");
  });

  it("shows error notice when OTP submission fails", async () => {
    publicApi.getOpenVotePeriods.mockResolvedValue({ items: openPeriods });
    publicApi.getVoteContext.mockResolvedValue(voteContext);
    publicApi.getVoteLive.mockResolvedValue({ tally: [], totalVotes: 0 });
    publicApi.getCatalog.mockResolvedValue({ items: [] });
    publicApi.sendVoteOtp.mockRejectedValue({
      message: "Error.VoteOtpRateLimit",
      code: "AUTH_OTP_RATE_LIMITED",
      retryAfter: 60,
    });

    const user = userEvent.setup();
    render(<VotePanel />);

    await waitFor(() => {
      expect(screen.getByText("Hero Story")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Hero Story/i }));

    const emailInput = screen.getByPlaceholderText(/Email của bạn/i);
    await user.type(emailInput, "reader@example.com");

    await user.click(screen.getByRole("button", { name: /Nhận mã OTP/i }));

    expect(await screen.findByText(/Error.VoteOtpRateLimit/i)).toBeInTheDocument();
  });
});