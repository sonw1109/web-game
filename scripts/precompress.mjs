// Sau khi build: nén sẵn các file chữ (js/css/html/svg/json) thành .br và .gz để server gửi luôn.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const dist = path.resolve(process.argv[2] || 'client/dist');
const TEXT = /\.(js|css|html|svg|json|txt|mjs)$/;
let before = 0, after = 0, n = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const f = path.join(dir, name);
    if (statSync(f).isDirectory()) { walk(f); continue; }
    if (!TEXT.test(name)) continue;
    const buf = readFileSync(f);
    if (buf.length < 1024) continue; // file nhỏ: nén không đáng
    const br = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
    writeFileSync(`${f}.br`, br);
    writeFileSync(`${f}.gz`, gzipSync(buf, { level: 9 }));
    before += buf.length; after += br.length; n++;
  }
}
walk(dist);
console.log(`🗜️  Nén sẵn ${n} file: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (brotli)`);
