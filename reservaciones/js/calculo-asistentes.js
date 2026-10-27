
/**
 * Comunidad Helenica de Mexico
 * Reservaciones OXI 2026
 *
 * Motor de calculo individual por asistente.
 * Admite categorias adulto y menor sin exigir edad exacta.
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

    const config = await respuesta.json();

    if (
      config.evento_id !== "OXI-2026" ||
      !config.tarifas ||
      !Array.isArray(config.beneficios)
    ) {
      throw new Error(
        "La configuracion OXI no tiene la estructura esperada."
      );
    }

    // Compatibilidad con la configuracion anterior y la nueva.
    if (!config.categorias_asistente) {
      config.categorias_asistente = {
        adulto: {
          nombre: "Adulto",
          edad_minima: config.tarifas.adulto.edad_minima,
          edad_maxima: null,
          tarifa_id: "adulto"
        },
        menor: {
          nombre: "Menor",
          edad_minima: config.tarifas.nino_3_a_8.edad_minima,
          edad_maxima: config.tarifas.nino_3_a_8.edad_maxima,
          tarifa_id: "nino_3_a_8"
        }
      };
    }

    const categorias = config.categorias_asistente;

    if (
      !categorias.adulto ||
      !categorias.menor ||
      !config.tarifas[categorias.adulto.tarifa_id] ||
      !config.tarifas[categorias.menor.tarifa_id]
    ) {
      throw new Error(
        "Falta configurar las categorias o sus tarifas."
      );
    }

    configuracion = config;
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

    /*
     * Se acepta tipo_asistente: adulto o menor.
     * Tambien se acepta categoria para facilitar
     * la compatibilidad con otras pantallas.
     *
     * Si no se proporciona una categoria, se admite
     * temporalmente la edad para compatibilidad.
     */
    let tipoAsistente = String(
      datos.tipo_asistente || datos.categoria || ""
    ).trim().toLowerCase();

    let edad = null;

    if (tipoAsistente === "nino_3_a_8") {
      tipoAsistente = "menor";
    }

    if (!tipoAsistente && datos.edad !== undefined &&
        datos.edad !== null && datos.edad !== "") {
      edad = Number(datos.edad);

      if (!Number.isInteger(edad) || edad < 0) {
        throw new Error("La edad no es valida.");
      }

      if (edad >= configuracion.categorias_asistente.adulto.edad_minima) {
        tipoAsistente = "adulto";
      } else if (
        edad >= configuracion.categorias_asistente.menor.edad_minima &&
        edad <= configuracion.categorias_asistente.menor.edad_maxima
      ) {
        tipoAsistente = "menor";
      } else {
        throw new Error(
          "La tarifa para menores de la edad minima configurada no esta definida."
        );
      }
    }

    if (
      tipoAsistente !== "adulto" &&
      tipoAsistente !== "menor"
    ) {
      throw new Error(
        "Selecciona el tipo de asistente: adulto o menor."
      );
    }

    const definicionCategoria =
      configuracion.categorias_asistente[tipoAsistente];

    const tarifa =
      configuracion.tarifas[definicionCategoria.tarifa_id];

    if (
      !tarifa ||
      !Number.isFinite(tarifa.importe) ||
      tarifa.importe < 0
    ) {
      throw new Error(
        "La tarifa configurada para esta categoria no es valida."
      );
    }

    const categoriaTarifa = definicionCategoria.tarifa_id;
    const tarifaOriginal = tarifa.importe;
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

      if (!beneficio.aplicable_a.includes(categoriaTarifa)) {
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

      if (beneficio.requiere_motivo) {
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
      tipo_asistente: tipoAsistente,
      categoria: categoriaTarifa,
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
