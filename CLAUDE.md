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

## Estado (21 nov 2026)
- Hecho: Sprint 0 completo (PWA en https://jescobaras84.github.io/mi-jardin/, IndexedDB, importar/exportar).
- Hecho: cuenta por correo con código (Supabase Auth + Gmail SMTP), sincronización por registro (supabase/migrations/001), invitar familia.
- Hecho: IA Gemini gratis vía Supabase Edge Function supabase/functions/ia (desplegada en Supabase con el nombre "bright-handler", ver app/js/config.js IA_FUNCTION; secreto GEMINI_API_KEY; opcional GEMINI_MODELS lista separada por comas; por defecto gemini-flash-latest → gemini-flash-lite-latest → gemini-2.5-flash). La app la usa solo con sesión iniciada.
- Cambio de arquitectura: ya no se usa Cloudflare Worker; IA y (luego) avisos van en Supabase. Ver CAMBIOS.md.
- Hecho: recetario con respaldo (app/js/recetas.js) · lugares (registros log kind "lugar": nombre, zona, lat/lon, aire libre) con clima Open-Meteo y geolocalización/BigDataCloud · responsable por planta (plant.resp) · «hecho por» (log.by) · botón «Llovió» · interior/exterior por planta (plant.exp) · resumen por lugar · cosechas (log kind "cosecha") · temporada de floración/cosecha en la ficha · recordatorios sugeridos para árboles.
- Siguiente: botón «tierra húmeda, posponer» · avisos por persona · probar IA con fotos reales (MJ-13) · fotos a Supabase Storage (MJ-18) · avisos diarios 7:00 a. m. con Web Push desde Supabase (MJ-20/21).
