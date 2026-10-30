// =========================================================
// task-scheduler.js — Điều phối tác vụ phụ (không làm chậm khung xương)
// =========================================================
export class TaskScheduler {
  constructor() { this.next = { objects: 0 }; }

  plan(t, rt, settings) {
    const due = (key) => t + 1e-6 >= this.next[key];
    const res = { withObjects: false, withFaces: false, faceRes: false };
    if (settings.detectObjects && due('objects')) {
      res.withObjects = true;
      this.next.objects = t + (rt.objectInterval || 1.0);
    }
    return res;
  }
}
