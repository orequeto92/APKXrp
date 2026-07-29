/**
 * Las reglas, para consulta rapida. Refleja lo que el motor aplica de verdad,
 * con los parametros vigentes.
 */
import { actuales } from "../config/params.js";
import { html, esc, pct } from "./comun.js";

export async function vistaEstrategia(raiz: HTMLElement) {
  const p = await actuales();

  raiz.innerHTML = html`
    <div class="card">
      <h2>Qué se opera</h2>
      <p class="mini">Solo el perpetuo <b>${esc(p.TRADE_PAIR)}</b> (coin-margined: el margen
        y la liquidación son en XRP). Intradía 15m–1h. El análisis se hace sobre
        ${esc(p.SYMBOL)}, que es el mismo activo pero más líquido.</p>
      <p class="mini mt"><b>Long = riesgo doble:</b> si el precio cae pierdes en la posición
        <i>y</i> tu colateral vale menos, así que la liquidación llega antes.
        <b>Short = cobertura</b> de tus XRP.</p>
    </div>

    <div class="card">
      <h2>Filtros para que exista setup</h2>
      <p class="mini">Deben cumplirse <b>todos</b>. Si uno falla, no se opera:</p>
      <div class="stats">
        <div class="stat"><span class="k">1. Tendencia 4H</span><span class="v">clara (no entre EMAs)</span></div>
        <div class="stat"><span class="k">2. Sesgo de BTC</span><span class="v">a favor, o solo A+</span></div>
        <div class="stat"><span class="k">3. Semáforo</span><span class="v">no ROJO</span></div>
        <div class="stat"><span class="k">4. Zona 15m</span><span class="v">long en discount / short en premium</span></div>
        <div class="stat"><span class="k">5. Anti-FOMO</span><span class="v">RSI 15m fuera de extremos</span></div>
        <div class="stat"><span class="k">6. Contexto 1D</span>
          <span class="v">no short bajo ${p.DAILY_BLOCK_LOW}% · no long sobre ${p.DAILY_BLOCK_HIGH}%</span></div>
      </div>
      <p class="mini mt">El filtro 6 se añadió tras dos shorts perdedores: el motor miraba
        solo el corto plazo y vendía lo que estaba barato en el marco grande.</p>
    </div>

    <div class="card">
      <h2>Stop loss</h2>
      <p class="mini">Estructural (bajo el mínimo / sobre el máximo), pero con un
        <b>piso de volatilidad</b>: nunca más cerca de <b>${p.ATR_STOP_MULT}× el ATR de 4H</b>.
        Un stop más pegado lo saca el ruido, no que la operación esté equivocada.</p>
      <p class="mini mt">Rango permitido: ${pct(p.SL_MIN_PCT, 1)} – ${pct(p.SL_MAX_PCT, 1)}.
        Si respetar el piso exigiera más que el máximo, <b>el setup se descarta</b>.</p>
    </div>

    <div class="card">
      <h2>Riesgo por convicción</h2>
      <div class="stats">
        <div class="stat"><span class="k">Score ${p.SCORE_RISK_ALTO}–10 (A+ excepcional)</span>
          <span class="v">${pct(p.RISK_PCT_HIGH, 1)}</span></div>
        <div class="stat"><span class="k">Score 6–${p.SCORE_RISK_ALTO - 1}</span>
          <span class="v">${pct(p.RISK_PCT, 1)}</span></div>
        <div class="stat"><span class="k">Score ≤5</span><span class="v">no se opera</span></div>
        <div class="stat"><span class="k">Apalancamiento máx.</span><span class="v">${p.LEV_MAX}x</span></div>
      </div>
      <p class="mini mt"><b>Nunca más de ${pct(p.RISK_PCT_HIGH, 1)}.</b> Los filtros reducen
        cuántas operaciones malas tomas, <i>no</i> hacen segura ninguna. Con rachas de 8
        pérdidas: al 2% recuperas con +18%; al 10% necesitas +132%.</p>
    </div>

    <div class="card">
      <h2>Gestión</h2>
      <p class="mini">SL y TP puestos en la orden desde el inicio. En TP1 se cierra el 50%
        y el stop pasa a break-even: a partir de ahí la operación ya no puede perder.
        Freno diario: 2 stops y se acabó el día. Nunca promediar a la baja.</p>
    </div>

    <div class="card">
      <h2>Catalizadores de XRP</h2>
      <p class="mini">Revisar antes de operar: la <b>CLARITY Act</b> (H.R. 3633) en el Senado
        de EE.UU., fallos de la SEC, noticias de ETF spot y el <b>escrow mensual de Ripple</b>
        (~1.000M XRP a principio de mes). Si hay un voto agendado, <b>no abrir apalancado</b>:
        un gap se salta el stop.</p>
    </div>

    <p class="mini centro" style="margin:14px 4px">
      Material educativo, no asesoría financiera. Operar futuros apalancados puede
      liquidar tu capital. La app nunca coloca órdenes.
    </p>`;
}
