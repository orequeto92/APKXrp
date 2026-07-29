/**
 * Parametros de estrategia — sincronizados con el bot.
 *
 * La fuente unica de verdad es `params.json` en el repo de GitHub: lo leen el bot
 * local, GitHub Actions y esta app. Aqui se maneja el ciclo completo:
 *
 *   remoto (GitHub)  ->  local (Preferences)  ->  motor
 *                    <-  "Sincronizar" sube los cambios
 *
 * Los cambios locales son inmediatos (pruebas al instante, incluso sin internet);
 * solo afectan al bot cuando pulsas Sincronizar. Asi un toque accidental nunca
 * altera lo que hace el bot a tus espaldas.
 */
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export const REPO_OWNER = "orequeto92";
export const REPO_NAME = "xrp-signal-bot";
export const PARAMS_PATH = "params.json";
export const RAW_URL =
  `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${PARAMS_PATH}`;

export interface Params {
  SYMBOL: string;
  TRADE_PAIR: string;
  DIRECTOR_SYMBOL: string;
  RISK_PCT: number;
  RISK_PCT_HIGH: number;
  SCORE_RISK_ALTO: number;
  LEV_MAX: number;
  SL_MIN_PCT: number;
  SL_MAX_PCT: number;
  ATR_STOP_MULT: number;
  DAILY_BLOCK_LOW: number;
  DAILY_BLOCK_HIGH: number;
  PROACTIVE_ALERTS: boolean;
  ALERT_MIN_SCORE: number;
  CHECK_INTERVAL_MIN: number;
  ALERT_HOURS_UTC: [number, number];
}

/** Si no hay red ni nada guardado, la app sigue funcionando con esto. */
export const DEFAULTS: Params = {
  SYMBOL: "XRPUSDT",
  TRADE_PAIR: "XRPUSD",
  DIRECTOR_SYMBOL: "BTCUSDT",
  RISK_PCT: 2.0,
  RISK_PCT_HIGH: 3.0,
  SCORE_RISK_ALTO: 9,
  LEV_MAX: 10,
  SL_MIN_PCT: 1.5,
  SL_MAX_PCT: 4.0,
  ATR_STOP_MULT: 2.5,
  DAILY_BLOCK_LOW: 30,
  DAILY_BLOCK_HIGH: 70,
  PROACTIVE_ALERTS: true,
  ALERT_MIN_SCORE: 7,
  CHECK_INTERVAL_MIN: 20,
  ALERT_HOURS_UTC: [12, 5],
};

/** Etiquetas y limites para la pantalla de Ajustes. */
export const CAMPOS: Array<{
  clave: keyof Params; grupo: string; etiqueta: string;
  min?: number; max?: number; paso?: number; ayuda: string;
}> = [
  { clave: "RISK_PCT", grupo: "Riesgo", etiqueta: "Riesgo base", min: 0.5, max: 5, paso: 0.5,
    ayuda: "% del margen que arriesgas en un setup normal (A)." },
  { clave: "RISK_PCT_HIGH", grupo: "Riesgo", etiqueta: "Riesgo en A+ excepcional", min: 0.5, max: 5, paso: 0.5,
    ayuda: "Solo para score >= el umbral de abajo. Techo acordado: 3%." },
  { clave: "SCORE_RISK_ALTO", grupo: "Riesgo", etiqueta: "Score para riesgo alto", min: 6, max: 10, paso: 1,
    ayuda: "Desde este score se usa el riesgo ampliado." },
  { clave: "LEV_MAX", grupo: "Riesgo", etiqueta: "Apalancamiento maximo", min: 1, max: 20, paso: 1,
    ayuda: "Tope de leverage. El SL fija el riesgo, no el lev." },
  { clave: "SL_MIN_PCT", grupo: "Stops", etiqueta: "SL minimo %", min: 0.5, max: 4, paso: 0.1,
    ayuda: "Mas ajustado que esto y te saca el ruido." },
  { clave: "SL_MAX_PCT", grupo: "Stops", etiqueta: "SL maximo %", min: 2, max: 8, paso: 0.5,
    ayuda: "Mas ancho que esto y la posicion queda diminuta." },
  { clave: "ATR_STOP_MULT", grupo: "Stops", etiqueta: "Multiplo de ATR (4H)", min: 1, max: 5, paso: 0.5,
    ayuda: "El SL debe estar al menos a este multiplo del ATR de 4H." },
  { clave: "DAILY_BLOCK_LOW", grupo: "Contexto diario", etiqueta: "Bloquear shorts bajo %", min: 0, max: 50, paso: 5,
    ayuda: "No shortear si el 1D esta por debajo de este % del rango." },
  { clave: "DAILY_BLOCK_HIGH", grupo: "Contexto diario", etiqueta: "Bloquear longs sobre %", min: 50, max: 100, paso: 5,
    ayuda: "No comprar si el 1D esta por encima de este % del rango." },
  { clave: "ALERT_MIN_SCORE", grupo: "Alertas", etiqueta: "Score minimo para avisar", min: 5, max: 10, paso: 1,
    ayuda: "El bot solo te escribe si el setup llega a este score." },
  { clave: "CHECK_INTERVAL_MIN", grupo: "Alertas", etiqueta: "Intervalo de chequeo (min)", min: 5, max: 60, paso: 5,
    ayuda: "Cada cuanto escanea el bot local." },
];

const K_LOCAL = "params_local";
const K_TOKEN = "github_token";

async function leer(clave: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) return (await Preferences.get({ key: clave })).value;
  return localStorage.getItem(clave);
}

async function escribir(clave: string, valor: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await Preferences.set({ key: clave, value: valor });
  else localStorage.setItem(clave, valor);
}

/** Aplana params.json (viene por secciones) a un objeto plano. */
function aplanar(raw: any): Partial<Params> {
  const out: any = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (k.startsWith("_")) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, v);
    else out[k] = v;
  }
  return out;
}

/** Reconstruye la estructura por secciones que espera el bot. */
export function aSecciones(p: Params): any {
  return {
    _comment:
      "Fuente unica de verdad de los parametros de estrategia. La leen el bot " +
      "(local y GitHub Actions) y la app movil. NO poner aqui secretos (token, " +
      "chat id) ni el saldo: este repo es publico.",
    _version: 1,
    mercado: { SYMBOL: p.SYMBOL, TRADE_PAIR: p.TRADE_PAIR, DIRECTOR_SYMBOL: p.DIRECTOR_SYMBOL },
    riesgo: { RISK_PCT: p.RISK_PCT, RISK_PCT_HIGH: p.RISK_PCT_HIGH,
              SCORE_RISK_ALTO: p.SCORE_RISK_ALTO, LEV_MAX: p.LEV_MAX },
    stops: { SL_MIN_PCT: p.SL_MIN_PCT, SL_MAX_PCT: p.SL_MAX_PCT, ATR_STOP_MULT: p.ATR_STOP_MULT },
    contexto_diario: { DAILY_BLOCK_LOW: p.DAILY_BLOCK_LOW, DAILY_BLOCK_HIGH: p.DAILY_BLOCK_HIGH },
    alertas: { PROACTIVE_ALERTS: p.PROACTIVE_ALERTS, ALERT_MIN_SCORE: p.ALERT_MIN_SCORE,
               CHECK_INTERVAL_MIN: p.CHECK_INTERVAL_MIN, ALERT_HOURS_UTC: p.ALERT_HOURS_UTC },
  };
}

let cache: Params | null = null;

/** Parametros vigentes en la app: guardados en local, o defaults. */
export async function actuales(): Promise<Params> {
  if (cache) return cache;
  const txt = await leer(K_LOCAL);
  const p: Params = txt ? { ...DEFAULTS, ...JSON.parse(txt) } : { ...DEFAULTS };
  cache = p;
  return p;
}

export async function guardarLocal(p: Params): Promise<void> {
  cache = p;
  await escribir(K_LOCAL, JSON.stringify(p));
}

/** Descarga los parametros que el bot esta usando ahora mismo. */
export async function traerDelBot(): Promise<Params> {
  const r = await fetch(`${RAW_URL}?t=${Date.now()}`);   // sin cache
  if (!r.ok) throw new Error(`GitHub respondio ${r.status}`);
  return { ...DEFAULTS, ...aplanar(await r.json()) };
}

/** true si lo que usa la app difiere de lo que usa el bot. */
export function difieren(a: Params, b: Params): (keyof Params)[] {
  return (Object.keys(DEFAULTS) as (keyof Params)[]).filter(
    (k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

export async function getToken(): Promise<string> { return (await leer(K_TOKEN)) || ""; }
export async function setToken(t: string): Promise<void> { await escribir(K_TOKEN, t.trim()); }

/**
 * Sube los parametros al repo. Requiere un token fine-grained con permiso
 * `contents: write` SOLO sobre este repositorio. El bot los tomara en su
 * siguiente ejecucion.
 */
export async function sincronizarConBot(p: Params): Promise<string> {
  const token = await getToken();
  if (!token) throw new Error("Falta el token de GitHub (configuralo en Ajustes).");
  const api = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${PARAMS_PATH}`;
  const cab = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };

  const actual = await fetch(`${api}?ref=main`, { headers: cab });
  if (!actual.ok) throw new Error(`No pude leer params.json (${actual.status}). ¿Token valido?`);
  const sha = (await actual.json()).sha;

  const cuerpo = JSON.stringify(aSecciones(p), null, 2) + "\n";
  const put = await fetch(api, {
    method: "PUT",
    headers: { ...cab, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Update strategy parameters from the mobile app",
      content: btoa(unescape(encodeURIComponent(cuerpo))),
      sha, branch: "main",
    }),
  });
  if (!put.ok) throw new Error(`Fallo al subir (${put.status}): ${(await put.text()).slice(0, 120)}`);
  return "Parametros sincronizados. El bot los usara en su proxima corrida.";
}
