/* =========================================================
 * core/model-core.js — Lõi AI dùng chung cho LUỒNG CHÍNH và WEB WORKER (v3.0)
 *
 *  • Đã loại bỏ hoàn toàn các mô hình khuôn mặt & biểu cảm (BlazeFace, FER, FaceRes)
 *    để dồn 100% tài nguyên tính toán cho Khung xương Cơ thể, Đầu-Cổ và Bàn tay.
 *  • Chọn backend tính toán: WebGPU → WebGL → WASM → CPU (có dự phòng)
 *  • Tải mô hình MoveNet (MultiPose Lightning / SinglePose Thunder)
 *  • detect(): chạy suy luận tốc độ cao tới mili-giây, giải phóng tensor ngay sau đó
 * ========================================================= */
(function (G) {
  'use strict';

  var IS_WORKER = typeof WorkerGlobalScope !== 'undefined' && G instanceof WorkerGlobalScope;
  var CDN = 'https://cdn.jsdelivr.net/npm/';
  var TF_VER = '4.22.0';

  var LIBS = {
    tf:     { file: 'tf.min.js',                cdn: CDN + '@tensorflow/tfjs@' + TF_VER + '/dist/tf.min.js', ok: function () { return !!G.tf; } },
    wasm:   { file: 'tf-backend-wasm.min.js',   cdn: CDN + '@tensorflow/tfjs-backend-wasm@' + TF_VER + '/dist/tf-backend-wasm.min.js', ok: function () { return !!(G.tf && G.tf.wasm); } },
    webgpu: { file: 'tf-backend-webgpu.min.js', cdn: CDN + '@tensorflow/tfjs-backend-webgpu@' + TF_VER + '/dist/tf-backend-webgpu.min.js', ok: function () { return !!(G.tf && G.tf.findBackendFactory && G.tf.findBackendFactory('webgpu')); } },
    pose:   { file: 'pose-detection.min.js',    cdn: CDN + '@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js', ok: function () { return !!G.poseDetection; } },
    coco:   { file: 'coco-ssd.min.js',          cdn: CDN + '@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js', ok: function () { return !!G.cocoSsd; } },
  };

  var MIRRORS = [
    'https://vladmandic.github.io/human-models/models/',
    'https://raw.githubusercontent.com/vladmandic/human-models/main/models/',
  ];
  function mirrors(file) { return MIRRORS.map(function (m) { return m + file; }); }
  var MODEL_SOURCES = {
    multipose: ['local:movenet-multipose.json'].concat(mirrors('movenet-multipose.json'), [null]),
    thunder:   ['local:movenet-thunder.json'].concat(mirrors('movenet-thunder.json'), [null]),
    coco:      ['local:coco-ssd/model.json', null],
  };

  var baseUrl = '';
  var offline = null;
  var poseDetector = null;
  var objectModel = null;
  var poseKey = '';
  var backendReady = false;
  var backendOrderKey = '';
  var warmedPoseKey = '';
  var currentPoseDim = 0;
  var backendErrors = [];
  var status = function () {};

  function abs(path) { return new URL(path, baseUrl || G.location.href).href; }

  function loadScript(url) {
    if (IS_WORKER) {
      G.importScripts(url);
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Không tải được ' + url)); };
      document.head.appendChild(s);
    });
  }

  async function checkOffline() {
    if (offline !== null) return offline;
    try {
      var r = await fetch(abs('vendor/manifest.json'), { cache: 'no-cache' });
      offline = r.ok ? await r.json() : false;
    } catch (e) { offline = false; }
    return offline;
  }

  async function loadLib(name) {
    var lib = LIBS[name];
    if (lib.ok()) return 'loaded';
    var off = await checkOffline();
    if (off && off.libs && off.libs.indexOf(lib.file) >= 0) {
      try { await loadScript(abs('vendor/' + lib.file)); if (lib.ok()) return 'offline'; } catch (e) { /* thử CDN */ }
    }
    await loadScript(lib.cdn);
    if (!lib.ok()) throw new Error('Thư viện ' + name + ' không khởi tạo được');
    return 'cdn';
  }

  async function initBackend(order) {
    await loadLib('tf');
    var errors = [];
    for (var i = 0; i < order.length; i++) {
      var b = order[i];
      try {
        if (b === 'webgpu') {
          if (!G.navigator || !G.navigator.gpu) { errors.push('webgpu: không hỗ trợ'); continue; }
          await loadLib('webgpu');
        }
        if (b === 'wasm') {
          await loadLib('wasm');
          var off = await checkOffline();
          G.tf.wasm.setWasmPaths(off && off.libs && off.libs.indexOf('tfjs-backend-wasm.wasm') >= 0
            ? abs('vendor/')
            : CDN + '@tensorflow/tfjs-backend-wasm@' + TF_VER + '/dist/');
        }
        if (b === 'webgl' && IS_WORKER && typeof OffscreenCanvas === 'undefined') {
          errors.push('webgl: worker không có OffscreenCanvas'); continue;
        }
        status('Khởi tạo backend ' + b + '…');
        var ok = await G.tf.setBackend(b);
        if (ok) {
          backendErrors = errors;
          await G.tf.ready();
          var t = G.tf.tidy(function () { return G.tf.ones([8, 8]).matMul(G.tf.ones([8, 8])).sum(); });
          await t.data();
          t.dispose();
          return b;
        }
        errors.push(b + ': setBackend trả về false');
      } catch (e) {
        errors.push(b + ': ' + e.message);
      }
    }
    throw new Error('Không backend nào chạy được — ' + errors.join('; '));
  }

  async function resolveSource(src) {
    if (src === null) return null;
    if (src.indexOf('local:') === 0) {
      var off = await checkOffline();
      var name = src.slice(6);
      if (!off || !off.models || off.models.indexOf(name) < 0) return undefined;
      return abs('models/' + name);
    }
    return src;
  }

  async function loadPose(modelType, poseDim, maxPoses) {
    var key = modelType;
    if (poseDetector && poseKey === key) { setPoseDimension(poseDim); return; }
    if (poseDetector) { try { poseDetector.dispose(); } catch (e) {} poseDetector = null; }
    await loadLib('pose');
    var pd = G.poseDetection;
    var sources = MODEL_SOURCES[modelType] || MODEL_SOURCES.multipose;
    var lastErr = null;
    for (var i = 0; i < sources.length; i++) {
      var url = await resolveSource(sources[i]);
      if (url === undefined) continue;
      var cfg = modelType === 'thunder'
        ? { modelType: pd.movenet.modelType.SINGLEPOSE_THUNDER }
        : {
            modelType: pd.movenet.modelType.MULTIPOSE_LIGHTNING,
            enableTracking: true,
            trackerType: pd.TrackerType.BoundingBox,
            multiPoseMaxDimension: poseDim || 256,
          };
      if (url) cfg.modelUrl = url;
      try {
        var where = sources[i] === null ? 'tfhub.dev' : sources[i].indexOf('local:') === 0 ? 'bản offline' : 'nguồn dự phòng';
        status('Tải mô hình khung xương MoveNet (' + where + ')…');
        poseDetector = await pd.createDetector(pd.SupportedModels.MoveNet, cfg);
        poseKey = key;
        currentPoseDim = modelType === 'thunder' ? 256 : (poseDim || 256);
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error('Không tải được trọng số MoveNet từ mọi nguồn (' + (lastErr && lastErr.message) + ')');
  }

  function setPoseDimension(value) {
    if (poseKey !== 'multipose' || !Number.isFinite(value) || !poseDetector) return;
    var dimension = Math.max(128, Math.min(512, Math.round(value / 32) * 32));
    if (typeof poseDetector.multiPoseMaxDimension !== 'number') return;
    poseDetector.multiPoseMaxDimension = dimension;
    currentPoseDim = dimension;
  }

  async function loadObjects() {
    if (objectModel) return true;
    try {
      await loadLib('coco');
      var sources = MODEL_SOURCES.coco;
      for (var i = 0; i < sources.length; i++) {
        var url = await resolveSource(sources[i]);
        if (url === undefined) continue;
        try {
          status('Tải COCO-SSD…');
          objectModel = await G.cocoSsd.load(url ? { base: 'lite_mobilenet_v2', modelUrl: url } : { base: 'lite_mobilenet_v2' });
          return true;
        } catch (e) { /* thử nguồn tiếp */ }
      }
    } catch (e) { /* bỏ qua */ }
    return false;
  }

  var ModelCore = {
    configure: function (opts) {
      if (opts.baseUrl) baseUrl = opts.baseUrl;
      if (opts.onStatus) status = opts.onStatus;
    },

    init: async function (opts) {
      if (opts.role === 'pose') {
        if (objectModel) objectModel.dispose();
        objectModel = null;
      }
      if (opts.role === 'auxiliary' && poseDetector) {
        poseDetector.dispose();
        poseDetector = null;
        poseKey = '';
        warmedPoseKey = '';
      }
      var orderKey = JSON.stringify(opts.backendOrder || ['webgl', 'wasm', 'cpu']);
      if (backendReady && orderKey !== backendOrderKey) {
        if (poseDetector) poseDetector.dispose();
        poseDetector = null;
        poseKey = '';
        warmedPoseKey = '';
        if (objectModel) objectModel.dispose();
        objectModel = null;
        backendReady = false;
      }
      if (!backendReady) {
        await initBackend(opts.backendOrder || ['webgl', 'wasm', 'cpu']);
        backendReady = true;
        backendOrderKey = orderKey;
      }
      var loaded = await Promise.all([
        opts.runPose === false ? Promise.resolve() : loadPose(opts.modelType, opts.poseDim, opts.maxPoses).then(async function () {
          var shapeKey = poseKey + '|' + currentPoseDim + '|' + !!opts.portrait;
          if (warmedPoseKey === shapeKey) return;
          var width = opts.inputWidth || 480;
          var shortSide = Math.round(width * 9 / 16);
          var warm = G.tf.zeros(opts.portrait ? [width, shortSide, 3] : [shortSide, width, 3], 'int32');
          try { await poseDetector.estimatePoses(warm, { maxPoses: opts.maxPoses || 6 }, 0); }
          finally { warm.dispose(); ModelCore.resetTracker(); }
          warmedPoseKey = shapeKey;
        }),
        opts.detectObjects ? loadObjects() : Promise.resolve(false),
      ]);
      var objects = loaded[1];
      status('Sẵn sàng');
      return { backend: G.tf.getBackend(), objects: objects, faces: null, isWorker: IS_WORKER, backendErrors: backendErrors };
    },

    resetTracker: function () {
      try { poseDetector && poseDetector.reset(); } catch (e) {}
    },

    detect: async function (image, opts) {
      opts = opts || {};
      if (opts.runPose !== false && !poseDetector) throw new Error('Mô hình chưa được tải');
      if (opts.runPose !== false) setPoseDimension(opts.poseDim);
      var t0 = G.performance.now();
      var input = G.tf.browser.fromPixels(image);
      try {
        var raw = opts.runPose === false ? [] : await poseDetector.estimatePoses(input, { maxPoses: opts.maxPoses || 6, flipHorizontal: false }, opts.timestampMs);
        var poseMs = opts.runPose === false ? 0 : G.performance.now() - t0;
        var objects = [];
        var objectMs = 0;
        if (opts.withObjects && objectModel) {
          var objectStart = G.performance.now();
          objects = await objectModel.detect(input, 10, 0.4);
          objectMs = G.performance.now() - objectStart;
        }
        var poses = [];
        for (var i = 0; i < raw.length; i++) {
          var p = raw[i];
          var kps = p.keypoints.map(function (k) { return { x: k.x, y: k.y, score: k.score || 0 }; });
          var sc = p.score != null ? p.score : kps.reduce(function (s, k) { return s + k.score; }, 0) / kps.length;
          if (sc > 0.18) poses.push({ id: p.id != null ? p.id : i + 1, score: sc, keypoints: kps });
        }
        return { poses: poses, objects: objects, faces: null, poseDim: opts.runPose === false ? 0 : currentPoseDim, poseMs: poseMs, objectMs: objectMs, faceMs: 0, inferMs: G.performance.now() - t0 };
      } finally {
        input.dispose();
      }
    },

    memory: function () {
      if (!G.tf || !G.tf.memory) return null;
      var m = G.tf.memory();
      return { numTensors: m.numTensors, numBytes: m.numBytes, backend: G.tf.getBackend() };
    },

    isReady: function () { return !!poseDetector; },
    faceStatus: function () { return { detect: false, emotion: false, recog: false, errors: [] }; },
    hasObjects: function () { return !!objectModel; },
  };

  G.ModelCore = ModelCore;
})(typeof self !== 'undefined' ? self : this);
