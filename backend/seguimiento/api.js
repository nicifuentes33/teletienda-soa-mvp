
const express = require("express");
const { timingSafeEqual } = require("node:crypto");

const { autenticar } = require("../seguridad");

const {
    registrarSeguimiento,
    obtenerSeguimientos,
    obtenerSeguimiento,
    actualizarEstado
} = require("./seguimiento");

// 1. Configuración

const app = express();
const PORT = 3004;

const PEDIDOS_URL = "http://127.0.0.1:3003/api/pedidos";

app.use(express.json());

// 2. Validar ID del pedido

function validarId(req, res, next) {
    const id = Number(req.params.pedidoId);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            mensaje: "ID de pedido inválido"
        });
    }

    req.pedidoId = id;
    next();
}

// 3. Validar clave interna

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

// 4. Autorizar servicios internos

function exigirInterno(req, res, next) {
    if (
        !process.env.SOA_INTERNAL_KEY ||
        process.env.SOA_INTERNAL_KEY.length < 32
    ) {
        return res.status(503).json({
            mensaje: "Seguridad interna sin configurar"
        });
    }

    if (!claveInternaValida(req)) {
        return res.status(403).json({
            mensaje: "Acceso exclusivo para servicios internos"
        });
    }

    return next();
}

// 5. Autorizar usuarios y servicios

function autenticarOInterno(req, res, next) {
    if (claveInternaValida(req)) {
        req.servicioInterno = true;
        return next();
    }

    return autenticar(req, res, next);
}

// 6. Consultar pedido en Gestión de Pedidos

async function consultarPedido(pedidoId) {
    const clave = process.env.SOA_INTERNAL_KEY;

    if (!clave || clave.length < 32) {
        const error = new Error(
            "La clave interna SOA no está configurada"
        );
        error.status = 503;
        throw error;
    }

    let respuesta;

    try {
        respuesta = await fetch(
            `${PEDIDOS_URL}/${pedidoId}`,
            {
                headers: {
                    "x-internal-key": clave
                },
                signal: AbortSignal.timeout(5000)
            }
        );
    } catch {
        const error = new Error(
            "No hay conexión con Gestión de Pedidos"
        );
        error.status = 503;
        throw error;
    }

    if (respuesta.status === 404) {
        return null;
    }

    if (!respuesta.ok) {
        const error = new Error(
            "No fue posible consultar Gestión de Pedidos"
        );
        error.status = 503;
        throw error;
    }

    return respuesta.json();
}

// 7. Comprobar propietario del pedido

async function autorizarConsulta(req, res, next) {
    if (
        req.servicioInterno ||
        req.usuario?.rol === "ADMINISTRADOR"
    ) {
        return next();
    }

    if (req.usuario?.rol !== "CLIENTE") {
        return res.status(403).json({
            mensaje: "Acceso no autorizado"
        });
    }

    try {
        const pedido = await consultarPedido(req.pedidoId);

        if (!pedido) {
            return res.status(404).json({
                mensaje: "Pedido no encontrado"
            });
        }

        if (pedido.clienteId !== req.usuario.id) {
            return res.status(403).json({
                mensaje: "No tienes acceso a este pedido"
            });
        }

        return next();

    } catch (error) {
        return res.status(error.status || 503).json({
            mensaje: error.message
        });
    }
}

// 8. Registrar seguimiento

app.post(
    "/api/seguimiento",
    exigirInterno,
    async (req, res) => {
        const { pedidoId } = req.body || {};

        if (
            !Number.isSafeInteger(pedidoId) ||
            pedidoId <= 0
        ) {
            return res.status(400).json({
                mensaje: "ID de pedido inválido"
            });
        }

        try {
            const pedido = await consultarPedido(pedidoId);

            if (!pedido) {
                return res.status(404).json({
                    mensaje: "El pedido no existe"
                });
            }

            const seguimiento = registrarSeguimiento(
                pedidoId
            );

            return res.status(201).json({
                mensaje: "Seguimiento registrado",
                seguimiento
            });

        } catch (error) {
            return res.status(error.status || 503).json({
                mensaje: "No fue posible registrar el seguimiento",
                detalle: error.message
            });
        }
    }
);

// 9. Consultar todos los seguimientos

app.get(
    "/api/seguimiento",
    autenticarOInterno,
    async (req, res) => {
        try {
            const seguimientos = obtenerSeguimientos();

            if (
                req.servicioInterno ||
                req.usuario?.rol === "ADMINISTRADOR"
            ) {
                return res.status(200).json(
                    seguimientos
                );
            }

            if (req.usuario?.rol !== "CLIENTE") {
                return res.status(403).json({
                    mensaje: "Acceso no autorizado"
                });
            }

            const respuesta = [];

            for (const seguimiento of seguimientos) {
                const pedido = await consultarPedido(
                    seguimiento.pedidoId
                );

                if (
                    pedido &&
                    pedido.clienteId === req.usuario.id
                ) {
                    respuesta.push(seguimiento);
                }
            }

            return res.status(200).json(
                respuesta
            );

        } catch (error) {
            return res.status(error.status || 503).json({
                mensaje: "No se pudieron consultar los seguimientos"
            });
        }
    }
);

// 10. Consultar seguimiento por pedido

app.get(
    "/api/seguimiento/:pedidoId",
    autenticarOInterno,
    validarId,
    autorizarConsulta,
    (req, res) => {
        const seguimiento = obtenerSeguimiento(
            req.pedidoId
        );

        if (!seguimiento) {
            return res.status(404).json({
                mensaje: "Seguimiento no encontrado"
            });
        }

        return res.status(200).json(
            seguimiento
        );
    }
);

// 11. Actualizar estado del pedido

app.put(
    "/api/seguimiento/:pedidoId",
    exigirInterno,
    validarId,
    (req, res) => {
        const { estado } = req.body || {};

        try {
            const seguimiento = actualizarEstado(
                req.pedidoId,
                estado
            );

            return res.status(200).json({
                mensaje: "Estado actualizado correctamente",
                seguimiento
            });

        } catch (error) {
            const noEncontrado =
                error.message === "Seguimiento no encontrado";

            return res.status(
                noEncontrado ? 404 : 409
            ).json({
                mensaje: error.message
            });
        }
    }
);

// 12. Estado del servicio

app.get("/api/seguimiento/salud", (req, res) => {
    return res.status(200).json({
        servicio: "Seguimiento de Pedidos",
        estado: "ACTIVO",
        puerto: PORT
    });
});

// 13. Iniciar servidor

if (require.main === module) {
    app.listen(PORT, "127.0.0.1", () => {
        console.log("TELETIENDA SOA - SEGUIMIENTO");
        console.log(
            "Servidor: http://localhost:" + PORT
        );
        console.log(
            "Seguridad: tokens y clave interna"
        );
        console.log("Estado: Servicio activo");
    });
}

module.exports = app;
