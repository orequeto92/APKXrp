/**
 * Motor de senal — port fiel de engine/signal.py del bot.
 *
 * Flujo: lee BTC (director de mercado) y el activo en 1D/4H/1H/15m, calcula un
 * semaforo de riesgo, decide LONG / SHORT / ESPERAR / NO-TRADE y dimensiona.
 * NUNCA coloca ordenes.
 *
 * IMPORTANTE: cualquier cambio de reglas debe replicarse en el Python del bot,
 * o app y bot daran senales distintas. `npm run paridad` compara ambos.
 */
import { getCandles, getTicker, getFunding, getContratos, type Contrato } from "./bitget.js";
import { compute, type Metrics, type Candle } from "./ta.js";
import { dimensionar, type Tamano } from "./sizing.js";
import type { Params } from "../config/params.js";

const TFS: Array<[string, string]> = [["1D", "1D"], ["4H", "4H"], ["1H", "1H"], ["15m", "15m"]];
const CLARO = ["alcista", "bajista"];

export type Decision = "TRADE" | "WATCH" | "WAIT" | "NO-TRADE" | "ERROR";

export interface Senal {
  symbol: string;
  price: number;
  gauge: "VERDE" | "AMARILLO" | "ROJO";
  director: string;
  oi: number | null;
  funding: number | null;
  rsi: { "4H": number | null; "1H": number | null; "15m": number | null };
  zona15: string | null;
  zona4: string | null;
  zona1d: string | null;
  pos1d: number | null;
  decision: Decision;
  reason: string;
  side?: "long" | "short";
  entry?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  score?: number;
  grade?: string;
  sizing?: Tamano;
  divs1d?: string[];
}

interface Datos {
  price: number | null;
  funding: number | null;
  oi: number | null;
  chg24: number | null;
  tf: Record<string, Metrics | null>;
  candles: Record<string, Candle[]>;
}

const num = (s: string | undefined): number | null => {
  const v = Number(s);
  return s == null || Number.isNaN(v) ? null : v;
};

/**
 * Capa de datos inyectable. Por defecto pega a Bitget; el comparador de paridad
 * le pasa velas congeladas para poder contrastar con el motor Python usando
 * exactamente los mismos numeros.
 */
export interface Fuente {
  velas: typeof getCandles;
  ticker: typeof getTicker;
  funding: typeof getFunding;
  contratos: typeof getContratos;
}

export const FUENTE_BITGET: Fuente = {
  velas: getCandles, ticker: getTicker, funding: getFunding, contratos: getContratos,
};

async function medir(symbol: string, f: Fuente): Promise<Datos> {
  const tk = await f.ticker(symbol);
  const funding = await f.funding(symbol);
  const tf: Record<string, Metrics | null> = {};
  const candles: Record<string, Candle[]> = {};
  for (const [nombre, gran] of TFS) {
    const velas = await f.velas(symbol, gran, 300);
    candles[nombre] = velas;
    tf[nombre] = velas.length >= 30 ? compute(symbol, nombre, velas) : null;
  }
  const precio = num(tk.lastPr);
  const oiBase = num(tk.holdingAmount);
  return {
    price: precio,
    funding,
    oi: oiBase != null && precio != null ? oiBase * precio : null,
    chg24: num(tk.change24h),
    tf,
    candles,
  };
}

const DIVERGENCIA_LB = 5;   // velas de 4H hacia atras para medir si BTC acompana

function retorno(candles: Candle[], lookback: number): number | null {
  if (candles.length < lookback + 1) return null;
  const c = candles.map((x) => x.map(Number) as unknown as Candle);
  return (Number(c[c.length - 1][4]) / Number(c[c.length - 1 - lookback][4]) - 1) * 100;
}

/**
 * True si BTC NO acompana el movimiento reciente de XRP en la direccion del
 * lado propuesto. Validado con replay_combinado.py (Python) sobre nov-2024 ->
 * ago-2026: +7.00R netos (9 perdedoras evitadas por cada 2 ganadoras).
 */
export function divergente(velasSym: Candle[], velasDir: Candle[], lado: "long" | "short",
                            lookback = DIVERGENCIA_LB): boolean {
  const rx = retorno(velasSym, lookback);
  const rb = retorno(velasDir, lookback);
  if (rx === null || rb === null) return false;
  const rbFavor = lado === "long" ? rb : -rb;
  const rxFavor = lado === "long" ? rx : -rx;
  const acompana = (rxFavor > 0) === (rbFavor > 0) && rbFavor > 0;
  return !acompana;
}

function semaforo(btc: Datos): ["VERDE" | "AMARILLO" | "ROJO", number] {
  let score = 0;
  const f = btc.funding || 0;
  if (f > 0.0005) score += 2;
  else if (f < -0.0005) score += 1;

  const m4 = btc.tf["4H"];
  if (m4?.atr_pct && m4.atr_pct > 2.5) score += 1;
  for (const tf of ["1D", "4H"]) {
    const r = btc.tf[tf]?.rsi;
    if (r != null && (r > 75 || r < 25)) score += 1;
  }
  const c = btc.chg24;
  if (c != null) {
    if (c < -0.05) score += 2;
    else if (c > 0.06) score += 1;
  }
  return [score >= 4 ? "ROJO" : score >= 2 ? "AMARILLO" : "VERDE", score];
}

function director(btc: Datos): string {
  const b4 = btc.tf["4H"]?.bias;
  const b1 = btc.tf["1H"]?.bias;
  if (b4 === "alcista" && b1 === "alcista") return "long";
  if (b4 === "bajista" && b1 === "bajista") return "short";
  return "";
}

/** SL estructural con piso de volatilidad. Devuelve null si no cabe un stop sano. */
function stopEstructural(
  price: number, lado: "long" | "short",
  m15: Metrics, m1h: Metrics, m4: Metrics, p: Params,
): { sl: number | null; ok: boolean; motivo: string } {
  const atr15 = m15.atr || 0;
  let sl: number;
  if (lado === "long") {
    const cand = [...(m1h.supports || []), ...(m15.supports || [])].filter((s) => s < price);
    const base = cand.length ? Math.max(...cand) : price * (1 - p.SL_MIN_PCT / 100);
    sl = base - 0.3 * atr15;
  } else {
    const cand = [...(m1h.resistances || []), ...(m15.resistances || [])].filter((r) => r > price);
    const base = cand.length ? Math.min(...cand) : price * (1 + p.SL_MIN_PCT / 100);
    sl = base + 0.3 * atr15;
  }

  const atr4 = m4.atr_pct || 0;
  const piso = Math.max(p.SL_MIN_PCT, atr4 * p.ATR_STOP_MULT);
  let distPct = (Math.abs(price - sl) / price) * 100;

  if (distPct < piso) {
    if (piso > p.SL_MAX_PCT) {
      return { sl: null, ok: false,
        motivo: `volatilidad alta (ATR 4H ${atr4.toFixed(2)}%): un stop sano exigiria ` +
                `${piso.toFixed(2)}% (> maximo ${p.SL_MAX_PCT}%).` };
    }
    sl = lado === "long" ? price * (1 - piso / 100) : price * (1 + piso / 100);
  } else if (distPct > p.SL_MAX_PCT) {
    sl = lado === "long" ? price * (1 - p.SL_MAX_PCT / 100) : price * (1 + p.SL_MAX_PCT / 100);
  }
  return { sl, ok: true, motivo: "" };
}

export async function evaluar(
  saldoMonedas: number, p: Params, f: Fuente = FUENTE_BITGET,
): Promise<Senal> {
  const btc = await medir(p.DIRECTOR_SYMBOL, f);
  const sym = await medir(p.SYMBOL, f);
  const price = sym.price;
  const m1d = sym.tf["1D"], m4 = sym.tf["4H"], m1h = sym.tf["1H"], m15 = sym.tf["15m"];

  const base = {
    symbol: p.SYMBOL, price: price || 0, oi: sym.oi, funding: sym.funding,
    rsi: { "4H": m4?.rsi ?? null, "1H": m1h?.rsi ?? null, "15m": m15?.rsi ?? null },
    zona15: m15?.zona ?? null, zona4: m4?.zona ?? null,
    zona1d: m1d?.zona ?? null, pos1d: m1d?.pos_pct ?? null,
    divs1d: m1d?.divergences ?? [],
  };

  if (!price || !m4 || !m15 || !m1h) {
    return { ...base, gauge: "VERDE", director: "neutral",
             decision: "ERROR", reason: "sin datos suficientes del mercado." };
  }

  const [color] = semaforo(btc);
  const dir = director(btc);
  const res = { ...base, gauge: color, director: dir || "neutral" };

  // --- filtros duros ---
  const bias4 = m4.bias;
  if (!CLARO.includes(bias4)) {
    return { ...res, decision: "NO-TRADE", reason: `4H sin tendencia clara (${bias4}).` };
  }
  const lado: "long" | "short" = bias4 === "alcista" ? "long" : "short";
  if (dir && dir !== lado) {
    return { ...res, decision: "NO-TRADE", side: lado,
             reason: `contra el sesgo director de BTC (${dir}).` };
  }
  if (color === "ROJO") {
    return { ...res, decision: "NO-TRADE", side: lado,
             reason: "Semaforo ROJO: mercado de riesgo, esperar." };
  }

  // zona + anti-FOMO: si esta extendido, esperar retroceso (no perseguir)
  const zona = m15.zona || "";
  const rsi15 = m15.rsi ?? 50;
  if (lado === "long" && (zona.includes("PREMIUM") || rsi15 > 68)) {
    return { ...res, decision: "WAIT", side: lado,
             reason: "tendencia alcista pero en premium/RSI alto: esperar pullback a discount." };
  }
  if (lado === "short" && (zona.includes("DISCOUNT") || rsi15 < 32)) {
    return { ...res, decision: "WAIT", side: lado,
             reason: "tendencia bajista pero en discount/RSI bajo: esperar rebote a premium." };
  }

  // contexto diario: nunca operar contra donde esta el precio en el rango de 1D
  const pos1d = m1d?.pos_pct ?? null;
  if (pos1d != null) {
    if (lado === "short" && pos1d <= p.DAILY_BLOCK_LOW) {
      return { ...res, decision: "NO-TRADE", side: lado,
        reason: `el 1D esta en descuento profundo (${pos1d.toFixed(0)}% del rango): no se ` +
                `shortea lo que esta barato en el marco grande.` };
    }
    if (lado === "long" && pos1d >= p.DAILY_BLOCK_HIGH) {
      return { ...res, decision: "NO-TRADE", side: lado,
        reason: `el 1D esta en premium profundo (${pos1d.toFixed(0)}% del rango): no se compra ` +
                `lo que esta caro en el marco grande.` };
    }
  }

  // BTC confirmation: XRP moviendose solo, sin que BTC acompane en las ultimas
  // velas de 4H, es sospechoso de ruido especifico del activo (validado: +7R
  // netos sobre nov-2024 -> ago-2026).
  if (divergente(sym.candles["4H"] || [], btc.candles["4H"] || [], lado)) {
    return { ...res, decision: "NO-TRADE", side: lado,
      reason: `XRP diverge de BTC (${DIVERGENCIA_LB} velas 4H): movimiento no confirmado por el mercado.` };
  }

  // --- construir la operacion ---
  const { sl, ok, motivo } = stopEstructural(price, lado, m15, m1h, m4, p);
  if (!ok || sl == null) {
    return { ...res, decision: "NO-TRADE", side: lado, reason: motivo };
  }

  // --- score de conviccion (base 5) ---
  let score = 5;
  if (dir === lado) score += 1;
  if (color === "VERDE") score += 1;
  if ((lado === "long" && zona.includes("DISCOUNT")) ||
      (lado === "short" && zona.includes("PREMIUM"))) score += 1;
  if (m1h.bias === bias4) score += 1;
  if (lado === "long") score -= 1;                    // long coin-margined = riesgo doble

  const d15 = (m15.divergences || []).join(" ").toLowerCase();
  if ((lado === "long" && d15.includes("bajista")) ||
      (lado === "short" && d15.includes("alcista"))) score -= 1;
  // una divergencia en el DIARIO pesa mucho mas: el movimiento grande se agota
  const d1d = (m1d?.divergences || []).join(" ").toLowerCase();
  if ((lado === "long" && d1d.includes("bajista")) ||
      (lado === "short" && d1d.includes("alcista"))) score -= 2;
  if (color === "AMARILLO") score -= 1;

  score = Math.max(1, Math.min(10, score));
  const grade = score >= 8 ? "A+" : score >= 6 ? "A" : "B";

  // riesgo por conviccion: solo los mejores setups usan el tamano ampliado
  const riesgo = score >= p.SCORE_RISK_ALTO ? p.RISK_PCT_HIGH : p.RISK_PCT;

  let contrato: Contrato | null = null;
  try {
    contrato = (await f.contratos())[p.SYMBOL] || null;
  } catch { /* sin specs: se usa el ideal */ }

  const sz = dimensionar(price, sl, lado, saldoMonedas * price, riesgo,
                         p.LEV_MAX, contrato, p.SL_MIN_PCT, p.SL_MAX_PCT);
  if (!sz) return { ...res, decision: "NO-TRADE", side: lado, reason: "no pude dimensionar." };

  const salida: Senal = {
    ...res, decision: "TRADE", side: lado, entry: price, sl: +sl.toFixed(6),
    tp1: sz.tp1, tp2: sz.tp2, score, grade, sizing: sz,
    reason: `setup ${grade} ${lado} (score ${score}/10).`,
  };

  if (score <= 5) {
    salida.decision = "WATCH";
    salida.reason = `setup ${grade} pero score ${score}/10 (<=5): vigilar, no entrar.`;
  } else if (!dir && score < 8) {
    salida.decision = "WATCH";
    salida.reason = `BTC sin sesgo director: solo se opera A+ (score>=8). ` +
                    `Este es ${grade} (score ${score}/10): vigilar.`;
  }
  return salida;
}

/** Zonas clave para poner alertas de precio en el exchange. */
export async function zonasClave(
  symbol: string, f: Fuente = FUENTE_BITGET,
): Promise<
  { price: number; niveles: Array<[number, string]> } | null
> {
  const m: Record<string, Metrics | null> = {};
  for (const tf of ["1D", "4H"]) {
    const velas = await f.velas(symbol, tf, 300);
    m[tf] = velas.length >= 30 ? compute(symbol, tf, velas) : null;
  }
  const m4 = m["4H"];
  if (!m4) return null;
  const price = m4.price;

  const espaciar = (lista: Array<[number, string]>, n = 2) => {
    const out: Array<[number, string]> = [];
    for (const [lv, tag] of lista) {
      if (out.every(([x]) => Math.abs(lv - x) / price > 0.008)) out.push([lv, tag]);
      if (out.length >= n) break;
    }
    return out;
  };

  const res: Array<[number, string]> = [], sop: Array<[number, string]> = [];
  for (const tf of ["4H", "1D"]) {
    const mm = m[tf];
    if (!mm) continue;
    for (const r of mm.resistances || []) {
      if (r > price * 1.004) res.push([r, `resistencia ${tf} · rompe→tendencia / rechaza→short`]);
    }
    for (const s of mm.supports || []) {
      if (s < price * 0.996) sop.push([s, `soporte ${tf} · en alcista=zona long / perder=debil`]);
    }
  }
  const niveles = [
    ...espaciar(res.sort((a, b) => a[0] - b[0])),
    ...espaciar(sop.sort((a, b) => b[0] - a[0])),
  ];
  if (m4.eq) niveles.push([m4.eq, "equilibrio 4H · cambia premium↔discount"]);
  niveles.sort((a, b) => b[0] - a[0]);
  return { price, niveles };
}
