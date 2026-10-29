
/**
 * Catalogo institucional de proveedores y servicios.
 * Archivo: js/proveedores.js
 *
 * Lee ../data/proveedores.json respecto a este archivo.
 * Funciona tambien cuando el sitio se publica en GitHub Pages
 * bajo la ruta de un repositorio.
 *
 * Este modulo solo consulta y valida datos.
 * Nunca modifica el archivo JSON.
 */

const URL_CATALOGO_POR_DEFECTO = new URL(
  "../data/proveedores.json",
  import.meta.url
);

let promesaCatalogo = null;
let urlCatalogoEnCache = null;

/**
 * Valida la estructura y las relaciones del catalogo.
 * Regresa una lista de errores.
 * Una lista vacia significa que paso las validaciones.
 */
export function validarCatalogoProveedores(catalogo) {
  const errores = [];

  if (
    !catalogo ||
    typeof catalogo !== "object" ||
    Array.isArray(catalogo)
  ) {
    return ["El contenido del catalogo debe ser un objeto JSON."];
  }

  if (!catalogo.metadata || typeof catalogo.metadata !== "object") {
    errores.push("Falta el objeto metadata.");
  }

  if (!catalogo.catalogos || typeof catalogo.catalogos !== "object") {
    errores.push("Falta el objeto catalogos.");
  }

  const categorias = catalogo.catalogos?.categorias_proveedor;

  if (!Array.isArray(categorias)) {
    errores.push(
      "catalogos.categorias_proveedor debe ser una lista."
    );
  }

  if (!Array.isArray(catalogo.proveedores)) {
    errores.push("proveedores debe ser una lista.");
  }

  if (!Array.isArray(catalogo.servicios)) {
    errores.push("servicios debe ser una lista.");
  }

  if (
    !Array.isArray(catalogo.proveedores) ||
    !Array.isArray(catalogo.servicios)
  ) {
    return errores;
  }

  const idsProveedores = new Set();
  const idsServicios = new Set();
  const categoriasSet = new Set(
    Array.isArray(categorias) ? categorias : []
  );
  const proveedoresPorId = new Map();

  // Validar proveedores.
  catalogo.proveedores.forEach((proveedor, indice) => {
    const etiqueta = `Proveedor en posicion ${indice + 1}`;

    if (
      !proveedor ||
      typeof proveedor !== "object" ||
      Array.isArray(proveedor)
    ) {
      errores.push(`${etiqueta}: el registro debe ser un objeto.`);
      return;
    }

    if (
      typeof proveedor.id !== "string" ||
      !proveedor.id.trim()
    ) {
      errores.push(`${etiqueta}: falta un id valido.`);
    } else if (idsProveedores.has(proveedor.id)) {
      errores.push(
        `${etiqueta}: el id duplicado es ${proveedor.id}.`
      );
    } else {
      idsProveedores.add(proveedor.id);
      proveedoresPorId.set(proveedor.id, proveedor);
    }

    if (
      typeof proveedor.nombre !== "string" ||
      !proveedor.nombre.trim()
    ) {
      errores.push(`${etiqueta}: falta el nombre.`);
    }

    if (!["activo", "inactivo"].includes(proveedor.estado)) {
      errores.push(
        `${etiqueta}: estado debe ser "activo" o "inactivo".`
      );
    }

    if (
      proveedor.categoria &&
      categoriasSet.size &&
      !categoriasSet.has(proveedor.categoria)
    ) {
      errores.push(
        `${etiqueta}: la categoria "${proveedor.categoria}" no existe en el catalogo.`
      );
    }

    const camposFecha = [
      "fecha_alta",
      "ultima_actualizacion",
      "fecha_baja",
      "fecha_reactivacion"
    ];

    camposFecha.forEach((campoFecha) => {
      const valor = proveedor[campoFecha];

      if (valor !== undefined && valor !== null) {
        if (
          typeof valor !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(valor)
        ) {
          errores.push(
            `${etiqueta}: ${campoFecha} debe ser null o una fecha AAAA-MM-DD.`
          );
        } else {
          const fecha = new Date(`${valor}T00:00:00Z`);

          if (
            Number.isNaN(fecha.getTime()) ||
            fecha.toISOString().slice(0, 10) !== valor
          ) {
            errores.push(
              `${etiqueta}: ${campoFecha} contiene una fecha inexistente.`
            );
          }
        }
      }
    });
  });

  // Validar servicios y sus relaciones con proveedores.
  catalogo.servicios.forEach((servicio, indice) => {
    const etiqueta = `Servicio en posicion ${indice + 1}`;

    if (
      !servicio ||
      typeof servicio !== "object" ||
      Array.isArray(servicio)
    ) {
      errores.push(`${etiqueta}: el registro debe ser un objeto.`);
      return;
    }

    if (
      typeof servicio.id !== "string" ||
      !servicio.id.trim()
    ) {
      errores.push(`${etiqueta}: falta un id valido.`);
    } else if (idsServicios.has(servicio.id)) {
      errores.push(
        `${etiqueta}: el id duplicado es ${servicio.id}.`
      );
    } else {
      idsServicios.add(servicio.id);
    }

    if (
      typeof servicio.nombre !== "string" ||
      !servicio.nombre.trim()
    ) {
      errores.push(`${etiqueta}: falta el nombre.`);
    }

    if (
      typeof servicio.proveedor_id !== "string" ||
      !proveedoresPorId.has(servicio.proveedor_id)
    ) {
      errores.push(
        `${etiqueta}: proveedor_id no corresponde a un proveedor existente.`
      );
    }

    if (typeof servicio.activo !== "boolean") {
      errores.push(
        `${etiqueta}: activo debe ser true o false.`
      );
    }

    if (
      servicio.precio_referencial !== undefined &&
      servicio.precio_referencial !== null &&
      (
        typeof servicio.precio_referencial !== "number" ||
        !Number.isFinite(servicio.precio_referencial) ||
        servicio.precio_referencial < 0
      )
    ) {
      errores.push(
        `${etiqueta}: precio_referencial debe ser un numero no negativo o null.`
      );
    }

    if (
      servicio.categoria &&
      categoriasSet.size &&
      !categoriasSet.has(servicio.categoria)
    ) {
      errores.push(
        `${etiqueta}: la categoria "${servicio.categoria}" no existe en el catalogo.`
      );
    }
  });

  return errores;
}

/**
 * Carga el catalogo una sola vez y reutiliza la promesa.
 *
 * Opciones:
 *   url: URL alternativa del JSON (opcional).
 *   recargar: vuelve a solicitar el archivo al servidor.
 */
export async function cargarCatalogoProveedores(opciones = {}) {
  const urlSolicitada = opciones.url
    ? new URL(opciones.url, import.meta.url)
    : URL_CATALOGO_POR_DEFECTO;

  const claveUrl = urlSolicitada.href;

  if (
    opciones.recargar ||
    (
      urlCatalogoEnCache &&
      urlCatalogoEnCache !== claveUrl
    )
  ) {
    promesaCatalogo = null;
  }

  if (
    !promesaCatalogo ||
    urlCatalogoEnCache !== claveUrl
  ) {
    urlCatalogoEnCache = claveUrl;

    promesaCatalogo = fetch(urlSolicitada.href, {
      cache: opciones.recargar ? "reload" : "default"
    })
      .then((respuesta) => {
        if (!respuesta.ok) {
          throw new Error(
            `No se pudo cargar el catalogo (${respuesta.status} ${respuesta.statusText}). URL: ${urlSolicitada.href}`
          );
        }

        return respuesta.json();
      })
      .then((catalogo) => {
        const errores = validarCatalogoProveedores(catalogo);

        if (errores.length > 0) {
          throw new Error(
            "El catalogo no paso la validacion:\n- " +
            errores.join("\n- ")
          );
        }

        return catalogo;
      })
      .catch((error) => {
        // Permite intentar nuevamente si ocurre un error.
        promesaCatalogo = null;
        urlCatalogoEnCache = null;
        throw error;
      });
  }

  return promesaCatalogo;
}

/**
 * Obtiene un proveedor por su ID.
 * Devuelve null si no existe.
 */
export async function obtenerProveedorPorId(id, opciones = {}) {
  const catalogo = await cargarCatalogoProveedores(opciones);

  return (
    catalogo.proveedores.find(
      (proveedor) => proveedor.id === id
    ) ?? null
  );
}

/**
 * Obtiene proveedores.
 * Por defecto devuelve solo los activos.
 *
 * Para incluir inactivos:
 * obtenerProveedores({ soloActivos: false })
 */
export async function obtenerProveedores(opciones = {}) {
  const {
    soloActivos = true,
    ...opcionesCarga
  } = opciones;

  const catalogo = await cargarCatalogoProveedores(opcionesCarga);

  return catalogo.proveedores.filter(
    (proveedor) =>
      !soloActivos || proveedor.estado === "activo"
  );
}

/**
 * Obtiene un servicio por su ID.
 * Devuelve null si no existe.
 */
export async function obtenerServicioPorId(id, opciones = {}) {
  const catalogo = await cargarCatalogoProveedores(opciones);

  return (
    catalogo.servicios.find(
      (servicio) => servicio.id === id
    ) ?? null
  );
}

/**
 * Obtiene los servicios asociados a un proveedor.
 * Por defecto devuelve solo los servicios activos.
 */
export async function obtenerServiciosPorProveedor(
  proveedorId,
  opciones = {}
) {
  const {
    soloActivos = true,
    ...opcionesCarga
  } = opciones;

  const catalogo = await cargarCatalogoProveedores(opcionesCarga);

  return catalogo.servicios.filter(
    (servicio) =>
      servicio.proveedor_id === proveedorId &&
      (!soloActivos || servicio.activo === true)
  );
}

/**
 * Obtiene servicios junto con los datos de su proveedor.
 * Por defecto excluye servicios inactivos y proveedores inactivos.
 */
export async function obtenerServiciosConProveedor(opciones = {}) {
  const {
    incluirProveedoresInactivos = false,
    soloServiciosActivos = true,
    ...opcionesCarga
  } = opciones;

  const catalogo = await cargarCatalogoProveedores(opcionesCarga);

  const proveedoresPorId = new Map(
    catalogo.proveedores.map(
      (proveedor) => [proveedor.id, proveedor]
    )
  );

  return catalogo.servicios
    .filter(
      (servicio) =>
        !soloServiciosActivos || servicio.activo === true
    )
    .map((servicio) => ({
      ...servicio,
      proveedor:
        proveedoresPorId.get(servicio.proveedor_id) ?? null
    }))
    .filter(
      (servicio) =>
        servicio.proveedor &&
        (
          incluirProveedoresInactivos ||
          servicio.proveedor.estado === "activo"
        )
    );
}

/**
 * Fuerza la proxima carga del catalogo desde el servidor.
 */
export async function recargarCatalogoProveedores() {
  return cargarCatalogoProveedores({ recargar: true });
}
