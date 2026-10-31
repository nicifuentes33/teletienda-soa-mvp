
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

// 1. Configuración

const ARCHIVO = path.join(__dirname, "seguimiento.json");

const ESTADOS = [
    "PENDIENTE",
    "CONFIRMADO",
    "RECHAZADO"
];

// 2. Modelo Seguimiento

class Seguimiento {
    constructor(pedidoId) {
        this.pedidoId = pedidoId;
        this.estado = "PENDIENTE";
        this.fechaCreacion = new Date().toISOString();

        this.historial = [{
            estado: "PENDIENTE",
            fecha: this.fechaCreacion
        }];
    }
}

// 3. Persistencia de datos

function leerDatos() {
    return JSON.parse(
        fs.readFileSync(ARCHIVO, "utf8")
    );
}

function guardarDatos(datos) {
    const temporal = ARCHIVO + "." +
        randomBytes(6).toString("hex") + ".tmp";

    try {
        fs.writeFileSync(
            temporal,
            JSON.stringify(datos, null, 2),
            "utf8"
        );

        fs.renameSync(temporal, ARCHIVO);

    } finally {
        if (fs.existsSync(temporal)) {
            fs.unlinkSync(temporal);
        }
    }
}

// 4. Registrar seguimiento

function registrarSeguimiento(pedidoId) {
    if (
        !Number.isSafeInteger(pedidoId) ||
        pedidoId <= 0
    ) {
        throw new Error("ID de pedido inválido");
    }

    const datos = leerDatos();

    const existente = datos.seguimientos.find(
        seguimiento => seguimiento.pedidoId === pedidoId
    );

    if (existente) {
        return existente;
    }

    const nuevo = new Seguimiento(pedidoId);

    datos.seguimientos.push(nuevo);
    guardarDatos(datos);

    return nuevo;
}

// 5. Consultar seguimientos

function obtenerSeguimientos() {
    return leerDatos().seguimientos;
}

function obtenerSeguimiento(pedidoId) {
    return obtenerSeguimientos().find(
        seguimiento => seguimiento.pedidoId === pedidoId
    ) || null;
}

// 6. Actualizar estado

function actualizarEstado(pedidoId, nuevoEstado) {
    if (!ESTADOS.includes(nuevoEstado)) {
        throw new Error("Estado no válido");
    }

    const datos = leerDatos();

    const seguimiento = datos.seguimientos.find(
        item => item.pedidoId === pedidoId
    );

    if (!seguimiento) {
        throw new Error("Seguimiento no encontrado");
    }

    // 6.1. Evitar actualizaciones duplicadas

    if (seguimiento.estado === nuevoEstado) {
        return seguimiento;
    }

    // 6.2. Impedir cambios en pedidos finalizados

    if (seguimiento.estado !== "PENDIENTE") {
        throw new Error(
            "No se puede modificar un pedido finalizado"
        );
    }

    // 6.3. Impedir retroceder al estado pendiente

    if (nuevoEstado === "PENDIENTE") {
        throw new Error(
            "Transición de estado inválida"
        );
    }

    // 6.4. Actualizar estado e historial

    seguimiento.estado = nuevoEstado;

    seguimiento.historial.push({
        estado: nuevoEstado,
        fecha: new Date().toISOString()
    });

    guardarDatos(datos);

    return seguimiento;
}

// 7. Exportar funciones

module.exports = {
    Seguimiento,
    registrarSeguimiento,
    obtenerSeguimientos,
    obtenerSeguimiento,
    actualizarEstado
};
