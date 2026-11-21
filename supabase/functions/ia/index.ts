// Mi Jardín — función "ia": puente seguro entre la app y Google Gemini (nivel gratis).
// La clave de Gemini vive solo aquí, como secreto GEMINI_API_KEY. Solo usuarios con sesión pueden llamarla.
// Pegar completo en Supabase → Edge Functions → Deploy a new function → Via Editor → nombre "ia".
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ code: "bad_request", message: "Solo POST" }, 405);

  // 1) ¿Quién llama? Debe tener sesión en Mi Jardín.
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, anon);
  const { data: u } = token ? await supa.auth.getUser(token) : { data: null };
  if (!u?.user) return json({ code: "not_granted", message: "Entra con tu correo para usar la IA" }, 401);

  // 2) Validar lo que llega.
  let body: { prompt?: string; images?: string[] };
  try { body = await req.json(); } catch { return json({ code: "bad_request", message: "JSON inválido" }, 400); }
  const prompt = String(body.prompt ?? "");
  const images = Array.isArray(body.images) ? body.images.slice(0, 5) : [];
  if (!prompt || prompt.length > 12000) return json({ code: "bad_request", message: "Pregunta vacía o muy larga" }, 400);
  if (images.some((b) => typeof b !== "string" || b.length > 2_000_000)) return json({ code: "bad_request", message: "Foto muy grande" }, 400);

  // 3) Preguntar a Gemini.
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ code: "unavailable", message: "Falta el secreto GEMINI_API_KEY" }, 500);
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
  const parts = [
    ...images.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } })),
    { text: prompt + "\n\nResponde únicamente con el JSON pedido, sin texto antes ni después." },
  ];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json" } }),
  });
  if (r.status === 429) return json({ code: "rate_limited", message: "Se agotó la cuota gratis por ahora. Intenta en un rato." }, 429);
  if (!r.ok) return json({ code: "unavailable", message: `Gemini respondió ${r.status}`, detail: (await r.text()).slice(0, 300) }, 502);

  const out = await r.json();
  const text = (out?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return json({ json: JSON.parse(clean), model });
  } catch {
    return json({ code: "bad_response", message: "La IA no devolvió un JSON válido", text: text.slice(0, 500) }, 502);
  }
});
