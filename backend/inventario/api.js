
const express = require("express");
const { timingSafeEqual } = require("node:crypto");

const {
    autenticar,
    permitirRoles
} = require("../seguridad");

const {
    obtenerInventario,
    obtenerInventarioPorProducto,
    crearInventario,
    actualizarInventario,
    verificarDisponibilidad,
    descontarInventario,
    eliminarInventario
} = require("./inventario");

// 1. Configuración

const app = express();
const PORT = 3002;

app.use(express.json());

// 2. Estado del servicio

app.get("/api/inventario/salud", (req, res) => {
    return res.status(200).json({
        servicio: "Inventario Unificado",
        estado: "ACTIVO",
        puerto: PORT
    });
});

// 3. Validación de identificadores

function validarId(req, res, next) {
    const id = Number(req.params.productoId);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            mensaje: "ID inválido"
        });
    }

    req.productoId = id;
    next();
}

// 4. Validación de servicios internos

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

    const claveEsperada = Buffer.from(configurada);
    const claveRecibida = Buffer.from(recibida);

    if (claveEsperada.length !== claveRecibida.length) {
        return false;
    }

    return timingSafeEqual(
        claveEsperada,
        claveRecibida
    );
}

// 5. Acceso exclusivo para servicios internos

function exigirInterno(req, res, next) {
    if (
        typeof process.env.SOA_INTERNAL_KEY !== "string" ||
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

// 6. Acceso de administrador o servicio interno

function administradorOInterno(req, res, next) {
    if (claveInternaValida(req)) {
        return next();
    }

    return autenticar(req, res, () => {
        permitirRoles("ADMINISTRADOR")(req, res, next);
    });
}

// 7. Consultar todo el inventario

app.get("/api/inventario", (req, res) => {
    return res.status(200).json(
        obtenerInventario()
    );
});

// 8. Consultar inventario por producto

app.get(
    "/api/inventario/:productoId",
    validarId,
    (req, res) => {
        const item = obtenerInventarioPorProducto(
            req.productoId
        );

        if (!item) {
            return res.status(404).json({
                mensaje: "Producto no encontrado"
            });
        }

        return res.status(200).json(item);
    }
);

// 9. Registrar inventario inicial

app.post(
    "/api/inventario",
    administradorOInterno,
    (req, res) => {
        try {
            const {
                productoId,
                cantidadDisponible
            } = req.body || {};

            const item = crearInventario(
                productoId,
                cantidadDisponible
            );

            return res.status(201).json(item);

        } catch (error) {
            return res.status(400).json({
                mensaje: error.message
            });
        }
    }
);

// 10. Ajustar existencias

app.put(
    "/api/inventario/:productoId",
    autenticar,
    permitirRoles("ADMINISTRADOR"),
    validarId,
    (req, res) => {
        try {
            const item = actualizarInventario(
                req.productoId,
                req.body?.cantidadDisponible
            );

            return res.status(200).json(item);

        } catch (error) {
            return res.status(400).json({
                mensaje: error.message
            });
        }
    }
);

// 11. Verificar disponibilidad

app.post(
    "/api/inventario/verificar",
    exigirInterno,
    (req, res) => {
        try {
            const disponible = verificarDisponibilidad(
                req.body?.productos
            );

            return res.status(200).json({
                disponible
            });

        } catch (error) {
            return res.status(400).json({
                mensaje: error.message
            });
        }
    }
);

// 12. Descontar inventario

app.post(
    "/api/inventario/descontar",
    exigirInterno,
    (req, res) => {
        try {
            const resultado = descontarInventario(
                req.body?.pedidoId,
                req.body?.productos
            );

            if (resultado.motivo) {
                return res.status(409).json(resultado);
            }

            return res.status(200).json(resultado);

        } catch (error) {
            return res.status(400).json({
                mensaje: error.message
            });
        }
    }
);

// 13. Eliminar inventario

app.delete(
    "/api/inventario/:productoId",
    administradorOInterno,
    validarId,
    (req, res) => {
        try {
            const eliminado = eliminarInventario(
                req.productoId
            );

            if (!eliminado) {
                return res.status(404).json({
                    mensaje: "Inventario no encontrado"
                });
            }

            return res.status(200).json({
                mensaje: "Inventario eliminado"
            });

        } catch (error) {
            return res.status(400).json({
                mensaje: error.message
            });
        }
    }
);

// 14. Iniciar servidor

if (require.main === module) {
    app.listen(PORT, "127.0.0.1", () => {
        console.log(
            "TELETIENDA SOA - INVENTARIO UNIFICADO"
        );
        console.log(
            "Servidor: http://127.0.0.1:" + PORT
        );
        console.log(
            "Seguridad: tokens y clave interna"
        );
        console.log("Estado: Servicio activo");
    });
}

module.exports = app;
