/* 카탈로그가 읽는 탭이 **익명으로** 실제 열리는지 확인한다.
   브라우저로 여는 것은 확인이 아니다 — 카탈로그는 쿠키 없이 부른다. */
const P = 'https://script.google.com/macros/s/AKfycbx46saILixJ387TxLbfnsBwjdc5K93j-cqUFjHxQU8xPGL7DJ9S-YjUvw7kvHmGPe7mmg/exec';
const DOGU = '1t1E8TZ9442OvgFV6Ah5nK6gexHv7xxVFf0jBVDXFUzM';
const LINK = '1Gfjvk_4u-sFCm-u6xLE5idMxtqmBq9X3dC_BHanq-uQ';
const YU   = '1bFfYmNNzPpIztK6_AD918Hu7s3JvaqkGGlwfIi6LxqY';

const TESTS = [
  ['사진 상품이미지_v2', DOGU, '상품이미지_v2', 'A1:F10',  true],
  ['상품링크',          DOGU, '상품링크',      'A2:F10',  true],
  ['상품분류',          DOGU, '상품분류',      'A2:B10',  true],
  ['합포장',            DOGU, '합포장',        'A2:E10',  true],
  ['추천상품',          DOGU, '추천상품',      'A2:F10',  true],
  ['공지사항',          DOGU, '공지사항',      'A2:E10',  true],
  ['상품별판매(머리글)', DOGU, '상품별판매',    'A1:E1',   true],
  ['카탈로그_계정',      DOGU, '카탈로그_계정',  'A2:B3',   true],
  ['링크 정본',         LINK, '링크',          'A2:B10',  true],
  // ⚠️ 유통시트는 창고명으로 탭이 나뉜다. '유통시트'라는 이름의 탭은 없다.
  ['유통시트 변동사항',   YU,   '상품변동사항',   'A1:C3',   true],
  ['🚫 전체판매',        DOGU, '전체판매',      'A1:B3',   false],
  ['🚫 업무관리',        DOGU, '업무관리',      'A1:B3',   false]
];

(async () => {
  let bad = 0;
  for (const [name, id, tab, range, shouldPass] of TESTS) {
    const path = id + '/values/' + encodeURIComponent("'" + tab + "'!" + range);
    let j;
    try {
      const r = await fetch(P, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'public', path: path, method: 'GET' })
      });
      j = await r.json();
    } catch (e) { j = { error: { code: 0, message: e.message } }; }

    const blocked = !!(j && j.error);
    /* ⚠️ 프록시 응답은 {status, body} 로 **감싸여** 온다. body 안에 진짜 시트 응답이 있다.
       이걸 안 풀면 값이 멀쩡히 와도 "0줄"로 보여서 거짓 안심을 준다(2026-08-27 실제로 그랬다). */
    let rows = 0;
    if (!blocked) {
      try { rows = (JSON.parse(j.body || '{}').values || []).length; } catch (_) { rows = 0; }
    }
    const ok = shouldPass ? (!blocked && rows > 0) : blocked;
    const detail = blocked ? (j.error.code + ' ' + j.error.message)
                           : (rows + '줄' + (rows ? '' : '  ⚠️ 열리긴 하는데 값이 안 온다'));
    console.log((ok ? '✅ ' : '❌ ') + name.padEnd(20) + detail);
    if (!ok) bad++;
  }
  console.log('\n' + (bad ? '❌ 어긋난 것 ' + bad + '건' : '✅ 열려야 할 탭은 열리고, 내부 탭은 막힌다'));
  process.exit(bad ? 1 : 0);
})();
