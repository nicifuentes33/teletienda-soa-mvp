
// 1. Comunicación HTTP con los servicios SOA

const SOA = (() => {
    let token = null;

    function configurarToken(nuevoToken) {
        token = nuevoToken || null;
    }

    async function solicitar(ruta, metodo = "GET", datos) {
        const headers = {
            Accept: "application/json"
        };

        if (datos !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        let respuesta;

        try {
            respuesta = await fetch(ruta, {
                method: metodo,
                headers,
                body: datos === undefined
                    ? undefined
                    : JSON.stringify(datos),
                signal: AbortSignal.timeout(12000)
            });
        } catch {
            throw new Error(
                "No se pudo conectar con Teletienda. " +
                "Comprueba que el backend esté activo."
            );
        }

        const texto = await respuesta.text();
        let contenido = {};

        try {
            contenido = texto ? JSON.parse(texto) : {};
        } catch {
            throw new Error(
                "El servicio respondió con un formato inesperado."
            );
        }

        if (!respuesta.ok) {
            if (respuesta.status === 401 && token) {
                window.dispatchEvent(
                    new Event("sesion-invalida")
                );
            }

            throw new Error(
                contenido.mensaje ||
                contenido.detail ||
                `Error HTTP ${respuesta.status}`
            );
        }

        return contenido;
    }

    // 2. Operaciones disponibles

    return {
        configurarToken,

        registro: (correo, clave) =>
            solicitar(
                "/api/auth/registro",
                "POST",
                { correo, clave }
            ),

        login: (correo, clave) =>
            solicitar(
                "/api/auth/login",
                "POST",
                { correo, clave }
            ),

        logout: () =>
            solicitar(
                "/api/auth/logout",
                "POST"
            ),

        productos: () =>
            solicitar("/api/productos"),

        crearProducto: datos =>
            solicitar(
                "/api/productos",
                "POST",
                datos
            ),

        editarProducto: (id, datos) =>
            solicitar(
                `/api/productos/${id}`,
                "PUT",
                datos
            ),

        eliminarProducto: id =>
            solicitar(
                `/api/productos/${id}`,
                "DELETE"
            ),

        pedidos: () =>
            solicitar("/api/pedidos"),

        crearPedido: productos =>
            solicitar(
                "/api/pedidos",
                "POST",
                { productos }
            ),

        seguimiento: pedidoId =>
            solicitar(
                `/api/seguimiento/${pedidoId}`
            )
    };
})();
