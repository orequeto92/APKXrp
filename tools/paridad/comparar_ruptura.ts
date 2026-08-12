/**
 * Compara el detector de RUPTURA en TypeScript contra Python usando el mismo
 * historico real (fixture_ruptura.json), incluyendo los DOS episodios conocidos
 * (nov-2024, feb-2026). Cualquier diferencia aqui es logica, no datos de mercado.
 *
 * USO:  tsx tools/paridad/comparar_ruptura.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectar, setup } from "../../src/engine/ruptura.js";
import type { Candle } from "../../src/engine/ta.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(AQUI, "fixture_ruptura.json"), "utf-8"));

const candles1d: Candle[] = fx.candles_1d;
let fallos = 0;

// detectar() es walk-forward por construccion (el indice i solo usa datos hasta
// i), asi que basta UNA pasada sobre todo el historico -- llamar estadoRegimen()
// por dia en un loop (recalculando todo lo previo cada vez) seria O(n^3) sobre
// ~1170 dias, el mismo error de rendimiento que ya se encontro y corrigio del
// lado de Python (ver Trading-B/tools/ruptura.py, estado_regimen_serie).
console.log("Comparando series completas (una sola pasada)...");
const r = detectar(candles1d);
let difsActivo = 0, difsLado = 0;
const ladoMap: Record<string, string> = { ALCISTA: "long", BAJISTA: "short" };
for (let i = 0; i < candles1d.length; i++) {
  if (r.activo[i] !== fx.activo[i]) difsActivo++;
  const ladoPy = fx.lado[i] ? ladoMap[fx.lado[i]] ?? null : null;
  const ladoTsRaw = r.lado[i];
  const ladoTs = ladoTsRaw ? ladoMap[ladoTsRaw] ?? null : null;
  if (ladoTs !== ladoPy) difsLado++;
}
console.log(`activo: ${difsActivo} diferencia(s) en ${candles1d.length} dias evaluados`);
console.log(`lado:   ${difsLado} diferencia(s)`);
fallos += difsActivo + difsLado;

// 2) el setup() (entrada/SL) en los dias de entrada conocidos, con las MISMAS
//    velas de 4H que vio Python (fixture_ruptura.json las guarda por separado).
console.log("\nSetup en los dias de entrada conocidos:");
for (const [dia, s] of Object.entries<any>(fx.setups)) {
  const m4: any = {
    price: s.m4_price, atr: s.m4_atr, supports: s.m4_supports, resistances: s.m4_resistances,
  };
  const estadoPy = s.estado;
  const estadoTs = { activo: estadoPy.activo, activoAyer: estadoPy.activo_ayer,
                      trend: estadoPy.trend, atr1dPct: estadoPy.atr1d_pct,
                      lado: estadoPy.lado };
  const entradaTs = setup(estadoTs as any, m4);
  const entradaPy = s.entrada;

  const iguales = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(a) * 1e-9);
  const ok = !!entradaPy === !!entradaTs
    && (!entradaPy || (
      entradaPy.lado === entradaTs?.lado
      && iguales(entradaPy.entrada, entradaTs!.entrada)
      && iguales(entradaPy.sl, entradaTs!.sl)
    ));
  if (!ok) fallos++;
  console.log(`  ${dia}  py=${JSON.stringify(entradaPy)}`);
  console.log(`  ${dia}  ts=${JSON.stringify(entradaTs)}  ${ok ? "ok" : "<-- DIFIERE"}`);
}

console.log("\n" + "-".repeat(64));
if (fallos === 0) {
  console.log("PARIDAD TOTAL: ruptura.ts decide exactamente igual que ruptura.py.");
} else {
  console.log(`${fallos} diferencia(s). Revisa la logica antes de operar con la app.`);
  process.exit(1);
}
