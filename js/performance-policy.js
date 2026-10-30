// =========================================================
// performance-policy.js — Chính sách tối ưu hiệu năng đa nền tảng
//   • Máy yếu nếu chọn setting Cao (quality) sẽ tự động giới hạn ở mức Trung bình (balanced)
//     để tránh hiện tượng giật khung xương hoặc thiếu ổn định khi phân tích.
//   • Khi dùng setting Yếu/Tiết kiệm (eco), vẫn giữ kích thước tư thế đủ chuẩn (poseDim >= 160)
//     để chất lượng phân tích mạnh, đạt ≥ 10 phân tích/s và ≥ 14 FPS hiển thị.
// =========================================================

export function poseWorkload(base, level) {
  const scale = [1, 0.88, 0.78, 0.7][Math.max(0, Math.min(3, level))];
  // Giữ kích thước tối thiểu 160px để khung xương (đặc biệt cổ, vai, cổ tay) luôn sắc nét
  const poseDim = Math.max(160, Math.round((base.poseDim * scale) / 32) * 32);
  const inputWidth = Math.max(320, Math.min(base.inputWidth, Math.round(poseDim * 2.1)));
  return { poseDim, inputWidth };
}

export function automaticProfile(hardware, batteryLow) {
  if (batteryLow || hardware.tier === 'low') return 'eco';
  if (hardware.mobile) return hardware.tier === 'high' ? 'balanced' : 'eco';
  return hardware.tier === 'high' ? 'quality' : 'balanced';
}

/**
 * Giới hạn cấu hình theo phần cứng:
 * Máy yếu (tier === 'low') nếu chọn 'quality' (Cao) sẽ được giới hạn ở 'balanced' (Trung bình)
 * nhằm giữ ổn định khung xương và chất lượng phân tích.
 */
export function resolveProfileForHardware(requestedProfile, hardware, batteryLow) {
  if (!requestedProfile || requestedProfile === 'auto') {
    return automaticProfile(hardware, batteryLow);
  }
  if (hardware?.ready && hardware.tier === 'low' && requestedProfile === 'quality') {
    return 'balanced';
  }
  return requestedProfile;
}
