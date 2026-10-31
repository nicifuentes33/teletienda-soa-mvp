
const express = require("express");
const { timingSafeEqual } = require("node:crypto");

const {
    autenticar,
    permitirRoles
} = require("../seguridad");

const {
    validarSolicitud,
    agruparProductos,
    crearPedido,
    obtenerPedidos,
    obtenerPedidoPorId
} = require("./pedido");

// 1. Configuración

const app = express();
const PORT = 3003;

const CATALOGO_URL =
    "http://127.0.0.1:3001/api/productos";

const SEGUIMIENTO_URL =
    "http://127.0.0.1:3004/api/seguimiento";

const CAMUNDA_URL =
    "http://localhost:8088/v2";

const PROCESS_ID =
    "proceso_pedidos_teletienda";

app.use(express.json());

// 2. Seguridad de servicios internos

function claveInternaValida(req) {
    const configurada = process.env.SOA_INTERNAL_KEY;
    const recibida = req.headers["x-internal-key"];

    if (
        typeof configurada !== "string" ||
        configurada.length < 32 ||
        typeof recibida !== "string"
    ) {
        return false;
    }

    const esperada = Buffer.from(configurada);
    const proporcionada = Buffer.from(recibida);

    if (esperada.length !== proporcionada.length) {
        return false;
    }

    return timingSafeEqual(esperada, proporcionada);
}

function autenticarOInterno(req, res, next) {
    if (claveInternaValida(req)) {
        req.servicioInterno = true;
        return next();
    }

    return autenticar(req, res, next);
}

function exigirCliente(req, res, next) {
    return permitirRoles("CLIENTE")(req, res, next);
}

// 3. Comunicación con las APIs

function errorDeIntegracion(mensaje) {
    const error = new Error(mensaje);
    error.status = 503;
    return error;
}

async function solicitar(
    url,
    metodo = "GET",
    datos,
    interno = false
) {
    const headers = {
        "Content-Type": "application/json"
    };

    if (interno) {
        const clave = process.env.SOA_INTERNAL_KEY;

        if (!clave || clave.length < 32) {
            throw errorDeIntegracion(
                "La clave interna SOA no está configurada"
            );
        }

        headers["x-internal-key"] = clave;
    }

    let respuesta;

    try {
        respuesta = await fetch(url, {
            method: metodo,
            headers,
            body: datos === undefined
                ? undefined
                : JSON.stringify(datos),
            signal: AbortSignal.timeout(8000)
        });

    } catch {
        throw errorDeIntegracion(
            "No se pudo conectar con: " + url
        );
    }

    const texto = await respuesta.text();
    let resultado = {};

    if (texto) {
        try {
            resultado = JSON.parse(texto);
        } catch {
            throw errorDeIntegracion(
                "Respuesta JSON inválida del servicio"
            );
        }
    }

    if (!respuesta.ok) {
        const error = new Error(
            resultado.mensaje ||
            resultado.detail ||
            "Error HTTP " + respuesta.status
        );

        error.status = respuesta.status;
        throw error;
    }

    return resultado;
}

// 4. Consultar producto del catálogo

async function consultarProducto(id) {
    try {
        return await solicitar(
            CATALOGO_URL + "/" + id
        );

    } catch (error) {
        if (error.status === 404) {
            const nuevoError = new Error(
                "El producto " + id + " no existe"
            );

            nuevoError.status = 400;
            throw nuevoError;
        }

        throw error;
    }
}

// 5. Registrar seguimiento

async function registrarSeguimiento(pedidoId) {
    return solicitar(
        SEGUIMIENTO_URL,
        "POST",
        { pedidoId },
        true
    );
}

// 6. Iniciar proceso en Camunda

async function iniciarProcesoCamunda(pedidoId) {
    console.log(
        "[CAMUNDA] Iniciando proceso para pedido:",
        pedidoId
    );

    const resultado = await solicitar(
        CAMUNDA_URL + "/process-instances",
        "POST",
        {
            processDefinitionId: PROCESS_ID,
            variables: {
                pedidoId
            }
        }
    );

    console.log(
        "[CAMUNDA] Instancia creada:",
        resultado.processInstanceKey
    );

    return resultado;
}

// 7. Registrar pedido

app.post(
    "/api/pedidos",
    autenticar,
    exigirCliente,
    async (req, res) => {
        try {
            const clienteId = req.usuario.id;
            const productos = req.body?.productos;

            validarSolicitud(clienteId, productos);

            const agrupados = agruparProductos(productos);

            const detalles = await Promise.all(
                agrupados.map(async item => {
                    const producto = await consultarProducto(
                        item.productoId
                    );

                    if (
                        producto.estado !== "DISPONIBLE" ||
                        !Number.isSafeInteger(
                            producto.cantidadInventario
                        ) ||
                        producto.cantidadInventario <
                            item.cantidad
                    ) {
                        const error = new Error(
                            "Existencias insuficientes para " +
                            producto.nombre
                        );

                        error.status = 409;
                        throw error;
                    }

                    if (
                        typeof producto.precio !== "number" ||
                        !Number.isSafeInteger(producto.precio) ||
                        producto.precio <= 0
                    ) {
                        throw errorDeIntegracion(
                            "Precio inválido del Catálogo"
                        );
                    }

                    const subtotal =
                        producto.precio * item.cantidad;

                    if (!Number.isSafeInteger(subtotal)) {
                        const error = new Error(
                            "Subtotal fuera del rango permitido"
                        );

                        error.status = 400;
                        throw error;
                    }

                    return {
                        productoId: producto.id,
                        nombre: producto.nombre,
                        cantidad: item.cantidad,
                        precioUnitario: producto.precio,
                        subtotal
                    };
                })
            );

            const pedido = crearPedido(
                clienteId,
                detalles
            );

            console.log(
                "[PEDIDOS] Pedido registrado:",
                pedido.id,
                "Cliente:",
                clienteId
            );

            try {
                await registrarSeguimiento(pedido.id);

                console.log(
                    "[SEGUIMIENTO] Registrado:",
                    pedido.id
                );

            } catch (error) {
                console.error(
                    "[SEGUIMIENTO] Error:",
                    error.message
                );

                return res.status(201).json({
                    mensaje:
                        "Pedido registrado, pero no se pudo " +
                        "crear su seguimiento",
                    pedido,
                    camunda: {
                        iniciado: false,
                        estado: "PENDIENTE",
                        detalle: error.message
                    }
                });
            }

            try {
                const proceso = await iniciarProcesoCamunda(
                    pedido.id
                );

                return res.status(201).json({
                    mensaje:
                        "Pedido registrado y enviado " +
                        "automáticamente a Camunda",
                    pedido,
                    camunda: {
                        iniciado: true,
                        processInstanceKey:
                            proceso.processInstanceKey,
                        processDefinitionId:
                            proceso.processDefinitionId,
                        estado: "EN_PROCESAMIENTO"
                    }
                });

            } catch (error) {
                console.error(
                    "[CAMUNDA] Error al iniciar proceso:",
                    error.message
                );

                return res.status(201).json({
                    mensaje:
                        "Pedido registrado, pero no se pudo " +
                        "confirmar el inicio en Camunda",
                    pedido,
                    camunda: {
                        iniciado: false,
                        estado: "INICIO_NO_CONFIRMADO",
                        detalle: error.message
                    }
                });
            }

        } catch (error) {
            console.error(
                "[PEDIDOS] Error:",
                error.message
            );

            return res.status(
                error.status || 400
            ).json({
                mensaje: error.message
            });
        }
    }
);

// 8. Consultar pedidos

app.get(
    "/api/pedidos",
    autenticarOInterno,
    (req, res) => {
        try {
            const pedidos = obtenerPedidos();

            if (
                req.servicioInterno === true ||
                req.usuario?.rol === "ADMINISTRADOR"
            ) {
                return res.status(200).json(
                    pedidos
                );
            }

            if (req.usuario?.rol === "CLIENTE") {
                const propios = pedidos.filter(
                    pedido =>
                        pedido.clienteId === req.usuario.id
                );

                return res.status(200).json(
                    propios
                );
            }

            return res.status(403).json({
                mensaje: "Acceso no autorizado"
            });

        } catch {
            return res.status(500).json({
                mensaje:
                    "No se pudieron consultar los pedidos"
            });
        }
    }
);

// 9. Consultar pedido por ID

app.get(
    "/api/pedidos/:id",
    autenticarOInterno,
    (req, res) => {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({
                mensaje: "ID de pedido inválido"
            });
        }

        try {
            const pedido = obtenerPedidoPorId(id);

            if (!pedido) {
                return res.status(404).json({
                    mensaje: "Pedido no encontrado"
                });
            }

            if (
                req.servicioInterno === true ||
                req.usuario?.rol === "ADMINISTRADOR"
            ) {
                return res.status(200).json(
                    pedido
                );
            }

            if (
                req.usuario?.rol === "CLIENTE" &&
                pedido.clienteId === req.usuario.id
            ) {
                return res.status(200).json(
                    pedido
                );
            }

            return res.status(403).json({
                mensaje:
                    "No tienes permiso para consultar este pedido"
            });

        } catch {
            return res.status(500).json({
                mensaje: "Error al consultar pedido"
            });
        }
    }
);

// 10. Estado del servicio

app.get("/api/pedidos/salud", (req, res) => {
    return res.status(200).json({
        servicio: "Gestión de Pedidos",
        estado: "ACTIVO",
        puerto: PORT,
        proceso: PROCESS_ID
    });
});

// 11. Iniciar servidor

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(
            "TELETIENDA SOA - GESTIÓN DE PEDIDOS"
        );

        console.log(
            "Servidor: http://localhost:" + PORT
        );

        console.log(
            "Camunda: " + CAMUNDA_URL
        );

        console.log(
            "Seguridad: tokens y roles"
        );
    });
}

module.exports = app;
