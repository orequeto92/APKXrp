/** Utilidades compartidas por las vistas. */
import { g } from "../engine/ta.js";

export const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

export function html(strings: TemplateStringsArray, ...vals: unknown[]): string {
  return strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ""), "");
}

/** Escapa texto que venga de datos, no de nuestras plantillas. */
export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Precio con la precision justa: PEPE necesita 9 decimales, BTC uno. */
export function precio(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs >= 1000) return x.toFixed(1);
  if (abs >= 1) return x.toFixed(4);
  if (abs >= 0.001) return x.toFixed(6);
  return g(x, 6);
}

export const usd = (x: number, d = 2) => `$${x.toFixed(d)}`;
export const pct = (x: number, d = 2) => `${x.toFixed(d)}%`;

/** Cantidad de unidades a teclear: 8.99e6 no sirve, hay que poder copiarlo. */
export function unidades(x: number): string {
  if (x >= 1e6) return Math.round(x).toLocaleString("es-ES");
  if (x >= 1) return String(Math.round(x * 1e6) / 1e6);
  return g(x, 6);
}

export function fecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
    + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function cargando(txt = "Consultando Bitget…"): string {
  return html`<div class="cargando"><div class="spin"></div>${esc(txt)}</div>`;
}

/** Conecta los onclick declarados como data-accion. */
export function acciones(raiz: HTMLElement, mapa: Record<string, (el: HTMLElement) => void>) {
  raiz.querySelectorAll<HTMLElement>("[data-accion]").forEach((el) => {
    const fn = mapa[el.dataset.accion!];
    if (fn) el.onclick = () => fn(el);
  });
}
