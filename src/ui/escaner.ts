/**
 * Escaner — el setup del momento segun las reglas.
 * Equivale a /oportunidades en el bot de Telegram.
 */
import { evaluar, type Senal } from "../engine/signal.js";
import { estadoClarity, type Clarity } from "../engine/clarity.js";
import { detectar, slEstructural, type Lado } from "../engine/ruptura.js";
import { señal as señalImpulso, type SeñalImpulso } from "../engine/impulso.js";
import { getCandles, getContratos } from "../engine/bitget.js";
import { compute } from "../engine/ta.js";
import { dimensionar, type Tamano } from "../engine/sizing.js";
import { actuales } from "../config/params.js";
import { cargar, abrir, estadisticas, sistemaDe } from "../store/store.js";
import { html, esc, precio, usd, pct, acciones, cargando } from "./comun.js";

interface AvisoRuptura {
  lado: Lado;
  diasActivo: number;
  price: number;
  sl: number;
  slPct: number;
  atr1dPct: number | null;
}

/**
 * Regimen RUPTURA (ver engine/ruptura.ts) — EXCLUYENTE del sistema normal de
 * arriba. Muy poco frecuente (2 episodios reales en ~3 anios de historico), asi
 * que si aparece merece un aviso propio y bien visible, no mezclado en el score.
 */
async function chequearRuptura(symbol: string): Promise<AvisoRuptura | null> {
  try {
    const [c1d, c4h] = await Promise.all([getCandles(symbol, "1D", 300), getCandles(symbol, "4H", 320)]);
    if (c1d.length < 90 || c4h.length < 30) return null;
    const r = detectar(c1d);
    const n = r.activo.length;
    if (!r.activo[n - 1] || !r.lado[n - 1]) return null;
    const lado: Lado = r.lado[n - 1] === "ALCISTA" ? "long" : "short";
    let diasActivo = 0;
    for (let i = n - 1; i >= 0 && r.activo[i]; i--) diasActivo++;

    const m4 = compute(symbol, "4H", c4h);
    if (!m4) return null;
    const atr1dPct = r.atrPct[n - 1];
    const { sl, distPct } = slEstructural(m4.price, lado, m4, atr1dPct);
    return { lado, diasActivo, price: m4.price, sl, slPct: distPct, atr1dPct };
  } catch {
    return null;   // aviso opcional: si falla, el escaner normal sigue funcionando
  }
}

/**
 * Sistema EXPERIMENTAL (ver engine/impulso.ts). Reconstruido de un documento
 * externo; probado fuera de la ventana con la que fue disenado y NO mostro
 * ventaja real (ruido estadistico, +0.012 R/oper). Se muestra igual, a peticion
 * explicita del usuario, porque genera mas senales que el sistema normal -- pero
 * SIEMPRE marcado como experimental, nunca como una senal confiable.
 */
async function chequearImpulso(symbol: string, btcSymbol: string): Promise<SeñalImpulso | null> {
  try {
    const [c4h, c4hBtc] = await Promise.all([getCandles(symbol, "4H", 300), getCandles(btcSymbol, "4H", 300)]);
    return señalImpulso(c4h, c4hBtc);
  } catch {
    return null;   // aviso opcional: si falla, el escaner normal sigue funcionando
  }
}

let ultima: Senal | null = null;
let ultimaImpulso: SeñalImpulso | null = null;

const COLOR: Record<string, string> = {
  "TRADE": "var(--verde)", "WATCH": "var(--ambar)",
  "WAIT": "var(--ambar)", "NO-TRADE": "var(--rojo)", "ERROR": "var(--rojo)",
};

const TITULO: Record<string, string> = {
  "TRADE": "SETUP VÁLIDO", "WATCH": "VIGILAR",
  "WAIT": "ESPERAR", "NO-TRADE": "NO SE OPERA", "ERROR": "SIN DATOS",
};

export function limpiarCache() { ultima = null; ultimaImpulso = null; }

export async function vistaEscaner(raiz: HTMLElement, refrescar: () => void) {
  raiz.innerHTML = cargando("Analizando XRP en Bitget…");

  const p = await actuales();
  const estado = await cargar();
  const st = estadisticas(estado);

  let s: Senal;
  let ruptura: AvisoRuptura | null = null;
  let impulso: SeñalImpulso | null = null;
  try {
    [s, ruptura, impulso] = await Promise.all([
      evaluar(estado.saldo, p), chequearRuptura(p.SYMBOL), chequearImpulso(p.SYMBOL, p.DIRECTOR_SYMBOL),
    ]);
    ultima = s;
    ultimaImpulso = impulso;
  } catch (e) {
    raiz.innerHTML = html`<div class="card">
      <h2>No pude consultar Bitget</h2>
      <p class="mini">${esc(String(e))}</p>
      <div class="botones"><button data-accion="reintentar">Reintentar</button></div>
    </div>`;
    acciones(raiz, { reintentar: refrescar });
    return;
  }

  // Sizing de IMPULSO: mismo motor que el sistema principal, pero el TP es el fijo
  // del propio IMPULSO (1.5x su SL), no el tp1/tp2 de dos blancos que usa dimensionar().
  let impulsoSizing: Tamano | null = null;
  if (impulso) {
    try {
      const contrato = (await getContratos())[p.SYMBOL] || null;
      impulsoSizing = dimensionar(impulso.entrada, impulso.sl, impulso.lado,
        estado.saldo * impulso.entrada, p.RISK_PCT, p.LEV_MAX, contrato, p.SL_MIN_PCT, p.SL_MAX_PCT);
    } catch { /* aviso opcional: si falla, la tarjeta se muestra sin sizing */ }
  }
  const abiertaPrincipal = st.abiertas.find((o) => sistemaDe(o) === "principal") || null;
  const abiertaImpulso = st.abiertas.find((o) => sistemaDe(o) === "impulso") || null;

  const rsiTxt = ["4H", "1H", "15m"]
    .map((k) => (s.rsi as any)[k] == null ? "—" : Math.round((s.rsi as any)[k]))
    .join(" / ");

  // Contexto regulatorio: no cambia el score, pero condiciona como leer la senal.
  const cl: Clarity | null = await estadoClarity();
  const bloqueClarity = cl ? html`
    <div class="card" style="border-left:3px solid ${
      cl.aviso === "atencion" ? "var(--ambar)" : "var(--linea)"}">
      <h2>CLARITY Act ${cl.cambio ? "· ¡CAMBIÓ!" : ""}</h2>
      <div class="stats">
        <div class="stat"><span class="k">Estado</span><span class="v">${esc(cl.etiqueta)}</span></div>
        <div class="stat"><span class="k">Último hito</span>
          <span class="v">${esc(cl.fecha)} <small class="mini">(hace ${cl.diasDesde} d)</small></span></div>
      </div>
      ${cl.cambio ? `<p class="mini mt" style="color:var(--ambar)"><b>El estado cambió desde
        tu última consulta.</b> Un hito legislativo mueve el precio con fuerza: revisa antes
        de operar apalancado.</p>` : ""}
      <p class="mini mt">${esc(cl.lectura)}</p>
      <p class="mini mt">Esto refleja <b>hitos</b> (paso por una cámara, firma), no la agenda
        diaria del pleno: <b>no detecta</b> que se agende un voto o se presente cloture, que es
        el evento con riesgo de gap. Para eso, mira noticias.
        <a href="${esc(cl.enlace)}" target="_blank" rel="noopener">Ver ficha</a></p>
    </div>` : html`
    <div class="card" style="border-left:3px solid var(--linea)">
      <h2>CLARITY Act</h2>
      <p class="mini">No pude consultar el estado (sin red o GovTrack no responde).
        El análisis técnico no se ve afectado.</p>
    </div>`;

  const avisoRuptura = ruptura ? html`
    <div class="card" style="border-left:3px solid var(--rojo)">
      <h2>🚨 RÉGIMEN RUPTURA activo</h2>
      <p class="mini">Tendencia violenta confirmada (tipo el rally de XRP nov-2024, +69% en
        46 días) — <b>diferente al sistema normal de arriba</b>: sin premium/discount, sin TP fijo,
        gestión por trailing. Ver el detalle en la pestaña Reglas.</p>
      <div class="stats">
        <div class="stat"><span class="k">Lado</span><span class="v">${esc(ruptura.lado.toUpperCase())}</span></div>
        <div class="stat"><span class="k">Días confirmado</span><span class="v">${ruptura.diasActivo}</span></div>
        <div class="stat"><span class="k">Precio</span><span class="v">${precio(ruptura.price)}</span></div>
        <div class="stat"><span class="k">SL sugerido</span>
          <span class="v neg">${precio(ruptura.sl)} (${pct(ruptura.slPct, 1)})</span></div>
      </div>
      <p class="mini mt">Riesgo inicial: la <b>mitad</b> de tu riesgo normal (confirmación real, pero
        sigue siendo la parte más incierta). Se escala a riesgo completo solo si, 5+ días después,
        sigue confirmado y avanzó 5%+ más a favor. SL a break-even tras avanzar 1R, luego sigue
        el último swing de 4H. <b>Tú colocas la orden en Bitget</b> — la app nunca opera.</p>
    </div>` : "";

  const avisoImpulso = impulso ? html`
    <div class="card" style="border-left:3px solid var(--ambar)">
      <h2>🧪 EXPERIMENTAL — señal IMPULSO</h2>
      <p class="mini"><b>Sin ventaja demostrada.</b> Se probó fuera del período con el que se
        construyó y quedó en ruido estadístico (+0.012 R/operación) — trátalo como informativo,
        no como señal confiable. Se muestra porque genera más señales que el sistema normal.</p>
      <div class="stats">
        <div class="stat"><span class="k">Lado</span><span class="v">${esc(impulso.lado.toUpperCase())}</span></div>
        <div class="stat"><span class="k">Entrada</span><span class="v">${precio(impulso.entrada)}</span></div>
        <div class="stat"><span class="k">SL</span><span class="v neg">${precio(impulso.sl)}</span></div>
        <div class="stat"><span class="k">TP</span><span class="v pos">${precio(impulso.tp)}</span></div>
        ${impulsoSizing ? html`
        <div class="stat"><span class="k">Cantidad</span><span class="v">${impulsoSizing.qty} XRP</span></div>
        <div class="stat"><span class="k">Apalancamiento</span><span class="v">${impulsoSizing.leverage}x</span></div>
        <div class="stat"><span class="k">Margen</span><span class="v">${(impulsoSizing.margin / impulso.entrada).toFixed(4)} XRP</span></div>
        <div class="stat"><span class="k">Riesgo (${pct(impulsoSizing.risk_pct, 1)})</span>
          <span class="v neg">${(impulsoSizing.risk_usd / impulso.entrada).toFixed(4)} XRP</span></div>` : ""}
      </div>
      <p class="mini mt">ATR exp ${impulso.atrExp.toFixed(2)} · Eficiencia(3) ${impulso.eff.toFixed(2)} ·
        RVOL ${impulso.rvol.toFixed(2)}. Gestión fija (sin break-even ni trailing).
        <b>Tú colocas la orden en Bitget</b> — la app nunca opera.</p>
      ${impulsoSizing?.warnings.map((w) => `<p class="mini" style="color:var(--ambar)">⚠️ ${esc(w)}</p>`).join("") || ""}
      ${abiertaImpulso ? html`
        <p class="mini mt">Ya tenés una posición IMPULSO abierta (${esc(abiertaImpulso.lado.toUpperCase())}
          desde ${precio(abiertaImpulso.entrada)}). Mírala en la pestaña Posición antes de abrir otra.</p>` : html`
        <div class="botones"><button data-accion="registrarImpulso">Registrar que la abrí</button></div>`}
    </div>` : "";

  const avisoAbierta = abiertaPrincipal ? html`
    <div class="card" style="border-left:3px solid var(--ambar)">
      <b>Ya tienes una posición abierta (sistema principal)</b>
      <p class="mini">${esc(abiertaPrincipal.lado.toUpperCase())} desde ${precio(abiertaPrincipal.entrada)} ·
      SL ${precio(abiertaPrincipal.sl)}. Míralo en la pestaña Posición. No abras otra sin cerrarla.</p>
    </div>` : "";

  const bloqueSetup = s.decision === "TRADE" && s.sizing ? html`
    <div class="card">
      <h2>Plan de la operación</h2>
      <div class="stats">
        <div class="stat"><span class="k">Entrada</span><span class="v">${precio(s.entry!)}</span></div>
        <div class="stat"><span class="k">Stop loss</span><span class="v neg">${precio(s.sl!)}</span></div>
        <div class="stat"><span class="k">TP1 (cierra 50%)</span><span class="v pos">${precio(s.tp1!)}</span></div>
        <div class="stat"><span class="k">TP2</span><span class="v pos">${precio(s.tp2!)}</span></div>
        <div class="stat"><span class="k">Cantidad</span><span class="v">${s.sizing.qty} XRP</span></div>
        <div class="stat"><span class="k">Apalancamiento</span><span class="v">${s.sizing.leverage}x</span></div>
        <div class="stat"><span class="k">Margen</span><span class="v">${usd(s.sizing.margin)}</span></div>
        <div class="stat"><span class="k">Riesgo (${pct(s.sizing.risk_pct, 1)})</span>
          <span class="v neg">${usd(s.sizing.risk_usd)}</span></div>
      </div>
      ${s.sizing.risk_pct > p.RISK_PCT
        ? `<p class="mini mt">Riesgo ampliado por score ${s.score} (setup excepcional).</p>` : ""}
      ${s.side === "long"
        ? `<p class="mini mt">⚠️ Long coin-margined = riesgo doble: si cae, pierdes en la
             posición y tu colateral vale menos. Considera menos apalancamiento.</p>` : ""}
      ${s.sizing.warnings.map((w) => `<p class="mini" style="color:var(--ambar)">⚠️ ${esc(w)}</p>`).join("")}
      <p class="mini mt">Tras TP1: cierra 50% y mueve el SL a break-even.
        <b>Tú colocas la orden en Bitget</b> — la app nunca opera.</p>
      <div class="botones">
        <button data-accion="registrar">Registrar que la abrí</button>
      </div>
    </div>` : "";

  raiz.innerHTML = html`
    ${avisoRuptura}
    ${avisoAbierta}
    <div class="card centro">
      <span class="mini">${esc(p.TRADE_PAIR)}</span>
      <div style="font-size:34px;font-weight:700;font-variant-numeric:tabular-nums;margin:2px 0">
        ${precio(s.price)}
      </div>
      <div style="color:${COLOR[s.decision]};font-weight:700;letter-spacing:.5px">
        ${esc(TITULO[s.decision])}${s.score ? ` · ${s.grade} ${s.score}/10` : ""}
      </div>
      <p class="mini mt">${esc(s.reason)}</p>
    </div>

    <div class="card">
      <h2>Contexto</h2>
      <div class="stats">
        <div class="stat"><span class="k">Semáforo</span><span class="v">${esc(s.gauge)}</span></div>
        <div class="stat"><span class="k">Director BTC</span><span class="v">${esc(s.director)}</span></div>
        <div class="stat"><span class="k">RSI 4H/1H/15m</span><span class="v">${esc(rsiTxt)}</span></div>
        <div class="stat"><span class="k">Zona 15m</span><span class="v">${esc(s.zona15 || "—")}</span></div>
        <div class="stat"><span class="k">Zona 1D</span><span class="v">${esc(s.zona1d || "—")}</span></div>
        <div class="stat"><span class="k">Posición en 1D</span>
          <span class="v">${s.pos1d == null ? "—" : Math.round(s.pos1d) + "%"}</span></div>
      </div>
      ${(s.divs1d || []).length
        ? `<p class="mini mt" style="color:var(--ambar)">Divergencia en 1D:
            ${esc((s.divs1d || []).join(" · "))} — pesa mucho en el score.</p>` : ""}
    </div>

    ${bloqueClarity}

    ${bloqueSetup}

    ${avisoImpulso}

    <p class="mini centro" style="margin:14px 4px">
      Material educativo, no asesoría financiera. La app solo lee datos públicos.
    </p>
    <div class="botones"><button class="sec" data-accion="reintentar">Actualizar</button></div>`;

  acciones(raiz, {
    reintentar: refrescar,
    registrar: async () => {
      if (!ultima?.sizing || !ultima.entry) return;
      await abrir({
        lado: ultima.side!, entrada: ultima.entry, sl: ultima.sl!,
        tp1: ultima.tp1!, tp2: ultima.tp2!, unidades: ultima.sizing.qty,
        lev: ultima.sizing.leverage, score: ultima.score ?? null,
        nota: "", propia: false, sistema: "principal",
      });
      refrescar();
    },
    registrarImpulso: async () => {
      if (!ultimaImpulso) return;
      const contrato = (await getContratos())[p.SYMBOL] || null;
      const sz = dimensionar(ultimaImpulso.entrada, ultimaImpulso.sl, ultimaImpulso.lado,
        (await cargar()).saldo * ultimaImpulso.entrada, p.RISK_PCT, p.LEV_MAX, contrato,
        p.SL_MIN_PCT, p.SL_MAX_PCT);
      if (!sz) return;
      // TP unico (no tp1/tp2 parcial): IMPULSO no tiene break-even ni cierre parcial.
      await abrir({
        lado: ultimaImpulso.lado, entrada: ultimaImpulso.entrada, sl: ultimaImpulso.sl,
        tp1: ultimaImpulso.tp, tp2: ultimaImpulso.tp, unidades: sz.qty,
        lev: sz.leverage, score: null, nota: "EXPERIMENTAL: sin ventaja demostrada.",
        propia: false, sistema: "impulso",
      });
      refrescar();
    },
  });
}
