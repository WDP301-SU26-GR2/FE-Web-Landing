import { expect, it, vi } from "vitest";

const socket = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn((event, payload, acknowledge) => acknowledge({ status: "SUCCESS" })),
  disconnect: vi.fn(),
}));
const io = vi.hoisted(() => vi.fn(() => socket));

vi.mock("socket.io-client", () => ({ io }));

import { API_BASE_URL } from "../config/env";
import { subscribeToVoteTally } from "./vote-socket";

it("joins the selected public vote room and cleans up its listener", () => {
  const onTally = vi.fn();
  const onStatus = vi.fn();

  const unsubscribe = subscribeToVoteTally("period-1", onTally, onStatus);

  expect(io).toHaveBeenCalledWith(`${API_BASE_URL}/vote`);
  expect(socket.emit).toHaveBeenCalledWith(
    "joinPeriod",
    { periodId: "period-1" },
    expect.any(Function),
  );

  unsubscribe();

  expect(socket.off).toHaveBeenCalledWith("voteTally", onTally);
  expect(socket.disconnect).toHaveBeenCalledOnce();
});
