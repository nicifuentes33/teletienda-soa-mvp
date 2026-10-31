
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

// 1. Configuración

const BASE = path.resolve(__dirname, "..");
const RESPALDOS = path.join(BASE, "respaldos");

// 2. Calcular huella digital

function sha256(contenido) {
    return createHash("sha256")
        .update(contenido)
        .digest("hex");
}

// 3. Buscar el último respaldo

function ultimoRespaldo() {
    if (!fs.existsSync(RESPALDOS)) {
        throw new Error(
            "Todavía no existe la carpeta respaldos."
        );
    }

    const carpetas = fs.readdirSync(
        RESPALDOS,
        { withFileTypes: true }
    )
        .filter(item => item.isDirectory())
        .map(item => item.name)
        .sort()
        .reverse();

    if (!carpetas.length) {
        throw new Error(
            "No existen respaldos para verificar."
        );
    }

    return path.join(
        RESPALDOS,
        carpetas[0]
    );
}

// 4. Verificar archivos

function verificar() {
    const carpeta = ultimoRespaldo();

    const rutaManifiesto = path.join(
        carpeta,
        "MANIFIESTO.json"
    );

    const manifiesto = JSON.parse(
        fs.readFileSync(rutaManifiesto, "utf8")
    );

    if (!Array.isArray(manifiesto.archivos)) {
        throw new Error(
            "El manifiesto no tiene una lista válida."
        );
    }

    const resultados = [];

    for (const archivo of manifiesto.archivos) {
        const ruta = path.resolve(
            carpeta,
            archivo.ruta
        );

        // 5. Evitar rutas fuera del respaldo

        if (!ruta.startsWith(carpeta + path.sep)) {
            throw new Error(
                "Ruta de respaldo no permitida."
            );
        }

        let correcto = false;
        let detalle = "OK";

        try {
            const contenido = fs.readFileSync(
                ruta
            );

            JSON.parse(
                contenido.toString("utf8")
            );

            const huella = sha256(contenido);

            correcto =
                huella === archivo.sha256 &&
                contenido.length === archivo.bytes;

            if (!correcto) {
                detalle = "Huella o tamaño diferente";
            }

        } catch (error) {
            detalle = error.message;
        }

        resultados.push({
            archivo: archivo.ruta,
            correcto,
            detalle
        });
    }

    // 6. Mostrar resultados

    console.log("\nVERIFICACIÓN DE RESPALDO");
    console.log("Carpeta:", carpeta);

    console.table(resultados);

    const todosCorrectos =
        resultados.length === 6 &&
        resultados.every(item => item.correcto);

    if (!todosCorrectos) {
        throw new Error(
            "El respaldo no superó la verificación."
        );
    }

    console.log(
        "RESULTADO: RESPALDO ÍNTEGRO"
    );

    console.log(
        "Se verificaron los seis archivos JSON."
    );
}

// 7. Ejecutar

try {
    verificar();

} catch (error) {
    console.error(
        "ERROR DE VERIFICACIÓN:",
        error.message
    );

    process.exitCode = 1;
}
