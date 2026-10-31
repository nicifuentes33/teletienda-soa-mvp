
const express = require("express");

const {
    autenticar,
    permitirRoles
} = require("../seguridad");

const {
    crearProducto,
    obtenerProductos,
    obtenerProductoPorId,
    actualizarProducto,
    eliminarProducto
} = require("./producto");

// 1. Configuración

const app = express();
const PORT = 3001;
const INVENTARIO_URL = "http://127.0.0.1:3002/api/inventario";

app.use(express.json());

// 2. Validación de identificadores

function validarId(req, res, next) {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            mensaje: "El ID del producto no es válido"
        });
    }

    req.productoId = id;
    next();
}

// 3. Seguridad de comunicación interna

function encabezadosInternos() {
    const clave = process.env.SOA_INTERNAL_KEY;

    if (
        typeof clave !== "string" ||
        clave.length < 32
    ) {
        throw new Error(
            "La clave interna SOA no está configurada"
        );
    }

    return {
        "Content-Type": "application/json",
        "x-internal-key": clave
    };
}

// 4. Consultar Inventario

async function consultarInventario() {
    const respuesta = await fetch(INVENTARIO_URL, {
        signal: AbortSignal.timeout(5000)
    });

    if (!respuesta.ok) {
        throw new Error(
            "No se pudo consultar el inventario"
        );
    }

    return respuesta.json();
}

// 5. Combinar productos e inventario

function combinarProductoInventario(producto, inventario) {
    const existencia = inventario.find(
        item => item.productoId === producto.id
    );

    const cantidad = existencia
        ? existencia.cantidadDisponible
        : null;

    return {
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        descripcion: producto.descripcion,
        cantidadInventario: cantidad,
        estado: cantidad === null
            ? "SIN_INVENTARIO"
            : cantidad > 0
                ? "DISPONIBLE"
                : "AGOTADO"
    };
}

// 6. Crear producto

app.post(
    "/api/productos",
    autenticar,
    permitirRoles("ADMINISTRADOR"),
    async (req, res) => {
        try {
            const {
                nombre,
                cantidadInventario,
                precio,
                descripcion
            } = req.body || {};

            if (
                !Number.isSafeInteger(cantidadInventario) ||
                cantidadInventario < 0
            ) {
                return res.status(400).json({
                    mensaje:
                        "La cantidad inicial de inventario no es válida"
                });
            }

            const headers = encabezadosInternos();

            const comprobacion = await fetch(
                INVENTARIO_URL,
                {
                    signal: AbortSignal.timeout(5000)
                }
            );

            if (!comprobacion.ok) {
                throw new Error(
                    "Servicio de Inventario no disponible"
                );
            }

            const producto = crearProducto({
                nombre,
                cantidadInventario,
                precio,
                descripcion
            });

            let respuesta;

            try {
                respuesta = await fetch(
                    INVENTARIO_URL,
                    {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            productoId: producto.id,
                            cantidadDisponible: cantidadInventario
                        }),
                        signal: AbortSignal.timeout(5000)
                    }
                );
            } catch (error) {
                eliminarProducto(producto.id);

                return res.status(503).json({
                    mensaje:
                        "No se pudo conectar con Inventario",
                    detalle: error.message
                });
            }

            if (!respuesta.ok) {
                eliminarProducto(producto.id);

                const detalle = await respuesta.json()
                    .catch(() => ({}));

                return res.status(502).json({
                    mensaje:
                        "No se pudo registrar el inventario",
                    detalle:
                        detalle.mensaje ||
                        "Error de integración"
                });
            }

            const inventario = await consultarInventario();

            return res.status(201).json({
                mensaje:
                    "Producto creado correctamente",
                producto: combinarProductoInventario(
                    producto,
                    inventario
                )
            });

        } catch (error) {
            return res.status(400).json({
                mensaje: error.message
            });
        }
    }
);

// 7. Consultar productos

app.get("/api/productos", async (req, res) => {
    try {
        const inventario = await consultarInventario();

        const productos = obtenerProductos().map(
            producto => combinarProductoInventario(
                producto,
                inventario
            )
        );

        return res.status(200).json(productos);

    } catch {
        return res.status(503).json({
            mensaje:
                "No fue posible consultar el inventario"
        });
    }
});

// 8. Consultar producto por ID

app.get(
    "/api/productos/:id",
    validarId,
    async (req, res) => {
        try {
            const producto = obtenerProductoPorId(
                req.productoId
            );

            if (!producto) {
                return res.status(404).json({
                    mensaje: "Producto no encontrado"
                });
            }

            const inventario = await consultarInventario();

            return res.status(200).json(
                combinarProductoInventario(
                    producto,
                    inventario
                )
            );

        } catch {
            return res.status(503).json({
                mensaje:
                    "No fue posible consultar el inventario"
            });
        }
    }
);

// 9. Modificar producto

app.put(
    "/api/productos/:id",
    autenticar,
    permitirRoles("ADMINISTRADOR"),
    validarId,
    async (req, res) => {
        try {
            const productoActual = obtenerProductoPorId(
                req.productoId
            );

            if (!productoActual) {
                return res.status(404).json({
                    mensaje: "Producto no encontrado"
                });
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    req.body || {},
                    "cantidadInventario"
                )
            ) {
                return res.status(400).json({
                    mensaje:
                        "Para modificar existencias utilice Inventario"
                });
            }

            const producto = actualizarProducto(
                req.productoId,
                {
                    nombre: req.body?.nombre,
                    precio: req.body?.precio,
                    descripcion: req.body?.descripcion
                }
            );

            const inventario = await consultarInventario();

            return res.status(200).json({
                mensaje:
                    "Producto actualizado correctamente",
                producto: combinarProductoInventario(
                    producto,
                    inventario
                )
            });

        } catch (error) {
            return res.status(400).json({
                mensaje: error.message
            });
        }
    }
);

// 10. Eliminar producto

app.delete(
    "/api/productos/:id",
    autenticar,
    permitirRoles("ADMINISTRADOR"),
    validarId,
    async (req, res) => {
        try {
            const producto = obtenerProductoPorId(
                req.productoId
            );

            if (!producto) {
                return res.status(404).json({
                    mensaje: "Producto no encontrado"
                });
            }

            const headers = encabezadosInternos();

            const respuesta = await fetch(
                `${INVENTARIO_URL}/${req.productoId}`,
                {
                    method: "DELETE",
                    headers,
                    signal: AbortSignal.timeout(5000)
                }
            );

            if (!respuesta.ok) {
                const detalle = await respuesta.json()
                    .catch(() => ({}));

                return res.status(502).json({
                    mensaje:
                        "No fue posible eliminar el inventario asociado",
                    detalle:
                        detalle.mensaje ||
                        "Error de integración"
                });
            }

            eliminarProducto(req.productoId);

            return res.status(200).json({
                mensaje:
                    "Producto e inventario eliminados correctamente"
            });

        } catch (error) {
            return res.status(503).json({
                mensaje:
                    "No fue posible conectar con Inventario",
                detalle: error.message
            });
        }
    }
);

// 11. Estado del servicio

app.get("/api/catalogo/salud", (req, res) => {
    return res.status(200).json({
        servicio: "Catálogo de Productos",
        estado: "ACTIVO",
        puerto: PORT
    });
});

// 12. Inicio del servidor

if (require.main === module) {
    app.listen(PORT, () => {
        console.log("TELETIENDA SOA - CATÁLOGO");
        console.log(
            "Servidor: http://localhost:" + PORT
        );
        console.log(
            "Inventario conectado mediante REST"
        );
        console.log(
            "Seguridad: tokens y clave interna"
        );
        console.log("Estado: Servicio activo");
    });
}

module.exports = app;
