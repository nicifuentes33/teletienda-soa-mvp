
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

// 1. Configuración

const ARCHIVO = path.join(
    __dirname,
    "pedidos.json"
);

const REINTENTOS = 5;
const ESPERA_MS = 200;

// 2. Clase Pedido

class Pedido {
    constructor(id, clienteId, productos, total) {
        this.id = id;
        this.clienteId = clienteId;
        this.productos = productos;
        this.total = total;
        this.estado = "PENDIENTE";
        this.fecha = new Date().toISOString();
    }
}

// 3. Espera entre reintentos

function esperar(ms) {
    const bloqueo = new Int32Array(
        new SharedArrayBuffer(4)
    );

    Atomics.wait(bloqueo, 0, 0, ms);
}

// 4. Identificar bloqueos temporales

function esErrorTemporal(error) {
    return [
        "EPERM",
        "EACCES",
        "EBUSY"
    ].includes(error.code);
}

// 5. Leer pedidos

function leerDatos() {
    if (!fs.existsSync(ARCHIVO)) {
        const inicial = {
            siguienteId: 1,
            pedidos: []
        };

        guardarDatos(inicial);

        return inicial;
    }

    const contenido = fs.readFileSync(
        ARCHIVO,
        "utf8"
    );

    if (!contenido.trim()) {
        throw new Error(
            "El archivo pedidos.json está vacío"
        );
    }

    const datos = JSON.parse(contenido);

    if (
        !datos ||
        !Number.isSafeInteger(datos.siguienteId) ||
        datos.siguienteId <= 0 ||
        !Array.isArray(datos.pedidos)
    ) {
        throw new Error(
            "El archivo pedidos.json tiene formato inválido"
        );
    }

    return datos;
}

// 6. Guardar pedidos con reintentos

function guardarDatos(datos) {
    const temporal = ARCHIVO +
        "." +
        process.pid +
        "." +
        randomBytes(4).toString("hex") +
        ".tmp";

    fs.writeFileSync(
        temporal,
        JSON.stringify(datos, null, 2),
        "utf8"
    );

    try {
        for (
            let intento = 1;
            intento <= REINTENTOS;
            intento++
        ) {
            try {
                fs.renameSync(
                    temporal,
                    ARCHIVO
                );

                return;

            } catch (error) {
                if (
                    !esErrorTemporal(error) ||
                    intento === REINTENTOS
                ) {
                    throw error;
                }

                console.log(
                    "[PEDIDOS] Archivo bloqueado. Reintento " +
                    intento +
                    " de " +
                    REINTENTOS
                );

                esperar(ESPERA_MS * intento);
            }
        }

    } finally {
        if (fs.existsSync(temporal)) {
            try {
                fs.unlinkSync(temporal);
            } catch {
                console.error(
                    "[PEDIDOS] No se pudo eliminar el archivo temporal"
                );
            }
        }
    }
}

// 7. Validar solicitud

function validarSolicitud(clienteId, productos) {
    if (
        !Number.isSafeInteger(clienteId) ||
        clienteId <= 0
    ) {
        throw new Error(
            "El clienteId debe ser un entero positivo"
        );
    }

    if (
        !Array.isArray(productos) ||
        productos.length === 0
    ) {
        throw new Error(
            "El pedido debe contener al menos un producto"
        );
    }

    for (const item of productos) {
        if (
            !item ||
            !Number.isSafeInteger(item.productoId) ||
            item.productoId <= 0 ||
            !Number.isSafeInteger(item.cantidad) ||
            item.cantidad <= 0
        ) {
            throw new Error(
                "Cada producto necesita un ID y una cantidad válida"
            );
        }
    }
}

// 8. Agrupar productos repetidos

function agruparProductos(productos) {
    const cantidades = new Map();

    for (const { productoId, cantidad } of productos) {
        const suma =
            (cantidades.get(productoId) || 0) +
            cantidad;

        if (!Number.isSafeInteger(suma)) {
            throw new Error(
                "Cantidad demasiado grande"
            );
        }

        cantidades.set(
            productoId,
            suma
        );
    }

    return [...cantidades].map(
        ([productoId, cantidad]) => ({
            productoId,
            cantidad
        })
    );
}

// 9. Crear pedido

function crearPedido(clienteId, productosValidados) {
    const datos = leerDatos();

    if (!Number.isSafeInteger(datos.siguienteId)) {
        throw new Error(
            "El siguiente ID de pedido no es válido"
        );
    }

    const id = datos.siguienteId;

    const total = productosValidados.reduce(
        (suma, producto) =>
            suma + producto.subtotal,
        0
    );

    if (
        !Number.isSafeInteger(total) ||
        total < 0
    ) {
        throw new Error(
            "Total del pedido fuera del rango permitido"
        );
    }

    const pedido = new Pedido(
        id,
        clienteId,
        productosValidados,
        total
    );

    datos.pedidos.push(pedido);
    datos.siguienteId++;

    guardarDatos(datos);

    return pedido;
}

// 10. Consultar todos los pedidos

function obtenerPedidos() {
    return leerDatos().pedidos;
}

// 11. Consultar pedido por ID

function obtenerPedidoPorId(id) {
    return obtenerPedidos().find(
        pedido => pedido.id === id
    ) || null;
}

// 12. Exportar funciones

module.exports = {
    Pedido,
    validarSolicitud,
    agruparProductos,
    crearPedido,
    obtenerPedidos,
    obtenerPedidoPorId
};
