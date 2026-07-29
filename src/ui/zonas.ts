/**
 * Zonas clave para poner alertas de precio en Bitget.
 * Equivale a /alertas en el bot.
 */
import { zonasClave } from "../engine/signal.js";
import { actuales } from "../config/params.js";
import { html, esc, precio, pct, acciones, cargando } from "./comun.js";

export async function vistaZonas(raiz: HTMLElement, refrescar: () => void) {
  raiz.innerHTML = cargando("Calculando niveles…");
  const p = await actuales();

  let z: Awaited<ReturnType<typeof zonasClave>>;
  try {
    z = await zonasClave(p.SYMBOL);
  } catch (e) {
    raiz.innerHTML = html`<div class="card"><h2>Sin datos</h2>
      <p class="mini">${esc(String(e))}</p></div>`;
    return;
  }
  if (!z) {
    raiz.innerHTML = html`<div class="card"><h2>Sin datos suficientes</h2></div>`;
    return;
  }

  const filas = z.niveles.map(([lv, tag]) => {
    const d = ((lv / z!.price - 1) * 100);
    const arriba = d >= 0;
    return html`
      <div class="stat" style="align-items:flex-start">
        <span class="k" style="min-width:0">
          <b style="color:${arriba ? "var(--rojo)" : "var(--verde)"}">${arriba ? "▲" : "▼"}</b>
          ${esc(tag)}
        </span>
        <span class="v" style="text-align:right;white-space:nowrap">
          ${precio(lv)}<br><small class="mini">${arriba ? "+" : ""}${pct(d, 1)}</small>
        </span>
      </div>`;
  }).join("");

  raiz.innerHTML = html`
    <div class="card centro">
      <span class="mini">${esc(p.TRADE_PAIR)}</span>
      <div style="font-size:30px;font-weight:700;font-variant-numeric:tabular-nums">${precio(z.price)}</div>
    </div>

    <div class="card">
      <h2>Niveles para alertar</h2>
      <div class="stats">${filas}</div>
      <p class="mini mt"><b>La alerta no es señal de entrada</b>: es un aviso para mirar.
        Cuando salte, abre el Escáner y comprueba si de verdad hay setup.</p>
    </div>

    <div class="card">
      <h2>Cómo ponerlas en Bitget</h2>
      <p class="mini">Mercados → busca XRP → icono de campana 🔔 → «El precio sube/baja a…»
        → escribe el nivel → guardar. Revisa que las notificaciones de la app estén activadas.</p>
      <p class="mini mt">Regenera estos niveles cada pocos días o tras un movimiento fuerte:
        la estructura se mueve y los números viejos dejan de servir.</p>
    </div>

    <div class="botones"><button class="sec" data-accion="refrescar">Recalcular</button></div>`;

  acciones(raiz, { refrescar });
}
