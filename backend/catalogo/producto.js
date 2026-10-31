
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

// 1. Configuración

const archivo = path.join(__dirname, "productos.json");

// 2. Modelo Producto

class Producto {
    constructor(id, nombre, precio, descripcion) {
        this.id = id;
        this.nombre = nombre;
        this.precio = precio;
        this.descripcion = descripcion;
    }
}

// 3. Productos iniciales

const productosIniciales = [
    new Producto(
        1,
        "Computador portátil Lenovo",
        1850000,
        "Computador portátil de 8 GB RAM y 512 GB SSD"
    ),
    new Producto(
        2,
        "Mouse inalámbrico Logitech",
        75000,
        "Mouse inalámbrico de conexión USB"
    ),
    new Producto(
        3,
        "Teclado mecánico Redragon",
        180000,
        "Teclado mecánico para computador"
    ),
    new Producto(
        4,
        "Monitor Samsung 24 pulgadas",
        650000,
        "Monitor Full HD de 24 pulgadas"
    )
];

// 4. Persistencia de datos

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

function inicializarCatalogo() {
    if (!fs.existsSync(archivo)) {
        guardarDatos({
            siguienteId: 5,
            productos: productosIniciales
        });
    }
}

function leerDatos() {
    return JSON.parse(
        fs.readFileSync(archivo, "utf8")
    );
}

inicializarCatalogo();

// 5. Validación de productos

function validarProducto(datos) {
    const { nombre, precio, descripcion } = datos;

    if (
        typeof nombre !== "string" ||
        !nombre.trim()
    ) {
        throw new Error(
            "El nombre del producto es obligatorio"
        );
    }

    if (
        typeof precio !== "number" ||
        !Number.isFinite(precio) ||
        precio <= 0
    ) {
        throw new Error(
            "El precio debe ser mayor que cero"
        );
    }

    if (
        typeof descripcion !== "string" ||
        !descripcion.trim()
    ) {
        throw new Error(
            "La descripción del producto es obligatoria"
        );
    }
}

// 6. Crear producto

function crearProducto(datos) {
    validarProducto(datos);

    const almacenamiento = leerDatos();

    const producto = new Producto(
        almacenamiento.siguienteId,
        datos.nombre.trim(),
        datos.precio,
        datos.descripcion.trim()
    );

    almacenamiento.productos.push(producto);
    almacenamiento.siguienteId++;

    guardarDatos(almacenamiento);

    return producto;
}

// 7. Consultar productos

function obtenerProductos() {
    return leerDatos().productos;
}

function obtenerProductoPorId(id) {
    return obtenerProductos().find(
        producto => producto.id === id
    ) || null;
}

// 8. Actualizar producto

function actualizarProducto(id, datos) {
    const almacenamiento = leerDatos();

    const producto = almacenamiento.productos.find(
        producto => producto.id === id
    );

    if (!producto) {
        return null;
    }

    const actualizado = {
        nombre: datos.nombre ?? producto.nombre,
        precio: datos.precio ?? producto.precio,
        descripcion: datos.descripcion ?? producto.descripcion
    };

    validarProducto(actualizado);

    producto.nombre = actualizado.nombre.trim();
    producto.precio = actualizado.precio;
    producto.descripcion = actualizado.descripcion.trim();

    guardarDatos(almacenamiento);

    return producto;
}

// 9. Eliminar producto

function eliminarProducto(id) {
    const almacenamiento = leerDatos();

    const indice = almacenamiento.productos.findIndex(
        producto => producto.id === id
    );

    if (indice === -1) {
        return false;
    }

    almacenamiento.productos.splice(indice, 1);

    guardarDatos(almacenamiento);

    return true;
}

// 10. Exportar funciones

module.exports = {
    Producto,
    crearProducto,
    obtenerProductos,
    obtenerProductoPorId,
    actualizarProducto,
    eliminarProducto
};
