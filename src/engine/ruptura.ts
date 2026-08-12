/**
 * Regimen RUPTURA (tendencia violenta, ej. el rally de XRP nov-2024/ene-2025,
 * +69% en 46 dias) — port fiel de `engine/ruptura.py` del bot. EXCLUYENTE del
 * sistema normal (signal.ts): si esta activo, manda esta estrategia.
 *
 * Validado en Trading-B/tools/replay_ruptura.py (2023-2026, XRPUSDT): 2 episodios
 * reales en ~3 anios -> +3.19R neto. Cero disparos falsos en periodos sin ruptura.
 *
 * IMPORTANTE: cualquier cambio de reglas debe replicarse en engine/ruptura.py del
 * bot, o app y bot daran senales distintas. `npm run paridad` compara ambos.
 */
import { pivots, classifyStructure, type Candle } from "./ta.js";
import type { Metrics } from "./ta.js";

// --- deteccion de regimen ---
export const K_MULT = 1.6;
export const MIN_MOV_PCT = 8.0;
export const VENTANA_MAGNITUD = 5;
export const BASELINE_DIAS = 30;
export const PERSISTENCIA_ENTRADA = 2;
export const PERSISTENCIA_SALIDA = 4;
export const MIN_VELAS_1D = 90;

// --- gestion de riesgo de la entrada ---
export const RIESGO_INICIAL_FRAC = 0.5;
export const RIESGO_ESCALADO_FRAC = 0.5;
export const DIAS_MIN_PARA_ESCALAR = 5;
export const MOV_MIN_PARA_ESCALAR_PCT = 5.0;

// --- stop loss ---
export const ATR_MULT_SL = 1.0;
export const SL_MIN_PCT = 3.0;

export type Lado = "long" | "short";

export interface EstadoRegimen {
  activo: boolean;
  activoAyer: boolean;
  trend: string | null;
  atr1dPct: number | null;
  lado: Lado | null;
}

export interface EntradaRuptura {
  lado: Lado;
  entrada: number;
  sl: number;
  slPct: number;
  riesgoFrac: number;
  atr1dPct: number | null;
}

function truncar<T>(a: T[], n: number): T[] { return a.slice(0, n); }

function trueRange(h: number, l: number, cPrev: number): number {
  return Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev));
}

/** ATR% (Wilder) para CADA dia, calculado solo con datos hasta ese dia. */
function serieAtrPct(candles: Candle[], period = 14): (number | null)[] {
  const h = candles.map((c) => c[2]);
  const l = candles.map((c) => c[3]);
  const cl = candles.map((c) => c[4]);
  const trs = [h[0] - l[0]];
  for (let i = 1; i < cl.length; i++) trs.push(trueRange(h[i], l[i], cl[i - 1]));
  const out: (number | null)[] = new Array(cl.length).fill(null);
  if (trs.length < period) return out;
  let a = 0;
  for (let i = 0; i < period; i++) a += trs[i];
  a /= period;
  out[period - 1] = (a / cl[period - 1]) * 100;
  for (let i = period; i < trs.length; i++) {
    a = (a * (period - 1) + trs[i]) / period;
    out[i] = (a / cl[i]) * 100;
  }
  return out;
}

/** Tendencia 1D para cada dia, SOLO con velas hasta ese dia (walk-forward real). */
function serieTrend(candles: Candle[], kPivot = 3): (string | null)[] {
  const h = candles.map((c) => c[2]);
  const l = candles.map((c) => c[3]);
  const out: (string | null)[] = new Array(candles.length).fill(null);
  for (let i = kPivot * 2 + 2; i < candles.length; i++) {
    const [sh, sl] = pivots(h.slice(0, i + 1), l.slice(0, i + 1), kPivot);
    const [trend] = classifyStructure(sh, sl);
    out[i] = trend;
  }
  return out;
}

export interface ResultadoDetectar {
  activo: boolean[];
  trend: (string | null)[];
  atrPct: (number | null)[];
  lado: (string | null)[];
}

/**
 * Maquina de estados con histeresis y confirmacion en 2 pasos (fuera -> armado ->
 * confirmado -> fuera). Ver Trading-B/tools/detectar_ruptura.py para el
 * razonamiento completo -- resumen:
 *
 * 1. BASELINE 'LIMPIO': el promedio de referencia del ATR% se calcula solo con
 *    dias que NO estaban en ruptura (si no, en ~2 semanas el promedio se infla y
 *    'normaliza' un ATR% que en terminos absolutos sigue siendo brutal).
 * 2. ARMADO por VELOCIDAD, CONFIRMADO por MAGNITUD: la aceleracion sola arma la
 *    entrada; se exige ademas que el movimiento acumulado a favor del lado
 *    alcance minMovPct dentro de ventanaMag dias, o se desarma.
 * 3. La SALIDA depende solo de la aceleracion enfriandose, no de la etiqueta de
 *    estructura del dia (ruidosa dia a dia dentro del mismo movimiento).
 */
/**
 * Version 'de una pasada' (bulk), exportada para tests de paridad y para quien
 * necesite las series completas. detectar() ya es walk-forward por construccion
 * (el indice i solo usa datos hasta i), asi que llamarla UNA vez sobre todo el
 * historico y leer los arrays es correcto y evita recalcular todo el trabajo
 * previo en cada paso (ver la nota de rendimiento en Trading-B/tools/ruptura.py,
 * estado_regimen_serie -- el mismo error de llamar por dia en un loop es O(n^3)
 * aqui tambien si no se tiene cuidado).
 */
export function detectar(
  candlesEntrada: Candle[], kMult = K_MULT, minMovPct = MIN_MOV_PCT, ventanaMag = VENTANA_MAGNITUD,
  baselineVentana = BASELINE_DIAS, persistenciaEntrada = PERSISTENCIA_ENTRADA,
  persistenciaSalida = PERSISTENCIA_SALIDA,
): ResultadoDetectar {
  // getCandles() de Bitget trae los valores como string; ta.compute() ya hace
  // esta misma coercion. Se repite aqui para que detectar() sea robusto sin
  // importar si quien llama paso las velas crudas de la API o ya parseadas
  // (el fixture de paridad, por ejemplo, ya viene con numeros de Python/JSON).
  const candles = candlesEntrada.map((c) => c.map(Number) as unknown as Candle);
  const atrPct = serieAtrPct(candles);
  const trend = serieTrend(candles);
  const closes = candles.map((c) => c[4]);
  const n = candles.length;
  const activo: boolean[] = new Array(n).fill(false);
  const ladoSerie: (string | null)[] = new Array(n).fill(null);
  let estado: "fuera" | "armado" | "confirmado" = "fuera";
  let rachaEntrada = 0, rachaFrio = 0;
  let armadoEn: number | null = null, precioArmado = 0, ladoArmado: string | null = null;
  const historialCalmo: number[] = [];

  for (let i = 0; i < n; i++) {
    const ap = atrPct[i];
    const tr = trend[i];
    if (ap === null || tr === null) {
      activo[i] = estado === "confirmado";
      ladoSerie[i] = estado !== "fuera" ? ladoArmado : null;
      if (estado === "fuera" && ap !== null) historialCalmo.push(ap);
      continue;
    }
    const base = truncar(historialCalmo.slice(-baselineVentana), baselineVentana);
    if (base.length < 10) {
      activo[i] = estado === "confirmado";
      ladoSerie[i] = estado !== "fuera" ? ladoArmado : null;
      if (estado === "fuera") historialCalmo.push(ap);
      continue;
    }
    const prom = base.reduce((s, x) => s + x, 0) / base.length;
    const acelerado = ap >= kMult * prom;
    const conTendencia = tr === "ALCISTA" || tr === "BAJISTA";

    if (estado === "fuera") {
      rachaEntrada = acelerado && conTendencia ? rachaEntrada + 1 : 0;
      if (rachaEntrada >= persistenciaEntrada) {
        estado = "armado";
        armadoEn = i;
        precioArmado = closes[i];
        ladoArmado = tr;
        rachaEntrada = 0;
      }
    } else if (estado === "armado") {
      const movPct = (closes[i] / precioArmado - 1) * 100;
      const aFavor = ladoArmado === "ALCISTA" ? movPct : -movPct;
      if (aFavor >= minMovPct) {
        estado = "confirmado";
        rachaFrio = 0;
      } else if (armadoEn !== null && i - armadoEn >= ventanaMag) {
        estado = "fuera";
        armadoEn = null;
      }
    } else {
      rachaFrio = acelerado ? 0 : rachaFrio + 1;
      if (rachaFrio >= persistenciaSalida) {
        estado = "fuera";
        rachaFrio = 0;
      }
    }

    activo[i] = estado === "confirmado";
    ladoSerie[i] = estado !== "fuera" ? ladoArmado : null;
    if (estado === "fuera") historialCalmo.push(ap);
  }
  return { activo, trend, atrPct, lado: ladoSerie };
}

const LADO_MAP: Record<string, Lado> = { ALCISTA: "long", BAJISTA: "short" };

/**
 * candles1d: velas de 1D YA CERRADAS hasta el instante de evaluacion (walk-forward
 * -- quien llama debe garantizar que no incluya el futuro). Devuelve el estado del
 * regimen para el ULTIMO dia disponible, o null.
 */
export function estadoRegimen(candles1d: Candle[]): EstadoRegimen | null {
  if (candles1d.length < MIN_VELAS_1D) return null;
  const r = detectar(candles1d);
  const n = r.activo.length;
  const ladoRaw = r.lado[n - 1];
  return {
    activo: r.activo[n - 1],
    activoAyer: n > 1 ? r.activo[n - 2] : false,
    trend: r.trend[n - 1],
    atr1dPct: r.atrPct[n - 1],
    lado: ladoRaw ? LADO_MAP[ladoRaw] ?? null : null,
  };
}

/**
 * SL bajo/sobre el swing de 4H mas cercano en contra, con piso de volatilidad
 * basado en el ATR% del 1D (el de la ruptura, no el normal de mercado tranquilo).
 */
export function slEstructural(
  price: number, lado: Lado, m4: Metrics, atr1dPct: number | null,
): { sl: number; distPct: number } {
  const atr4 = m4.atr || 0;
  let sl: number;
  if (lado === "long") {
    const cands = (m4.supports || []).filter((s) => s < price);
    const raw = cands.length ? Math.max(...cands) : price * (1 - SL_MIN_PCT / 100);
    sl = raw - ATR_MULT_SL * atr4;
  } else {
    const cands = (m4.resistances || []).filter((r) => r > price);
    const raw = cands.length ? Math.min(...cands) : price * (1 + SL_MIN_PCT / 100);
    sl = raw + ATR_MULT_SL * atr4;
  }
  const floorPct = Math.max(SL_MIN_PCT, (atr1dPct || 0) * ATR_MULT_SL);
  let distPct = (Math.abs(price - sl) / price) * 100;
  if (distPct < floorPct) {
    distPct = floorPct;
    sl = lado === "long" ? price * (1 - floorPct / 100) : price * (1 + floorPct / 100);
  }
  return { sl, distPct };
}

/** Setup de la entrada INICIAL (primera tranche). null si no toca entrar. */
export function setup(estado: EstadoRegimen | null, m4: Metrics): EntradaRuptura | null {
  if (!estado || !estado.activo || estado.activoAyer || !estado.lado) return null;
  const lado = estado.lado;
  const price = m4.price;
  const { sl, distPct } = slEstructural(price, lado, m4, estado.atr1dPct);
  return { lado, entrada: price, sl, slPct: distPct,
           riesgoFrac: RIESGO_INICIAL_FRAC, atr1dPct: estado.atr1dPct };
}

/** true si toca sumar la 2a tranche: sigue confirmado y avanzo lo suficiente. */
export function debeEscalar(
  estado: EstadoRegimen | null, entrada: { lado: Lado; entrada: number },
  diasDesdeEntrada: number, precioActual: number,
): boolean {
  if (diasDesdeEntrada < DIAS_MIN_PARA_ESCALAR) return false;
  if (!estado || !estado.activo || estado.lado !== entrada.lado) return false;
  const movPct = (precioActual / entrada.entrada - 1) * 100;
  const aFavor = entrada.lado === "long" ? movPct : -movPct;
  return aFavor >= MOV_MIN_PARA_ESCALAR_PCT;
}
