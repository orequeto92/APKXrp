/**
 * IMPULSO.TS - Sistema EXPERIMENTAL, separado del sistema normal y de RUPTURA.
 * Port fiel de engine/impulso.py del bot.
 *
 * Reconstruido a partir de un documento externo que afirmaba +12.5R validados;
 * al reconstruirlo con datos reales y probarlo FUERA de la ventana con la que
 * fue disenado, NO mostro ventaja real (ver Trading-B/tools/validar_docx_sistema.py):
 *
 *   - Ventana ya conocida (nov-2024 -> ago-2026): +16.50R, 61% acierto (bien).
 *   - Ventana nunca antes probada (ene-2023 -> nov-2024): +0.50R en 42
 *     operaciones, esperanza +0.012 R/oper -- RUIDO, sin ventaja real.
 *   - El resultado depende de un pico muy afilado en ATR_EXP_MIN=1.25 (el valor
 *     exacto del documento); +/-0.05 lo desploma a la mitad -- sobreajuste.
 *
 * Se implementa igual, a peticion explicita del usuario (genera mas senales que
 * el sistema normal). TODA alerta/tarjeta debe marcarse EXPERIMENTAL sin
 * excepcion -- nunca presentar esto como una senal validada.
 *
 * ENTRADA (TODAS deben cumplirse, en 4H): ATR(14)/ATR(50) > 1.25, Efficiency(3
 * barras) > 0.35, RVOL > 1.3, direccion XRP(3 barras) == direccion BTC(3 barras).
 * GESTION: SL = 2.0xATR(14), TP = 3.0xATR(14). Fija, sin BE ni trailing.
 *
 * IMPORTANTE: cualquier cambio de reglas debe replicarse en engine/impulso.py
 * del bot. `npm run paridad:impulso` compara ambos.
 */
import type { Candle } from "./ta.js";

export const ATR_EXP_MIN = 1.25;
export const EFF_N = 3;
export const EFF_MIN = 0.35;
export const RVOL_N = 20;
export const RVOL_MIN = 1.3;
export const DIR_N = 3;
export const SL_MULT = 2.0;
export const TP_MULT = 3.0;
export const MIN_VELAS = 60;

export interface SeñalImpulso {
  lado: "long" | "short";
  entrada: number;
  sl: number;
  tp: number;
  atrExp: number;
  eff: number;
  rvol: number;
}

function atrWilder(candles: Candle[], period: number): number | null {
  const h = candles.map((c) => Number(c[2]));
  const l = candles.map((c) => Number(c[3]));
  const cl = candles.map((c) => Number(c[4]));
  const trs = [h[0] - l[0]];
  for (let i = 1; i < cl.length; i++) {
    trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - cl[i - 1]), Math.abs(l[i] - cl[i - 1])));
  }
  if (trs.length < period) return null;
  let a = 0;
  for (let i = 0; i < period; i++) a += trs[i];
  a /= period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

/**
 * velasSym, velasDir: velas de 4H YA CERRADAS (la ultima = la mas reciente),
 * formato [ts, open, high, low, close, vol]. Devuelve la senal o null.
 */
export function señal(velasSymEntrada: Candle[], velasDirEntrada: Candle[]): SeñalImpulso | null {
  const velasSym = velasSymEntrada.map((c) => c.map(Number) as unknown as Candle);
  const velasDir = velasDirEntrada.map((c) => c.map(Number) as unknown as Candle);
  if (velasSym.length < MIN_VELAS || velasDir.length < DIR_N + 1) return null;

  const a14 = atrWilder(velasSym, 14);
  const a50 = atrWilder(velasSym, 50);
  if (!a14 || !a50 || a50 === 0) return null;
  const atrExp = a14 / a50;
  if (atrExp <= ATR_EXP_MIN) return null;

  const cl = velasSym.slice(-EFF_N - 1).map((c) => c[4]);
  const neto = Math.abs(cl[cl.length - 1] - cl[0]);
  let camino = 0;
  for (let i = 1; i < cl.length; i++) camino += Math.abs(cl[i] - cl[i - 1]);
  const eff = camino > 0 ? neto / camino : 0;
  if (eff <= EFF_MIN) return null;

  const vols = velasSym.slice(-RVOL_N - 1, -1).map((c) => c[5]);
  const promVol = vols.length ? vols.reduce((s, x) => s + x, 0) / vols.length : 0;
  const rvol = promVol > 0 ? velasSym[velasSym.length - 1][5] / promVol : 0;
  if (rvol <= RVOL_MIN) return null;

  const dx = velasSym[velasSym.length - 1][4] - velasSym[velasSym.length - 1 - DIR_N][4];
  const db = velasDir[velasDir.length - 1][4] - velasDir[velasDir.length - 1 - DIR_N][4];
  if (dx === 0 || db === 0 || (dx > 0) !== (db > 0)) return null;

  const lado: "long" | "short" = dx > 0 ? "long" : "short";
  const price = velasSym[velasSym.length - 1][4];
  const sl = lado === "long" ? price - SL_MULT * a14 : price + SL_MULT * a14;
  const tp = lado === "long" ? price + TP_MULT * a14 : price - TP_MULT * a14;
  return { lado, entrada: price, sl, tp, atrExp, eff, rvol };
}
