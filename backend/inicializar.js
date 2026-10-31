
const fs = require("node:fs");
const path = require("node:path");

// 1. Archivos iniciales

const archivos = {
    "auth/usuarios.json": [],
    "auth/carritos.json": {},
    "catalogo/productos.json": {
        siguienteId: 1,
        productos: []
    },
    "inventario/inventario.json": {
        inventario: [],
        pedidosProcesados: []
    },
    "pedidos/pedidos.json": {
        siguienteId: 1,
        pedidos: []
    },
    "seguimiento/seguimiento.json": {
        seguimientos: []
    }
};

// 2. Crear datos faltantes

function inicializar() {
    for (const [nombre, datos] of Object.entries(archivos)) {
        const ruta = path.join(__dirname, nombre);

        fs.mkdirSync(path.dirname(ruta), {
            recursive: true
        });

        try {
            fs.writeFileSync(
                ruta,
                JSON.stringify(datos, null, 2),
                {
                    encoding: "utf8",
                    flag: "wx"
                }
            );

            console.log(`Creado: ${nombre}`);
        } catch (error) {
            if (error.code === "EEXIST") {
                console.log(`Conservado: ${nombre}`);
            } else {
                throw error;
            }
        }
    }

    console.log("Inicialización finalizada.");
}

// 3. Ejecutar

if (require.main === module) {
    inicializar();
}

module.exports = { inicializar };
