// Datenzugriff. Mit Supabase-Zugangsdaten in config.js läuft die App gemeinsam fürs Team,
// ohne läuft sie im Demo-Modus (Daten nur auf diesem Gerät).

(function () {
  const cfg = window.APP_CONFIG || {};
  const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

  // ---------------- Supabase ----------------
  function supabaseStore() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const nameOf = u => (u && (u.user_metadata?.name || u.email?.split('@')[0])) || '';
    let user = null;
    const ok = r => { if (r.error) throw r.error; return r.data; };

    return {
      mode: 'team',
      async init(onChange) {
        const { data } = await sb.auth.getSession();
        user = data.session?.user || null;
        sb.auth.onAuthStateChange((_e, s) => { user = s?.user || null; onChange(); });
      },
      user: () => user && { id: user.id, email: user.email, name: user.user_metadata?.name || '' },
      async signIn(email, password) {
        if (password) ok(await sb.auth.signInWithPassword({ email, password }));
        else ok(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.href.split('#')[0] } }));
      },
      async setName(name) { ok(await sb.auth.updateUser({ data: { name } })); user = (await sb.auth.getUser()).data.user; },
      async signOut() { await sb.auth.signOut(); },

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
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('Speicher voll', e); } };
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
    const now = () => new Date().toISOString();
    const tname = id => { const t = db.towers.find(x => x.id === id); return t ? { park: t.park, name: t.name } : null; };

    return {
      mode: 'demo',
      async init() {},
      user: () => db.user,
      async signIn(email) { db.user = { id: 'demo', email, name: '' }; save(); },
      async setName(name) { db.user.name = name; save(); },
      async signOut() { db.user = null; save(); },

      async listTowers() { return [...db.towers].sort((a, b) => b.created_at.localeCompare(a.created_at)); },
      async getTower(id) { return db.towers.find(t => t.id === id) || null; },
      async createTower(t) { const r = { id: uid(), status: 'offen', notes: '', created_at: now(), created_by_name: db.user?.name || '', ...t }; db.towers.push(r); save(); return r; },
      async updateTower(id, patch) { const t = db.towers.find(x => x.id === id); Object.assign(t, patch); save(); return t; },
      async deleteTower(id) { db.towers = db.towers.filter(t => t.id !== id); ['checks', 'signoffs', 'defects', 'workdays', 'regie'].forEach(k => db[k] = db[k].filter(x => x.tower_id !== id)); save(); },

      async getChecks(towerId) { return db.checks.filter(c => c.tower_id === towerId); },
      async allChecks() { return db.checks; },
      async setCheck(towerId, phase, itemId, done, value = '') {
        db.checks = db.checks.filter(c => !(c.tower_id === towerId && c.phase === phase && c.item_id === itemId));
        if (done) db.checks.push({ tower_id: towerId, phase, item_id: itemId, done: true, value, done_by_name: db.user?.name || '', done_at: now() });
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
        const r = { id: uid(), status: 'offen', created_at: now(), created_by_name: db.user?.name || '', ...d, photo_path };
        db.defects.push(r); save(); return r;
      },
      async resolveDefect(id, resolved) {
        const d = db.defects.find(x => x.id === id);
        Object.assign(d, resolved ? { status: 'erledigt', resolved_at: now(), resolved_by_name: db.user?.name || '' } : { status: 'offen', resolved_at: null, resolved_by_name: '' });
        save();
      },
      async photoUrl(path) { return path || null; },

      async listWorkdays(f) { return db.workdays.filter(w => f.towerIds.includes(w.tower_id) && w.work_date === f.date).sort((a, b) => a.start_time.localeCompare(b.start_time)); },
      async addWorkday(w) { const r = { id: uid(), created_at: now(), created_by_name: db.user?.name || '', ...w }; db.workdays.push(r); save(); return r; },
      async deleteWorkday(id) { db.workdays = db.workdays.filter(w => w.id !== id); save(); },
      async listRegie(f) { return db.regie.filter(w => f.towerIds.includes(w.tower_id) && w.work_date === f.date).sort((a, b) => a.start_time.localeCompare(b.start_time)); },
      async addRegie(r, photoBlob) {
        let photo_path = null;
        if (photoBlob) photo_path = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(photoBlob); });
        const x = { id: uid(), created_at: now(), created_by_name: db.user?.name || '', ...r, photo_path }; db.regie.push(x); save(); return x;
      },
      async deleteRegie(id) { db.regie = db.regie.filter(w => w.id !== id); save(); },
      subscribe() { return () => {}; }
    };
  }

  window.store = useSupabase ? supabaseStore() : localStore();
})();
