// =========================================================
// behavior.js — Bộ suy luận hành vi & tạo sinh nhãn AI tức thì
// ở độ phân giải mili-giây (Millisecond Kinematic Engine v3.0)
// =========================================================
import { KP, CORE_BEHAVIORS, BEHAVIORS, registerAiBehavior, behaviorInfo } from './config.js';
import { store } from './store.js';
import { clamp, dist, midpoint, angleFromVertical, jointAngle, round } from './utils.js';
import { normalizeEntry, windowFeatures, WINDOW_SEC } from './features.js';
import { hasModel, predict } from './learner.js';
import { computeHeadSkeleton, computeHandsSkeleton, extractPostureAngles } from './hand-skeleton.js';

const POSTURE_HOLD = 0.25;   // 250ms — phản hồi nhanh tới mili-giây mà vẫn chống nhiễu
const HISTORY_SEC = 2.5;
const STALE_SEC = 5;
const FALL_WINDOW = 1.4;
const FALL_HOLD = 1.8;
const FALL_COOLDOWN = 4.0;
const JUMP_HOLD = 0.35;

export class BehaviorEngine {
  constructor(opts = {}) {
    this.tracks = new Map();
    this.wantFeatures = !!opts.wantFeatures;
  }

  reset() { this.tracks.clear(); }

  analyze(poses, objects, t) {
    const minScore = store.settings.minScore;
    const useLearned = store.settings.useLearned && hasModel();
    const out = [];
    for (const pose of poses || []) {
      const r = this.#analyzePerson(pose, t, minScore, useLearned);
      if (r) out.push(r);
    }
    for (const [id, tr] of this.tracks) {
      if (t - tr.lastSeen > STALE_SEC || t < tr.lastSeen - 1) this.tracks.delete(id);
    }
    return out;
  }

  #stablePosture(tr, state, t) {
    const ps = (tr.posture ||= { cur: null, cand: null, since: t, lastSure: -Infinity });
    if (state === null) {
      if (t - ps.lastSure > 1.2) ps.cur = null;
      ps.cand = null;
      return ps.cur;
    }
    ps.lastSure = t;
    if (state === ps.cur || ps.cur === null) { ps.cur = state; ps.cand = null; return ps.cur; }
    if (ps.cand !== state) { ps.cand = state; ps.since = t; }
    if (t - ps.since >= POSTURE_HOLD) { ps.cur = state; ps.cand = null; }
    return ps.cur;
  }

  #track(id, t) {
    let tr = this.tracks.get(id);
    if (!tr) {
      tr = {
        hist: [], poseHist: [], speed: 0, lastSeen: t,
        fallUntil: -Infinity, lastFall: -Infinity, fallConf: 0.75,
        jumpUntil: -Infinity,
      };
      this.tracks.set(id, tr);
    }
    tr.lastSeen = t;
    return tr;
  }

  #analyzePerson(pose, t, minScore, useLearned) {
    const kp = pose.keypoints;
    const ok = (i) => kp[i] && kp[i].score >= minScore;
    const pair = (a, b) => (ok(a) && ok(b) ? midpoint(kp[a], kp[b]) : ok(a) ? kp[a] : ok(b) ? kp[b] : null);

    const valid = kp.filter((k) => k.score >= minScore);
    if (valid.length < 5) return null;

    const box = boundingBox(valid);
    const quality = valid.reduce((s, k) => s + k.score, 0) / valid.length;
    const shoulder = pair(KP.lShoulder, KP.rShoulder);
    const hip = pair(KP.lHip, KP.rHip);
    const ankle = pair(KP.lAnkle, KP.rAnkle);
    const nose = ok(KP.nose) ? kp[KP.nose] : null;
    const earMid = pair(KP.lEar, KP.rEar);
    const headPt = nose || earMid;
    const lw = ok(KP.lWrist) ? kp[KP.lWrist] : null;
    const rw = ok(KP.rWrist) ? kp[KP.rWrist] : null;
    const wrists = [lw && { side: 'l', p: lw }, rw && { side: 'r', p: rw }].filter(Boolean);

    let torso = shoulder && hip ? dist(shoulder, hip) : box.h * 0.3;
    if (!(torso > 4)) torso = Math.max(box.h * 0.3, 4);
    const reliableTorso = [KP.lShoulder, KP.rShoulder].every((i) => kp[i]?.score >= Math.max(minScore, 0.35))
      && [KP.lHip, KP.rHip].every((i) => kp[i]?.score >= Math.max(minScore, 0.42));
    const tilt = reliableTorso && shoulder && hip ? angleFromVertical(shoulder, hip) : null;
    const center = hip || { x: box.x + box.w / 2, y: box.y + box.h / 2 };

    const tr = this.#track(pose.id, t);
    const footY = ok(KP.lAnkle) && ok(KP.rAnkle) ? Math.max(kp[KP.lAnkle].y, kp[KP.rAnkle].y) : null;
    tr.hist.push({ t, center, torso, tilt, shoulderX: shoulder?.x, shoulderY: shoulder?.y, lw, rw, footY });
    while (tr.hist.length && t - tr.hist[0].t > HISTORY_SEC) tr.hist.shift();

    const needFeat = useLearned || this.wantFeatures;
    let feat = null;
    if (needFeat) {
      const e = normalizeEntry(kp, minScore, t);
      if (e) tr.poseHist.push(e);
      while (tr.poseHist.length && t - tr.poseHist[0].t > WINDOW_SEC) tr.poseHist.shift();
      if (tr.featT == null || t - tr.featT >= 0.08) {
        tr.feat = windowFeatures(tr.poseHist);
        tr.featT = t;
      }
      feat = tr.feat;
    }

    // Tính khung xương Đầu-Cổ & thông số góc khớp mili-giây
    const headSkel = computeHeadSkeleton(kp, minScore);
    const angles = extractPostureAngles(kp, minScore);
    const jointDetail = formatJointSummary(angles);

    const labels = [];
    const addCore = (behavior, conf, detail = jointDetail, instruction = '') => {
      labels.push({
        behavior,
        confidence: round(clamp(conf * (0.6 + 0.4 * quality), 0, 1), 3),
        isCore: true,
        jointDetail: detail,
        instruction: instruction || defaultInstructionFor(behavior, angles),
      });
    };
    const addAiSubLabel = (key, labelText, parentBehavior, conf, instruction) => {
      registerAiBehavior(key, labelText, {
        parentBehavior,
        jointDetail,
        instruction,
      });
      labels.push({
        behavior: key,
        confidence: round(clamp(conf * (0.65 + 0.35 * quality), 0, 1), 3),
        isCore: false,
        isAiGenerated: true,
        parentBehavior,
        jointDetail,
        instruction,
      });
    };
    const has = (b) => labels.some((l) => l.behavior === b);

    // ----- 1. Tư thế gốc chính & Nhãn AI chi tiết thân dưới -----
    let mainPosture = 'standing';
    if (tilt !== null) {
      const wide = box.w > box.h * 1.3;
      const squat = tilt < 52 ? squatScore(kp, ok, hip, ankle, torso) : 0;
      if (tilt > 58 || (tilt > 45 && wide)) {
        mainPosture = 'bending';
        addCore('bending', 0.82, jointDetail, 'Hạ thấp thân người hoặc nằm xuống sàn theo nhịp kiểm soát.');
        addAiSubLabel(
          'ai_body_horizontal',
          `AI: Hạ thấp toàn thân (${Math.round(tilt)}°)`,
          'bending',
          0.84,
          `Hạ thấp trọng tâm toàn thân với góc nghiêng thân ${Math.round(tilt)}°, giữ đầu và cột sống thẳng hàng.`
        );
      } else if (squat > 0) {
        mainPosture = 'squatting';
        addCore('squatting', squat, jointDetail, 'Gập hai đầu gối hạ trọng tâm xuống tư thế Squat, giữ lưng thẳng.');
        const kneeDeg = Math.min(angles?.lKneeAngle || 100, angles?.rKneeAngle || 100);
        addAiSubLabel(
          'ai_squat_knee',
          `AI: Hạ trọng tâm Squat (Góc gối ${kneeDeg}°)`,
          'squatting',
          squat,
          `Mở hai chân rộng bằng vai, từ từ hạ hông xuống sao cho góc khớp gối đạt khoảng ${kneeDeg}°, giữ lưng nghiêng nhẹ ${angles?.torsoTilt || 15}°.`
        );
      } else if (tilt > 28) {
        mainPosture = 'bending';
        addCore('bending', 0.6 + 0.35 * clamp((tilt - 28) / 30, 0, 1), jointDetail, `Gập thân trên về phía trước góc khoảng ${Math.round(tilt)}°.`);
        addAiSubLabel(
          'ai_torso_bend',
          `AI: Gập thân trên về trước (${Math.round(tilt)}°)`,
          'bending',
          0.8,
          `Từ tư thế chuẩn bị, gập hông và nghiêng thân trên về phía trước một góc ${Math.round(tilt)}°, hai gối hơi chùng nhẹ.`
        );
      } else {
        const legMin = Math.max(minScore, 0.32);
        const okLeg = (i) => kp[i] && kp[i].score >= legMin;
        const kneeL = okLeg(KP.lKnee) ? kp[KP.lKnee] : null, kneeR = okLeg(KP.rKnee) ? kp[KP.rKnee] : null;
        const legKnee = kneeL && kneeR ? midpoint(kneeL, kneeR) : kneeL || kneeR;
        const raw = legKnee && hip ? postureVote(kp, okLeg, hip, legKnee, torso) : { state: 'standing', conf: 0.72 };
        const posture = this.#stablePosture(tr, raw?.state ?? 'standing', t);
        if (posture === 'sitting') {
          mainPosture = 'sitting';
          addCore('sitting', raw?.state === 'sitting' ? raw.conf : 0.68);
        } else {
          const speed = this.#speed(tr, t);
          const conf = raw?.state === 'standing' ? raw.conf : 0.72;
          if (speed > 2.8) {
            mainPosture = 'running';
            addCore('running', 0.65 + 0.35 * clamp((speed - 2.8) / 3, 0, 1));
            addAiSubLabel(
              'ai_fast_stride',
              'AI: Chạy nâng gối & đánh tay nhanh',
              'running',
              0.82,
              'Chạy nâng đùi nhịp nhàng kết hợp đánh hai khuỷu tay gập ~90° theo nhịp bước chân.'
            );
          } else if (speed > 0.52) {
            mainPosture = 'walking';
            addCore('walking', 0.6 + 0.35 * clamp((speed - 0.52) / 2.2, 0, 1));
            addAiSubLabel(
              'ai_walk_step',
              'AI: Bước di chuyển phối hợp tay-chân',
              'walking',
              0.78,
              'Bước chân đều đặn, giữ trục cột sống thẳng, hai cánh tay vung tự nhiên dọc thân người.'
            );
          } else {
            mainPosture = 'standing';
            addCore('standing', conf * (0.85 + 0.15 * clamp(1 - speed / 0.52, 0, 1)));
          }
        }
      }
    } else {
      addCore('standing', 0.68);
    }

    // ----- 2. Bật nhảy -----
    if (footY !== null && tilt !== null && tilt < 35 && !has('sitting') && !has('squatting')) {
      const ref = tr.hist.find((h) => t - h.t >= 0.08 && t - h.t <= 0.55 && h.footY != null);
      if (ref) {
        const footLift = (ref.footY - footY) / torso;
        const hipLift = (ref.center.y - center.y) / torso;
        if (footLift > 0.28 && hipLift > 0.18) {
          tr.jumpUntil = t + JUMP_HOLD;
          tr.jumpConf = 0.65 + 0.35 * clamp((footLift - 0.28) / 0.45, 0, 1);
        }
      }
    }
    if (t <= tr.jumpUntil) {
      addCore('jumping', tr.jumpConf || 0.75);
      addAiSubLabel(
        'ai_jump_air',
        'AI: Bật nhảy đẩy mũi chân lên không',
        'jumping',
        0.85,
        'Nhún nhẹ hai gối lấy đà rồi bật mạnh hai bàn chân lên cao, giữ thân thẳng và tiếp đất bằng mũi chân.'
      );
    }

    // ----- 3. Té ngã -----
    let newFall = false;
    if (tilt !== null && tilt > 50 && t - tr.lastFall > FALL_COOLDOWN) {
      const before = tr.hist.find((h) => t - h.t <= FALL_WINDOW && t - h.t > 0.15 && h.tilt !== null && h.tilt < 30);
      if (before) {
        const drop = (center.y - before.center.y) / torso;
        const tiltChange = tilt - before.tilt;
        if (drop > 0.35 || tiltChange > 40) {
          tr.fallUntil = t + FALL_HOLD;
          tr.lastFall = t;
          tr.fallConf = 0.65 + 0.35 * clamp(Math.max(drop, tiltChange / 90), 0, 1);
          newFall = true;
        }
      }
    }
    if (t <= tr.fallUntil) addCore('falling', tr.fallConf);

    // ----- 4. Động tác Tay & Bàn tay (kèm nhãn AI tạo sinh tức thì) -----
    let handDetected = false;
    if (headPt && lw && rw && shoulder) {
      const near = (w) => dist(w, headPt) < torso * 0.58 && w.y < shoulder.y + torso * 0.12;
      if (near(lw) && near(rw)) {
        handDetected = true;
        addCore('hand_action', 0.84);
        addAiSubLabel(
          'ai_hands_on_head',
          'AI: Đưa hai bàn tay lên vùng đầu',
          'hand_action',
          0.85,
          'Nâng đồng thời hai cánh tay, gập khuỷu tay và đặt hai bàn tay chạm nhẹ vào vùng đầu/thái dương.'
        );
      }
    }
    if (!handDetected && shoulder && hip && lw && rw && ok(KP.lElbow) && ok(KP.rElbow)) {
      const inTorso = (w) => w.y > shoulder.y - torso * 0.1 && w.y < hip.y;
      if (dist(lw, kp[KP.rElbow]) < torso * 0.46 && dist(rw, kp[KP.lElbow]) < torso * 0.46 && inTorso(lw) && inTorso(rw)) {
        handDetected = true;
        addCore('hand_action', 0.8);
        addAiSubLabel(
          'ai_arms_crossed',
          'AI: Khoanh hai cánh tay trước ngực',
          'hand_action',
          0.82,
          'Đưa hai cẳng tay bắt chéo trước ngực, bàn tay đặt nhẹ lên khuỷu tay đối diện, giữ hai vai cân bằng.'
        );
      }
    }
    if (!handDetected && lw && rw && shoulder && hip && isClapping(tr.hist, t, shoulder, hip, torso)) {
      handDetected = true;
      addCore('hand_action', 0.82);
      addAiSubLabel(
        'ai_clapping',
        'AI: Vỗ hai bàn tay nhịp nhàng trước ngực',
        'hand_action',
        0.84,
        'Đưa hai bàn tay về phía trước ngực, mở lòng bàn tay và thực hiện động tác vỗ hai bàn tay vào nhau.'
      );
    }
    if (!handDetected) {
      const headY = nose ? nose.y : shoulder ? shoulder.y - 0.42 * torso : null;
      if (headY !== null) {
        const lUp = lw && lw.y < headY;
        const rUp = rw && rw.y < headY;
        const lWave = lw && shoulder && lw.y < shoulder.y && isWaving(tr.hist, 'l', t);
        const rWave = rw && shoulder && rw.y < shoulder.y && isWaving(tr.hist, 'r', t);

        if (lWave || rWave) {
          handDetected = true;
          addCore('hand_action', 0.85);
          addAiSubLabel(
            'ai_waving',
            `AI: Vẫy bàn tay ${lWave && rWave ? 'hai bên' : lWave ? 'trái' : 'phải'} (Xòe 5 ngón)`,
            'hand_action',
            0.86,
            `Nâng bàn tay ${lWave && rWave ? 'hai bên' : lWave ? 'trái' : 'phải'} cao hơn vai, mở rộng 5 ngón tay và lắc cổ tay qua lại.`
          );
        } else if (lUp && rUp) {
          handDetected = true;
          addCore('hand_action', 0.88);
          addAiSubLabel(
            'ai_raise_both_hands',
            `AI: Vươn cao cả hai tay qua đầu (Khuỷu ~${angles?.rElbowAngle || 160}°)`,
            'hand_action',
            0.88,
            'Đưa đồng thời hai cánh tay vươn thẳng lên cao qua đầu, hai lòng bàn tay hướng vào nhau, mở rộng vai.'
          );
        } else if (lUp || rUp) {
          handDetected = true;
          const sideVi = lUp ? 'trái' : 'phải';
          const elDeg = lUp ? (angles?.lElbowAngle || 155) : (angles?.rElbowAngle || 155);
          addCore('hand_action', 0.84);
          addAiSubLabel(
            lUp ? 'ai_raise_left_hand' : 'ai_raise_right_hand',
            `AI: Giơ cao tay ${sideVi} & mở bàn tay (Góc khuỷu ${elDeg}°)`,
            'hand_action',
            0.85,
            `Nâng cánh tay ${sideVi} lên cao qua đầu với góc khuỷu tay khoảng ${elDeg}°, các ngón bàn tay ${sideVi} duỗi mở tự nhiên.`
          );
        }
      }
    }

    // Kiểm tra động tác chống nạnh / dang ngang tay / chỉ tay
    if (!handDetected && hip && shoulder && lw && rw && ok(KP.lElbow) && ok(KP.rElbow) && ok(KP.lHip) && ok(KP.rHip)) {
      const nearHip = (w, h) => dist(w, kp[h]) < torso * 0.36;
      const out = (e, h) => Math.abs(kp[e].x - kp[h].x) > torso * 0.28;
      if (nearHip(lw, KP.lHip) && nearHip(rw, KP.rHip) && out(KP.lElbow, KP.lHip) && out(KP.rElbow, KP.rHip)) {
        handDetected = true;
        addCore('hand_action', 0.78);
        addAiSubLabel(
          'ai_hands_on_hips',
          'AI: Chống hai bàn tay vào hông (Khuỷu mở rộng)',
          'hand_action',
          0.8,
          'Đặt hai bàn tay lên hai bên hông, mở hai khuỷu tay hướng sang ngang, giữ ngực mở và lưng thẳng.'
        );
      }
    }
    if (!handDetected && shoulder) {
      for (const [sideKey, sideVi, s, e, w] of [
        ['left', 'trái', KP.lShoulder, KP.lElbow, KP.lWrist],
        ['right', 'phải', KP.rShoulder, KP.rElbow, KP.rWrist],
      ]) {
        if (!ok(s) || !ok(e) || !ok(w)) continue;
        const ang = jointAngle(kp[s], kp[e], kp[w]);
        const reach = dist(kp[w], kp[s]) / torso;
        const level = (kp[w].y - kp[s].y) / torso;
        if (ang > 146 && reach > 0.82 && level > -0.45 && level < 0.45 && Math.abs(kp[w].x - kp[s].x) > torso * 0.56) {
          handDetected = true;
          addCore('hand_action', 0.8);
          addAiSubLabel(
            `ai_pointing_${sideKey}`,
            `AI: Duỗi thẳng cánh tay & bàn tay ${sideVi} ngang vai (${Math.round(ang)}°)`,
            'hand_action',
            0.82,
            `Nâng cánh tay ${sideVi} ngang tầm vai, duỗi thẳng khuỷu tay (${Math.round(ang)}°) và hướng các đốt ngón bàn tay ${sideVi} sang ngang.`
          );
          break;
        }
      }
    }

    // ----- 5. Chuyển động Khung xương Đầu & Cổ (thay cho biểu cảm khuôn mặt) -----
    if (headSkel && !has('falling')) {
      if (headSkel.pitchDeg > 16) {
        addCore('head_motion', 0.78);
        addAiSubLabel(
          'ai_head_down',
          `AI: Cúi khung xương đầu về trước (${headSkel.pitchDeg}°)`,
          'head_motion',
          0.8,
          `Từ từ gập đốt sống cổ, hạ cằm hướng về phía ngực một góc khoảng ${headSkel.pitchDeg}°, giữ hai vai thả lỏng.`
        );
      } else if (headSkel.pitchDeg < -16) {
        addCore('head_motion', 0.76);
        addAiSubLabel(
          'ai_head_up',
          `AI: Ngửa khung xương đầu lên cao (${Math.abs(headSkel.pitchDeg)}°)`,
          'head_motion',
          0.78,
          `Nâng cằm và ngửa đầu nhẹ lên trên góc khoảng ${Math.abs(headSkel.pitchDeg)}°, mắt nhìn chếch lên.`
        );
      } else if (Math.abs(headSkel.yawDeg) > 22) {
        const dirVi = headSkel.yawDeg > 0 ? 'trái' : 'phải';
        const dirKey = headSkel.yawDeg > 0 ? 'left' : 'right';
        addCore('head_motion', 0.78);
        addAiSubLabel(
          `ai_head_turn_${dirKey}`,
          `AI: Xoay khung xương đầu sang ${dirVi} (${Math.abs(headSkel.yawDeg)}°)`,
          'head_motion',
          0.8,
          `Giữ cố định trục hai vai, xoay cổ đưa đầu hướng sang bên ${dirVi} góc khoảng ${Math.abs(headSkel.yawDeg)}°.`
        );
      } else if (Math.abs(headSkel.rollDeg) > 16) {
        const dirVi = headSkel.rollDeg > 0 ? 'trái' : 'phải';
        const dirKey = headSkel.rollDeg > 0 ? 'left' : 'right';
        addCore('head_motion', 0.76);
        addAiSubLabel(
          `ai_head_tilt_${dirKey}`,
          `AI: Nghiêng khung xương đầu sang ${dirVi} (${Math.abs(headSkel.rollDeg)}°)`,
          'head_motion',
          0.78,
          `Nghiêng nhẹ đầu sang phía vai ${dirVi} một góc khoảng ${Math.abs(headSkel.rollDeg)}° để kéo giãn cơ cổ.`
        );
      }
    }

    // Nếu đang ở tư thế Đứng chuẩn bị và chưa có nhãn AI phụ nào, gắn nhãn tư thế chuẩn
    if (!labels.some((l) => l.isAiGenerated) && mainPosture === 'standing') {
      addAiSubLabel(
        'ai_neutral_stance',
        `AI: Tư thế đứng thẳng chuẩn bị (Thân ${angles?.torsoTilt || 0}°)`,
        'standing',
        0.82,
        'Đứng thẳng tự nhiên, hai chân mở rộng ngang vai, đầu nhìn thẳng, hai cánh tay và bàn tay thả lỏng dọc thân người.'
      );
    }

    // ----- 6. Hành vi đã học từ mô hình KNN/MLP -----
    if (useLearned && feat) {
      const p = predict(feat);
      if (p) {
        labels.push({
          behavior: p.key,
          confidence: p.confidence,
          isCore: false,
          isLearned: true,
          jointDetail,
          instruction: `Thực hiện động tác đã học "${behaviorInfo(p.key).label}".`,
        });
      }
    }

    const handsSkel = computeHandsSkeleton(kp, null, minScore, labels);
    const aiLabelObj = labels.find((l) => l.isAiGenerated);

    return {
      personId: pose.id,
      box,
      labels,
      microAction: aiLabelObj ? behaviorInfo(aiLabelObj.behavior).label.replace(/^AI:\s*/, '') : '',
      jointDetail,
      angles,
      head: headSkel,
      hands: handsSkel,
      newFall,
      keypoints: kp,
      feat,
    };
  }

  #speed(tr, t) {
    const h = tr.hist;
    if (h.length < 2) return tr.speed;
    const now = h[h.length - 1];
    const ref = h.find((e) => t - e.t <= 0.9 && t - e.t >= 0.15);
    if (!ref) return tr.speed;
    const raw = dist(now.center, ref.center) / ((now.torso + ref.torso) / 2) / (now.t - ref.t);
    tr.speed = tr.speed * 0.5 + raw * 0.5;
    return tr.speed;
  }
}

function formatJointSummary(a) {
  if (!a) return '';
  const parts = [];
  parts.push(`Đầu ${a.headPitch >= 0 ? '+' : ''}${a.headPitch}°/${a.headYaw}°`);
  if (a.lElbowAngle != null) parts.push(`Tay T ${a.lElbowAngle}°`);
  if (a.rElbowAngle != null) parts.push(`Tay P ${a.rElbowAngle}°`);
  parts.push(`Thân ${a.torsoTilt}°`);
  if (a.lKneeAngle != null || a.rKneeAngle != null) {
    parts.push(`Gối ${a.lKneeAngle ?? a.rKneeAngle}°`);
  }
  return parts.join(' · ');
}

function defaultInstructionFor(behavior, a) {
  const map = {
    standing: 'Đứng thẳng, hai bàn chân đặt vững rộng bằng vai, khung xương đầu giữ thẳng trục cột sống.',
    walking: 'Bước chân nhịp nhàng về phía trước, giữ lưng thẳng và đánh nhẹ hai cánh tay.',
    running: 'Chạy nâng cao đùi, gập khuỷu tay ~90° đánh theo nhịp bước chân.',
    sitting: 'Hạ hông ngồi ổn định, giữ lưng thẳng và vai thả lỏng.',
    squatting: `Gập hai khớp gối xuống khoảng ${a?.lKneeAngle || 95}°, đẩy hông ra sau và giữ thẳng lưng.`,
    bending: `Gập thân trên từ khớp hông góc khoảng ${a?.torsoTilt || 35}°, đầu thẳng theo trục lưng.`,
    jumping: 'Chùng gối lấy đà và bật nhảy thẳng lên cao bằng lực hai chân.',
    hand_action: 'Thực hiện chuyển động cánh tay và mở/chuyển động các đốt ngón bàn tay theo hướng dẫn.',
    head_motion: 'Di chuyển khớp cổ và đầu chậm rãi theo biên độ góc hướng dẫn, giữ cố định hai vai.',
    falling: 'Cảnh báo mất thăng bằng hoặc té ngã.',
  };
  return map[behavior] || 'Thực hiện động tác theo khung xương mẫu trên màn hình.';
}

function boundingBox(points) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of points) {
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function postureVote(kp, okLeg, hip, knee, torso) {
  const thigh = (knee.y - hip.y) / torso;
  const side = Math.abs(knee.x - hip.x) > Math.abs(knee.y - hip.y) * 1.1;
  let kneeAng = null;
  for (const [h, k, a] of [[KP.lHip, KP.lKnee, KP.lAnkle], [KP.rHip, KP.rKnee, KP.rAnkle]]) {
    if (okLeg(h) && okLeg(k) && okLeg(a)) {
      const ang = jointAngle(kp[h], kp[k], kp[a]);
      kneeAng = kneeAng === null ? ang : Math.min(kneeAng, ang);
    }
  }
  if (side || thigh < 0.55) return { state: 'sitting', conf: 0.65 + 0.3 * clamp((0.55 - Math.max(thigh, 0)) / 0.45, 0, 1) };
  if (kneeAng !== null && kneeAng < 135 && thigh < 0.8) return { state: 'sitting', conf: 0.65 + 0.3 * clamp((135 - kneeAng) / 45, 0, 1) };
  if (thigh >= 0.68 && (kneeAng === null || kneeAng > 148)) return { state: 'standing', conf: kneeAng === null ? 0.72 : 0.86 };
  return { state: null, conf: 0 };
}

function squatScore(kp, ok, hip, ankle, torso) {
  if (!hip || !ankle) return 0;
  const hipToAnkle = (ankle.y - hip.y) / torso;
  let knee = null;
  for (const [h, k, a] of [[KP.lHip, KP.lKnee, KP.lAnkle], [KP.rHip, KP.rKnee, KP.rAnkle]]) {
    if (ok(h) && ok(k) && ok(a)) {
      const ang = jointAngle(kp[h], kp[k], kp[a]);
      knee = knee === null ? ang : Math.min(knee, ang);
    }
  }
  if (knee === null || hipToAnkle > 0.92 || knee > 115) return 0;
  return 0.65 + 0.32 * clamp((115 - knee) / 60, 0, 1);
}

function isWaving(hist, side, t) {
  const pts = hist
    .filter((h) => t - h.t <= 1.4 && h[side + 'w'] && h.shoulderX != null && h[side + 'w'].y < h.shoulderY)
    .map((h) => (h[side + 'w'].x - h.shoulderX) / h.torso);
  if (pts.length < 3) return false;
  const recent = hist.filter((h) => t - h.t <= 1.4 && h[side + 'w'] && h[side + 'w'].y < h.shoulderY);
  if (recent.at(-1).t - recent[0].t < 0.35) return false;
  let reversals = 0, dir = 0, anchor = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i] - anchor;
    if (Math.abs(d) < 0.14) continue;
    const nd = Math.sign(d);
    if (dir !== 0 && nd !== dir) reversals++;
    dir = nd;
    anchor = pts[i];
  }
  return reversals >= 2;
}

function isClapping(hist, t, shoulder, hip, torso) {
  const d = hist
    .filter((h) => t - h.t <= 1.4 && h.lw && h.rw)
    .filter((h) => h.lw.y > shoulder.y - torso * 0.4 && h.lw.y < hip.y + torso * 0.2)
    .map((h) => dist(h.lw, h.rw) / h.torso);
  if (d.length < 3) return false;
  let closes = 0, state = null;
  for (const v of d) {
    if (v < 0.32 && state !== 'close') { if (state === 'open') closes++; state = 'close'; }
    else if (v > 0.52) state = 'open';
  }
  return closes >= 2;
}

// =========================================================
// SegmentBuilder — Gộp nhãn theo khung với độ chính xác Mili-giây (ms)
// Phát sự kiện tức thì (onSegment / onLiveUpdate) ngay trong lúc phân tích
// =========================================================
export class SegmentBuilder {
  constructor(source, step, onSegment) {
    this.source = source;
    this.step = step;
    this.onSegment = onSegment;
    this.open = new Map();
    this.done = [];
  }

  push(t, results) {
    const baseGap = store.settings.mergeGap ?? 0.25;
    const seen = new Set();
    for (const r of results || []) {
      for (const l of r.labels || []) {
        const key = `${r.personId}|${l.behavior}`;
        seen.add(key);
        const seg = this.open.get(key);
        if (seg && t - seg.end <= baseGap + 1e-6) {
          seg.end = t;
          seg.confSum += l.confidence;
          seg.n++;
          if (l.jointDetail) seg.jointDetail = l.jointDetail;
          if (l.instruction) seg.instruction = l.instruction;
          if (r.keypoints && seg.n === Math.ceil(seg.n / 2)) {
            seg.keyframeKp = r.keypoints.map((k) => ({ x: round(k.x, 1), y: round(k.y, 1), score: round(k.score, 2) }));
          }
        } else {
          if (seg) this.#close(key);
          this.open.set(key, {
            personId: r.personId,
            behavior: l.behavior,
            parentBehavior: l.parentBehavior || (CORE_BEHAVIORS[l.behavior] ? l.behavior : 'standing'),
            isAiGenerated: !!l.isAiGenerated,
            jointDetail: l.jointDetail || r.jointDetail || '',
            instruction: l.instruction || '',
            start: t,
            end: t,
            confSum: l.confidence,
            n: 1,
            keyframeKp: r.keypoints ? r.keypoints.map((k) => ({ x: round(k.x, 1), y: round(k.y, 1), score: round(k.score, 2) })) : null,
          });
        }
      }
    }
    for (const [key, seg] of this.open) {
      if (!seen.has(key) && t - seg.end > baseGap) this.#close(key);
    }
  }

  #close(key) {
    const seg = this.open.get(key);
    this.open.delete(key);
    if (!seg) return;
    const end = seg.end + this.step;
    const isAlert = BEHAVIORS[seg.behavior]?.alert;
    const minSeg = Math.min(store.settings.minSegment ?? 0.2, 0.25);
    if (end - seg.start < minSeg && !isAlert) return;
    const startSec = round(seg.start, 3);
    const endSec = round(end, 3);
    const out = {
      personId: seg.personId,
      behavior: seg.behavior,
      parentBehavior: seg.parentBehavior,
      isAiGenerated: seg.isAiGenerated,
      jointDetail: seg.jointDetail,
      jointAngles: seg.jointDetail,
      instruction: seg.instruction,
      stepHint: seg.instruction,
      start: startSec,
      end: endSec,
      startMs: Math.round(startSec * 1000),
      endMs: Math.round(endSec * 1000),
      durationMs: Math.max(1, Math.round((endSec - startSec) * 1000)),
      confidence: round(seg.confSum / seg.n, 3),
      source: this.source,
      keyframeKp: seg.keyframeKp || null,
    };
    this.done.push(out);
    this.onSegment?.(out);
  }

  /** Lấy cả các đoạn đã đóng lẫn các đoạn đang mở (để hiển thị tức thì trên bảng khi đang phân tích) */
  snapshotLive() {
    const active = [];
    for (const seg of this.open.values()) {
      const startSec = round(seg.start, 3);
      const endSec = round(seg.end + this.step, 3);
      active.push({
        personId: seg.personId,
        behavior: seg.behavior,
        parentBehavior: seg.parentBehavior,
        isAiGenerated: seg.isAiGenerated,
        jointDetail: seg.jointDetail,
        jointAngles: seg.jointDetail,
        instruction: seg.instruction,
        stepHint: seg.instruction,
        start: startSec,
        end: endSec,
        startMs: Math.round(startSec * 1000),
        endMs: Math.round(endSec * 1000),
        durationMs: Math.max(1, Math.round((endSec - startSec) * 1000)),
        confidence: round(seg.confSum / seg.n, 3),
        source: this.source,
        keyframeKp: seg.keyframeKp || null,
      });
    }
    return [...this.done, ...active].sort((a, b) => a.start - b.start);
  }

  finalize() {
    for (const key of [...this.open.keys()]) this.#close(key);
    return this.done;
  }
}

/**
 * Tổng hợp các bước hướng dẫn động tác (Steps) và đặt tên nháp tự động
 * cho gói dữ liệu phân tích sau khi phân tích xong.
 */
export function buildActionStepsAndDraftName(segments, frames = [], mediaName = '') {
  const sorted = [...(segments || [])].sort((a, b) => a.start - b.start);
  // Ưu tiên các nhãn hành động cụ thể do AI tạo sinh để tạo chuỗi bước hướng dẫn
  const aiSegs = sorted.filter((s) => s.isAiGenerated || behaviorInfo(s.behavior).isAiGenerated);
  const sourceSegs = aiSegs.length ? aiSegs : sorted;

  const steps = [];
  for (const s of sourceSegs) {
    const label = behaviorInfo(s.behavior).label.replace(/^AI:\s*/, '');
    const prev = steps[steps.length - 1];
    if (prev && prev.behavior === s.behavior && s.start - prev.end <= 0.8) {
      prev.end = s.end;
      prev.endMs = Math.round(s.end * 1000);
      continue;
    }
    // Tìm khung xương gần giữa đoạn nhất nếu segment chưa gắn keyframeKp
    let kp = s.keyframeKp;
    if (!kp && frames.length) {
      const midT = (s.start + s.end) / 2;
      let bestF = frames[0];
      let bestD = Infinity;
      for (const f of frames) {
        const d = Math.abs(f.t - midT);
        if (d < bestD) { bestD = d; bestF = f; }
      }
      const p = bestF?.persons?.find((x) => x.id === s.personId) || bestF?.persons?.[0];
      if (p?.kp) kp = p.kp.map(([x, y, score]) => ({ x, y, score }));
    }
    const inst = s.instruction || behaviorInfo(s.behavior).instruction || `Thực hiện: ${label}`;
    const jDetail = s.jointDetail || s.jointAngles || '';
    steps.push({
      stepNumber: steps.length + 1,
      behavior: s.behavior,
      label,
      title: label,
      instruction: inst,
      description: inst,
      jointDetail: jDetail,
      jointAngles: jDetail,
      start: s.start,
      end: s.end,
      startMs: s.startMs ?? Math.round(s.start * 1000),
      endMs: s.endMs ?? Math.round(s.end * 1000),
      keypoints: kp || defaultStandingKeypoints(steps.length % 3),
    });
    if (steps.length >= 12) break;
  }

  // Đặt tên nháp thông minh từ chuỗi động tác chính
  const distinctLabels = [];
  for (const st of steps) {
    const short = st.label.replace(/\s*\([^)]*\)/g, '').trim();
    if (!distinctLabels.includes(short) && !/đứng thẳng chuẩn bị/i.test(short)) {
      distinctLabels.push(short);
    }
    if (distinctLabels.length >= 3) break;
  }
  const cleanMedia = String(mediaName || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const actionSummary = distinctLabels.length
    ? distinctLabels.join(' → ')
    : (steps[0]?.label.replace(/\s*\([^)]*\)/g, '') || 'Phân tích chuyển động cơ thể');
  const draftName = cleanMedia && !/^video/i.test(cleanMedia)
    ? `${cleanMedia} — ${actionSummary}`
    : `Chuỗi động tác: ${actionSummary}`;

  return { draftName, steps };
}

/** Khung xương chuẩn mặc định (dùng khi tạo tư thế mẫu) */
export function defaultStandingKeypoints(variant = 'neutral') {
  const v = variant === 1 ? 'arms_side' : variant === 2 ? 'arms_up' : variant === 3 ? 'squat' : variant;
  const base = [
    { x: 320, y: 74, score: 0.98 },  // 0: nose
    { x: 330, y: 66, score: 0.96 },  // 1: lEye
    { x: 310, y: 66, score: 0.96 },  // 2: rEye
    { x: 342, y: 72, score: 0.94 },  // 3: lEar
    { x: 298, y: 72, score: 0.94 },  // 4: rEar
    { x: 368, y: 122, score: 0.98 }, // 5: lShoulder
    { x: 272, y: 122, score: 0.98 }, // 6: rShoulder
    { x: 386, y: 184, score: 0.95 }, // 7: lElbow
    { x: 254, y: 184, score: 0.95 }, // 8: rElbow
    { x: 392, y: 242, score: 0.94 }, // 9: lWrist
    { x: 248, y: 242, score: 0.94 }, // 10: rWrist
    { x: 348, y: 232, score: 0.97 }, // 11: lHip
    { x: 292, y: 232, score: 0.97 }, // 12: rHip
    { x: 352, y: 310, score: 0.95 }, // 13: lKnee
    { x: 288, y: 310, score: 0.95 }, // 14: rKnee
    { x: 354, y: 382, score: 0.94 }, // 15: lAnkle
    { x: 286, y: 382, score: 0.94 }, // 16: rAnkle
  ];
  if (v === 'arms_up') {
    base[7] = { x: 382, y: 78, score: 0.96 };
    base[8] = { x: 258, y: 78, score: 0.96 };
    base[9] = { x: 372, y: 28, score: 0.96 };
    base[10] = { x: 268, y: 28, score: 0.96 };
  } else if (v === 'arms_side') {
    base[7] = { x: 424, y: 122, score: 0.96 };
    base[8] = { x: 216, y: 122, score: 0.96 };
    base[9] = { x: 478, y: 120, score: 0.96 };
    base[10] = { x: 162, y: 120, score: 0.96 };
  } else if (v === 'squat') {
    base[0].y += 38; base[1].y += 38; base[2].y += 38; base[3].y += 38; base[4].y += 38;
    base[5].y += 40; base[6].y += 40;
    base[7] = { x: 392, y: 198, score: 0.96 };
    base[8] = { x: 248, y: 198, score: 0.96 };
    base[9] = { x: 374, y: 218, score: 0.96 };
    base[10] = { x: 266, y: 218, score: 0.96 };
    base[11] = { x: 356, y: 278, score: 0.97 };
    base[12] = { x: 284, y: 278, score: 0.97 };
    base[13] = { x: 376, y: 325, score: 0.96 };
    base[14] = { x: 264, y: 325, score: 0.96 };
  } else if (v === 'head_turn_right') {
    base[0] = { x: 304, y: 74, score: 0.98 };
    base[1] = { x: 316, y: 66, score: 0.96 };
    base[2] = { x: 296, y: 66, score: 0.96 };
    base[8] = { x: 230, y: 122, score: 0.96 };
    base[10] = { x: 175, y: 118, score: 0.96 };
  }
  return base;
}
