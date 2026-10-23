
"use strict";

/*
 * OXI-2026 — Intercambio JSON v2
 * Única estructura admitida: formato_version 2.
 * No recalcula ni modifica importes históricos.
 */

(() => {
  const EVENTO_ID = "OXI-2026";
  const VERSION_FORMATO = 2;
  const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024;

  let documentoActual = null;
  let borradorActual = null;

  const $ = id => document.getElementById(id);

  function mostrarEstado(mensaje, tipo = "") {
    const elemento = $("estadoJSON");
    if (!elemento) return;

    elemento.className = "mensaje" + (tipo ? " " + tipo : "");
    elemento.textContent = mensaje;
  }

  function escapar(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[caracter]);
  }

  function referencia(registro) {
    return String(registro?.reservacion_id ?? "").trim();
  }

  function validarDocumento(documento) {
    if (
      !documento ||
      typeof documento !== "object" ||
      Array.isArray(documento)
    ) {
      throw new Error("El archivo debe contener un objeto JSON.");
    }

    if (documento.formato_version !== VERSION_FORMATO) {
      throw new Error(
        "Formato incompatible. Solo se acepta formato_version 2."
      );
    }

    if (documento.evento_id !== EVENTO_ID) {
      throw new Error("El archivo no corresponde al evento OXI-2026.");
    }

    if (!Array.isArray(documento.reservaciones)) {
      throw new Error("El documento no contiene reservaciones válidas.");
    }

    const ids = new Set();

    documento.reservaciones.forEach((r, indice) => {
      const numeroRegistro = indice + 1;

      if (!r || typeof r !== "object" || Array.isArray(r)) {
        throw new Error(
          `El registro ${numeroRegistro} no es un objeto válido.`
        );
      }

      const id = referencia(r);

      if (!id) {
        throw new Error(
          `El registro ${numeroRegistro} no tiene reservacion_id.`
        );
      }

      if (ids.has(id)) {
        throw new Error(`Identificador duplicado: ${id}.`);
      }

      ids.add(id);

      for (const campo of ["adultos", "ninos"]) {
        const cantidad = Number(r[campo]);

        if (
          !Number.isInteger(cantidad) ||
          cantidad < 0
        ) {
          throw new Error(
            `El registro ${id} tiene una cantidad inválida en ${campo}.`
          );
        }
      }

      if (
        r.total_asientos_excel !== undefined &&
        r.total_asientos_excel !== null &&
        (
          !Number.isInteger(Number(r.total_asientos_excel)) ||
          Number(r.total_asientos_excel) < 0
        )
      ) {
        throw new Error(
          `El registro ${id} tiene total_asientos_excel inválido.`
        );
      }
    });

    return true;
  }

  function descargarDocumento() {
    if (!documentoActual) {
      throw new Error("Primero importa el archivo JSON v2.");
    }

    validarDocumento(documentoActual);

    const contenido = JSON.stringify(documentoActual, null, 2);
    const blob = new Blob([contenido], {
      type: "application/json;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = "reservaciones-OXI-2026-v2.json";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderizarLista() {
    const contenedor = $("listaJSON");
    if (!contenedor) return;

    if (!documentoActual || documentoActual.reservaciones.length === 0) {
      contenedor.replaceChildren();
      return;
    }

    const filas = documentoActual.reservaciones.map(r => {
      const id = referencia(r);
      const nombre = r.nombre_reservacion ?? "Sin nombre";
      const mesa = r.mesa_numero ?? "Sin mesa";
      const total = Number(
        r.total_asientos_excel ?? (Number(r.adultos || 0) + Number(r.ninos || 0))
      );
      const importe = Number(r.subtotal_excel ?? 0);

      return `<tr>
        <td>${escapar(id)}</td>
        <td>${escapar(nombre)}</td>
        <td>${escapar(total)}</td>
        <td>${escapar(mesa)}</td>
        <td>${escapar(
          new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN"
          }).format(importe)
        )}</td>
      </tr>`;
    }).join("");

    contenedor.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Identificador</th>
            <th>Reservación</th>
            <th>Asientos</th>
            <th>Mesa</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    `;
  }

  async function importarArchivo(archivo) {
    if (!archivo) return;

    if (archivo.size > MAX_ARCHIVO_BYTES) {
      mostrarEstado(
        "El archivo supera el límite de 5 MB.",
        "error"
      );
      return;
    }

    try {
      const texto = await archivo.text();
      const documento = JSON.parse(texto);

      validarDocumento(documento);

      // Se usa el documento importado completo.
      // No se reconstruyen ni recalculan los registros existentes.
      documentoActual = documento;
      borradorActual = null;

      window.oxiDocumentoV2 = documentoActual;
      window.oxiReservacionesV2 = documentoActual.reservaciones;

      renderizarLista();

      mostrarEstado(
        `JSON v2 cargado correctamente. ` +
        `${documentoActual.reservaciones.length} reservaciones. ` +
        `Los registros históricos se conservaron sin recalcular.`,
        "ok"
      );
    } catch (error) {
      mostrarEstado(
        "No se importó el archivo: " + error.message,
        "error"
      );
    }
  }

  function agregarReservacion() {
    if (!documentoActual) {
      mostrarEstado(
        "Primero importa el JSON v2 que contiene las reservaciones actuales.",
        "error"
      );
      return;
    }

    if (!borradorActual) {
      mostrarEstado(
        "Primero calcula una reservación en la sección 3.",
        "error"
      );
      return;
    }

    try {
      validarDocumento(documentoActual);

      const nueva = structuredClone(borradorActual);
      const nuevoId = referencia(nueva);

      if (!nuevoId) {
        throw new Error("La reservación nueva no tiene identificador.");
      }

      if (
        documentoActual.reservaciones.some(r => referencia(r) === nuevoId)
      ) {
        throw new Error(
          `Ya existe una reservación con el identificador ${nuevoId}. ` +
          "Vuelve a calcular la reservación para generar otro identificador."
        );
      }

      // Solo se agrega el nuevo registro. Los históricos no se editan.
      documentoActual.reservaciones.push(nueva);

      window.oxiDocumentoV2 = documentoActual;
      window.oxiReservacionesV2 = documentoActual.reservaciones;

      renderizarLista();

      mostrarEstado(
        `Reservación ${nuevoId} agregada al documento v2 en memoria. ` +
        `Total de registros: ${documentoActual.reservaciones.length}. ` +
        `Descarga el JSON para conservar los cambios.`,
        "ok"
      );
    } catch (error) {
      mostrarEstado(error.message, "error");
    }
  }

  function recibirCalculo(evento) {
    const registro = evento?.detail;

    if (!registro || typeof registro !== "object") {
      borradorActual = null;
      return;
    }

    borradorActual = registro;

    if ($("estadoJSON")) {
      mostrarEstado(
        "Reservación calculada. Para incorporarla al archivo, " +
        "pulsa «Agregar reservación calculada».",
        ""
      );
    }
  }

  function invalidarCalculo() {
    borradorActual = null;
  }

  $("archivoJSON")?.addEventListener("change", evento => {
    importarArchivo(evento.target.files?.[0]);
    evento.target.value = "";
  });

  $("agregarAlArchivo")?.addEventListener(
    "click",
    agregarReservacion
  );

  $("exportarJSON")?.addEventListener("click", () => {
    try {
      descargarDocumento();
      mostrarEstado(
        "Se solicitó la descarga del documento JSON v2 actualizado.",
        "ok"
      );
    } catch (error) {
      mostrarEstado(error.message, "error");
    }
  });

  window.addEventListener(
    "oxi:reservacion-calculada",
    recibirCalculo
  );

  window.addEventListener(
    "oxi:reservacion-invalidada",
    invalidarCalculo
  );

  mostrarEstado(
    "Importa el archivo JSON v2 antes de agregar nuevas reservaciones."
  );
})();
