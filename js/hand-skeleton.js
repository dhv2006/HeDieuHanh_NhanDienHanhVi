// =========================================================
// hand-skeleton.js — Khung xương Bàn tay (21 khớp × 2 tay),
// Khung xương Đầu-Cổ, và Chấm điểm Độ chính xác Động tác
// =========================================================
import { KP, HAND_SKELETON } from './config.js';
import { clamp, dist, midpoint, jointAngle, angleFromVertical, round } from './utils.js';

export { HAND_SKELETON };

/**
 * Tái tạo khung xương đầu & cổ (thay thế hoàn toàn nhận diện khuôn mặt/biểu cảm).
 * Giữ lại cấu trúc xương đầu-cổ để phân tích các động tác xoay đầu, cúi/ngửa đầu, nghiêng đầu.
 */
export function computeHeadSkeleton(kp, minScore = 0.25) {
  if (!kp || kp.length < 7) return null;
  const ok = (i) => kp[i] && kp[i].score >= minScore && Number.isFinite(kp[i].x) && Number.isFinite(kp[i].y);
  const lSh = ok(KP.lShoulder) ? kp[KP.lShoulder] : null;
  const rSh = ok(KP.rShoulder) ? kp[KP.rShoulder] : null;
  const neck = lSh && rSh ? midpoint(lSh, rSh) : (lSh || rSh);
  const nose = ok(KP.nose) ? kp[KP.nose] : null;
  const lEye = ok(KP.lEye) ? kp[KP.lEye] : null;
  const rEye = ok(KP.rEye) ? kp[KP.rEye] : null;
  const lEar = ok(KP.lEar) ? kp[KP.lEar] : null;
  const rEar = ok(KP.rEar) ? kp[KP.rEar] : null;

  const headAnchor = nose || (lEye && rEye ? midpoint(lEye, rEye) : (lEar && rEar ? midpoint(lEar, rEar) : null));
  if (!headAnchor || !neck) return null;

  const shWidth = lSh && rSh ? dist(lSh, rSh) : 60;
  const headRadius = Math.max(12, shWidth * 0.34);

  // Vector từ cổ lên đầu
  const vx = headAnchor.x - neck.x;
  const vy = headAnchor.y - neck.y;
  const vLen = Math.hypot(vx, vy) || 1;
  const ux = vx / vLen;
  const uy = vy / vLen;

  // Đỉnh đầu (crown) và cằm (chin)
  const crown = {
    x: headAnchor.x + ux * headRadius * 0.85,
    y: headAnchor.y + uy * headRadius * 0.85,
    score: headAnchor.score || 0.8,
  };
  const chin = {
    x: neck.x + ux * (vLen * 0.55),
    y: neck.y + uy * (vLen * 0.55),
    score: headAnchor.score || 0.8,
  };

  // Góc nghiêng đầu (Roll), góc xoay trái/phải (Yaw), góc cúi/ngửa (Pitch)
  let rollDeg = 0;
  if (lEye && rEye) {
    rollDeg = Math.round((Math.atan2(rEye.y - lEye.y, lEye.x - rEye.x) * 180) / Math.PI);
  } else if (lEar && rEar) {
    rollDeg = Math.round((Math.atan2(rEar.y - lEar.y, lEar.x - rEar.x) * 180) / Math.PI);
  }

  let yawDeg = 0;
  if (nose && lEar && rEar) {
    const earMidX = (lEar.x + rEar.x) / 2;
    const earSpan = Math.max(8, Math.abs(lEar.x - rEar.x));
    yawDeg = Math.round(clamp(((nose.x - earMidX) / (earSpan * 0.5)) * 45, -75, 75));
  }

  let pitchDeg = 0;
  if (nose && lEar && rEar) {
    const earMidY = (lEar.y + rEar.y) / 2;
    pitchDeg = Math.round(clamp(((nose.y - earMidY) / headRadius) * 40, -60, 60));
  }

  let stateLabel = 'Đầu thẳng';
  if (pitchDeg > 16) stateLabel = `Cúi đầu (${pitchDeg}°)`;
  else if (pitchDeg < -16) stateLabel = `Ngửa đầu (${Math.abs(pitchDeg)}°)`;
  else if (Math.abs(yawDeg) > 20) stateLabel = yawDeg > 0 ? `Xoay đầu sang trái (${yawDeg}°)` : `Xoay đầu sang phải (${Math.abs(yawDeg)}°)`;
  else if (Math.abs(rollDeg) > 15) stateLabel = rollDeg > 0 ? `Nghiêng đầu trái (${rollDeg}°)` : `Nghiêng đầu phải (${Math.abs(rollDeg)}°)`;

  return {
    neck,
    chin,
    nose,
    lEye,
    rEye,
    lEar,
    rEar,
    crown,
    headRadius,
    rollDeg,
    yawDeg,
    pitchDeg,
    stateLabel,
  };
}

/**
 * Tạo khung xương bàn tay 21 khớp (chuẩn MediaPipe Hands) cho cả 2 tay.
 * Nếu có dữ liệu detector bàn tay (`rawHands`), gắn trực tiếp 21 khớp đó vào cổ tay.
 * Nếu không có hoặc ở xa, tổng hợp khung xương 21 khớp theo giải phẫu học từ vector
 * cẳng tay (Elbow -> Wrist) và trạng thái động tác tay (duỗi mở, chỉ tay, nắm, vẫy).
 */
export function computeHandsSkeleton(kp, rawHands = null, minScore = 0.25, activeLabels = []) {
  if (!kp || kp.length < 11) return { left: null, right: null };
  const ok = (i) => kp[i] && kp[i].score >= minScore && Number.isFinite(kp[i].x) && Number.isFinite(kp[i].y);

  const lSh = ok(KP.lShoulder) ? kp[KP.lShoulder] : null;
  const rSh = ok(KP.rShoulder) ? kp[KP.rShoulder] : null;
  const lHip = ok(KP.lHip) ? kp[KP.lHip] : null;
  const rHip = ok(KP.rHip) ? kp[KP.rHip] : null;

  let torso = 100;
  if (lSh && rSh && lHip && rHip) {
    torso = dist(midpoint(lSh, rSh), midpoint(lHip, rHip));
  } else if (lSh && rSh) {
    torso = dist(lSh, rSh) * 1.45;
  }
  const handScale = clamp(torso * 0.28, 16, 95);

  const labelSet = new Set(
    (activeLabels || []).map((l) => (typeof l === 'string' ? l : l.behavior || ''))
  );
  const mode = labelSet.has('ai_pointing') || labelSet.has('pointing')
    ? 'point'
    : labelSet.has('ai_fist')
      ? 'fist'
      : labelSet.has('ai_waving') || labelSet.has('waving') || labelSet.has('hand_action')
        ? 'spread'
        : 'natural';

  const buildSide = (isLeft) => {
    const wristIdx = isLeft ? KP.lWrist : KP.rWrist;
    const elbowIdx = isLeft ? KP.lElbow : KP.rElbow;
    const shIdx = isLeft ? KP.lShoulder : KP.rShoulder;
    if (!ok(wristIdx)) return null;
    const wrist = kp[wristIdx];

    // Kiểm tra nếu có rawHands từ detector khớp với cổ tay này
    if (Array.isArray(rawHands) && rawHands.length) {
      let bestHand = null;
      let bestDist = handScale * 1.8;
      for (const h of rawHands) {
        if (Array.isArray(h?.keypoints) && h.keypoints.length === 21) {
          const d = dist(h.keypoints[0], wrist);
          if (d < bestDist) {
            bestDist = d;
            bestHand = h;
          }
        }
      }
      if (bestHand) {
        const dx = wrist.x - bestHand.keypoints[0].x;
        const dy = wrist.y - bestHand.keypoints[0].y;
        return {
          side: isLeft ? 'left' : 'right',
          pose: mode,
          keypoints: bestHand.keypoints.map((p) => ({
            x: round(p.x + dx, 1),
            y: round(p.y + dy, 1),
            score: p.score ?? wrist.score ?? 0.85,
          })),
        };
      }
    }

    // Tính hướng trục bàn tay từ khuỷu tay -> cổ tay
    const elbow = ok(elbowIdx) ? kp[elbowIdx] : ok(shIdx) ? kp[shIdx] : { x: wrist.x, y: wrist.y - 40 };
    let dx = wrist.x - elbow.x;
    let dy = wrist.y - elbow.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    // Vector vuông góc (ngang lòng bàn tay): hướng ngón cái vào phía thân
    const sign = isLeft ? -1 : 1;
    const px = -dy * sign;
    const py = dx * sign;

    // Cấu hình góc xòe và độ duỗi của 5 ngón tay:
    // [Ngón cái, Ngón trỏ, Ngón giữa, Ngón áp út, Ngón út]
    const fingerSpecs = [
      { angle: 0.72 * sign, len: 0.68, curl: mode === 'fist' ? 0.45 : 0.92 },
      { angle: 0.28 * sign, len: 0.92, curl: mode === 'fist' ? 0.38 : 1.0 },
      { angle: 0.02 * sign, len: 1.00, curl: mode === 'point' ? 0.45 : mode === 'fist' ? 0.35 : 0.96 },
      { angle: -0.22 * sign, len: 0.90, curl: mode === 'point' ? 0.42 : mode === 'fist' ? 0.35 : 0.93 },
      { angle: -0.46 * sign, len: 0.74, curl: mode === 'point' ? 0.40 : mode === 'fist' ? 0.35 : 0.88 },
    ];

    const spreadFactor = mode === 'spread' ? 1.25 : 1.0;
    const joints = [{ x: round(wrist.x, 1), y: round(wrist.y, 1), score: round(wrist.score, 2) }];

    // Tỉ lệ 4 đốt mỗi ngón: MCP (khớp gốc), PIP, DIP, TIP (đầu ngón)
    const ratios = [0.38, 0.62, 0.82, 1.0];

    for (let f = 0; f < 5; f++) {
      const spec = fingerSpecs[f];
      const theta = spec.angle * spreadFactor;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const fx = dx * cos - dy * sin;
      const fy = dx * sin + dy * cos;

      for (let d = 0; d < 4; d++) {
        const r = ratios[d];
        // Đốt đầu tiên (MCP) luôn giữ khung lòng bàn tay, các đốt ngoài co/duỗi theo spec.curl
        const reach = d === 0 ? r * spec.len : (ratios[0] + (r - ratios[0]) * spec.curl) * spec.len;
        const lateral = f === 0 ? 0.14 * (d + 1) : (2 - f) * 0.04;
        const jx = wrist.x + (fx * reach + px * lateral) * handScale;
        const jy = wrist.y + (fy * reach + py * lateral) * handScale;
        joints.push({
          x: round(jx, 1),
          y: round(jy, 1),
          score: round(wrist.score * 0.92, 2),
        });
      }
    }

    return {
      side: isLeft ? 'left' : 'right',
      pose: mode,
      keypoints: joints,
    };
  };

  return {
    left: buildSide(true),
    right: buildSide(false),
  };
}

/**
 * Trích xuất thông số góc khớp cơ thể đầy đủ tại 1 thời điểm (phục vụ tạo nhãn mili-giây & chấm điểm)
 */
export function extractPostureAngles(kp, minScore = 0.25) {
  if (!kp || kp.length < 17) return null;
  const ok = (i) => kp[i] && kp[i].score >= minScore && Number.isFinite(kp[i].x) && Number.isFinite(kp[i].y);

  const lSh = ok(KP.lShoulder) ? kp[KP.lShoulder] : null;
  const rSh = ok(KP.rShoulder) ? kp[KP.rShoulder] : null;
  const lEl = ok(KP.lElbow) ? kp[KP.lElbow] : null;
  const rEl = ok(KP.rElbow) ? kp[KP.rElbow] : null;
  const lWr = ok(KP.lWrist) ? kp[KP.lWrist] : null;
  const rWr = ok(KP.rWrist) ? kp[KP.rWrist] : null;
  const lHip = ok(KP.lHip) ? kp[KP.lHip] : null;
  const rHip = ok(KP.rHip) ? kp[KP.rHip] : null;
  const lKnee = ok(KP.lKnee) ? kp[KP.lKnee] : null;
  const rKnee = ok(KP.rKnee) ? kp[KP.rKnee] : null;
  const lAnk = ok(KP.lAnkle) ? kp[KP.lAnkle] : null;
  const rAnk = ok(KP.rAnkle) ? kp[KP.rAnkle] : null;

  const shMid = lSh && rSh ? midpoint(lSh, rSh) : (lSh || rSh);
  const hipMid = lHip && rHip ? midpoint(lHip, rHip) : (lHip || rHip);
  const head = computeHeadSkeleton(kp, minScore);

  const angles = {
    headYaw: head ? head.yawDeg : 0,
    headPitch: head ? head.pitchDeg : 0,
    headRoll: head ? head.rollDeg : 0,
    torsoTilt: shMid && hipMid ? Math.round(angleFromVertical(shMid, hipMid)) : 0,
    lElbowAngle: lSh && lEl && lWr ? Math.round(jointAngle(lSh, lEl, lWr)) : null,
    rElbowAngle: rSh && rEl && rWr ? Math.round(jointAngle(rSh, rEl, rWr)) : null,
    lShoulderAngle: (lHip || hipMid) && lSh && lEl ? Math.round(jointAngle(lHip || hipMid, lSh, lEl)) : null,
    rShoulderAngle: (rHip || hipMid) && rSh && rEl ? Math.round(jointAngle(rHip || hipMid, rSh, rEl)) : null,
    lKneeAngle: lHip && lKnee && lAnk ? Math.round(jointAngle(lHip, lKnee, lAnk)) : null,
    rKneeAngle: rHip && rKnee && rAnk ? Math.round(jointAngle(rHip, rKnee, rAnk)) : null,
  };

  return angles;
}

/**
 * Chấm điểm độ chính xác chuyển động của người dùng so với tư thế mẫu (Chức năng 2 của Camera)
 * Trả về thang đánh giá (0-100%), điểm từng vùng cơ thể, và danh sách gợi ý sửa lỗi cụ thể.
 */
export function evaluatePoseAccuracy(userKp, targetKp, minScore = 0.25) {
  const uAng = extractPostureAngles(userKp, minScore);
  const tAng = extractPostureAngles(targetKp, 0.1);
  if (!uAng || !tAng) {
    return {
      overall: 0,
      grade: 'Chưa đủ dữ liệu khung xương',
      gradeClass: 'bad',
      parts: { head: 0, leftArm: 0, rightArm: 0, torso: 0, legs: 0 },
      errors: ['Hãy đứng trọn vào khung hình camera để hệ thống nhận diện đủ các khớp cơ thể.'],
      badJoints: [],
    };
  }

  const scoreDiff = (u, t, tolerance = 15, maxDiff = 75) => {
    if (u == null || t == null) return 82; // Không bị khuất thì cho điểm trung bình khá
    const diff = Math.abs(u - t);
    if (diff <= tolerance) return 100;
    return Math.round(clamp(100 - ((diff - tolerance) / (maxDiff - tolerance)) * 100, 10, 100));
  };

  const errors = [];
  const badJoints = [];

  // 1. Đầu & Cổ
  const headDiffYaw = Math.abs((uAng.headYaw || 0) - (tAng.headYaw || 0));
  const headDiffPitch = Math.abs((uAng.headPitch || 0) - (tAng.headPitch || 0));
  const headScore = Math.round((scoreDiff(uAng.headYaw, tAng.headYaw, 15, 60) + scoreDiff(uAng.headPitch, tAng.headPitch, 15, 55)) / 2);
  if (headDiffPitch > 18) {
    errors.push(uAng.headPitch > tAng.headPitch
      ? `Phần Đầu: Đầu đang cúi thấp hơn mẫu ${headDiffPitch}° — hãy nâng cằm và nhìn thẳng hơn.`
      : `Phần Đầu: Đầu đang ngửa cao hơn mẫu ${headDiffPitch}° — hãy hạ nhẹ cằm xuống.`);
    badJoints.push(KP.nose, KP.lEar, KP.rEar);
  } else if (headDiffYaw > 22) {
    errors.push(`Phần Đầu: Hướng xoay đầu lệch ${headDiffYaw}° — hãy ${tAng.headYaw > uAng.headYaw ? 'xoay đầu nhẹ sang trái' : 'xoay đầu nhẹ sang phải'} theo mẫu.`);
    badJoints.push(KP.nose);
  }

  // 2. Tay trái & Bàn tay trái
  const lShScore = scoreDiff(uAng.lShoulderAngle, tAng.lShoulderAngle, 16, 80);
  const lElScore = scoreDiff(uAng.lElbowAngle, tAng.lElbowAngle, 18, 85);
  const leftArmScore = Math.round(lShScore * 0.55 + lElScore * 0.45);
  if (uAng.lShoulderAngle != null && tAng.lShoulderAngle != null && Math.abs(uAng.lShoulderAngle - tAng.lShoulderAngle) > 20) {
    const diff = Math.round(tAng.lShoulderAngle - uAng.lShoulderAngle);
    errors.push(diff > 0
      ? `Tay trái: Cánh tay trái đang hạ thấp (thiếu ${diff}°) — hãy nâng cao vai/cánh tay trái lên.`
      : `Tay trái: Cánh tay trái nâng quá cao (dư ${Math.abs(diff)}°) — hãy hạ nhẹ cánh tay trái xuống.`);
    badJoints.push(KP.lShoulder, KP.lElbow, KP.lWrist);
  } else if (uAng.lElbowAngle != null && tAng.lElbowAngle != null && Math.abs(uAng.lElbowAngle - tAng.lElbowAngle) > 22) {
    const diff = Math.round(tAng.lElbowAngle - uAng.lElbowAngle);
    errors.push(diff > 0
      ? `Khuỷu & Bàn tay trái: Khuỷu tay trái đang gập nhiều (${uAng.lElbowAngle}° so với chuẩn ${tAng.lElbowAngle}°) — hãy duỗi thẳng tay trái hơn.`
      : `Khuỷu & Bàn tay trái: Tay trái đang duỗi quá thẳng — hãy gập khuỷu tay trái về khoảng ${tAng.lElbowAngle}°.`);
    badJoints.push(KP.lElbow, KP.lWrist);
  }

  // 3. Tay phải & Bàn tay phải
  const rShScore = scoreDiff(uAng.rShoulderAngle, tAng.rShoulderAngle, 16, 80);
  const rElScore = scoreDiff(uAng.rElbowAngle, tAng.rElbowAngle, 18, 85);
  const rightArmScore = Math.round(rShScore * 0.55 + rElScore * 0.45);
  if (uAng.rShoulderAngle != null && tAng.rShoulderAngle != null && Math.abs(uAng.rShoulderAngle - tAng.rShoulderAngle) > 20) {
    const diff = Math.round(tAng.rShoulderAngle - uAng.rShoulderAngle);
    errors.push(diff > 0
      ? `Tay phải: Cánh tay phải đang hạ thấp (thiếu ${diff}°) — hãy nâng cao vai/cánh tay phải lên.`
      : `Tay phải: Cánh tay phải nâng quá cao (dư ${Math.abs(diff)}°) — hãy hạ nhẹ cánh tay phải xuống.`);
    badJoints.push(KP.rShoulder, KP.rElbow, KP.rWrist);
  } else if (uAng.rElbowAngle != null && tAng.rElbowAngle != null && Math.abs(uAng.rElbowAngle - tAng.rElbowAngle) > 22) {
    const diff = Math.round(tAng.rElbowAngle - uAng.rElbowAngle);
    errors.push(diff > 0
      ? `Khuỷu & Bàn tay phải: Khuỷu tay phải đang gập nhiều (${uAng.rElbowAngle}° so với chuẩn ${tAng.rElbowAngle}°) — hãy duỗi thẳng tay phải hơn.`
      : `Khuỷu & Bàn tay phải: Tay phải đang duỗi quá thẳng — hãy gập khuỷu tay phải về khoảng ${tAng.rElbowAngle}°.`);
    badJoints.push(KP.rElbow, KP.rWrist);
  }

  // 4. Thân mình (Lưng - Hông)
  const torsoScore = scoreDiff(uAng.torsoTilt, tAng.torsoTilt, 12, 55);
  if (Math.abs(uAng.torsoTilt - tAng.torsoTilt) > 16) {
    errors.push(uAng.torsoTilt > tAng.torsoTilt
      ? `Thân người: Lưng đang nghiêng/cúi ${uAng.torsoTilt}° (chuẩn ${tAng.torsoTilt}°) — hãy giữ thẳng cột sống hơn.`
      : `Thân người: Cần gập/nghiêng thân người thêm về mức ${tAng.torsoTilt}°.`);
    badJoints.push(KP.lShoulder, KP.rShoulder, KP.lHip, KP.rHip);
  }

  // 5. Chân & Đầu gối
  const lKneeScore = scoreDiff(uAng.lKneeAngle, tAng.lKneeAngle, 18, 80);
  const rKneeScore = scoreDiff(uAng.rKneeAngle, tAng.rKneeAngle, 18, 80);
  const legsScore = Math.round((lKneeScore + rKneeScore) / 2);
  if (uAng.lKneeAngle != null && tAng.lKneeAngle != null && Math.abs(uAng.lKneeAngle - tAng.lKneeAngle) > 22) {
    errors.push(uAng.lKneeAngle > tAng.lKneeAngle
      ? `Chân & Gối: Đầu gối chưa hạ đủ sâu (${uAng.lKneeAngle}° so với chuẩn ${tAng.lKneeAngle}°) — hãy trùng gối hạ trọng tâm thêm.`
      : `Chân & Gối: Đầu gối đang gập quá sâu — hãy nâng nhẹ hông lên (góc gối chuẩn ~${tAng.lKneeAngle}°).`);
    badJoints.push(KP.lKnee, KP.rKnee, KP.lAnkle, KP.rAnkle);
  }

  const overall = Math.round(
    headScore * 0.15 +
    leftArmScore * 0.25 +
    rightArmScore * 0.25 +
    torsoScore * 0.20 +
    legsScore * 0.15
  );

  let grade = 'Cần tập lại';
  let gradeClass = 'bad';
  if (overall >= 88) { grade = 'Xuất sắc (Rất chuẩn xác)'; gradeClass = 'ok'; }
  else if (overall >= 75) { grade = 'Tốt (Đúng kỹ thuật)'; gradeClass = 'ok'; }
  else if (overall >= 60) { grade = 'Khá (Cần chỉnh nhẹ một vài khớp)'; gradeClass = 'amber'; }

  if (!errors.length) {
    errors.push('Tư thế các khớp Đầu, Tay, Bàn tay, Thân và Chân đều khớp rất tốt với động tác mẫu! Hãy giữ nhịp chuyển động đều đặn.');
  }

  return {
    overall,
    grade,
    gradeClass,
    parts: {
      head: headScore,
      leftArm: leftArmScore,
      rightArm: rightArmScore,
      torso: torsoScore,
      legs: legsScore,
    },
    errors,
    badJoints: [...new Set(badJoints)],
  };
}
