/**
 * Compara impulso.ts contra impulso.py usando el fixture congelado.
 * USO:  tsx tools/paridad/comparar_impulso.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { señal } from "../../src/engine/impulso.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(AQUI, "fixture_impulso.json"), "utf-8"));

let fallos = 0;
for (const [iso, caso] of Object.entries<any>(fx.casos)) {
  const ts = señal(caso.velas_sym, caso.velas_dir);
  const py = caso["señal"];

  const iguales = (!py && !ts) || (!!py && !!ts
    && py.lado === ts.lado
    && Math.abs(py.entrada - ts.entrada) < 1e-6
    && Math.abs(py.sl - ts.sl) < 1e-6
    && Math.abs(py.tp - ts.tp) < 1e-6);

  console.log(iso);
  console.log("  py:", JSON.stringify(py));
  console.log("  ts:", JSON.stringify(ts), iguales ? "ok" : "<-- DIFIERE");
  if (!iguales) fallos++;
}

console.log("-".repeat(64));
if (fallos === 0) {
  console.log("PARIDAD TOTAL: impulso.ts decide exactamente igual que impulso.py.");
} else {
  console.log(`${fallos} diferencia(s).`);
  process.exit(1);
}
