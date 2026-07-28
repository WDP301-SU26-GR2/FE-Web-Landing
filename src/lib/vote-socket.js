import { io } from "socket.io-client";
import { API_BASE_URL } from "../config/env";

export function subscribeToVoteTally(periodId, onTally, onStatus) {
  const socket = io(`${API_BASE_URL}/vote`);

  socket.on("connect_error", () => {
    onStatus(
      "Không thể kết nối cập nhật trực tiếp; đang hiển thị số liệu gần nhất.",
    );
  });
  socket.on("voteTally", onTally);
  socket.emit("joinPeriod", { periodId }, ({ status }) => {
    if (status !== "SUCCESS") {
      onStatus("Kỳ bình chọn không còn mở để cập nhật trực tiếp.");
    }
  });

  return () => {
    socket.off("voteTally", onTally);
    socket.disconnect();
  };
}
