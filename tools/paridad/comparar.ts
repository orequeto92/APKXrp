/**
 * Compara el motor TypeScript contra el Python usando EXACTAMENTE las mismas
 * velas (el fixture que genera capturar.py). Cualquier diferencia que aparezca
 * aqui es una diferencia de logica, no del mercado moviendose.
 *
 * USO:  npm run paridad
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluar, type Fuente } from "../../src/engine/signal.js";
import { DEFAULTS } from "../../src/config/params.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(AQUI, "fixture.json"), "utf-8"));

/** Capa de datos congelada: devuelve siempre lo que vio el motor Python. */
const fuente: Fuente = {
  velas: async (symbol: string, gran: string) => fixture.velas[symbol][gran],
  ticker: async (symbol: string) => {
    const t = fixture.tickers[symbol] || {};
    return {
      lastPr: t.lastPrice == null ? undefined : String(t.lastPrice),
      change24h: t.change24h == null ? undefined : String(t.change24h),
      holdingAmount: t.oi_base == null ? undefined : String(t.oi_base),
    };
  },
  funding: async (symbol: string) => fixture.tickers[symbol]?.fundingRate ?? null,
  contratos: async () => {
    const c = fixture.contrato;
    if (!c) return {};
    // el fixture guarda las specs de Python (min/tick); las traducimos al tipo de la app
    return { [DEFAULTS.SYMBOL]: { min_num: c.min, step: c.tick, min_usdt: 0, lev_max: 125 } };
  },
};

const s: any = await evaluar(fixture.saldo, DEFAULTS, fuente);

const obtenido: Record<string, unknown> = {
  decision: s.decision, score: s.score ?? null, grade: s.grade ?? null,
  side: s.side ?? null, reason: s.reason, price: s.price,
  zona15: s.zona15, zona4: s.zona4, zona1d: s.zona1d, pos1d: s.pos1d,
  gauge: s.gauge, director: s.director,
  sl: s.sl ?? null, tp1: s.tp1 ?? null, tp2: s.tp2 ?? null,
};
if (s.sizing) {
  obtenido.qty = s.sizing.qty;
  obtenido.risk_pct = s.sizing.risk_pct;
  obtenido.dist_pct = s.sizing.dist_pct;
}

const esperado = fixture.esperado as Record<string, unknown>;
const TOL = 1e-6;   // los flotantes de Python y JS pueden diferir en el ultimo bit

let fallos = 0;
console.log("campo".padEnd(11), "python".padEnd(24), "typescript");
console.log("-".repeat(64));
for (const clave of Object.keys(esperado)) {
  const a = esperado[clave], b = obtenido[clave];
  const iguales = typeof a === "number" && typeof b === "number"
    ? Math.abs(a - b) <= Math.max(TOL, Math.abs(a) * 1e-9)
    : JSON.stringify(a) === JSON.stringify(b);
  if (!iguales) fallos++;
  console.log(
    String(clave).padEnd(11),
    String(a).slice(0, 23).padEnd(24),
    String(b).slice(0, 23) + (iguales ? "  ok" : "  <-- DIFIERE"),
  );
}
console.log("-".repeat(64));
if (fallos === 0) {
  console.log("PARIDAD TOTAL: la app decide exactamente igual que el bot.");
} else {
  console.log(`${fallos} campo(s) difieren. Revisa la logica antes de operar con la app.`);
  process.exit(1);
}
