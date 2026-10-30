/* =========================================================
 * workers/train-worker.js — LUỒNG PHỤ huấn luyện & phân cụm
 *
 * Viết thuần JavaScript (không cần TensorFlow) để:
 *   - không tranh GPU với luồng suy luận MoveNet
 *   - chạy được cả trên máy yếu / không có GPU
 *
 *  'train'  : mạng nơ-ron 1 lớp ẩn (MLP) + Adam, dừng sớm theo tập kiểm định
 *  'kmeans' : k-means++ tự chọn số cụm bằng hệ số silhouette
 * ========================================================= */
'use strict';

var STD_FLOOR = 0.1;

self.onmessage = function (e) {
  var m = e.data;
  try {
    if (m.type === 'train') train(m);
    else if (m.type === 'kmeans') kmeans(m);
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};

// ---------- Tiện ích ----------
function rng(seed) {                       // bộ sinh số ngẫu nhiên có hạt giống (kết quả lặp lại được)
  var s = seed >>> 0 || 1;
  return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

function standardize(X, n, d) {
  var mean = new Float32Array(d), std = new Float32Array(d), i, j;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) mean[j] += X[i * d + j];
  for (j = 0; j < d; j++) mean[j] /= n;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) { var v = X[i * d + j] - mean[j]; std[j] += v * v; }
  // Sàn độ lệch chuẩn: đặc trưng gần như hằng số (vd. khớp không nhúc nhích) nếu chia
  // cho std rất nhỏ sẽ khuếch đại nhiễu → k-means/KNN bị nhiễu chi phối.
  for (j = 0; j < d; j++) std[j] = Math.max(Math.sqrt(std[j] / n), STD_FLOOR);
  var Z = new Float32Array(n * d);
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) Z[i * d + j] = (X[i * d + j] - mean[j]) / std[j];
  return { Z: Z, mean: mean, std: std };
}

function dist2(A, a, B, b, d) {
  var s = 0;
  for (var j = 0; j < d; j++) { var t = A[a * d + j] - B[b * d + j]; s += t * t; }
  return s;
}

// =========================================================
// MLP
// =========================================================
function train(m) {
  var X = m.X, y = m.y, n = m.n, d = m.d, C = m.classes;
  var opts = m.opts || {};
  var H = opts.hidden || 64, epochs = opts.epochs || 80, lr = opts.lr || 0.003, l2 = 1e-4, batch = 32;
  var r = rng(42);

  var st = standardize(X, n, d);
  var Z = st.Z;

  // Chia train/validation phân tầng 80/20
  var idx = [], val = [], i, j, k, c;
  var byClass = [];
  for (c = 0; c < C; c++) byClass.push([]);
  for (i = 0; i < n; i++) byClass[y[i]].push(i);
  byClass.forEach(function (arr) {
    for (var q = arr.length - 1; q > 0; q--) { var w = Math.floor(r() * (q + 1)); var tmp = arr[q]; arr[q] = arr[w]; arr[w] = tmp; }
    var nv = arr.length >= 5 ? Math.max(1, Math.floor(arr.length * 0.2)) : 0;
    for (var p = 0; p < arr.length; p++) (p < nv ? val : idx).push(arr[p]);
  });

  // Trọng số lớp để cân bằng dữ liệu lệch
  var cw = new Float32Array(C);
  for (c = 0; c < C; c++) cw[c] = byClass[c].length ? n / (C * byClass[c].length) : 0;

  // Khởi tạo He
  var W1 = new Float32Array(d * H), b1 = new Float32Array(H), W2 = new Float32Array(H * C), b2 = new Float32Array(C);
  for (i = 0; i < W1.length; i++) W1[i] = gauss(r) * Math.sqrt(2 / d);
  for (i = 0; i < W2.length; i++) W2[i] = gauss(r) * Math.sqrt(2 / H);
  var params = [W1, b1, W2, b2];
  var mom = params.map(function (p) { return new Float32Array(p.length); });
  var vel = params.map(function (p) { return new Float32Array(p.length); });
  var grads = params.map(function (p) { return new Float32Array(p.length); });
  var step = 0, b1a = 0.9, b2a = 0.999;

  var h = new Float32Array(H), o = new Float32Array(C), dh = new Float32Array(H), dout = new Float32Array(C);

  function forward(row) {
    for (k = 0; k < H; k++) {
      var s = b1[k];
      for (j = 0; j < d; j++) s += Z[row * d + j] * W1[j * H + k];
      h[k] = s > 0 ? s : 0;
    }
    var mx = -Infinity;
    for (c = 0; c < C; c++) {
      var s2 = b2[c];
      for (k = 0; k < H; k++) s2 += h[k] * W2[k * C + c];
      o[c] = s2; if (s2 > mx) mx = s2;
    }
    var sum = 0;
    for (c = 0; c < C; c++) { o[c] = Math.exp(o[c] - mx); sum += o[c]; }
    for (c = 0; c < C; c++) o[c] /= sum;
  }
  function argmax() { var b = 0; for (c = 1; c < C; c++) if (o[c] > o[b]) b = c; return b; }
  function accuracy(set) {
    if (!set.length) return null;
    var ok = 0;
    for (var q = 0; q < set.length; q++) { forward(set[q]); if (argmax() === y[set[q]]) ok++; }
    return ok / set.length;
  }

  var best = { valAcc: -1, params: null, epoch: 0 };
  var patience = 15, sinceBest = 0;

  for (var ep = 1; ep <= epochs; ep++) {
    for (var q = idx.length - 1; q > 0; q--) { var w = Math.floor(r() * (q + 1)); var tmp = idx[q]; idx[q] = idx[w]; idx[w] = tmp; }
    var lossSum = 0;
    for (var bstart = 0; bstart < idx.length; bstart += batch) {
      var bend = Math.min(idx.length, bstart + batch);
      grads.forEach(function (g) { g.fill(0); });
      for (var bi = bstart; bi < bend; bi++) {
        var row = idx[bi], t = y[row];
        forward(row);
        lossSum += -Math.log(o[t] + 1e-9) * cw[t];
        for (c = 0; c < C; c++) dout[c] = (o[c] - (c === t ? 1 : 0)) * cw[t];
        for (k = 0; k < H; k++) {
          var acc = 0;
          for (c = 0; c < C; c++) { grads[2][k * C + c] += h[k] * dout[c]; acc += W2[k * C + c] * dout[c]; }
          dh[k] = h[k] > 0 ? acc : 0;
        }
        for (c = 0; c < C; c++) grads[3][c] += dout[c];
        for (j = 0; j < d; j++) {
          var z = Z[row * d + j];
          if (z === 0) continue;
          for (k = 0; k < H; k++) grads[0][j * H + k] += z * dh[k];
        }
        for (k = 0; k < H; k++) grads[1][k] += dh[k];
      }
      // Cập nhật Adam
      step++;
      var bs = bend - bstart;
      for (var pi = 0; pi < 4; pi++) {
        var P = params[pi], G = grads[pi], M = mom[pi], V = vel[pi];
        var decay = pi % 2 === 0 ? l2 : 0;
        for (var u = 0; u < P.length; u++) {
          var g = G[u] / bs + decay * P[u];
          M[u] = b1a * M[u] + (1 - b1a) * g;
          V[u] = b2a * V[u] + (1 - b2a) * g * g;
          var mh = M[u] / (1 - Math.pow(b1a, step)), vh = V[u] / (1 - Math.pow(b2a, step));
          P[u] -= lr * mh / (Math.sqrt(vh) + 1e-8);
        }
      }
    }
    var trainAcc = accuracy(idx);
    var valAcc = accuracy(val);
    var score = valAcc != null ? valAcc : trainAcc;
    if (score > best.valAcc + 1e-6) {
      best = { valAcc: score, epoch: ep, params: params.map(function (p) { return new Float32Array(p); }) };
      sinceBest = 0;
    } else if (++sinceBest > patience && ep > 20) {
      self.postMessage({ type: 'progress', epoch: ep, epochs: epochs, loss: lossSum / idx.length, acc: trainAcc, valAcc: valAcc, stopped: true });
      break;
    }
    self.postMessage({ type: 'progress', epoch: ep, epochs: epochs, loss: lossSum / idx.length, acc: trainAcc, valAcc: valAcc });
  }

  // Bán kính "đã biết": khoảng cách tới láng giềng cùng lớp gần nhất (phân vị 95) —
  // dùng để từ chối mẫu lạ (open-set) thay vì ép vào 1 lớp đã học.
  var radius = new Float32Array(C);
  for (c = 0; c < C; c++) {
    var arr = byClass[c].slice(0, 400);
    var ds = [];
    for (var a = 0; a < arr.length; a++) {
      var bestD = Infinity;
      for (var b = 0; b < arr.length; b++) if (a !== b) { var dd = dist2(Z, arr[a], Z, arr[b], d); if (dd < bestD) bestD = dd; }
      if (bestD < Infinity) ds.push(Math.sqrt(bestD));
    }
    ds.sort(function (p1, p2) { return p1 - p2; });
    radius[c] = ds.length ? ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.95))] * 1.8 + 0.5 : 6;
  }

  var bp = best.params || params;
  self.postMessage({
    type: 'trained',
    model: {
      type: 'mlp', d: d, hidden: H, classes: C,
      mean: st.mean, std: st.std,
      W1: bp[0], b1: bp[1], W2: bp[2], b2: bp[3],
      radius: radius,
      trainAcc: accuracy(idx), valAcc: best.valAcc, bestEpoch: best.epoch,
      nTrain: idx.length, nVal: val.length,
    },
  });
}

// =========================================================
// k-means++ với tự chọn k
// =========================================================
function kmeans(m) {
  var X = m.X, n = m.n, d = m.d;
  var st = standardize(X, n, d);
  var Z = st.Z;
  var r = rng(7);
  var kList = [];
  if (m.k) kList = [m.k];
  else for (var kk = 2; kk <= Math.min(m.kMax || 8, Math.max(2, Math.floor(n / 15))); kk++) kList.push(kk);

  var best = null;
  kList.forEach(function (k, idx) {
    self.postMessage({ type: 'progress', text: 'Thử ' + k + ' cụm', ratio: idx / kList.length });
    var res = runKMeans(Z, n, d, k, r);
    res.score = silhouette(Z, n, d, res, r);
    if (!best || res.score > best.score) best = res;
  });

  self.postMessage({ type: 'clusters', k: best.k, assign: best.assign, dist: best.dist, score: best.score });
}

function runKMeans(Z, n, d, k, r) {
  var cent = new Float32Array(k * d), i, j, c;
  // k-means++ khởi tạo
  var first = Math.floor(r() * n);
  for (j = 0; j < d; j++) cent[j] = Z[first * d + j];
  var D = new Float64Array(n).fill(Infinity);
  for (c = 1; c < k; c++) {
    var sum = 0;
    for (i = 0; i < n; i++) { var dd = dist2(Z, i, cent, c - 1, d); if (dd < D[i]) D[i] = dd; sum += D[i]; }
    var target = r() * sum, pick = 0;
    for (i = 0; i < n; i++) { target -= D[i]; if (target <= 0) { pick = i; break; } }
    for (j = 0; j < d; j++) cent[c * d + j] = Z[pick * d + j];
  }
  var assign = new Int32Array(n), dist = new Float32Array(n);
  for (var it = 0; it < 40; it++) {
    var changed = 0;
    for (i = 0; i < n; i++) {
      var bc = 0, bd = Infinity;
      for (c = 0; c < k; c++) { var d2 = dist2(Z, i, cent, c, d); if (d2 < bd) { bd = d2; bc = c; } }
      if (assign[i] !== bc) changed++;
      assign[i] = bc; dist[i] = Math.sqrt(bd);
    }
    var cnt = new Int32Array(k);
    cent.fill(0);
    for (i = 0; i < n; i++) { cnt[assign[i]]++; for (j = 0; j < d; j++) cent[assign[i] * d + j] += Z[i * d + j]; }
    for (c = 0; c < k; c++) if (cnt[c]) for (j = 0; j < d; j++) cent[c * d + j] /= cnt[c];
    if (!changed && it > 0) break;
  }
  return { k: k, assign: assign, dist: dist, cent: cent };
}

function silhouette(Z, n, d, res, r) {
  // Silhouette rút gọn (theo tâm cụm) trên tối đa 800 điểm — O(n·k)
  var m = Math.min(n, 800), total = 0;
  for (var s = 0; s < m; s++) {
    var i = n <= 800 ? s : Math.floor(r() * n);
    var a = Math.sqrt(dist2(Z, i, res.cent, res.assign[i], d));
    var b = Infinity;
    for (var c = 0; c < res.k; c++) if (c !== res.assign[i]) b = Math.min(b, Math.sqrt(dist2(Z, i, res.cent, c, d)));
    total += (b - a) / Math.max(a, b, 1e-9);
  }
  return total / m;
}
