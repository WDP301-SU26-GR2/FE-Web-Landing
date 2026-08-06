import { describe, expect, it } from "vitest";
import {
  formatCooldown,
  formatVotePeriod,
  getMagazineOptions,
  isRankingSelectionComplete,
  listMagazineNames,
  toggleSeriesSelection,
} from "./guest-flow";

it("returns every unique magazine from open Guest vote periods", () => {
  expect(
    getMagazineOptions([
      { magazine: "Ko có" },
      { magazine: "AuraNVC" },
      { magazine: " AuraNVC " },
    ]),
  ).toEqual(["AuraNVC", "Ko có"]);
});

it("maps the public magazine catalog to sorted unique names", () => {
  expect(
    listMagazineNames([
      { name: "Jump", publicationTypes: ["WEEKLY"] },
      { name: " Monthly Mag ", publicationTypes: ["MONTHLY"] },
      { name: "Jump", publicationTypes: ["WEEKLY"] },
      { name: "", publicationTypes: ["WEEKLY"] },
      { name: null, publicationTypes: ["WEEKLY"] },
    ]),
  ).toEqual(["Jump", "Monthly Mag"]);
});

it("returns an empty list when the magazine catalog is missing or empty", () => {
  expect(listMagazineNames([])).toEqual([]);
  expect(listMagazineNames(undefined)).toEqual([]);
  expect(listMagazineNames(null)).toEqual([]);
});

describe("toggleSeriesSelection", () => {
  it("keeps the existing choices when a new choice exceeds the API limit", () => {
    expect(toggleSeriesSelection(["a", "b"], "c", 2)).toEqual(["a", "b"]);
  });

  it("adds a choice below the API limit", () => {
    expect(toggleSeriesSelection(["a"], "b", 2)).toEqual(["a", "b"]);
  });

  it("removes an already selected series", () => {
    expect(toggleSeriesSelection(["a", "b"], "a", 3)).toEqual(["b"]);
  });
});

it("formats a distinct period label for the guest selector", () => {
  expect(
    formatVotePeriod({
      magazine: "Kirameki",
      publicationType: "WEEKLY",
      issueNumber: 7,
    }),
  ).toBe("Kirameki · Hàng tuần · Kỳ #7");
});

it("formats cooldown time and requires a month only for monthly rankings", () => {
  expect(formatCooldown(61)).toBe("1:01");
  expect(
    isRankingSelectionComplete({
      magazine: "K",
      publicationType: "WEEKLY",
      level: "MONTH",
      year: 2026,
      month: "",
    }),
  ).toBe(false);
  expect(
    isRankingSelectionComplete({
      magazine: "K",
      publicationType: "WEEKLY",
      level: "YEAR",
      year: 2026,
      month: "",
    }),
  ).toBe(true);
});

it("rejects ranking requests without a magazine or publication type", () => {
  expect(
    isRankingSelectionComplete({
      magazine: "",
      publicationType: "WEEKLY",
      level: "YEAR",
      year: 2026,
    }),
  ).toBe(false);
  expect(
    isRankingSelectionComplete({
      magazine: "Kirameki",
      publicationType: "",
      level: "YEAR",
      year: 2026,
    }),
  ).toBe(false);
});

it("rejects ranking dates that cannot satisfy the API schema", () => {
  expect(
    isRankingSelectionComplete({
      magazine: "Kirameki",
      publicationType: "WEEKLY",
      level: "YEAR",
      year: "not-a-year",
    }),
  ).toBe(false);
  expect(
    isRankingSelectionComplete({
      magazine: "Kirameki",
      publicationType: "WEEKLY",
      level: "MONTH",
      year: 2026,
      month: 13,
    }),
  ).toBe(false);
});
