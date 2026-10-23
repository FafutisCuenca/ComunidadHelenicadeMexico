
/*
 * Comunidad Helénica de México A.C.
 * Validador de cuotas y beneficios - OXI 2026
 *
 * Este archivo valida la configuración y realiza cálculos de prueba.
 * No registra asistentes, pagos ni información personal.
 */

(function () {
  "use strict";

  const RUTA_CONFIGURACION =
    "./config/reglas-pagos-oxi-2026.json";

  const resultados = [];

  function comprobar(nombre, condicion, detalle) {
    resultados.push({
      prueba: nombre,
      resultado: condicion ? "CORRECTO" : "ERROR",
      detalle: detalle || ""
    });
  }

  function esImporteValido(valor) {
    return Number.isFinite(valor) && valor >= 0;
  }

  function calcularImporte(adultos, ninos, tarifas) {
    if (
      !Number.isInteger(adultos) ||
      !Number.isInteger(ninos) ||
      adultos < 0 ||
      ninos < 0
    ) {
      throw new Error("Las cantidades deben ser enteros no negativos.");
    }

    return (
      adultos * tarifas.adulto.importe +
      ninos * tarifas.nino_3_a_8.importe
    );
  }

  function aplicarBeneficio(importe, beneficio) {
    if (!beneficio) return importe;

    if (beneficio.tipo === "porcentaje") {
      if (
        !Number.isFinite(beneficio.valor) ||
        beneficio.valor < 0 ||
        beneficio.valor > 100
      ) {
        throw new Error("Porcentaje de beneficio inválido.");
      }

      return importe * (1 - beneficio.valor / 100);
    }

    if (beneficio.tipo === "importe_fijo") {
      return beneficio.valor;
    }

    throw new Error("Tipo de beneficio desconocido.");
  }

  function validarConfiguracion(config) {
    comprobar(
      "Identificador del evento",
      config.evento_id === "OXI-2026",
      config.evento_id || "No definido"
    );

    comprobar(
      "Tarifa de adulto",
      esImporteValido(config.tarifas?.adulto?.importe) &&
        config.tarifas.adulto.importe === 700,
      "Debe ser $700 MXN"
    );

    comprobar(
      "Tarifa infantil",
      esImporteValido(config.tarifas?.nino_3_a_8?.importe) &&
        config.tarifas.nino_3_a_8.importe === 350,
      "Debe ser $350 MXN"
    );

    comprobar(
      "Rango de edad infantil",
      config.tarifas?.nino_3_a_8?.edad_minima === 3 &&
        config.tarifas?.nino_3_a_8?.edad_maxima === 8,
      "De 3 a 8 años"
    );

    const beneficios = Array.isArray(config.beneficios)
      ? config.beneficios
      : [];

    const ids = beneficios.map((beneficio) => beneficio.id);
    const idsUnicos = new Set(ids);

    comprobar(
      "Identificadores de beneficios únicos",
      ids.length === idsUnicos.size,
      "No debe haber IDs repetidos"
    );

    const ithaki = beneficios.find((b) => b.id === "ITHAKI_50");
    const egeo = beneficios.find((b) => b.id === "EGEO_50");
    const cortesia = beneficios.find((b) => b.id === "CORTESIA");

    comprobar(
      "Beneficio ITHAKI",
      Boolean(
        ithaki &&
        ithaki.tipo === "porcentaje" &&
        ithaki.valor === 50 &&
        ithaki.aplicable_a?.includes("adulto") &&
        ithaki.requiere_autorizacion === true
      ),
      "50% para adultos, sujeto a autorización"
    );

    comprobar(
      "Beneficio EGEO",
      Boolean(
        egeo &&
        egeo.tipo === "porcentaje" &&
        egeo.valor === 50 &&
        egeo.aplicable_a?.includes("adulto") &&
        egeo.requiere_autorizacion === true
      ),
      "50% para adultos, sujeto a autorización"
    );

    comprobar(
      "Reglas de cortesía",
      Boolean(
        cortesia &&
        cortesia.tipo === "importe_fijo" &&
        cortesia.valor === 0 &&
        cortesia.requiere_autorizacion === true &&
        cortesia.requiere_motivo === true &&
        cortesia.requiere_control_cantidad === true
      ),
      "Debe exigir autorización, motivo y control de cantidad"
    );

    comprobar(
      "Control contra doble beneficio",
      config.reglas_calculo
        ?.evitar_doble_beneficio_por_asistente === true,
      "Cada asistente recibe como máximo un beneficio"
    );

    comprobar(
      "Conservación de tarifa original",
      config.reglas_calculo?.conservar_tarifa_original === true,
      "Debe conservarse para auditoría"
    );

    comprobar(
      "Autorización de ajustes",
      config.reglas_calculo?.registrar_autorizador === true &&
        config.reglas_calculo?.registrar_motivo_ajuste === true,
      "Debe registrarse quién autoriza y por qué"
    );

    comprobar(
      "Pagos parciales",
      config.reglas_pago?.permitir_pagos_parciales === true,
      "Se permiten abonos"
    );

    comprobar(
      "Control de sobrepagos",
      config.reglas_pago?.permitir_sobrepagos === false,
      "No se permiten pagos superiores al importe autorizado"
    );

    comprobar(
      "Boletos con saldo pendiente",
      config.reglas_pago?.generar_boleto_con_saldo_pendiente === false,
      "No deben emitirse según la regla actual"
    );

    const importePrueba = calcularImporte(
      2,
      1,
      config.tarifas
    );

    comprobar(
      "Cálculo de tarifa general",
      importePrueba === 1750,
      "2 adultos y 1 niño deben sumar $1,750 MXN"
    );

    comprobar(
      "Cálculo del beneficio ITHAKI",
      aplicarBeneficio(700, ithaki) === 350,
      "Adulto elegible: $350 MXN"
    );

    comprobar(
      "Cálculo del beneficio EGEO",
      aplicarBeneficio(700, egeo) === 350,
      "Adulto elegible: $350 MXN"
    );

    comprobar(
      "Cálculo de cortesía",
      aplicarBeneficio(700, cortesia) === 0,
      "El importe final debe ser $0 MXN"
    );

    return resultados;
  }

  function mostrarResultados() {
    const contenedor = document.getElementById("resultado-validacion");
    const resumen = document.getElementById("resumen-validacion");

    if (!contenedor || !resumen) {
      console.table(resultados);
      console.info(
        "Para visualizar los resultados, abre la página de prueba indicada en las instrucciones."
      );
      return;
    }

    contenedor.replaceChildren();

    let errores = 0;

    resultados.forEach((item) => {
      const fila = document.createElement("li");
      fila.textContent =
        item.resultado + " — " + item.prueba +
        (item.detalle ? ": " + item.detalle : "");

      if (item.resultado === "ERROR") {
        errores++;
      }

      contenedor.appendChild(fila);
    });

    resumen.textContent =
      errores === 0
        ? "Validación terminada: todas las pruebas pasaron."
        : "Validación terminada: " + errores +
          " prueba(s) requieren revisión.";

    resumen.dataset.estado = errores === 0 ? "correcto" : "error";
  }

  async function iniciarValidacion() {
    try {
      const respuesta = await fetch(RUTA_CONFIGURACION, {
        cache: "no-store"
      });

      if (!respuesta.ok) {
        throw new Error(
          "No se pudo cargar la configuración. HTTP " +
          respuesta.status
        );
      }

      const config = await respuesta.json();

      validarConfiguracion(config);
      mostrarResultados();
    } catch (error) {
      console.error("Error de validación:", error);

      const resumen = document.getElementById("resumen-validacion");

      if (resumen) {
        resumen.textContent =
          "No fue posible validar el archivo: " + error.message;
      } else {
        console.error(
          "Comprueba que el archivo exista y que el JSON sea válido."
        );
      }
    }
  }

  window.ValidarConfiguracionOXI = {
    iniciar: iniciarValidacion,
    calcularImporte: calcularImporte,
    aplicarBeneficio: aplicarBeneficio
  };
})();
