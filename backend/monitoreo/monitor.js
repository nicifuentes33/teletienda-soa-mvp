
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

// 1. Configuración

const BASE = "http://127.0.0.1";

const SERVICIOS = [
    {
        nombre: "Catalogo",
        url: BASE + ":3001/api/catalogo/salud",
        esperado: 200
    },
    {
        nombre: "Inventario",
        url: BASE + ":3002/api/inventario/salud",
        esperado: 200
    },
    {
        nombre: "Pedidos",
        url: BASE + ":3003/api/pedidos",
        esperado: 401
    },
    {
        nombre: "Seguimiento",
        url: BASE + ":3004/api/seguimiento",
        esperado: 401
    },
    {
        nombre: "Autenticacion",
        url: BASE + ":3005/api/auth/usuario",
        esperado: 401
    },
    {
        nombre: "Camunda",
        url: BASE + ":8088/v2/topology",
        esperado: 200
    }
];

const DESTINO = path.resolve(
    __dirname,
    "../evidencias"
);

function configurarEntero(nombre, defecto, minimo, maximo) {
    const valor = process.env[nombre];

    if (valor === undefined || valor === "") {
        return defecto;
    }

    const numero = Number(valor);

    if (
        !Number.isSafeInteger(numero) ||
        numero < minimo ||
        numero > maximo
    ) {
        throw new Error(
            `${nombre} debe estar entre ${minimo} y ${maximo}`
        );
    }

    return numero;
}

const MUESTRAS = configurarEntero(
    "MONITOR_MUESTRAS", 10, 1, 1000
);

const INTERVALO = configurarEntero(
    "MONITOR_INTERVALO_MS", 2000, 0, 60000
);

// 2. Funciones auxiliares

function esperar(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

function redondear(numero) {
    return Math.round(numero * 100) / 100;
}

function nombreFecha() {
    return new Date()
        .toISOString()
        .replace(/[:.]/g, "-");
}

// 3. Medir un servicio

async function medir(servicio, ronda) {
    const inicio = performance.now();

    let codigo = null;
    let error = "";

    try {
        const respuesta = await fetch(
            servicio.url,
            {
                signal: AbortSignal.timeout(5000),
                cache: "no-store"
            }
        );

        codigo = respuesta.status;

    } catch (fallo) {
        error = fallo.message;
    }

    const tiempo = redondear(
        performance.now() - inicio
    );

    return {
        fecha: new Date().toISOString(),
        ronda,
        servicio: servicio.nombre,
        url: servicio.url,
        codigo,
        esperado: servicio.esperado,
        disponible: codigo === servicio.esperado,
        tiempoMs: tiempo,
        error
    };
}

// 4. Calcular estadísticas

function resumir(registros) {
    return SERVICIOS.map(servicio => {
        const mediciones = registros.filter(
            item => item.servicio === servicio.nombre
        );

        const exitosas = mediciones.filter(
            item => item.disponible
        );

        const sumaTiempos = mediciones.reduce(
            (suma, item) => suma + item.tiempoMs,
            0
        );

        return {
            servicio: servicio.nombre,
            muestras: mediciones.length,
            correctas: exitosas.length,
            fallidas: mediciones.length - exitosas.length,
            disponibilidadPorcentaje: redondear(
                exitosas.length * 100 /
                mediciones.length
            ),
            promedioMs: redondear(
                sumaTiempos / mediciones.length
            ),
            maximoMs: redondear(
                Math.max(...mediciones.map(
                    item => item.tiempoMs
                ))
            )
        };
    });
}

// 5. Generar archivo CSV

function generarCSV(registros) {
    const columnas = [
        "fecha",
        "ronda",
        "servicio",
        "url",
        "codigo",
        "esperado",
        "disponible",
        "tiempoMs",
        "error"
    ];

    const escaparCSV = valor => {
        const texto = String(valor ?? "");

        return '"' + texto.replace(/"/g, '""') + '"';
    };

    const filas = registros.map(registro =>
        columnas.map(
            columna => escaparCSV(registro[columna])
        ).join(",")
    );

    return [
        columnas.join(","),
        ...filas
    ].join("\n");
}

// 6. Ejecutar monitoreo

async function iniciar() {
    fs.mkdirSync(DESTINO, {
        recursive: true
    });

    console.log("\nTELETIENDA SOA - MONITOREO");
    console.log("Servicios:", SERVICIOS.length);
    console.log("Rondas:", MUESTRAS);
    console.log("Intervalo:", INTERVALO, "ms\n");

    const registros = [];
    const fechaInicio = new Date().toISOString();

    for (let ronda = 1; ronda <= MUESTRAS; ronda++) {
        console.log(
            `Ronda ${ronda} de ${MUESTRAS}`
        );

        const resultados = await Promise.all(
            SERVICIOS.map(
                servicio => medir(servicio, ronda)
            )
        );

        registros.push(...resultados);

        for (const resultado of resultados) {
            console.log(
                resultado.servicio.padEnd(15),
                resultado.disponible ? "OK" : "FALLO",
                "HTTP:",
                resultado.codigo ?? "SIN RESPUESTA",
                "Tiempo:",
                resultado.tiempoMs,
                "ms"
            );
        }

        if (ronda < MUESTRAS) {
            await esperar(INTERVALO);
        }
    }

    // 7. Resultados

    const resumen = resumir(registros);
    const etiqueta = nombreFecha();

    const archivoJSON = path.join(
        DESTINO,
        `monitoreo-${etiqueta}.json`
    );

    const archivoCSV = path.join(
        DESTINO,
        `monitoreo-${etiqueta}.csv`
    );

    const reporte = {
        proyecto: "Teletienda SOA",
        inicio: fechaInicio,
        fin: new Date().toISOString(),
        totalMuestras: registros.length,
        rondas: MUESTRAS,
        intervaloMs: INTERVALO,
        resumen,
        registros
    };

    fs.writeFileSync(
        archivoJSON,
        JSON.stringify(reporte, null, 2),
        "utf8"
    );

    fs.writeFileSync(
        archivoCSV,
        generarCSV(registros),
        "utf8"
    );

    console.log("\nRESULTADOS DEL MONITOREO");
    console.table(resumen);

    console.log("Archivo JSON:", archivoJSON);
    console.log("Archivo CSV:", archivoCSV);

    if (resumen.some(item => item.fallidas > 0)) {
        process.exitCode = 1;
    }
}

// 8. Iniciar

iniciar().catch(error => {
    console.error(
        "Error del monitoreo:",
        error.message
    );

    process.exitCode = 1;
});
