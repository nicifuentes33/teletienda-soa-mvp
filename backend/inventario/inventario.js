
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

// 1. Configuración

const archivo = path.join(__dirname, "inventario.json");

// 2. Persistencia de datos

function leerDatos() {
    return JSON.parse(
        fs.readFileSync(archivo, "utf8")
    );
}

function guardarDatos(datos) {
    const temporal = archivo + "." +
        randomBytes(6).toString("hex") + ".tmp";

    try {
        fs.writeFileSync(
            temporal,
            JSON.stringify(datos, null, 2),
            "utf8"
        );

        fs.renameSync(temporal, archivo);

    } finally {
        if (fs.existsSync(temporal)) {
            fs.unlinkSync(temporal);
        }
    }
}

// 3. Consultar inventario

function obtenerInventario() {
    return leerDatos().inventario;
}

function obtenerInventarioPorProducto(productoId) {
    return obtenerInventario().find(
        item => item.productoId === productoId
    ) || null;
}

// 4. Crear inventario

function crearInventario(productoId, cantidadDisponible = 0) {
    if (
        !Number.isSafeInteger(productoId) ||
        productoId <= 0 ||
        !Number.isSafeInteger(cantidadDisponible) ||
        cantidadDisponible < 0
    ) {
        throw new Error("Datos de inventario inválidos");
    }

    const datos = leerDatos();

    if (
        datos.inventario.some(
            item => item.productoId === productoId
        )
    ) {
        throw new Error("El producto ya tiene inventario");
    }

    const nuevo = {
        productoId,
        cantidadDisponible
    };

    datos.inventario.push(nuevo);
    guardarDatos(datos);

    return nuevo;
}

// 5. Actualizar inventario

function actualizarInventario(productoId, cantidadDisponible) {
    if (
        !Number.isSafeInteger(cantidadDisponible) ||
        cantidadDisponible < 0
    ) {
        throw new Error("Cantidad inválida");
    }

    const datos = leerDatos();

    const item = datos.inventario.find(
        item => item.productoId === productoId
    );

    if (!item) {
        throw new Error(
            "Producto no encontrado en inventario"
        );
    }

    item.cantidadDisponible = cantidadDisponible;

    guardarDatos(datos);

    return item;
}

// 6. Agrupar productos

function agruparProductos(productos) {
    if (
        !Array.isArray(productos) ||
        productos.length === 0
    ) {
        throw new Error("Debe incluir productos");
    }

    const cantidades = new Map();

    for (const producto of productos) {
        if (
            !producto ||
            !Number.isSafeInteger(producto.productoId) ||
            producto.productoId <= 0 ||
            !Number.isSafeInteger(producto.cantidad) ||
            producto.cantidad <= 0
        ) {
            throw new Error(
                "Producto o cantidad inválida"
            );
        }

        const anterior =
            cantidades.get(producto.productoId) || 0;

        const total = anterior + producto.cantidad;

        if (!Number.isSafeInteger(total)) {
            throw new Error(
                "Cantidad demasiado grande"
            );
        }

        cantidades.set(
            producto.productoId,
            total
        );
    }

    return cantidades;
}

// 7. Verificar disponibilidad

function verificarDisponibilidad(productos) {
    const cantidades = agruparProductos(productos);
    const datos = leerDatos();

    return [...cantidades].every(([id, cantidad]) => {
        const item = datos.inventario.find(
            item => item.productoId === id
        );

        return Boolean(
            item && item.cantidadDisponible >= cantidad
        );
    });
}

// 8. Descontar inventario

function descontarInventario(pedidoId, productos) {
    if (
        !Number.isSafeInteger(pedidoId) ||
        pedidoId <= 0
    ) {
        throw new Error("ID de pedido inválido");
    }

    const cantidades = agruparProductos(productos);
    const datos = leerDatos();

    // 8.1. Evitar descuentos duplicados

    if (datos.pedidosProcesados.includes(pedidoId)) {
        return {
            descontado: false,
            yaProcesado: true
        };
    }

    // 8.2. Verificar existencias

    const disponible = [...cantidades].every(
        ([id, cantidad]) => {
            const item = datos.inventario.find(
                item => item.productoId === id
            );

            return Boolean(
                item && item.cantidadDisponible >= cantidad
            );
        }
    );

    if (!disponible) {
        return {
            descontado: false,
            motivo: "Inventario insuficiente"
        };
    }

    // 8.3. Actualizar cantidades

    for (const [id, cantidad] of cantidades) {
        const item = datos.inventario.find(
            item => item.productoId === id
        );

        item.cantidadDisponible -= cantidad;
    }

    // 8.4. Registrar pedido procesado

    datos.pedidosProcesados.push(pedidoId);

    guardarDatos(datos);

    return {
        descontado: true,
        pedidoId
    };
}

// 9. Eliminar inventario

function eliminarInventario(productoId) {
    const datos = leerDatos();

    const indice = datos.inventario.findIndex(
        item => item.productoId === productoId
    );

    if (indice === -1) {
        return false;
    }

    datos.inventario.splice(indice, 1);

    guardarDatos(datos);

    return true;
}

// 10. Exportar funciones

module.exports = {
    obtenerInventario,
    obtenerInventarioPorProducto,
    crearInventario,
    actualizarInventario,
    verificarDisponibilidad,
    descontarInventario,
    eliminarInventario
};
