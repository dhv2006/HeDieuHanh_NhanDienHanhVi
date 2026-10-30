// =========================================================
// zip-io.js — Đóng gói thư mục CSDL thành file .ZIP và
// giải nén file .ZIP trực tiếp trên trình duyệt (PC & Mobile)
// =========================================================
import { readFileAsArrayBuffer } from './utils.js';

// Bảng CRC-32 chuẩn IEEE 802.3
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

function toUint8(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === 'string') return encoder.encode(data);
  return encoder.encode(JSON.stringify(data, null, 2));
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
  const dosDate = (((year - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0x0F) << 5) | (date.getDate() & 0x1F);
  return { dosTime, dosDate };
}

/**
 * Tạo file .ZIP chứa thư mục dữ liệu phân tích
 * @param {Array<{path: string, content: string|Uint8Array|ArrayBuffer}>} entries
 * @returns {Blob}
 */
export function createZipBlob(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path.replace(/^\/+/, ''));
    const dataBytes = toUint8(entry.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // PK\x03\x04
    lv.setUint16(4, 20, true);         // Version needed (2.0)
    lv.setUint16(6, 0x0800, true);     // UTF-8 filename flag
    lv.setUint16(8, 0, true);          // Store method (0 = uncompressed, fast & universal)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // PK\x01\x02
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);     // UTF-8 flag
    cv.setUint16(10, 0, true);         // Store method
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);   // PK\x05\x06
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
}

async function inflateRaw(compressedBytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Trình duyệt không hỗ trợ giải nén DEFLATE.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(compressedBytes);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/**
 * Đọc và giải nén file .ZIP (nhận từ ô tải lên Video hoặc Dữ liệu phân tích)
 * @param {File|ArrayBuffer} input
 * @returns {Promise<{files: Map<string, Uint8Array>, textOf: (suffix:string)=>string|null, blobOf: (extRegex:RegExp, mime?:string)=>{name:string, blob:Blob}|null}>}
 */
export async function extractZip(input) {
  const buf = input instanceof ArrayBuffer ? input : await readFileAsArrayBuffer(input);
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);

  if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) {
    throw new Error('File không đúng định dạng .ZIP hợp lệ.');
  }

  const files = new Map();

  // Tìm End of Central Directory (EOCD) từ cuối file
  let eocdPos = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }

  if (eocdPos >= 0) {
    const count = view.getUint16(eocdPos + 10, true);
    let cdPos = view.getUint32(eocdPos + 16, true);
    for (let i = 0; i < count && cdPos + 46 <= bytes.length; i++) {
      if (view.getUint32(cdPos, true) !== 0x02014b50) break;
      const method = view.getUint16(cdPos + 10, true);
      const compSize = view.getUint32(cdPos + 20, true);
      const nameLen = view.getUint16(cdPos + 28, true);
      const extraLen = view.getUint16(cdPos + 30, true);
      const commentLen = view.getUint16(cdPos + 32, true);
      const localOffset = view.getUint32(cdPos + 42, true);
      const name = decoder.decode(bytes.subarray(cdPos + 46, cdPos + 46 + nameLen));
      cdPos += 46 + nameLen + extraLen + commentLen;

      if (name.endsWith('/')) continue;
      if (localOffset + 30 > bytes.length) continue;
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const rawData = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) {
        files.set(name, rawData);
      } else if (method === 8) {
        files.set(name, await inflateRaw(rawData));
      }
    }
  } else {
    // Quét tuần tự Local File Headers nếu không thấy EOCD
    let pos = 0;
    while (pos + 30 <= bytes.length && view.getUint32(pos, true) === 0x04034b50) {
      const method = view.getUint16(pos + 8, true);
      const compSize = view.getUint32(pos + 18, true);
      const nameLen = view.getUint16(pos + 26, true);
      const extraLen = view.getUint16(pos + 28, true);
      const name = decoder.decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
      const dataStart = pos + 30 + nameLen + extraLen;
      const rawData = bytes.subarray(dataStart, dataStart + compSize);
      if (!name.endsWith('/')) {
        if (method === 0) files.set(name, rawData);
        else if (method === 8) files.set(name, await inflateRaw(rawData));
      }
      pos = dataStart + compSize;
    }
  }

  return {
    files,
    textOf(suffix) {
      const lower = suffix.toLowerCase();
      for (const [k, v] of files.entries()) {
        if (k.toLowerCase().endsWith(lower)) return decoder.decode(v);
      }
      return null;
    },
    blobOf(extRegex, defaultMime = 'video/mp4') {
      for (const [k, v] of files.entries()) {
        if (extRegex.test(k)) {
          const base = k.split('/').pop();
          const mime = /\.webm$/i.test(base) ? 'video/webm' : /\.mov$/i.test(base) ? 'video/quicktime' : defaultMime;
          return { name: base, blob: new Blob([v], { type: mime }) };
        }
      }
      return null;
    },
  };
}
