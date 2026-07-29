/**
 * Motor de Analisis Tecnico - SISTEMA DE SCALPING (1m-5m)
 *
 * Port 1:1 de `Scalping Trading-Cripto/tools/ta.py`. La fuente de verdad sigue
 * siendo el Python; este fichero debe producir EXACTAMENTE los mismos numeros.
 * Cualquier cambio aqui debe ir acompanado del mismo cambio alli y de pasar
 * `npm run paridad`.
 *
 * Trampas del porte que ya estan resueltas (no las reintroduzcas):
 *   - Array.sort() en JS es lexicografico -> siempre comparador numerico.
 *   - Python `//` es division entera hacia abajo -> Math.floor.
 *   - `lista[-20:]` -> slice(-20).
 *   - `if x and y` en Python es falsy con 0 y None; aqui se replica con truthy.
 */

export type Candle = [number, number, number, number, number, number, ...unknown[]];
// [ts, open, high, low, close, volume]

export interface FibInfo {
  direccion: "alcista" | "bajista";
  niveles: Record<string, number>;
}

export interface Metrics {
  symbol: string;
  tf: string;
  n: number;
  price: number;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  vwap: number | null;
  vwap_lado: "encima" | "debajo" | null;
  vwap_dist_pct: number | null;
  vwap_velas: number;
  rsi: number | null;
  atr: number | null;
  atr_pct: number | null;
  compresion: "COMPRIMIDO" | "EXPANDIDO" | "NORMAL" | null;
  trend: string;
  tags: string[];
  bias: string;
  bias_scalp: string;
  divergences: string[];
  fvgs: Array<[string, number, number]>;
  resistances: number[];
  supports: number[];
  vol_last: number;
  vol_avg20: number;
  vol_ratio: number | null;
  vol_spike: boolean;
  zona: string | null;
  eq: number | null;
  pos_pct: number | null;
  fib_pct: number | null;
  fib_zona: string | null;
  fib: FibInfo | null;
  barrido: string | null;
  barrido_sesgo: string | null;
  barrido_nivel: number | null;
  eqh: Array<[number, number]>;
  eql: Array<[number, number]>;
  patron: [string | null, string | null];
}

const MS_DIA = 86400000;
type Pivot = [number, number]; // [indice, precio]

// ------------------------------------------------------------ indicadores base
export function ema(values: number[], period: number): (number | null)[] {
  if (values.length < period) return values.map(() => null);
  const k = 2.0 / (period + 1);
  const out: (number | null)[] = values.map(() => null);
  let sma = 0;
  for (let i = 0; i < period; i++) sma += values[i];
  sma /= period;
  out[period - 1] = sma;
  let prev = sma;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (closes.length <= period) return out;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    gains.push(Math.max(ch, 0));
    losses.push(Math.max(-ch, 0));
  }
  let avgG = 0;
  let avgL = 0;
  for (let i = 0; i < period; i++) {
    avgG += gains[i];
    avgL += losses[i];
  }
  avgG /= period;
  avgL /= period;
  const rv = (g: number, l: number) => (l === 0 ? 100.0 : 100.0 - 100.0 / (1 + g / l));
  out[period] = rv(avgG, avgL);
  for (let i = period + 1; i < closes.length; i++) {
    avgG = (avgG * (period - 1) + gains[i - 1]) / period;
    avgL = (avgL * (period - 1) + losses[i - 1]) / period;
    out[i] = rv(avgG, avgL);
  }
  return out;
}

export function atrSeries(
  highs: number[], lows: number[], closes: number[], period = 14,
): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return out;
  const trs: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < n; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  let a = 0;
  for (let i = 0; i < period; i++) a += trs[i];
  a /= period;
  out[period - 1] = a;
  for (let i = period; i < n; i++) {
    a = (a * (period - 1) + trs[i]) / period;
    out[i] = a;
  }
  return out;
}

/** VWAP anclado al inicio del dia UTC de la ultima vela. */
export function vwapSesion(
  ts: number[], highs: number[], lows: number[], closes: number[], vols: number[],
): [number | null, number] {
  if (!ts.length || !vols.length) return [null, 0];
  const dia = Math.floor(ts[ts.length - 1] / MS_DIA);
  let pv = 0;
  let vol = 0;
  let usadas = 0;
  for (let i = 0; i < closes.length; i++) {
    if (Math.floor(ts[i] / MS_DIA) !== dia) continue;
    const tp = (highs[i] + lows[i] + closes[i]) / 3.0;
    pv += tp * vols[i];
    vol += vols[i];
    usadas++;
  }
  if (vol <= 0) return [null, usadas];
  return [pv / vol, usadas];
}

export function pivots(highs: number[], lows: number[], k = 3): [Pivot[], Pivot[]] {
  const sh: Pivot[] = [];
  const sl: Pivot[] = [];
  for (let i = k; i < highs.length - k; i++) {
    let maxH = -Infinity;
    let minL = Infinity;
    for (let j = i - k; j <= i + k; j++) {
      if (highs[j] > maxH) maxH = highs[j];
      if (lows[j] < minL) minL = lows[j];
    }
    if (highs[i] === maxH && highs[i] > highs[i - 1]) sh.push([i, highs[i]]);
    if (lows[i] === minL && lows[i] < lows[i - 1]) sl.push([i, lows[i]]);
  }
  return [sh, sl];
}

export function classifyStructure(sh: Pivot[], sl: Pivot[]): [string, string[]] {
  const lastH = sh.length >= 2 ? sh.slice(-2) : [];
  const lastL = sl.length >= 2 ? sl.slice(-2) : [];
  const hh = lastH.length === 2 && lastH[1][1] > lastH[0][1];
  const lh = lastH.length === 2 && lastH[1][1] < lastH[0][1];
  const hl = lastL.length === 2 && lastL[1][1] > lastL[0][1];
  const ll = lastL.length === 2 && lastL[1][1] < lastL[0][1];
  let trend: string;
  if (hh && hl) trend = "ALCISTA";
  else if (lh && ll) trend = "BAJISTA";
  else if (hh && ll) trend = "EXPANSION";
  else if (lh && hl) trend = "CONTRACCION";
  else trend = "RANGO";
  const tags = ([["HH", hh], ["HL", hl], ["LH", lh], ["LL", ll]] as Array<[string, boolean]>)
    .filter(([, c]) => c).map(([t]) => t);
  return [trend, tags];
}

export function detectDivergence(rsis: (number | null)[], sh: Pivot[], sl: Pivot[]): string[] {
  const out: string[] = [];
  if (sh.length >= 2) {
    const [i1, p1] = sh[sh.length - 2];
    const [i2, p2] = sh[sh.length - 1];
    const r1 = rsis[i1];
    const r2 = rsis[i2];
    if (r1 && r2 && p2 > p1 && r2 < r1) {
      out.push(`BAJISTA (precio HH, RSI ${fmtF0(r1)}->${fmtF0(r2)})`);
    }
  }
  if (sl.length >= 2) {
    const [i1, p1] = sl[sl.length - 2];
    const [i2, p2] = sl[sl.length - 1];
    const r1 = rsis[i1];
    const r2 = rsis[i2];
    if (r1 && r2 && p2 < p1 && r2 > r1) {
      out.push(`ALCISTA (precio LL, RSI ${fmtF0(r1)}->${fmtF0(r2)})`);
    }
  }
  return out;
}

export function detectFvg(
  highs: number[], lows: number[], closes: number[], lookback = 40,
): Array<[string, number, number]> {
  const n = closes.length;
  const start = Math.max(2, n - lookback);
  const fvgs: Array<[string, number, number]> = [];
  const last = closes[n - 1];
  for (let i = start; i < n; i++) {
    if (highs[i - 2] < lows[i] && last > lows[i]) fvgs.push(["alcista", highs[i - 2], lows[i]]);
    if (lows[i - 2] > highs[i] && last < highs[i]) fvgs.push(["bajista", highs[i], lows[i - 2]]);
  }
  fvgs.sort((a, b) => Math.abs((a[1] + a[2]) / 2 - last) - Math.abs((b[1] + b[2]) / 2 - last));
  return fvgs.slice(0, 3);
}

/**
 * EQH / EQL: pivotes repetidos casi al mismo precio = stops acumulados = liquidez.
 * El precio tiende a ir a buscarla, asi que funciona como iman y como objetivo de TP.
 */
export function equalLevels(
  sh: Pivot[], sl: Pivot[], atr: number | null, price: number,
  tolAtr = 0.35, minToques = 2,
): { eqh: Array<[number, number]>; eql: Array<[number, number]> } {
  if (!atr || atr <= 0) return { eqh: [], eql: [] };
  const tol = atr * tolAtr;

  const agrupar = (pivotes: Pivot[]): Array<[number, number]> => {
    const niveles = pivotes.map(([, p]) => p).sort((a, b) => a - b);
    const grupos: Array<[number, number]> = [];
    let actual: number[] = [];
    const cerrar = () => {
      if (actual.length >= minToques) {
        grupos.push([actual.reduce((s, x) => s + x, 0) / actual.length, actual.length]);
      }
    };
    for (const p of niveles) {
      // se compara con el ULTIMO anadido, igual que en el Python
      if (actual.length && Math.abs(p - actual[actual.length - 1]) <= tol) actual.push(p);
      else {
        cerrar();
        actual = [p];
      }
    }
    cerrar();
    return grupos;
  };

  const eqh = agrupar(sh).filter(([n]) => n > price).sort((a, b) => (a[0] - price) - (b[0] - price));
  const eql = agrupar(sl).filter(([n]) => n < price).sort((a, b) => (price - a[0]) - (price - b[0]));
  return { eqh: eqh.slice(0, 3), eql: eql.slice(0, 3) };
}

/**
 * Distingue un BARRIDO de liquidez de una RUPTURA real de estructura.
 * Lo que decide no es la mecha, es el CIERRE.
 */
export function barridoORuptura(
  highs: number[], lows: number[], closes: number[], sh: Pivot[], sl: Pivot[], lookback = 30,
): [string | null, string | null, number | null] {
  const n = closes.length;
  if (n < 10 || (!sh.length && !sl.length)) return [null, null, null];
  const ini = Math.max(0, n - lookback);

  const candL = sl.filter(([i]) => i < n - 2);
  if (candL.length) {
    const [iPiv, nivel] = candL[candL.length - 1];
    const perforo: number[] = [];
    for (let i = Math.max(iPiv + 1, ini); i < n; i++) if (lows[i] < nivel) perforo.push(i);
    if (perforo.length) {
      const iLast = perforo[perforo.length - 1];
      if (closes[iLast] > nivel && closes[n - 1] > nivel) {
        return ["BARRIDO de minimos (limpieza)", "alcista", nivel];
      }
      if (closes[n - 1] < nivel) {
        return ["RUPTURA de minimo (cambio de estructura)", "bajista", nivel];
      }
    }
  }

  const candH = sh.filter(([i]) => i < n - 2);
  if (candH.length) {
    const [iPiv, nivel] = candH[candH.length - 1];
    const perforo: number[] = [];
    for (let i = Math.max(iPiv + 1, ini); i < n; i++) if (highs[i] > nivel) perforo.push(i);
    if (perforo.length) {
      const iLast = perforo[perforo.length - 1];
      if (closes[iLast] < nivel && closes[n - 1] < nivel) {
        return ["BARRIDO de maximos (limpieza)", "bajista", nivel];
      }
      if (closes[n - 1] > nivel) {
        return ["RUPTURA de maximo (cambio de estructura)", "alcista", nivel];
      }
    }
  }
  return [null, null, null];
}

/** Retroceso de Fibonacci del ultimo impulso. OTE = 0.618-0.786. */
export function fiboRetroceso(
  sh: Pivot[], sl: Pivot[], price: number,
): [number | null, string | null, FibInfo | null] {
  if (!sh.length || !sl.length) return [null, null, null];
  const [iH, pH] = sh[sh.length - 1];
  const [iL, pL] = sl[sl.length - 1];
  const RATIOS = [0.382, 0.5, 0.618, 0.705, 0.786];
  let pct: number;
  let niveles: Record<string, number>;
  let direccion: "alcista" | "bajista";

  if (iH > iL) {
    const previos = sl.filter(([i]) => i < iH);
    if (!previos.length) return [null, null, null];
    const base = previos[previos.length - 1][1];
    const rango = pH - base;
    if (rango <= 0) return [null, null, null];
    pct = (pH - price) / rango;
    niveles = {};
    for (const r of RATIOS) niveles[String(r)] = pH - rango * r;
    direccion = "alcista";
  } else {
    const previos = sh.filter(([i]) => i < iL);
    if (!previos.length) return [null, null, null];
    const techo = previos[previos.length - 1][1];
    const rango = techo - pL;
    if (rango <= 0) return [null, null, null];
    pct = (price - pL) / rango;
    niveles = {};
    for (const r of RATIOS) niveles[String(r)] = pL + rango * r;
    direccion = "bajista";
  }

  let zona: string;
  if (pct < 0) zona = "extension (nuevo impulso)";
  else if (pct < 0.382) zona = "retroceso superficial";
  else if (pct <= 0.618) zona = "retroceso medio";
  else if (pct <= 0.786) zona = "OTE";
  else if (pct <= 1.0) zona = "retroceso profundo";
  else zona = "estructura rota";
  return [pct, zona, { direccion, niveles }];
}

/** Patron de la ULTIMA vela. */
export function patronVela(
  o: number[], h: number[], l: number[], c: number[],
): [string | null, string | null] {
  const n = c.length;
  if (n < 2) return [null, null];
  const O = o[n - 1], H = h[n - 1], L = l[n - 1], C = c[n - 1];
  const po = o[n - 2], pc = c[n - 2];
  const cuerpo = Math.abs(C - O);
  const rango = H - L;
  if (rango <= 0) return [null, null];
  const mechaSup = H - Math.max(O, C);
  const mechaInf = Math.min(O, C) - L;
  if (C > O && pc < po && C >= po && O <= pc && cuerpo > Math.abs(pc - po)) {
    return ["ENVOLVENTE alcista", "alcista"];
  }
  if (C < O && pc > po && C <= po && O >= pc && cuerpo > Math.abs(pc - po)) {
    return ["ENVOLVENTE bajista", "bajista"];
  }
  if (cuerpo <= 0.1 * rango) return ["DOJI (indecision)", "neutral"];
  if (mechaInf >= 2 * cuerpo && mechaSup <= cuerpo) return ["HAMMER/PIN alcista", "alcista"];
  if (mechaSup >= 2 * cuerpo && mechaInf <= cuerpo) return ["SHOOTING STAR bajista", "bajista"];
  return [null, null];
}

// ------------------------------------------------------------------ compute
export function compute(symbol: string, tf: string, candles: Candle[]): Metrics | null {
  const cs = candles
    .filter((c) => c && c.length >= 5)
    .map((c) => c.map(Number) as unknown as Candle)
    .sort((a, b) => a[0] - b[0]);
  if (cs.length < 25) return null;

  const ts = cs.map((c) => c[0]);
  const o = cs.map((c) => c[1]);
  const h = cs.map((c) => c[2]);
  const l = cs.map((c) => c[3]);
  const c = cs.map((c) => c[4]);
  const v = cs[0].length > 5 ? cs.map((x) => x[5]) : cs.map(() => 0);
  const n = c.length;
  const price = c[n - 1];

  const e9 = ema(c, 9), e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200);
  const rsis = rsi(c, 14);
  const atrs = atrSeries(h, l, c, 14);
  const a = atrs[n - 1];
  const [sh, sl] = pivots(h, l, 3);
  const [trend, tags] = classifyStructure(sh, sl);
  const divs = detectDivergence(rsis, sh, sl);
  const fvgs = detectFvg(h, l, c, 40);
  const [vwap, vwN] = vwapSesion(ts, h, l, c, v);

  const E9 = e9[n - 1], E21 = e21[n - 1], E50 = e50[n - 1], E200 = e200[n - 1];

  let bias = "neutral";
  if (E50 && E200) {
    if (price > E50 && E50 > E200) bias = "alcista";
    else if (price < E50 && E50 < E200) bias = "bajista";
    else if (Math.min(E50, E200) < price && price < Math.max(E50, E200)) bias = "entre-EMAs(no-operar)";
  }

  let bias_scalp = "neutral";
  if (E9 && E21 && E50) {
    if (price > E9 && E9 > E21 && E21 > E50) bias_scalp = "alcista";
    else if (price < E9 && E9 < E21 && E21 < E50) bias_scalp = "bajista";
    else if (Math.min(E9, E21) < price && price < Math.max(E9, E21)) bias_scalp = "cruce-EMAs(no-operar)";
  }

  let vwap_lado: "encima" | "debajo" | null = null;
  let vwap_dist_pct: number | null = null;
  if (vwap) {
    vwap_dist_pct = ((price - vwap) / vwap) * 100;
    vwap_lado = price > vwap ? "encima" : "debajo";
  }

  let compresion: Metrics["compresion"] = null;
  const validos = atrs.slice(-50).filter((x): x is number => !!x);
  if (a && validos.length >= 20) {
    const media = validos.reduce((s, x) => s + x, 0) / validos.length;
    if (media > 0) {
      const ratio = a / media;
      compresion = ratio < 0.7 ? "COMPRIMIDO" : ratio > 1.5 ? "EXPANDIDO" : "NORMAL";
    }
  }

  const [fib_pct, fib_zona, fib] = fiboRetroceso(sh, sl, price);
  const [barrido, barrido_sesgo, barrido_nivel] = barridoORuptura(h, l, c, sh, sl);
  const eqlev = equalLevels(sh, sl, a, price);

  const res = sh.map(([, p]) => p).filter((p) => p > price).sort((x, y) => x - y).slice(0, 3);
  const sop = sl.map(([, p]) => p).filter((p) => p < price).sort((x, y) => y - x).slice(0, 3);
  const volAvg = v.length ? v.slice(-20).reduce((s, x) => s + x, 0) / Math.min(20, v.length) : 0;

  let zona: string | null = null;
  let eq: number | null = null;
  let pos_pct: number | null = null;
  const hiPool = sh.slice(-3).map(([, p]) => p);
  const loPool = sl.slice(-3).map(([, p]) => p);
  if (hiPool.length && loPool.length) {
    const rangoHi = Math.max(...hiPool);
    const rangoLo = Math.min(...loPool);
    if (rangoHi > rangoLo) {
      eq = (rangoHi + rangoLo) / 2.0;
      pos_pct = ((price - rangoLo) / (rangoHi - rangoLo)) * 100;
      if (pos_pct >= 75) zona = "PREMIUM-alto";
      else if (pos_pct >= 55) zona = "PREMIUM";
      else if (pos_pct <= 25) zona = "DISCOUNT-bajo";
      else if (pos_pct <= 45) zona = "DISCOUNT";
      else zona = "EQUILIBRIO";
    }
  }

  return {
    symbol, tf, n, price,
    ema9: E9, ema21: E21, ema50: E50, ema200: E200,
    vwap, vwap_lado, vwap_dist_pct, vwap_velas: vwN,
    rsi: rsis[n - 1], atr: a, atr_pct: a ? (a / price) * 100 : null,
    compresion, trend, tags, bias, bias_scalp,
    divergences: divs, fvgs,
    resistances: res, supports: sop,
    vol_last: v.length ? v[n - 1] : 0,
    vol_avg20: volAvg,
    vol_ratio: volAvg && v.length ? v[n - 1] / volAvg : null,
    vol_spike: !!(volAvg && v.length && v[n - 1] > 2 * volAvg),
    zona, eq, pos_pct,
    fib_pct, fib_zona, fib,
    barrido, barrido_sesgo, barrido_nivel,
    eqh: eqlev.eqh, eql: eqlev.eql,
    patron: patronVela(o, h, l, c),
  };
}

// ------------------------------------------------------------------ formato
/** Equivalente a `f"{x:.{p}g}"` de Python (formato %g). */
export function g(x: number | null | undefined, p = 6): string {
  if (x === null || x === undefined) return "n/d";
  if (x === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(x)));
  let s: string;
  if (exp < -4 || exp >= p) {
    s = x.toExponential(Math.max(0, p - 1));
    const [m, e] = s.split("e");
    const mant = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
    const sign = e[0] === "-" ? "-" : "+";
    const digits = e.slice(1).padStart(2, "0");
    return `${mant}e${sign}${digits}`;
  }
  s = x.toFixed(Math.max(0, p - 1 - exp));
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

function fmtF0(x: number): string {
  return x.toFixed(0);
}
