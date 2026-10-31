
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// 1. Configuración

const HOST = "127.0.0.1";
const PORT = 3000;

const ORIGENES = [
    ["/api/auth", 3005],
    ["/api/productos", 3001],
    ["/api/inventario", 3002],
    ["/api/pedidos", 3003],
    ["/api/seguimiento", 3004]
];

const ESTATICOS = {
    "/": [
        "index.html",
        "text/html; charset=utf-8"
    ],
    "/index.html": [
        "index.html",
        "text/html; charset=utf-8"
    ],
    "/estilos.css": [
        "estilos.css",
        "text/css; charset=utf-8"
    ],
    "/app.js": [
        "app.js",
        "text/javascript; charset=utf-8"
    ],
    "/api.js": [
        "api.js",
        "text/javascript; charset=utf-8"
    ]
};

// 2. Crear servidor

const servidor = http.createServer((req, res) => {
    const ruta = new URL(
        req.url,
        `http://${HOST}:${PORT}`
    ).pathname;

    // 3. Identificar llamadas REST

    const destino = ORIGENES.find(
        ([prefijo]) =>
            ruta === prefijo ||
            ruta.startsWith(prefijo + "/")
    );

    if (destino) {
        const encabezados = {};

        if (req.headers.authorization) {
            encabezados.authorization =
                req.headers.authorization;
        }

        if (req.headers["content-type"]) {
            encabezados["content-type"] =
                req.headers["content-type"];
        }

        if (req.headers.accept) {
            encabezados.accept = req.headers.accept;
        }

        // 4. Redirigir al servicio SOA

        const proxy = http.request(
            {
                hostname: HOST,
                port: destino[1],
                path: req.url,
                method: req.method,
                headers: encabezados,
                timeout: 15000
            },
            respuesta => {
                res.writeHead(
                    respuesta.statusCode || 502,
                    {
                        "content-type":
                            respuesta.headers["content-type"] ||
                            "application/json; charset=utf-8",
                        "cache-control": "no-store"
                    }
                );

                respuesta.pipe(res);
            }
        );

        proxy.on("timeout", () => {
            proxy.destroy(
                new Error("Tiempo de espera agotado")
            );
        });

        proxy.on("error", () => {
            if (!res.headersSent) {
                res.writeHead(
                    502,
                    {
                        "content-type": "application/json"
                    }
                );

                res.end(JSON.stringify({
                    mensaje: "Servicio SOA no disponible"
                }));
            } else {
                res.destroy();
            }
        });

        req.pipe(proxy);
        return;
    }

    // 5. Servir archivos del frontend

    const archivo = ESTATICOS[ruta];

    if (!archivo || req.method !== "GET") {
        res.writeHead(404);
        res.end("No encontrado");
        return;
    }

    res.writeHead(
        200,
        {
            "content-type": archivo[1],
            "cache-control": "no-store",
            "x-content-type-options": "nosniff"
        }
    );

    fs.createReadStream(
        path.join(__dirname, archivo[0])
    ).on("error", () => {
        res.destroy();
    }).pipe(res);
});

// 6. Iniciar frontend

servidor.listen(PORT, HOST, () => {
    console.log(
        "===================================="
    );

    console.log(
        "TELETIENDA SOA - FRONTEND"
    );

    console.log(
        `Servidor: http://${HOST}:${PORT}`
    );

    console.log(
        "Backend requerido: puertos 3001 a 3005"
    );

    console.log(
        "===================================="
    );
});
