/* Mi Jardín — almacenamiento local en IndexedDB.
   API: MJStore.load() -> Promise<state|null>, MJStore.save(state) -> Promise<void>. */
(function(){
  "use strict";
  var DB="mi-jardin", VER=1, STORE="kv", KEY="state";
  var dbp=null;
  function open(){
    if(dbp)return dbp;
    dbp=new Promise(function(res,rej){
      if(!("indexedDB" in window)){rej(new Error("Este navegador no tiene IndexedDB"));return;}
      var r=indexedDB.open(DB,VER);
      r.onupgradeneeded=function(){var db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);};
      r.onsuccess=function(){res(r.result);};
      r.onerror=function(){rej(r.error||new Error("No se pudo abrir la base local"));};
      r.onblocked=function(){rej(new Error("La base local está bloqueada por otra pestaña"));};
    });
    dbp.catch(function(){dbp=null;});
    return dbp;
  }
  function tx(mode,fn){
    return open().then(function(db){return new Promise(function(res,rej){
      var t=db.transaction(STORE,mode),s=t.objectStore(STORE),out;
      var q=fn(s); if(q)q.onsuccess=function(){out=q.result;};
      t.oncomplete=function(){res(out);};
      t.onerror=function(){rej(t.error||new Error("Error al guardar"));};
      t.onabort=function(){rej(t.error||new Error("Guardado cancelado (¿sin espacio?)"));};
    });});
  }
  function load(){return tx("readonly",function(s){return s.get(KEY);}).then(function(v){return v||null;});}
  function save(state){
    var copy=JSON.parse(JSON.stringify(state));
    return tx("readwrite",function(s){return s.put(copy,KEY);}).then(function(){
      if(navigator.storage&&navigator.storage.persist){try{navigator.storage.persist();}catch(e){}}
    });
  }
  window.MJStore={load:load,save:save};
})();
