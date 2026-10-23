
/**
 * OXI 2026 - Importacion y exportacion de reservaciones JSON.
 * Los datos se mantienen en memoria y en archivos locales.
 * Este modulo no usa base de datos ni envia informacion al servidor.
 */
(function () {
  "use strict";

  const EVENTO_ID = "OXI-2026";
  const VERSION_FORMATO = 1;
  const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024;

  let reservaciones = [];
  let borradorActual = null;

  const botonAgregar = document.getElementById("agregarAlArchivo");
  const botonExportar = document.getElementById("exportarJSON");
  const entradaArchivo = document.getElementById("archivoJSON");
  const estado = document.getElementById("estadoJSON");
  const lista = document.getElementById("listaJSON");

  function mostrarEstado(texto, error) {
    estado.className = error ? "mensaje error" : "mensaje ok";
    estado.textContent = texto;
  }

  function pesos(valor) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN"
    }).format(valor);
  }

  function numeroValido(valor) {
    return typeof valor === "number" &&
      Number.isFinite(valor) &&
      valor >= 0;
  }

  function compararImportes(a, b) {
    return numeroValido(a) &&
      numeroValido(b) &&
      Math.abs(a - b) < 0.01;
  }

  function crearId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return "OXI-" + window.crypto.randomUUID();
    }

    return "OXI-" + Date.now() + "-" +
      Math.random().toString(16).slice(2);
  }

  function actualizarLista() {
    lista.replaceChildren();

    if (reservaciones.length === 0) {
      lista.textContent = "La lista de trabajo está vacía.";
      return;
    }

    const tabla = document.createElement("table");
    const thead = document.createElement("thead");
    const encabezado = document.createElement("tr");

    ["Identificador", "Reservación", "Asistentes", "Importe"].forEach(
      texto => {
        const th = document.createElement("th");
        th.textContent = texto;
        encabezado.appendChild(th);
      }
    );

    thead.appendChild(encabezado);
    tabla.appendChild(thead);

    const tbody = document.createElement("tbody");

    reservaciones.forEach(reservacion => {
      const fila = document.createElement("tr");

      [
        reservacion.reservacion_id,
        reservacion.nombre_familia,
        String(reservacion.asistentes.length),
        pesos(reservacion.totales.importe_final)
      ].forEach(texto => {
        const td = document.createElement("td");
        td.textContent = texto;
        fila.appendChild(td);
      });

      tbody.appendChild(fila);
    });

    tabla.appendChild(tbody);
    lista.appendChild(tabla);
  }

  function validarYRecalcularReservacion(registro) {
    if (!registro || typeof registro !== "object") {
      throw new Error("Se encontró una reservación inválida.");
    }

    if (
      typeof registro.reservacion_id !== "string" ||
      !registro.reservacion_id ||
      typeof registro.nombre_familia !== "string" ||
      !registro.nombre_familia.trim() ||
      !Array.isArray(registro.asistentes) ||
      registro.asistentes.length === 0
    ) {
      throw new Error(
        "Una reservación no tiene identificador, nombre o asistentes válidos."
      );
    }

    const asistentesValidados = registro.asistentes.map(persona => {
      if (
        !persona ||
        typeof persona.nombre !== "string" ||
        !persona.nombre.trim()
      ) {
        throw new Error("Hay un asistente sin nombre válido.");
      }

      const resultado = window.CalculoAsistentesOXI.calcularAsistente({
        edad: persona.edad,
        beneficio_id: persona.beneficio_id || null,
        autorizado: persona.autorizado === true,
        autorizador: persona.autorizador || "",
        motivo: persona.motivo || ""
      });

      if (
        !compararImportes(
          persona.tarifa_original,
          resultado.tarifa_original
        ) ||
        !compararImportes(
          persona.importe_ajuste,
          resultado.importe_ajuste
        ) ||
        !compararImportes(
          persona.importe_final,
          resultado.importe_final
        )
      ) {
        throw new Error(
          "Los importes del asistente " + persona.nombre +
          " no coinciden con la configuración actual."
        );
      }

      return {
        nombre: persona.nombre.trim(),
        edad: resultado.edad,
        categoria: resultado.categoria,
        tarifa_original: resultado.tarifa_original,
        beneficio_id: resultado.beneficio_id,
        beneficio_nombre: resultado.beneficio_nombre,
        autorizado: resultado.autorizado,
        autorizador: resultado.autorizador,
        motivo: resultado.motivo,
        importe_ajuste: resultado.importe_ajuste,
        importe_final: resultado.importe_final
      };
    });

    const original = asistentesValidados.reduce(
      (suma, persona) => suma + persona.tarifa_original,
      0
    );

    const final = asistentesValidados.reduce(
      (suma, persona) => suma + persona.importe_final,
      0
    );

    if (
      !registro.totales ||
      !compararImportes(registro.totales.importe_original, original) ||
      !compararImportes(registro.totales.importe_final, final)
    ) {
      throw new Error(
        "Los totales de la reservación " +
        registro.nombre_familia + " no coinciden."
      );
    }

    return {
      reservacion_id: registro.reservacion_id,
      evento_id: EVENTO_ID,
      nombre_familia: registro.nombre_familia.trim(),
      responsable: String(registro.responsable || "").trim(),
      mesa_id: String(registro.mesa_id || ""),
      fecha_captura: String(registro.fecha_captura || ""),
      asistentes: asistentesValidados,
      totales: {
        cantidad_asistentes: asistentesValidados.length,
        importe_original: original,
        importe_ajuste: Math.round((original - final) * 100) / 100,
        importe_final: final
      }
    };
  }

  function agregarReservacion() {
    if (!borradorActual) {
      mostrarEstado(
        "Primero calcula una reservación correctamente. Después podrás agregarla a la lista.",
        true
      );
      return;
    }

    try {
      const validada = validarYRecalcularReservacion(borradorActual);
      const indice = reservaciones.findIndex(
        item => item.reservacion_id === validada.reservacion_id
      );

      if (indice >= 0) {
        reservaciones[indice] = validada;
      } else {
        reservaciones.push(validada);
      }

      actualizarLista();

      mostrarEstado(
        "Reservación agregada a la lista de trabajo. Total de reservaciones: " +
        reservaciones.length +
        ". Descarga el JSON para conservar una copia.",
        false
      );
    } catch (error) {
      mostrarEstado(error.message, true);
    }
  }

  function exportarReservaciones() {
    if (reservaciones.length === 0) {
      mostrarEstado(
        "No hay reservaciones para exportar.",
        true
      );
      return;
    }

    const documento = {
      formato_version: VERSION_FORMATO,
      evento_id: EVENTO_ID,
      exportado_en: new Date().toISOString(),
      reservaciones: reservaciones
    };

    const contenido = JSON.stringify(documento, null, 2);
    const archivo = new Blob(
      [contenido],
      { type: "application/json;charset=utf-8" }
    );

    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = "reservaciones-OXI-2026.json";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    mostrarEstado(
      "Archivo JSON generado. Guárdalo en una ubicación privada y no lo subas a GitHub.",
      false
    );
  }

  async function importarReservaciones() {
    const archivo = entradaArchivo.files[0];

    if (!archivo) {
      mostrarEstado("Selecciona un archivo JSON.", true);
      return;
    }

    if (archivo.size > MAX_ARCHIVO_BYTES) {
      mostrarEstado(
        "El archivo supera el límite de 5 MB.",
        true
      );
      entradaArchivo.value = "";
      return;
    }

    try {
      if (!window.CalculoAsistentesOXI) {
        throw new Error("No está disponible el motor de cálculo.");
      }

      await window.CalculoAsistentesOXI.iniciar();

      const documento = JSON.parse(await archivo.text());

      if (
        !documento ||
        documento.formato_version !== VERSION_FORMATO ||
        documento.evento_id !== EVENTO_ID ||
        !Array.isArray(documento.reservaciones)
      ) {
        throw new Error(
          "El archivo no tiene el formato esperado de OXI 2026."
        );
      }

      const importadas = documento.reservaciones.map(
        validarYRecalcularReservacion
      );

      const ids = new Set();

      for (const registro of importadas) {
        if (ids.has(registro.reservacion_id)) {
          throw new Error(
            "El archivo contiene identificadores de reservación duplicados."
          );
        }
        ids.add(registro.reservacion_id);
      }

      // Incorporar registros por identificador.
      // Si el ID ya existe, el registro importado lo sustituye.
      const nuevas = reservaciones.slice();

      for (const registro of importadas) {
        const indice = nuevas.findIndex(
          item => item.reservacion_id === registro.reservacion_id
        );

        if (indice >= 0) {
          nuevas[indice] = registro;
        } else {
          nuevas.push(registro);
        }
      }

      reservaciones = nuevas;
      actualizarLista();

      mostrarEstado(
        "Importación correcta. Registros validados: " +
        importadas.length +
        ". Reservaciones en la lista de trabajo: " +
        reservaciones.length +
        ".",
        false
      );
    } catch (error) {
      mostrarEstado(
        "No se importó el archivo: " + error.message,
        true
      );
    } finally {
      entradaArchivo.value = "";
    }
  }

 botonAgregar.disabled = true;

window.addEventListener("oxi:reservacion-calculada", evento => {
  borradorActual = evento.detail;
  botonAgregar.disabled = false;

  mostrarEstado(
    "Reservación calculada. Puedes agregarla a la lista de trabajo.",
    false
  );
});

window.addEventListener("oxi:reservacion-invalidada", () => {
  borradorActual = null;
  botonAgregar.disabled = true;
});
  botonAgregar.addEventListener("click", agregarReservacion);
  botonExportar.addEventListener("click", exportarReservaciones);
  entradaArchivo.addEventListener("change", importarReservaciones);

  actualizarLista();
})();
