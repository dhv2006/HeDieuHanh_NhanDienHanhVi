// Reject uncertain/outlier observations before they enter behavior history or
// display filters. Never synthesize a visible joint when the detector lost it.
const median = (values) => {
  const a = values.sort((x,y) => x-y);
  return a.length ? a[Math.floor(a.length/2)] : 0;
};
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const usable = (k, score) => k && Number.isFinite(k.x) && Number.isFinite(k.y) && k.score >= score;

export class PoseStability {
  constructor() { this.tracks = new Map(); this.stats = { rejected: 0, uncertain: 0 }; }
  reset() { this.tracks.clear(); }
  filter(poses, t, { width, height, minScore = .3 } = {}) {
    const diagonal = Math.hypot(width || 640, height || 360);
    const enter = Math.max(.45, minScore), leave = Math.max(.3, minScore);
    this.stats = { rejected: 0, uncertain: 0 };
    const out = (poses || []).map((pose) => {
      let tr = this.tracks.get(pose.id);
      const resetPose = !tr || t < tr.t || t - tr.t > .6;
      if (resetPose) { tr = { joints: [], t }; this.tracks.set(pose.id, tr); }
      const dt = Math.max(.01, Math.min(.25, t-tr.t));
      const kp = pose.keypoints || [];
      const measuredScale = Math.max(diagonal*.12,
        usable(kp[5], enter) && usable(kp[6], enter) ? distance(kp[5],kp[6]) : 0,
        usable(kp[5], enter) && usable(kp[11], Math.max(enter,.5)) ? distance(kp[5],kp[11]) : 0,
        usable(kp[6], enter) && usable(kp[12], Math.max(enter,.5)) ? distance(kp[6],kp[12]) : 0);
      const scale = tr.scale ? Math.max(tr.scale*.75,Math.min(tr.scale*1.25,measuredScale)) : measuredScale;
      // Coherent torso translation is real movement, not an isolated joint spike.
      const anchors = [5,6,11,12].filter((i) => usable(kp[i], i >= 11 ? Math.max(enter,.5) : enter)
        && tr.joints[i]?.accepted && t-tr.joints[i].lastGood <= .3)
        .map((i) => ({ x: kp[i].x-tr.joints[i].accepted.x, y: kp[i].y-tr.joints[i].accepted.y }));
      const tolerance = Math.max(diagonal*.025,scale*.2);
      const cluster = anchors.map((a) => anchors.filter((b) => distance(a,b) <= tolerance)).sort((a,b) => b.length-a.length)[0] || [];
      const dx = cluster.length >= 2 ? median(cluster.map((a) => a.x)) : 0;
      const dy = cluster.length >= 2 ? median(cluster.map((a) => a.y)) : 0;
      const rejectedBefore = this.stats.rejected;
      const resetJoints = [];
      const keypoints = kp.map((raw, i) => {
        const k = raw || { x: 0, y: 0, score: 0 };
        const state = tr.joints[i] ||= { accepted: null, lastGood: -Infinity, pending: null };
        const inFrame = k.x >= 0 && k.y >= 0 && (!width || k.x <= width) && (!height || k.y <= height);
        const tracked = state.accepted && t-state.lastGood <= .3;
        if (!usable(k, tracked ? leave : enter) || !inFrame) {
          state.pending = null; this.stats.uncertain++;
          return { ...k, x: Number.isFinite(k.x) ? k.x : 0, y: Number.isFinite(k.y) ? k.y : 0, score: 0 };
        }
        const allowance = Math.max(diagonal*.02, scale*(i < 5 ? .22 : i < 7 || i === 11 || i === 12 ? .45 : 1.0))
          * Math.max(1, Math.min(1.8,dt/.1));
        const expected = state.accepted && { x: state.accepted.x+dx, y: state.accepted.y+dy };
        const jump = tracked && distance(k,expected) > allowance;
        // An isolated high-score jump needs a second consistent observation.
        const acquire = !tracked && k.score < .75;
        if (jump || acquire) {
          const prior = state.pending;
          const consistent = prior && t-prior.t <= .35 && distance(k,prior.k) <= allowance*.5;
          state.pending = { k, t, hits: consistent ? prior.hits+1 : 1 };
          if (state.pending.hits < 2) {
            jump ? this.stats.rejected++ : this.stats.uncertain++;
            return { ...k, score: 0 };
          }
          resetJoints.push(i);
        } else if (!tracked) resetJoints.push(i);
        state.accepted = { ...k }; state.lastGood = t; state.pending = null;
        return { ...k };
      });
      tr.t = t;
      if (this.stats.rejected === rejectedBefore) tr.scale = scale;
      return { ...pose, keypoints, _resetPose: resetPose, _resetJoints: resetJoints, _poseScale: scale };
    });
    for (const [id,tr] of this.tracks) if (t-tr.t > .6 || t < tr.t) this.tracks.delete(id);
    return out;
  }
}
