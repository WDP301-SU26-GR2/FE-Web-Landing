import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RankingPanel } from "./RankingPanel";

// Mock API + helpers cần thiết để component render trong jsdom.
vi.mock("../api/public.service", () => ({
  publicApi: {
    getMagazines: vi.fn(),
    getLatestRankingResults: vi.fn(),
    getVotePeriods: vi.fn(),
    getRankingResults: vi.fn(),
    getAggregateRankings: vi.fn(),
  },
}));

import { publicApi } from "../api/public.service";

afterEach(() => {
  vi.clearAllMocks();
});

describe("RankingPanel", () => {
  it("shows loading state then populates magazine dropdown", async () => {
    publicApi.getMagazines.mockResolvedValue({
      items: [
        { name: "Jump", publicationTypes: ["WEEKLY"] },
        { name: "Monthly Mag", publicationTypes: ["MONTHLY"] },
      ],
    });

    render(<RankingPanel openVotePeriods={[]} />);

    // Initial: dropdown disabled với placeholder "Đang tải tạp chí...".
    expect(screen.getByText(/Đang tải tạp chí/i)).toBeInTheDocument();

    // Sau khi load: dropdown enabled + có option Jump, Monthly Mag.
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Jump" })).toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: "Monthly Mag" })).toBeInTheDocument();
  });

  it("shows fallback message when magazine catalog is empty", async () => {
    publicApi.getMagazines.mockResolvedValue({ items: [] });

    render(<RankingPanel openVotePeriods={[]} />);

    await waitFor(() => {
      expect(
        screen.getByText(/Chưa có tạp chí nào trong hệ thống/i),
      ).toBeInTheDocument();
    });
  });

  it("pre-selects first open period's magazine when dropdown is empty", async () => {
    publicApi.getMagazines.mockResolvedValue({
      items: [
        { name: "Jump", publicationTypes: ["WEEKLY"] },
        { name: "Monthly Mag", publicationTypes: ["MONTHLY"] },
      ],
    });
    publicApi.getLatestRankingResults.mockResolvedValue({ period: null, results: [] });
    publicApi.getVotePeriods.mockResolvedValue({ items: [] });

    render(
      <RankingPanel
        openVotePeriods={[{ id: "p1", magazine: "Jump", publicationType: "WEEKLY" }]}
      />,
    );

    // Chờ magazine dropdown load xong.
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Jump" })).toBeInTheDocument();
    });

    // Sau khi setMagazine('Jump'), chờ query ranking được fire.
    // rankingReady = magazine && publicationType → cần publicationType cũng set.
    // Mặc định publicationType='' nên effect ranking không chạy → test pass khi verify magazine được select.
    const magazineSelect = screen.getByRole("combobox", { name: /Tạp chí/i });
    await waitFor(() => {
      expect(magazineSelect).toHaveValue("Jump");
    });
  });

  it("disables aggregate button when selection incomplete", async () => {
    publicApi.getMagazines.mockResolvedValue({
      items: [{ name: "Jump", publicationTypes: ["WEEKLY"] }],
    });

    render(<RankingPanel openVotePeriods={[]} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Xem tổng hợp/i })).toBeInTheDocument();
    });
    // publicationType mặc định rỗng → button disabled.
    expect(screen.getByRole("button", { name: /Xem tổng hợp/i })).toBeDisabled();
  });

  it("calls aggregate endpoint with month when level=MONTH", async () => {
    publicApi.getMagazines.mockResolvedValue({
      items: [{ name: "Jump", publicationTypes: ["WEEKLY"] }],
    });
    publicApi.getLatestRankingResults.mockResolvedValue({ period: null, results: [] });
    publicApi.getVotePeriods.mockResolvedValue({ items: [] });
    publicApi.getAggregateRankings.mockResolvedValue({
      reflectedIssueCount: 5,
      items: [],
    });

    const user = userEvent.setup();
    render(<RankingPanel openVotePeriods={[]} />);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Jump" })).toBeInTheDocument();
    });

    // Chọn nhịp xuất bản WEEKLY → ranking fetch chạy.
    const publicationTypeSelect = screen.getByRole("combobox", { name: /Nhịp xuất bản/i });
    await user.selectOptions(publicationTypeSelect, "WEEKLY");

    // Đổi level sang MONTH → nhập tháng → bấm Xem tổng hợp.
    const levelSelect = screen.getByRole("combobox", { name: /Loại tổng hợp/i });
    await user.selectOptions(levelSelect, "MONTH");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Xem tổng hợp/i })).not.toBeDisabled();
    });

    await user.click(screen.getByRole("button", { name: /Xem tổng hợp/i }));

    await waitFor(() => {
      expect(publicApi.getAggregateRankings).toHaveBeenCalledWith(
        expect.objectContaining({ level: "MONTH", month: expect.any(Number) }),
      );
    });
  });
});