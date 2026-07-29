/**
 * Capital, interes compuesto e historial.
 * El saldo que se fija aqui es el que usa el Escaner para dimensionar.
 */
import { getTicker } from "../engine/bitget.js";
import { actuales } from "../config/params.js";
import { cargar, fijarSaldo, guardar, estadisticas } from "../store/store.js";
import { html, esc, precio, usd, pct, acciones } from "./comun.js";

export async function vistaCapital(raiz: HTMLElement, refrescar: () => void) {
  const p = await actuales();
  const estado = await cargar();
  const st = estadisticas(estado);

  let px = 0;
  try { px = Number((await getTicker(p.SYMBOL)).lastPr) || 0; } catch { /* sin red */ }
  const enUsd = px ? estado.saldo * px : 0;
  const riesgo = (enUsd * p.RISK_PCT) / 100;

  const historial = estado.operaciones.length ? estado.operaciones.map((o) => {
    const cerrada = o.resultado != null;
    const pnl = o.pnl_monedas || 0;
    const col = !cerrada ? "var(--ambar)" : pnl >= 0 ? "var(--verde)" : "var(--rojo)";
    return html`
      <div class="stat">
        <span class="k">
          ${esc(new Date(o.fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }))}
          · ${esc(o.lado.toUpperCase())} ${precio(o.entrada)}
          ${o.propia ? " · propia" : o.score ? ` · ${o.score}/10` : ""}
        </span>
        <span class="v" style="color:${col}">
          ${cerrada ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)}` : "abierta"}
          <small class="mini">${esc(o.resultado || "")}</small>
        </span>
      </div>`;
  }).join("") : `<p class="mini">Todavía no hay operaciones registradas.</p>`;

  raiz.innerHTML = html`
    <div class="card centro">
      <span class="mini">SALDO (margen en XRP)</span>
      <div style="font-size:36px;font-weight:700;color:var(--verde);font-variant-numeric:tabular-nums;margin:4px 0">
        ${estado.saldo.toFixed(4)}
      </div>
      <span class="mini">
        ${px ? `≈ ${usd(enUsd)} · ` : ""}inicial ${estado.saldo_inicial.toFixed(4)} ·
        <b style="color:${st.crecimiento >= 0 ? "var(--verde)" : "var(--rojo)"}">
          ${st.crecimiento >= 0 ? "+" : ""}${pct(st.crecimiento, 1)}
        </b>
      </span>
    </div>

    <div class="card">
      <h2>Riesgo por operación</h2>
      <div class="stats">
        <div class="stat"><span class="k">Normal (${pct(p.RISK_PCT, 1)})</span>
          <span class="v">${usd(riesgo, 3)}</span></div>
        <div class="stat"><span class="k">A+ excepcional (${pct(p.RISK_PCT_HIGH, 1)})</span>
          <span class="v">${usd((enUsd * p.RISK_PCT_HIGH) / 100, 3)}</span></div>
        <div class="stat"><span class="k">Ganancia a 2R</span><span class="v pos">${usd(riesgo * 2, 3)}</span></div>
      </div>
      <p class="mini mt">Cada operación cerrada actualiza el saldo y la siguiente se dimensiona
        con el nuevo. Eso es el interés compuesto.</p>
    </div>

    <div class="card">
      <h2>Estadísticas</h2>
      <div class="stats">
        <div class="stat"><span class="k">Operaciones</span><span class="v">${st.total}</span></div>
        <div class="stat"><span class="k">Cerradas</span><span class="v">${st.cerradas}</span></div>
        <div class="stat"><span class="k">Ganadas / perdidas</span>
          <span class="v">${st.ganadas} / ${st.perdidas}</span></div>
        <div class="stat"><span class="k">Acierto</span><span class="v">${pct(st.acierto, 0)}</span></div>
        <div class="stat"><span class="k">P&L acumulado</span>
          <span class="v" style="color:${st.pnl >= 0 ? "var(--verde)" : "var(--rojo)"}">
            ${st.pnl >= 0 ? "+" : ""}${st.pnl.toFixed(4)} XRP</span></div>
      </div>
      ${st.cerradas < 30 ? `<p class="mini mt">Con ${st.cerradas} operaciones cerradas
        <b>todavía no hay evidencia estadística</b> de ventaja. Hacen falta ~30 para poder
        medir tu acierto real y plantear subir el riesgo.</p>` : ""}
    </div>

    <div class="card">
      <h2>Ajustar saldo</h2>
      <p class="mini">Ponlo al valor real de tu margen en Bitget, en XRP.</p>
      <label>Saldo (XRP)</label>
      <input id="nuevo" type="number" inputmode="decimal" step="any" value="${estado.saldo}">
      <div class="botones">
        <button data-accion="set">Guardar</button>
        <button class="sec" data-accion="inicial">Fijar también como inicial</button>
      </div>
      <p class="mini mt">Recuerda actualizar también el secret <code>BALANCE_COINS</code>
        en GitHub para que el bot dimensione igual.</p>
    </div>

    <div class="card">
      <h2>Historial</h2>
      <div class="stats">${historial}</div>
    </div>`;

  acciones(raiz, {
    set: async () => {
      const v = Number((raiz.querySelector("#nuevo") as HTMLInputElement).value);
      if (!v || v <= 0) return alert("Escribe un saldo válido.");
      await fijarSaldo(v);
      refrescar();
    },
    inicial: async () => {
      const v = Number((raiz.querySelector("#nuevo") as HTMLInputElement).value);
      if (!v || v <= 0) return alert("Escribe un saldo válido.");
      const e = await cargar();
      e.saldo = v; e.saldo_inicial = v;
      await guardar(e);
      refrescar();
    },
  });
}
