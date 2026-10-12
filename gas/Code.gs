/**
 * M-Test 入力アプリ：データの受け口（Google Apps Script）
 *
 * - iPadから送られた測定データを「データ」シートに1行ずつ追加する。
 * - データを返す機能は持たない（URLを知られても中身は読めない）。
 * - 合言葉は任意。enableSecret を実行すると有効になり、一致しない送信は受け付けなくなる。
 *   合言葉はこのファイルに書かず、スクリプト プロパティ「SECRET」に保存する。
 *
 * 初回は setup を実行してシートを用意する。
 */

const SHEET_NAME = 'データ';
const MAX_ROWS_PER_REQUEST = 100;
const MAX_CELL_LENGTH = 200;
const TEXT_COLUMNS = [1, 2, 5]; // 測定番号・測定日時・生年月日は文字のまま保存する（日付に自動変換させない）

/** 初回に1回だけ実行：シートを用意する */
function setup() {
  getSheet_();
  const on = !!PropertiesService.getScriptProperties().getProperty('SECRET');
  Logger.log('準備ができました（合言葉：' + (on ? '有効' : 'なし') + '）');
}

/** 合言葉を有効にする／作り直す。古い合言葉は使えなくなる */
function enableSecret() {
  const secret = newSecret_();
  PropertiesService.getScriptProperties().setProperty('SECRET', secret);
  Logger.log('合言葉（iPadの設定画面に入力してください）: ' + secret);
}

/** 合言葉をなくす（URLを知っていれば送信できる状態に戻す） */
function disableSecret() {
  PropertiesService.getScriptProperties().deleteProperty('SECRET');
  Logger.log('合言葉をなくしました');
}

function doGet() {
  return ContentService.createTextOutput('M-Test 受付口は動作しています。');
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }

  if (!body || typeof body !== 'object') return json_({ ok: false, error: 'bad_request' });

  // 合言葉が有効なときだけ確かめる
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (secret && (typeof body.secret !== 'string' || !safeEqual_(body.secret, secret))) {
    return json_({ ok: false, error: 'unauthorized' });
  }

  if (body.action === 'ping') {
    const sh = getSheet_();
    return json_({ ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName(), rows: Math.max(sh.getLastRow() - 1, 0) });
  }
  if (body.action === 'append') return append_(body);
  return json_({ ok: false, error: 'unknown_action' });
}

function append_(body) {
  const header = body.header;
  const rows = body.rows;
  if (!Array.isArray(header) || !header.length || !header.every(function (h) { return typeof h === 'string'; })) {
    return json_({ ok: false, error: 'bad_request' });
  }
  if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_REQUEST ||
      !rows.every(function (r) { return Array.isArray(r) && r.length === header.length; })) {
    return json_({ ok: false, error: 'bad_request' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_();

    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
      sh.setFrozenRows(1);
      sh.setFrozenColumns(4);
    } else {
      const current = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
      if (current.length !== header.length || current.some(function (h, i) { return h !== header[i]; })) {
        return json_({ ok: false, error: 'header_mismatch' });
      }
    }

    // 送り直しで同じデータが2重にならないよう、「測定番号＋測定日時」が同じ行は飛ばす
    const existing = {};
    const last = sh.getLastRow();
    if (last >= 2) {
      sh.getRange(2, 1, last - 1, 2).getDisplayValues().forEach(function (r) { existing[r[0] + '|' + r[1]] = true; });
    }
    const fresh = [];
    rows.forEach(function (r) {
      const key = String(r[0]) + '|' + String(r[1]);
      if (existing[key]) return;
      existing[key] = true;
      fresh.push(r.map(clean_));
    });

    if (fresh.length) {
      const start = sh.getLastRow() + 1;
      TEXT_COLUMNS.forEach(function (c) { sh.getRange(start, c, fresh.length, 1).setNumberFormat('@'); });
      sh.getRange(start, 1, fresh.length, header.length).setValues(fresh);
    }
    return json_({ ok: true, saved: fresh.length, skipped: rows.length - fresh.length });
  } finally {
    lock.releaseLock();
  }
}

/** セルの値を安全な形にする（数式として動かないようにする・長すぎる文字を切る） */
function clean_(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (v === null || v === undefined) return '';
  let s = String(v).slice(0, MAX_CELL_LENGTH);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function newSecret_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
