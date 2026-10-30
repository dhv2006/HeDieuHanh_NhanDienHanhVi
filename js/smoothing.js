// =========================================================
// smoothing.js — Làm mượt & đồng bộ khung xương với khung hình
//
//  • OneEuroFilter: bộ lọc thích nghi (Casiez 2012) — lọc mạnh khi
//    đứng yên (hết rung), lọc nhẹ khi chuyển động nhanh (ít trễ).
//  • PoseSmoother: áp One Euro cho 17 khớp × mỗi người, kèm dự đoán
//    vị trí theo vận tốc để bù độ trễ suy luận (chế độ "độ trễ thấp").
//  • interpolatePersons: nội suy tuyến tính giữa 2 khung mẫu để khi
//    xem lại video, khung xương chạy mượt ở mọi khung hình.
// =========================================================

class LowPass {
  constructor() { this.y = null; }
  filter(x, a) {
    this.y = this.y === null ? x : a * x + (1 - a) * this.y;
    return this.y;
  }
}

const alpha = (cutoff, dt) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.lastT = null;
    this.lastRaw = null;
    this.velocity = 0;
    this.direction = 0;
    this.directionStreak = 0;
    this.samples = 0;
  }

  filter(value, t) {
    if (!Number.isFinite(value)) return this.x.y;
    if (this.lastT !== null && t === this.lastT) return this.x.y;
    if (this.lastT === null || t < this.lastT || t - this.lastT > .6) {
      this.x = new LowPass(); this.dx = new LowPass();
      this.lastT = t;
      this.lastRaw = value;
      this.velocity = 0;
      this.direction = this.directionStreak = 0;
      this.samples = 1;
      return this.x.filter(value, 1);
    }
    const dt = Math.max(.001, Math.min(.25, t - this.lastT));
    const dv = (value - this.lastRaw) / dt;
    const edv = this.dx.filter(dv, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edv);
    this.lastT = t;
    this.lastRaw = value;
    const previous = this.x.y;
    const filtered = this.x.filter(value, alpha(cutoff, dt));
    const delta = filtered-previous;
    this.velocity = Math.abs(delta) < .5 ? 0 : this.velocity*.4 + delta/dt*.6;
    const direction = Math.abs(delta) < .5 ? 0 : Math.sign(delta);
    this.directionStreak = direction && direction === this.direction ? this.directionStreak+1 : direction ? 1 : 0;
    this.direction = direction;
    this.samples++;
    return filtered;
  }
}

/**
 * Làm mượt khung xương nhiều người.
 * strength 0..1: 0 = gần như không lọc, 1 = rất mượt (trễ hơn)
 */
export class PoseSmoother {
  constructor(strength = 0.5) {
    this.setStrength(strength);
    this.tracks = new Map();
  }

  setStrength(s) {
    this.strength = Math.max(0,Math.min(1,Number(s) || 0));
    s = this.strength;
    // strength cao → minCutoff thấp (lọc mạnh hơn)
    this.minCutoff = 3.0 - 2.7 * s;     // 3.0 … 0.3 Hz
    this.beta = 0.05 - 0.04 * s;        // phản ứng với tốc độ
  }

  reset() { this.tracks.clear(); }

  /** @param persons [{personId, keypoints, box, labels}]  @param t giây */
  smooth(persons, t, minScore = .3) {
    if (this.strength <= 0) return persons;
    const seen = new Set();
    const out = persons.map((p) => {
      seen.add(p.personId);
      if (!p.keypoints) return p;
      let tr = this.tracks.get(p.personId);
      if (!tr || p._resetPose || t < tr.lastT || t-tr.lastT > .6) {
        tr = { fx: [], fy: [], lastT: t, interval: 1, samples: 0 };
        for (let i = 0; i < p.keypoints.length; i++) {
          tr.fx.push(new OneEuroFilter(this.minCutoff, this.beta));
          tr.fy.push(new OneEuroFilter(this.minCutoff, this.beta));
        }
        this.tracks.set(p.personId, tr);
      }
      if (t > tr.lastT) tr.interval = tr.samples < 2 ? t-tr.lastT : tr.interval*.6+(t-tr.lastT)*.4;
      tr.lastT = t;
      tr.samples++;
      const scale = p._poseScale || Math.max(p.box?.w || 0,p.box?.h || 0,80);
      tr.scale = scale;
      tr.minScore = minScore;
      const reset = new Set(p._resetJoints || []);
      const keypoints = p.keypoints.map((k, i) => {
        if (!k || k.score < minScore || !Number.isFinite(k.x) || !Number.isFinite(k.y)) {
          return { ...k, x: tr.fx[i]?.x.y ?? k?.x ?? 0, y: tr.fy[i]?.x.y ?? k?.y ?? 0, score: 0 };
        }
        if (reset.has(i) || !tr.fx[i]) {
          tr.fx[i] = new OneEuroFilter(); tr.fy[i] = new OneEuroFilter();
        }
        for (const f of [tr.fx[i],tr.fy[i]]) {
          f.minCutoff = tr.interval > .085 ? Math.min(this.minCutoff,1.2) : this.minCutoff;
          f.beta = (4-3*this.strength)/scale*(i < 5 ? .3 : 1);
        }
        return { x: tr.fx[i].filter(k.x,t), y: tr.fy[i].filter(k.y,t), score: k.score };
      });
      return { ...p, keypoints, box: jointBox(keypoints,minScore,p.box), _t: t };
    });
    for (const [id, tr] of this.tracks) if (!seen.has(id) && t - tr.lastT > .6) this.tracks.delete(id);
    return out;
  }

  /**
   * Dự đoán vị trí sau `ahead` giây dựa trên vận tốc đã lọc —
   * Only predict short, coherent motion at >=12 analysis samples/s. Low-rate
   * sources keep the filtered observation instead of amplifying detector noise.
   */
  predict(persons, ahead) {
    const dt = Math.max(0, Math.min(ahead, .04));
    if (!dt || this.strength <= 0) return persons;
    return persons.map((p) => {
      const tr = this.tracks.get(p.personId);
      if (!tr) return p;
      if (ahead > Math.min(.6,Math.max(.3,tr.interval*2.5))) return null;
      if (tr.interval > .085 || tr.samples < 3 || ahead > .18) return p;
      const keypoints = p.keypoints.map((k, i) => {
        if (k.score < .65) return k;
        const fx = tr.fx[i], fy = tr.fy[i];
        const dx = fx?.directionStreak >= 2 ? fx.velocity*dt : 0;
        const dy = fy?.directionStreak >= 2 ? fy.velocity*dt : 0;
        const limit = Math.max(2,Math.min(8,tr.scale*.035))*(i < 5 ? .5 : 1);
        const magnitude = Math.hypot(dx,dy);
        const factor = magnitude > limit ? limit/magnitude : 1;
        return { ...k, x: k.x+dx*factor, y: k.y+dy*factor };
      });
      return {
        ...p,
        keypoints, box: jointBox(keypoints,tr.minScore,p.box),
      };
    }).filter(Boolean);
  }
}

function jointBox(keypoints,minScore,fallback) {
  const good = keypoints.filter((k) => k?.score >= minScore && Number.isFinite(k.x) && Number.isFinite(k.y));
  if (!good.length) return fallback;
  const xs = good.map((k) => k.x), ys = good.map((k) => k.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x,y,w: Math.max(...xs)-x,h: Math.max(...ys)-y };
}

const lerp = (a, b, u) => a + (b - a) * u;

/**
 * Nội suy danh sách người giữa khung a (thời điểm ta) và b (tb) tại t.
 * Người có mặt ở cả 2 khung → nội suy; chỉ có ở 1 khung → giữ nguyên
 * nếu đủ gần (tránh khung xương "ma" khi người vừa rời khung hình).
 */
export function interpolatePersons(fa, fb, t, maxGap) {
  if (!fa && !fb) return [];
  if (!fb) return t - fa.t <= maxGap ? fa.persons : [];
  if (!fa) return fb.t - t <= maxGap / 2 ? fb.persons : [];
  const span = fb.t - fa.t;
  if (span <= 0 || span > maxGap * 2.5) {
    return (t - fa.t <= fb.t - t ? fa : fb).persons;
  }
  const u = Math.min(1, Math.max(0, (t - fa.t) / span));
  const byId = new Map(fb.persons.map((p) => [p.personId, p]));
  const out = [];
  for (const pa of fa.persons) {
    const pb = byId.get(pa.personId);
    if (!pb) { if (u < 0.5) out.push(pa); continue; }
    byId.delete(pa.personId);
    out.push({
      personId: pa.personId,
      labels: u < 0.5 ? pa.labels : pb.labels,
      box: pa.box && pb.box ? {
        x: lerp(pa.box.x, pb.box.x, u), y: lerp(pa.box.y, pb.box.y, u),
        w: lerp(pa.box.w, pb.box.w, u), h: lerp(pa.box.h, pb.box.h, u),
      } : pa.box,
      keypoints: pa.keypoints && pb.keypoints
        ? pa.keypoints.map((k, i) => ({
            x: lerp(k.x, pb.keypoints[i].x, u),
            y: lerp(k.y, pb.keypoints[i].y, u),
            score: Math.min(k.score, pb.keypoints[i].score),
          }))
        : pa.keypoints,
      face: lerpFace(pa.face, pb.face, u),
      faceOnly: pa.faceOnly,
    });
  }
  if (u >= 0.5) byId.forEach((pb) => out.push(pb));
  return out;
}

function lerpFace(fa, fb, u) {
  if (!fa || !fb) return u < 0.5 ? fa : fb;
  const base = u < 0.5 ? fa : fb;
  return { ...base, box: fa.box.map((v, i) => lerp(v, fb.box[i], u)), anchor: null };
}
