
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const {
    randomBytes,
    scryptSync,
    timingSafeEqual
} = require("node:crypto");

// 1. Configuración

const app = express();
const PORT = 3005;
const ARCHIVO = path.join(__dirname, "usuarios.json");
const sesiones = new Map();

app.use(express.json());

// 2. Protección de contraseñas

function cifrarClave(clave, sal = randomBytes(16).toString("hex")) {
    const hash = scryptSync(clave, sal, 64).toString("hex");
    return sal + ":" + hash;
}

function verificarClave(clave, almacenada) {
    try {
        const [sal, hash] = almacenada.split(":");
        const calculado = scryptSync(clave, sal, 64);
        const original = Buffer.from(hash, "hex");

        return original.length === calculado.length &&
            timingSafeEqual(original, calculado);
    } catch {
        return false;
    }
}

// 3. Archivo de usuarios

function guardarUsuarios(usuarios) {
    const temporal = ARCHIVO + ".tmp";

    fs.writeFileSync(
        temporal,
        JSON.stringify(usuarios, null, 2),
        "utf8"
    );

    fs.renameSync(temporal, ARCHIVO);
}

function iniciarUsuarios() {
    if (fs.existsSync(ARCHIVO)) return;

    guardarUsuarios([
        {
            id: 0,
            correo: "admin@test.com",
            clave: cifrarClave("1234"),
            rol: "ADMINISTRADOR"
        },
        {
            id: 1,
            correo: "cliente1@test.com",
            clave: cifrarClave("1234"),
            rol: "CLIENTE"
        }
    ]);
}

function leerUsuarios() {
    return JSON.parse(
        fs.readFileSync(ARCHIVO, "utf8")
    );
}

function datosPublicos(usuario) {
    return {
        id: usuario.id,
        correo: usuario.correo,
        rol: usuario.rol
    };
}

iniciarUsuarios();

// 4. Crear cuenta

app.post("/api/auth/registro", (req, res) => {
    const correo = String(req.body?.correo || "")
        .trim()
        .toLowerCase();

    const clave = req.body?.clave;

    const correoValido =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);

    if (
        !correoValido ||
        typeof clave !== "string" ||
        clave.length < 4 ||
        clave.length > 128
    ) {
        return res.status(400).json({
            mensaje: "Correo o contraseña inválidos"
        });
    }

    const usuarios = leerUsuarios();

    if (usuarios.some(u => u.correo === correo)) {
        return res.status(409).json({
            mensaje: "El correo ya está registrado"
        });
    }

    const siguienteId = Math.max(
        1,
        ...usuarios.map(u => u.id)
    ) + 1;

    const usuario = {
        id: siguienteId,
        correo,
        clave: cifrarClave(clave),
        rol: "CLIENTE"
    };

    usuarios.push(usuario);
    guardarUsuarios(usuarios);

    return res.status(201).json({
        mensaje: "Cuenta creada correctamente",
        usuario: datosPublicos(usuario)
    });
});

// 5. Iniciar sesión

app.post("/api/auth/login", (req, res) => {
    const correo = String(req.body?.correo || "")
        .trim()
        .toLowerCase();

    const clave = req.body?.clave;

    if (typeof clave !== "string") {
        return res.status(400).json({
            mensaje: "Datos de acceso inválidos"
        });
    }

    const usuario = leerUsuarios().find(
        u => u.correo === correo
    );

    if (
        !usuario ||
        !verificarClave(clave, usuario.clave)
    ) {
        return res.status(401).json({
            mensaje: "Correo o contraseña incorrectos"
        });
    }

    const token = randomBytes(32).toString("hex");

    sesiones.set(token, {
        id: usuario.id,
        vence: Date.now() + 8 * 60 * 60 * 1000
    });

    return res.status(200).json({
        mensaje: "Sesión iniciada",
        token,
        usuario: datosPublicos(usuario)
    });
});

// 6. Verificar sesión

function identificar(req) {
    const encabezado =
        req.headers.authorization || "";

    const token = encabezado.startsWith("Bearer ")
        ? encabezado.slice(7)
        : "";

    const sesion = sesiones.get(token);

    if (!sesion) return null;

    if (Date.now() > sesion.vence) {
        sesiones.delete(token);
        return null;
    }

    return leerUsuarios().find(
        u => u.id === sesion.id
    ) || null;
}

app.get("/api/auth/usuario", (req, res) => {
    const usuario = identificar(req);

    if (!usuario) {
        return res.status(401).json({
            mensaje: "Sesión no válida"
        });
    }

    return res.status(200).json(
        datosPublicos(usuario)
    );
});

// 7. Validación de tokens para servicios SOA

app.get("/api/auth/validar", (req, res) => {
    const usuario = identificar(req);

    if (!usuario) {
        return res.status(401).json({
            valido: false,
            mensaje: "Token inválido o sesión vencida"
        });
    }

    return res.status(200).json({
        valido: true,
        usuario: datosPublicos(usuario)
    });
});


// 8. Cerrar sesión

app.post("/api/auth/logout", (req, res) => {
    const token =
        (req.headers.authorization || "")
            .replace(/^Bearer /, "");

    sesiones.delete(token);

    return res.status(200).json({
        mensaje: "Sesión cerrada"
    });
});

// 9. Iniciar API

if (require.main === module) {
    app.listen(PORT, () => {
        console.log("AUTENTICACIÓN - TELETIENDA SOA");
        console.log("Puerto:", PORT);
        console.log("Estado: ACTIVO");
    });
}

module.exports = app;
