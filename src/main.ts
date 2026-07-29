/**
 * Arranque y navegacion.
 *
 * La app NUNCA coloca ordenes ni maneja claves de trading: solo lee datos publicos
 * de Bitget, analiza y propone. La ejecucion es manual, en el exchange.
 */
import { cargar, estadisticas } from "./store/store.js";
import { actuales } from "./config/params.js";
import { vistaEscaner, limpiarCache } from "./ui/escaner.js";
import { vistaPosicion } from "./ui/posicion.js";
import { vistaZonas } from "./ui/zonas.js";
import { vistaCapital } from "./ui/capital.js";
import { vistaAjustes } from "./ui/ajustes.js";
import { vistaEstrategia } from "./ui/estrategia.js";
import { $, html, esc } from "./ui/comun.js";

type Tab = "escaner" | "posicion" | "zonas" | "capital" | "ajustes" | "reglas";

const TABS: Array<{ id: Tab; icono: string; nombre: string }> = [
  { id: "escaner", icono: "◎", nombre: "Escáner" },
  { id: "posicion", icono: "◈", nombre: "Posición" },
  { id: "zonas", icono: "⌁", nombre: "Zonas" },
  { id: "capital", icono: "◆", nombre: "Capital" },
  { id: "ajustes", icono: "⚙", nombre: "Ajustes" },
  { id: "reglas", icono: "❋", nombre: "Reglas" },
];

let actual: Tab = "escaner";

function horaMedellin(): string {
  return new Date().toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit",
  });
}

async function cabecera() {
  const estado = await cargar();
  const st = estadisticas(estado);
  const p = await actuales();
  $("#cabecera").innerHTML = html`
    <div>
      <div class="cab-t">${esc(p.TRADE_PAIR)}</div>
      <div class="cab-s">${esc(horaMedellin())} · Medellín${st.abierta ? " · posición abierta" : ""}</div>
    </div>
    <div class="cab-cap">
      <b>${estado.saldo.toFixed(3)}</b>
      <span>XRP</span>
    </div>`;
}

function navegacion() {
  $("#tabs").innerHTML = TABS.map((t) => html`
    <button data-tab="${t.id}" class="${t.id === actual ? "activo" : ""}">
      <span class="ico">${t.icono}</span><span>${esc(t.nombre)}</span>
    </button>`).join("");

  $("#tabs").querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
    b.onclick = () => {
      const destino = b.dataset.tab as Tab;
      if (destino === actual) return;
      actual = destino;
      if (destino === "escaner") limpiarCache();
      pintar();
    };
  });
}

async function pintar() {
  await cabecera();
  navegacion();
  const raiz = $("#vista");
  raiz.scrollTop = 0;
  switch (actual) {
    case "escaner": return vistaEscaner(raiz, pintar);
    case "posicion": return vistaPosicion(raiz, pintar);
    case "zonas": return vistaZonas(raiz, pintar);
    case "capital": return vistaCapital(raiz, pintar);
    case "ajustes": return vistaAjustes(raiz, pintar);
    case "reglas": return vistaEstrategia(raiz);
  }
}

pintar();
