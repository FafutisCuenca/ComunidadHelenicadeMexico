
/**
 * Validador del catalogo institucional de proveedores.
 * Archivo: js/validar-proveedores.js
 *
 * Depende de js/proveedores.js.
 * No modifica archivos ni registros.
 */

import {
  cargarCatalogoProveedores,
  validarCatalogoProveedores
} from "./proveedores.js";

/**
 * Ejecuta la validacion completa del catalogo.
 *
 * Resultado:
 * {
 *   correcto: true/false,
 *   resumen: {},
 *   errores: [],
 *   advertencias: []
 * }
 */
export async function ejecutarValidacionProveedores() {
  const errores = [];
  const advertencias = [];

  try {
    // Cargar el catalogo central.
    const catalogo = await cargarCatalogoProveedores({
      recargar: true
    });

    // Validar estructura, identificadores y relaciones.
    errores.push(...validarCatalogoProveedores(catalogo));

    const proveedores = Array.isArray(catalogo.proveedores)
      ? catalogo.proveedores
      : [];

    const servicios = Array.isArray(catalogo.servicios)
      ? catalogo.servicios
      : [];

    const proveedoresPorId = new Map(
      proveedores.map((proveedor) => [
        proveedor.id,
        proveedor
      ])
    );

    // Comprobar informacion de proveedores.
    proveedores.forEach((proveedor, indice) => {
      const referencia = `Proveedor ${indice + 1}`;

      if (!proveedor.nombre || !proveedor.nombre.trim()) {
        errores.push(`${referencia}: falta el nombre.`);
      }

      if (
        proveedor.estado === "activo" &&
        proveedor.fecha_baja
      ) {
        advertencias.push(
          `${referencia}: esta activo, pero conserva una fecha de baja.`
        );
      }

      if (
        proveedor.estado === "inactivo" &&
        !proveedor.fecha_baja
      ) {
        advertencias.push(
          `${referencia}: esta inactivo y no tiene fecha de baja registrada.`
        );
      }

      if (!proveedor.categoria) {
        advertencias.push(
          `${referencia}: no tiene una categoria asignada.`
        );
      }
    });

    // Comprobar servicios y sus proveedores relacionados.
    servicios.forEach((servicio, indice) => {
      const referencia = `Servicio ${indice + 1}`;
      const proveedor = proveedoresPorId.get(
        servicio.proveedor_id
      );

      if (!proveedor) {
        errores.push(
          `${referencia}: no se encontro el proveedor relacionado.`
        );
        return;
      }

      if (
        servicio.activo === true &&
        proveedor.estado !== "activo"
      ) {
        advertencias.push(
          `${referencia}: esta activo, pero su proveedor "${proveedor.nombre}" esta inactivo.`
        );
      }

      if (
        servicio.precio_referencial === null ||
        servicio.precio_referencial === undefined
      ) {
        advertencias.push(
          `${referencia}: no tiene precio referencial registrado.`
        );
      }
    });

    const proveedoresActivos = proveedores.filter(
      (proveedor) => proveedor.estado === "activo"
    ).length;

    const proveedoresInactivos = proveedores.filter(
      (proveedor) => proveedor.estado === "inactivo"
    ).length;

    const serviciosActivos = servicios.filter(
      (servicio) => servicio.activo === true
    ).length;

    const serviciosInactivos = servicios.filter(
      (servicio) => servicio.activo === false
    ).length;

    return {
      correcto: errores.length === 0,
      fecha_validacion: new Date().toISOString(),

      resumen: {
        total_proveedores: proveedores.length,
        proveedores_activos: proveedoresActivos,
        proveedores_inactivos: proveedoresInactivos,
        total_servicios: servicios.length,
        servicios_activos: serviciosActivos,
        servicios_inactivos: serviciosInactivos,
        total_errores: errores.length,
        total_advertencias: advertencias.length
      },

      errores,
      advertencias
    };
  } catch (error) {
    return {
      correcto: false,
      fecha_validacion: new Date().toISOString(),

      resumen: {
        total_proveedores: 0,
        proveedores_activos: 0,
        proveedores_inactivos: 0,
        total_servicios: 0,
        servicios_activos: 0,
        servicios_inactivos: 0,
        total_errores: 1,
        total_advertencias: 0
      },

      errores: [
        error instanceof Error
          ? error.message
          : String(error)
      ],

      advertencias: []
    };
  }
}

/**
 * Ejecuta la validacion e imprime un reporte en la consola
 * del navegador.
 */
export async function mostrarReporteValidacionProveedores() {
  const resultado = await ejecutarValidacionProveedores();

  console.group("Validacion del catalogo de proveedores");

  console.log(
    resultado.correcto
      ? "RESULTADO: CORRECTO"
      : "RESULTADO: CON ERRORES"
  );

  console.table(resultado.resumen);

  if (resultado.errores.length > 0) {
    console.error("Errores encontrados:");
    resultado.errores.forEach((error) => {
      console.error("- " + error);
    });
  }

  if (resultado.advertencias.length > 0) {
    console.warn("Advertencias:");
    resultado.advertencias.forEach((advertencia) => {
      console.warn("- " + advertencia);
    });
  }

  if (
    resultado.errores.length === 0 &&
    resultado.advertencias.length === 0
  ) {
    console.log(
      "El catalogo paso todas las validaciones."
    );
  }

  console.groupEnd();

  return resultado;
}
