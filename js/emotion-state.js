// Unknown is a real result: weak or ambiguous scores must not become neutral.
export const EMOTION_TTL = 1.2;
export function normalizeEmotion(values) {
  if (!values || values.length !== 7 || values.some((v) => !Number.isFinite(v) || v < 0)) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum > 0 ? Array.from(values, (v) => v / sum) : null;
}

export function updateEmotion(tr, values, t, minConfidence, quality = 1) {
  const p = normalizeEmotion(values);
  if (!p || quality < 0.55) {
    tr.emo = null;
    tr.probs = null;
    tr.emoT = null;
    return;
  }
  const dt = tr.emoT == null ? Infinity : Math.max(0, t - tr.emoT);
  const alpha = Number.isFinite(dt) ? 1 - Math.exp(-dt / 0.45) : 1;
  tr.probs = tr.probs && dt < EMOTION_TTL
    ? tr.probs.map((v, i) => v + alpha * (p[i] - v)) : p;
  tr.emoT = t;
  const ranked = tr.probs.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const best = ranked[0];
  const sure = best.v >= Math.max(0.65, minConfidence) && best.v - ranked[1].v >= 0.12;
  if (!sure) { tr.emo = null; return; }
  if (tr.emo?.index === best.i && tr.emo.accepted) return;
  if (tr.emo?.index !== best.i) tr.emo = { index: best.i, since: t, accepted: false };
  if (t - tr.emo.since >= 0.45) tr.emo.accepted = true;
}
