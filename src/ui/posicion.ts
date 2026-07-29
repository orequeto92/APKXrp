/**
 * Posicion abierta: P&L en vivo, distancia al SL/TP y cierre con el P&L real.
 * Cerrar aqui aplica el interes compuesto al saldo.
 */
import { getTicker } from "../engine/bitget.js";
import { actuales } from "../config/params.js";
import { cargar, cerrar, borrar, estadisticas, type Resultado } from "../store/store.js";
import { html, esc, precio, pct, acciones, cargando } from "./comun.js";

export async function vistaPosicion(raiz: HTMLElement, refrescar: () => void) {
  raiz.innerHTML = cargando("Consultando precio…");
  const p = await actuales();
  const estado = await cargar();
  const st = estadisticas(estado);
  const op = st.abierta;

  if (!op) {
    raiz.innerHTML = html`
      <div class="card centro">
        <h2>Sin posición abierta</h2>
        <p class="mini">Cuando abras una desde el Escáner, aquí verás su P&L en vivo,
          la distancia al stop y podrás cerrarla con el resultado real.</p>
      </div>`;
    return;
  }

  let px = 0;
  try { px = Number((await getTicker(p.SYMBOL)).lastPr) || 0; } catch { /* sin red */ }

  const signo = op.lado === "short" ? 1 : -1;
  const pnlPct = px ? ((op.entrada - px) / op.entrada) * 100 * signo : 0;
  const pnlMon = px ? op.unidades * (op.entrada - px) * signo / px : 0;
  const aSL = px ? ((op.sl / px - 1) * 100) : 0;
  const aTP1 = px ? ((op.tp1 / px - 1) * 100) : 0;
  const recorrido = Math.abs(op.sl - op.entrada) > 0
    ? Math.min(100, Math.max(0, ((px - op.entrada) / (op.sl - op.entrada)) * 100)) : 0;
  const color = pnlPct >= 0 ? "var(--verde)" : "var(--rojo)";

  raiz.innerHTML = html`
    <div class="card centro">
      <span class="mini">${esc(p.TRADE_PAIR)} · ${esc(op.lado.toUpperCase())} desde ${precio(op.entrada)}</span>
      <div style="font-size:34px;font-weight:700;color:${color};font-variant-numeric:tabular-nums;margin:4px 0">
        ${pnlPct >= 0 ? "+" : ""}${pct(pnlPct)}
      </div>
      <span class="mini">precio ${precio(px)} · ${pnlMon >= 0 ? "+" : ""}${pnlMon.toFixed(4)} XRP</span>
    </div>

    <div class="card">
      <h2>Niveles</h2>
      <div class="stats">
        <div class="stat"><span class="k">Stop loss</span>
          <span class="v neg">${precio(op.sl)} <small>(${aSL >= 0 ? "+" : ""}${pct(aSL, 2)})</small></span></div>
        <div class="stat"><span class="k">TP1</span>
          <span class="v pos">${precio(op.tp1)} <small>(${aTP1 >= 0 ? "+" : ""}${pct(aTP1, 2)})</small></span></div>
        <div class="stat"><span class="k">TP2</span><span class="v pos">${precio(op.tp2)}</span></div>
        <div class="stat"><span class="k">Tamaño</span><span class="v">${op.unidades} XRP · ${op.lev}x</span></div>
      </div>
      <p class="mini mt">Camino consumido hacia el stop: <b>${recorrido.toFixed(0)}%</b></p>
      <div style="height:6px;background:var(--linea);border-radius:3px;overflow:hidden;margin-top:4px">
        <div style="height:100%;width:${recorrido.toFixed(0)}%;background:${recorrido > 70 ? "var(--rojo)" : "var(--ambar)"}"></div>
      </div>
      ${recorrido > 70 ? `<p class="mini mt" style="color:var(--rojo)">
        Muy cerca del stop. No lo muevas: eso convierte una pérdida planeada en una mayor.</p>` : ""}
    </div>

    <div class="card">
      <h2>Cerrar operación</h2>
      <p class="mini">Pon el P&L <b>real</b> que te muestre Bitget, en XRP.
        Usa negativo para pérdidas. Esto actualiza tu saldo.</p>
      <label>Resultado</label>
      <select id="res">
        <option value="TP1">TP1 (parcial)</option>
        <option value="TP2">TP2</option>
        <option value="SL">Stop loss</option>
        <option value="BE">Break-even</option>
        <option value="MANUAL">Cierre manual</option>
      </select>
      <label>P&L real (XRP)</label>
      <input id="pnl" type="number" inputmode="decimal" step="any"
             placeholder="ej. -0.2796 o 0.3596" value="${pnlMon.toFixed(4)}">
      <div class="botones">
        <button data-accion="cerrar">Cerrar y actualizar saldo</button>
        <button class="sec" data-accion="descartar">Descartar (no se abrió)</button>
      </div>
    </div>

    <div class="botones"><button class="sec" data-accion="refrescar">Actualizar precio</button></div>`;

  acciones(raiz, {
    refrescar,
    cerrar: async () => {
      const res = (raiz.querySelector("#res") as HTMLSelectElement).value as Resultado;
      const pnl = Number((raiz.querySelector("#pnl") as HTMLInputElement).value);
      if (Number.isNaN(pnl)) return alert("Escribe el P&L real en XRP.");
      await cerrar(op.id, res, pnl);
      refrescar();
    },
    descartar: async () => {
      if (confirm("¿Borrar este registro? No afecta a tu saldo.")) {
        await borrar(op.id);
        refrescar();
      }
    },
  });
}
