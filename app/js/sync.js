/* Mi Jardín — cuenta por correo (código de 6 dígitos) y sincronización con Supabase.
   Cada planta y cada registro se sincroniza por separado; gana la última edición.
   API: MJSync.init(getState, setState, onChange), MJSync.changed(), MJSync.info(),
        MJSync.sendCode(email), MJSync.verify(email, code), MJSync.logout(),
        MJSync.members(), MJSync.invite(email) */
(function(){
  "use strict";
  var cfg = window.MJ_CONFIG || {}, sb = null, getS, setS, onChg;
  var st = { status: "off", email: null, gid: null, err: null };
  var meta = { gid: null, lastPull: null, synced: {} }; // synced: "p:id"/"e:id" -> firma del último envío
  var pushTimer = null, busy = false, again = false, chan = null;

  function enabled(){ return !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY && window.supabase); }
  function set(k, v){ st[k] = v; if (onChg) onChg(); }
  function sig(o){ return JSON.stringify(o); }
  function metaKey(){ return "mj.sync." + (st.email || ""); }
  function loadMeta(){ try { var m = JSON.parse(localStorage.getItem(metaKey()) || "null"); if (m && m.synced) meta = m; } catch (e) {} }
  function saveMeta(){ try { localStorage.setItem(metaKey(), JSON.stringify(meta)); } catch (e) {} }

  function init(g, s, cb){
    getS = g; setS = s; onChg = cb;
    if (!enabled()) { set("status", "off"); return; }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "mj-auth" }
    });
    window.__mjSb = sb;
    sb.auth.getSession().then(function(r){
      var ses = r && r.data && r.data.session;
      if (ses) start(ses.user.email); else set("status", "out");
    });
    window.addEventListener("online", function(){ if (st.gid) run(); });
    document.addEventListener("visibilitychange", function(){ if (!document.hidden && st.gid) run(); });
  }

  function start(email){
    st.email = email; loadMeta(); set("status", "syncing");
    sb.rpc("mi_jardin").then(function(r){
      if (r.error) throw r.error;
      if (meta.gid && meta.gid !== r.data) meta = { gid: null, lastPull: null, synced: {} };
      meta.gid = r.data; st.gid = r.data; saveMeta();
      listen(); run();
    }).catch(fail);
  }

  function fail(e){ st.err = (e && (e.message || e.error_description)) || "Error de conexión"; set("status", navigator.onLine ? "error" : "offline"); }

  function listen(){
    if (chan) sb.removeChannel(chan);
    var t = null, kick = function(){ clearTimeout(t); t = setTimeout(run, 400); };
    chan = sb.channel("jardin-" + st.gid)
      .on("postgres_changes", { event: "*", schema: "public", table: "plants", filter: "garden_id=eq." + st.gid }, kick)
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: "garden_id=eq." + st.gid }, kick)
      .subscribe();
  }

  function changed(){ if (!st.gid) return; clearTimeout(pushTimer); pushTimer = setTimeout(run, 800); }

  // Un ciclo: enviar lo cambiado aquí, luego traer lo cambiado allá.
  function run(){
    if (!st.gid || !sb) return;
    if (busy) { again = true; return; }
    busy = true; set("status", "syncing");
    push().then(pull).then(uploadPhotos).then(function(){
      st.err = null; set("status", "ok");
    }).catch(fail).then(function(){ busy = false; if (again) { again = false; run(); } });
  }

  function push(){
    var S = getS(), gid = st.gid, P = [], E = [], seen = {}, now = {};
    S.plants.forEach(function(p){ var k = "p:" + p.id, s = sig(p); seen[k] = 1; if (meta.synced[k] !== s) { P.push({ id: p.id, garden_id: gid, data: p, deleted: false }); now[k] = s; } });
    S.log.forEach(function(l){ var k = "e:" + l.id, s = sig(l); seen[k] = 1; if (meta.synced[k] !== s) { E.push({ id: l.id, garden_id: gid, plant_id: l.plantId || null, data: l, deleted: false }); now[k] = s; } });
    Object.keys(meta.synced).forEach(function(k){
      if (seen[k] || meta.synced[k] === "__del") return;
      var id = k.slice(2), row = { id: id, garden_id: gid, data: {}, deleted: true };
      (k.charAt(0) === "p" ? P : E).push(row); now[k] = "__del";
    });
    if (!P.length && !E.length) return Promise.resolve();
    var ops = [];
    for (var i = 0; i < P.length; i += 50) ops.push(P.slice(i, i + 50));
    var opsE = [];
    for (var j = 0; j < E.length; j += 50) opsE.push(E.slice(j, j + 50));
    var chain = Promise.resolve();
    ops.forEach(function(b){ chain = chain.then(function(){ return sb.from("plants").upsert(b).then(chk); }); });
    opsE.forEach(function(b){ chain = chain.then(function(){ return sb.from("events").upsert(b).then(chk); }); });
    return chain.then(function(){ Object.keys(now).forEach(function(k){ meta.synced[k] = now[k]; }); saveMeta(); });
  }
  function chk(r){ if (r.error) throw r.error; return r; }

  function fetchAll(table, since){
    var out = [], from = 0, size = 500;
    function page(){
      var q = sb.from(table).select("id,data,deleted,updated_at").eq("garden_id", st.gid).order("updated_at").range(from, from + size - 1);
      if (since) q = q.gt("updated_at", since);
      return q.then(chk).then(function(r){ out = out.concat(r.data || []); if ((r.data || []).length === size) { from += size; return page(); } return out; });
    }
    return page();
  }

  function pull(){
    var since = meta.lastPull;
    return Promise.all([fetchAll("plants", since), fetchAll("events", since)]).then(function(res){
      var rp = res[0], re = res[1]; if (!rp.length && !re.length) return;
      var S = getS(), maxT = since;
      function merge(list, rows, pre){
        var idx = {}; list.forEach(function(x, i){ idx[x.id] = i; });
        var dropped = {};
        rows.forEach(function(r){
          if (!maxT || r.updated_at > maxT) maxT = r.updated_at;
          var k = pre + r.id;
          if (r.deleted) { if (idx[r.id] != null) dropped[r.id] = 1; meta.synced[k] = "__del"; return; }
          if (idx[r.id] != null) list[idx[r.id]] = r.data; else { list.push(r.data); idx[r.id] = list.length - 1; }
          meta.synced[k] = sig(r.data);
        });
        return list.filter(function(x){ return !dropped[x.id]; });
      }
      S.plants = merge(S.plants, rp, "p:");
      S.log = merge(S.log, re, "e:");
      meta.lastPull = maxT; saveMeta();
      setS(S);
    });
  }

  // Fotos completas guardadas en el teléfono → Storage privado (carpeta = id del jardín)
  var pendingN = 0, urlCache = {};
  function uploadPhotos(){
    if (!window.MJStore || !MJStore.blobKeys) return Promise.resolve();
    return MJStore.blobKeys().then(function(keys){
      pendingN = keys.length;
      var chain = Promise.resolve();
      keys.forEach(function(id){
        chain = chain.then(function(){ return MJStore.getBlob(id); }).then(function(b){
          if (!b) return;
          return sb.storage.from("fotos").upload(st.gid + "/" + id + ".jpg", b, { upsert: true, contentType: "image/jpeg" })
            .then(function(r){ if (r.error) throw r.error; return MJStore.delBlob(id); })
            .then(function(){ pendingN = Math.max(0, pendingN - 1); });
        });
      });
      return chain;
    });
  }
  function photoUrl(id){
    if (!st.gid || !sb) return Promise.resolve(null);
    if (urlCache[id]) return Promise.resolve(urlCache[id]);
    return sb.storage.from("fotos").createSignedUrl(st.gid + "/" + id + ".jpg", 60 * 60 * 24 * 6).then(function(r){
      if (r.error || !r.data) return null; urlCache[id] = r.data.signedUrl; return urlCache[id];
    }).catch(function(){ return null; });
  }

  function sendCode(email){
    return sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } }).then(chk);
  }
  function verify(email, code){
    return sb.auth.verifyOtp({ email: email, token: String(code).trim(), type: "email" }).then(chk).then(function(r){ start(r.data.user.email); });
  }
  function logout(){
    if (chan) { sb.removeChannel(chan); chan = null; }
    return sb.auth.signOut().then(function(){ st.gid = null; st.email = null; meta = { gid: null, lastPull: null, synced: {} }; set("status", "out"); });
  }
  function members(){
    if (!st.gid) return Promise.resolve({ m: [], i: [] });
    return Promise.all([
      sb.from("garden_members").select("email,role").eq("garden_id", st.gid).then(chk),
      sb.from("garden_invites").select("email").eq("garden_id", st.gid).then(chk)
    ]).then(function(r){ return { m: r[0].data || [], i: r[1].data || [] }; });
  }
  function invite(email){
    return sb.auth.getUser().then(function(u){
      return sb.from("garden_invites").upsert({ garden_id: st.gid, email: String(email).trim().toLowerCase(), invited_by: u.data.user.id }).then(chk);
    });
  }
  window.MJSync = { photoUrl: photoUrl, pendingPhotos: function(){ return pendingN; }, init: init, changed: changed, run: run, info: function(){ return st; }, enabled: enabled,
    sendCode: sendCode, verify: verify, logout: logout, members: members, invite: invite };
})();
/* IA: llama a la función "ia" de Supabase (Gemini gratis). Devuelve el JSON de la respuesta. */
(function(){
  var REGLA_REMEDIOS = "\n\nREGLA DE REMEDIOS: si recomiendas tratamientos caseros, usa SOLO estos, que tienen respaldo de servicios de extensión agrícola: chorro de agua en el envés, jabón insecticida o potásico de vivero (no jabón de platos), aceite de neem comercial según etiqueta, bicarbonato con aceite (solo oídio al inicio), poda sanitaria con tijera desinfectada, trampas amarillas y dejar secar la tierra. NUNCA recomiendes vinagre, jabón de lavar platos, borra de café directa, sal, ajo, agua oxigenada ni té de compost. Indica siempre probar en pocas hojas 24 h y no aplicar con sol fuerte.";
  function b64(blob){ return new Promise(function(res, rej){ var r = new FileReader(); r.onload = function(){ res(String(r.result).split(",")[1] || ""); }; r.onerror = rej; r.readAsDataURL(blob); }); }
  function ai(prompt, blobs){
    var sbc = window.__mjSb; if (!sbc) return Promise.reject({ code: "not_granted", message: "Entra con tu correo para usar la IA" });
    return Promise.all((blobs || []).map(b64)).then(function(imgs){
      return sbc.functions.invoke("ia", { body: { prompt: prompt + REGLA_REMEDIOS, images: imgs } });
    }).then(function(r){
      if (r.error) {
        var ctx = r.error.context, st = ctx && ctx.status;
        var base = { code: st === 429 ? "rate_limited" : st === 401 ? "not_granted" : "unavailable", message: (st ? "Error " + st + ": " : "") + r.error.message };
        if (ctx && ctx.json) return ctx.json().then(function(b){ base.message = (st ? "Error " + st + ": " : "") + ((b && (b.message + (b.detail ? " — " + b.detail : ""))) || r.error.message); throw base; }, function(){ throw base; });
        throw base;
      }
      if (!r.data || r.data.json == null) throw { code: (r.data && r.data.code) || "unavailable", message: (r.data && r.data.message) || "Sin respuesta" };
      return r.data.json;
    });
  }
  function makeSample(){
    var f = function(prompt, opts){ return f.json(prompt, opts).then(function(j){ return { text: JSON.stringify(j) }; }); };
    f.limits = function(){ return Promise.resolve({ images: true }); };
    f.json = function(prompt, opts){ return ai(prompt, (opts && opts.images) || []); };
    return f;
  }
  if (window.MJSync) { window.MJSync.ai = ai; window.MJSync.makeSample = makeSample; }
})();
