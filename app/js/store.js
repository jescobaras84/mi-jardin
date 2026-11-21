/* Mi Jardín — almacenamiento local en IndexedDB.
   MJStore.load()/save(state): estado completo.
   MJStore.putBlob(id, blob)/getBlob(id)/delBlob(id)/blobKeys(): fotos completas pendientes de subir. */
(function(){
  "use strict";
  var DB="mi-jardin", VER=2, STORE="kv", BLOBS="blobs", KEY="state";
  var dbp=null;
  function open(){
    if(dbp)return dbp;
    dbp=new Promise(function(res,rej){
      if(!("indexedDB" in window)){rej(new Error("Este navegador no tiene IndexedDB"));return;}
      var r=indexedDB.open(DB,VER);
      r.onupgradeneeded=function(){var db=r.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);
        if(!db.objectStoreNames.contains(BLOBS))db.createObjectStore(BLOBS);};
      r.onsuccess=function(){res(r.result);};
      r.onerror=function(){rej(r.error||new Error("No se pudo abrir la base local"));};
      r.onblocked=function(){rej(new Error("La base local está bloqueada por otra pestaña"));};
    });
    dbp.catch(function(){dbp=null;});
    return dbp;
  }
  function tx(store,mode,fn){
    return open().then(function(db){return new Promise(function(res,rej){
      var t=db.transaction(store,mode),s=t.objectStore(store),out;
      var q=fn(s); if(q)q.onsuccess=function(){out=q.result;};
      t.oncomplete=function(){res(out);};
      t.onerror=function(){rej(t.error||new Error("Error al guardar"));};
      t.onabort=function(){rej(t.error||new Error("Guardado cancelado (¿sin espacio?)"));};
    });});
  }
  function load(){return tx(STORE,"readonly",function(s){return s.get(KEY);}).then(function(v){return v||null;});}
  function save(state){
    var copy=JSON.parse(JSON.stringify(state));
    return tx(STORE,"readwrite",function(s){return s.put(copy,KEY);}).then(function(){
      if(navigator.storage&&navigator.storage.persist){try{navigator.storage.persist();}catch(e){}}
    });
  }
  function putBlob(id,blob){return tx(BLOBS,"readwrite",function(s){return s.put(blob,id);});}
  function getBlob(id){return tx(BLOBS,"readonly",function(s){return s.get(id);});}
  function delBlob(id){return tx(BLOBS,"readwrite",function(s){return s.delete(id);});}
  function blobKeys(){return tx(BLOBS,"readonly",function(s){return s.getAllKeys();}).then(function(k){return k||[];});}
  window.MJStore={load:load,save:save,putBlob:putBlob,getBlob:getBlob,delBlob:delBlob,blobKeys:blobKeys};
})();
