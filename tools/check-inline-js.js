/**
 * check-inline-js.js — HTML 안 인라인 <script> 를 전부 문법 검사한다
 *
 * strip-keys.js 가 중괄호를 세어 함수 본문을 잘라내므로, 한 글자만 어긋나도
 * 페이지가 통째로 죽는다. 배포 전에 여기서 걸러낸다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const files = process.argv.slice(2);

let bad = 0;
for (const rel of files) {
  const src = fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0, errs = [];
  while ((m = re.exec(src)) !== null) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;          // 외부 파일은 건너뜀
    if (/type\s*=\s*["'](?!text\/javascript)/i.test(attrs)) continue;  // json 등 제외
    i++;
    const code = m[2];
    const line = src.slice(0, m.index).split('\n').length;
    try {
      new vm.Script(code, { filename: `${rel}:<script#${i}>` });
    } catch (e) {
      errs.push(`    블록#${i} (${line}번째 줄 부근): ${e.message}`);
    }
  }
  if (errs.length) { bad++; console.log(`❌ ${rel}`); errs.forEach(e => console.log(e)); }
  else console.log(`✅ ${rel}  (인라인 블록 ${i}개)`);
}
console.log(bad ? `\n${bad}개 파일에 문법 오류` : '\n전부 통과');
process.exit(bad ? 1 : 0);
