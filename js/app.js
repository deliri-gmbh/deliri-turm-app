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
      if (!armed) { armed = true; btn.textContent = 'Wirklich? Nochmal tippen'; btn.classList.add('danger'); setTimeout(() => { armed = false; btn.textContent = label; btn.classList.remove('danger'); }, 4000); return; }
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
      ${back ? `<a class="back" href="${back}" aria-label="Zurück">←</a>` : `<span class="logo" aria-hidden="true"><b>D</b><i></i></span>`}
      <div class="ttl">${inner}</div>
      ${S.user() ? `<button class="ghost small" id="logout" type="button">Abmelden</button>` : ''}
    </div></header>
    ${S.mode === 'demo' ? `<div class="demo wrap">Demo-Modus: Daten bleiben nur auf diesem Gerät. Für das Team Supabase einrichten (siehe Anleitung).</div>` : ''}`;
  }
  function bindLogout() { const b = document.getElementById('logout'); if (b) b.onclick = async () => { await S.signOut(); location.hash = '#/'; render(); }; }

  // ---------- Login ----------
  function viewLogin() {
    app.innerHTML = `${header('<div class="brand">DELIRI</div><div class="sub">Turm-App</div>')}
    <main class="wrap narrow">
      <form class="card" id="f-login">
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
    app.innerHTML = header('<div class="brand">DELIRI</div><div class="sub">Turm-App</div>') + `<main class="wrap"><p class="muted">Lade …</p></main>`;
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
    ph.sections.forEach(sec => {
      html += `<section class="card sec"><h2>${esc(sec.title)}</h2>${sec.note ? `<p class="muted small">${esc(sec.note)}</p>` : ''}`;
      if (sec.type === 'matrix') {
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
    const [wds, rgs] = await Promise.all([S.listWorkdays({ towerIds: [tower.id], date }), S.listRegie({ towerIds: [tower.id], date })]);
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
        <p class="muted small">Gesamte Zeit vor Ort an diesem Turm. Ein Eintrag pro Truppe oder pro Zeitblock.</p>
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
          <label class="fld">Personen<input type="number" id="w-pers" value="2" min="1" required inputmode="numeric"></label>
          <label class="fld">Namen<input id="w-names" placeholder="z.B. Andy, Kilian"></label>
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
        await S.addWorkday({ tower_id: tower.id, work_date: date, start_time: v('w-start'), end_time: v('w-end'), pause_min: +v('w-pause') || 0, persons: +v('w-pers') || 1, names: v('w-names'), activities: v('w-act') });
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
      else await viewHome();
    } catch (e) { console.error(e); app.innerHTML = header('<div class="sub">Fehler</div>', '#/') + `<main class="wrap"><div class="card"><p><b>Daten konnten nicht geladen werden.</b></p><p class="muted">${esc(e.message || e)}</p><p>Internetverbindung prüfen und Seite neu laden.</p></div></main>`; }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  S.init(render).then(render);
})();
