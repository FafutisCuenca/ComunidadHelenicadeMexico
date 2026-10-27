
"use strict";

/*
 * Comunidad Helénica de México, A.C.
 * Módulo de administración: Personas y Socios
 * Versión: 0.2.0
 *
 * Datos en memoria durante la sesión.
 * Exportar JSON para conservar los cambios.
 * Independiente del módulo de reservaciones OXI.
 */

const VERSION_MODULO = "0.2.0";
const FORMATO_DATOS = "comunidad-helenica-personas";
const VERSION_FORMATO = 2;

let personas = [];
let personaEnEdicion = null;
let mensajeTemporizador = null;

const $ = (id) => document.getElementById(id);

const ESTATUS_VALIDOS = [
  "Por revisar",
  "Vigente",
  "Inactivo",
  "No socio"
];

const TIPOS_VALIDOS = [
  "Socio",
  "Persona relacionada",
  "Participante externo"
];

const CATEGORIAS_VALIDAS = [
  "Socio",
  "Amistad",
  "Otra categoría"
];

const SUBCATEGORIAS = {
  "Socio": ["Numerario", "Honorario"],
  "Amistad": ["Filoheleno"],
  "Otra categoría": []
};

const CAMPOS_DETALLE = [
  ["tipoRegistro", "Tipo de registro"],
  ["categoria", "Categoría"],
  ["subcategoria", "Subcategoría"],
  ["estatus", "Estatus"],
  ["fechaIngreso", "Fecha de ingreso"],
  ["correo", "Correo electrónico"],
  ["telefono", "Teléfono"],
  ["domicilio", "Domicilio"],
  ["notas", "Notas"]
];

/* =========================================================
   INICIO
   ========================================================= */

document.addEventListener("DOMContentLoaded", iniciarModulo);

function iniciarModulo() {
  prepararSelectCategoria();
  conectarEventos();
  actualizarSubcategorias();
  renderizarTodo();

  mostrarMensaje(
    "Módulo listo. Importa un JSON o registra una persona. " +
    "Exporta los cambios para conservarlos.",
    "aviso"
  );
}

function conectarEventos() {
  $("btnNuevo")?.addEventListener("click", abrirFormularioNuevo);
  $("btnImportar")?.addEventListener("click", abrirSelectorArchivo);
  $("btnExportar")?.addEventListener("click", exportarJSON);

  $("archivoJson")?.addEventListener("change", importarJSON);

  $("buscar")?.addEventListener("input", renderizarTabla);
  $("filtroEstatus")?.addEventListener("change", renderizarTabla);

  $("categoria")?.addEventListener("change", actualizarSubcategorias);

  $("tipoRegistro")?.addEventListener("change", () => {
    ajustarCategoriaPorTipo();
  });

  $("personaForm")?.addEventListener("submit", guardarPersona);

  $("btnCerrarForm")?.addEventListener("click", cerrarFormulario);
  $("btnCancelar")?.addEventListener("click", cerrarFormulario);

  $("btnCerrarDetalle")?.addEventListener("click", cerrarDetalle);
  $("btnDetalleCerrar")?.addEventListener("click", cerrarDetalle);
  $("btnDetalleEditar")?.addEventListener(
    "click",
    editarPersonaDesdeDetalle
  );

  $("detalleDialog")?.addEventListener("click", (evento) => {
    if (evento.target === $("detalleDialog")) {
      cerrarDetalle();
    }
  });
}

/* =========================================================
   UTILIDADES
   ========================================================= */

function crearId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return "PER-" + window.crypto.randomUUID();
  }

  return (
    "PER-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  ).toUpperCase();
}

function textoSeguro(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  return String(valor).trim();
}

function escaparHTML(valor) {
  return textoSeguro(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buscarOpcion(valor, opciones) {
  const recibido = textoSeguro(valor).toLocaleLowerCase("es-MX");

  return opciones.find(
    (opcion) => opcion.toLocaleLowerCase("es-MX") === recibido
  ) || "";
}

function normalizarEstatus(valor) {
  return buscarOpcion(valor, ESTATUS_VALIDOS) || "Por revisar";
}

function normalizarTipo(valor) {
  return buscarOpcion(valor, TIPOS_VALIDOS) || "Persona relacionada";
}

function normalizarCategoria(valor) {
  const recibida = textoSeguro(valor);

  // Compatibilidad con categorías del formato anterior.
  if (/^socio numerario$/i.test(recibida)) {
    return "Socio";
  }

  if (/^socio honorario$/i.test(recibida)) {
    return "Socio";
  }

  if (/^socio amigo$/i.test(recibida)) {
    return "Amistad";
  }

  if (/^amigo$/i.test(recibida)) {
    return "Amistad";
  }

  return buscarOpcion(recibida, CATEGORIAS_VALIDAS) ||
    "Otra categoría";
}

function normalizarSubcategoria(categoria, valor, categoriaOriginal) {
  const recibida = textoSeguro(valor);

  // Recuperar la subcategoría cuando el JSON antiguo
  // guardaba "Socio numerario" o "Socio honorario" en categoría.
  if (/^socio numerario$/i.test(textoSeguro(categoriaOriginal))) {
    return "Numerario";
  }

  if (/^socio honorario$/i.test(textoSeguro(categoriaOriginal))) {
    return "Honorario";
  }

  if (/^filoheleno$/i.test(recibida)) {
    return categoria === "Amistad" ? "Filoheleno" : "";
  }

  return buscarOpcion(recibida, SUBCATEGORIAS[categoria] || []);
}

function nombreCompleto(persona) {
  return [
    textoSeguro(persona.nombres),
    textoSeguro(persona.apellidos)
  ].filter(Boolean).join(" ");
}

function valorCampo(id) {
  return $(id) ? textoSeguro($(id).value) : "";
}

function asignarValor(id, valor) {
  if ($(id)) {
    $(id).value = valor ?? "";
  }
}

function obtenerPersonaPorId(id) {
  return personas.find((persona) => persona.id === id) || null;
}

function fechaLocalISO() {
  const fecha = new Date();
  const desplazamiento = fecha.getTimezoneOffset() * 60000;

  return new Date(fecha.getTime() - desplazamiento)
    .toISOString()
    .slice(0, 10);
}

function normalizarPersona(datos) {
  const original = datos && typeof datos === "object" ? datos : {};

  const tipoRegistro = normalizarTipo(original.tipoRegistro);
  const categoria = normalizarCategoria(original.categoria);
  const subcategoria = normalizarSubcategoria(
    categoria,
    original.subcategoria,
    original.categoria
  );

  return {
    id: textoSeguro(original.id) || crearId(),
    nombres: textoSeguro(original.nombres),
    apellidos: textoSeguro(original.apellidos),
    tipoRegistro,
    categoria,
    subcategoria,
    estatus: normalizarEstatus(original.estatus),
    fechaIngreso: textoSeguro(original.fechaIngreso),
    correo: textoSeguro(original.correo),
    telefono: textoSeguro(original.telefono),
    domicilio: textoSeguro(original.domicilio),
    notas: textoSeguro(original.notas)
  };
}

/* =========================================================
   CATEGORÍAS Y SUBCATEGORÍAS
   ========================================================= */

function prepararSelectCategoria() {
  const select = $("categoria");

  if (!select) {
    return;
  }

  const valorAnterior = select.value;

  select.replaceChildren();

  const opcionVacia = document.createElement("option");
  opcionVacia.value = "";
  opcionVacia.textContent = "Selecciona una categoría";
  select.appendChild(opcionVacia);

  CATEGORIAS_VALIDAS.forEach((categoria) => {
    const opcion = document.createElement("option");
    opcion.value = categoria;
    opcion.textContent = categoria;
    select.appendChild(opcion);
  });

  if (CATEGORIAS_VALIDAS.includes(valorAnterior)) {
    select.value = valorAnterior;
  }
}

function actualizarSubcategorias(valorPreferido = "") {
  const selectCategoria = $("categoria");
  const selectSubcategoria = $("subcategoria");

  if (!selectSubcategoria) {
    return;
  }

  const categoria = selectCategoria?.value || "";
  const opciones = SUBCATEGORIAS[categoria] || [];

  selectSubcategoria.replaceChildren();

  const opcionVacia = document.createElement("option");
  opcionVacia.value = "";
  opcionVacia.textContent = opciones.length
    ? "Selecciona una subcategoría"
    : "Sin subcategoría";
  selectSubcategoria.appendChild(opcionVacia);

  opciones.forEach((subcategoria) => {
    const opcion = document.createElement("option");
    opcion.value = subcategoria;
    opcion.textContent = subcategoria;
    selectSubcategoria.appendChild(opcion);
  });

  selectSubcategoria.disabled = opciones.length === 0;

  if (opciones.includes(valorPreferido)) {
    selectSubcategoria.value = valorPreferido;
  } else {
    selectSubcategoria.value = "";
  }
}

function ajustarCategoriaPorTipo() {
  const tipo = valorCampo("tipoRegistro");
  const categoria = $("categoria");

  if (!categoria) {
    return;
  }

  // Proponer una categoría inicial según el tipo.
  // El usuario puede seleccionar otra si corresponde.
  if (tipo === "Socio") {
    if (!categoria.value || categoria.value === "Amistad") {
      categoria.value = "Socio";
    }
  } else if (tipo === "Persona relacionada") {
    if (!categoria.value || categoria.value === "Socio") {
      categoria.value = "Amistad";
    }
  } else if (tipo === "Participante externo") {
    if (!categoria.value || categoria.value === "Socio") {
      categoria.value = "Otra categoría";
    }
  }

  actualizarSubcategorias();
}

/* =========================================================
   MENSAJES
   ========================================================= */

function mostrarMensaje(texto, tipo = "aviso") {
  const elemento = $("mensaje");

  if (!elemento) {
    return;
  }

  if (mensajeTemporizador) {
    clearTimeout(mensajeTemporizador);
    mensajeTemporizador = null;
  }

  elemento.textContent = texto;
  elemento.className = "toast visible " + tipo;
  elemento.setAttribute("role", tipo === "error" ? "alert" : "status");
  elemento.hidden = false;

  if (tipo === "exito") {
    mensajeTemporizador = setTimeout(() => {
      elemento.className = "toast";
      elemento.textContent = "";
      elemento.hidden = true;
    }, 6000);
  }
}

/* =========================================================
   INDICADORES Y TABLA
   ========================================================= */

function renderizarTodo() {
  renderizarIndicadores();
  renderizarTabla();
}

function renderizarIndicadores() {
  const total = personas.length;

  const vigentes = personas.filter(
    (persona) => persona.estatus === "Vigente"
  ).length;

  if ($("totalRegistros")) {
    $("totalRegistros").textContent = total;
  }

  if ($("totalVigentes")) {
    $("totalVigentes").textContent = vigentes;
  }

  if ($("totalOtros")) {
    $("totalOtros").textContent = total - vigentes;
  }
}

function obtenerPersonasFiltradas() {
  const busqueda = valorCampo("buscar").toLocaleLowerCase("es-MX");
  const estatus = valorCampo("filtroEstatus");

  return personas.filter((persona) => {
    const textoBusqueda = [
      persona.id,
      persona.nombres,
      persona.apellidos,
      persona.tipoRegistro,
      persona.categoria,
      persona.subcategoria,
      persona.correo,
      persona.telefono
    ].join(" ").toLocaleLowerCase("es-MX");

    const coincideBusqueda =
      !busqueda || textoBusqueda.includes(busqueda);

    const coincideEstatus =
      !estatus || persona.estatus === estatus;

    return coincideBusqueda && coincideEstatus;
  }).sort((a, b) =>
    nombreCompleto(a).localeCompare(nombreCompleto(b), "es-MX")
  );
}

function claseEstatus(estatus) {
  switch (estatus) {
    case "Vigente":
      return "vigente";
    case "Inactivo":
      return "inactivo";
    case "No socio":
      return "no-socio";
    default:
      return "por-revisar";
  }
}

function renderizarTabla() {
  const tabla = $("tablaPersonas");

  if (!tabla) {
    return;
  }

  const filtradas = obtenerPersonasFiltradas();

  if (filtradas.length === 0) {
    const mensajeVacio = personas.length === 0
      ? "Todavía no hay registros. Selecciona «Nueva persona» o importa un JSON."
      : "No hay registros que coincidan con la búsqueda.";

    tabla.innerHTML = `
      <tr>
        <td colspan="6" class="empty">
          ${escaparHTML(mensajeVacio)}
        </td>
      </tr>
    `;
  } else {
    tabla.innerHTML = filtradas.map((persona) => {
      const idSeguro = escaparHTML(persona.id);
      const nombre = escaparHTML(nombreCompleto(persona));
      const tipo = escaparHTML(persona.tipoRegistro);
      const categoria = escaparHTML(persona.categoria);
      const subcategoria = escaparHTML(persona.subcategoria);
      const estatus = escaparHTML(persona.estatus);
      const clase = claseEstatus(persona.estatus);
      const contacto = escaparHTML(
        persona.correo || persona.telefono || "—"
      );

      return `
        <tr>
          <td>
            <div class="nombre-persona">${nombre || "Sin nombre"}</div>
            <div class="texto-secundario">${idSeguro}</div>
          </td>
          <td>${tipo}</td>
          <td>
            <div>${categoria}</div>
            ${subcategoria
              ? `<div class="texto-secundario">${subcategoria}</div>`
              : ""}
          </td>
          <td>
            <span class="etiqueta-estatus ${clase}">
              ${estatus}
            </span>
          </td>
          <td>${contacto}</td>
          <td>
            <div class="acciones-fila">
              <button
                type="button"
                class="boton-tabla"
                data-accion="detalle"
                data-id="${idSeguro}"
                aria-label="Ver detalle de ${nombre}"
              >Ver</button>
              <button
                type="button"
                class="boton-tabla"
                data-accion="editar"
                data-id="${idSeguro}"
                aria-label="Editar a ${nombre}"
              >Editar</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  tabla.querySelectorAll("button[data-accion]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const id = boton.dataset.id;
      const accion = boton.dataset.accion;

      if (accion === "detalle") {
        mostrarDetalle(id);
      } else if (accion === "editar") {
        abrirFormularioEdicion(id);
      }
    });
  });

  if ($("resultadoBusqueda")) {
    $("resultadoBusqueda").textContent =
      `${filtradas.length} de ${personas.length} registro(s)`;
  }
}

/* =========================================================
   FORMULARIO
   ========================================================= */

function abrirFormularioNuevo() {
  personaEnEdicion = null;

  $("personaForm")?.reset();

  asignarValor("personaId", "");
  asignarValor("estatus", "Por revisar");
  asignarValor("tipoRegistro", "Socio");
  asignarValor("categoria", "Socio");

  actualizarSubcategorias();
  asignarValor("subcategoria", "");

  asignarValor("fechaIngreso", fechaLocalISO());

  if ($("formEyebrow")) {
    $("formEyebrow").textContent = "Nuevo registro";
  }

  if ($("formTitulo")) {
    $("formTitulo").textContent = "Registrar persona";
  }

  mostrarFormulario();
}

function abrirFormularioEdicion(id) {
  const persona = obtenerPersonaPorId(id);

  if (!persona) {
    mostrarMensaje("No se encontró el registro seleccionado.", "error");
    return;
  }

  personaEnEdicion = persona.id;

  asignarValor("personaId", persona.id);
  asignarValor("nombres", persona.nombres);
  asignarValor("apellidos", persona.apellidos);
  asignarValor("tipoRegistro", persona.tipoRegistro);
  asignarValor("categoria", persona.categoria);

  actualizarSubcategorias(persona.subcategoria);

  asignarValor("estatus", persona.estatus);
  asignarValor("fechaIngreso", persona.fechaIngreso);
  asignarValor("correo", persona.correo);
  asignarValor("telefono", persona.telefono);
  asignarValor("domicilio", persona.domicilio);
  asignarValor("notas", persona.notas);

  if ($("formEyebrow")) {
    $("formEyebrow").textContent = "Edición de registro";
  }

  if ($("formTitulo")) {
    $("formTitulo").textContent = "Editar persona";
  }

  cerrarDetalle();
  mostrarFormulario();
}

function mostrarFormulario() {
  const panel = $("formPanel");

  if (!panel) {
    return;
  }

  panel.hidden = false;
  panel.classList.add("visible");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  const campoNombre = $("nombres");

  if (campoNombre) {
    setTimeout(() => campoNombre.focus(), 100);
  }
}

function cerrarFormulario() {
  const panel = $("formPanel");

  if (panel) {
    panel.classList.remove("visible");
    panel.hidden = true;
  }

  personaEnEdicion = null;
}

function guardarPersona(evento) {
  evento.preventDefault();

  const nombres = valorCampo("nombres");
  const apellidos = valorCampo("apellidos");

  if (!nombres || !apellidos) {
    mostrarMensaje(
      "Es necesario capturar nombres y apellidos.",
      "error"
    );
    return;
  }

  const categoria = valorCampo("categoria");
  const subcategoria = valorCampo("subcategoria");

  if (!categoria) {
    mostrarMensaje("Selecciona una categoría.", "error");
    return;
  }

  if (
    (SUBCATEGORIAS[categoria] || []).length > 0 &&
    !subcategoria
  ) {
    mostrarMensaje(
      "Selecciona una subcategoría para la categoría elegida.",
      "error"
    );
    return;
  }

  const persona = normalizarPersona({
    id: personaEnEdicion || crearId(),
    nombres,
    apellidos,
    tipoRegistro: valorCampo("tipoRegistro"),
    categoria,
    subcategoria,
    estatus: valorCampo("estatus"),
    fechaIngreso: valorCampo("fechaIngreso"),
    correo: valorCampo("correo"),
    telefono: valorCampo("telefono"),
    domicilio: valorCampo("domicilio"),
    notas: valorCampo("notas")
  });

  const indice = personas.findIndex(
    (elemento) => elemento.id === persona.id
  );

  if (indice >= 0) {
    personas[indice] = persona;
    mostrarMensaje(
      "Registro actualizado en memoria. Exporta el JSON para conservar el cambio.",
      "exito"
    );
  } else {
    personas.push(persona);
    mostrarMensaje(
      "Persona registrada en memoria. Exporta el JSON para conservar el cambio.",
      "exito"
    );
  }

  cerrarFormulario();
  renderizarTodo();
}

/* =========================================================
   DETALLE
   ========================================================= */

function mostrarDetalle(id) {
  const persona = obtenerPersonaPorId(id);

  if (!persona) {
    mostrarMensaje("No se encontró el registro seleccionado.", "error");
    return;
  }

  if ($("detalleNombre")) {
    $("detalleNombre").textContent = nombreCompleto(persona);
  }

  const campos = $("detalleCampos");

  if (campos) {
    const todosLosCampos = [
      ["Identificador", persona.id],
      ["Nombres", persona.nombres],
      ["Apellidos", persona.apellidos],
      ...CAMPOS_DETALLE.map(
        ([clave, etiqueta]) => [etiqueta, persona[clave]]
      )
    ];

    campos.innerHTML = todosLosCampos.map(([etiqueta, valor]) => `
      <dt>${escaparHTML(etiqueta)}</dt>
      <dd>${escaparHTML(valor) || "—"}</dd>
    `).join("");
  }

  const botonEditar = $("btnDetalleEditar");

  if (botonEditar) {
    botonEditar.dataset.id = persona.id;
  }

  const dialogo = $("detalleDialog");

  if (dialogo && typeof dialogo.showModal === "function") {
    if (!dialogo.open) {
      dialogo.showModal();
    }
  } else {
    mostrarMensaje(
      "Este navegador no permite abrir el detalle en una ventana.",
      "error"
    );
  }
}

function cerrarDetalle() {
  const dialogo = $("detalleDialog");

  if (dialogo?.open) {
    dialogo.close();
  }
}

function editarPersonaDesdeDetalle() {
  const id = $("btnDetalleEditar")?.dataset.id;

  if (!id) {
    return;
  }

  cerrarDetalle();
  abrirFormularioEdicion(id);
}

/* =========================================================
   IMPORTACIÓN JSON
   ========================================================= */

function abrirSelectorArchivo() {
  const selector = $("archivoJson");

  if (selector) {
    selector.value = "";
    selector.click();
  }
}

async function importarJSON(evento) {
  const archivo = evento.target.files?.[0];

  if (!archivo) {
    return;
  }

  try {
    const contenido = await archivo.text();
    const datos = JSON.parse(contenido);

    let registros;

    if (Array.isArray(datos)) {
      registros = datos;
    } else if (datos && Array.isArray(datos.personas)) {
      registros = datos.personas;
    } else {
      throw new Error(
        "El JSON debe contener un arreglo de personas o una propiedad «personas»."
      );
    }

    if (!registros.every(
      (registro) =>
        registro &&
        typeof registro === "object" &&
        !Array.isArray(registro)
    )) {
      throw new Error(
        "El archivo contiene registros con formato incorrecto."
      );
    }

    const normalizadas = registros.map(normalizarPersona);
    const ids = normalizadas.map((persona) => persona.id);

    if (new Set(ids).size !== ids.length) {
      throw new Error(
        "El archivo contiene identificadores duplicados. No se importó."
      );
    }

    if (normalizadas.some(
      (persona) => !persona.nombres || !persona.apellidos
    )) {
      throw new Error(
        "Todos los registros deben tener nombres y apellidos. No se importó el archivo."
      );
    }

    const confirmar = window.confirm(
      `El archivo contiene ${normalizadas.length} registro(s).\n\n` +
      "La importación reemplazará los registros que están en memoria. " +
      "Si tienes cambios sin exportar, se perderán.\n\n" +
      "¿Deseas continuar?"
    );

    if (!confirmar) {
      return;
    }

    personas = normalizadas;
    cerrarFormulario();
    cerrarDetalle();
    renderizarTodo();

    mostrarMensaje(
      `Importación correcta: ${personas.length} registro(s) cargados. ` +
      "Revisa las categorías y exporta el JSON actualizado.",
      "exito"
    );
  } catch (error) {
    mostrarMensaje(
      "No se pudo importar el archivo: " + error.message,
      "error"
    );
  } finally {
    evento.target.value = "";
  }
}

/* =========================================================
   EXPORTACIÓN JSON
   ========================================================= */

function exportarJSON() {
  const documento = {
    formato: FORMATO_DATOS,
    version_formato: VERSION_FORMATO,
    version_modulo: VERSION_MODULO,
    exportado_en: new Date().toISOString(),
    cantidad_registros: personas.length,
    personas: personas.map((persona) => ({ ...persona }))
  };

  const contenido = JSON.stringify(documento, null, 2);

  const archivo = new Blob(
    [contenido],
    { type: "application/json;charset=utf-8" }
  );

  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = `personas-socios-${fechaLocalISO()}.json`;

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  mostrarMensaje(
    "Se generó la descarga del JSON. Guarda el archivo en una ubicación privada y segura.",
    "exito"
  );
}
