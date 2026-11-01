(function () {
  const S = window.store, T = window.TEMPLATES;
  const app = document.getElementById('app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = iso => iso ? new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const fmtDay = iso => iso ? new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  let unsub = () => {};
  let homeFilter = 'offen';
  const isoDay = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const today = () => isoDay(new Date());
  let selDay = today();
  const dayLabel = s => new Date(s + 'T12:00').toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const shiftDay = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return isoDay(d); };
  // Stunden aus Von/Bis/Pause, über Mitternacht möglich
  function hoursOf(start, end, pauseMin = 0) {
    const m = t => { const [h, mi] = String(t || '0:0').split(':').map(Number); return h * 60 + mi; };
    let d = m(end) - m(start); if (d < 0) d += 1440;
    return Math.max(0, (d - (+pauseMin || 0)) / 60);
  }
  const h = n => n.toLocaleString('de-AT', { maximumFractionDigits: 2 });
  // Zweimal tippen zum Löschen
  function twoTap(btn, label, fn) {
    let armed = false;
    btn.onclick = () => {
      if (!armed) { armed = true; btn.textContent = btn.dataset.all !== undefined ? 'Wirklich alle abhaken? Nochmal tippen' : 'Wirklich? Nochmal tippen'; btn.classList.add('danger'); setTimeout(() => { armed = false; btn.textContent = label; btn.classList.remove('danger'); }, 4000); return; }
      fn();
    };
  }

  // ---------- kleine Helfer ----------
  function toast(msg, bad) {
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), bad ? 6000 : 2200);
  }
  async function safe(fn) {
    try { return await fn(); }
    catch (e) { console.error(e); toast('Fehler: ' + (e.message || e) + '. Internetverbindung prüfen und nochmal versuchen.', true); }
  }
  function progressOf(tower, checks) {
    const tpl = T[tower.tower_type]; if (!tpl) return { wls: 0, fin: 0 };
    const r = {};
    ['wls', 'fin'].forEach(p => {
      const keys = new Set(window.flatItems(tpl, p).map(i => i.key));
      const done = checks.filter(c => c.tower_id === tower.id && c.phase === p && keys.has(c.item_id)).length;
      r[p] = pct(done, keys.size); r[p + 'Done'] = done; r[p + 'Total'] = keys.size;
    });
    return r;
  }
  function bar(p) { return `<span class="bar"><i style="width:${p}%"></i></span>`; }
  async function compress(file, maxSide) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(res, 'image/jpeg', 0.8));
  }
  function header(inner, back) {
    return `<header class="top"><div class="wrap topin">
      ${back ? `<a class="back" href="${back}" aria-label="Zurück">←</a>` : `<img class="logo" src="img/logo-96.png" alt="Deliri" width="34" height="36">`}
      <div class="ttl">${inner}</div>
      ${S.user() ? `<button class="ghost small" id="logout" type="button">Abmelden</button>` : ''}
    </div></header>
    ${S.mode === 'demo' ? `<div class="demo wrap">Demo-Modus: Daten bleiben nur auf diesem Gerät. Für das Team Supabase einrichten (siehe Anleitung).</div>` : ''}`;
  }
  function topnav(active) {
    const items = [['tuerme', '#/', 'Türme'], ['zeit', '#/zeit', 'Meine Zeit']];
    if (S.user()?.isAdmin) items.push(['team', '#/team', 'Team']);
    return `<nav class="tabs wrap mainnav">${items.map(([k, href, l]) => `<a href="${href}" aria-selected="${k === active}">${l}</a>`).join('')}</nav>`;
  }
  function bindLogout() { const b = document.getElementById('logout'); if (b) b.onclick = async () => { await S.signOut(); location.hash = '#/'; render(); }; }

  // ---------- Login ----------
  function viewLogin() {
    app.innerHTML = `${header('<div class="brand">DELIRI</div><div class="sub">Turm-App</div>')}
    <main class="wrap narrow">
      <form class="card" id="f-login">
        <img class="biglogo" src="img/logo-240.png" alt="Deliri" width="96" height="100">
        <h1>Anmelden</h1>
        <p class="muted">${S.mode === 'demo' ? 'Im Demo-Modus reicht ein Name oder eine E-Mail.' : 'Du bekommst einen Anmeldelink per E-Mail. Oder mit Passwort, falls eines vergeben wurde.'}</p>
        <label class="fld">E-Mail<input id="l-email" type="${S.mode === 'demo' ? 'text' : 'email'}" required autocomplete="email" placeholder="name@deliri.at"></label>
        ${S.mode === 'demo' ? '' : `<label class="fld">Passwort (optional)<input id="l-pw" type="password" autocomplete="current-password"></label>`}
        <button class="primary" type="submit">Weiter</button>
        <p class="muted small" id="l-msg"></p>
      </form>
    </main>`;
    document.getElementById('f-login').onsubmit = e => {
      e.preventDefault();
      const email = document.getElementById('l-email').value.trim();
      const pw = document.getElementById('l-pw')?.value || '';
      safe(async () => {
        await S.signIn(email, pw);
        if (S.user()) render();
        else document.getElementById('l-msg').textContent = 'Link wurde an ' + email + ' geschickt. Bitte E-Mail öffnen und auf den Link tippen.';
      });
    };
  }
  function viewName() {
    app.innerHTML = `${header('<div class="brand">DELIRI</div><div class="sub">Turm-App</div>')}
    <main class="wrap narrow"><form class="card" id="f-name">
      <h1>Wie heißt du?</h1>
      <p class="muted">Dein Name steht bei jedem Häkchen und jeder Unterschrift.</p>
      <label class="fld">Vor- und Nachname<input id="n-name" required autocomplete="name"></label>
      <button class="primary" type="submit">Speichern</button>
    </form></main>`;
    document.getElementById('f-name').onsubmit = e => { e.preventDefault(); safe(async () => { await S.setName(document.getElementById('n-name').value.trim()); render(); }); };
  }

  // ---------- Start ----------
  async function viewHome() {
    app.innerHTML = header('<div class="brand">DELIRI</div><div class="sub">Turm-App</div>') + topnav('tuerme') + `<main class="wrap"><p class="muted">Lade …</p></main>`;
    bindLogout();
    const [towers, checks, defects] = await Promise.all([S.listTowers(), S.allChecks(), S.listDefects({ status: 'offen' })]);
    const list = towers.filter(t => homeFilter === 'alle' || t.status === homeFilter);
    const parks = [...new Set(list.map(t => t.park))];
    const openBy = id => defects.filter(d => d.tower_id === id).length;

    app.querySelector('main').innerHTML = `
      <div class="row between">
        <h1>Türme</h1>
        <a class="primary" href="#/neu">+ Neuer Turm</a>
      </div>
      ${defects.length ? `<section class="card warnbox">
        <h2>Offene Mängel <span class="pill bad">${defects.length}</span></h2>
        <ul class="dlist">${defects.slice(0, 6).map(d => `<li><a href="#/t/${d.tower_id}/maengel">
          <b>${esc(d.title)}</b><span>${esc(d.towers ? d.towers.park + ' · ' + d.towers.name : '')}${d.location ? ' · ' + esc(d.location) : ''}${d.needs_part ? ' · Teil: ' + esc(d.needs_part) : ''}</span></a></li>`).join('')}</ul>
        ${defects.length > 6 ? `<p class="muted small">und ${defects.length - 6} weitere, siehe Turm</p>` : ''}
      </section>` : ''}
      <div class="chips" role="group" aria-label="Filter">
        ${[['offen', 'In Arbeit'], ['abgeschlossen', 'Archiv'], ['alle', 'Alle']].map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${homeFilter === k}">${l}</button>`).join('')}
      </div>
      ${list.length ? parks.map(p => `<section class="park"><div class="row between parkhead"><h3>${esc(p)}</h3><a class="ghost small" href="#/tag/${today()}/${encodeURIComponent(p)}">Tagesbericht heute</a></div><div class="tgrid">
        ${list.filter(t => t.park === p).map(t => { const pr = progressOf(t, checks); const od = openBy(t.id); return `
          <a class="card tower" href="#/t/${t.id}/tag">
            <div class="row between"><b class="tname">${esc(t.name)}</b>
              ${t.status === 'abgeschlossen' ? '<span class="pill ok">Fertig</span>' : od ? `<span class="pill bad">${od} Mangel${od > 1 ? '' : ''}</span>` : '<span class="pill">In Arbeit</span>'}</div>
            <div class="muted small">${esc(T[t.tower_type]?.name || t.tower_type)} · ${fmtDay(t.created_at)}</div>
            <div class="prog"><span>WLS</span>${bar(pr.wls)}<span class="num">${pr.wls}%</span></div>
            <div class="prog"><span>Fin.</span>${bar(pr.fin)}<span class="num">${pr.fin}%</span></div>
          </a>`; }).join('')}
      </div></section>`).join('') : `<div class="card empty"><p><b>${homeFilter === 'abgeschlossen' ? 'Noch keine abgeschlossenen Türme.' : 'Noch kein Turm angelegt.'}</b></p><p class="muted">Leg den ersten Turm an, z.B. Windpark Lavamünd, WEA 01.</p></div>`}`;
    app.querySelectorAll('.chip').forEach(b => b.onclick = () => { homeFilter = b.dataset.f; viewHome(); });
  }

  // ---------- Neuer Turm ----------
  async function viewNew() {
    const towers = await S.listTowers();
    const parks = [...new Set(towers.map(t => t.park))];
    app.innerHTML = header('<div class="sub">Neuer Turm</div>', '#/') + `
    <main class="wrap narrow"><form class="card" id="f-new">
      <label class="fld">Windpark<input id="t-park" required list="parks" placeholder="Windpark Lavamünd" value="${esc(parks[0] || '')}">
        <datalist id="parks">${parks.map(p => `<option value="${esc(p)}">`).join('')}</datalist></label>
      <label class="fld">Turm / WEA Nummer<input id="t-name" required placeholder="WEA 01"></label>
      <label class="fld">Turmtyp<select id="t-type">${Object.values(T).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
      <label class="fld">Kunde<input id="t-cust" value="Max Bögl"></label>
      <button class="primary" type="submit">Turm anlegen</button>
    </form></main>`;
    bindLogout();
    document.getElementById('f-new').onsubmit = e => {
      e.preventDefault();
      safe(async () => {
        const t = await S.createTower({ park: document.getElementById('t-park').value.trim(), name: document.getElementById('t-name').value.trim(), tower_type: document.getElementById('t-type').value, customer: document.getElementById('t-cust').value.trim() });
        location.hash = '#/t/' + t.id + '/tag';
      });
    };
  }

  // ---------- Turm ----------
  async function viewTower(id, tab) {
    unsub();
    const tower = await S.getTower(id);
    if (!tower) { app.innerHTML = header('<div class="sub">Nicht gefunden</div>', '#/') + '<main class="wrap"><p>Diesen Turm gibt es nicht mehr.</p></main>'; return; }
    const tpl = T[tower.tower_type];
    const [checks, signoffs, defects] = await Promise.all([S.getChecks(id), S.getSignoffs(id), S.listDefects({ towerId: id })]);
    const pr = progressOf(tower, checks);
    const openDef = defects.filter(d => d.status === 'offen').length;
    const tabs = [['tag', 'Tag', ''], ['wls', 'WLS', pr.wls + '%'], ['fin', 'Finish', pr.fin + '%'], ['maengel', 'Mängel', openDef ? String(openDef) : ''], ['info', 'Info', '']];

    app.innerHTML = header(`<div class="sub">${esc(tower.park)}</div><div class="brand sm">${esc(tower.name)}</div>`, '#/') + `
      <nav class="tabs wrap" role="tablist">${tabs.map(([k, l, b]) => `<a role="tab" href="#/t/${id}/${k}" aria-selected="${tab === k}">${l}${b ? `<span class="badge${k === 'maengel' ? ' bad' : ''}">${b}</span>` : ''}</a>`).join('')}</nav>
      <main class="wrap" id="tv"></main>`;
    bindLogout();
    const main = document.getElementById('tv');
    if (!tpl) { main.innerHTML = '<p>Unbekannter Turmtyp ' + esc(tower.tower_type) + '.</p>'; return; }

    if (tab === 'wls' || tab === 'fin') renderPhase(main, tower, tpl, tab, checks, signoffs);
    else if (tab === 'maengel') renderDefects(main, tower, defects);
    else if (tab === 'tag') await renderDay(main, tower, tpl, checks, defects);
    else renderInfo(main, tower, tpl, signoffs, pr);

    let tmr;
    unsub = S.subscribe(id, () => { clearTimeout(tmr); tmr = setTimeout(() => { if (!document.querySelector('form.editing')) viewTower(id, tab); }, 600); });
  }

  function renderPhase(main, tower, tpl, phase, checks, signoffs) {
    const ph = tpl.phases[phase];
    const map = new Map(checks.filter(c => c.phase === phase).map(c => [c.item_id, c]));
    const items = window.flatItems(tpl, phase);
    const done = items.filter(i => map.has(i.key)).length;
    const who = c => c ? `<span class="who">${esc(c.done_by_name)} · ${fmt(c.done_at)}</span>` : '';

    let html = `<div class="card sum"><div class="row between"><h1>${esc(ph.title)}</h1><span class="num big">${done}/${items.length}</span></div>${bar(pct(done, items.length))}</div>`;
    const matrixOpen = [];
    ph.sections.forEach(sec => {
      html += `<section class="card sec"><h2>${esc(sec.title)}</h2>${sec.note ? `<p class="muted small">${esc(sec.note)}</p>` : ''}`;
      if (sec.type === 'matrix') {
        const openKeys = sec.rows.flatMap(r => r.cells.map(c => r.id + '-' + c)).filter(k => !map.has(k));
        const mi = matrixOpen.push(openKeys) - 1;
        html += openKeys.length
          ? `<div class="allbar"><button type="button" class="ghost allbtn" data-all="${mi}">Alle abhaken (${openKeys.length} offene Felder)</button><span class="muted small">Nur wenn wirklich alle Ringe passen. Einzelne Felder lassen sich danach wieder abwählen.</span></div>`
          : `<p class="okmsg small">Alle Felder dieser Matrix erledigt.</p>`;
        html += `<div class="tblwrap"><table class="mx"><thead><tr><th class="l">Ring</th><th class="l">Teil</th>${sec.cols.map(c => `<th title="${esc(c.help)}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>`;
        sec.rows.forEach(r => {
          const all = r.cells.every(c => map.has(r.id + '-' + c));
          html += `<tr class="${all ? 'done' : ''}"><td class="l ring">${esc(r.label)}</td><td class="l mono small">${esc(r.sub || '')}</td>${sec.cols.map(c => {
            if (!r.cells.includes(c.id)) return '<td class="na">·</td>';
            const k = r.id + '-' + c.id, ch = map.get(k);
            return `<td><input type="checkbox" class="ck" data-k="${k}" ${ch ? 'checked' : ''} aria-label="${esc(r.label + ' ' + c.help)}" title="${ch ? esc(ch.done_by_name + ', ' + fmt(ch.done_at)) : esc(c.help)}"></td>`;
          }).join('')}</tr>`;
        });
        html += `</tbody></table></div><p class="muted small legend">${sec.cols.map(c => `<b>${esc(c.label)}</b> ${esc(c.help)}`).join(' · ')}</p>`;
      } else {
        html += `<ul class="check">${sec.items.map(it => {
          const ch = map.get(it.id);
          if (it.input) return `<li class="${ch ? 'is-done' : ''}"><div class="inrow">
              <span class="txt">${esc(it.text)}${it.ref ? ` <span class="ref">${esc(it.ref)}</span>` : ''}</span>
              <span class="mm"><input type="number" inputmode="decimal" id="in-${it.id}" value="${esc(ch?.value || '')}" placeholder="mm" aria-label="${esc(it.text)}"><button type="button" class="ghost small" data-in="${it.id}" data-min="${it.min}" data-max="${it.max}">Speichern</button></span>
              ${ch ? `${(+ch.value < it.min || +ch.value > it.max) ? '<span class="pill bad">außer Toleranz</span>' : '<span class="pill ok">in Toleranz</span>'} ${who(ch)}` : ''}</div></li>`;
          return `<li class="${ch ? 'is-done' : ''}"><label><input type="checkbox" class="ck" data-k="${it.id}" ${ch ? 'checked' : ''}>
            <span class="txt">${esc(it.text)}${it.ref ? ` <span class="ref">${esc(it.ref)}</span>` : ''}${who(ch)}</span></label></li>`;
        }).join('')}</ul>`;
      }
      html += '</section>';
    });

    // Abschluss
    const so = signoffs.filter(s => s.phase === phase);
    const open = items.filter(i => !map.has(i.key));
    html += `<section class="card sec sign"><h2>Abschluss ${esc(ph.title)}</h2>
      ${so.map(s => `<div class="signed"><b>✓ ${esc(s.name)}</b> <span class="muted small">${fmt(s.signed_at)}${s.open_items ? ` · mit ${s.open_items} offenen Punkten` : ''}</span>${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}</div>`).join('')}
      <form id="f-sign">
        ${open.length ? `<p class="warn small"><b>${open.length} Punkte offen:</b> ${open.slice(0, 5).map(o => esc(o.label)).join(' · ')}${open.length > 5 ? ' …' : ''}</p>` : '<p class="okmsg small">Alle Punkte erledigt.</p>'}
        <label class="fld">Bemerkung (optional)<textarea id="s-note" rows="2" placeholder="z.B. Kontrollmaß nachgemessen, Teil X fehlt"></textarea></label>
        ${open.length ? `<label class="confirm"><input type="checkbox" id="s-ok" required> Ich schließe trotz offener Punkte ab</label>` : ''}
        <button class="primary" type="submit">Als ${esc(S.user().name)} unterschreiben</button>
      </form></section>`;
    main.innerHTML = html;

    main.querySelectorAll('[data-all]').forEach(btn => {
      const keys = matrixOpen[+btn.dataset.all], label = btn.textContent;
      twoTap(btn, label, () => safe(async () => {
        btn.disabled = true; btn.textContent = 'Speichere …';
        await S.setChecks(tower.id, phase, keys);
        toast(keys.length + ' Felder abgehakt');
        viewTower(tower.id, phase);
      }));
    });
    main.querySelectorAll('input.ck').forEach(cb => cb.onchange = () => safe(async () => {
      cb.disabled = true;
      await S.setCheck(tower.id, phase, cb.dataset.k, cb.checked);
      viewTower(tower.id, phase);
    }));
    main.querySelectorAll('button[data-in]').forEach(b => b.onclick = () => safe(async () => {
      const v = document.getElementById('in-' + b.dataset.in).value.trim();
      await S.setCheck(tower.id, phase, b.dataset.in, !!v, v);
      if (v && (+v < +b.dataset.min || +v > +b.dataset.max)) toast('Außer Toleranz. Leiter korrigieren und neu messen.', true);
      viewTower(tower.id, phase);
    }));
    const f = document.getElementById('f-sign');
    f.addEventListener('focusin', () => f.classList.add('editing'));
    f.onsubmit = e => {
      e.preventDefault();
      safe(async () => {
        await S.addSignoff({ tower_id: tower.id, phase, name: S.user().name, note: document.getElementById('s-note').value.trim(), open_items: open.length });
        if (phase === 'fin') await S.updateTower(tower.id, { status: 'abgeschlossen' });
        toast(phase === 'fin' ? 'Turm abgeschlossen und archiviert' : 'WLS unterschrieben');
        viewTower(tower.id, phase);
      });
    };
  }

  async function renderDefects(main, tower, defects) {
    const others = (await S.listDefects({ status: 'offen' })).filter(d => d.tower_id !== tower.id && d.towers?.park === tower.park);
    const card = async d => {
      const url = await S.photoUrl(d.photo_path);
      return `<li class="card defect ${d.status}">
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="Foto Mangel" loading="lazy"></a>` : ''}
        <div class="dbody">
          <div class="row between"><b>${esc(d.title)}</b>${d.status === 'offen' ? '<span class="pill bad">offen</span>' : '<span class="pill ok">erledigt</span>'}</div>
          <div class="muted small">${d.location ? esc(d.location) + ' · ' : ''}${esc(d.created_by_name)} · ${fmt(d.created_at)}</div>
          ${d.needs_part ? `<div class="small"><b>Ersatzteil:</b> ${esc(d.needs_part)}</div>` : ''}
          ${d.description ? `<p class="small">${esc(d.description)}</p>` : ''}
          ${d.status === 'erledigt' ? `<div class="muted small">Erledigt von ${esc(d.resolved_by_name)} · ${fmt(d.resolved_at)}</div>` : ''}
          <button type="button" class="ghost small" data-res="${d.id}" data-to="${d.status === 'offen' ? '1' : '0'}">${d.status === 'offen' ? 'Als erledigt markieren' : 'Wieder öffnen'}</button>
        </div></li>`;
    };
    const mine = await Promise.all(defects.map(card));
    main.innerHTML = `
      <form class="card sec" id="f-def">
        <h2>Mangel melden</h2>
        <label class="fld">Was ist kaputt oder fehlt?<input id="d-title" required placeholder="z.B. Leitersprosse verbogen"></label>
        <div class="two">
          <label class="fld">Wo?<input id="d-loc" placeholder="Ring C14, Plattform …"></label>
          <label class="fld">Benötigtes Ersatzteil<input id="d-part" placeholder="Materialnummer oder Beschreibung"></label>
        </div>
        <label class="fld">Beschreibung<textarea id="d-desc" rows="2"></textarea></label>
        <label class="fld">Foto<input id="d-photo" type="file" accept="image/*" capture="environment"></label>
        <button class="primary" type="submit">Mangel speichern</button>
      </form>
      ${others.length ? `<section class="card warnbox"><h2>Offen in anderen Türmen im ${esc(tower.park)}</h2><ul class="dlist">${others.map(d => `<li><a href="#/t/${d.tower_id}/maengel"><b>${esc(d.title)}</b><span>${esc(d.towers?.name || '')}${d.location ? ' · ' + esc(d.location) : ''}${d.needs_part ? ' · Teil: ' + esc(d.needs_part) : ''}</span></a></li>`).join('')}</ul></section>` : ''}
      <h2 class="h2out">Mängel an diesem Turm</h2>
      ${mine.length ? `<ul class="defects">${mine.join('')}</ul>` : '<p class="muted">Keine Mängel gemeldet.</p>'}`;

    const f = document.getElementById('f-def');
    f.addEventListener('focusin', () => f.classList.add('editing'));
    f.onsubmit = e => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Speichere …';
      safe(async () => {
        const file = document.getElementById('d-photo').files[0];
        const blob = file ? await compress(file, S.mode === 'demo' ? 800 : 1600) : null;
        await S.addDefect({ tower_id: tower.id, title: document.getElementById('d-title').value.trim(), location: document.getElementById('d-loc').value.trim(), needs_part: document.getElementById('d-part').value.trim(), description: document.getElementById('d-desc').value.trim() }, blob);
        toast('Mangel gespeichert');
        viewTower(tower.id, 'maengel');
      }).finally(() => { btn.disabled = false; btn.textContent = 'Mangel speichern'; });
    };
    main.querySelectorAll('[data-res]').forEach(b => b.onclick = () => safe(async () => { await S.resolveDefect(b.dataset.res, b.dataset.to === '1'); viewTower(tower.id, 'maengel'); }));
  }

  function renderInfo(main, tower, tpl, signoffs, pr) {
    main.innerHTML = `
      <section class="card sec"><h2>Turm</h2>
        <dl class="kv"><dt>Windpark</dt><dd>${esc(tower.park)}</dd><dt>Turm</dt><dd>${esc(tower.name)}</dd><dt>Typ</dt><dd>${esc(tpl.name)}</dd>
        <dt>Kunde</dt><dd>${esc(tower.customer || '')}</dd><dt>Angelegt</dt><dd>${fmtDay(tower.created_at)} ${tower.created_by_name ? '· ' + esc(tower.created_by_name) : ''}</dd>
        <dt>Status</dt><dd>${tower.status === 'abgeschlossen' ? 'Abgeschlossen' : 'In Arbeit'} · WLS ${pr.wls}% · Finishing ${pr.fin}%</dd></dl>
        <div class="row wrapgap">
          <a class="ghost" href="#/t/${tower.id}/protokoll">Protokoll anzeigen / drucken</a>
          <button type="button" class="ghost" id="b-status">${tower.status === 'abgeschlossen' ? 'Wieder öffnen' : 'Als abgeschlossen ablegen'}</button>
          <button type="button" class="ghost danger" id="b-del">Turm löschen</button>
        </div>
        <p class="muted small" id="del-hint"></p>
      </section>
      <section class="card sec"><h2>Ablauf Leitermontage</h2><ol class="flow">${tpl.flow.map(([h, p]) => `<li><b>${esc(h)}</b><p>${esc(p)}</p></li>`).join('')}</ol></section>
      <section class="card sec"><h2>Was bei diesem Turmtyp auffällt</h2>${tpl.hints.map(([k, h, p]) => `<div class="flag ${k}"><b>${esc(h)}</b><p>${esc(p)}</p></div>`).join('')}
        <p class="muted small">Quelle: ${esc(tpl.source)}</p></section>`;
    document.getElementById('b-status').onclick = () => safe(async () => { await S.updateTower(tower.id, { status: tower.status === 'abgeschlossen' ? 'offen' : 'abgeschlossen' }); viewTower(tower.id, 'info'); });
    let armed = false;
    document.getElementById('b-del').onclick = e => {
      if (!armed) { armed = true; e.target.textContent = 'Wirklich löschen? Nochmal tippen'; document.getElementById('del-hint').textContent = 'Löscht Turm, Häkchen, Unterschriften und Mängel endgültig.'; setTimeout(() => { armed = false; e.target.textContent = 'Turm löschen'; document.getElementById('del-hint').textContent = ''; }, 5000); return; }
      safe(async () => { await S.deleteTower(tower.id); location.hash = '#/'; });
    };
  }

  // ---------- Reiter Tag: Arbeitszeit, Regie, heute erledigt ----------
  async function renderDay(main, tower, tpl, checks, defects) {
    const date = selDay;
    const [wds, rgs, profiles] = await Promise.all([S.listWorkdays({ towerIds: [tower.id], date }), S.listRegie({ towerIds: [tower.id], date }), S.listProfiles()]);
    const team = profiles.filter(p => p.active);
    const myId = S.user().profileId;
    const dayChecks = checks.filter(c => isoDay(c.done_at) === date);
    const done = ['wls', 'fin'].flatMap(p => window.summarizeDay(tpl, p, dayChecks).map(x => ({ ...x, phase: tpl.phases[p].title })));
    const dayDefects = defects.filter(d => isoDay(d.created_at) === date);
    const mhWork = wds.reduce((s, w) => s + hoursOf(w.start_time, w.end_time, w.pause_min) * w.persons, 0);
    const mhRegie = rgs.reduce((s, r) => s + hoursOf(r.start_time, r.end_time) * r.persons, 0);
    const photos = await Promise.all(rgs.map(r => S.photoUrl(r.photo_path)));

    main.innerHTML = `
      <div class="card daybar">
        <button type="button" class="ghost small" id="d-prev" aria-label="Vortag">‹</button>
        <label class="dfield"><span class="sr">Datum</span><input type="date" id="d-date" value="${date}"></label>
        <button type="button" class="ghost small" id="d-next" aria-label="Nächster Tag">›</button>
        ${date !== today() ? `<button type="button" class="ghost small" id="d-today">Heute</button>` : ''}
      </div>
      <div class="kpis">
        <div class="kpi"><span>Mannstunden gesamt</span><b>${h(mhWork)}</b></div>
        <div class="kpi"><span>davon Regie</span><b>${h(mhRegie)}</b></div>
        <a class="kpi link" href="#/tag/${date}/${encodeURIComponent(tower.park)}"><span>Tagesbericht</span><b>Anzeigen →</b></a>
      </div>

      <section class="card sec">
        <h2>Arbeitszeit</h2>
        <p class="muted small">Gesamte Zeit vor Ort an diesem Turm. Ein Eintrag pro Truppe oder Zeitblock. Wer ausgewählt ist, bekommt die Zeit unter „Meine Zeit“ als Vorschlag.</p>
        ${wds.length ? `<ul class="entries">${wds.map(w => { const hh = hoursOf(w.start_time, w.end_time, w.pause_min); return `<li>
          <div class="row between"><b class="mono">${esc(w.start_time)}–${esc(w.end_time)}</b><span class="num">${h(hh)} h × ${w.persons} = <b>${h(hh * w.persons)} Mh</b></span></div>
          <div class="muted small">${w.persons} Personen${w.names ? ': ' + esc(w.names) : ''} · Pause ${w.pause_min} min</div>
          ${w.activities ? `<p class="small">${esc(w.activities)}</p>` : ''}
          <div class="row between"><span class="muted small">eingetragen von ${esc(w.created_by_name)}</span><button type="button" class="ghost small" data-delw="${w.id}">Löschen</button></div></li>`; }).join('')}</ul>` : ''}
        <form id="f-work" class="subform">
          <div class="three">
            <label class="fld">Von<input type="time" id="w-start" value="07:00" required></label>
            <label class="fld">Bis<input type="time" id="w-end" value="17:00" required></label>
            <label class="fld">Pause (min)<input type="number" id="w-pause" value="30" min="0" step="5" inputmode="numeric"></label>
          </div>
          <fieldset class="crew"><legend>Wer war dabei?</legend>
            ${team.length ? team.map(p => `<label class="crewchip"><input type="checkbox" name="crew" value="${p.id}" ${p.id === myId ? 'checked' : ''}><span>${esc(p.name)}${p.kind === 'sub' ? ' <small>Sub</small>' : ''}</span></label>`).join('') : '<p class="muted small">Noch keine Mitarbeiter angelegt (Bereich Team).</p>'}
          </fieldset>
          <label class="fld">Weitere Personen ohne App<input type="number" id="w-extra" value="0" min="0" inputmode="numeric"></label>
          <label class="fld">Tätigkeiten / Bemerkungen<textarea id="w-act" rows="2" placeholder="z.B. Gitterscheiben C05 bis C12 montiert"></textarea></label>
          <button class="primary" type="submit">Arbeitszeit speichern</button>
        </form>
      </section>

      <section class="card sec regie">
        <h2>Regiearbeiten</h2>
        <p class="muted small">Alles, was nicht im Auftrag enthalten ist, z.B. vor Ort angeordnete Zusatzarbeiten. Die Regie steht im Tagesbericht extra und ist Teil der Gesamtzeit oben.</p>
        <p class="note small"><b>Auch als Regie eintragen:</b> Stillstand wegen Wetter (Wind, Regen, Gewitter, Eis) und Stillstand oder Wartezeit wegen Kran. Bei „Was wurde gemacht?“ den Grund angeben, z.B. „Stillstand Wind“ oder „Wartezeit Kran“, und die Zeit von bis.</p>
        ${rgs.length ? `<ul class="entries">${rgs.map((r, i) => { const hh = hoursOf(r.start_time, r.end_time); return `<li>
          <div class="row between"><b>${esc(r.description)}</b><span class="num">${h(hh)} h × ${r.persons} = <b>${h(hh * r.persons)} Mh</b></span></div>
          <div class="muted small"><span class="mono">${esc(r.start_time)}–${esc(r.end_time)}</span>${r.ordered_by ? ' · angeordnet von ' + esc(r.ordered_by) : ''}${r.material ? ' · Material: ' + esc(r.material) : ''}</div>
          ${photos[i] ? `<a href="${esc(photos[i])}" target="_blank" rel="noopener"><img class="thumb" src="${esc(photos[i])}" alt="Foto Regiearbeit" loading="lazy"></a>` : ''}
          <div class="row between"><span class="muted small">eingetragen von ${esc(r.created_by_name)}</span><button type="button" class="ghost small" data-delr="${r.id}">Löschen</button></div></li>`; }).join('')}</ul>` : ''}
        <form id="f-regie" class="subform">
          <label class="fld">Was wurde gemacht?<input id="r-desc" required placeholder="z.B. Kabelrinne C03 versetzt, Stillstand Wind, Wartezeit Kran"></label>
          <label class="fld">Angeordnet von<input id="r-by" placeholder="Name, Firma (z.B. Polier Max Bögl)"></label>
          <div class="three">
            <label class="fld">Von<input type="time" id="r-start" required></label>
            <label class="fld">Bis<input type="time" id="r-end" required></label>
            <label class="fld">Personen<input type="number" id="r-pers" value="2" min="1" required inputmode="numeric"></label>
          </div>
          <label class="fld">Material (optional)<input id="r-mat" placeholder="z.B. 4× Spreizanker M12"></label>
          <label class="fld">Foto (optional)<input id="r-photo" type="file" accept="image/*" capture="environment"></label>
          <button class="primary" type="submit">Regie speichern</button>
        </form>
      </section>

      <section class="card sec">
        <h2>Heute erledigt</h2>
        <p class="muted small">Automatisch aus den abgehakten Punkten an diesem Tag.</p>
        ${done.length ? `<ul class="donelist">${done.map(d => `<li><span class="muted small">${esc(d.phase)} · ${esc(d.section)}</span>${esc(d.text)}</li>`).join('')}</ul>` : '<p class="muted">An diesem Tag wurde noch nichts abgehakt.</p>'}
        ${dayDefects.length ? `<p class="small"><b>Neue Mängel:</b> ${dayDefects.map(d => esc(d.title)).join(' · ')}</p>` : ''}
      </section>`;

    const go = d => { selDay = d; viewTower(tower.id, 'tag'); };
    document.getElementById('d-date').onchange = e => e.target.value && go(e.target.value);
    document.getElementById('d-prev').onclick = () => go(shiftDay(date, -1));
    document.getElementById('d-next').onclick = () => go(shiftDay(date, 1));
    const dt = document.getElementById('d-today'); if (dt) dt.onclick = () => go(today());
    main.querySelectorAll('form').forEach(f => f.addEventListener('focusin', () => f.classList.add('editing')));

    const v = id => document.getElementById(id).value.trim();
    document.getElementById('f-work').onsubmit = e => {
      e.preventDefault();
      safe(async () => {
        const crew = [...document.querySelectorAll('input[name=crew]:checked')].map(i => i.value);
        const extra = +v('w-extra') || 0;
        if (!crew.length && !extra) { toast('Bitte auswählen, wer dabei war.', true); return; }
        const names = crew.map(id => team.find(p => p.id === id)?.name).filter(Boolean).join(', ') + (extra ? (crew.length ? ' + ' : '') + extra + ' weitere' : '');
        await S.addWorkday({ tower_id: tower.id, work_date: date, start_time: v('w-start'), end_time: v('w-end'), pause_min: +v('w-pause') || 0, persons: crew.length + extra, names, crew, activities: v('w-act') });
        toast('Arbeitszeit gespeichert'); viewTower(tower.id, 'tag');
      });
    };
    const fr = document.getElementById('f-regie');
    fr.onsubmit = e => {
      e.preventDefault();
      const btn = fr.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Speichere …';
      safe(async () => {
        const file = document.getElementById('r-photo').files[0];
        const blob = file ? await compress(file, S.mode === 'demo' ? 800 : 1600) : null;
        await S.addRegie({ tower_id: tower.id, work_date: date, description: v('r-desc'), ordered_by: v('r-by'), start_time: v('r-start'), end_time: v('r-end'), persons: +v('r-pers') || 1, material: v('r-mat') }, blob);
        toast('Regie gespeichert'); viewTower(tower.id, 'tag');
      }).finally(() => { btn.disabled = false; btn.textContent = 'Regie speichern'; });
    };
    main.querySelectorAll('[data-delw]').forEach(b => twoTap(b, 'Löschen', () => safe(async () => { await S.deleteWorkday(b.dataset.delw); viewTower(tower.id, 'tag'); })));
    main.querySelectorAll('[data-delr]').forEach(b => twoTap(b, 'Löschen', () => safe(async () => { await S.deleteRegie(b.dataset.delr); viewTower(tower.id, 'tag'); })));
  }

  // ---------- Tagesbericht je Windpark und Datum (druckbar) ----------
  async function viewDayReport(date, park) {
    const towers = (await S.listTowers()).filter(t => t.park === park).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
    const ids = towers.map(t => t.id);
    const [wds, rgs, allDef, checksArr] = await Promise.all([
      ids.length ? S.listWorkdays({ towerIds: ids, date }) : [], ids.length ? S.listRegie({ towerIds: ids, date }) : [],
      S.listDefects({}), Promise.all(towers.map(t => S.getChecks(t.id)))
    ]);
    let totWork = 0, totRegie = 0;
    const rows = towers.map((t, i) => {
      const tpl = T[t.tower_type];
      const w = wds.filter(x => x.tower_id === t.id), r = rgs.filter(x => x.tower_id === t.id);
      const dc = checksArr[i].filter(c => isoDay(c.done_at) === date);
      const done = tpl ? ['wls', 'fin'].flatMap(p => window.summarizeDay(tpl, p, dc).map(x => ({ ...x, phase: tpl.phases[p].title }))) : [];
      const def = allDef.filter(d => d.tower_id === t.id && isoDay(d.created_at) === date);
      const mw = w.reduce((s, x) => s + hoursOf(x.start_time, x.end_time, x.pause_min) * x.persons, 0);
      const mr = r.reduce((s, x) => s + hoursOf(x.start_time, x.end_time) * x.persons, 0);
      totWork += mw; totRegie += mr;
      return { t, w, r, done, def, mw, mr, any: w.length || r.length || done.length || def.length };
    }).filter(x => x.any);

    const text = () => [
      `TAGESBERICHT ${dayLabel(date)}`, `${park} · Deliri GmbH`, '',
      ...rows.flatMap(x => [
        `${x.t.name} (${T[x.t.tower_type]?.name || ''})`,
        ...x.w.map(w => `  Arbeitszeit ${w.start_time}–${w.end_time}, Pause ${w.pause_min} min, ${w.persons} Pers.${w.names ? ' (' + w.names + ')' : ''} = ${h(hoursOf(w.start_time, w.end_time, w.pause_min) * w.persons)} Mh${w.activities ? '\n  ' + w.activities : ''}`),
        ...x.done.map(d => `  Erledigt ${d.section}: ${d.text}`),
        ...x.r.map(r => `  REGIE ${r.start_time}–${r.end_time}, ${r.persons} Pers. = ${h(hoursOf(r.start_time, r.end_time) * r.persons)} Mh: ${r.description}${r.ordered_by ? ' (angeordnet von ' + r.ordered_by + ')' : ''}${r.material ? ', Material: ' + r.material : ''}`),
        ...x.def.map(d => `  Mangel: ${d.title}${d.location ? ', ' + d.location : ''}${d.needs_part ? ', Teil: ' + d.needs_part : ''}`), ''
      ]),
      `Mannstunden gesamt: ${h(totWork)} · davon Regie: ${h(totRegie)} · Auftrag: ${h(Math.max(0, totWork - totRegie))}`
    ].join('\n');

    app.innerHTML = `<div class="noprint">${header('<div class="sub">Tagesbericht</div><div class="brand sm">' + esc(park) + '</div>', '#/')}</div>
      <main class="wrap report">
        <div class="row between noprint wrapgap">
          <div class="row"><a class="ghost small" href="#/tag/${shiftDay(date, -1)}/${encodeURIComponent(park)}" aria-label="Vortag">‹</a>
            <input type="date" id="rp-date" value="${date}" aria-label="Datum">
            <a class="ghost small" href="#/tag/${shiftDay(date, 1)}/${encodeURIComponent(park)}" aria-label="Nächster Tag">›</a></div>
          <div class="row"><button class="ghost" type="button" id="rp-copy">Text kopieren</button><button class="primary" type="button" onclick="window.print()">Drucken / PDF</button></div>
        </div>
        <div class="rephead">
          <div><div class="eyebrow">Deliri GmbH · Tagesbericht</div><h1>${esc(dayLabel(date))}</h1><p class="muted">${esc(park)}${towers[0]?.customer ? ' · Auftraggeber ' + esc(towers[0].customer) : ''}</p></div>
          <dl class="totals"><dt>Mannstunden gesamt</dt><dd>${h(totWork)}</dd><dt>davon Regie</dt><dd>${h(totRegie)}</dd><dt>Auftrag</dt><dd>${h(Math.max(0, totWork - totRegie))}</dd></dl>
        </div>
        ${totRegie > totWork ? '<p class="warn small">Regiestunden sind höher als die eingetragene Gesamtzeit. Bitte Arbeitszeit prüfen.</p>' : ''}
        ${rows.length ? rows.map(x => `<section class="reptower">
          <h2>${esc(x.t.name)} <span class="muted small">${esc(T[x.t.tower_type]?.name || '')}</span></h2>
          ${x.w.length ? `<table class="rep"><thead><tr><th>Zeit</th><th>Pause</th><th>Pers.</th><th>Namen</th><th class="r">Mh</th></tr></thead><tbody>${x.w.map(w => `<tr><td class="mono">${esc(w.start_time)}–${esc(w.end_time)}</td><td>${w.pause_min} min</td><td>${w.persons}</td><td>${esc(w.names)}</td><td class="r num">${h(hoursOf(w.start_time, w.end_time, w.pause_min) * w.persons)}</td></tr>${w.activities ? `<tr class="sub"><td colspan="5">${esc(w.activities)}</td></tr>` : ''}`).join('')}</tbody></table>` : '<p class="warn small">Keine Arbeitszeit eingetragen.</p>'}
          ${x.done.length ? `<h3>Erledigt</h3><ul class="donelist">${x.done.map(d => `<li><span class="muted small">${esc(d.section)}</span>${esc(d.text)}</li>`).join('')}</ul>` : ''}
          ${x.r.length ? `<h3>Regiearbeiten</h3><table class="rep"><thead><tr><th>Zeit</th><th>Tätigkeit</th><th>Angeordnet von</th><th>Pers.</th><th class="r">Mh</th></tr></thead><tbody>${x.r.map(r => `<tr><td class="mono">${esc(r.start_time)}–${esc(r.end_time)}</td><td>${esc(r.description)}${r.material ? '<br><span class="muted">Material: ' + esc(r.material) + '</span>' : ''}</td><td>${esc(r.ordered_by)}</td><td>${r.persons}</td><td class="r num">${h(hoursOf(r.start_time, r.end_time) * r.persons)}</td></tr>`).join('')}</tbody></table>` : ''}
          ${x.def.length ? `<h3>Neue Mängel</h3><ul class="donelist">${x.def.map(d => `<li>${esc(d.title)}${d.location ? ' · ' + esc(d.location) : ''}${d.needs_part ? ' · Teil: ' + esc(d.needs_part) : ''}</li>`).join('')}</ul>` : ''}
        </section>`).join('') : `<div class="card empty"><p><b>Für diesen Tag ist noch nichts eingetragen.</b></p><p class="muted">Arbeitszeit und Regie trägt das Team im Turm unter „Tag“ ein.</p></div>`}
        ${rows.length ? `<div class="signs"><div><span></span>Deliri GmbH, Name / Unterschrift</div><div><span></span>Auftraggeber, Name / Unterschrift</div></div>` : ''}
      </main>`;
    bindLogout();
    document.getElementById('rp-date').onchange = e => { if (e.target.value) location.hash = '#/tag/' + e.target.value + '/' + encodeURIComponent(park); };
    document.getElementById('rp-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(text()); toast('Text kopiert, z.B. für E-Mail oder WhatsApp'); }
      catch (e) { const ta = document.createElement('textarea'); ta.value = text(); document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Text kopiert'); }
    };
  }

  // ---------- Arbeitszeit: Helfer ----------
  const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const toMin = t => { const [a, b] = String(t || '0:0').split(':').map(Number); return a * 60 + b; };
  const daysIn = m => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  const shiftMonth = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const monthLabel = m => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 15).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
  const wd = s => new Date(s + 'T12:00').toLocaleDateString('de-AT', { weekday: 'short' });
  const hm = min => { const neg = min < 0, m = Math.round(Math.abs(min)); return (neg ? '−' : '') + Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
  const hmSigned = min => (min > 0 ? '+' : '') + hm(min);
  const dec = (n, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('de-AT', { maximumFractionDigits: d });
  const kw = s => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7); };
  const KINDS = { arbeit: 'Arbeit', schulung: 'Schulung', urlaub: 'Urlaub', krank: 'Krankenstand', za: 'Zeitausgleich' };
  const ABSENT = k => k === 'urlaub' || k === 'krank' || k === 'za';

  // Gesetzliche Feiertage Österreich
  const holCache = {};
  function holidaysAT(y) {
    if (holCache[y]) return holCache[y];
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451),
      mon = Math.floor((hh + l - 7 * m + 114) / 31), day = ((hh + l - 7 * m + 114) % 31) + 1;
    const easter = isoDay(new Date(y, mon - 1, day)), plus = n => shiftDay(easter, n);
    const map = new Map([[`${y}-01-01`, 'Neujahr'], [`${y}-01-06`, 'Heilige Drei Könige'], [plus(1), 'Ostermontag'], [`${y}-05-01`, 'Staatsfeiertag'],
      [plus(39), 'Christi Himmelfahrt'], [plus(50), 'Pfingstmontag'], [plus(60), 'Fronleichnam'], [`${y}-08-15`, 'Mariä Himmelfahrt'],
      [`${y}-10-26`, 'Nationalfeiertag'], [`${y}-11-01`, 'Allerheiligen'], [`${y}-12-08`, 'Mariä Empfängnis'], [`${y}-12-25`, 'Christtag'], [`${y}-12-26`, 'Stefanitag']]);
    return (holCache[y] = map);
  }
  const holidayName = d => holidaysAT(+d.slice(0, 4)).get(d) || '';
  const isWorkday = d => { const w = new Date(d + 'T12:00').getDay(); return w >= 1 && w <= 5 && !holidayName(d); };
  const dailySoll = p => (+p.weekly_hours || 40) * 60 / 5;
  const startOf = p => p.balance_date || (p.created_at ? p.created_at.slice(0, 8) + '01' : today().slice(0, 8) + '01');

  // Arbeitsminuten eines Eintrags (laufende Einträge bis jetzt)
  function workMin(e) {
    if (ABSENT(e.kind)) return 0;
    if (!e.start_time) return 0;
    const end = e.end_time || (e.work_date === today() ? nowHM() : e.start_time);
    let d = toMin(end) - toMin(e.start_time); if (d < 0) d += 1440;
    let p = +e.pause_min || 0;
    if (e.pause_started && !e.end_time) { let q = toMin(nowHM()) - toMin(e.pause_started); if (q < 0) q += 1440; p += q; }
    return Math.max(0, d - p);
  }
  // Ist-Minuten für den Gleitzeitsaldo: Arbeit + Fahrzeit, Urlaub/Krankenstand mit Stunden gutgeschrieben, ZA = 0
  const istMin = e => e.kind === 'urlaub' || e.kind === 'krank' ? (+e.hours || 0) * 60 : e.kind === 'za' ? 0 : workMin(e) + (+e.travel_min || 0);

  // Tageswerte und Hinweise nach AZG
  function dayStats(entries, prevEntries) {
    const days = {};
    entries.forEach(e => { (days[e.work_date] = days[e.work_date] || []).push(e); });
    const lastEnd = list => { let best = null; list.forEach(e => { if (!e.end_time || !e.start_time) return; let end = toMin(e.end_time); if (end < toMin(e.start_time)) end += 1440; best = best === null ? end : Math.max(best, end); }); return best; };
    const out = {};
    Object.keys(days).sort().forEach(d => {
      const list = days[d], timed = list.filter(e => !ABSENT(e.kind));
      const work = timed.reduce((s, e) => s + workMin(e), 0), pause = timed.reduce((s, e) => s + (+e.pause_min || 0), 0);
      const travel = timed.reduce((s, e) => s + (+e.travel_min || 0), 0), warn = [];
      if (timed.length) {
        if (work > 360 && pause < 30) warn.push('Pause unter 30 min bei über 6 h');
        if (work > 600) warn.push('Über 10 h Arbeitszeit');
        if (new Date(d + 'T12:00').getDay() === 0) warn.push('Arbeit am Sonntag');
        if (holidayName(d)) warn.push('Arbeit am Feiertag');
        if (timed.some(e => !e.end_time) && d < today()) warn.push('Nicht beendet, Endzeit fehlt');
        const prev = shiftDay(d, -1), pl = (days[prev] || prevEntries.filter(e => e.work_date === prev)).filter(e => !ABSENT(e.kind));
        const le = pl.length ? lastEnd(pl) : null, fs = Math.min(...timed.filter(e => e.start_time).map(e => toMin(e.start_time)));
        if (le !== null && isFinite(fs) && (fs + 1440 - le) < 660) warn.push('Ruhezeit unter 11 h');
      }
      out[d] = { list, work, pause, travel, warn, overnight: list.some(e => e.overnight) };
    });
    return out;
  }

  // Konten: Gleitzeitsaldo und Urlaub ab Stichtag bis Monatsende
  function accounts(p, entries, month) {
    const start = startOf(p), mFrom = month + '-01', mTo = month + '-' + String(daysIn(month)).padStart(2, '0');
    const ds = dailySoll(p), byDay = {};
    entries.forEach(e => { if (e.work_date >= start && e.work_date <= mTo) (byDay[e.work_date] = byDay[e.work_date] || []).push(e); });
    let saldoPrev = +p.saldo_start_min || 0, soll = 0, ist = 0;
    for (let d = start; d <= mTo; d = shiftDay(d, 1)) {
      const s = isWorkday(d) ? ds : 0, i = (byDay[d] || []).reduce((a, e) => a + istMin(e), 0);
      if (d < mFrom) saldoPrev += i - s; else { soll += s; ist += i; }
    }
    // Monat vor Stichtag: keine Saldoberechnung
    const active = mTo >= start;
    const inMonth = entries.filter(e => e.work_date >= mFrom && e.work_date <= mTo);
    const dayCount = k => inMonth.filter(e => e.kind === k).reduce((a, e) => a + (+e.hours || ds / 60) / (ds / 60), 0);
    let vac = +p.vacation_start || 0;
    for (let y = +start.slice(0, 4) + 1; y <= +month.slice(0, 4); y++) vac += +p.vacation_per_year || 0;
    const usedTotal = entries.filter(e => e.kind === 'urlaub' && e.work_date >= start && e.work_date <= mTo).reduce((a, e) => a + (+e.hours || ds / 60) / (ds / 60), 0);
    return {
      active, start, soll, ist, diff: ist - soll, saldoPrev, saldoNew: saldoPrev + ist - soll,
      vacUsed: dayCount('urlaub'), vacLeft: vac - usedTotal, sick: dayCount('krank'), za: dayCount('za'),
      schulung: inMonth.filter(e => e.kind === 'schulung').reduce((a, e) => a + workMin(e), 0),
      work: inMonth.filter(e => e.kind === 'arbeit').reduce((a, e) => a + workMin(e), 0),
      travel: inMonth.reduce((a, e) => a + (+e.travel_min || 0), 0),
      nights: new Set(inMonth.filter(e => e.overnight).map(e => e.work_date)).size
    };
  }

  // ---------- Meine Zeit / Arbeitszeit eines Mitarbeiters ----------
  async function viewTime(pid, month, printMode) {
    const u = S.user();
    if (!u.profileId) { app.innerHTML = header('<div class="sub">Meine Zeit</div>', '#/') + topnav('zeit') + '<main class="wrap"><div class="card"><p><b>Dein Login ist noch keinem Mitarbeiter zugeordnet.</b></p><p class="muted">Bitte melde dich bei Ali.</p></div></main>'; bindLogout(); return; }
    pid = pid || u.profileId;
    const self = pid === u.profileId;
    if (!self && !u.isAdmin) { location.hash = '#/zeit'; return; }
    month = month || today().slice(0, 7);
    const from = month + '-01', to = month + '-' + String(daysIn(month)).padStart(2, '0');
    const profiles = await S.listProfiles();
    const person = profiles.find(p => p.id === pid) || { name: '?', weekly_hours: 40 };
    const accFrom = startOf(person) < from ? startOf(person) : from;
    const [allEntries, signs, towers, open] = await Promise.all([
      S.listTime({ profileId: pid, from: shiftDay(accFrom, -1), to }), S.listMonthSignoffs({ month, profileId: pid }), S.listTowers(), S.openTime(pid)
    ]);
    const entries = allEntries.filter(e => e.work_date >= from), prevEntries = allEntries.filter(e => e.work_date === shiftDay(from, -1));
    const acc = accounts(person, allEntries, month);
    const sign = signs[0];
    const locked = !!sign && !u.isAdmin;
    const tName = id => { const t = towers.find(x => x.id === id); return t ? t.park + ' · ' + t.name : ''; };
    const stats = dayStats(entries, prevEntries);
    // Feiertage an Werktagen als Info-Zeilen
    for (let d = from; d <= to; d = shiftDay(d, 1)) { const w = new Date(d + 'T12:00').getDay(); if (holidayName(d) && w >= 1 && w <= 5 && !stats[d]) stats[d] = { list: [], work: 0, pause: 0, travel: 0, warn: [], overnight: false }; }
    const days = Object.keys(stats).sort();
    const warnCount = days.reduce((s, d) => s + stats[d].warn.length, 0);
    const changedAfter = sign && entries.some(e => new Date(e.updated_at) > new Date(sign.signed_at));
    const weeks = {}; days.forEach(d => { const k = kw(d); weeks[k] = (weeks[k] || 0) + stats[d].work + stats[d].travel; });

    // Vorschläge aus Turm-Einträgen (heute und gestern), nur für sich selbst
    let suggestions = [];
    if (self && month === today().slice(0, 7) && towers.length) {
      const ids = towers.map(t => t.id), ds = [today(), shiftDay(today(), -1)];
      const wl = (await Promise.all(ds.map(date => S.listWorkdays({ towerIds: ids, date })))).flat();
      suggestions = wl.filter(w => (w.crew || []).includes(pid) && !entries.some(e => e.work_date === w.work_date && e.tower_id === w.tower_id));
    }

    const back = self ? '#/' : '#/team/' + month;
    const editable = !locked;
    const towerOpts = sel => `<option value="">Kein Turm</option>${towers.filter(t => t.status !== 'abgeschlossen' || t.id === sel).map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.park + ' · ' + t.name)}</option>`).join('')}`;
    const running = self ? open[0] : null;
    const cols = printMode ? 6 : 7;
    const desc = e => ABSENT(e.kind) ? `<span class="pill k-${e.kind}">${KINDS[e.kind]}</span> ${dec(+e.hours || dailySoll(person) / 60)} h` :
      `${e.kind === 'schulung' ? '<span class="pill k-schulung">Schulung</span> ' : ''}${esc(e.tower_id ? tName(e.tower_id) : e.location)}${e.overnight ? ' <span class="pill">Nächtigung</span>' : ''}`;

    const rowsHtml = days.map((d, i) => {
      const st = stats[d], next = days[i + 1], hol = holidayName(d);
      const weekEnd = !next || kw(next) !== kw(d);
      const lines = st.list.length ? st.list.map((e, j) => `<tr class="${st.warn.length ? 'haswarn' : ''}">
          ${j === 0 ? `<td class="nowrap" rowspan="${st.list.length}"><b>${d.slice(8)}.${d.slice(5, 7)}.</b> <span class="muted">${wd(d)}</span>${hol ? `<br><span class="muted small">${esc(hol)}</span>` : ''}</td>` : ''}
          <td class="mono nowrap">${ABSENT(e.kind) ? 'ganztags' : esc(e.start_time) + '–' + esc(e.end_time || 'läuft')}</td>
          <td class="r num">${ABSENT(e.kind) ? '' : e.pause_min || 0}</td><td class="r num">${e.travel_min ? hm(e.travel_min) : ''}</td>
          <td class="r num"><b>${hm(istMin(e))}</b></td>
          <td class="small">${desc(e)}${e.note ? `<br><span class="muted">${esc(e.note)}</span>` : ''}</td>
          ${printMode ? '' : `<td class="nowrap noprint">${editable ? `<button type="button" class="ghost small" data-edit="${e.id}">Ändern</button> <button type="button" class="ghost small" data-del="${e.id}">Löschen</button>` : ''}</td>`}
        </tr>`).join('') : `<tr class="holrow"><td class="nowrap"><b>${d.slice(8)}.${d.slice(5, 7)}.</b> <span class="muted">${wd(d)}</span></td><td colspan="${cols - 1}" class="muted small">Feiertag: ${esc(hol)}</td></tr>`;
      return lines + (st.warn.length ? `<tr class="warnrow"><td colspan="${cols}">⚠ ${st.warn.map(esc).join(' · ')}</td></tr>` : '') +
        (weekEnd ? `<tr class="weekrow"><td colspan="4">KW ${kw(d)}</td><td class="r num"><b>${hm(weeks[kw(d)])}</b></td><td colspan="${cols - 5}" class="small">${weeks[kw(d)] > 3600 ? '⚠ über 60 h in dieser Woche' : ''}</td></tr>` : '');
    }).join('');

    app.innerHTML = `<div class="noprint">${header(`<div class="sub">${self ? 'Meine Zeit' : 'Arbeitszeit'}</div><div class="brand sm">${esc(person.name)}</div>`, back)}${self ? topnav('zeit') : ''}</div>
      <main class="wrap timeview">
        ${self && !printMode ? `<section class="card clock">
          ${running ? `<div><div class="eyebrow">${running.pause_started ? 'Pause seit ' + esc(running.pause_started) : 'Arbeit läuft'}</div>
              <div class="clockbig">${esc(running.start_time)} <span class="muted">seit</span></div>
              <div class="muted small">${running.work_date !== today() ? '⚠ Gestartet am ' + fmtDay(running.work_date) + '. Bitte Endzeit nachtragen.' : 'Bisher ' + hm(workMin(running)) + ' h'}${running.tower_id ? ' · ' + esc(tName(running.tower_id)) : ''}</div></div>
            <div class="clockbtns">
              ${running.work_date === today() ? (running.pause_started ? `<button type="button" class="primary" id="c-pause-end">Pause beenden</button>` : `<button type="button" class="ghost" id="c-pause">Pause starten</button>`) : ''}
              ${running.work_date === today() ? `<button type="button" class="primary dark" id="c-stop">Arbeit beenden</button>` : `<button type="button" class="ghost" data-edit="${running.id}">Endzeit nachtragen</button>`}
            </div>`
          : `<div><div class="eyebrow">Stempeluhr</div><div class="clockbig">${nowHM()}</div>
              <label class="fld small">Turm (optional)<select id="c-tower">${towerOpts('')}</select></label></div>
            <div class="clockbtns"><button type="button" class="primary" id="c-start">Arbeit starten</button></div>`}
        </section>` : ''}

        ${suggestions.length && !printMode ? `<section class="card sec note">
          <h2>Vom Turm übernehmen</h2>
          <p class="muted small">Du warst hier als dabei eingetragen. Prüfen, Fahrzeit ergänzen, speichern.</p>
          <ul class="entries">${suggestions.map((w, i) => `<li><div class="row between"><span><b>${fmtDay(w.work_date)}</b> · ${esc(tName(w.tower_id))}</span><span class="mono">${esc(w.start_time)}–${esc(w.end_time)}</span></div>
            <div class="row between"><span class="muted small">Pause ${w.pause_min} min · eingetragen von ${esc(w.created_by_name)}</span><button type="button" class="ghost small" data-sug="${i}">Übernehmen</button></div></li>`).join('')}</ul>
        </section>` : ''}

        <div class="card daybar noprint">
          <a class="ghost small" href="#/zeit/${pid}/${shiftMonth(month, -1)}" aria-label="Vormonat">‹</a>
          <b class="monthname">${esc(monthLabel(month))}</b>
          <a class="ghost small" href="#/zeit/${pid}/${shiftMonth(month, 1)}" aria-label="Nächster Monat">›</a>
        </div>

        <div class="rephead printonly"><div><div class="eyebrow">Deliri GmbH · Arbeitszeitaufzeichnung</div><h1>${esc(person.name)}</h1><p class="muted">${esc(monthLabel(month))} · ${dec(+person.weekly_hours || 40)} Stunden/Woche, Gleitzeit</p></div></div>

        ${acc.active ? `<div class="kpis five">
          <div class="kpi"><span>Soll</span><b>${hm(acc.soll)}</b></div>
          <div class="kpi"><span>Ist</span><b>${hm(acc.ist)}</b></div>
          <div class="kpi ${acc.diff < 0 ? 'neg' : 'pos'}"><span>Monat +/−</span><b>${hmSigned(acc.diff)}</b></div>
          <div class="kpi ${acc.saldoNew < 0 ? 'neg' : 'pos'}"><span>Gleitzeitsaldo</span><b>${hmSigned(acc.saldoNew)}</b><small>Übertrag ${hmSigned(acc.saldoPrev)}</small></div>
          <div class="kpi"><span>Resturlaub</span><b>${dec(acc.vacLeft, 1)}</b><small>Tage</small></div>
        </div>
        <p class="muted small kpiline">Arbeit ${hm(acc.work)} · Fahrzeit ${hm(acc.travel)} · Schulung ${hm(acc.schulung)} · Urlaub ${dec(acc.vacUsed, 1)} T · Krankenstand ${dec(acc.sick, 1)} T · ZA ${dec(acc.za, 1)} T · Nächtigungen ${acc.nights}</p>`
        : `<p class="muted small">Konten (Gleitzeit, Urlaub) werden ab ${fmtDay(acc.start)} gerechnet.</p>`}
        ${warnCount ? `<p class="warn small"><b>${warnCount} Hinweis${warnCount > 1 ? 'e' : ''} zu Pausen, Ruhezeit oder Höchstarbeitszeit.</b> Siehe markierte Tage.</p>` : ''}

        ${editable && !printMode ? `<form class="card sec" id="f-time" data-kind="arbeit">
          <h2 id="t-title">Zeit nachtragen</h2>
          <input type="hidden" id="t-id">
          <div class="kindpick" role="group" aria-label="Art">${Object.entries(KINDS).map(([k, l]) => `<label class="crewchip"><input type="radio" name="t-kind" value="${k}" ${k === 'arbeit' ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
          <div class="two">
            <label class="fld">Datum<input type="date" id="t-date" value="${month === today().slice(0, 7) ? today() : from}" required></label>
            <label class="fld only-abs">Bis (mehrere Tage)<input type="date" id="t-dateto"></label>
            <label class="fld only-work">Turm<select id="t-tower">${towerOpts('')}</select></label>
          </div>
          <div class="three only-work">
            <label class="fld">Von<input type="time" id="t-start" value="07:00"></label>
            <label class="fld">Bis<input type="time" id="t-end" value="17:00"></label>
            <label class="fld">Pause (min)<input type="number" id="t-pause" value="30" min="0" step="5" inputmode="numeric"></label>
          </div>
          <div class="two only-work">
            <label class="fld">Fahrzeit (min)<input type="number" id="t-travel" value="0" min="0" step="5" inputmode="numeric"></label>
            <label class="fld">Ort (wenn kein Turm)<input id="t-loc" placeholder="z.B. Büro, Lager, Schulung"></label>
          </div>
          <label class="confirm only-work"><input type="checkbox" id="t-night"> Nächtigung auswärts</label>
          <label class="fld only-abs">Stunden pro Tag<input type="number" id="t-hours" value="${dailySoll(person) / 60}" min="0" max="12" step="0.5" inputmode="decimal"><span class="muted small">Ganzer Tag ${dec(dailySoll(person) / 60)} h, halber Tag ${dec(dailySoll(person) / 120)} h. Wochenenden und Feiertage werden übersprungen.</span></label>
          <label class="fld">Notiz<input id="t-note" placeholder="optional"></label>
          <div class="row wrapgap"><button class="primary" type="submit" id="t-save">Speichern</button><button class="ghost" type="button" id="t-cancel" hidden>Abbrechen</button></div>
        </form>` : ''}
        ${locked && !printMode ? '<p class="okmsg small">Dieser Monat ist bestätigt. Änderungen nur noch über Ali.</p>' : ''}

        <section class="card sec">
          <h2>${esc(monthLabel(month))}</h2>
          ${days.length ? `<div class="tblwrap"><table class="rep timetbl"><thead><tr><th>Tag</th><th>Zeit</th><th class="r">Pause</th><th class="r">Fahrt</th><th class="r">Std.</th><th>Ort / Art</th>${printMode ? '' : '<th class="noprint"></th>'}</tr></thead><tbody>${rowsHtml}</tbody>
            <tfoot><tr><td colspan="4"><b>Ist ${esc(monthLabel(month))}</b></td><td class="r num"><b>${hm(acc.ist)}</b></td><td colspan="${cols - 5}" class="small">Soll ${hm(acc.soll)} · ${hmSigned(acc.diff)}</td></tr></tfoot></table></div>`
          : '<p class="muted">In diesem Monat noch keine Einträge.</p>'}
        </section>

        <section class="card sec">
          <h2>Monat bestätigen</h2>
          ${sign ? `<div class="signed"><b>✓ Bestätigt von ${esc(sign.name)}</b> <span class="muted small">${fmt(sign.signed_at)} · Ist ${hm(sign.total_min)} h</span></div>
              ${changedAfter ? '<p class="warn small">Nach der Bestätigung wurden Einträge geändert.</p>' : ''}
              ${u.isAdmin && !printMode ? `<button type="button" class="ghost small noprint" id="m-unsign">Bestätigung aufheben</button>` : ''}`
            : `<p class="muted small">Mit der Bestätigung erklärt ${self ? 'du' : esc(person.name)}, dass die Zeiten stimmen. Danach ${self ? 'kannst du' : 'kann der Mitarbeiter'} den Monat nicht mehr ändern.</p>
              ${!printMode ? `<button type="button" class="primary noprint" id="m-sign" ${open.length ? 'disabled' : ''}>Monat ${esc(monthLabel(month))} bestätigen</button>${open.length ? '<p class="muted small">Zuerst laufende Zeit beenden.</p>' : ''}` : ''}`}
          <div class="signs printonly"><div><span></span>Mitarbeiter, Unterschrift</div><div><span></span>Deliri GmbH, Unterschrift</div></div>
        </section>

        ${!printMode ? `<div class="row wrapgap noprint">
          <button type="button" class="ghost" id="x-print">Drucken / PDF</button>
          <button type="button" class="ghost" id="x-csv">Excel (CSV) herunterladen</button>
        </div>` : ''}
        ${u.isAdmin && !printMode ? `<details class="card sec noprint" id="logbox"><summary><b>Änderungsverlauf</b> <span class="muted small">jede Änderung mit Zeitpunkt und Person</span></summary><div id="logbody" class="small muted">Lade …</div></details>` : ''}
      </main>`;
    bindLogout();
    if (printMode) { setTimeout(() => window.print(), 400); return; }

    const $ = id => document.getElementById(id);
    const reload = () => viewTime(pid, month);
    const base = { profile_id: pid };

    // Stempeluhr
    if ($('c-start')) $('c-start').onclick = () => safe(async () => { await S.saveTime({ ...base, kind: 'arbeit', work_date: today(), start_time: nowHM(), tower_id: $('c-tower').value || null }); toast('Arbeit gestartet ' + nowHM()); reload(); });
    if ($('c-pause')) $('c-pause').onclick = () => safe(async () => { await S.saveTime({ id: running.id, pause_started: nowHM() }); reload(); });
    if ($('c-pause-end')) $('c-pause-end').onclick = () => safe(async () => {
      let q = toMin(nowHM()) - toMin(running.pause_started); if (q < 0) q += 1440;
      await S.saveTime({ id: running.id, pause_started: null, pause_min: (+running.pause_min || 0) + q }); reload();
    });
    if ($('c-stop')) $('c-stop').onclick = () => safe(async () => {
      const patch = { id: running.id, end_time: nowHM() };
      if (running.pause_started) { let q = toMin(nowHM()) - toMin(running.pause_started); if (q < 0) q += 1440; patch.pause_min = (+running.pause_min || 0) + q; patch.pause_started = null; }
      await S.saveTime(patch); toast('Arbeit beendet ' + nowHM()); reload();
    });

    // Formular
    const f = $('f-time');
    const kindNow = () => document.querySelector('input[name=t-kind]:checked')?.value || 'arbeit';
    const setKind = k => { if (!f) return; f.dataset.kind = ABSENT(k) ? 'abs' : 'arbeit'; const r = document.querySelector(`input[name=t-kind][value=${k}]`); if (r) r.checked = true; };
    document.querySelectorAll('input[name=t-kind]').forEach(r => r.onchange = () => setKind(r.value));
    const fill = e => {
      if (!f) return;
      setKind(e.kind || 'arbeit');
      $('t-id').value = e.id || ''; $('t-date').value = e.work_date; $('t-dateto').value = ''; $('t-dateto').disabled = !!e.id;
      $('t-start').value = e.start_time || ''; $('t-end').value = e.end_time || '';
      $('t-pause').value = e.pause_min ?? 0; $('t-travel').value = e.travel_min ?? 0; $('t-tower').innerHTML = towerOpts(e.tower_id || '');
      $('t-loc').value = e.location || ''; $('t-night').checked = !!e.overnight; $('t-note').value = e.note || '';
      $('t-hours').value = e.hours ?? dailySoll(person) / 60;
      $('t-title').textContent = e.id ? 'Eintrag ändern' : 'Zeit nachtragen'; $('t-cancel').hidden = !e.id;
      f.classList.add('editing'); f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (f) {
      f.addEventListener('focusin', () => f.classList.add('editing'));
      f.onsubmit = e => {
        e.preventDefault();
        safe(async () => {
          const k = kindNow(), id = $('t-id').value, date = $('t-date').value;
          if (ABSENT(k)) {
            const hours = +$('t-hours').value || dailySoll(person) / 60, upto = !id && $('t-dateto').value ? $('t-dateto').value : date;
            if (upto < date) { toast('„Bis“ liegt vor dem Startdatum.', true); return; }
            const dates = []; for (let d = date; d <= upto; d = shiftDay(d, 1)) if (isWorkday(d) || date === upto) dates.push(d);
            if (!dates.length) { toast('Im gewählten Zeitraum ist kein Arbeitstag.', true); return; }
            for (const d of dates) await S.saveTime({ ...(id ? { id } : base), kind: k, work_date: d, hours, start_time: null, end_time: null, pause_min: 0, travel_min: 0, tower_id: null, location: '', overnight: false, note: $('t-note').value.trim() });
            toast(KINDS[k] + (dates.length > 1 ? ` für ${dates.length} Arbeitstage` : '') + ' gespeichert'); reload(); return;
          }
          const row = { ...base, kind: k, hours: null, work_date: date, start_time: $('t-start').value, end_time: $('t-end').value || null, pause_min: +$('t-pause').value || 0,
            travel_min: +$('t-travel').value || 0, tower_id: $('t-tower').value || null, location: $('t-loc').value.trim(), overnight: $('t-night').checked, note: $('t-note').value.trim() };
          if (id) row.id = id;
          if (!row.start_time) { toast('Bitte eine Beginnzeit eintragen.', true); return; }
          if (!row.end_time && row.work_date !== today()) { toast('Bitte eine Endzeit eintragen.', true); return; }
          await S.saveTime(row); toast('Gespeichert'); reload();
        });
      };
      $('t-cancel').onclick = () => reload();
    }
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => fill(entries.find(e => e.id === b.dataset.edit) || open.find(e => e.id === b.dataset.edit)));
    document.querySelectorAll('[data-del]').forEach(b => twoTap(b, 'Löschen', () => safe(async () => { await S.deleteTime(b.dataset.del); reload(); })));
    document.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { const w = suggestions[+b.dataset.sug]; fill({ kind: 'arbeit', work_date: w.work_date, start_time: w.start_time, end_time: w.end_time, pause_min: w.pause_min, tower_id: w.tower_id, travel_min: 0 }); });

    // Bestätigen
    if ($('m-sign')) twoTap($('m-sign'), $('m-sign').textContent, () => safe(async () => { await S.signMonth({ profile_id: pid, month, total_min: Math.round(acc.ist), name: u.name }); toast('Monat bestätigt'); reload(); }));
    if ($('m-unsign')) twoTap($('m-unsign'), 'Bestätigung aufheben', () => safe(async () => { await S.unsignMonth(sign.id); reload(); }));

    // Export
    $('x-print').onclick = () => { location.hash = '#/zeit/' + pid + '/' + month + '/druck'; };
    $('x-csv').onclick = () => {
      const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', h2 = m => (m / 60).toFixed(2).replace('.', ',');
      const lines = [['Mitarbeiter', 'Datum', 'Wochentag', 'Art', 'Beginn', 'Ende', 'Pause (min)', 'Fahrzeit (min)', 'Stunden', 'Turm / Ort', 'Nächtigung', 'Notiz', 'Hinweise'].map(q).join(';')];
      days.forEach(d => stats[d].list.forEach(e => lines.push([person.name, d.split('-').reverse().join('.'), wd(d), KINDS[e.kind || 'arbeit'], e.start_time || '', e.end_time || '', ABSENT(e.kind) ? '' : e.pause_min || 0, e.travel_min || 0,
        h2(istMin(e)), e.tower_id ? tName(e.tower_id) : e.location, e.overnight ? 'ja' : '', e.note, stats[d].warn.join(', ')].map(q).join(';'))));
      lines.push('');
      [['Soll', h2(acc.soll)], ['Ist', h2(acc.ist)], ['Monat +/-', h2(acc.diff)], ['Übertrag Vormonat', h2(acc.saldoPrev)], ['Gleitzeitsaldo neu', h2(acc.saldoNew)],
       ['Urlaub genommen (Tage)', dec(acc.vacUsed, 2)], ['Resturlaub (Tage)', dec(acc.vacLeft, 2)], ['Krankenstand (Tage)', dec(acc.sick, 2)], ['Zeitausgleich (Tage)', dec(acc.za, 2)],
       ['Schulung (h)', h2(acc.schulung)], ['Fahrzeit (h)', h2(acc.travel)], ['Nächtigungen', acc.nights]].forEach(([a, b]) => lines.push([q(a), q(b)].join(';')));
      download(`Arbeitszeit_${person.name.replace(/\s+/g, '_')}_${month}.csv`, lines.join('\r\n'));
    };

    // Verlauf (Admin)
    const lb = $('logbox');
    if (lb) lb.addEventListener('toggle', () => { if (!lb.open) return; safe(async () => {
      const log = await S.listTimeLog({ profileId: pid, from, to });
      const label = { insert: 'angelegt', update: 'geändert', delete: 'gelöscht' };
      const d1 = r => !r ? '' : ABSENT(r.kind) ? `${fmtDay(r.work_date)} ${KINDS[r.kind]} ${r.hours} h` : `${fmtDay(r.work_date)} ${r.start_time}–${r.end_time || '…'}, Pause ${r.pause_min}, Fahrt ${r.travel_min || 0}`;
      $('logbody').innerHTML = log.length ? `<ul class="loglist">${log.map(l => `<li><b>${fmt(l.changed_at)}</b> ${esc(l.changed_by_name || '?')} hat ${label[l.action] || l.action}: ${esc(l.action === 'insert' ? d1(l.new_row) : l.action === 'delete' ? d1(l.old_row) : d1(l.old_row) + ' → ' + d1(l.new_row))}</li>`).join('')}</ul>` : 'Keine Änderungen.';
    }); });
  }
  function download(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- Team (nur Admin) ----------
  async function viewTeam(month, printMode) {
    const u = S.user();
    if (!u.isAdmin) { location.hash = '#/'; return; }
    month = month || today().slice(0, 7);
    const to = month + '-' + String(daysIn(month)).padStart(2, '0');
    const profiles = await S.listProfiles();
    const minStart = profiles.reduce((m, p) => startOf(p) < m ? startOf(p) : m, month + '-01');
    const [entries, signs] = await Promise.all([S.listTime({ from: shiftDay(minStart, -1), to }), S.listMonthSignoffs({ month })]);
    const rows = profiles.filter(p => p.active).map(p => {
      const mine = entries.filter(e => e.profile_id === p.id);
      const st = dayStats(mine.filter(e => e.work_date >= month + '-01'), []);
      return { p, acc: accounts(p, mine, month), warn: Object.values(st).reduce((s, d) => s + d.warn.length, 0), sign: signs.find(x => x.profile_id === p.id) };
    });
    const csv = () => {
      const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', h2 = m => (m / 60).toFixed(2).replace('.', ',');
      const head = ['Mitarbeiter', 'Art', 'Wochenstunden', 'Soll (h)', 'Ist (h)', 'Monat +/- (h)', 'Übertrag Vormonat (h)', 'Gleitzeitsaldo neu (h)', 'Urlaub genommen (Tage)', 'Resturlaub (Tage)', 'Krankenstand (Tage)', 'Zeitausgleich (Tage)', 'Schulung (h)', 'Fahrzeit (h)', 'Nächtigungen', 'Monat bestätigt', 'Hinweise AZG'];
      return [head.map(q).join(';'), ...rows.map(({ p, acc, warn, sign }) => [p.name, p.kind === 'sub' ? 'Subunternehmer' : 'Angestellt', dec(+p.weekly_hours || 40), h2(acc.soll), h2(acc.ist), h2(acc.diff), h2(acc.saldoPrev), h2(acc.saldoNew),
        dec(acc.vacUsed, 2), dec(acc.vacLeft, 2), dec(acc.sick, 2), dec(acc.za, 2), h2(acc.schulung), h2(acc.travel), acc.nights, sign ? 'ja, ' + fmtDay(sign.signed_at) : 'nein', warn].map(q).join(';'))].join('\r\n');
    };
    const table = `<div class="tblwrap"><table class="rep teamtbl"><thead><tr><th>Name</th><th class="r">Soll</th><th class="r">Ist</th><th class="r">+/− Monat</th><th class="r">Übertrag</th><th class="r">Saldo neu</th><th class="r">Urlaub</th><th class="r">Rest&shy;urlaub</th><th class="r">Krank</th><th class="r">ZA</th><th class="r">Fahrt</th><th class="r">Nächt.</th><th>Status</th>${printMode ? '' : '<th class="noprint"></th>'}</tr></thead><tbody>
      ${rows.map(({ p, acc, warn, sign }) => `<tr><td class="nowrap"><b>${esc(p.name)}</b>${p.kind === 'sub' ? ' <span class="pill">Sub</span>' : ''}</td>
        <td class="r num">${hm(acc.soll)}</td><td class="r num">${hm(acc.ist)}</td><td class="r num ${acc.diff < 0 ? 'negt' : ''}">${hmSigned(acc.diff)}</td><td class="r num">${hmSigned(acc.saldoPrev)}</td><td class="r num ${acc.saldoNew < 0 ? 'negt' : ''}"><b>${hmSigned(acc.saldoNew)}</b></td>
        <td class="r num">${dec(acc.vacUsed, 1)}</td><td class="r num"><b>${dec(acc.vacLeft, 1)}</b></td><td class="r num">${dec(acc.sick, 1)}</td><td class="r num">${dec(acc.za, 1)}</td><td class="r num">${hm(acc.travel)}</td><td class="r num">${acc.nights}</td>
        <td class="nowrap">${sign ? '<span class="pill ok">bestätigt</span>' : '<span class="pill">offen</span>'}${warn ? ` <span class="pill bad">${warn} ⚠</span>` : ''}</td>
        ${printMode ? '' : `<td class="noprint"><a class="ghost small" href="#/zeit/${p.id}/${month}">Öffnen</a></td>`}</tr>`).join('')}
      </tbody></table></div>`;

    if (printMode) {
      app.innerHTML = `<main class="wrap report"><div class="rephead"><div><div class="eyebrow">Deliri GmbH · Monatsübersicht Arbeitszeit</div><h1>${esc(monthLabel(month))}</h1><p class="muted">Gleitzeit, Saldo und Urlaub in Stunden (h:mm) bzw. Tagen. Erstellt ${fmt(new Date().toISOString())}</p></div></div>${table}
        <p class="muted small">Saldo = Ist minus Soll (Soll ohne gesetzliche Feiertage). Ist enthält Arbeitszeit, Fahrzeit und Schulung; Urlaub und Krankenstand werden mit den eingetragenen Stunden gutgeschrieben, Zeitausgleich reduziert den Saldo.</p>
        <div class="signs"><div><span></span>Deliri GmbH, Unterschrift</div><div><span></span>Datum</div></div></main>`;
      setTimeout(() => window.print(), 400); return;
    }

    app.innerHTML = header('<div class="brand">DELIRI</div><div class="sub">Team</div>') + topnav('team') + `
      <main class="wrap">
        <div class="card daybar"><a class="ghost small" href="#/team/${shiftMonth(month, -1)}" aria-label="Vormonat">‹</a><b class="monthname">${esc(monthLabel(month))}</b><a class="ghost small" href="#/team/${shiftMonth(month, 1)}" aria-label="Nächster Monat">›</a></div>
        <section class="card sec"><div class="row between wrapgap"><h2>Monatsübersicht für den Steuerberater</h2>
          <div class="row"><button type="button" class="ghost small" id="tm-print">Drucken / PDF</button><button type="button" class="ghost small" id="tm-csv">Excel (CSV)</button></div></div>
          ${rows.length ? table : '<p class="muted">Noch keine aktiven Mitarbeiter.</p>'}
          <p class="muted small">Ob und wie viele Überstunden aus dem Gleitzeitsaldo entstehen, regelt eure Gleitzeitvereinbarung bzw. der Kollektivvertrag.</p>
        </section>

        <form class="card sec" id="f-prof">
          <h2 id="p-title">Mitarbeiter anlegen</h2>
          <input type="hidden" id="p-id">
          <div class="two">
            <label class="fld">Vor- und Nachname<input id="p-name" required></label>
            <label class="fld">E-Mail (für den Login)<input id="p-email" type="email" placeholder="optional, z.B. bei Subunternehmern"></label>
          </div>
          <div class="two">
            <label class="fld">Art<select id="p-kind"><option value="angestellt">Angestellt</option><option value="sub">Subunternehmer</option></select></label>
            <label class="fld">Rolle<select id="p-role"><option value="mitarbeiter">Mitarbeiter</option><option value="admin">Admin (sieht alle Zeiten)</option></select></label>
          </div>
          <div class="two">
            <label class="fld">Wochenstunden<input type="number" id="p-week" value="40" min="0" max="60" step="0.5" inputmode="decimal"></label>
            <label class="fld">Urlaubsanspruch pro Jahr (Arbeitstage)<input type="number" id="p-vac" value="25" min="0" step="0.5" inputmode="decimal"></label>
          </div>
          <fieldset class="crew startvals"><legend>Startwerte beim Umstieg (Stand aus ARTimer)</legend>
            <div class="three">
              <label class="fld">Stichtag<input type="date" id="p-bdate"></label>
              <label class="fld">Resturlaub (Tage)<input type="number" id="p-vstart" value="0" step="0.5" inputmode="decimal"></label>
              <label class="fld">Gleitzeitsaldo (Stunden)<input type="number" id="p-sstart" value="0" step="0.25" inputmode="decimal" placeholder="z.B. 12,5 oder -3"></label>
            </div>
            <span class="muted small">Ab dem Stichtag rechnet die App Saldo und Urlaub selbst weiter. Der Jahresanspruch wird jeweils am 1. Jänner dazugezählt.</span>
          </fieldset>
          <label class="confirm"><input type="checkbox" id="p-active" checked> Aktiv</label>
          <p class="muted small">Login: In Supabase einen Benutzer mit genau dieser E-Mail anlegen. Beim ersten Anmelden wird er automatisch mit diesem Mitarbeiter verknüpft.</p>
          <div class="row wrapgap"><button class="primary" type="submit">Speichern</button><button class="ghost" type="button" id="p-cancel" hidden>Abbrechen</button></div>
        </form>

        <section class="card sec"><h2>Alle Mitarbeiter</h2>
          <ul class="entries">${profiles.map(p => `<li class="${p.active ? '' : 'inactive'}"><div class="row between"><b>${esc(p.name)}</b><span>${p.role === 'admin' ? '<span class="pill ok">Admin</span> ' : ''}${p.kind === 'sub' ? '<span class="pill">Sub</span> ' : ''}${p.active ? '' : '<span class="pill">inaktiv</span>'}</span></div>
            <div class="row between"><span class="muted small">${esc(p.email || 'ohne E-Mail')} · ${p.user_id ? 'Login verknüpft' : 'noch kein Login'} · ${dec(+p.weekly_hours || 40)} h/Woche · Stichtag ${p.balance_date ? fmtDay(p.balance_date) : 'nicht gesetzt'}</span><button type="button" class="ghost small" data-p="${p.id}">Bearbeiten</button></div></li>`).join('')}</ul>
        </section>
      </main>`;
    bindLogout();
    const $ = id => document.getElementById(id);
    $('tm-print').onclick = () => { location.hash = '#/team/' + month + '/druck'; };
    $('tm-csv').onclick = () => download(`Monatsuebersicht_Arbeitszeit_${month}.csv`, csv());
    document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      const p = profiles.find(x => x.id === b.dataset.p);
      $('p-id').value = p.id; $('p-name').value = p.name; $('p-email').value = p.email || ''; $('p-kind').value = p.kind; $('p-role').value = p.role; $('p-active').checked = p.active;
      $('p-week').value = p.weekly_hours ?? 40; $('p-vac').value = p.vacation_per_year ?? 25; $('p-bdate').value = p.balance_date || ''; $('p-vstart').value = p.vacation_start ?? 0; $('p-sstart').value = (p.saldo_start_min || 0) / 60;
      $('p-title').textContent = 'Mitarbeiter bearbeiten'; $('p-cancel').hidden = false; $('f-prof').scrollIntoView({ behavior: 'smooth' });
    });
    $('p-cancel').onclick = () => viewTeam(month);
    $('f-prof').onsubmit = e => {
      e.preventDefault();
      safe(async () => {
        if ($('p-id').value === u.profileId && ($('p-role').value !== 'admin' || !$('p-active').checked)) { toast('Du kannst dir selbst die Admin-Rechte nicht entziehen.', true); return; }
        await S.saveProfile({ id: $('p-id').value || undefined, name: $('p-name').value.trim(), email: $('p-email').value.trim(), kind: $('p-kind').value, role: $('p-role').value, active: $('p-active').checked,
          weekly_hours: +$('p-week').value || 40, vacation_per_year: +$('p-vac').value || 0, balance_date: $('p-bdate').value || null, vacation_start: +$('p-vstart').value || 0,
          saldo_start_min: Math.round((parseFloat(String($('p-sstart').value).replace(',', '.')) || 0) * 60) });
        toast('Gespeichert'); viewTeam(month);
      });
    };
  }

  // ---------- Protokoll (druckbar) ----------
  async function viewReport(id) {
    const tower = await S.getTower(id); const tpl = T[tower.tower_type];
    const [checks, signoffs, defects] = await Promise.all([S.getChecks(id), S.getSignoffs(id), S.listDefects({ towerId: id })]);
    const block = phase => {
      const map = new Map(checks.filter(c => c.phase === phase).map(c => [c.item_id, c]));
      const items = window.flatItems(tpl, phase);
      const so = signoffs.filter(s => s.phase === phase);
      return `<h2>${esc(tpl.phases[phase].title)} <span class="muted">${items.filter(i => map.has(i.key)).length}/${items.length}</span></h2>
        <table class="rep"><tbody>${items.map(i => { const c = map.get(i.key); return `<tr><td>${c ? '✓' : '○'}</td><td>${esc(i.label)}${c?.value ? ' <b>' + esc(c.value) + ' mm</b>' : ''}</td><td class="muted">${c ? esc(c.done_by_name) + ', ' + fmt(c.done_at) : 'offen'}</td></tr>`; }).join('')}</tbody></table>
        <p>${so.length ? so.map(s => `Unterschrieben: <b>${esc(s.name)}</b>, ${fmt(s.signed_at)}${s.open_items ? ` (mit ${s.open_items} offenen Punkten)` : ''}${s.note ? ' · ' + esc(s.note) : ''}`).join('<br>') : 'Noch nicht unterschrieben.'}</p>`;
    };
    app.innerHTML = `<div class="noprint">${header('<div class="sub">Protokoll</div>', '#/t/' + id + '/info')}</div>
      <main class="wrap report">
        <div class="row between noprint"><span></span><button class="primary" type="button" onclick="window.print()">Drucken / PDF</button></div>
        <h1>Montageprotokoll ${esc(tower.park)} · ${esc(tower.name)}</h1>
        <p class="muted">${esc(tpl.name)} · Kunde ${esc(tower.customer || '')} · Deliri GmbH · erstellt ${fmt(new Date().toISOString())}</p>
        ${block('wls')}${block('fin')}
        <h2>Mängel</h2>${defects.length ? `<table class="rep"><tbody>${defects.map(d => `<tr><td>${d.status === 'offen' ? '!' : '✓'}</td><td><b>${esc(d.title)}</b>${d.location ? ' · ' + esc(d.location) : ''}${d.needs_part ? ' · Teil: ' + esc(d.needs_part) : ''}${d.description ? '<br>' + esc(d.description) : ''}</td><td class="muted">${esc(d.created_by_name)}, ${fmt(d.created_at)}${d.status === 'erledigt' ? '<br>erledigt ' + esc(d.resolved_by_name) : ''}</td></tr>`).join('')}</tbody></table>` : '<p>Keine.</p>'}
      </main>`;
    bindLogout();
  }

  // ---------- Router ----------
  async function render() {
    unsub(); unsub = () => {};
    if (!S.user()) return viewLogin();
    if (!S.user().name) return viewName();
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    try {
      if (parts[0] === 'neu') await viewNew();
      else if (parts[0] === 't' && parts[1]) {
        if (parts[2] === 'protokoll') await viewReport(parts[1]);
        else await viewTower(parts[1], ['tag', 'wls', 'fin', 'maengel', 'info'].includes(parts[2]) ? parts[2] : 'tag');
      } else if (parts[0] === 'tag' && parts[1] && parts[2]) await viewDayReport(parts[1], decodeURIComponent(parts[2]));
      else if (parts[0] === 'zeit') await viewTime(parts[1] || null, parts[2] || null, parts[3] === 'druck');
      else if (parts[0] === 'team') await viewTeam(parts[1] || null, parts[2] === 'druck');
      else await viewHome();
    } catch (e) { console.error(e); app.innerHTML = header('<div class="sub">Fehler</div>', '#/') + `<main class="wrap"><div class="card"><p><b>Daten konnten nicht geladen werden.</b></p><p class="muted">${esc(e.message || e)}</p><p>Internetverbindung prüfen und Seite neu laden.</p></div></main>`; }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  S.init(render).then(render);
})();
