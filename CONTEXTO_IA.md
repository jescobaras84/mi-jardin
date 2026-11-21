# CONTEXTO_IA — Mi Jardín
(Renombra o copia como CLAUDE.md / AGENTS.md / instrucciones de un GPT o Gem.)

## Resumen
App para cuidar plantas (tierra e hidroponía): riego, abono, pH/EC, recordatorios, diagnóstico por foto con IA,
planes de tratamiento con prioridad, evolución con fotos, diario, hijos/esquejes. Dueño: Jonathan (no programa;
construye con Claude Code + subagentes VoltAgent). Usuarios: Jonathan y su familia.

## Objetivo del proyecto (v1, fin 23 dic 2026)
Sacar la app de Claude: PWA instalable (GitHub Pages) + IndexedDB + Supabase (familia, sync, fotos)
+ Cloudflare Worker (IA y avisos). Detalle: PRD.md, BACKLOG.md, SPRINTS.md, docs/arquitectura.md.

## Stack
- app/: HTML/CSS/JS sin framework ni build. PWA (manifest + service worker).
- Datos locales: IndexedDB (base "mi-jardin"). Nube: Supabase (Auth enlace mágico, Postgres + RLS, Storage).
- worker/: Cloudflare Worker. Endpoints IA: identify, diagnose, compare, plan, care, propagation, match.
  Proveedor principal Gemini Flash (nivel gratis); respaldo DeepSeek Flash si 429/5xx. Cron 7:00 CR (13:00 UTC) → Web Push.

## Estructura
app/ (index.html, js/, css/, icons/, manifest.webmanifest, sw.js) · worker/ · supabase/ (migraciones SQL) · docs/

## Reglas
- Siempre en español; fechas dd/mm/aaaa, zona America/Costa_Rica.
- Una historia por sesión; no tocar nada fuera de la historia pedida.
- NUNCA secretos en app/: claves de Gemini, DeepSeek, VAPID y service_role solo como secrets del Worker.
  En app/ solo URL de Supabase + anon key (protegida por RLS).
- NUNCA datos reales en el repo (respaldos *.html/*.json de Jonathan van fuera). Datos de prueba inventados en docs/ejemplo.json.
- No instalar paquetes sin preguntar. Sin alert/confirm/prompt: diálogos dentro de la página.
- Conservar: tareas calculadas a partir de eventos (no guardadas), validación del JSON de la IA, guía local de síntomas sin conexión.
- Al terminar cada historia: explicar cómo probarla en el iPhone y listar archivos cambiados; actualizar "Estado" abajo.

## Estado
- Sprint actual: Sprint 0 (20–27 nov 2026)
- Hecho (20 nov): MJ-02 estructura · MJ-03 respaldo JSON · MJ-04 IndexedDB (app/js/store.js) · MJ-05 importar/exportar en ⚙️ Ajustes · MJ-06 PWA (manifest, íconos, sw.js, fuentes locales) · arreglo iOS < 16.4 (sin lookbehind).
- Falta del Sprint 0: MJ-01 crear repo + Pages con «GitHub Actions» (Jonathan) · MJ-07 publicar y probar en iPhone.
- Siguiente sprint: MJ-08 … MJ-13 (IA con Cloudflare Worker).
- Nota: la IA está desactivada fuera de Claude (SAMPLE = null); funcionan los flujos manuales y la guía local de síntomas.
