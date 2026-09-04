/**
 * proxy-warmer — 시트 프록시(sheets-proxy)를 늘 깨어 있게 두는 아주 작은 일꾼
 *
 * 왜 만들었나 (2026-09-04, 홍팀장):
 *   Apps Script 웹앱은 한동안 아무도 부르지 않으면 **첫 요청에 20~50초**를 쓴다(실측: 무의미한
 *   POST 하나가 49.9초, 그 다음은 1.0초). 그 첫 손님이 하필 **거래처**면 카탈로그가
 *   "상품을 불러오지 못했습니다"로 뜬다. 우리 불편은 나중이고 거래처가 편해야 한다 —
 *   그러니 첫 손님은 항상 이 일꾼이어야 한다.
 *
 * 왜 프록시 안에 안 넣었나:
 *   트리거를 만들려면 프록시 프로젝트에 권한(scope)이 하나 더 붙는다. 웹앱은 소유자 권한으로
 *   도는데, 권한이 바뀌면 재승인 전까지 **거래처 화면이 통째로 죽을 수** 있다.
 *   그래서 깨우는 놈은 따로 산다. 이 프로젝트가 죽어도 카탈로그는 멀쩡하다.
 *
 * 하는 일:
 *   2분마다 프록시에 {action:'warm'} 을 한 번 보낸다. 시트는 읽지 않는다(싸야 한다).
 *
 * 설치 (한 번만):
 *   편집기에서 setup 을 실행 → 권한 승인. 그러면 트리거가 걸린다.
 *   상태 확인은 status 실행 후 [실행 기록] 보기.
 */

var PROXY_URL = 'https://script.google.com/macros/s/AKfycbx46saILixJ387TxLbfnsBwjdc5K93j-cqUFjHxQU8xPGL7DJ9S-YjUvw7kvHmGPe7mmg/exec';
/* ⏱ 구글이 받는 값은 1·5·10·15·30 분뿐이다(2026-09-04 실측: 2를 주면 거절당한다).
   5분이면 그 사이에 프록시가 식어버린다(유휴 몇 분이면 다음 요청이 17~54초).
   → 1분. 핑은 시트를 안 읽어서 보통 1초 미만이라 하루 다 합쳐도 30분 언저리다(한도 90분). */
var EVERY_MIN = 1;

/** 트리거가 부르는 함수 — 이름을 바꾸면 setup 도 같이 고칠 것. */
function warmPing() {
  var t0 = new Date().getTime();
  try {
    var res = UrlFetchApp.fetch(PROXY_URL, {
      method: 'post',
      contentType: 'text/plain;charset=utf-8',
      payload: JSON.stringify({ action: 'warm' }),
      muteHttpExceptions: true,
      followRedirects: true
    });
    var ms = new Date().getTime() - t0;
    // 느렸다는 것은 그때 프록시가 자고 있었다는 뜻이다 — 그 손님이 거래처가 아니어서 다행인 것이다.
    PropertiesService.getScriptProperties().setProperty('last',
      new Date().toISOString() + ' · ' + res.getResponseCode() + ' · ' + ms + 'ms');
    if (ms > 8000) Logger.log('프록시가 자고 있었다: %s ms', ms);
  } catch (e) {
    PropertiesService.getScriptProperties().setProperty('last',
      new Date().toISOString() + ' · 실패 · ' + e.message);
  }
}

/** 설치: 옛 트리거를 지우고 EVERY_MIN 분마다 돌게 새로 건다. 다시 실행해도 안전하다. */
function setup() {
  var old = ScriptApp.getProjectTriggers();
  for (var i = 0; i < old.length; i++) {
    if (old[i].getHandlerFunction() === 'warmPing') ScriptApp.deleteTrigger(old[i]);
  }
  ScriptApp.newTrigger('warmPing').timeBased().everyMinutes(EVERY_MIN).create();
  warmPing();   // 지금 한 번 깨워두고 시작한다
  Logger.log('설치 완료 — %s분마다 프록시를 깨웁니다. 마지막 결과: %s',
    EVERY_MIN, PropertiesService.getScriptProperties().getProperty('last'));
}

/** 상태 보기 — 트리거가 살아 있는지, 마지막 핑이 언제 어땠는지. */
function status() {
  var t = ScriptApp.getProjectTriggers().filter(function (x) {
    return x.getHandlerFunction() === 'warmPing';
  });
  Logger.log('트리거 %s개 · 마지막: %s', t.length,
    PropertiesService.getScriptProperties().getProperty('last') || '아직 없음');
}

/* 📑 카탈로그 스냅샷용 시트 공유 (2026-09-04).
   발주 API(Supabase)가 카탈로그 상품 데이터를 대신 읽으려면 그 서비스계정이 시트를 볼 수 있어야 한다.
   시트 화면에서 손으로 세 번 공유하는 대신 여기서 한 번에 건다. **뷰어(읽기)만** 준다.
   ⚠️ 이미 권한이 있으면 구글이 조용히 넘어간다. 다시 실행해도 안전하다. */
function shareSheetsToApi() {
  var sa = 'sheets-writer@baljuseo-sheets.iam.gserviceaccount.com';
  var sheets = [
    ['유통시트', '1bFfYmNNzPpIztK6_AD918Hu7s3JvaqkGGlwfIi6LxqY'],
    ['도구시트', '1t1E8TZ9442OvgFV6Ah5nK6gexHv7xxVFf0jBVDXFUzM'],
    ['링크정본', '1Gfjvk_4u-sFCm-u6xLE5idMxtqmBq9X3dC_BHanq-uQ']
  ];
  var log = [];
  for (var i = 0; i < sheets.length; i++) {
    try {
      DriveApp.getFileById(sheets[i][1]).addViewer(sa);
      log.push('✅ ' + sheets[i][0]);
    } catch (e) {
      log.push('⚠️ ' + sheets[i][0] + ' — ' + e.message);
    }
  }
  Logger.log(log.join('\n'));
  return log.join(' / ');
}

/** 그만두기 — 트리거를 전부 뗀다. */
function stop() {
  var old = ScriptApp.getProjectTriggers();
  for (var i = 0; i < old.length; i++) {
    if (old[i].getHandlerFunction() === 'warmPing') ScriptApp.deleteTrigger(old[i]);
  }
  Logger.log('트리거를 뗐습니다. 이제 첫 손님이 프록시를 깨웁니다.');
}
