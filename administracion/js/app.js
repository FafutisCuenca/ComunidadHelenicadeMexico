"use strict";

/*
 * Comunidad Helénica de México, A.C.
 * Módulo de administración: Personas y Socios
 * Versión: 0.3.0
 *
 * Directorio de personas:
 * - Datos en memoria durante la sesión.
 * - Importación y exportación independiente del padrón JSON.
 *
 * Configuración de cuotas:
 * - Cuota general por ejercicio anual.
 * - Configuración independiente del padrón.
 * - Importación y exportación de JSON.
 * - Sin base de datos ni persistencia automática.
 *
 * Independiente del módulo de reservaciones OXI.
 */

const VERSION_MODULO = "0.3.0";

const FORMATO_DATOS = "comunidad-helenica-personas";
const VERSION_FORMATO = 2;

const FORMATO_CUOTAS = "comunidad-helenica-cuotas";
const VERSION_FORMATO_CUOTAS = 1;

const MONEDA_CUOTAS = "MXN";

let personas = [];
let personaEnEdicion = null;
let mensajeTemporizador = null;

let cuotasAnuales = crearCuotasIniciales();
let anioCuotaEnEdicion = null;
let cuotasImportadas = false;
let cuotasPendientesExportar = true;

// Datos del respaldo maestro: solo viven en memoria durante esta sesión.
let cuotasSocioAnuales = [];
let movimientosPago = [];
let reglasMaestro = {
  cuota_general_habilitada: true,
  cuotas_por_categoria_habilitadas: false,
  excepciones_individuales_habilitadas: false
};

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
  renderizarCuotas();

  mostrarMensaje(
    "Módulo listo. Los cambios se conservan mediante archivos JSON.",
    "aviso"
  );
}

function conectarEventos() {
  /* Directorio */

  $("btnNuevo")?.addEventListener("click", abrirFormularioNuevo);
  $("btnImportar")?.addEventListener("click", abrirSelectorArchivo);
  $("btnExportar")?.addEventListener("click", exportarJSON);

  $("archivoJson")?.addEventListener("change", importarJSON);

  $("buscar")?.addEventListener("input", renderizarTabla);
  $("filtroEstatus")?.addEventListener("change", renderizarTabla);

  $("categoria")?.addEventListener("change", actualizarSubcategorias);

  $("tipoRegistro")?.addEventListener("change", ajustarCategoriaPorTipo);

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

  /* Configuración de cuotas */

  $("cuotaForm")?.addEventListener("submit", guardarCuotaAnual);

  $("btnCancelarEdicionCuota")?.addEventListener(
    "click",
    limpiarFormularioCuota
  );

  $("btnImportarCuotas")?.addEventListener(
    "click",
    abrirSelectorCuotas
  );

  $("btnExportarCuotas")?.addEventListener(
    "click",
    exportarCuotasJSON
  );

  $("archivoCuotasJson")?.addEventListener(
    "change",
    importarCuotasJSON
  );

  $("tablaCuotasAnuales")?.addEventListener("click", (evento) => {
    const boton = evento.target.closest("button[data-accion]");

    if (!boton) {
      return;
    }

    if (boton.dataset.accion === "editar-cuota") {
      editarCuotaAnual(boton.dataset.anio);
    }
  });

  /* Respaldo maestro de la comunidad */
  const btnImportarMaestro = $("btnImportarMaestro");
  const btnExportarMaestro = $("btnExportarMaestro");
  const archivoMaestroJson = $("archivoMaestroJson");

  btnImportarMaestro?.addEventListener("click", () => {
    if (!archivoMaestroJson) {
      mostrarMensaje(
        "No se encontró el selector archivoMaestroJson en index.html.",
        "error"
      );
      return;
    }
    archivoMaestroJson.value = "";
    archivoMaestroJson.click();
  });

  btnExportarMaestro?.addEventListener("click", exportarMaestroJSON);
  archivoMaestroJson?.addEventListener("change", importarMaestroJSON);

  if (!btnImportarMaestro || !btnExportarMaestro || !archivoMaestroJson) {
    console.warn(
      "Respaldo maestro: revisa los IDs btnImportarMaestro, btnExportarMaestro y archivoMaestroJson en index.html."
    );
  }
}

/* =========================================================
   UTILIDADES GENERALES
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
   INDICADORES Y TABLA DEL DIRECTORIO
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
        <td colspan="6" class="empty-state">
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
   FORMULARIO DE PERSONAS
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
   DETALLE DE PERSONAS
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
   IMPORTACIÓN DEL PADRÓN JSON
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
      if (
        datos.formato &&
        datos.formato !== FORMATO_DATOS
      ) {
        throw new Error(
          "El archivo no corresponde al formato del padrón de personas."
        );
      }

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
      "Exporta el JSON si realizas modificaciones.",
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
   EXPORTACIÓN DEL PADRÓN JSON
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

  descargarJSON(
    documento,
    `personas-socios-${fechaLocalISO()}.json`
  );

  mostrarMensaje(
    "Se generó la descarga del padrón. Verifica que el archivo quedó guardado en tu ubicación privada.",
    "exito"
  );
}

/* =========================================================
   CONFIGURACIÓN DE CUOTAS ANUALES
   ========================================================= */

/*
 * Esta configuración inicial solo vive en memoria.
 * Para conservarla después de cerrar el navegador,
 * utiliza Exportar configuración JSON.
 */
function crearCuotasIniciales() {
  return [
    {
      anio: 2028,
      monto: 2000,
      moneda: MONEDA_CUOTAS
    },
    {
      anio: 2026,
      monto: 1500,
      moneda: MONEDA_CUOTAS
    },
    {
      anio: 2025,
      monto: 1500,
      moneda: MONEDA_CUOTAS
    }
  ];
}

function normalizarCuota(datos) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw new Error("Una cuota contiene un formato incorrecto.");
  }

  const anio = Number(datos.anio);
  const monto = Number(datos.monto);
  const moneda = textoSeguro(datos.moneda || MONEDA_CUOTAS);

  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    throw new Error(
      "Cada cuota debe tener un ejercicio entero entre 2000 y 2100."
    );
  }

  if (!Number.isFinite(monto) || monto <= 0 || monto > 10000000) {
    throw new Error(
      `El importe de la cuota del ejercicio ${anio} debe ser mayor que cero y no exceder $10,000,000.`
    );
  }

  if (moneda !== MONEDA_CUOTAS) {
    throw new Error(
      `La moneda de la cuota ${anio} debe ser MXN.`
    );
  }

  return {
    anio,
    monto: Math.round((monto + Number.EPSILON) * 100) / 100,
    moneda: MONEDA_CUOTAS
  };
}

function validarListaCuotas(registros) {
  if (!Array.isArray(registros)) {
    throw new Error("La configuración debe contener una lista de cuotas.");
  }

  if (registros.length === 0) {
    throw new Error(
      "La configuración no contiene cuotas. No se reemplazaron los datos actuales."
    );
  }

  const normalizadas = registros.map(normalizarCuota);
  const ejercicios = normalizadas.map((cuota) => cuota.anio);

  if (new Set(ejercicios).size !== ejercicios.length) {
    throw new Error(
      "La configuración contiene más de una cuota para el mismo año."
    );
  }

  return normalizadas.sort((a, b) => b.anio - a.anio);
}

function obtenerCuotaPorAnio(anio) {
  return cuotasAnuales.find(
    (cuota) => cuota.anio === Number(anio)
  ) || null;
}

function formatoMoneda(monto) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: MONEDA_CUOTAS,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(monto);
}

function marcarCuotasModificadas() {
  cuotasPendientesExportar = true;
  renderizarCuotas();
}

function textoEstadoCuotas() {
  if (cuotasPendientesExportar) {
    return cuotasImportadas
      ? "Hay cambios pendientes de exportación. La configuración importada no se ha actualizado en el archivo original."
      : "Configuración en memoria. Exporta el JSON para conservar los cambios.";
  }

  if (cuotasImportadas) {
    return "Configuración cargada desde un archivo JSON. No hay cambios pendientes de exportación.";
  }

  return "Se generó la descarga de la configuración inicial. Verifica que el archivo quedó guardado.";
}

function renderizarCuotas() {
  const tabla = $("tablaCuotasAnuales");

  if (!tabla) {
    return;
  }

  const ordenadas = [...cuotasAnuales].sort(
    (a, b) => b.anio - a.anio
  );

  if (ordenadas.length === 0) {
    tabla.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">
          No hay cuotas configuradas.
        </td>
      </tr>
    `;
  } else {
    tabla.innerHTML = ordenadas.map((cuota) => `
      <tr>
        <td>${cuota.anio}</td>
        <td>${escaparHTML(formatoMoneda(cuota.monto))}</td>
        <td>${escaparHTML(cuota.moneda)}</td>
        <td>
          <div class="acciones-fila">
            <button
              type="button"
              class="boton-tabla"
              data-accion="editar-cuota"
              data-anio="${cuota.anio}"
              aria-label="Editar cuota del ejercicio ${cuota.anio}"
            >Editar</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  const resultado = $("resultadoCuotas");

  if (resultado) {
    resultado.textContent = textoEstadoCuotas();
  }
}

/* =========================================================
   ALTA Y MODIFICACIÓN DE CUOTAS
   ========================================================= */

function guardarCuotaAnual(evento) {
  evento.preventDefault();

  const anioTexto = valorCampo("configCuotaAnio");
  const montoTexto = valorCampo("configCuotaMonto");

  if (!anioTexto || !montoTexto) {
    mostrarMensaje(
      "Captura el ejercicio y el importe de la cuota.",
      "error"
    );
    return;
  }

  const cuotaRecibida = {
    anio: Number(anioTexto),
    monto: Number(montoTexto),
    moneda: MONEDA_CUOTAS
  };

  let cuota;

  try {
    cuota = normalizarCuota(cuotaRecibida);
  } catch (error) {
    mostrarMensaje(error.message, "error");
    return;
  }

  const cuotaExistente = obtenerCuotaPorAnio(cuota.anio);

  /*
   * Si estamos editando una cuota, localizamos el ejercicio original.
   * Esto permite corregir también el año sin duplicar ejercicios.
   */

  const cuotaOriginal = anioCuotaEnEdicion !== null
    ? obtenerCuotaPorAnio(anioCuotaEnEdicion)
    : null;

  if (
    anioCuotaEnEdicion !== null &&
    !cuotaOriginal
  ) {
    mostrarMensaje(
      "La cuota que intentas modificar ya no existe. Actualiza la tabla.",
      "error"
    );
    limpiarFormularioCuota();
    return;
  }

  if (
    cuotaExistente &&
    (!cuotaOriginal || cuotaExistente.anio !== cuotaOriginal.anio)
  ) {
    mostrarMensaje(
      `Ya existe una cuota para el ejercicio ${cuota.anio}. Edita la cuota existente.`,
      "error"
    );
    return;
  }

  if (cuotaOriginal) {
    const confirmar = window.confirm(
      `Se actualizará la cuota del ejercicio ${cuotaOriginal.anio}` +
      (cuotaOriginal.anio !== cuota.anio
        ? ` al ejercicio ${cuota.anio}`
        : "") +
      `.\n\nImporte anterior: ${formatoMoneda(cuotaOriginal.monto)}` +
      `\nImporte nuevo: ${formatoMoneda(cuota.monto)}` +
      "\n\nEste cambio solo modifica la configuración en memoria. " +
      "No modifica pagos ni saldos históricos.\n\n¿Deseas continuar?"
    );

    if (!confirmar) {
      return;
    }

    cuotasAnuales = cuotasAnuales.filter(
      (elemento) => elemento.anio !== cuotaOriginal.anio
    );

    cuotasAnuales.push(cuota);

    mostrarMensaje(
      "Cuota actualizada en memoria. Exporta la configuración JSON para conservar el cambio.",
      "exito"
    );
  } else {
    cuotasAnuales.push(cuota);

    mostrarMensaje(
      `Cuota del ejercicio ${cuota.anio} agregada en memoria. Exporta el JSON para conservarla.`,
      "exito"
    );
  }

  cuotasAnuales.sort((a, b) => b.anio - a.anio);

  marcarCuotasModificadas();
  limpiarFormularioCuota();
}

function editarCuotaAnual(anioTexto) {
  const anio = Number(anioTexto);
  const cuota = obtenerCuotaPorAnio(anio);

  if (!cuota) {
    mostrarMensaje(
      "No se encontró la cuota del ejercicio seleccionado.",
      "error"
    );
    return;
  }

  anioCuotaEnEdicion = cuota.anio;

  asignarValor("configCuotaAnio", cuota.anio);
  asignarValor("configCuotaMonto", cuota.monto);

  if ($("btnGuardarCuota")) {
    $("btnGuardarCuota").textContent = "Actualizar cuota";
  }

  if ($("cuotaForm")) {
    $("cuotaForm").scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  mostrarMensaje(
    `Editando la cuota del ejercicio ${cuota.anio}.`,
    "aviso"
  );

  $("configCuotaMonto")?.focus();
}
function limpiarFormularioCuota() {
  anioCuotaEnEdicion = null;

  $("cuotaForm")?.reset();

  if ($("btnGuardarCuota")) {
    $("btnGuardarCuota").textContent = "Guardar cuota anual";
  }
}

/* =========================================================
   IMPORTACIÓN DE CONFIGURACIÓN DE CUOTAS
   ========================================================= */

function abrirSelectorCuotas() {
  const selector = $("archivoCuotasJson");

  if (selector) {
    selector.value = "";
    selector.click();
  }
}

function leerConfiguracionCuotas(datos) {
  let registros;

  if (Array.isArray(datos)) {
    registros = datos;
  } else if (datos && typeof datos === "object") {
    if (
      datos.formato &&
      datos.formato !== FORMATO_CUOTAS
    ) {
      throw new Error(
        "El archivo no corresponde al formato de configuración de cuotas."
      );
    }

    if (
      Number.isInteger(datos.version_formato) &&
      datos.version_formato > VERSION_FORMATO_CUOTAS
    ) {
      throw new Error(
        "El archivo fue creado con una versión más reciente del formato. No se importó."
      );
    }

    if (Array.isArray(datos.cuotas_anuales)) {
      registros = datos.cuotas_anuales;
    } else if (Array.isArray(datos.cuotas)) {
      registros = datos.cuotas;
    } else {
      throw new Error(
        "El JSON debe contener una propiedad «cuotas_anuales» con una lista de cuotas."
      );
    }
  } else {
    throw new Error(
      "La estructura del archivo de configuración no es válida."
    );
  }

  return validarListaCuotas(registros);
}

async function importarCuotasJSON(evento) {
  const archivo = evento.target.files?.[0];

  if (!archivo) {
    return;
  }

  try {
    const contenido = await archivo.text();
    const datos = JSON.parse(contenido);

    /*
     * Se valida todo antes de modificar cuotasAnuales.
     * Si la validación falla, se conserva la configuración actual.
     */

    const cuotasValidadas = leerConfiguracionCuotas(datos);

    const confirmar = window.confirm(
      `El archivo contiene ${cuotasValidadas.length} cuota(s) anual(es).\n\n` +
      "La importación reemplazará la configuración de cuotas que está en memoria. " +
      "No modificará el padrón de personas.\n\n" +
      "Si tienes cambios de cuotas sin exportar, se perderán.\n\n" +
      "¿Deseas continuar?"
    );

    if (!confirmar) {
      return;
    }

    cuotasAnuales = cuotasValidadas;
    cuotasImportadas = true;
    cuotasPendientesExportar = false;

    limpiarFormularioCuota();
    renderizarCuotas();

    mostrarMensaje(
      `Configuración importada correctamente: ${cuotasAnuales.length} cuota(s) anual(es).`,
      "exito"
    );
  } catch (error) {
    mostrarMensaje(
      "No se pudo importar la configuración de cuotas: " + error.message,
      "error"
    );
  } finally {
    evento.target.value = "";
  }
}

/* =========================================================
   EXPORTACIÓN DE CONFIGURACIÓN DE CUOTAS
   ========================================================= */

function exportarCuotasJSON() {
  let cuotasValidadas;

  try {
    cuotasValidadas = validarListaCuotas(cuotasAnuales);
  } catch (error) {
    mostrarMensaje(
      "No se pudo exportar la configuración: " + error.message,
      "error"
    );
    return;
  }

  const documento = {
    formato: FORMATO_CUOTAS,
    version_formato: VERSION_FORMATO_CUOTAS,
    version_modulo: VERSION_MODULO,
    moneda: MONEDA_CUOTAS,
    exportado_en: new Date().toISOString(),

    reglas: {
      cuota_general_habilitada: true,
      cuotas_por_categoria_habilitadas: false,
      excepciones_individuales_habilitadas: false
    },

    cuotas_anuales: cuotasValidadas.map((cuota) => ({
      anio: cuota.anio,
      monto: cuota.monto,
      moneda: cuota.moneda
    }))
  };

  descargarJSON(
    documento,
    `configuracion-cuotas-${fechaLocalISO()}.json`
  );

  cuotasPendientesExportar = false;
  renderizarCuotas();

  mostrarMensaje(
    "Se generó la descarga de la configuración de cuotas. Verifica que el archivo quedó guardado en tu carpeta privada.",
    "exito"
  );
}

/* =========================================================
   RESPALDO MAESTRO DE LA COMUNIDAD
   Incluye padrón, cuotas generales, cuotas individuales y pagos.
   La importación valida primero y solo después sustituye la memoria.
   ========================================================= */

const FORMATO_MAESTRO = "comunidad-helenica-maestro";
const VERSION_FORMATO_MAESTRO = 1;
function validarIdsUnicos(registros, etiqueta) {
  if (!Array.isArray(registros)) {
    throw new Error(`La sección «${etiqueta}» debe ser una lista.`);
  }
  const ids = registros.map((r) => textoSeguro(r?.id));
  if (ids.some((id) => !id)) {
    throw new Error(`Todos los registros de «${etiqueta}» deben tener identificador (id).`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error(`La sección «${etiqueta}» contiene identificadores duplicados.`);
  }
  return registros;
}

function normalizarCuotaSocio(datos) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw new Error("Una cuota individual tiene una estructura incorrecta.");
  }
  const id = textoSeguro(datos.id);
  const personaId = textoSeguro(datos.personaId ?? datos.persona_id);
  const anio = Number(datos.anio ?? datos.ejercicio);
  const monto = Number(datos.monto ?? datos.importe);
  const moneda = textoSeguro(datos.moneda || MONEDA_CUOTAS);
  if (!id) throw new Error("Cada cuota individual debe incluir id.");
  if (!personaId) throw new Error(`La cuota ${id} debe incluir personaId.`);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    throw new Error(`El año de la cuota individual ${id} no es válido.`);
  }
  if (!Number.isFinite(monto) || monto < 0 || monto > 10000000) {
    throw new Error(`El monto de la cuota individual ${id} no es válido.`);
  }
  if (moneda !== MONEDA_CUOTAS) {
    throw new Error(`La cuota individual ${id} debe usar moneda MXN.`);
  }
  return { ...datos, id, personaId, anio, monto: Math.round(monto * 100) / 100, moneda };
}

function normalizarMovimientoPago(datos) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw new Error("Un movimiento de pago tiene una estructura incorrecta.");
  }
  const id = textoSeguro(datos.id);
  const personaId = textoSeguro(datos.personaId ?? datos.persona_id);
  const anio = Number(datos.anio ?? datos.ejercicio);
  const monto = Number(datos.monto ?? datos.importe);
  const moneda = textoSeguro(datos.moneda || MONEDA_CUOTAS);
  if (!id) throw new Error("Cada movimiento de pago debe incluir id.");
  if (!personaId) throw new Error(`El movimiento ${id} debe incluir personaId.`);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    throw new Error(`El año del movimiento ${id} no es válido.`);
  }
  if (!Number.isFinite(monto) || monto <= 0 || monto > 10000000) {
    throw new Error(`El monto del movimiento ${id} debe ser mayor que cero.`);
  }
  if (moneda !== MONEDA_CUOTAS) {
    throw new Error(`El movimiento ${id} debe usar moneda MXN.`);
  }
  return { ...datos, id, personaId, anio, monto: Math.round(monto * 100) / 100, moneda };
}

function validarMaestro(datos) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw new Error("El contenido JSON debe ser un objeto.");
  }
  if (datos.formato !== FORMATO_MAESTRO) {
    throw new Error(`Formato incorrecto. Se esperaba «${FORMATO_MAESTRO}».`);
  }
  if (Number(datos.version_formato) > VERSION_FORMATO_MAESTRO) {
    throw new Error("El archivo fue creado con una versión más reciente. No se importó.");
  }
  if (datos.moneda && datos.moneda !== MONEDA_CUOTAS) {
    throw new Error("La moneda del respaldo maestro debe ser MXN.");
  }
  if (!Array.isArray(datos.personas)) {
    throw new Error("El respaldo maestro debe incluir la lista «personas».");
  }
  // Revisar IDs originales antes de normalizar; así no se generan IDs silenciosamente.
  validarIdsUnicos(datos.personas, "personas");
  if (datos.personas.some((p) => !textoSeguro(p.nombres) || !textoSeguro(p.apellidos))) {
    throw new Error("Cada persona debe tener nombres y apellidos.");
  }
  const personasValidadas = datos.personas.map(normalizarPersona);
  const cuotasValidadas = validarListaCuotas(datos.cuotas_anuales);
  const cuotasIndividualesRaw = datos.cuotas_socio_anuales ?? [];
  const pagosRaw = datos.movimientos_pago ?? [];
  validarIdsUnicos(cuotasIndividualesRaw, "cuotas_socio_anuales");
  validarIdsUnicos(pagosRaw, "movimientos_pago");
  const cuotasIndividualesValidadas = cuotasIndividualesRaw.map(normalizarCuotaSocio);
  const pagosValidados = pagosRaw.map(normalizarMovimientoPago);
  const idsPersonas = new Set(personasValidadas.map((p) => p.id));
  for (const cuota of cuotasIndividualesValidadas) {
    if (!idsPersonas.has(cuota.personaId)) {
      throw new Error(`La cuota ${cuota.id} referencia una persona inexistente (${cuota.personaId}).`);
    }
  }
  for (const pago of pagosValidados) {
    if (!idsPersonas.has(pago.personaId)) {
      throw new Error(`El pago ${pago.id} referencia una persona inexistente (${pago.personaId}).`);
    }
  }
  const reglas = datos.reglas && typeof datos.reglas === "object"
    ? {
        cuota_general_habilitada: datos.reglas.cuota_general_habilitada !== false,
        cuotas_por_categoria_habilitadas: datos.reglas.cuotas_por_categoria_habilitadas === true,
        excepciones_individuales_habilitadas: datos.reglas.excepciones_individuales_habilitadas === true
      }
    : {
        cuota_general_habilitada: true,
        cuotas_por_categoria_habilitadas: false,
        excepciones_individuales_habilitadas: false
      };
  return {
    personas: personasValidadas,
    cuotasAnuales: cuotasValidadas,
    cuotasSocioAnuales: cuotasIndividualesValidadas,
    movimientosPago: pagosValidados,
    reglas
  };
}

async function importarMaestroJSON(evento) {
  const selector = evento?.target || $("archivoMaestroJson");
  const archivo = selector?.files?.[0];
  if (!archivo) return;

  try {
    const contenido = await archivo.text();
    const datos = JSON.parse(contenido);
    const validado = validarMaestro(datos);
    const confirmar = window.confirm(
      "El respaldo maestro contiene:\n" +
      `• ${validado.personas.length} persona(s)\n` +
      `• ${validado.cuotasAnuales.length} cuota(s) general(es)\n` +
      `• ${validado.cuotasSocioAnuales.length} cuota(s) individual(es)\n` +
      `• ${validado.movimientosPago.length} movimiento(s) de pago\n\n` +
      "La importación reemplazará los datos que están en memoria. " +
      "No se modificará ningún archivo publicado ni se guardará automáticamente.\n\n" +
      "¿Deseas continuar?"
    );
    if (!confirmar) return;

    // Sustitución atómica: solo ocurre después de validar todas las secciones.
    personas = validado.personas;
    cuotasAnuales = validado.cuotasAnuales;
    cuotasSocioAnuales = validado.cuotasSocioAnuales;
    movimientosPago = validado.movimientosPago;
    reglasMaestro = validado.reglas;
    cuotasImportadas = true;
    cuotasPendientesExportar = false;
    cerrarFormulario();
    cerrarDetalle();
    limpiarFormularioCuota();
    renderizarTodo();
    renderizarCuotas();
    actualizarEstadoMaestro(
      `Maestro importado correctamente. Personas: ${personas.length}; cuotas individuales: ${cuotasSocioAnuales.length}; pagos: ${movimientosPago.length}.`
    );
    mostrarMensaje("Respaldo maestro importado correctamente en memoria.", "exito");
  } catch (error) {
    actualizarEstadoMaestro("Error de importación: " + error.message, true);
    mostrarMensaje("No se pudo importar el JSON maestro: " + error.message, "error");
  } finally {
    if (selector) selector.value = "";
  }
}

function exportarMaestroJSON() {
  try {
    // Verificar integridad antes de crear el archivo.
    const personasValidadas = personas.map((p) => ({ ...p }));
    validarIdsUnicos(personasValidadas, "personas");
    const cuotasValidadas = validarListaCuotas(cuotasAnuales);
    const cuotasIndividuales = cuotasSocioAnuales.map(normalizarCuotaSocio);
    const pagos = movimientosPago.map(normalizarMovimientoPago);
    const idsPersonas = new Set(personasValidadas.map((p) => p.id));
    if (cuotasIndividuales.some((c) => !idsPersonas.has(c.personaId))) {
      throw new Error("Hay una cuota individual asociada a una persona inexistente.");
    }
    if (pagos.some((p) => !idsPersonas.has(p.personaId))) {
      throw new Error("Hay un pago asociado a una persona inexistente.");
    }
    const documento = {
      formato: FORMATO_MAESTRO,
      version_formato: VERSION_FORMATO_MAESTRO,
      version_modulo: VERSION_MODULO,
      moneda: MONEDA_CUOTAS,
      fecha_actualizacion: new Date().toISOString(),
      reglas: { ...reglasMaestro },
      personas: personasValidadas,
      cuotas_anuales: cuotasValidadas,
      cuotas_socio_anuales: cuotasIndividuales,
      movimientos_pago: pagos
    };
    descargarJSON(documento, `comunidad-helenica-maestro-${fechaLocalISO()}.json`);
    actualizarEstadoMaestro(
      `Respaldo generado: ${personas.length} persona(s), ${cuotasIndividuales.length} cuota(s) individual(es) y ${pagos.length} pago(s). Verifica que se descargó el archivo.`
    );
    mostrarMensaje("Se generó la descarga del respaldo maestro JSON.", "exito");
  } catch (error) {
    actualizarEstadoMaestro("Error al exportar: " + error.message, true);
    mostrarMensaje("No se pudo exportar el JSON maestro: " + error.message, "error");
  }
}

function actualizarEstadoMaestro(texto, esError = false) {
  const estado = $("estadoMaestro");
  if (estado) {
    estado.textContent = texto;
    estado.classList.toggle("error", esError);
    estado.setAttribute("role", esError ? "alert" : "status");
  }
  console[esError ? "error" : "info"]("Respaldo maestro: " + texto);
}

/* =========================================================
   DESCARGA COMÚN DE ARCHIVOS JSON
   ========================================================= */

function descargarJSON(documento, nombreArchivo) {
  const contenido = JSON.stringify(documento, null, 2);

  const archivo = new Blob(
    [contenido],
    { type: "application/json;charset=utf-8" }
  );

  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = nombreArchivo;

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
