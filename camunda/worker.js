
const CAMUNDA = "http://localhost:8088/v2";

// 1. Configuración

const API = {
    pedidos: "http://127.0.0.1:3003/api/pedidos",
    inventario: "http://127.0.0.1:3002/api/inventario",
    seguimiento: "http://127.0.0.1:3004/api/seguimiento"
};

const JOB_TYPES = [
    "registrar-pedido",
    "verificar-inventario",
    "descontar-inventario",
    "confirmar-pedido",
    "rechazar-pedido",
    "seguimiento-confirmado",
    "seguimiento-rechazado"
];

// 2. Seguridad interna

function obtenerClaveInterna() {
    const clave = process.env.SOA_INTERNAL_KEY;

    if (
        typeof clave !== "string" ||
        clave.length < 32
    ) {
        throw new Error(
            "SOA_INTERNAL_KEY no está configurada correctamente"
        );
    }

    return clave;
}

function esServicioInterno(url) {
    return Object.values(API).some(
        base => url === base || url.startsWith(base + "/")
    );
}

// 3. Comunicación HTTP

async function solicitar(url, method = "GET", body) {
    const headers = {
        "Content-Type": "application/json"
    };

    if (esServicioInterno(url)) {
        headers["x-internal-key"] = obtenerClaveInterna();
    }

    const respuesta = await fetch(url, {
        method,
        headers,
        body: body === undefined
            ? undefined
            : JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
    });

    const texto = await respuesta.text();
    let datos = {};

    if (texto) {
        try {
            datos = JSON.parse(texto);
        } catch {
            throw new Error(
                "Respuesta JSON inválida: " + url
            );
        }
    }

    if (!respuesta.ok) {
        throw new Error(
            datos.mensaje ||
            datos.detail ||
            "Error HTTP " + respuesta.status
        );
    }

    return datos;
}

// 4. Consultar pedido

async function consultarPedido(pedidoId) {
    if (
        !Number.isSafeInteger(pedidoId) ||
        pedidoId <= 0
    ) {
        throw new Error("pedidoId inválido");
    }

    return solicitar(
        API.pedidos + "/" + pedidoId
    );
}

function obtenerItems(pedido) {
    if (!Array.isArray(pedido.productos)) {
        throw new Error(
            "El pedido no contiene productos válidos"
        );
    }

    return pedido.productos.map(producto => ({
        productoId: producto.productoId,
        cantidad: producto.cantidad
    }));
}

// 5. Asegurar seguimiento

async function asegurarSeguimiento(pedidoId) {
    return solicitar(
        API.seguimiento,
        "POST",
        { pedidoId }
    );
}

// 6. Ejecutar tareas BPMN

async function ejecutarTarea(tipo, variables) {
    const pedidoId = Number(variables.pedidoId);

    if (
        !Number.isSafeInteger(pedidoId) ||
        pedidoId <= 0
    ) {
        throw new Error(
            "El proceso no tiene un pedidoId válido"
        );
    }

    console.log(
        "Ejecutando:",
        tipo,
        "Pedido:",
        pedidoId
    );

    switch (tipo) {

        case "registrar-pedido": {
            const pedido = await consultarPedido(
                pedidoId
            );

            if (pedido.estado !== "PENDIENTE") {
                throw new Error(
                    "El pedido no está pendiente"
                );
            }

            return {
                pedidoRegistrado: true
            };
        }

        case "verificar-inventario": {
            const pedido = await consultarPedido(
                pedidoId
            );

            const resultado = await solicitar(
                API.inventario + "/verificar",
                "POST",
                {
                    productos: obtenerItems(pedido)
                }
            );

            return {
                disponible:
                    resultado.disponible === true
            };
        }

        case "descontar-inventario": {
            const pedido = await consultarPedido(
                pedidoId
            );

            const resultado = await solicitar(
                API.inventario + "/descontar",
                "POST",
                {
                    pedidoId,
                    productos: obtenerItems(pedido)
                }
            );

            if (
                !resultado.descontado &&
                !resultado.yaProcesado
            ) {
                throw new Error(
                    "No se pudo descontar inventario"
                );
            }

            return {
                inventarioDescontado: true
            };
        }

        case "confirmar-pedido": {
            if (
                variables.inventarioDescontado !== true
            ) {
                throw new Error(
                    "No se confirmó el descuento de inventario"
                );
            }

            return {
                resultadoPedido: "CONFIRMADO"
            };
        }

        case "rechazar-pedido": {
            return {
                resultadoPedido: "RECHAZADO"
            };
        }

        case "seguimiento-confirmado": {
            await asegurarSeguimiento(pedidoId);

            await solicitar(
                API.seguimiento + "/" + pedidoId,
                "PUT",
                {
                    estado: "CONFIRMADO"
                }
            );

            return {
                estadoFinal: "CONFIRMADO"
            };
        }

        case "seguimiento-rechazado": {
            await asegurarSeguimiento(pedidoId);

            await solicitar(
                API.seguimiento + "/" + pedidoId,
                "PUT",
                {
                    estado: "RECHAZADO"
                }
            );

            return {
                estadoFinal: "RECHAZADO"
            };
        }

        default:
            throw new Error(
                "Job Type desconocido: " + tipo
            );
    }
}

// 7. Activar trabajos en Camunda

async function activarTrabajos(tipo) {
    const resultado = await solicitar(
        CAMUNDA + "/jobs/activation",
        "POST",
        {
            type: tipo,
            worker: "teletienda-worker",
            timeout: 30000,
            maxJobsToActivate: 5,
            requestTimeout: -1
        }
    );

    return resultado.jobs || [];
}

// 8. Completar trabajo

async function completarTrabajo(jobKey, variables) {
    await solicitar(
        CAMUNDA + "/jobs/" + jobKey + "/completion",
        "POST",
        {
            variables
        }
    );
}

// 9. Reportar errores

async function reportarError(job, error) {
    await solicitar(
        CAMUNDA + "/jobs/" + job.jobKey + "/failure",
        "POST",
        {
            retries: Math.max(
                0,
                Number(job.retries || 0) - 1
            ),
            errorMessage: error.message,
            retryBackOff: 1000
        }
    );
}

// 10. Procesar trabajos

async function procesarTrabajo(job) {
    try {
        const variables = await ejecutarTarea(
            job.type,
            job.variables || {}
        );

        await completarTrabajo(
            job.jobKey,
            variables
        );

        console.log(
            "COMPLETADO:",
            job.type,
            "Job:",
            job.jobKey
        );

    } catch (error) {
        console.error(
            "ERROR:",
            job.type,
            error.message
        );

        try {
            await reportarError(
                job,
                error
            );

        } catch (fallo) {
            console.error(
                "No se pudo reportar el error:",
                fallo.message
            );
        }
    }
}

// 11. Ciclo principal

const esperar = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

async function iniciarWorker() {
    obtenerClaveInterna();

    console.log("====================================");
    console.log(" TELETIENDA SOA - CAMUNDA WORKER");
    console.log("====================================");
    console.log("Motor:", CAMUNDA);
    console.log("Estado: ESCUCHANDO TRABAJOS");
    console.log("Seguridad interna: ACTIVA");
    console.log("Presiona Ctrl + C para detener");
    console.log("====================================");

    while (true) {
        for (const tipo of JOB_TYPES) {
            try {
                const trabajos = await activarTrabajos(
                    tipo
                );

                for (const job of trabajos) {
                    await procesarTrabajo(job);
                }

            } catch (error) {
                console.error(
                    "Error de conexión:",
                    tipo,
                    error.message
                );
            }
        }

        await esperar(2000);
    }
}

// 12. Iniciar worker

iniciarWorker().catch(error => {
    console.error(
        "ERROR AL INICIAR WORKER:",
        error.message
    );

    process.exitCode = 1;
});
