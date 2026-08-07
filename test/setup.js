import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Auto-unmount sau mỗi test để tránh leak DOM giữa các test.
afterEach(() => {
  cleanup();
});