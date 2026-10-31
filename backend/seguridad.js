
const AUTH_URL = "http://127.0.0.1:3005/api/auth/validar";

// 1. Validación del token

async function autenticar(req, res, next) {
    const autorizacion = req.headers.authorization || "";

    if (!autorizacion.startsWith("Bearer ")) {
        return res.status(401).json({
            mensaje: "Debes iniciar sesión"
        });
    }

    try {
        const respuesta = await fetch(AUTH_URL, {
            method: "GET",
            headers: {
                Authorization: autorizacion
            },
            signal: AbortSignal.timeout(5000)
        });

        if (respuesta.status === 401) {
            return res.status(401).json({
                mensaje: "Token inválido o vencido"
            });
        }

        if (!respuesta.ok) {
            return res.status(503).json({
                mensaje: "No se pudo validar la sesión"
            });
        }

        const datos = await respuesta.json();

        if (
            datos.valido !== true ||
            !datos.usuario ||
            !Number.isSafeInteger(datos.usuario.id)
        ) {
            return res.status(401).json({
                mensaje: "Sesión no válida"
            });
        }

        req.usuario = datos.usuario;
        next();

    } catch (error) {
        return res.status(503).json({
            mensaje: "Servicio de autenticación no disponible"
        });
    }
}

// 2. Autorización por roles

function permitirRoles(...roles) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                mensaje: "Usuario no autenticado"
            });
        }

        if (!roles.includes(req.usuario.rol)) {
            return res.status(403).json({
                mensaje: "No tienes permisos para esta operación"
            });
        }

        next();
    };
}

// 3. Validación de propiedad del pedido

function permitirPropietarioOAdmin(pedido) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                mensaje: "Debes iniciar sesión"
            });
        }

        if (
            req.usuario.rol === "ADMINISTRADOR" ||
            (
                req.usuario.rol === "CLIENTE" &&
                pedido.clienteId === req.usuario.id
            )
        ) {
            return next();
        }

        return res.status(403).json({
            mensaje: "No tienes acceso a este pedido"
        });
    };
}

// 4. Exportar funciones

module.exports = {
    autenticar,
    permitirRoles,
    permitirPropietarioOAdmin
};
