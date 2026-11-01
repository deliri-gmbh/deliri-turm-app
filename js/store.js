// Datenzugriff. Mit Supabase-Zugangsdaten in config.js läuft die App gemeinsam fürs Team,
// ohne läuft sie im Demo-Modus (Daten nur auf diesem Gerät).

(function () {
  const cfg = window.APP_CONFIG || {};
  const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

  // ---------------- Supabase ----------------
  function supabaseStore() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    let user = null, profile = null;
    const nameOf = u => profile?.name || (u && (u.user_metadata?.name || u.email?.split('@')[0])) || '';
    async function loadProfile() {
      if (!user) { profile = null; return; }
      const { data } = await sb.rpc('claim_profile', { p_name: user.user_metadata?.name || null });
      profile = data && data.id ? data : null;
    }
    const ok = r => { if (r.error) throw r.error; return r.data; };

    return {
      mode: 'team',
      async init(onChange) {
        const { data } = await sb.auth.getSession();
        user = data.session?.user || null;
        await loadProfile();
        sb.auth.onAuthStateChange((e, s) => {
          const was = user?.id; user = s?.user || null;
          if (e === 'TOKEN_REFRESHED' || was === user?.id) return;
          setTimeout(async () => { await loadProfile(); onChange(); }, 0);
        });
      },
      user: () => user && { id: user.id, email: user.email, name: profile?.name || '', profileId: profile?.id || null, isAdmin: profile?.role === 'admin' },
      async signIn(email, password) {
        if (password) { const d = ok(await sb.auth.signInWithPassword({ email, password })); user = d.user; await loadProfile(); }
        else ok(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.href.split('#')[0] } }));
      },
      async setName(name) {
        ok(await sb.auth.updateUser({ data: { name } })); user = (await sb.auth.getUser()).data.user;
        const data = ok(await sb.rpc('claim_profile', { p_name: name })); profile = data && data.id ? data : null;
      },
      async signOut() { await sb.auth.signOut(); user = null; profile = null; },

      // Team
      async listProfiles() { return ok(await sb.from('profiles').select('*').order('name')); },
      async saveProfile(p) {
        const row = { name: p.name, email: (p.email || '').toLowerCase(), kind: p.kind, role: p.role, active: p.active,
          weekly_hours: p.weekly_hours, vacation_per_year: p.vacation_per_year, balance_date: p.balance_date || null, vacation_start: p.vacation_start, saldo_start_min: p.saldo_start_min };
        if (p.id) return ok(await sb.from('profiles').update(row).eq('id', p.id).select().single());
        return ok(await sb.from('profiles').insert(row).select().single());
      },

      // Arbeitszeit
      async listTime(f) {
        let q = sb.from('time_entries').select('*').gte('work_date', f.from).lte('work_date', f.to).order('work_date').order('start_time');
        if (f.profileId) q = q.eq('profile_id', f.profileId);
        return ok(await q);
      },
      async openTime(profileId) { return ok(await sb.from('time_entries').select('*').eq('profile_id', profileId).eq('kind', 'arbeit').is('end_time', null).not('start_time', 'is', null).order('work_date')); },
      async saveTime(e) {
        const { id, ...row } = e;
        if (id) return ok(await sb.from('time_entries').update(row).eq('id', id).select().single());
        return ok(await sb.from('time_entries').insert(row).select().single());
      },
      async deleteTime(id) { ok(await sb.from('time_entries').delete().eq('id', id)); },
      async listMonthSignoffs(f) {
        let q = sb.from('month_signoffs').select('*').eq('month', f.month);
        if (f.profileId) q = q.eq('profile_id', f.profileId);
        return ok(await q);
      },
      async signMonth(m) { return ok(await sb.from('month_signoffs').insert(m).select().single()); },
      async unsignMonth(id) { ok(await sb.from('month_signoffs').delete().eq('id', id)); },
      async listTimeLog(f) { return ok(await sb.from('time_entries_log').select('*').eq('profile_id', f.profileId).gte('work_date', f.from).lte('work_date', f.to).order('changed_at', { ascending: false }).limit(200)); },

      async listTowers() { return ok(await sb.from('towers').select('*').order('created_at', { ascending: false })); },
      async getTower(id) { return ok(await sb.from('towers').select('*').eq('id', id).single()); },
      async createTower(t) { return ok(await sb.from('towers').insert({ ...t, created_by_name: nameOf(user) }).select().single()); },
      async updateTower(id, patch) { return ok(await sb.from('towers').update(patch).eq('id', id).select().single()); },
      async deleteTower(id) { ok(await sb.from('towers').delete().eq('id', id)); },

      async getChecks(towerId) { return ok(await sb.from('checks').select('*').eq('tower_id', towerId)); },
      async allChecks() { return ok(await sb.from('checks').select('tower_id,phase,item_id')); },
      async setCheck(towerId, phase, itemId, done, value = '') {
        if (done) ok(await sb.from('checks').upsert({ tower_id: towerId, phase, item_id: itemId, done: true, value, done_by_name: nameOf(user), done_at: new Date().toISOString() }));
        else ok(await sb.from('checks').delete().match({ tower_id: towerId, phase, item_id: itemId }));
      },

      async setChecks(towerId, phase, itemIds) {
        const at = new Date().toISOString(), by = nameOf(user);
        ok(await sb.from('checks').upsert(itemIds.map(item_id => ({ tower_id: towerId, phase, item_id, done: true, value: '', done_by_name: by, done_at: at }))));
      },

      async getSignoffs(towerId) { return ok(await sb.from('signoffs').select('*').eq('tower_id', towerId).order('signed_at')); },
      async addSignoff(s) { return ok(await sb.from('signoffs').insert(s).select().single()); },

      async listDefects(filter = {}) {
        let q = sb.from('defects').select('*, towers(park,name)').order('created_at', { ascending: false });
        if (filter.towerId) q = q.eq('tower_id', filter.towerId);
        if (filter.status) q = q.eq('status', filter.status);
        return ok(await q);
      },
      async addDefect(d, photoBlob) {
        let photo_path = null;
        if (photoBlob) {
          photo_path = d.tower_id + '/' + crypto.randomUUID() + '.jpg';
          ok(await sb.storage.from('defects').upload(photo_path, photoBlob, { contentType: 'image/jpeg' }));
        }
        return ok(await sb.from('defects').insert({ ...d, photo_path, created_by_name: nameOf(user) }).select().single());
      },
      async resolveDefect(id, resolved) {
        const patch = resolved ? { status: 'erledigt', resolved_at: new Date().toISOString(), resolved_by_name: nameOf(user) }
                               : { status: 'offen', resolved_at: null, resolved_by_name: '' };
        return ok(await sb.from('defects').update(patch).eq('id', id));
      },
      async photoUrl(path) {
        if (!path) return null;
        const { data } = await sb.storage.from('defects').createSignedUrl(path, 3600);
        return data?.signedUrl || null;
      },

      // Tagesbericht: Arbeitszeit und Regie. filter = { towerIds: [...], date: 'YYYY-MM-DD' }
      async listWorkdays(f) { return ok(await sb.from('workdays').select('*').in('tower_id', f.towerIds).eq('work_date', f.date).order('start_time')); },
      async addWorkday(w) { return ok(await sb.from('workdays').insert({ ...w, created_by_name: nameOf(user) }).select().single()); },
      async deleteWorkday(id) { ok(await sb.from('workdays').delete().eq('id', id)); },
      async listRegie(f) { return ok(await sb.from('regie').select('*').in('tower_id', f.towerIds).eq('work_date', f.date).order('start_time')); },
      async addRegie(r, photoBlob) {
        let photo_path = null;
        if (photoBlob) {
          photo_path = 'regie/' + r.tower_id + '/' + crypto.randomUUID() + '.jpg';
          ok(await sb.storage.from('defects').upload(photo_path, photoBlob, { contentType: 'image/jpeg' }));
        }
        return ok(await sb.from('regie').insert({ ...r, photo_path, created_by_name: nameOf(user) }).select().single());
      },
      async deleteRegie(id) { ok(await sb.from('regie').delete().eq('id', id)); },

      subscribe(towerId, cb) {
        const ch = sb.channel('tower-' + towerId)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'checks', filter: 'tower_id=eq.' + towerId }, cb)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'defects', filter: 'tower_id=eq.' + towerId }, cb)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'workdays', filter: 'tower_id=eq.' + towerId }, cb)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'regie', filter: 'tower_id=eq.' + towerId }, cb)
          .subscribe();
        return () => sb.removeChannel(ch);
      }
    };
  }

  // ---------------- Demo (localStorage) ----------------
  function localStore() {
    const KEY = 'deliri-turm-demo-v1';
    let db;
    try { db = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { db = null; }
    db = db || { user: null, towers: [], checks: [], signoffs: [], defects: [] };
    db.workdays = db.workdays || []; db.regie = db.regie || [];
    db.profiles = db.profiles || []; db.time = db.time || []; db.months = db.months || []; db.timelog = db.timelog || [];
    const me = () => db.profiles.find(p => p.user_id === 'demo' && db.user);
    const logT = (action, o, n) => db.timelog.push({ id: db.timelog.length + 1, entry_id: (n || o).id, profile_id: (n || o).profile_id, work_date: (n || o).work_date, action, old_row: o || null, new_row: n || null, changed_by_name: me()?.name || '', changed_at: now() });
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('Speicher voll', e); } };
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
    const now = () => new Date().toISOString();
    const tname = id => { const t = db.towers.find(x => x.id === id); return t ? { park: t.park, name: t.name } : null; };

    return {
      mode: 'demo',
      async init() {},
      user: () => db.user && { ...db.user, name: me()?.name || '', profileId: me()?.id || null, isAdmin: me()?.role === 'admin' },
      async signIn(email) { db.user = { id: 'demo', email }; save(); },
      async setName(name) {
        let p = me();
        if (!p) { p = { id: uid(), user_id: 'demo', email: db.user.email || '', name, kind: 'angestellt', weekly_hours: 40, vacation_per_year: 25, balance_date: null, vacation_start: 0, saldo_start_min: 0, role: db.profiles.some(x => x.role === 'admin') ? 'mitarbeiter' : 'admin', active: true, created_at: now() }; db.profiles.push(p); }
        p.name = name; save();
      },
      async signOut() { db.user = null; save(); },

      async listProfiles() { return [...db.profiles].sort((a, b) => a.name.localeCompare(b.name)); },
      async saveProfile(p) {
        if (p.id) { const x = db.profiles.find(y => y.id === p.id); const { id, ...rest } = p; Object.assign(x, rest); save(); return x; }
        const { id, ...rest } = p; const x = { id: uid(), user_id: null, created_at: now(), ...rest }; db.profiles.push(x); save(); return x;
      },
      async listTime(f) { return db.time.filter(t => t.work_date >= f.from && t.work_date <= f.to && (!f.profileId || t.profile_id === f.profileId)).sort((a, b) => (a.work_date + a.start_time).localeCompare(b.work_date + b.start_time)); },
      async openTime(pid) { return db.time.filter(t => t.profile_id === pid && !t.end_time && t.start_time && (t.kind || 'arbeit') === 'arbeit'); },
      async saveTime(e) {
        if (e.id) { const x = db.time.find(t => t.id === e.id); const o = { ...x }; Object.assign(x, e, { updated_at: now() }); logT('update', o, { ...x }); save(); return x; }
        const x = { kind: 'arbeit', pause_min: 0, travel_min: 0, overnight: false, note: '', location: '', ...e, id: uid(), created_at: now(), updated_at: now() }; db.time.push(x); logT('insert', null, { ...x }); save(); return x;
      },
      async deleteTime(id) { const o = db.time.find(t => t.id === id); db.time = db.time.filter(t => t.id !== id); if (o) logT('delete', o, null); save(); },
      async listMonthSignoffs(f) { return db.months.filter(m => m.month === f.month && (!f.profileId || m.profile_id === f.profileId)); },
      async signMonth(m) { const x = { id: uid(), signed_at: now(), ...m }; db.months.push(x); save(); return x; },
      async unsignMonth(id) { db.months = db.months.filter(m => m.id !== id); save(); },
      async listTimeLog(f) { return db.timelog.filter(l => l.profile_id === f.profileId && l.work_date >= f.from && l.work_date <= f.to).reverse(); },

      async listTowers() { return [...db.towers].sort((a, b) => b.created_at.localeCompare(a.created_at)); },
      async getTower(id) { return db.towers.find(t => t.id === id) || null; },
      async createTower(t) { const r = { id: uid(), status: 'offen', notes: '', created_at: now(), created_by_name: me()?.name || '', ...t }; db.towers.push(r); save(); return r; },
      async updateTower(id, patch) { const t = db.towers.find(x => x.id === id); Object.assign(t, patch); save(); return t; },
      async deleteTower(id) { db.towers = db.towers.filter(t => t.id !== id); ['checks', 'signoffs', 'defects', 'workdays', 'regie'].forEach(k => db[k] = db[k].filter(x => x.tower_id !== id)); save(); },

      async getChecks(towerId) { return db.checks.filter(c => c.tower_id === towerId); },
      async allChecks() { return db.checks; },
      async setCheck(towerId, phase, itemId, done, value = '') {
        db.checks = db.checks.filter(c => !(c.tower_id === towerId && c.phase === phase && c.item_id === itemId));
        if (done) db.checks.push({ tower_id: towerId, phase, item_id: itemId, done: true, value, done_by_name: me()?.name || '', done_at: now() });
        save();
      },

      async setChecks(towerId, phase, itemIds) {
        const ids = new Set(itemIds), at = now();
        db.checks = db.checks.filter(c => !(c.tower_id === towerId && c.phase === phase && ids.has(c.item_id)));
        itemIds.forEach(item_id => db.checks.push({ tower_id: towerId, phase, item_id, done: true, value: '', done_by_name: me()?.name || '', done_at: at }));
        save();
      },

      async getSignoffs(towerId) { return db.signoffs.filter(s => s.tower_id === towerId); },
      async addSignoff(s) { const r = { id: uid(), signed_at: now(), ...s }; db.signoffs.push(r); save(); return r; },

      async listDefects(f = {}) {
        return db.defects.filter(d => (!f.towerId || d.tower_id === f.towerId) && (!f.status || d.status === f.status))
          .map(d => ({ ...d, towers: tname(d.tower_id) }))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
      },
      async addDefect(d, photoBlob) {
        let photo_path = null;
        if (photoBlob) photo_path = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(photoBlob); });
        const r = { id: uid(), status: 'offen', created_at: now(), created_by_name: me()?.name || '', ...d, photo_path };
        db.defects.push(r); save(); return r;
      },
      async resolveDefect(id, resolved) {
        const d = db.defects.find(x => x.id === id);
        Object.assign(d, resolved ? { status: 'erledigt', resolved_at: now(), resolved_by_name: me()?.name || '' } : { status: 'offen', resolved_at: null, resolved_by_name: '' });
        save();
      },
      async photoUrl(path) { return path || null; },

      async listWorkdays(f) { return db.workdays.filter(w => f.towerIds.includes(w.tower_id) && w.work_date === f.date).sort((a, b) => a.start_time.localeCompare(b.start_time)); },
      async addWorkday(w) { const r = { id: uid(), created_at: now(), created_by_name: me()?.name || '', ...w }; db.workdays.push(r); save(); return r; },
      async deleteWorkday(id) { db.workdays = db.workdays.filter(w => w.id !== id); save(); },
      async listRegie(f) { return db.regie.filter(w => f.towerIds.includes(w.tower_id) && w.work_date === f.date).sort((a, b) => a.start_time.localeCompare(b.start_time)); },
      async addRegie(r, photoBlob) {
        let photo_path = null;
        if (photoBlob) photo_path = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(photoBlob); });
        const x = { id: uid(), created_at: now(), created_by_name: me()?.name || '', ...r, photo_path }; db.regie.push(x); save(); return x;
      },
      async deleteRegie(id) { db.regie = db.regie.filter(w => w.id !== id); save(); },
      subscribe() { return () => {}; }
    };
  }

  window.store = useSupabase ? supabaseStore() : localStore();
})();
