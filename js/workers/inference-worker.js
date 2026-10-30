/* =========================================================
 * workers/inference-worker.js — LUỒNG PHỤ chạy mô hình AI
 *
 * Luồng chính (giao diện) chỉ việc: lấy khung hình → thu nhỏ →
 * chuyển (transfer, không sao chép) ImageBitmap sang đây.
 * Worker suy luận rồi trả kết quả (vài KB toạ độ) về luồng chính.
 * Nhờ vậy giao diện không bị "đơ" khi mô hình đang tính.
 *
 * Giao thức tin nhắn (postMessage):
 *   → {type:'init', id, baseUrl, backendOrder, modelType, poseDim, detectObjects}
 *   ← {type:'ready', id, backend, objects}
 *   → {type:'detect', id, bitmap, timestampMs, withObjects, maxPoses}
 *   ← {type:'result', id, poses, objects, faces, inferMs, memory}
 *     (vector nhận dạng khuôn mặt 1024 số được CHUYỂN chứ không sao chép)
 *   → {type:'reset'}
 *   ← {type:'status', text} | {type:'error', id, message}
 * ========================================================= */
/* global ModelCore */
importScripts('../core/model-core.js');

ModelCore.configure({
  onStatus: function (text) { self.postMessage({ type: 'status', text: text }); },
});

self.onmessage = async function (e) {
  var msg = e.data || {};
  try {
    if (msg.type === 'init') {
      ModelCore.configure({ baseUrl: msg.baseUrl });
      var info = await ModelCore.init(msg);
      self.postMessage({ type: 'ready', id: msg.id, backend: info.backend, objects: info.objects, faces: info.faces, backendErrors: info.backendErrors });
    } else if (msg.type === 'detect') {
      var bitmap = msg.bitmap;
      try {
        var res = await ModelCore.detect(bitmap, msg);
        var transfer = [];
        (res.faces || []).forEach(function (f) { if (f.desc && f.desc.buffer) transfer.push(f.desc.buffer); });
        self.postMessage({
          type: 'result', id: msg.id, poses: res.poses, objects: res.objects,
          faces: res.faces, poseDim: res.poseDim, poseMs: res.poseMs, objectMs: res.objectMs, faceMs: res.faceMs, inferMs: res.inferMs, memory: ModelCore.memory(),
        }, transfer);
      } finally {
        if (bitmap && bitmap.close) bitmap.close();   // trả bộ nhớ ảnh về hệ thống ngay
      }
    } else if (msg.type === 'reset') {
      ModelCore.resetTracker();
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: (err && err.message) || String(err) });
  }
};
