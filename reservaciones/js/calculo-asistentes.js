
/**
 * Comunidad Helenica de Mexico
 * Reservaciones OXI 2026
 *
 * Motor de calculo individual por asistente.
 * No registra reservaciones ni pagos.
 * No almacena datos personales.
 */
(function () {
  "use strict";

  const RUTA_CONFIGURACION =
    "./config/reglas-pagos-oxi-2026.json";

  let configuracion = null;

  async function iniciar() {
    const respuesta = await fetch(RUTA_CONFIGURACION);

    if (!respuesta.ok) {
      throw new Error(
        "No se pudo cargar la configuracion de tarifas."
      );
    }

    configuracion = await respuesta.json();

    if (
      configuracion.evento_id !== "OXI-2026" ||
      !configuracion.tarifas ||
      !Array.isArray(configuracion.beneficios)
    ) {
      throw new Error(
        "La configuracion OXI no tiene la estructura esperada."
      );
    }

    return true;
  }

  function calcularAsistente(datos) {
    if (!configuracion) {
      throw new Error(
        "Primero debes ejecutar iniciar()."
      );
    }

    if (!datos || typeof datos !== "object") {
      throw new Error(
        "Los datos del asistente son obligatorios."
      );
    }

    const edad = Number(datos.edad);

    if (!Number.isInteger(edad) || edad < 0) {
      throw new Error("La edad no es valida.");
    }

    let categoria;
    let tarifaOriginal;

    if (edad >= 9) {
      categoria = "adulto";
      tarifaOriginal =
        configuracion.tarifas.adulto.importe;
    } else if (edad >= 3) {
      categoria = "nino_3_a_8";
      tarifaOriginal =
        configuracion.tarifas.nino_3_a_8.importe;
    } else {
      throw new Error(
        "La tarifa para menores de 3 anos aun no esta definida."
      );
    }

    const beneficioId = datos.beneficio_id || null;

    let beneficio = null;
    let importeFinal = tarifaOriginal;
    let importeAjuste = 0;
    let tipoAjuste = "sin_beneficio";
    let motivo = "";
    let autorizador = "";

    if (beneficioId) {
      beneficio = configuracion.beneficios.find(
        item => item.id === beneficioId
      );

      if (!beneficio) {
        throw new Error(
          "El beneficio seleccionado no existe."
        );
      }

      if (!beneficio.aplicable_a.includes(categoria)) {
        throw new Error(
          "El beneficio no aplica a esta categoria."
        );
      }

      if (
        beneficio.requiere_autorizacion &&
        datos.autorizado !== true
      ) {
        throw new Error(
          "Este beneficio requiere autorizacion."
        );
      }

      if (beneficio.requiere_autorizacion) {
        autorizador = String(
          datos.autorizador || ""
        ).trim();

        if (!autorizador) {
          throw new Error(
            "Debes indicar quien autorizo el beneficio."
          );
        }
      }

      if (
        beneficio.requiere_motivo ||
        beneficioId === "ITHAKI_50" ||
        beneficioId === "EGEO_50"
      ) {
        motivo = String(datos.motivo || "").trim();

        if (!motivo) {
          throw new Error(
            "Debes registrar el motivo del ajuste."
          );
        }
      }

      if (beneficio.tipo === "porcentaje") {
        if (
          !Number.isFinite(beneficio.valor) ||
          beneficio.valor < 0 ||
          beneficio.valor > 100
        ) {
          throw new Error(
            "El porcentaje del beneficio no es valido."
          );
        }

        importeFinal = Math.round(
          tarifaOriginal *
          (1 - beneficio.valor / 100) *
          100
        ) / 100;

        tipoAjuste = "descuento_porcentual";
      } else if (beneficio.tipo === "importe_fijo") {
        // Para esta configuracion, el importe_fijo
        // representa el precio final autorizado.
        if (
          !Number.isFinite(beneficio.valor) ||
          beneficio.valor < 0
        ) {
          throw new Error(
            "El importe final del beneficio no es valido."
          );
        }

        importeFinal = beneficio.valor;
        tipoAjuste = "importe_final_autorizado";
      } else {
        throw new Error(
          "El tipo de beneficio no esta soportado."
        );
      }

      importeFinal = Math.max(0, importeFinal);
      importeAjuste = Math.round(
        (tarifaOriginal - importeFinal) * 100
      ) / 100;
    }

    return {
      evento_id: configuracion.evento_id,
      categoria: categoria,
      edad: edad,
      tarifa_original: tarifaOriginal,
      beneficio_id: beneficioId,
      beneficio_nombre: beneficio ? beneficio.nombre : null,
      tipo_ajuste: tipoAjuste,
      importe_ajuste: importeAjuste,
      importe_final: importeFinal,
      motivo: motivo,
      autorizador: autorizador,
      autorizado: beneficio
        ? datos.autorizado === true
        : false
    };
  }

  window.CalculoAsistentesOXI = {
    iniciar,
    calcularAsistente
  };
})();
