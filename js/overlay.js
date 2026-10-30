// =========================================================
// overlay.js — Vẽ Khung xương Cơ thể, Khung xương Đầu-Cổ,
// Khung xương Bàn tay 21 khớp & Animation Khung xương Hướng dẫn
// =========================================================
import { SKELETON, HEAD_SKELETON, HAND_SKELETON, KP, behaviorInfo, personColor } from './config.js';
import { computeHeadSkeleton, computeHandsSkeleton } from './hand-skeleton.js';
import { store } from './store.js';

const ctxCache = new WeakMap();
function ctxOf(canvas) {
  let c = ctxCache.get(canvas);
  if (!c) { c = canvas.getContext('2d'); ctxCache.set(canvas, c); }
  return c;
}

/** Đồng bộ kích thước canvas với khung video (giới hạn bởi maxWidth) */
export function syncCanvas(canvas, video, maxWidth = 1280) {
  const vw = video?.videoWidth || video?.width || 640;
  const vh = video?.videoHeight || video?.height || 360;
  const scale = Math.min(1, maxWidth / vw);
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.dataset.scale = scale;
}

export function clearOverlay(canvas) {
  if (!canvas) return;
  ctxOf(canvas).clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Vẽ khung xương cơ thể + xương đầu-cổ + xương bàn tay 21 khớp
 * @param {HTMLCanvasElement} canvas
 * @param {Array} persons
 * @param {Array} objects
 * @param {number} minScore
 * @param {CanvasImageSource} [background]
 * @param {object} [opts]
 */
export function drawOverlay(canvas, persons, objects = [], minScore = 0.28, background = null, opts = {}) {
  if (!canvas) return;
  const showSkeleton = opts.skeleton !== false;
  const showHands = store.settings.detectHands !== false && opts.hands !== false;
  const showHead = store.settings.detectHeadSkeleton !== false && opts.head !== false;
  const badJoints = new Set(opts.badJoints || []);

  const ctx = ctxOf(canvas);
  const s = parseFloat(canvas.dataset.scale || '1');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (background) ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  else ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const u = Math.max(1, canvas.width / 900) / s;

  for (const p of persons || []) {
    const color = personColor(p.personId);
    const kp = p.keypoints;
    const alert = p.labels?.some((l) => behaviorInfo(l.behavior || l).alert);
    const mainColor = alert ? '#ff5d73' : color;

    if (showSkeleton && kp && kp.length) {
      // 1. Vẽ khung xương thân & chân
      ctx.lineWidth = 3.2 * u;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = mainColor;
      ctx.beginPath();
      for (const [a, b] of SKELETON) {
        const A = kp[a], B = kp[b];
        if (!A || !B || A.score < minScore || B.score < minScore || ![A.x, A.y, B.x, B.y].every(Number.isFinite)) continue;
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
      }
      ctx.stroke();

      // 2. Vẽ khung xương Đầu & Cổ (thay cho mô hình khuôn mặt/biểu cảm)
      if (showHead) {
        const head = p.head || computeHeadSkeleton(kp, minScore);
        if (head) {
          ctx.strokeStyle = '#b8c0ff';
          ctx.lineWidth = 2.4 * u;
          ctx.beginPath();
          // Trục cột sống cổ -> cằm -> mũi -> đỉnh đầu
          if (head.neck && head.chin) { ctx.moveTo(head.neck.x, head.neck.y); ctx.lineTo(head.chin.x, head.chin.y); }
          if (head.chin && head.nose) { ctx.moveTo(head.chin.x, head.chin.y); ctx.lineTo(head.nose.x, head.nose.y); }
          if (head.nose && head.crown) { ctx.moveTo(head.nose.x, head.nose.y); ctx.lineTo(head.crown.x, head.crown.y); }
          // Khung xương sọ (Mũi - Mắt - Tai - Đỉnh đầu)
          for (const [a, b] of HEAD_SKELETON) {
            const A = kp[a], B = kp[b];
            if (!A || !B || A.score < minScore || B.score < minScore) continue;
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
          }
          if (head.lEye && head.crown) { ctx.moveTo(head.lEye.x, head.lEye.y); ctx.lineTo(head.crown.x, head.crown.y); }
          if (head.rEye && head.crown) { ctx.moveTo(head.rEye.x, head.rEye.y); ctx.lineTo(head.crown.x, head.crown.y); }
          if (head.lEar && head.chin) { ctx.moveTo(head.lEar.x, head.lEar.y); ctx.lineTo(head.chin.x, head.chin.y); }
          if (head.rEar && head.chin) { ctx.moveTo(head.rEar.x, head.rEar.y); ctx.lineTo(head.chin.x, head.chin.y); }
          ctx.stroke();

          // Đốt cổ & đỉnh đầu
          ctx.fillStyle = '#b8c0ff';
          for (const pt of [head.neck, head.chin, head.crown]) {
            if (!pt) continue;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 3.2 * u, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 3. Vẽ khung xương Bàn tay & 5 Ngón tay (21 khớp mỗi bàn tay)
      if (showHands) {
        const hands = p.hands || computeHandsSkeleton(kp, null, minScore, p.labels);
        drawHandBones(ctx, hands?.left, '#3dd6c6', u);
        drawHandBones(ctx, hands?.right, '#ffd166', u);
      }

      // 4. Vẽ các khớp chính trên cơ thể
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < kp.length; i++) {
        const k = kp[i];
        if (!k || k.score < minScore || !Number.isFinite(k.x) || !Number.isFinite(k.y)) continue;
        const r = (i === KP.lWrist || i === KP.rWrist) ? 4.2 * u : 3.4 * u;
        ctx.moveTo(k.x + r, k.y);
        ctx.arc(k.x, k.y, r, 0, Math.PI * 2);
      }
      ctx.fill();

      // 5. Đánh dấu các khớp bị sai tư thế (khi đang Kiểm tra độ chính xác ở Camera)
      if (badJoints.size) {
        ctx.strokeStyle = '#ff5d73';
        ctx.fillStyle = 'rgba(255, 93, 115, 0.28)';
        ctx.lineWidth = 2.5 * u;
        for (const jIdx of badJoints) {
          const k = kp[jIdx];
          if (!k || k.score < minScore || !Number.isFinite(k.x)) continue;
          ctx.beginPath();
          ctx.arc(k.x, k.y, 11 * u, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // Khung bao & Nhãn hành vi (gồm cả nhãn gốc và nhãn con AI)
    if (p.box) {
      const pad = 12 * u;
      const bx = p.box.x - pad, by = p.box.y - pad, bw = p.box.w + pad * 2, bh = p.box.h + pad * 2;
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = (alert ? 3.5 : 1.5) * u;
      ctx.strokeRect(bx, by, bw, bh);

      const labelNames = (p.labels || []).map((l) => {
        const key = typeof l === 'string' ? l : l.behavior;
        return behaviorInfo(key).label;
      });
      const microText = p.microAction ? ` · ${p.microAction}` : '';
      const text = `#${p.personId}  ${labelNames.slice(0, 2).join(', ') || 'Đang phân tích'}${microText}`;
      const fs = showSkeleton ? 12.5 : 14.5;
      ctx.font = `600 ${fs * u}px "Be Vietnam Pro", system-ui, sans-serif`;
      const maxCanvasW = canvas.width / s;
      const maxCanvasH = canvas.height / s;
      const tw = Math.min(maxCanvasW - 16 * u, ctx.measureText(text).width + 16 * u);
      const th = (fs + 9) * u;
      const lx = Math.max(8 * u, Math.min(bx, maxCanvasW - tw - 8 * u));
      const ty = Math.max(6 * u, Math.min(by - th < 0 ? by : by - th, maxCanvasH - th - 6 * u));
      ctx.fillStyle = 'rgba(10, 16, 23, 0.86)';
      roundRect(ctx, lx, ty, tw, th, 6 * u);
      ctx.fill();
      ctx.fillStyle = mainColor;
      ctx.fillRect(lx, ty, 4 * u, th);
      ctx.fillStyle = '#f4f7fa';
      ctx.fillText(text, lx + 9 * u, ty + th * 0.71, tw - 12 * u);
    }
  }

  // Vẽ Khung xương Hướng dẫn (Animation Step-by-Step trên màn hình Camera) nếu đang bật
  if (opts.guidePose) {
    drawGuideSkeleton(ctx, canvas, opts.guidePose, u, s);
  }

  if (opts.hud?.length) drawHud(ctx, opts.hud, u);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Vẽ chi tiết 21 khớp & 20 đốt xương bàn tay */
function drawHandBones(ctx, hand, color, u) {
  if (!hand || !Array.isArray(hand.keypoints) || hand.keypoints.length < 21) return;
  const kp = hand.keypoints;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.9 * u;
  ctx.beginPath();
  for (const [a, b] of HAND_SKELETON) {
    const A = kp[a], B = kp[b];
    if (!A || !B || !Number.isFinite(A.x) || !Number.isFinite(B.x)) continue;
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
  }
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 1; i < kp.length; i++) {
    const p = kp[i];
    if (!p || !Number.isFinite(p.x)) continue;
    const r = (i % 4 === 0) ? 2.4 * u : 1.7 * u; // Đầu ngón tay rõ hơn
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

/**
 * Vẽ Khung xương Hướng dẫn chuyển động (Camera Chức năng 1)
 * Hiển thị khung xương mẫu chuyển động từ từ + Step hướng dẫn trực tiếp trên màn hình
 */
export function drawGuideSkeleton(ctx, canvas, guide, u, scale = 1) {
  if (!guide || !guide.keypoints) return;
  const W = canvas.width / scale;
  const H = canvas.height / scale;

  // Nếu ở chế độ góc hướng dẫn (cornerPIP) hoặc chồng lên trung tâm (overlay)
  const isOverlay = guide.mode === 'overlay';
  const boxW = isOverlay ? W : Math.min(310 * u, W * 0.38);
  const boxH = isOverlay ? H : Math.min(280 * u, H * 0.56);
  const boxX = isOverlay ? 0 : W - boxW - 14 * u;
  const boxY = isOverlay ? 0 : 14 * u;

  if (!isOverlay) {
    ctx.fillStyle = 'rgba(10, 16, 23, 0.86)';
    ctx.strokeStyle = 'rgba(61, 214, 198, 0.65)';
    ctx.lineWidth = 2 * u;
    roundRect(ctx, boxX, boxY, boxW, boxH, 12 * u);
    ctx.fill();
    ctx.stroke();
  }

  // Chuẩn hóa tọa độ khung xương mẫu vào khung hiển thị
  const rawKp = guide.keypoints;
  const valid = rawKp.filter((k) => k && Number.isFinite(k.x) && Number.isFinite(k.y) && (k.score ?? 1) > 0.1);
  if (!valid.length) return;
  const minX = Math.min(...valid.map((k) => k.x));
  const maxX = Math.max(...valid.map((k) => k.x));
  const minY = Math.min(...valid.map((k) => k.y));
  const maxY = Math.max(...valid.map((k) => k.y));
  const spanX = Math.max(40, maxX - minX);
  const spanY = Math.max(60, maxY - minY);

  const topBannerH = isOverlay ? 0 : 54 * u;
  const availW = boxW * (isOverlay ? 0.45 : 0.72);
  const availH = (boxH - topBannerH) * (isOverlay ? 0.68 : 0.74);
  const fit = Math.min(availW / spanX, availH / spanY);
  const cx = boxX + boxW / 2;
  const cy = boxY + topBannerH + (boxH - topBannerH) * (isOverlay ? 0.50 : 0.54);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const mapped = rawKp.map((k) => {
    if (!k || !Number.isFinite(k.x)) return { x: 0, y: 0, score: 0 };
    return {
      x: cx + (k.x - midX) * fit,
      y: cy + (k.y - midY) * fit,
      score: k.score ?? 0.9,
    };
  });

  ctx.save();
  ctx.globalAlpha = isOverlay ? 0.72 : 0.96;

  // Vẽ xương thân mẫu
  ctx.strokeStyle = '#3dd6c6';
  ctx.lineWidth = (isOverlay ? 4.2 : 3.0) * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, b] of SKELETON) {
    const A = mapped[a], B = mapped[b];
    if (!A || !B || A.score < 0.15 || B.score < 0.15) continue;
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
  }
  ctx.stroke();

  // Vẽ xương đầu mẫu
  const head = computeHeadSkeleton(mapped, 0.15);
  if (head) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2.2 * u;
    ctx.beginPath();
    if (head.neck && head.chin) { ctx.moveTo(head.neck.x, head.neck.y); ctx.lineTo(head.chin.x, head.chin.y); }
    if (head.chin && head.crown) { ctx.moveTo(head.chin.x, head.chin.y); ctx.lineTo(head.crown.x, head.crown.y); }
    if (head.crown) {
      ctx.moveTo(head.nose.x + head.headRadius * 0.55, head.nose.y);
      ctx.arc(head.nose.x, head.nose.y, head.headRadius * 0.55, 0, Math.PI * 2);
    }
    ctx.stroke();
  }

  // Vẽ xương bàn tay mẫu
  const hands = computeHandsSkeleton(mapped, null, 0.15);
  drawHandBones(ctx, hands.left, '#3dd6c6', u * 0.9);
  drawHandBones(ctx, hands.right, '#ffd166', u * 0.9);

  // Vẽ khớp mẫu
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (const k of mapped) {
    if (!k || k.score < 0.15) continue;
    ctx.moveTo(k.x + 3 * u, k.y);
    ctx.arc(k.x, k.y, 3 * u, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();

  // Thanh tiêu đề Step hướng dẫn
  const totalSteps = Math.max(1, Number(guide.totalSteps) || 1);
  const stepNum = Math.min(totalSteps, Math.max(1, (Number(guide.stepIndex) || 0) + 1));
  const rawLabel = guide.stepLabel || guide.stepTitle || 'Thực hiện động tác';
  const stepTitle = `BƯỚC ${stepNum}/${totalSteps}: ${rawLabel}`;
  const stepDesc = guide.stepInstruction || guide.instruction || '';
  const bannerX = isOverlay ? 16 * u : boxX + 8 * u;
  const bannerY = isOverlay ? H - 78 * u : boxY + 8 * u;
  const bannerW = isOverlay ? W - 32 * u : boxW - 16 * u;

  ctx.fillStyle = 'rgba(15, 25, 36, 0.92)';
  roundRect(ctx, bannerX, bannerY, bannerW, isOverlay ? 62 * u : 46 * u, 8 * u);
  ctx.fill();
  ctx.fillStyle = '#3dd6c6';
  ctx.font = `700 ${(isOverlay ? 14 : 11.5) * u}px "Be Vietnam Pro", system-ui, sans-serif`;
  ctx.fillText(stepTitle, bannerX + 10 * u, bannerY + (isOverlay ? 22 : 18) * u, bannerW - 20 * u);

  if (stepDesc) {
    ctx.fillStyle = '#e8eef4';
    ctx.font = `500 ${(isOverlay ? 13 : 10.5) * u}px "Be Vietnam Pro", system-ui, sans-serif`;
    ctx.fillText(stepDesc, bannerX + 10 * u, bannerY + (isOverlay ? 45 : 36) * u, bannerW - 20 * u);
  }
}

/** Bảng nhỏ góc trên-trái: mỗi người một dòng — hành vi & động tác con đang diễn ra */
function drawHud(ctx, items, u) {
  ctx.font = `600 ${13 * u}px "Be Vietnam Pro", system-ui, sans-serif`;
  const lh = 21 * u, pad = 8 * u;
  const w = Math.max(...items.map((it) => ctx.measureText(it.text).width)) + pad * 2 + 12 * u;
  const h = items.length * lh + pad * 2 - 4 * u;
  ctx.fillStyle = 'rgba(5, 9, 13, 0.76)';
  roundRect(ctx, 10 * u, 10 * u, w, h, 8 * u);
  ctx.fill();
  items.forEach((it, i) => {
    const y = 10 * u + pad + i * lh;
    ctx.fillStyle = it.color;
    ctx.fillRect(10 * u + pad, y + 4 * u, 6 * u, 12 * u);
    ctx.fillStyle = '#e8eef4';
    ctx.fillText(it.text, 10 * u + pad + 12 * u, y + 14 * u);
  });
}

export function drawHudOnly(canvas, hud) {
  if (!canvas) return;
  const ctx = ctxOf(canvas);
  const s = parseFloat(canvas.dataset.scale || '1');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!hud?.length) return;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  drawHud(ctx, hud, Math.max(1, canvas.width / 900) / s);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
