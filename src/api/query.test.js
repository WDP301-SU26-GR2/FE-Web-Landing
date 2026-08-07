import { describe, expect, it } from "vitest";
import { toQueryString } from "./query";

describe("toQueryString", () => {
  it("returns empty string when params is empty or all skipped", () => {
    expect(toQueryString()).toBe("");
    expect(toQueryString({})).toBe("");
    expect(toQueryString({ a: undefined, b: null, c: "" })).toBe("");
  });

  it("stringifies basic values", () => {
    expect(toQueryString({ magazine: "Kirameki", publicationType: "WEEKLY" })).toBe(
      "?magazine=Kirameki&publicationType=WEEKLY",
    );
  });

  it("converts numeric params to valid numbers (drops NaN)", () => {
    expect(toQueryString({ limit: 50, offset: 100 })).toBe("?limit=50&offset=100");
    expect(toQueryString({ year: "2026", month: "08" })).toBe("?year=2026&month=8");
    expect(toQueryString({ limit: "abc", offset: "" })).toBe("");
  });

  it("preserves non-numeric fields as strings", () => {
    // URLSearchParams mã hoá khoảng trắng thành "+" (application/x-www-form-urlencoded),
    // không phải "%20" — đúng chuẩn, FE chỉ cần stringify đúng spec.
    expect(toQueryString({ q: "hello" })).toBe("?q=hello");
    expect(toQueryString({ q: "hello world" })).toBe("?q=hello+world");
  });
});