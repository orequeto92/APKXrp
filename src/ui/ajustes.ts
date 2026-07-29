/**
 * Ajustes — parametros de estrategia, sincronizados con el bot.
 *
 * Editar aqui cambia el comportamiento de la app AL INSTANTE, pero no toca al bot
 * hasta que pulsas «Sincronizar». Asi puedes probar sin miedo y decidir cuando
 * propagarlo. La pantalla avisa si app y bot han quedado desalineados.
 */
import {
  actuales, guardarLocal, traerDelBot, sincronizarConBot, difieren,
  getToken, setToken, CAMPOS, DEFAULTS, RAW_URL, type Params,
} from "../config/params.js";
import { html, esc, acciones } from "./comun.js";

let remotos: Params | null = null;

export async function vistaAjustes(raiz: HTMLElement, refrescar: () => void) {
  const p = await actuales();
  const token = await getToken();

  // Comparamos con lo que el bot usa ahora mismo (si hay red).
  let aviso = "";
  try {
    remotos = await traerDelBot();
    const dif = difieren(p, remotos);
    aviso = dif.length
      ? html`<div class="card" style="border-left:3px solid var(--ambar)">
          <b>App y bot desalineados</b>
          <p class="mini">Difieren en: ${esc(dif.join(", "))}.
            Pulsa «Sincronizar» para que el bot use lo tuyo, o «Traer del bot» para lo contrario.</p>
        </div>`
      : html`<div class="card" style="border-left:3px solid var(--verde)">
          <b>App y bot sincronizados</b>
          <p class="mini">Los parámetros coinciden con los que usa el bot.</p>
        </div>`;
  } catch {
    aviso = html`<div class="card" style="border-left:3px solid var(--linea)">
      <b>Sin conexión con GitHub</b>
      <p class="mini">No pude comprobar los parámetros del bot. Los cambios se guardan
        en el teléfono y podrás sincronizarlos cuando haya red.</p>
    </div>`;
  }

  const grupos = [...new Set(CAMPOS.map((c) => c.grupo))];
  const secciones = grupos.map((g) => html`
    <div class="card">
      <h2>${esc(g)}</h2>
      ${CAMPOS.filter((c) => c.grupo === g).map((c) => html`
        <label>${esc(c.etiqueta)}</label>
        <input data-param="${esc(c.clave)}" type="number" inputmode="decimal"
               step="${c.paso ?? 0.1}" min="${c.min ?? 0}" max="${c.max ?? 999}"
               value="${(p as any)[c.clave]}">
        <p class="mini">${esc(c.ayuda)}${
          remotos && JSON.stringify((p as any)[c.clave]) !== JSON.stringify((remotos as any)[c.clave])
            ? ` · <b style="color:var(--ambar)">bot: ${esc(String((remotos as any)[c.clave]))}</b>` : ""}</p>
      `).join("")}
    </div>`).join("");

  raiz.innerHTML = html`
    ${aviso}
    ${secciones}

    <div class="card">
      <h2>Sincronización con el bot</h2>
      <p class="mini">La fuente única de verdad es <code>params.json</code> en tu repo.
        Para escribir en él hace falta un token de GitHub <b>fine-grained</b>, limitado a
        ese repositorio y con permiso <i>Contents: Read and write</i>.</p>
      <label>Token de GitHub</label>
      <input id="token" type="password" placeholder="github_pat_…"
             value="${esc(token)}" autocomplete="off">
      <p class="mini">Se guarda solo en este teléfono. Puedes revocarlo cuando quieras
        desde GitHub → Settings → Developer settings → Personal access tokens.</p>
      <div class="botones">
        <button data-accion="guardar">Guardar cambios (solo app)</button>
        <button data-accion="sincronizar">Sincronizar con el bot</button>
        <button class="sec" data-accion="traer">Traer del bot</button>
        <button class="sec" data-accion="reset">Volver a valores por defecto</button>
      </div>
      <p class="mini mt">Ver el archivo del bot:
        <a href="${esc(RAW_URL)}" target="_blank" rel="noopener">params.json</a></p>
    </div>

    <div class="card">
      <h2>Qué NO se sincroniza</h2>
      <p class="mini">Tu <b>saldo</b> y el token de Telegram no viajan al repo: es público.
        El saldo se ajusta en la pestaña Capital (y en el secret <code>BALANCE_COINS</code>
        de GitHub para el bot).</p>
    </div>`;

  const leerFormulario = (): Params => {
    const out: any = { ...p };
    raiz.querySelectorAll<HTMLInputElement>("[data-param]").forEach((el) => {
      const v = Number(el.value);
      if (!Number.isNaN(v)) out[el.dataset.param!] = v;
    });
    return out as Params;
  };

  acciones(raiz, {
    guardar: async () => {
      await guardarLocal(leerFormulario());
      await setToken((raiz.querySelector("#token") as HTMLInputElement).value);
      alert("Guardado en la app. El bot sigue con los suyos hasta que sincronices.");
      refrescar();
    },
    sincronizar: async () => {
      const nuevos = leerFormulario();
      await guardarLocal(nuevos);
      await setToken((raiz.querySelector("#token") as HTMLInputElement).value);
      try {
        alert(await sincronizarConBot(nuevos));
      } catch (e) {
        alert(`No pude sincronizar.\n${String(e)}`);
      }
      refrescar();
    },
    traer: async () => {
      try {
        const r = await traerDelBot();
        await guardarLocal(r);
        alert("Parámetros del bot cargados en la app.");
        refrescar();
      } catch (e) {
        alert(`No pude leer del bot.\n${String(e)}`);
      }
    },
    reset: async () => {
      if (!confirm("¿Volver a los valores por defecto? Solo afecta a la app.")) return;
      await guardarLocal({ ...DEFAULTS });
      refrescar();
    },
  });
}
