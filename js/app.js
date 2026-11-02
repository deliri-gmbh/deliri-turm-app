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
      if (!armed) { armed = true; btn.textContent = btn.dataset.all !== undefined ? 'Wirklich alle abhaken? Nochmal tippen' : btn.dataset.none !== undefined ? 'Wirklich alle abwählen? Nochmal tippen' : 'Wirklich? Nochmal tippen'; btn.classList.add('danger'); setTimeout(() => { armed = false; btn.textContent = label; btn.classList.remove('danger'); }, 4000); return; }
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
  const isTurm = t => !!(t && T[t.tower_type]);
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
    const items = [['tuerme', '#/', 'Baustellen'], ['zeit', '#/zeit', 'Meine Zeit']];
    if (S.user()?.isAdmin) items.push(['team', '#/team', 'Team']);
    return `<nav class="tabs wrap mainnav">${items.map(([k, href, l]) => `<a href="${href}" aria-selected="${k === active}">${l}</a>`).join('')}</nav>`;
  }
  function bindLogout() { const b = document.getElementById('logout'); if (b) b.onclick = async () => { await S.signOut(); location.hash = '#/'; render(); }; }

  // ---------- Login ----------
  function viewLogin() {
    app.innerHTML = `${header('<div class="brand">DELIRI</div><div class="sub">Industrieklettern</div>')}
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
    app.innerHTML = `${header('<div class="brand">DELIRI</div><div class="sub">Industrieklettern</div>')}
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
    app.innerHTML = header('<div class="brand">DELIRI</div><div class="sub">Industrieklettern</div>') + topnav('tuerme') + `<main class="wrap"><p class="muted">Lade …</p></main>`;
    bindLogout();
    const [towers, checks, defects] = await Promise.all([S.listTowers(), S.allChecks(), S.listDefects({ status: 'offen' })]);
    const list = towers.filter(t => homeFilter === 'alle' || t.status === homeFilter);
    const parks = [...new Set(list.map(t => t.park))];
    const openBy = id => defects.filter(d => d.tower_id === id).length;

    app.querySelector('main').innerHTML = `
      <div class="row between">
        <h1>Baustellen</h1>
        <a class="primary" href="#/neu">+ Neue Baustelle</a>
      </div>
      ${defects.length ? `<section class="card warnbox">
        <h2>Offene Mängel <span class="pill bad">${defects.length}</span></h2>
        <ul class="dlist">${defects.slice(0, 6).map(d => `<li><a href="#/t/${d.tower_id}/maengel">
          <b>${esc(d.title)}</b><span>${esc(d.towers ? d.towers.park + ' · ' + d.towers.name : '')}${d.location ? ' · ' + esc(d.location) : ''}${d.needs_part ? ' · Teil: ' + esc(d.needs_part) : ''}</span></a></li>`).join('')}</ul>
        ${defects.length > 6 ? `<p class="muted small">und ${defects.length - 6} weitere, siehe Baustelle</p>` : ''}
      </section>` : ''}
      <div class="chips" role="group" aria-label="Filter">
        ${[['offen', 'In Arbeit'], ['abgeschlossen', 'Archiv'], ['alle', 'Alle']].map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${homeFilter === k}">${l}</button>`).join('')}
      </div>
      ${list.length ? parks.map(p => `<section class="park"><div class="row between parkhead"><h3>${esc(p)}</h3><a class="ghost small" href="#/tag/${today()}/${encodeURIComponent(p)}">Tagesbericht heute</a></div><div class="tgrid">
        ${list.filter(t => t.park === p).map(t => { const pr = progressOf(t, checks); const od = openBy(t.id); return `
          <a class="card tower" href="#/t/${t.id}/tag">
            <div class="row between"><b class="tname">${esc(t.name)}</b>
              ${t.status === 'abgeschlossen' ? '<span class="pill ok">Fertig</span>' : od ? `<span class="pill bad">${od} Mangel${od > 1 ? '' : ''}</span>` : '<span class="pill">In Arbeit</span>'}</div>
            ${isTurm(t) ? `<div class="muted small">${esc(T[t.tower_type].name)} · ${fmtDay(t.created_at)}</div>
            <div class="prog"><span>WLS</span>${bar(pr.wls)}<span class="num">${pr.wls}%</span></div>
            <div class="prog"><span>Fin.</span>${bar(pr.fin)}<span class="num">${pr.fin}%</span></div>`
            : `<div class="muted small">Baustelle${t.customer ? ' · ' + esc(t.customer) : ''} · ${fmtDay(t.created_at)}</div>${t.address ? `<div class="small">${esc(t.address)}</div>` : ''}`}
          </a>`; }).join('')}
      </div></section>`).join('') : `<div class="card empty"><p><b>${homeFilter === 'abgeschlossen' ? 'Noch keine abgeschlossenen Baustellen.' : 'Noch keine Baustelle angelegt.'}</b></p><p class="muted">Leg die erste Baustelle an, z.B. einen Turm im Windpark Lavamünd oder „Fensterreinigung Herr Eder“.</p></div>`}`;
    app.querySelectorAll('.chip').forEach(b => b.onclick = () => { homeFilter = b.dataset.f; viewHome(); });
  }

  // ---------- Neuer Turm ----------
  async function viewNew() {
    const towers = await S.listTowers();
    const parks = [...new Set(towers.map(t => t.park))];
    app.innerHTML = header('<div class="sub">Neue Baustelle</div>', '#/') + `
    <main class="wrap narrow"><form class="card" id="f-new" data-kind="turm">
      <div class="kindpick" role="group" aria-label="Art der Baustelle">
        <label class="crewchip"><input type="radio" name="n-kind" value="turm" checked><span>Windkraft-Turm (mit Checkliste)</span></label>
        <label class="crewchip"><input type="radio" name="n-kind" value="baustelle"><span>Sonstige Baustelle</span></label>
      </div>
      <label class="fld only-turm">Windpark<input id="t-park" list="parks" placeholder="Windpark Lavamünd" value="${esc(parks[0] || '')}"></label>
      <label class="fld only-turm">Turm / WEA Nummer<input id="t-name" placeholder="WEA 01"></label>
      <label class="fld only-turm">Turmtyp<select id="t-type">${Object.values(T).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
      <label class="fld only-site">Bezeichnung<input id="b-name" placeholder="z.B. Fensterreinigung Herr Eder"></label>
      <label class="fld only-site">Ort (für Gruppierung und Tagesbericht)<input id="b-park" list="parks" placeholder="z.B. Wien"></label>
      <datalist id="parks">${parks.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      <label class="fld">Kunde<input id="t-cust" value="Max Bögl"></label>
      <label class="fld placefld">Adresse (für Anreise und Kilometer)<input id="t-addr" autocomplete="off" placeholder="Straße, Ort"><div class="sugg" id="sg-addr" hidden></div></label>
      <button class="primary" type="submit">Baustelle anlegen</button>
    </form></main>`;
    bindLogout();
    const f = document.getElementById('f-new'), $ = id => document.getElementById(id);
    placeInput($('t-addr'), $('sg-addr'));
    document.querySelectorAll('input[name=n-kind]').forEach(r => r.onchange = () => {
      f.dataset.kind = r.value;
      if (r.value === 'baustelle' && $('t-cust').value === 'Max Bögl') $('t-cust').value = '';
      if (r.value === 'turm' && !$('t-cust').value) $('t-cust').value = 'Max Bögl';
    });
    f.onsubmit = e => {
      e.preventDefault();
      const turm = f.dataset.kind === 'turm';
      const park = (turm ? $('t-park') : $('b-park')).value.trim(), name = (turm ? $('t-name') : $('b-name')).value.trim();
      if (!park || !name) { toast(turm ? 'Bitte Windpark und Turmnummer eingeben.' : 'Bitte Bezeichnung und Ort eingeben.', true); return; }
      safe(async () => {
        const t = await S.createTower({ park, name, tower_type: turm ? $('t-type').value : 'baustelle', customer: $('t-cust').value.trim(), address: $('t-addr').value.trim() });
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
    const tabs = tpl ? [['tag', 'Tag', ''], ['wls', 'WLS', pr.wls + '%'], ['fin', 'Finish', pr.fin + '%'], ['maengel', 'Mängel', openDef ? String(openDef) : ''], ['info', 'Info', '']]
      : [['tag', 'Tag', ''], ['maengel', 'Mängel', openDef ? String(openDef) : ''], ['info', 'Info', '']];
    if (!tpl && (tab === 'wls' || tab === 'fin')) tab = 'tag';

    app.innerHTML = header(`<div class="sub">${esc(tower.park)}</div><div class="brand sm">${esc(tower.name)}</div>`, '#/') + `
      <nav class="tabs wrap" role="tablist">${tabs.map(([k, l, b]) => `<a role="tab" href="#/t/${id}/${k}" aria-selected="${tab === k}">${l}${b ? `<span class="badge${k === 'maengel' ? ' bad' : ''}">${b}</span>` : ''}</a>`).join('')}</nav>
      <main class="wrap" id="tv"></main>`;
    bindLogout();
    const main = document.getElementById('tv');

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
    const matrixOpen = [], matrixDone = [];
    ph.sections.forEach(sec => {
      html += `<section class="card sec"><h2>${esc(sec.title)}</h2>${sec.note ? `<p class="muted small">${esc(sec.note)}</p>` : ''}`;
      if (sec.type === 'matrix') {
        const openKeys = sec.rows.flatMap(r => r.cells.map(c => r.id + '-' + c)).filter(k => !map.has(k));
        const doneKeys = sec.rows.flatMap(r => r.cells.map(c => r.id + '-' + c)).filter(k => map.has(k));
        const mi = matrixOpen.push(openKeys) - 1; matrixDone[mi] = doneKeys;
        html += `<div class="allbar">
          ${openKeys.length ? `<button type="button" class="ghost allbtn" data-all="${mi}">Alle abhaken (${openKeys.length} offene Felder)</button>` : '<span class="okmsg small">Alle Felder dieser Matrix erledigt.</span>'}
          ${doneKeys.length ? `<button type="button" class="ghost nonebtn" data-none="${mi}">Alle abwählen (${doneKeys.length})</button>` : ''}
          ${openKeys.length ? '<span class="muted small">Nur wenn wirklich alle Ringe passen. Einzelne Felder lassen sich danach wieder abwählen.</span>' : ''}</div>`;
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
          if (it.input === 'text') return `<li class="${ch ? 'is-done' : ''}"><div class="inrow">
              <span class="txt">${esc(it.text)}</span>
              <span class="mm"><input type="text" class="numin" ${it.numeric ? 'inputmode="numeric"' : ''} id="in-${it.id}" value="${esc(ch?.value || '')}" placeholder="${esc(it.placeholder || '')}" aria-label="${esc(it.text)}" autocomplete="off"><button type="button" class="ghost small" data-in="${it.id}" data-check="${esc(it.check || '')}">Speichern</button></span>
              ${ch ? `<span class="pill ok">${esc(ch.value)}</span> ${who(ch)}` : ''}</div></li>`;
          if (it.input) return `<li class="${ch ? 'is-done' : ''}"><div class="inrow">
              <span class="txt">${esc(it.text)}${it.ref ? ` <span class="ref">${esc(it.ref)}</span>` : ''}</span>
              <span class="mm"><input type="number" inputmode="decimal" id="in-${it.id}" value="${esc(ch?.value || '')}" placeholder="mm" aria-label="${esc(it.text)}"><button type="button" class="ghost small" data-in="${it.id}" data-min="${it.min}" data-max="${it.max}">Speichern</button></span>
              ${ch ? `${(+ch.value < it.min || +ch.value > it.max) ? '<span class="pill bad">außer Toleranz</span>' : '<span class="pill ok">in Toleranz</span>'} ${who(ch)}` : ''}</div></li>`;
          return `<li class="${ch ? 'is-done' : ''}"><label><input type="checkbox" class="ck" data-k="${it.id}" ${ch ? 'checked' : ''}>
            <span class="txt">${esc(it.text)}${it.ref ? ` <span class="ref">${esc(it.ref)}</span>` : ''}${who(ch)}</span></label>${it.img ? `<a class="itemimg" href="${esc(it.img)}" target="_blank" rel="noopener"><img src="${esc(it.img)}" alt="So sieht das Teil aus" loading="lazy"><span>Foto vergrößern</span></a>` : ''}</li>`;
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
    main.querySelectorAll('[data-none]').forEach(btn => {
      const keys = matrixDone[+btn.dataset.none], label = btn.textContent;
      twoTap(btn, label, () => safe(async () => {
        btn.disabled = true; btn.textContent = 'Speichere …';
        await S.unsetChecks(tower.id, phase, keys);
        toast(keys.length + ' Felder abgewählt');
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
      if (v && b.dataset.min && (+v < +b.dataset.min || +v > +b.dataset.max)) toast('Außer Toleranz. Leiter korrigieren und neu messen.', true);
      if (v && b.dataset.check && !new RegExp(b.dataset.check).test(v)) toast('Bitte Nummer prüfen. Die FAUF-Nr. hat meist 8 Ziffern, z.B. 11216520.', true);
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
      ${others.length ? `<section class="card warnbox"><h2>Offen auf anderen Baustellen in ${esc(tower.park)}</h2><ul class="dlist">${others.map(d => `<li><a href="#/t/${d.tower_id}/maengel"><b>${esc(d.title)}</b><span>${esc(d.towers?.name || '')}${d.location ? ' · ' + esc(d.location) : ''}${d.needs_part ? ' · Teil: ' + esc(d.needs_part) : ''}</span></a></li>`).join('')}</ul></section>` : ''}
      <h2 class="h2out">Mängel an dieser Baustelle</h2>
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
      <section class="card sec"><h2>${tpl ? 'Turm' : 'Baustelle'}</h2>
        <dl class="kv"><dt>${tpl ? 'Windpark' : 'Ort'}</dt><dd>${esc(tower.park)}</dd><dt>${tpl ? 'Turm' : 'Bezeichnung'}</dt><dd>${esc(tower.name)}</dd><dt>Typ</dt><dd>${tpl ? esc(tpl.name) : 'Sonstige Baustelle'}</dd>
        <dt>Kunde</dt><dd>${esc(tower.customer || '')}</dd>${tower.address ? `<dt>Adresse</dt><dd>${esc(tower.address)}</dd>` : ''}<dt>Angelegt</dt><dd>${fmtDay(tower.created_at)} ${tower.created_by_name ? '· ' + esc(tower.created_by_name) : ''}</dd>
        <dt>Status</dt><dd>${tower.status === 'abgeschlossen' ? 'Abgeschlossen' : 'In Arbeit'}${tpl ? ` · WLS ${pr.wls}% · Finishing ${pr.fin}%` : ''}</dd></dl>
        <div class="row wrapgap">
          ${tpl ? `<a class="ghost" href="#/t/${tower.id}/protokoll">Protokoll anzeigen / drucken</a>` : ''}
          <button type="button" class="ghost" id="b-status">${tower.status === 'abgeschlossen' ? 'Wieder öffnen' : 'Als abgeschlossen ablegen'}</button>
          <button type="button" class="ghost danger" id="b-del">${tpl ? 'Turm' : 'Baustelle'} löschen</button>
        </div>
        <p class="muted small" id="del-hint"></p>
      </section>
      ${tpl ? `<section class="card sec"><h2>Ablauf Leitermontage</h2><ol class="flow">${tpl.flow.map(([h, p]) => `<li><b>${esc(h)}</b><p>${esc(p)}</p></li>`).join('')}</ol></section>
      <section class="card sec"><h2>Was bei diesem Turmtyp auffällt</h2>${tpl.hints.map(([k, h, p]) => `<div class="flag ${k}"><b>${esc(h)}</b><p>${esc(p)}</p></div>`).join('')}
        <p class="muted small">Quelle: ${esc(tpl.source)}</p></section>` : ''}`;
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
    const done = tpl ? ['wls', 'fin'].flatMap(p => window.summarizeDay(tpl, p, dayChecks).map(x => ({ ...x, phase: tpl.phases[p].title }))) : [];
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
        <p class="muted small">Gesamte Zeit vor Ort an dieser Baustelle. Ein Eintrag pro Truppe oder Zeitblock. Wer ausgewählt ist, bekommt die Zeit unter „Meine Zeit“ als Vorschlag.</p>
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
        </section>`).join('') : `<div class="card empty"><p><b>Für diesen Tag ist noch nichts eingetragen.</b></p><p class="muted">Arbeitszeit und Regie trägt das Team bei der Baustelle unter „Tag“ ein.</p></div>`}
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
  const KINDS = { arbeit: 'Arbeit', schulung: 'Schulung', urlaub: 'Urlaub', krank: 'Krankenstand', za: 'Zeitausgleich', pflege: 'Pflegeurlaub', sonder: 'Sonderurlaub', arzt: 'Arzt / Behörde' };
  const ABSENT = k => ['urlaub', 'krank', 'za', 'pflege', 'sonder', 'arzt'].includes(k);
  const NEEDS_OK = k => k === 'urlaub' || k === 'za';
  const pending = e => e.status === 'beantragt';
  const WDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'Feiertag'];

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
  const startOf = p => p.balance_date || p.entry_date || (p.created_at ? p.created_at.slice(0, 8) + '01' : today().slice(0, 8) + '01');

  // ---------- Reisekosten: Sätze, Diäten, Orte ----------
  // Startwerte wie in ARTimer: Taggeld pro angefangene Stunde, max. 12 h je 24-h-Block; Zuschläge 50 % nachts (Mo bis Sa), 100 % Sonntag
  const DEFAULT_SETTINGS = {
    km_rate: 0.5, diet_min_hours: 0, diet_max_hours: 12,
    countries: [
      { code: 'AT', name: 'Österreich', rate_h: 2.5, nacht: 17 }, { code: 'DE', name: 'Deutschland', rate_h: 2.95, nacht: 27.9 },
      { code: 'FR', name: 'Frankreich', rate_h: 2.73, nacht: 0 }, { code: 'IT', name: 'Italien', rate_h: 2.98, nacht: 27.9 },
      { code: 'CH', name: 'Schweiz', rate_h: 2.2, nacht: 32.7 }, { code: 'SK', name: 'Slowakei', rate_h: 2.2, nacht: 15.9 },
      { code: 'CZ', name: 'Tschechien', rate_h: 2.2, nacht: 24.4 }
    ],
    surcharges: [
      { id: 'nacht-abend', name: 'Nacht', pct: 50, from: '20:00', to: '24:00', days: [1, 2, 3, 4, 5, 6] },
      { id: 'nacht-frueh', name: 'Nacht', pct: 50, from: '00:00', to: '04:00', days: [1, 2, 3, 4, 5, 6] },
      { id: 'sonntag', name: 'Sonntag', pct: 100, from: '00:00', to: '24:00', days: [0] }
    ],
    limits: { day_h: 12, week_over_h: 13, month_over_h: 51 },
    allowances: [{ id: 'hoehe', name: 'Höhenzulage', unit: 'stunde', amount: 0 }, { id: 'gefahr', name: 'Gefahrenzulage', unit: 'stunde', amount: 0 }]
  };
  let SETTINGS = null;
  async function getCfg() {
    if (!SETTINGS) {
      const d = { ...((await S.getSettings()) || {}) };
      if (d.countries && !d.countries.some(c => 'rate_h' in c)) delete d.countries;   // alte Struktur verwerfen
      SETTINGS = { ...DEFAULT_SETTINGS, ...d, limits: { ...DEFAULT_SETTINGS.limits, ...(d.limits || {}) } };
    }
    return SETTINGS;
  }
  // Zuschlagsminuten eines Arbeitseintrags je Regel (Fahrzeit zählt nicht)
  function surchargeMin(e, rules) {
    const out = {};
    if (ABSENT(e.kind) || !e.start_time || !e.end_time || !rules?.length) return out;
    const s = toMin(e.start_time); let en = toMin(e.end_time); if (en <= s) en += 1440;
    for (let m = s; m < en; m++) {
      const d = m >= 1440 ? shiftDay(e.work_date, 1) : e.work_date, tod = m % 1440;
      const key = holidayName(d) ? 7 : new Date(d + 'T12:00').getDay();
      rules.forEach(r => { const f = toMin(r.from), t = r.to === '24:00' ? 1440 : toMin(r.to);
        if (r.days.includes(key) && (f < t ? tod >= f && tod < t : tod >= f || tod < t)) out[r.id] = (out[r.id] || 0) + 1; });
    }
    return out;
  }
  // Zuschläge nach Prozentsatz zusammenfassen, z.B. {50: 120, 100: 480} Minuten
  const surByPct = (rules, mins) => { const r = {}; (rules || []).forEach(x => { if (mins[x.id]) r[x.pct] = (r[x.pct] || 0) + mins[x.id]; }); return r; };
  const eur = n => (n || 0).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
  const countryName = (cfg, cc) => cfg.countries.find(c => c.code === (cc || 'AT'))?.name || cc;
  // Spanne Beginn bis Ende inkl. Pausen
  const spanMin = e => { if (!e.start_time || !e.end_time) return 0; let d = toMin(e.end_time) - toMin(e.start_time); if (d < 0) d += 1440; return d; };
  // Taggeld: je angefangene Stunde der Stundensatz, ab der Mindestdauer, höchstens die Höchststunden je Tag
  const dietFor = (cfg, min, rateH) => min > 0 && min / 60 >= (+cfg.diet_min_hours || 0) ? Math.min(Math.ceil(min / 60), +cfg.diet_max_hours || 12) * rateH : 0;
  function travelCosts(cfg, entries) {
    const byDay = {};
    entries.filter(e => (e.kind || 'arbeit') === 'arbeit').forEach(e => (byDay[e.work_date] = byDay[e.work_date] || []).push(e));
    const r = { kmPrivat: 0, kmGeld: 0, dInland: 0, dAusland: 0, nInland: 0, nAusland: 0, allow: {}, allowSum: 0, kmAll: 0 };
    Object.values(byDay).forEach(list => {
      list.forEach(e => {
        r.kmAll += +e.km || 0;
        if (e.vehicle === 'privat') r.kmPrivat += +e.km || 0;
        Object.entries(e.allowances || {}).forEach(([id, v]) => { r.allow[id] = (r.allow[id] || 0) + (+v || 0); });
      });
      const trips = list.filter(e => e.trip);
      const foreign = list.map(e => e.to_country).find(c => c && c !== 'AT');
      const at = cfg.countries.find(c => c.code === 'AT') || { rate_h: 2.5, nacht: 17 };
      const fr = foreign ? (cfg.countries.find(c => c.code === foreign) || at) : null;
      if (trips.length) {
        const dur = trips.reduce((a, e) => a + spanMin(e) + (+e.travel_min || 0), 0);
        if (fr) r.dAusland += dietFor(cfg, dur, +fr.rate_h || 0); else r.dInland += dietFor(cfg, dur, +at.rate_h || 0);
      }
      if (list.some(e => e.overnight)) { if (fr) r.nAusland += +fr.nacht || 0; else r.nInland += +at.nacht || 0; }
    });
    r.kmGeld = r.kmPrivat * (+cfg.km_rate || 0);
    (cfg.allowances || []).forEach(a => { r.allowSum += (r.allow[a.id] || 0) * (+a.amount || 0); });
    r.total = r.kmGeld + r.dInland + r.dAusland + r.nInland + r.nAusland + r.allowSum;
    return r;
  }
  // Ortssuche (OpenStreetMap / Photon) und Route (OSRM)
  const PLACES_KEY = 'deliri-places';
  const recentPlaces = () => { try { return JSON.parse(localStorage.getItem(PLACES_KEY)) || []; } catch (e) { return []; } };
  const rememberPlace = pl => { try { const l = recentPlaces().filter(x => x.label !== pl.label); l.unshift(pl); localStorage.setItem(PLACES_KEY, JSON.stringify(l.slice(0, 8))); } catch (e) {} };
  async function searchPlaces(q) {
    const r = await fetch('https://photon.komoot.io/api/?limit=6&lang=de&lat=47.6&lon=14.1&q=' + encodeURIComponent(q));
    const j = await r.json();
    return (j.features || []).map(f => { const p = f.properties || {};
      const label = [p.name, [p.street, p.housenumber].filter(Boolean).join(' '), [p.postcode, p.city || p.town || p.village].filter(Boolean).join(' ')].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') + (p.countrycode && p.countrycode !== 'AT' ? ' (' + p.countrycode + ')' : '');
      return { label, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], cc: (p.countrycode || 'AT').toUpperCase() }; });
  }
  function placeInput(input, box, onPick) {
    let tmr, seq = 0;
    const show = list => { box.innerHTML = list.map((pl, i) => `<button type="button" data-i="${i}">${esc(pl.label)}</button>`).join(''); box.hidden = !list.length;
      box.querySelectorAll('button').forEach(b => b.onmousedown = ev => { ev.preventDefault(); const pl = list[+b.dataset.i]; input.value = pl.label; Object.assign(input.dataset, { lat: pl.lat, lon: pl.lon, cc: pl.cc }); box.hidden = true; rememberPlace(pl); onPick && onPick(pl); }); };
    input.addEventListener('focus', () => { if (!input.value) show(recentPlaces()); });
    input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
    input.addEventListener('input', () => {
      delete input.dataset.lat; delete input.dataset.lon; clearTimeout(tmr); box.hidden = true;
      const q = input.value.trim(); if (q.length < 3) { show(q ? [] : recentPlaces()); return; }
      const my = ++seq; tmr = setTimeout(async () => { try { const l = await searchPlaces(q); if (my === seq && document.activeElement === input) show(l); } catch (e) { box.hidden = true; } }, 350);
    });
  }
  async function coordsOf(input) {
    if (input.dataset.lat) return { lat: +input.dataset.lat, lon: +input.dataset.lon, cc: input.dataset.cc };
    const l = await searchPlaces(input.value.trim()); if (!l.length) throw new Error('Ort „' + input.value + '“ nicht gefunden');
    Object.assign(input.dataset, { lat: l[0].lat, lon: l[0].lon, cc: l[0].cc }); return l[0];
  }
  async function routeKm(a, b) {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
    const j = await r.json(); if (!j.routes || !j.routes.length) throw new Error('Keine Route gefunden');
    return { km: j.routes[0].distance / 1000, min: j.routes[0].duration / 60 };
  }

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
  const istMin = e => pending(e) || e.kind === 'za' ? 0 : ABSENT(e.kind) ? (+e.hours || 0) * 60 : workMin(e) + (+e.travel_min || 0);

  // Stempeluhr-Zustand: Anreise, Arbeit oder Abreise
  const clockState = e => e.travel_started && !e.start_time ? 'anreise' : e.travel_started && e.end_time ? 'abreise' : 'arbeit';
  const travelSoFar = e => { if (!e.travel_started) return 0; let q = toMin(nowHM()) - toMin(e.travel_started); if (q < 0 || e.work_date !== today() && clockState(e) === 'anreise') q += 1440; return q; };
  // Automatische Pause: ab mehr als 6 h Arbeit mindestens 30 min (gibt neue Pause zurück oder 0)
  const autoPause = e => { if (!e.start_time || !e.end_time) return 0; const span = spanMin(e); return span - (+e.pause_min || 0) > 360 && (+e.pause_min || 0) < 30 ? 30 : 0; };

  // Tageswerte und Hinweise nach AZG
  function dayStats(entries, prevEntries, cfg) {
    const lim = (cfg || DEFAULT_SETTINGS).limits || DEFAULT_SETTINGS.limits;
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
        if (work > lim.day_h * 60) warn.push(`Über ${lim.day_h} h am Tag`);
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
  function accounts(p, entries, month, cfg) {
    const start = startOf(p), mFrom = month + '-01', mTo = month + '-' + String(daysIn(month)).padStart(2, '0');
    const ds = dailySoll(p), byDay = {};
    entries.forEach(e => { if (e.work_date >= start && e.work_date <= mTo) (byDay[e.work_date] = byDay[e.work_date] || []).push(e); });
    let saldoPrev = +p.saldo_start_min || 0, soll = 0, ist = 0;
    for (let d = start; d <= mTo; d = shiftDay(d, 1)) {
      const s = isWorkday(d) && d <= today() ? ds : 0, i = (byDay[d] || []).reduce((a, e) => a + istMin(e), 0);
      if (d < mFrom) saldoPrev += i - s; else { soll += s; ist += i; }
    }
    // Monat vor Stichtag: keine Saldoberechnung
    const active = mTo >= start;
    const inMonth = entries.filter(e => e.work_date >= mFrom && e.work_date <= mTo);
    const dayCount = k => inMonth.filter(e => e.kind === k && !pending(e)).reduce((a, e) => a + (+e.hours || ds / 60) / (ds / 60), 0);
    // Urlaub aliquot: je Monat 1/12 des Jahresanspruchs, ab dem Monat nach dem Stichtag (bei Stichtag am 1. inklusive)
    const months = (+month.slice(0, 4) - +start.slice(0, 4)) * 12 + (+month.slice(5, 7) - +start.slice(5, 7)) + (start.slice(8) === '01' ? 1 : 0);
    const vac = (+p.vacation_start || 0) + (+p.vacation_per_year || 0) / 12 * Math.max(0, months);
    const usedTotal = entries.filter(e => e.kind === 'urlaub' && !pending(e) && e.work_date >= start && e.work_date <= mTo).reduce((a, e) => a + (+e.hours || ds / 60) / (ds / 60), 0);
    const sur = {}; inMonth.forEach(e => Object.entries(surchargeMin(e, (cfg || DEFAULT_SETTINGS).surcharges)).forEach(([k, v]) => { sur[k] = (sur[k] || 0) + v; }));
    return {
      active, start, soll, ist, diff: ist - soll, saldoPrev, saldoNew: saldoPrev + ist - soll,
      vacUsed: dayCount('urlaub'), vacLeft: vac - usedTotal, sick: dayCount('krank'), za: dayCount('za'),
      pflege: dayCount('pflege'), sonder: dayCount('sonder'), arzt: inMonth.filter(e => e.kind === 'arzt').reduce((a, e) => a + (+e.hours || 0) * 60, 0),
      sur, surPct: surByPct((cfg || DEFAULT_SETTINGS).surcharges, sur), pendingCount: inMonth.filter(pending).length,
      schulung: inMonth.filter(e => e.kind === 'schulung').reduce((a, e) => a + workMin(e), 0),
      work: inMonth.filter(e => e.kind === 'arbeit').reduce((a, e) => a + workMin(e), 0),
      travel: inMonth.reduce((a, e) => a + (+e.travel_min || 0), 0),
      nights: new Set(inMonth.filter(e => e.overnight).map(e => e.work_date)).size,
      tc: travelCosts(cfg || DEFAULT_SETTINGS, inMonth)
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
    const cfg = await getCfg();
    const acc = accounts(person, allEntries, month, cfg);
    const sign = signs[0];
    const locked = !!sign && !u.isAdmin;
    const tName = id => { const t = towers.find(x => x.id === id); return t ? t.park + ' · ' + t.name : ''; };
    const stats = dayStats(entries, prevEntries, cfg);
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
    const towerOpts = sel => `<option value="">Keine Baustelle</option>${towers.filter(t => t.status !== 'abgeschlossen' || t.id === sel).map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.park + ' · ' + t.name)}</option>`).join('')}`;
    const running = self ? open[0] : null;
    const cols = printMode ? 6 : 7;
    const desc = e => ABSENT(e.kind) ? `<span class="pill k-${e.kind}">${KINDS[e.kind]}</span> ${dec(+e.hours || dailySoll(person) / 60)} h${pending(e) ? ' <span class="pill bad">beantragt</span>' : ''}` :
      `${e.kind === 'schulung' ? '<span class="pill k-schulung">Schulung</span> ' : ''}${esc(e.tower_id ? tName(e.tower_id) : e.location)}${e.overnight ? ' <span class="pill">Nächtigung</span>' : ''}` +
      (e.from_place || e.to_place || +e.km ? `<br><span class="muted">${esc(e.from_place || '?')} → ${esc(e.to_place || '?')}${e.to_country && e.to_country !== 'AT' ? ' (' + esc(e.to_country) + ')' : ''} · ${dec(+e.km || 0, 0)} km ${e.vehicle === 'privat' ? 'privat' : e.vehicle === 'keins' ? 'Mitfahrer' : 'Firmenwagen'}${e.trip ? ' · Dienstreise' : ''}</span>` : '') +
      (Object.keys(e.allowances || {}).length ? `<br>${Object.entries(e.allowances).map(([id, v]) => { const a = (cfg.allowances || []).find(x => x.id === id); return a ? `<span class="pill k-zulage">${esc(a.name)}${a.unit === 'stunde' ? ' ' + dec(+v) + ' h' : ''}</span>` : ''; }).join(' ')}` : '');

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
        (weekEnd ? `<tr class="weekrow"><td colspan="4">KW ${kw(d)}</td><td class="r num"><b>${hm(weeks[kw(d)])}</b></td><td colspan="${cols - 5}" class="small">${weeks[kw(d)] > ((+person.weekly_hours || 40) + cfg.limits.week_over_h) * 60 ? `⚠ mehr als ${cfg.limits.week_over_h} Überstunden in dieser Woche` : ''}</td></tr>` : '');
    }).join('');

    app.innerHTML = `<div class="noprint">${header(`<div class="sub">${self ? 'Meine Zeit' : 'Arbeitszeit'}</div><div class="brand sm">${esc(person.name)}</div>`, back)}${self ? topnav('zeit') : ''}</div>
      <main class="wrap timeview">
        ${self && !printMode ? `<section class="card clock">
          ${running ? (() => {
              const st = clockState(running), site = running.tower_id ? ' · ' + esc(tName(running.tower_id)) : '', old = running.work_date !== today();
              if (st === 'anreise') return `<div><div class="eyebrow">Anreise läuft</div><div class="clockbig">${esc(running.travel_started)} <span class="muted">seit</span></div>
                  <div class="muted small">${old ? '⚠ Gestartet am ' + fmtDay(running.work_date) + '. ' : ''}Fahrzeit bisher ${hm(travelSoFar(running))} h${site}</div></div>
                <div class="clockbtns"><button type="button" class="primary" id="c-arrive">Angekommen, Arbeit starten</button>${old ? `<button type="button" class="ghost" data-edit="${running.id}">Nachtragen</button>` : ''}</div>`;
              if (st === 'abreise') return `<div><div class="eyebrow">Abreise läuft</div><div class="clockbig">${esc(running.travel_started)} <span class="muted">seit</span></div>
                  <div class="muted small">Arbeit ${esc(running.start_time || '')}–${esc(running.end_time)} · Fahrzeit bisher ${hm(travelSoFar(running))} h${site}</div></div>
                <div class="clockbtns"><button type="button" class="primary dark" id="c-home">Angekommen, Abreise beenden</button></div>`;
              return `<div><div class="eyebrow">${running.pause_started ? 'Pause seit ' + esc(running.pause_started) : 'Arbeit läuft'}</div>
                  <div class="clockbig">${esc(running.start_time)} <span class="muted">seit</span></div>
                  <div class="muted small">${old ? '⚠ Gestartet am ' + fmtDay(running.work_date) + '. Bitte Endzeit nachtragen.' : 'Bisher ' + hm(workMin(running)) + ' h'}${running.travel_min ? ' · Anreise ' + hm(running.travel_min) + ' h' : ''}${site}</div></div>
                <div class="clockbtns">
                  ${!old ? (running.pause_started ? `<button type="button" class="primary" id="c-pause-end">Pause beenden</button>` : `<button type="button" class="ghost" id="c-pause">Pause starten</button>`) : ''}
                  ${!old ? `<button type="button" class="ghost" id="c-stop">Arbeit beenden</button><button type="button" class="primary dark" id="c-stop-travel">Arbeit beenden, Abreise starten</button>` : `<button type="button" class="ghost" data-edit="${running.id}">Endzeit nachtragen</button>`}
                </div>`;
            })()
          : `<div><div class="eyebrow">Stempeluhr</div><div class="clockbig">${nowHM()}</div>
              <label class="fld small">Baustelle<select id="c-tower">${towerOpts('')}</select></label></div>
            <div class="clockbtns"><button type="button" class="ghost" id="c-travel">Anreise starten</button><button type="button" class="primary" id="c-start">Arbeit starten</button></div>`}
        </section>` : ''}

        ${suggestions.length && !printMode ? `<section class="card sec note">
          <h2>Von der Baustelle übernehmen</h2>
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
          <div class="kpi"><span>${to >= today() && from <= today() ? 'Soll bis heute' : 'Soll'}</span><b>${hm(acc.soll)}</b></div>
          <div class="kpi"><span>Ist</span><b>${hm(acc.ist)}</b></div>
          <div class="kpi ${acc.diff < 0 ? 'neg' : 'pos'}"><span>Monat +/−</span><b>${hmSigned(acc.diff)}</b></div>
          <div class="kpi ${acc.saldoNew < 0 ? 'neg' : 'pos'}"><span>Gleitzeitsaldo</span><b>${hmSigned(acc.saldoNew)}</b><small>Übertrag ${hmSigned(acc.saldoPrev)}</small></div>
          <div class="kpi"><span>Resturlaub</span><b>${dec(acc.vacLeft, 1)}</b><small>Tage</small></div>
        </div>
        <p class="muted small kpiline">Arbeit ${hm(acc.work)} · Fahrzeit ${hm(acc.travel)} · Schulung ${hm(acc.schulung)} · Urlaub ${dec(acc.vacUsed, 1)} T · Krankenstand ${dec(acc.sick, 1)} T · ZA ${dec(acc.za, 1)} T${acc.pflege ? ' · Pflegeurlaub ' + dec(acc.pflege, 1) + ' T' : ''}${acc.sonder ? ' · Sonderurlaub ' + dec(acc.sonder, 1) + ' T' : ''}${acc.arzt ? ' · Arzt/Behörde ' + hm(acc.arzt) : ''} · Nächtigungen ${acc.nights}
          ${Object.keys(acc.surPct).length ? '<br><b>Zuschläge:</b> ' + Object.entries(acc.surPct).map(([pct, m]) => `${pct} %: ${hm(m)} h`).join(' · ') : ''}</p>
        ${acc.diff > cfg.limits.month_over_h * 60 ? `<p class="warn small">Mehr als ${cfg.limits.month_over_h} Überstunden in diesem Monat.</p>` : ''}
        ${acc.pendingCount ? `<p class="note small">${acc.pendingCount > 1 ? acc.pendingCount + ' Anträge (Urlaub/Zeitausgleich) warten' : '1 Antrag (Urlaub/Zeitausgleich) wartet'} auf Genehmigung durch Ali. Erst danach zählt das im Saldo und Urlaubskonto.</p>` : ''}
        <div class="card costs"><div class="row between"><b>Reisekosten und Zulagen</b><b class="num">${eur(acc.tc.total)}</b></div>
          <div class="costgrid"><span>Kilometergeld (${dec(acc.tc.kmPrivat, 0)} km privat)</span><b>${eur(acc.tc.kmGeld)}</b><span>Diäten Inland</span><b>${eur(acc.tc.dInland)}</b><span>Diäten Ausland</span><b>${eur(acc.tc.dAusland)}</b>
          <span>Nächtigungsgeld</span><b>${eur(acc.tc.nInland + acc.tc.nAusland)}</b>${(cfg.allowances || []).filter(a => acc.tc.allow[a.id]).map(a => `<span>${esc(a.name)} (${dec(acc.tc.allow[a.id])} ${a.unit === 'stunde' ? 'h' : 'T'})</span><b>${eur(acc.tc.allow[a.id] * (+a.amount || 0))}</b>`).join('')}</div>
          <p class="muted small">Gefahrene km gesamt ${dec(acc.tc.kmAll, 0)}. Sätze laut Einstellungen, Prüfung durch die Lohnverrechnung.</p></div>`
        : `<p class="muted small">Konten (Gleitzeit, Urlaub) werden ab ${fmtDay(acc.start)} gerechnet.</p>`}
        ${warnCount ? `<p class="warn small"><b>${warnCount} Hinweis${warnCount > 1 ? 'e' : ''} zu Pausen, Ruhezeit oder Höchstarbeitszeit.</b> Siehe markierte Tage.</p>` : ''}

        ${editable && !printMode ? `<form class="card sec" id="f-time" data-kind="arbeit">
          <h2 id="t-title">Zeit nachtragen</h2>
          <input type="hidden" id="t-id">
          <div class="kindpick" role="group" aria-label="Art">${Object.entries(KINDS).map(([k, l]) => `<label class="crewchip"><input type="radio" name="t-kind" value="${k}" ${k === 'arbeit' ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
          <div class="two">
            <label class="fld">Datum<input type="date" id="t-date" value="${month === today().slice(0, 7) ? today() : from}" required></label>
            <label class="fld only-abs">Bis (mehrere Tage)<input type="date" id="t-dateto"></label>
            <label class="fld only-work">Baustelle<select id="t-tower">${towerOpts('')}</select></label>
          </div>
          <div class="three only-work">
            <label class="fld">Von<input type="time" id="t-start" value="07:00"></label>
            <label class="fld">Bis<input type="time" id="t-end" value="17:00"></label>
            <label class="fld">Pause (min)<input type="number" id="t-pause" value="30" min="0" step="5" inputmode="numeric"></label>
          </div>
          <div class="two only-work">
            <label class="fld">Fahrzeit (min)<input type="number" id="t-travel" value="0" min="0" step="5" inputmode="numeric"></label>
            <label class="fld">Ort (wenn keine Baustelle)<input id="t-loc" placeholder="z.B. Büro, Lager, Schulung"></label>
          </div>
          <fieldset class="crew trip only-work"><legend>Fahrt und Diäten</legend>
            <div class="two">
              <label class="fld placefld">Abfahrtsort<input id="t-from" autocomplete="off" placeholder="z.B. Wien oder genaue Adresse"><div class="sugg" id="sg-from" hidden></div></label>
              <label class="fld placefld">Ankunftsort<input id="t-to" autocomplete="off" placeholder="z.B. Lavamünd"><div class="sugg" id="sg-to" hidden></div></label>
            </div>
            <div class="row wrapgap"><button type="button" class="ghost small" id="t-route">Kilometer berechnen</button><label class="confirm small"><input type="checkbox" id="t-return" checked> Hin und zurück</label><span class="muted small" id="t-routeinfo"></span></div>
            <div class="three">
              <label class="fld">Kilometer<input type="number" id="t-km" min="0" step="1" value="0" inputmode="numeric"></label>
              <label class="fld">Fahrzeug<select id="t-veh"><option value="firma">Firmenwagen</option><option value="privat">Privatauto (km-Geld)</option><option value="keins">Mitfahrer / kein Auto</option></select></label>
              <label class="fld">Zielland<select id="t-cc"><option value="AT">Österreich</option>${cfg.countries.map(c => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('')}</select></label>
            </div>
            <label class="confirm"><input type="checkbox" id="t-trip"> Dienstreise, Diäten berechnen</label>
            <label class="confirm"><input type="checkbox" id="t-night"> Nächtigung auswärts</label>
          </fieldset>
          ${(cfg.allowances || []).length ? `<fieldset class="crew only-work"><legend>Zulagen</legend>
            ${cfg.allowances.map(a => `<div class="allowrow"><label class="crewchip"><input type="checkbox" data-al="${esc(a.id)}"><span>${esc(a.name)}</span></label>${a.unit === 'stunde' ? `<input type="number" class="alh" data-alh="${esc(a.id)}" min="0" step="0.5" placeholder="Std." aria-label="Stunden ${esc(a.name)}" inputmode="decimal">` : '<span class="muted small">pro Tag</span>'}</div>`).join('')}
          </fieldset>` : ''}
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
    const siteDest = tid => { const t = towers.find(x => x.id === tid); return t ? { to_place: t.address || (t.name + ', ' + t.park) } : {}; };
    if ($('c-start')) $('c-start').onclick = () => safe(async () => { const tid = $('c-tower').value || null; await S.saveTime({ ...base, kind: 'arbeit', status: 'genehmigt', work_date: today(), start_time: nowHM(), tower_id: tid, ...siteDest(tid) }); toast('Arbeit gestartet ' + nowHM()); reload(); });
    if ($('c-travel')) $('c-travel').onclick = () => safe(async () => { const tid = $('c-tower').value || null; await S.saveTime({ ...base, kind: 'arbeit', status: 'genehmigt', work_date: today(), start_time: null, travel_started: nowHM(), tower_id: tid, trip: !!tid, ...siteDest(tid) }); toast('Anreise gestartet ' + nowHM()); reload(); });
    if ($('c-arrive')) $('c-arrive').onclick = () => safe(async () => { await S.saveTime({ id: running.id, travel_min: (+running.travel_min || 0) + travelSoFar(running), travel_started: null, start_time: nowHM() }); toast('Angekommen. Arbeit gestartet ' + nowHM()); reload(); });
    if ($('c-home')) $('c-home').onclick = () => safe(async () => { await S.saveTime({ id: running.id, travel_min: (+running.travel_min || 0) + travelSoFar(running), travel_started: null }); toast('Abreise beendet ' + nowHM() + '. Fahrzeit gespeichert.'); reload(); });
    if ($('c-pause')) $('c-pause').onclick = () => safe(async () => { await S.saveTime({ id: running.id, pause_started: nowHM() }); reload(); });
    if ($('c-pause-end')) $('c-pause-end').onclick = () => safe(async () => {
      let q = toMin(nowHM()) - toMin(running.pause_started); if (q < 0) q += 1440;
      await S.saveTime({ id: running.id, pause_started: null, pause_min: (+running.pause_min || 0) + q }); reload();
    });
    if ($('c-stop')) $('c-stop').onclick = () => safe(async () => {
      const patch = { id: running.id, end_time: nowHM() };
      if (running.pause_started) { let q = toMin(nowHM()) - toMin(running.pause_started); if (q < 0) q += 1440; patch.pause_min = (+running.pause_min || 0) + q; patch.pause_started = null; }
      const auto = autoPause({ ...running, ...patch }); if (auto) patch.pause_min = auto;
      await S.saveTime(patch); toast('Arbeit beendet ' + nowHM() + (auto ? '. Pause auf 30 min ergänzt (Pflicht ab 6 h).' : '')); reload();
    });
    if ($('c-stop-travel')) $('c-stop-travel').onclick = () => safe(async () => {
      const patch = { id: running.id, end_time: nowHM(), travel_started: nowHM() };
      if (running.pause_started) { let q = toMin(nowHM()) - toMin(running.pause_started); if (q < 0) q += 1440; patch.pause_min = (+running.pause_min || 0) + q; patch.pause_started = null; }
      const auto = autoPause({ ...running, ...patch }); if (auto) patch.pause_min = auto;
      await S.saveTime(patch); toast('Arbeit beendet, Abreise läuft' + (auto ? '. Pause auf 30 min ergänzt.' : '')); reload();
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
      $('t-from').value = e.from_place || ''; $('t-to').value = e.to_place || ''; ['t-from', 't-to'].forEach(id => { delete $(id).dataset.lat; delete $(id).dataset.lon; });
      $('t-km').value = e.km || 0; $('t-veh').value = e.vehicle || 'firma'; $('t-cc').value = e.to_country || 'AT'; $('t-trip').checked = !!e.trip;
      document.querySelectorAll('[data-al]').forEach(c => { const v = (e.allowances || {})[c.dataset.al]; c.checked = v != null; const hEl = document.querySelector(`[data-alh="${c.dataset.al}"]`); if (hEl) hEl.value = v ?? ''; });
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
            const status = NEEDS_OK(k) && !u.isAdmin ? 'beantragt' : 'genehmigt';
            for (const d of dates) await S.saveTime({ ...(id ? { id } : base), kind: k, status, work_date: d, hours, start_time: null, end_time: null, pause_min: 0, travel_min: 0, tower_id: null, location: '', overnight: false, note: $('t-note').value.trim(),
              from_place: '', to_place: '', to_country: 'AT', km: 0, vehicle: 'firma', trip: false, allowances: {} });
            toast(KINDS[k] + (dates.length > 1 ? ` für ${dates.length} Arbeitstage` : '') + (status === 'beantragt' ? ' beantragt. Ali muss noch genehmigen.' : ' gespeichert')); reload(); return;
          }
          const row = { ...base, kind: k, hours: null, work_date: date, start_time: $('t-start').value, end_time: $('t-end').value || null, pause_min: +$('t-pause').value || 0,
            travel_min: +$('t-travel').value || 0, tower_id: $('t-tower').value || null, location: $('t-loc').value.trim(), overnight: $('t-night').checked, note: $('t-note').value.trim(),
            travel_started: null, from_place: $('t-from').value.trim(), to_place: $('t-to').value.trim(), to_country: $('t-cc').value || 'AT', km: Math.round(+$('t-km').value || 0), vehicle: $('t-veh').value, trip: $('t-trip').checked, allowances: {} };
          document.querySelectorAll('[data-al]:checked').forEach(c => { const hEl = document.querySelector(`[data-alh="${c.dataset.al}"]`); row.allowances[c.dataset.al] = hEl ? (+String(hEl.value).replace(',', '.') || Math.round(workMin({ ...row, kind: 'arbeit' }) / 30) / 2) : 1; });
          if (row.vehicle === 'privat' && row.km > 0 && (!row.from_place || !row.to_place)) { toast('Für Kilometergeld bitte Abfahrts- und Ankunftsort angeben (Fahrtenbuch).', true); return; }
          if (id) row.id = id;
          if (!row.start_time) { toast('Bitte eine Beginnzeit eintragen.', true); return; }
          if (!row.end_time && row.work_date !== today()) { toast('Bitte eine Endzeit eintragen.', true); return; }
          row.status = 'genehmigt';
          const auto = autoPause(row); if (auto) row.pause_min = auto;
          await S.saveTime(row); toast(auto ? 'Gespeichert. Pause auf 30 min ergänzt (Pflicht ab 6 h).' : 'Gespeichert'); reload();
        });
      };
      $('t-cancel').onclick = () => reload();
      $('t-veh').value = person.company_car === false ? 'privat' : 'firma';
      $('t-tower').onchange = () => { const d = siteDest($('t-tower').value); if (d.to_place && !$('t-to').value) { $('t-to').value = d.to_place; delete $('t-to').dataset.lat; } };
      placeInput($('t-from'), $('sg-from'));
      placeInput($('t-to'), $('sg-to'), pl => { if (pl.cc && ($('t-cc').querySelector(`option[value="${pl.cc}"]`))) $('t-cc').value = pl.cc; });
      $('t-route').onclick = () => safe(async () => {
        if (!$('t-from').value.trim() || !$('t-to').value.trim()) { toast('Bitte Abfahrts- und Ankunftsort eingeben.', true); return; }
        $('t-routeinfo').textContent = 'Berechne …';
        const a = await coordsOf($('t-from')), b = await coordsOf($('t-to')), r = await routeKm(a, b), k = $('t-return').checked ? 2 : 1;
        $('t-km').value = Math.round(r.km * k);
        if (b.cc && $('t-cc').querySelector(`option[value="${b.cc}"]`)) $('t-cc').value = b.cc;
        if (!(+$('t-travel').value)) $('t-travel').value = Math.round(r.min * k / 5) * 5;
        if (r.km >= 25) $('t-trip').checked = true;
        $('t-routeinfo').textContent = `${dec(r.km, 0)} km, ca. ${hm(r.min)} h pro Strecke`;
      }).finally(() => { if ($('t-routeinfo').textContent === 'Berechne …') $('t-routeinfo').textContent = ''; });
      document.querySelectorAll('[data-alh]').forEach(i => i.addEventListener('input', () => { const c = document.querySelector(`[data-al="${i.dataset.alh}"]`); if (c && i.value) c.checked = true; }));
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
      const al = cfg.allowances || [];
      const lines = [['Mitarbeiter', 'Datum', 'Wochentag', 'Art', 'Beginn', 'Ende', 'Pause (min)', 'Fahrzeit (min)', 'Stunden', 'Baustelle / Ort', 'Abfahrtsort', 'Ankunftsort', 'Land', 'km', 'Fahrzeug', 'Dienstreise', 'Nächtigung', ...al.map(a => a.name + (a.unit === 'stunde' ? ' (h)' : ' (Tage)')), 'Notiz', 'Hinweise'].map(q).join(';')];
      days.forEach(d => stats[d].list.forEach(e => lines.push([person.name, d.split('-').reverse().join('.'), wd(d), KINDS[e.kind || 'arbeit'], e.start_time || '', e.end_time || '', ABSENT(e.kind) ? '' : e.pause_min || 0, e.travel_min || 0,
        h2(istMin(e)), e.tower_id ? tName(e.tower_id) : e.location, e.from_place || '', e.to_place || '', e.to_country || '', e.km || '', ABSENT(e.kind) ? '' : ({ firma: 'Firmenwagen', privat: 'Privatauto', keins: 'Mitfahrer' }[e.vehicle] || ''),
        e.trip ? 'ja' : '', e.overnight ? 'ja' : '', ...al.map(a => (e.allowances || {})[a.id] != null ? String((e.allowances || {})[a.id]).replace('.', ',') : ''), e.note, stats[d].warn.join(', ')].map(q).join(';'))));
      lines.push('');
      [['Soll', h2(acc.soll)], ['Ist', h2(acc.ist)], ['Monat +/-', h2(acc.diff)], ['Übertrag Vormonat', h2(acc.saldoPrev)], ['Gleitzeitsaldo neu', h2(acc.saldoNew)],
       ['Urlaub genommen (Tage)', dec(acc.vacUsed, 2)], ['Resturlaub (Tage)', dec(acc.vacLeft, 2)], ['Krankenstand (Tage)', dec(acc.sick, 2)], ['Zeitausgleich (Tage)', dec(acc.za, 2)],
       ['Schulung (h)', h2(acc.schulung)], ['Fahrzeit (h)', h2(acc.travel)], ['Nächtigungen', acc.nights],
       ['km privat', dec(acc.tc.kmPrivat, 0)], ['Kilometergeld (EUR)', dec(acc.tc.kmGeld)], ['Diäten Inland (EUR)', dec(acc.tc.dInland)], ['Diäten Ausland (EUR)', dec(acc.tc.dAusland)],
       ['Nächtigungsgeld (EUR)', dec(acc.tc.nInland + acc.tc.nAusland)], ...al.map(a => [a.name + ' (EUR)', dec((acc.tc.allow[a.id] || 0) * (+a.amount || 0))])].forEach(([a, b]) => lines.push([q(a), q(b)].join(';')));
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

  const surRow = r => `<tr data-id="${esc(r.id || '')}"><td><input class="sn" value="${esc(r.name)}"></td><td><input class="sp" type="number" step="1" value="${r.pct}" style="width:64px"></td>
    <td><input class="sf" type="time" value="${esc(r.from)}"></td><td><input class="st" type="time" value="${esc(r.to === '24:00' ? '00:00' : r.to)}"></td>
    <td class="nowrap">${WDAYS.map((w, i) => `<label class="daybox"><input type="checkbox" class="sd" value="${i}" ${r.days.includes(i) ? 'checked' : ''}><span>${w === 'Feiertag' ? 'Ft' : w}</span></label>`).join('')}</td>
    <td><button type="button" class="ghost small rm">×</button></td></tr>`;

  // ---------- Team (nur Admin) ----------
  async function viewTeam(month, printMode) {
    const u = S.user();
    if (!u.isAdmin) { location.hash = '#/'; return; }
    month = month || today().slice(0, 7);
    const to = month + '-' + String(daysIn(month)).padStart(2, '0');
    const profiles = await S.listProfiles();
    const minStart = profiles.reduce((m, p) => startOf(p) < m ? startOf(p) : m, month + '-01');
    const [entries, signs, cfg, requests] = await Promise.all([S.listTime({ from: shiftDay(minStart, -1), to }), S.listMonthSignoffs({ month }), getCfg(), S.listRequests()]);
    const pcts = [...new Set((cfg.surcharges || []).map(r => +r.pct))].sort((a, b) => a - b);
    const rows = profiles.filter(p => p.active).map(p => {
      const mine = entries.filter(e => e.profile_id === p.id);
      const st = dayStats(mine.filter(e => e.work_date >= month + '-01'), [], cfg);
      return { p, acc: accounts(p, mine, month, cfg), warn: Object.values(st).reduce((s, d) => s + d.warn.length, 0), sign: signs.find(x => x.profile_id === p.id) };
    });
    const csv = () => {
      const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', h2 = m => (m / 60).toFixed(2).replace('.', ',');
      const al = cfg.allowances || [];
      const head = ['Mitarbeiter', 'Art', 'Wochenstunden', 'Soll (h)', 'Ist (h)', 'Monat +/- (h)', 'Übertrag Vormonat (h)', 'Gleitzeitsaldo neu (h)', 'Urlaub genommen (Tage)', 'Resturlaub (Tage)', 'Krankenstand (Tage)', 'Zeitausgleich (Tage)', 'Pflegeurlaub (Tage)', 'Sonderurlaub (Tage)', 'Arzt/Behörde (h)', 'Schulung (h)', 'Fahrzeit (h)', 'Nächtigungen',
        ...pcts.map(x => 'Zuschlag ' + x + ' % (h)'), 'km privat', 'Kilometergeld (EUR)', 'Diäten Inland (EUR)', 'Diäten Ausland (EUR)', 'Nächtigungsgeld (EUR)', ...al.flatMap(a => [a.name + (a.unit === 'stunde' ? ' (h)' : ' (Tage)'), a.name + ' (EUR)']), 'Monat bestätigt', 'Hinweise AZG'];
      return [head.map(q).join(';'), ...rows.map(({ p, acc, warn, sign }) => [p.name, p.kind === 'sub' ? 'Subunternehmer' : 'Angestellt', dec(+p.weekly_hours || 40), h2(acc.soll), h2(acc.ist), h2(acc.diff), h2(acc.saldoPrev), h2(acc.saldoNew),
        dec(acc.vacUsed, 2), dec(acc.vacLeft, 2), dec(acc.sick, 2), dec(acc.za, 2), dec(acc.pflege, 2), dec(acc.sonder, 2), h2(acc.arzt), h2(acc.schulung), h2(acc.travel), acc.nights,
        ...pcts.map(x => h2(acc.surPct[x] || 0)), dec(acc.tc.kmPrivat, 0), dec(acc.tc.kmGeld), dec(acc.tc.dInland), dec(acc.tc.dAusland), dec(acc.tc.nInland + acc.tc.nAusland), ...al.flatMap(a => [dec(acc.tc.allow[a.id] || 0), dec((acc.tc.allow[a.id] || 0) * (+a.amount || 0))]),
        sign ? 'ja, ' + fmtDay(sign.signed_at) : 'nein', warn].map(q).join(';'))].join('\r\n');
    };
    const table = `<div class="tblwrap"><table class="rep teamtbl"><thead><tr><th>Name</th><th class="r">Soll</th><th class="r">Ist</th><th class="r">+/− Monat</th><th class="r">Übertrag</th><th class="r">Saldo neu</th><th class="r">Urlaub</th><th class="r">Rest&shy;urlaub</th><th class="r">Krank</th><th class="r">ZA</th><th class="r">Fahrt</th><th class="r">Nächt.</th>${pcts.map(x => `<th class="r">+${x} %</th>`).join('')}<th class="r">km priv.</th><th class="r">Reisekosten</th><th class="r">Zulagen</th><th>Status</th>${printMode ? '' : '<th class="noprint"></th>'}</tr></thead><tbody>
      ${rows.map(({ p, acc, warn, sign }) => `<tr><td class="nowrap"><b>${esc(p.name)}</b>${p.kind === 'sub' ? ' <span class="pill">Sub</span>' : ''}</td>
        <td class="r num">${hm(acc.soll)}</td><td class="r num">${hm(acc.ist)}</td><td class="r num ${acc.diff < 0 ? 'negt' : ''}">${hmSigned(acc.diff)}</td><td class="r num">${hmSigned(acc.saldoPrev)}</td><td class="r num ${acc.saldoNew < 0 ? 'negt' : ''}"><b>${hmSigned(acc.saldoNew)}</b></td>
        <td class="r num">${dec(acc.vacUsed, 1)}</td><td class="r num"><b>${dec(acc.vacLeft, 1)}</b></td><td class="r num">${dec(acc.sick, 1)}</td><td class="r num">${dec(acc.za, 1)}</td><td class="r num">${hm(acc.travel)}</td><td class="r num">${acc.nights}</td>${pcts.map(x => `<td class="r num">${acc.surPct[x] ? hm(acc.surPct[x]) : ''}</td>`).join('')}
        <td class="r num">${dec(acc.tc.kmPrivat, 0)}</td><td class="r num">${eur(acc.tc.kmGeld + acc.tc.dInland + acc.tc.dAusland + acc.tc.nInland + acc.tc.nAusland)}</td><td class="r num">${eur(acc.tc.allowSum)}</td>
        <td class="nowrap">${sign ? '<span class="pill ok">bestätigt</span>' : '<span class="pill">offen</span>'}${warn ? ` <span class="pill bad">${warn} ⚠</span>` : ''}</td>
        ${printMode ? '' : `<td class="noprint"><a class="ghost small" href="#/zeit/${p.id}/${month}">Öffnen</a></td>`}</tr>`).join('')}
      </tbody></table></div>`;

    if (printMode) {
      app.innerHTML = `<main class="wrap report"><div class="rephead"><div><div class="eyebrow">Deliri GmbH · Monatsübersicht Arbeitszeit</div><h1>${esc(monthLabel(month))}</h1><p class="muted">Gleitzeit, Saldo und Urlaub in Stunden (h:mm) bzw. Tagen. Erstellt ${fmt(new Date().toISOString())}</p></div></div>${table}
        <p class="muted small">Saldo = Ist minus Soll (Soll ohne gesetzliche Feiertage). Ist enthält Arbeitszeit, Fahrzeit und Schulung. Urlaub, Krankenstand, Pflege- und Sonderurlaub sowie Arzt/Behörde werden mit den eingetragenen Stunden gutgeschrieben, Zeitausgleich reduziert den Saldo. Zuschläge: ${(cfg.surcharges || []).map(r => `${esc(r.name)} ${r.pct} % (${r.from}–${r.to}, ${r.days.map(d => WDAYS[d]).join(' ')})`).join('; ')}.</p>
        <div class="signs"><div><span></span>Deliri GmbH, Unterschrift</div><div><span></span>Datum</div></div></main>`;
      setTimeout(() => window.print(), 400); return;
    }

    app.innerHTML = header('<div class="brand">DELIRI</div><div class="sub">Team</div>') + topnav('team') + `
      <main class="wrap">
        <div class="card daybar"><a class="ghost small" href="#/team/${shiftMonth(month, -1)}" aria-label="Vormonat">‹</a><b class="monthname">${esc(monthLabel(month))}</b><a class="ghost small" href="#/team/${shiftMonth(month, 1)}" aria-label="Nächster Monat">›</a></div>
        ${requests.length ? `<section class="card sec warnbox"><h2>Offene Anträge <span class="pill bad">${requests.length}</span></h2>
          <ul class="entries">${requests.map(r => `<li><div class="row between"><b>${esc(profiles.find(p => p.id === r.profile_id)?.name || '?')}</b><span class="pill k-${r.kind}">${KINDS[r.kind]}</span></div>
            <div class="row between wrapgap"><span class="small">${fmtDay(r.work_date)} (${wd(r.work_date)}) · ${dec(+r.hours || 8)} h${r.note ? ' · ' + esc(r.note) : ''}</span>
            <span class="row"><button type="button" class="ghost small" data-rej="${r.id}">Ablehnen</button><button type="button" class="primary small" data-ok="${r.id}">Genehmigen</button></span></div></li>`).join('')}</ul>
          ${requests.length > 1 ? '<button type="button" class="ghost small" id="rq-all">Alle genehmigen</button>' : ''}
        </section>` : ''}
        <section class="card sec"><div class="row between wrapgap"><h2>Monatsübersicht für den Steuerberater</h2>
          <div class="row"><button type="button" class="ghost small" id="tm-print">Drucken / PDF</button><button type="button" class="ghost small" id="tm-csv">Excel (CSV)</button></div></div>
          ${rows.length ? table : '<p class="muted">Noch keine aktiven Mitarbeiter.</p>'}
          <p class="muted small">Ob und wie viele Überstunden aus dem Gleitzeitsaldo entstehen, regelt eure Gleitzeitvereinbarung bzw. der Kollektivvertrag.</p>
        </section>

        <details class="card sec" id="setbox"><summary><b>Sätze und Zulagen</b> <span class="muted small">Kilometergeld, Diäten, Nächtigungsgeld, Zulagenarten</span></summary>
          <form id="f-set" class="subform">
            <div class="three">
              <label class="fld">Kilometergeld €/km<input type="number" id="s-km" step="0.01" min="0" value="${cfg.km_rate}" inputmode="decimal"></label>
              <label class="fld">Taggeld ab Stunden<input type="number" id="s-dmin" step="0.5" min="0" value="${cfg.diet_min_hours}" inputmode="decimal"></label>
              <label class="fld">Taggeld höchstens Stunden/Tag<input type="number" id="s-dmax" step="1" min="1" value="${cfg.diet_max_hours}" inputmode="numeric"></label>
            </div>
            <h3>Taggeld und Nächtigung je Land</h3>
            <div class="tblwrap"><table class="rep settbl"><thead><tr><th>Code</th><th>Land</th><th class="r">Taggeld €/Stunde</th><th class="r">Nächtigung €</th><th></th></tr></thead><tbody id="s-cty">
              ${cfg.countries.map(c => `<tr><td><input class="cc" value="${esc(c.code)}" maxlength="2"></td><td><input class="cn" value="${esc(c.name)}"></td><td><input class="ct" type="number" step="0.01" value="${c.rate_h}"></td><td><input class="cnn" type="number" step="0.01" value="${c.nacht}"></td><td>${c.code === 'AT' ? '' : '<button type="button" class="ghost small rm">×</button>'}</td></tr>`).join('')}
            </tbody></table></div>
            <button type="button" class="ghost small" id="s-addc">+ Land</button>
            <h3>Zuschläge</h3>
            <div class="tblwrap"><table class="rep settbl"><thead><tr><th>Name</th><th class="r">%</th><th>Von</th><th>Bis</th><th>Tage</th><th></th></tr></thead><tbody id="s-sur">
              ${(cfg.surcharges || []).map(r => surRow(r)).join('')}
            </tbody></table></div>
            <button type="button" class="ghost small" id="s-adds">+ Zuschlag</button>
            <h3>Grenzen für Hinweise</h3>
            <div class="three">
              <label class="fld">Max. Stunden pro Tag<input type="number" id="s-lday" value="${cfg.limits.day_h}" min="1" step="0.5"></label>
              <label class="fld">Max. Überstunden pro Woche<input type="number" id="s-lweek" value="${cfg.limits.week_over_h}" min="0" step="0.5"></label>
              <label class="fld">Max. Überstunden pro Monat<input type="number" id="s-lmonth" value="${cfg.limits.month_over_h}" min="0" step="0.5"></label>
            </div>
            <h3>Zulagen</h3>
            <div class="tblwrap"><table class="rep settbl"><thead><tr><th>Bezeichnung</th><th>Einheit</th><th class="r">€ je Einheit</th><th></th></tr></thead><tbody id="s-al">
              ${(cfg.allowances || []).map(a => `<tr data-id="${esc(a.id)}"><td><input class="an" value="${esc(a.name)}"></td><td><select class="au"><option value="stunde" ${a.unit === 'stunde' ? 'selected' : ''}>pro Stunde</option><option value="tag" ${a.unit === 'tag' ? 'selected' : ''}>pro Tag</option></select></td><td><input class="aa" type="number" step="0.01" value="${a.amount}"></td><td><button type="button" class="ghost small rm">×</button></td></tr>`).join('')}
            </tbody></table></div>
            <button type="button" class="ghost small" id="s-adda">+ Zulage</button>
            <p class="muted small">Startwerte aus eurem ARTimer: Taggeld pro angefangene Stunde (Österreich 2,50 €, Deutschland 2,95 € usw.), höchstens 12 Stunden pro Tag. Nächtigung Inland 17 €, Ausland laut Reisegebührenvorschrift, Kilometergeld 0,50 €. Zuschläge 50 % von 20 bis 4 Uhr (Mo bis Sa) und 100 % am Sonntag. Fahrzeit bekommt keinen Zuschlag. Bitte mit dem Steuerberater abstimmen.</p>
            <button class="primary" type="submit">Sätze speichern</button>
          </form>
        </details>

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
          <div class="two">
            <label class="fld">Eintritt<input type="date" id="p-entry"></label>
            <label class="confirm"><input type="checkbox" id="p-car" checked> Fährt mit Firmenwagen</label>
          </div>
          <fieldset class="crew startvals"><legend>Startwerte beim Umstieg (Stand aus ARTimer)</legend>
            <div class="three">
              <label class="fld">Stichtag<input type="date" id="p-bdate"></label>
              <label class="fld">Resturlaub (Tage)<input type="number" id="p-vstart" value="0" step="0.5" inputmode="decimal"></label>
              <label class="fld">Gleitzeitsaldo (Stunden)<input type="number" id="p-sstart" value="0" step="0.25" inputmode="decimal" placeholder="z.B. 12,5 oder -3"></label>
            </div>
            <span class="muted small">Ab dem Stichtag rechnet die App Saldo und Urlaub selbst weiter. Der Urlaubsanspruch kommt monatlich aliquot dazu (1/12 pro Monat). Ohne Stichtag zählt das Eintrittsdatum.</span>
          </fieldset>
          <label class="confirm"><input type="checkbox" id="p-active" checked> Aktiv</label>
          <p class="muted small">Login: In Supabase einen Benutzer mit genau dieser E-Mail anlegen. Beim ersten Anmelden wird er automatisch mit diesem Mitarbeiter verknüpft.</p>
          <div class="row wrapgap"><button class="primary" type="submit">Speichern</button><button class="ghost" type="button" id="p-cancel" hidden>Abbrechen</button></div>
        </form>

        <section class="card sec"><h2>Alle Mitarbeiter</h2>
          <ul class="entries">${profiles.map(p => `<li class="${p.active ? '' : 'inactive'}"><div class="row between"><b>${esc(p.name)}</b><span>${p.role === 'admin' ? '<span class="pill ok">Admin</span> ' : ''}${p.kind === 'sub' ? '<span class="pill">Sub</span> ' : ''}${p.active ? '' : '<span class="pill">inaktiv</span>'}</span></div>
            <div class="row between"><span class="muted small">${esc(p.email || 'ohne E-Mail')} · ${p.user_id ? 'Login verknüpft' : 'noch kein Login'} · ${dec(+p.weekly_hours || 40)} h/Woche · Eintritt ${p.entry_date ? fmtDay(p.entry_date) : '?'} · Stichtag ${p.balance_date ? fmtDay(p.balance_date) : 'nicht gesetzt'}</span><button type="button" class="ghost small" data-p="${p.id}">Bearbeiten</button></div></li>`).join('')}</ul>
        </section>
      </main>`;
    bindLogout();
    const $ = id => document.getElementById(id);
    $('tm-print').onclick = () => { location.hash = '#/team/' + month + '/druck'; };
    document.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => safe(async () => { await S.saveTime({ id: b.dataset.ok, status: 'genehmigt' }); toast('Genehmigt'); viewTeam(month); }));
    document.querySelectorAll('[data-rej]').forEach(b => twoTap(b, 'Ablehnen', () => safe(async () => { await S.deleteTime(b.dataset.rej); toast('Abgelehnt und gelöscht'); viewTeam(month); })));
    if ($('rq-all')) twoTap($('rq-all'), 'Alle genehmigen', () => safe(async () => { for (const r of requests) await S.saveTime({ id: r.id, status: 'genehmigt' }); toast('Alle genehmigt'); viewTeam(month); }));
    $('tm-csv').onclick = () => download(`Monatsuebersicht_Arbeitszeit_${month}.csv`, csv());
    document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      const p = profiles.find(x => x.id === b.dataset.p);
      $('p-id').value = p.id; $('p-name').value = p.name; $('p-email').value = p.email || ''; $('p-kind').value = p.kind; $('p-role').value = p.role; $('p-active').checked = p.active;
      $('p-week').value = p.weekly_hours ?? 40; $('p-vac').value = p.vacation_per_year ?? 25; $('p-bdate').value = p.balance_date || ''; $('p-vstart').value = p.vacation_start ?? 0; $('p-sstart').value = (p.saldo_start_min || 0) / 60;
      $('p-entry').value = p.entry_date || ''; $('p-car').checked = p.company_car !== false;
      $('p-title').textContent = 'Mitarbeiter bearbeiten'; $('p-cancel').hidden = false; $('f-prof').scrollIntoView({ behavior: 'smooth' });
    });
    $('p-cancel').onclick = () => viewTeam(month);
    const rmBind = () => document.querySelectorAll('#f-set .rm').forEach(b => b.onclick = () => b.closest('tr').remove());
    rmBind();
    $('s-addc').onclick = () => { $('s-cty').insertAdjacentHTML('beforeend', '<tr><td><input class="cc" maxlength="2"></td><td><input class="cn"></td><td><input class="ct" type="number" step="0.01"></td><td><input class="cnn" type="number" step="0.01"></td><td><button type="button" class="ghost small rm">×</button></td></tr>'); rmBind(); };
    $('s-adds').onclick = () => { $('s-sur').insertAdjacentHTML('beforeend', surRow({ name: '', pct: 50, from: '20:00', to: '24:00', days: [1, 2, 3, 4, 5] })); rmBind(); };
    $('s-adda').onclick = () => { $('s-al').insertAdjacentHTML('beforeend', '<tr><td><input class="an" placeholder="z.B. Schmutzzulage"></td><td><select class="au"><option value="stunde">pro Stunde</option><option value="tag">pro Tag</option></select></td><td><input class="aa" type="number" step="0.01"></td><td><button type="button" class="ghost small rm">×</button></td></tr>'); rmBind(); };
    $('f-set').onsubmit = e => {
      e.preventDefault();
      const num = el => +String(el.value).replace(',', '.') || 0;
      const slug = t => t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'zulage';
      const data = { km_rate: num($('s-km')), diet_min_hours: num($('s-dmin')), diet_max_hours: num($('s-dmax')) || 12,
        limits: { day_h: num($('s-lday')) || 12, week_over_h: num($('s-lweek')), month_over_h: num($('s-lmonth')) },
        countries: [...$('s-cty').querySelectorAll('tr')].map(r => ({ code: r.querySelector('.cc').value.trim().toUpperCase(), name: r.querySelector('.cn').value.trim(), rate_h: num(r.querySelector('.ct')), nacht: num(r.querySelector('.cnn')) })).filter(c => c.code.length === 2 && c.name),
        surcharges: [...$('s-sur').querySelectorAll('tr')].map(r => ({ id: r.dataset.id || 'z-' + Math.random().toString(36).slice(2, 7), name: r.querySelector('.sn').value.trim(), pct: num(r.querySelector('.sp')),
          from: r.querySelector('.sf').value || '00:00', to: r.querySelector('.st').value === '00:00' || !r.querySelector('.st').value ? '24:00' : r.querySelector('.st').value,
          days: [...r.querySelectorAll('.sd:checked')].map(c => +c.value) })).filter(r => r.name && r.pct && r.days.length),
        allowances: [...$('s-al').querySelectorAll('tr')].map(r => ({ id: r.dataset.id || slug(r.querySelector('.an').value) + '-' + Math.random().toString(36).slice(2, 6), name: r.querySelector('.an').value.trim(), unit: r.querySelector('.au').value, amount: num(r.querySelector('.aa')) })).filter(a => a.name) };
      safe(async () => { await S.saveSettings(data); SETTINGS = null; toast('Sätze gespeichert'); viewTeam(month); });
    };
    $('f-prof').onsubmit = e => {
      e.preventDefault();
      safe(async () => {
        if ($('p-id').value === u.profileId && ($('p-role').value !== 'admin' || !$('p-active').checked)) { toast('Du kannst dir selbst die Admin-Rechte nicht entziehen.', true); return; }
        await S.saveProfile({ id: $('p-id').value || undefined, name: $('p-name').value.trim(), email: $('p-email').value.trim(), kind: $('p-kind').value, role: $('p-role').value, active: $('p-active').checked,
          weekly_hours: +$('p-week').value || 40, vacation_per_year: +$('p-vac').value || 0, balance_date: $('p-bdate').value || null, vacation_start: +$('p-vstart').value || 0,
          saldo_start_min: Math.round((parseFloat(String($('p-sstart').value).replace(',', '.')) || 0) * 60), entry_date: $('p-entry').value || null, company_car: $('p-car').checked });
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
        <table class="rep"><tbody>${items.map(i => { const c = map.get(i.key); return `<tr><td>${c ? '✓' : '○'}</td><td>${esc(i.label)}${c?.value ? ' <b>' + esc(c.value) + (i.unit || '') + '</b>' : ''}</td><td class="muted">${c ? esc(c.done_by_name) + ', ' + fmt(c.done_at) : 'offen'}</td></tr>`; }).join('')}</tbody></table>
        <p>${so.length ? so.map(s => `Unterschrieben: <b>${esc(s.name)}</b>, ${fmt(s.signed_at)}${s.open_items ? ` (mit ${s.open_items} offenen Punkten)` : ''}${s.note ? ' · ' + esc(s.note) : ''}`).join('<br>') : 'Noch nicht unterschrieben.'}</p>`;
    };
    app.innerHTML = `<div class="noprint">${header('<div class="sub">Protokoll</div>', '#/t/' + id + '/info')}</div>
      <main class="wrap report">
        <div class="row between noprint"><span></span><button class="primary" type="button" onclick="window.print()">Drucken / PDF</button></div>
        <h1>Montageprotokoll ${esc(tower.park)} · ${esc(tower.name)}</h1>
        <p class="muted">${esc(tpl.name)} · Kunde ${esc(tower.customer || '')} · Deliri GmbH · erstellt ${fmt(new Date().toISOString())}</p>
        <dl class="kv repnums"><dt>FAUF-Nr.</dt><dd><b>${esc(checks.find(c => c.item_id === 'fauf')?.value || 'fehlt')}</b></dd><dt>Seriennummer Leiter</dt><dd><b>${esc(checks.find(c => c.item_id === 'leiter_sn')?.value || 'fehlt')}</b></dd></dl>
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

  // Neue Version automatisch laden (GitHub Pages speichert Dateien bis zu 10 Minuten zwischen)
  async function checkUpdate() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json();
      if (j.v && window.APP_VERSION && j.v !== window.APP_VERSION && !document.querySelector('form.editing')) location.replace(location.pathname + '?v=' + j.v + location.hash);
    } catch (e) {}
  }
  checkUpdate();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });

  window.addEventListener('hashchange', render);
  S.init(render).then(render);
})();
