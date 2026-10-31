
const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomBytes } = require("node:crypto");

// 1. Configuración

const BASE = path.resolve(__dirname, "..");
const DESTINO_BASE = path.join(BASE, "respaldos");

const ARCHIVOS = [
    "catalogo/productos.json",
    "inventario/inventario.json",
    "pedidos/pedidos.json",
    "seguimiento/seguimiento.json",
    "auth/usuarios.json",
    "auth/carritos.json"
];

// 2. Calcular huella digital

function sha256(contenido) {
    return createHash("sha256")
        .update(contenido)
        .digest("hex");
}

// 3. Comprobar datos

function leerArchivo(relativo) {
    const origen = path.join(BASE, relativo);
    const contenido = fs.readFileSync(origen);

    JSON.parse(contenido.toString("utf8"));

    return contenido;
}

// 4. Crear respaldo

function crearRespaldo() {
    const datos = ARCHIVOS.map(relativo => ({
        relativo,
        contenido: leerArchivo(relativo)
    }));

    const fecha = new Date().toISOString();

    const nombre = fecha.replace(/[:.]/g, "-") +
        "-" +
        randomBytes(3).toString("hex");

    const destino = path.join(
        DESTINO_BASE,
        nombre
    );

    fs.mkdirSync(destino, {
        recursive: true
    });

    const manifiesto = {
        proyecto: "Teletienda SOA",
        fecha,
        totalArchivos: datos.length,
        archivos: []
    };

    // 5. Copiar archivos

    for (const archivo of datos) {
        const salida = path.join(
            destino,
            archivo.relativo
        );

        fs.mkdirSync(path.dirname(salida), {
            recursive: true
        });

        fs.writeFileSync(
            salida,
            archivo.contenido,
            { flag: "wx" }
        );

        manifiesto.archivos.push({
            ruta: archivo.relativo,
            bytes: archivo.contenido.length,
            sha256: sha256(archivo.contenido)
        });
    }

    // 6. Guardar manifiesto

    fs.writeFileSync(
        path.join(destino, "MANIFIESTO.json"),
        JSON.stringify(manifiesto, null, 2),
        "utf8"
    );

    console.log("\nRESPALDO COMPLETADO");
    console.log("Ubicación:", destino);
    console.log("Archivos:", datos.length);
    console.log("Fecha:", fecha);
    console.log(
        "La clave interna SOA no se ha respaldado."
    );
}

// 7. Ejecutar

try {
    crearRespaldo();

} catch (error) {
    console.error(
        "ERROR AL CREAR RESPALDO:",
        error.message
    );

    process.exitCode = 1;
}
