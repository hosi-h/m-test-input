// M-Test 入力アプリ本体
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);

  // ---------- localStorage（設定・入力途中のデータ・連番） ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できなくても続行 */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* 無視 */ } },
  };
  const K_SETTINGS = 'mtest.settings';
  const K_DRAFT = 'mtest.draft';
  const K_SEQ = 'mtest.seq';

  const DEFAULT_SETTINGS = { device: 'A', url: '', secret: '', autoDelete: true };
  let settings = { ...DEFAULT_SETTINGS, ...LS.get(K_SETTINGS, {}) };
  let people = [];
  let state = newState();
  let syncing = false;

  function newState() {
    return {
      screen: 'info',
      info: { name: '', by: '', bm: '', bd: '', sex: '', sport: '', sportOther: '', position: '', positionOther: '' },
      checks: {},
    };
  }
  function chk(key) {
    return state.checks[key] || (state.checks[key] = { ok: false, d0: false, d1: false });
  }
  function saveDraft() { LS.set(K_DRAFT, state); }
  function hasAnyCheck() {
    return Object.values(state.checks).some(c => c.ok || c.d0 || c.d1);
  }

  // ---------- 小さな道具 ----------
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fmtDateTime = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const normName = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, '');
  const daysIn = (y, m) => new Date(y || 2000, m, 0).getDate();

  function calcAge(y, m, d, at = new Date()) {
    if (!y || !m || !d) return null;
    const before = (at.getMonth() + 1 < m) || (at.getMonth() + 1 === m && at.getDate() < d);
    return at.getFullYear() - y - (before ? 1 : 0);
  }
  function birthText(i) { return i.by && i.bm && i.bd ? `${i.by}/${pad(i.bm)}/${pad(i.bd)}` : ''; }
  function personKey(name, birth) { return `${normName(name)}|${birth}`; }
  function sportValue(i) { return i.sport === OTHER ? (i.sportOther.trim() || OTHER) : i.sport; }
  function positionValue(i) { return i.position === OTHER ? (i.positionOther.trim() || OTHER) : i.position; }

  // ---------- お知らせ・ダイアログ ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  let modalGen = 0;
  function modal({ title, html, actions }) {
    const gen = ++modalGen;
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html || '';
    $('#modal-body').onclick = null;
    const box = $('#modal-actions');
    box.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${a.cls || ''}`;
      b.textContent = a.label;
      b.addEventListener('click', async () => {
        const keep = a.onClick ? await a.onClick() : undefined;
        // onClickの中で次のダイアログが開いた場合は、それを閉じない
        if (keep !== false && gen === modalGen) closeModal();
      });
      box.appendChild(b);
    }
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }

  function confirmModal(title, html, okLabel = 'OK', okCls = 'primary', cancelLabel = 'キャンセル') {
    return new Promise(resolve => modal({
      title, html,
      actions: [
        { label: cancelLabel, onClick: () => resolve(false) },
        { label: okLabel, cls: okCls, onClick: () => resolve(true) },
      ],
    }));
  }
  function alertModal(title, html) {
    return new Promise(resolve => modal({ title, html, actions: [{ label: 'OK', cls: 'primary', onClick: () => resolve() }] }));
  }

  // ---------- 画面切り替え ----------
  function show(screen) {
    state.screen = screen;
    $('#screen-info').hidden = screen !== 'info';
    $('#screen-check').hidden = screen !== 'check';
    if (screen === 'info') renderInfo();
    if (screen === 'check') { renderPerson(); refreshChecks(); }
    window.scrollTo(0, 0);
    saveDraft();
  }

  // =========================================================
  // 基本情報
  // =========================================================
  function initBirthSelects() {
    const now = new Date().getFullYear();
    const by = $('#by'), bm = $('#bm'), bd = $('#bd');
    by.innerHTML = '<option value="">----</option>';
    for (let y = now; y >= 1930; y--) by.add(new Option(String(y), String(y)));
    bm.innerHTML = '<option value="">--</option>';
    for (let m = 1; m <= 12; m++) bm.add(new Option(String(m), String(m)));
    fillDays();
    for (const [el, k] of [[by, 'by'], [bm, 'bm'], [bd, 'bd']]) {
      el.addEventListener('change', () => {
        state.info[k] = el.value ? Number(el.value) : '';
        if (k !== 'bd') fillDays();
        updateAge();
        saveDraft();
      });
    }
  }
  function fillDays() {
    const bd = $('#bd');
    const n = daysIn(Number(state.info.by), Number(state.info.bm) || 1);
    if (state.info.bd && state.info.bd > n) state.info.bd = '';
    bd.innerHTML = '<option value="">--</option>';
    for (let d = 1; d <= n; d++) bd.add(new Option(String(d), String(d)));
    bd.value = state.info.bd ? String(state.info.bd) : '';
  }
  function updateAge() {
    const i = state.info;
    const a = calcAge(i.by, i.bm, i.bd);
    $('#age').textContent = a == null ? '' : `（${a}歳）`;
  }

  function renderChoices(el, items, selected, onPick) {
    el.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice' + (it === selected ? ' on' : '');
      b.textContent = it;
      b.addEventListener('click', () => onPick(it === selected ? '' : it));
      el.appendChild(b);
    }
  }

  function renderSex() {
    renderChoices($('#sex'), SEXES, state.info.sex, v => { state.info.sex = v; renderSex(); saveDraft(); });
  }
  function renderSport() {
    const i = state.info;
    renderChoices($('#sport'), [...SPORTS.map(s => s.name), OTHER], i.sport, v => {
      if (v !== i.sport) { i.position = ''; i.positionOther = ''; }
      i.sport = v;
      renderSport();
      renderPosition();
      saveDraft();
      if (v === OTHER) $('#sport-other').focus();
    });
    $('#sport-other').hidden = i.sport !== OTHER;
    $('#sport-other').value = i.sportOther;
  }
  function renderPosition() {
    const i = state.info;
    const el = $('#position');
    if (!i.sport) {
      el.innerHTML = '<span class="hint">先に種目を選んでください</span>';
      $('#position-other').hidden = true;
      return;
    }
    const sport = SPORTS.find(s => s.name === i.sport);
    const items = [...(sport ? sport.positions : []), POSITION_NONE, OTHER];
    renderChoices(el, items, i.position, v => {
      i.position = v;
      renderPosition();
      saveDraft();
      if (v === OTHER) $('#position-other').focus();
    });
    $('#position-other').hidden = i.position !== OTHER;
    $('#position-other').value = i.positionOther;
  }

  function renderInfo() {
    const i = state.info;
    $('#name').value = i.name;
    $('#by').value = i.by ? String(i.by) : '';
    $('#bm').value = i.bm ? String(i.bm) : '';
    fillDays();
    updateAge();
    renderSex();
    renderSport();
    renderPosition();
    $('#btn-start').textContent = hasAnyCheck() ? 'チェックに戻る →' : 'チェック開始 →';
  }

  // ----- 氏名の候補表示 -----
  function showSuggest() {
    const ul = $('#suggest');
    const q = normName(state.info.name);
    if (!q) { ul.hidden = true; return; }
    const list = people
      .filter(p => normName(p.name).includes(q))
      .sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''))
      .slice(0, 6);
    if (!list.length) { ul.hidden = true; return; }
    ul.innerHTML = list.map((p, idx) => {
      const [y, m, d] = p.birth.split('-').map(Number);
      const age = calcAge(y, m, d);
      const meta = [`${y}/${pad(m)}/${pad(d)}（${age}歳）`, p.sex, [p.sport, p.position].filter(Boolean).join(' / ')]
        .filter(Boolean).join('　');
      return `<li><button type="button" data-idx="${idx}"><span class="s-name">${esc(p.name)}</span><span class="s-meta">${esc(meta)}</span></button></li>`;
    }).join('');
    ul.hidden = false;
    ul.onclick = (e) => {
      const b = e.target.closest('button[data-idx]');
      if (b) pickPerson(list[Number(b.dataset.idx)]);
    };
  }
  function pickPerson(p) {
    const i = state.info;
    const [y, m, d] = p.birth.split('-').map(Number);
    i.name = p.name; i.by = y; i.bm = m; i.bd = d;
    i.sex = SEXES.includes(p.sex) ? p.sex : '';
    const sport = SPORTS.find(s => s.name === p.sport);
    if (!p.sport) { i.sport = ''; i.sportOther = ''; }
    else if (sport) { i.sport = p.sport; i.sportOther = ''; }
    else { i.sport = OTHER; i.sportOther = p.sport; }
    const known = sport ? [...sport.positions, POSITION_NONE] : [POSITION_NONE];
    if (!p.position) { i.position = ''; i.positionOther = ''; }
    else if (known.includes(p.position)) { i.position = p.position; i.positionOther = ''; }
    else { i.position = OTHER; i.positionOther = p.position; }
    $('#suggest').hidden = true;
    $('#name').blur();
    renderInfo();
    saveDraft();
  }

  async function startCheck() {
    const i = state.info;
    i.name = i.name.trim();
    const missing = [];
    if (!i.name) missing.push('氏名');
    if (!birthText(i)) missing.push('生年月日');
    if (missing.length) {
      await alertModal('入力が足りません', `<p><b>${missing.join('・')}</b> を入力してください。</p>`);
      return;
    }
    const optional = [];
    if (!i.sex) optional.push('性別');
    if (!i.sport) optional.push('種目');
    if (i.sport && !i.position) optional.push('ポジション');
    if (optional.length && !hasAnyCheck()) {
      const go = await confirmModal('未入力の項目があります',
        `<p><b>${optional.join('・')}</b> が未入力です。このまま進みますか？</p>`, 'このまま進む');
      if (!go) return;
    }
    const birth = `${i.by}-${pad(i.bm)}-${pad(i.bd)}`;
    const p = people.find(x => x.key === personKey(i.name, birth));
    if (p && p.lastDate === todayKey() && !hasAnyCheck()) {
      const go = await confirmModal('本日すでに測定済みです',
        `<p>${esc(i.name)} さんのデータは、本日すでに保存されています。<br>もう一度測定しますか？</p>`, '測定する');
      if (!go) return;
    }
    show('check');
  }

  async function clearAll() {
    const any = hasAnyCheck() || state.info.name || state.info.by;
    if (any) {
      const ok = await confirmModal('入力内容をクリア', '<p>入力中の基本情報とチェックをすべて消します。よろしいですか？</p>', 'クリアする', 'danger');
      if (!ok) return;
    }
    state = newState();
    LS.del(K_DRAFT);
    show('info');
  }

  // =========================================================
  // チェック
  // =========================================================
  function buildCheckGrid() {
    const grid = $('#check-grid');
    grid.innerHTML = '';
    for (const col of [0, 1]) {
      const parts = BODY_PARTS.filter(p => p.column === col);
      let html = '<table class="mt"><thead><tr><th>部位</th><th>動作</th><th>確認</th><th colspan="2">異常あり</th></tr></thead><tbody>';
      for (const p of parts) {
        p.motions.forEach((m, idx) => {
          const key = `${p.part}_${m.name}`;
          const last = idx === p.motions.length - 1 ? ' group-end' : '';
          html += `<tr data-key="${esc(key)}" class="${last}">`;
          if (idx === 0) html += `<th class="part${last}" rowspan="${p.motions.length}">${esc(p.part)}</th>`;
          html += `<td class="motion">${esc(m.name)}</td>`
            + `<td class="cell"><button type="button" class="tg ok" data-key="${esc(key)}" data-kind="ok">確認</button></td>`
            + `<td class="cell"><button type="button" class="tg dir" data-key="${esc(key)}" data-kind="d0">${esc(m.dirs[0])}</button></td>`
            + `<td class="cell"><button type="button" class="tg dir" data-key="${esc(key)}" data-kind="d1">${esc(m.dirs[1])}</button></td>`
            + '</tr>';
        });
      }
      html += '</tbody></table>';
      grid.insertAdjacentHTML('beforeend', html);
    }
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('button.tg');
      if (!b) return;
      const c = chk(b.dataset.key);
      const kind = b.dataset.kind;
      if (kind === 'ok') {
        c.ok = !c.ok;
      } else {
        c[kind] = !c[kind];
        if (c[kind]) c.ok = true; // 異常ありを押したら確認済も自動で付ける（外しても確認済は残す）
      }
      updateRow(b.dataset.key);
      updateProgress();
      saveDraft();
    });
  }

  function updateRow(key) {
    const tr = document.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
    if (!tr) return;
    const c = chk(key);
    const ok = tr.querySelector('[data-kind="ok"]');
    ok.classList.toggle('on', c.ok);
    ok.textContent = c.ok ? '✓ 確認済' : '確認';
    tr.querySelector('[data-kind="d0"]').classList.toggle('on', c.d0);
    tr.querySelector('[data-kind="d1"]').classList.toggle('on', c.d1);
    tr.classList.toggle('done', c.ok);
    tr.classList.toggle('has-abn', c.d0 || c.d1);
  }
  function refreshChecks() {
    MOTIONS.forEach(m => updateRow(m.key));
    updateProgress();
  }
  function counts() {
    let ok = 0, abn = 0;
    for (const m of MOTIONS) {
      const c = chk(m.key);
      if (c.ok) ok++;
      if (c.d0) abn++;
      if (c.d1) abn++;
    }
    return { ok, abn, total: MOTIONS.length };
  }
  function updateProgress() {
    const { ok, abn, total } = counts();
    $('#prog-text').textContent = `確認済 ${ok}/${total}`;
    $('#abn-text').textContent = abn ? `異常あり ${abn}件` : '';
    $('#prog-bar').style.width = `${(ok / total) * 100}%`;
  }
  function renderPerson() {
    const i = state.info;
    const age = calcAge(i.by, i.bm, i.bd);
    const meta = [
      age == null ? '' : `${age}歳`,
      i.sex,
      [sportValue(i), positionValue(i)].filter(Boolean).join(' / '),
    ].filter(Boolean).join('　');
    $('#person').innerHTML = `<span class="p-name">${esc(i.name)}</span><span class="p-meta">${esc(meta)}</span><span class="p-edit">✎ 修正</span>`;
  }

  async function cancelCheck() {
    const ok = await confirmModal('測定を中止', '<p>入力中のチェックと基本情報を破棄して、最初の画面に戻ります。よろしいですか？</p>', '中止する', 'danger', '続ける');
    if (!ok) return;
    state = newState();
    LS.del(K_DRAFT);
    show('info');
  }

  async function askSave() {
    const { ok, abn, total } = counts();
    const i = state.info;
    const age = calcAge(i.by, i.bm, i.bd);
    const unconfirmed = MOTIONS.filter(m => !chk(m.key).ok);
    let html = `<p><b>${esc(i.name)}</b> さん（${age}歳）のデータを保存します。<br>確認済 ${ok}/${total}・異常あり ${abn}件</p>`;
    if (unconfirmed.length) {
      const names = unconfirmed.slice(0, 8).map(m => `${m.part} ${m.name}`).join('、');
      html += `<p>⚠ <b>未確認の動作が ${unconfirmed.length}件</b> あります。</p><p class="list">${esc(names)}${unconfirmed.length > 8 ? ' ほか' : ''}</p>`;
    }
    const go = await confirmModal(unconfirmed.length ? '未確認の動作があります' : '保存しますか？', html,
      unconfirmed.length ? 'このまま保存' : '保存する', 'primary', unconfirmed.length ? '戻って確認' : 'キャンセル');
    if (go) await doSave();
  }

  async function nextId(now) {
    const date = ymd(now);
    const prefix = `${date}-${settings.device}-`;
    const seq = LS.get(K_SEQ, {});
    let n = seq.date === date && seq.device === settings.device ? seq.n : 0;
    const recs = await DB.getAll('records');
    for (const r of recs) {
      if (r.id.startsWith(prefix)) n = Math.max(n, parseInt(r.id.slice(prefix.length), 10) || 0);
    }
    n += 1;
    LS.set(K_SEQ, { date, device: settings.device, n });
    return prefix + pad(n, 3);
  }

  async function doSave() {
    const i = state.info;
    const now = new Date();
    try {
      const id = await nextId(now);
      const birth = birthText(i);
      const row = [
        id, fmtDateTime(now), settings.device, i.name, birth, calcAge(i.by, i.bm, i.bd, now),
        i.sex, sportValue(i), positionValue(i),
        ...MOTIONS.flatMap(m => { const c = chk(m.key); return [c.ok ? 1 : 0, c.d0 ? 1 : 0, c.d1 ? 1 : 0]; }),
      ];
      await DB.put('records', { id, name: i.name, measuredAt: fmtDateTime(now), status: 'unsent', row });

      const key = personKey(i.name, birth.replace(/\//g, '-'));
      const prev = people.find(p => p.key === key);
      const person = {
        key, name: i.name, birth: birth.replace(/\//g, '-'), sex: i.sex,
        sport: sportValue(i), position: positionValue(i),
        lastDate: todayKey(), count: (prev ? prev.count || 0 : 0) + 1,
      };
      await DB.put('people', person);
      people = people.filter(p => p.key !== key).concat(person);

      state = newState();
      LS.del(K_DRAFT);
      show('info');
      toast(`保存しました（測定番号 ${id}）`);
      await refreshBadge();
      sync(false);
    } catch (e) {
      console.error(e);
      await alertModal('保存できませんでした', `<p>iPadへの保存に失敗しました。入力内容は残っています。もう一度「保存」を押してください。</p><p class="note">${esc(e && e.message)}</p>`);
    }
  }

  // =========================================================
  // 送信（Googleスプレッドシート）
  // =========================================================
  async function post(payload, url = settings.url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        cache: 'no-store',
        credentials: 'omit',
        signal: ctrl.signal,
      });
      const text = await r.text();
      try { return JSON.parse(text); } catch { throw new Error('送信先からの応答が正しくありません。URLを確認してください。'); }
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('時間内に応答がありませんでした（通信が不安定です）。');
      if (e instanceof TypeError) throw new Error('ネットにつながっていないか、送信先のURLが正しくありません。');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  function errText(code) {
    return ({
      unauthorized: 'スプレッドシート側で合言葉が有効になっています。設定画面に合言葉を入力してください。',
      header_mismatch: 'スプレッドシートの見出しの列が、アプリの項目と一致しません。',
    })[code] || code || '送信に失敗しました。';
  }

  async function sync(manual) {
    if (syncing) return;
    const all = await DB.getAll('records');
    const unsent = all.filter(r => r.status === 'unsent').sort((a, b) => a.id.localeCompare(b.id));
    if (!unsent.length) { if (manual) toast('未送信のデータはありません'); return; }
    if (!settings.url) {
      if (manual) await alertModal('送信先が未設定です', '<p>「設定」で、送信先のURLを入力してください。<br>データはiPadに保存されているので、設定後に送信できます。</p>');
      return;
    }
    syncing = true;
    await refreshBadge();
    let sent = 0;
    let error = null;
    try {
      for (let s = 0; s < unsent.length; s += 25) {
        const batch = unsent.slice(s, s + 25);
        const res = await post({ action: 'append', secret: settings.secret, header: ALL_COLUMNS, rows: batch.map(r => r.row) });
        if (!res || !res.ok) throw new Error(errText(res && res.error));
        const ids = batch.map(r => r.id);
        if (settings.autoDelete) {
          await DB.deleteMany('records', ids);
        } else {
          for (const r of batch) await DB.put('records', { ...r, status: 'sent', sentAt: new Date().toISOString() });
        }
        sent += batch.length;
      }
    } catch (e) {
      error = e;
    } finally {
      syncing = false;
      await refreshBadge();
    }
    if (error) {
      if (manual) await alertModal('送信できませんでした', `<p>${esc(error.message)}</p><p class="note">データはiPadに残っています。後でもう一度送信してください。${sent ? `（${sent}件は送信済み）` : ''}</p>`);
    } else if (sent) {
      toast(`${sent}件をスプレッドシートに送信しました`);
    }
  }

  async function refreshBadge() {
    let n = 0;
    try { n = (await DB.getAll('records')).filter(r => r.status === 'unsent').length; } catch { /* 無視 */ }
    const b = $('#btn-sync');
    b.textContent = syncing ? '送信中…' : `未送信 ${n}件`;
    b.classList.toggle('has', n > 0);
    b.classList.toggle('busy', syncing);
  }
  function refreshNet() {
    const el = $('#net-status');
    el.textContent = navigator.onLine ? '● オンライン' : '● オフライン';
    el.classList.toggle('off', !navigator.onLine);
  }

  // =========================================================
  // Excel書き出し
  // =========================================================
  async function exportXlsx(records) {
    if (!records.length) { toast('書き出すデータがありません'); return; }
    const rows = records.slice().sort((a, b) => a.id.localeCompare(b.id)).map(r => r.row);
    const blob = XLSX.build(ALL_COLUMNS, rows, { sheetName: 'M-Test', frozenCols: 4 });
    const d = new Date();
    const name = `M-Test_${ymd(d)}_${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`;
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 5000);
  }

  // =========================================================
  // データ管理
  // =========================================================
  async function openData() {
    const all = (await DB.getAll('records')).sort((a, b) => b.id.localeCompare(a.id));
    const unsent = all.filter(r => r.status === 'unsent');
    const sent = all.filter(r => r.status === 'sent');
    const recent = all.slice(0, 8).map(r =>
      `<tr><td>${esc(r.id)}</td><td>${esc(r.name)}</td><td>${r.status === 'unsent' ? '<span class="tag unsent">未送信</span>' : '<span class="tag">送信済</span>'}</td></tr>`
    ).join('');
    const html = `
      <div class="stat">
        <div>未送信<b>${unsent.length}</b>件</div>
        <div>送信済（iPad内）<b>${sent.length}</b>件</div>
        <div>候補の登録<b>${people.length}</b>人</div>
      </div>
      <div class="data-actions">
        <button type="button" class="btn primary" data-act="sync">↑ 今すぐ送信（未送信 ${unsent.length}件）</button>
        <button type="button" class="btn" data-act="xlsx">⇩ Excelに書き出し（iPad内の ${all.length}件）</button>
      </div>
      <p class="note">${settings.autoDelete
        ? '※ 送信が終わったデータはiPadから自動で削除される設定です。送信済のデータはスプレッドシートから取り出してください。'
        : '※ 送信済のデータもiPadに残る設定です。不要になったら下のボタンで削除してください。'}</p>
      ${recent ? `<div class="recent"><table>${recent}</table></div>` : ''}
      <div class="danger-zone data-actions">
        <button type="button" class="btn" data-act="del-sent" ${sent.length ? '' : 'disabled'}>送信済のデータをiPadから削除（${sent.length}件）</button>
        <button type="button" class="btn" data-act="del-people" ${people.length ? '' : 'disabled'}>候補（基本情報）をすべて削除（${people.length}人）</button>
      </div>`;
    modal({ title: 'データ管理', html, actions: [{ label: '閉じる' }] });
    $('#modal-body').onclick = async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'sync') { closeModal(); await sync(true); }
      if (act === 'xlsx') { await exportXlsx(all); }
      if (act === 'del-sent') {
        const ok = await confirmModal('送信済のデータを削除', `<p>iPad内の送信済データ ${sent.length}件を削除します。<br>スプレッドシートのデータは消えません。</p>`, '削除する', 'danger');
        if (ok) { await DB.deleteMany('records', sent.map(r => r.id)); toast('削除しました'); }
        openData();
      }
      if (act === 'del-people') {
        const ok = await confirmModal('候補をすべて削除', `<p>氏名の候補表示に使う基本情報（${people.length}人分）をiPadから削除します。<br>測定データは消えません。</p>`, '削除する', 'danger');
        if (ok) { await DB.clear('people'); people = []; toast('削除しました'); }
        openData();
      }
    };
  }

  // =========================================================
  // 設定
  // =========================================================
  function validUrl(u) { return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u); }

  function openSettings() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const html = `
      <div class="form-row">
        <label for="s-device">このiPadの記号（測定番号に使います）</label>
        <select id="s-device" style="width:120px">${letters.map(l => `<option ${l === settings.device ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="form-row">
        <label for="s-url">送信先のURL（GASのウェブアプリURL）</label>
        <input id="s-url" type="url" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="https://script.google.com/macros/s/…/exec" value="${esc(settings.url)}">
      </div>
      <div class="form-row">
        <label for="s-secret">合言葉（任意：スプレッドシート側で有効にした場合のみ入力）</label>
        <div class="row-inline">
          <input id="s-secret" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(settings.secret)}">
          <button type="button" class="btn" id="s-show">表示</button>
        </div>
      </div>
      <div class="form-row">
        <label class="check-label"><input id="s-auto" type="checkbox" ${settings.autoDelete ? 'checked' : ''}> 送信が終わったデータをiPadから自動で削除する（おすすめ）</label>
      </div>
      <div class="form-row">
        <button type="button" class="btn" id="s-test">接続テスト</button>
        <span id="s-result" class="note"></span>
      </div>
      <p class="note">URLと合言葉はこのiPadの中だけに保存され、プログラムやGitHubには含まれません。<br>バージョン ${APP_VERSION}</p>`;
    modal({
      title: '設定', html,
      actions: [
        { label: 'キャンセル' },
        { label: '保存', cls: 'primary', onClick: () => {
          const url = $('#s-url').value.trim();
          if (url && !validUrl(url)) {
            $('#s-result').textContent = '⚠ URLの形式が違います（https://script.google.com/macros/s/…/exec）';
            return false;
          }
          settings = {
            device: $('#s-device').value,
            url,
            secret: $('#s-secret').value.trim(),
            autoDelete: $('#s-auto').checked,
          };
          LS.set(K_SETTINGS, settings);
          toast('設定を保存しました');
          sync(false);
        } },
      ],
    });
    $('#s-show').onclick = () => {
      const s = $('#s-secret');
      s.type = s.type === 'password' ? 'text' : 'password';
      $('#s-show').textContent = s.type === 'password' ? '表示' : '隠す';
    };
    $('#s-test').onclick = async () => {
      const out = $('#s-result');
      const url = $('#s-url').value.trim();
      if (!validUrl(url)) { out.textContent = '⚠ URLの形式が違います（https://script.google.com/macros/s/…/exec）'; return; }
      out.textContent = '確認中…';
      try {
        const res = await post({ action: 'ping', secret: $('#s-secret').value.trim() }, url);
        out.textContent = res && res.ok ? `✓ 接続できました（保存先：${res.sheet || 'シート'}、${res.rows ?? 0}件）` : `⚠ ${errText(res && res.error)}`;
      } catch (e) {
        out.textContent = `⚠ ${e.message}`;
      }
    };
  }

  // =========================================================
  // 起動
  // =========================================================
  function setTopbarHeight() {
    document.documentElement.style.setProperty('--topbar-h', `${$('.topbar').offsetHeight}px`);
  }

  async function init() {
    initBirthSelects();
    buildCheckGrid();

    const draft = LS.get(K_DRAFT, null);
    if (draft && draft.info) {
      state = { ...newState(), ...draft, info: { ...newState().info, ...draft.info }, checks: draft.checks || {} };
    }

    try { people = await DB.getAll('people'); } catch (e) { console.error(e); }

    // 基本情報の入力
    $('#name').addEventListener('input', (e) => { state.info.name = e.target.value; saveDraft(); showSuggest(); });
    $('#name').addEventListener('focus', showSuggest);
    $('#name').addEventListener('blur', () => setTimeout(() => { $('#suggest').hidden = true; }, 200));
    $('#suggest').addEventListener('pointerdown', (e) => e.preventDefault());
    $('#sport-other').addEventListener('input', (e) => { state.info.sportOther = e.target.value; saveDraft(); });
    $('#position-other').addEventListener('input', (e) => { state.info.positionOther = e.target.value; saveDraft(); });
    $('#btn-start').addEventListener('click', startCheck);
    $('#btn-clear').addEventListener('click', clearAll);

    // チェック
    $('#person').addEventListener('click', () => show('info'));
    $('#btn-cancel').addEventListener('click', cancelCheck);
    $('#btn-save').addEventListener('click', askSave);

    // 上部バー
    $('#btn-sync').addEventListener('click', () => sync(true));
    $('#btn-data').addEventListener('click', openData);
    $('#btn-settings').addEventListener('click', openSettings);

    window.addEventListener('online', () => { refreshNet(); sync(false); });
    window.addEventListener('offline', refreshNet);
    window.addEventListener('resize', setTopbarHeight);
    setTopbarHeight();
    refreshNet();

    show(state.screen === 'check' && state.info.name ? 'check' : 'info');
    await refreshBadge();

    // 自動送信：起動時と1分ごと
    setTimeout(() => sync(false), 2000);
    setInterval(() => { if (navigator.onLine) sync(false); }, 60000);

    // iPadが保存データを勝手に消さないようにお願いする
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW登録に失敗', e));
    }
  }

  init();
})();
