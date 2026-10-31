
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const readline = require("node:readline/promises");

// 1. Configuración general

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const CAMUNDA_URL = "http://localhost:8088/v2";

const WORKER_ARCHIVO = path.resolve(
    __dirname,
    "../camunda/worker.js"
);

const CARRITOS_ARCHIVO = path.join(
    __dirname,
    "auth",
    "carritos.json"
);

const CLAVE_ARCHIVO = path.join(
    __dirname,
    "auth",
    ".soa-internal-key"
);

const URLS = {
    catalogo: "http://127.0.0.1:3001/api/productos",
    inventario: "http://127.0.0.1:3002/api/inventario",
    pedidos: "http://127.0.0.1:3003/api/pedidos",
    seguimiento: "http://127.0.0.1:3004/api/seguimiento",
    auth: "http://127.0.0.1:3005/api/auth"
};

const SERVIDORES = [
    {
        nombre: "Inventario",
        puerto: 3002,
        archivo: "inventario/api.js",
        ruta: "/api/inventario/salud",
        estadoEsperado: 200
    },
    {
        nombre: "Catálogo",
        puerto: 3001,
        archivo: "catalogo/api.js",
        ruta: "/api/catalogo/salud",
        estadoEsperado: 200
    },
    {
        nombre: "Pedidos",
        puerto: 3003,
        archivo: "pedidos/api.js",
        ruta: "/api/pedidos",
        estadoEsperado: 401
    },
    {
        nombre: "Seguimiento",
        puerto: 3004,
        archivo: "seguimiento/api.js",
        ruta: "/api/seguimiento",
        estadoEsperado: 401
    },
    {
        nombre: "Autenticación",
        puerto: 3005,
        archivo: "auth/api.js",
        ruta: "/api/auth/usuario",
        estadoEsperado: 401
    }
];

const procesosIniciados = [];

let usuarioActual = null;
let tokenActual = null;
let carrito = [];
let workerActivo = false;
let cerrando = false;

// 2. Funciones generales

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function preguntar(mensaje) {
    return (await rl.question(mensaje)).trim();
}

async function pausa() {
    await preguntar("\nPresiona ENTER para continuar...");
}

function titulo(texto) {
    console.log("\n======================================");
    console.log("  " + texto);
    console.log("======================================");
}

function dinero(valor) {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0
    }).format(valor);
}

async function numero(mensaje) {
    const respuesta = await preguntar(mensaje);

    if (!/^\d+$/.test(respuesta)) {
        return null;
    }

    const valor = Number(respuesta);

    return Number.isSafeInteger(valor) ? valor : null;
}

// 3. Comunicación con las APIs

async function api(url, metodo = "GET", datos, token = null) {
    const headers = {
        "Content-Type": "application/json"
    };

    const serviciosProtegidos = [
        URLS.catalogo,
        URLS.inventario,
        URLS.pedidos,
        URLS.seguimiento
    ];

    const esServicio = serviciosProtegidos.some(
        base => url === base || url.startsWith(base + "/")
    );

    const tokenEnviar = token ||
        (esServicio ? tokenActual : null);

    if (tokenEnviar) {
        headers.Authorization = "Bearer " + tokenEnviar;
    }

    let respuesta;

    try {
        respuesta = await fetch(url, {
            method: metodo,
            headers,
            body: datos === undefined
                ? undefined
                : JSON.stringify(datos),
            signal: AbortSignal.timeout(8000)
        });
    } catch {
        throw new Error("No hay conexión con: " + url);
    }

    const texto = await respuesta.text();
    let resultado = {};

    if (texto) {
        try {
            resultado = JSON.parse(texto);
        } catch {
            throw new Error("Respuesta JSON inválida: " + url);
        }
    }

    if (!respuesta.ok) {
        throw new Error(
            resultado.mensaje ||
            resultado.detail ||
            resultado.error ||
            "Error HTTP " + respuesta.status
        );
    }

    return resultado;
}

// 4. Configuración automática de seguridad

function prepararClaveInterna() {
    const definida = process.env.SOA_INTERNAL_KEY;

    if (definida) {
        if (definida.length < 32) {
            throw new Error(
                "SOA_INTERNAL_KEY debe tener mínimo 32 caracteres."
            );
        }

        console.log(
            "[SEGURIDAD] Clave interna recibida del entorno."
        );

        return;
    }

    fs.mkdirSync(path.dirname(CLAVE_ARCHIVO), {
        recursive: true
    });

    if (!fs.existsSync(CLAVE_ARCHIVO)) {
        const clave = randomBytes(32).toString("hex");

        try {
            fs.writeFileSync(
                CLAVE_ARCHIVO,
                clave,
                {
                    encoding: "utf8",
                    flag: "wx",
                    mode: 0o600
                }
            );

            console.log(
                "[SEGURIDAD] Nueva clave interna creada."
            );
        } catch (error) {
            if (error.code !== "EEXIST") {
                throw error;
            }
        }
    }

    const clave = fs.readFileSync(
        CLAVE_ARCHIVO,
        "utf8"
    ).trim();

    if (!/^[0-9a-f]{64}$/i.test(clave)) {
        throw new Error(
            "El archivo de seguridad interna no es válido."
        );
    }

    process.env.SOA_INTERNAL_KEY = clave;

    console.log(
        "[SEGURIDAD] Clave interna configurada correctamente."
    );
}

// 5. Verificación de servicios

function puertoActivo(puerto) {
    return new Promise(resolve => {
        const socket = net.createConnection({
            host: "127.0.0.1",
            port: puerto
        });

        let finalizado = false;

        function terminar(resultado) {
            if (finalizado) return;

            finalizado = true;
            socket.destroy();
            resolve(resultado);
        }

        socket.once("connect", () => terminar(true));
        socket.once("error", () => terminar(false));
        socket.setTimeout(700, () => terminar(false));
    });
}

async function verificarApi(servicio) {
    try {
        const respuesta = await fetch(
            `http://127.0.0.1:${servicio.puerto}${servicio.ruta}`,
            {
                signal: AbortSignal.timeout(3000)
            }
        );

        return respuesta.status === servicio.estadoEsperado;
    } catch {
        return false;
    }
}

// 6. Ejecutar procesos Node.js

function ejecutarProceso(archivo, nombre) {
    if (!fs.existsSync(archivo)) {
        throw new Error("No existe el archivo: " + archivo);
    }

    const proceso = spawn(
        process.execPath,
        [archivo],
        {
            cwd: __dirname,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env
        }
    );

    const registro = {
        nombre,
        proceso,
        error: "",
        terminado: false
    };

    procesosIniciados.push(registro);

    proceso.stdout.on("data", datos => {
        const texto = datos.toString().trim();

        if (texto && nombre === "Worker Camunda") {
            console.log("\n[CAMUNDA] " + texto);
        }
    });

    proceso.stderr.on("data", datos => {
        const texto = datos.toString().trim();

        registro.error += texto + "\n";

        if (nombre === "Worker Camunda") {
            console.error("[CAMUNDA ERROR]", texto);
        }
    });

    proceso.on("error", error => {
        registro.error += error.message + "\n";
        registro.terminado = true;

        console.error("[ERROR]", nombre, error.message);
    });

    proceso.on("exit", (codigo, señal) => {
        registro.terminado = true;

        if (!cerrando && nombre === "Worker Camunda") {
            workerActivo = false;

            console.error(
                "[CAMUNDA] Worker finalizado:",
                codigo,
                señal
            );
        }
    });

    return registro;
}

// 7. Inicio automático de servicios

async function esperarApi(servicio, registro) {
    for (let intento = 0; intento < 40; intento++) {
        if (await verificarApi(servicio)) {
            return;
        }

        if (registro.terminado) {
            throw new Error(
                servicio.nombre +
                " terminó antes de iniciar.\n" +
                registro.error
            );
        }

        await esperar(250);
    }

    throw new Error(
        "El servicio " +
        servicio.nombre +
        " no respondió a tiempo.\n" +
        registro.error
    );
}

async function iniciarServicios() {
    titulo("INICIANDO SERVICIOS SOA");

    for (const servicio of SERVIDORES) {
        if (await puertoActivo(servicio.puerto)) {
            if (!(await verificarApi(servicio))) {
                throw new Error(
                    "Puerto " + servicio.puerto +
                    " ocupado, pero " +
                    servicio.nombre +
                    " no responde correctamente."
                );
            }

            console.log(
                "[EXISTENTE]",
                servicio.nombre,
                "- Puerto",
                servicio.puerto
            );

            continue;
        }

        const archivo = path.join(
            __dirname,
            servicio.archivo
        );

        const registro = ejecutarProceso(
            archivo,
            servicio.nombre
        );

        await esperarApi(servicio, registro);

        console.log(
            "[ACTIVO]",
            servicio.nombre,
            "- Puerto",
            servicio.puerto
        );
    }

    console.log(
        "\nLos cinco servicios SOA están disponibles."
    );
}

// 8. Conexión con Camunda 8

async function verificarCamunda() {
    try {
        const resultado = await api(
            CAMUNDA_URL + "/topology"
        );

        console.log(
            "[CAMUNDA] Motor conectado:",
            resultado.gatewayVersion
        );

        return true;
    } catch {
        console.log("[CAMUNDA] Motor no disponible.");
        return false;
    }
}

async function iniciarWorker() {
    titulo("INTEGRACIÓN CON CAMUNDA 8");

    if (!(await verificarCamunda())) {
        console.log(
            "Activa Docker y Camunda para procesar pedidos."
        );
        return;
    }

    if (!fs.existsSync(WORKER_ARCHIVO)) {
        console.log(
            "[CAMUNDA] No existe:",
            WORKER_ARCHIVO
        );
        return;
    }

    const registro = ejecutarProceso(
        WORKER_ARCHIVO,
        "Worker Camunda"
    );

    await esperar(1500);

    if (registro.terminado) {
        console.log(
            "[CAMUNDA] No se pudo iniciar el worker."
        );
        console.log(registro.error);
        return;
    }

    workerActivo = true;

    console.log("[CAMUNDA] Worker iniciado.");
    console.log("[CAMUNDA] Escuchando tareas BPMN.");
    console.log(
        "[CAMUNDA] Proceso: proceso_pedidos_teletienda"
    );
}

// 9. Cierre de procesos

function cerrarServicios() {
    if (cerrando) return;

    cerrando = true;

    console.log(
        "\nCerrando servicios de Teletienda..."
    );

    for (const registro of procesosIniciados) {
        const proceso = registro.proceso;

        if (
            proceso.exitCode === null &&
            proceso.signalCode === null &&
            !proceso.killed
        ) {
            proceso.kill();
        }
    }
}

// 10. Guardar carritos en JSON

function leerCarritos() {
    if (!fs.existsSync(CARRITOS_ARCHIVO)) {
        return {};
    }

    const contenido = fs.readFileSync(
        CARRITOS_ARCHIVO,
        "utf8"
    );

    if (!contenido.trim()) {
        return {};
    }

    const datos = JSON.parse(contenido);

    if (
        typeof datos !== "object" ||
        datos === null ||
        Array.isArray(datos)
    ) {
        throw new Error(
            "El archivo carritos.json tiene formato inválido."
        );
    }

    return datos;
}

function escribirCarritos(datos) {
    fs.mkdirSync(
        path.dirname(CARRITOS_ARCHIVO),
        { recursive: true }
    );

    const temporal = CARRITOS_ARCHIVO + ".tmp";

    fs.writeFileSync(
        temporal,
        JSON.stringify(datos, null, 2),
        "utf8"
    );

    fs.renameSync(
        temporal,
        CARRITOS_ARCHIVO
    );
}

function cargarCarrito() {
    if (
        !usuarioActual ||
        usuarioActual.rol !== "CLIENTE"
    ) {
        carrito = [];
        return;
    }

    const carritos = leerCarritos();
    const guardado = carritos[String(usuarioActual.id)];

    carrito = Array.isArray(guardado)
        ? guardado.map(item => ({
            productoId: item.productoId,
            cantidad: item.cantidad
        }))
        : [];
}

function guardarCarrito() {
    if (
        !usuarioActual ||
        usuarioActual.rol !== "CLIENTE"
    ) {
        return;
    }

    const carritos = leerCarritos();

    carritos[String(usuarioActual.id)] = carrito.map(
        item => ({
            productoId: item.productoId,
            cantidad: item.cantidad
        })
    );

    escribirCarritos(carritos);
}

// 11. Crear cuenta

async function crearCuenta() {
    titulo("CREAR CUENTA");

    const correo = await preguntar(
        "Correo electrónico: "
    );

    const clave = await preguntar(
        "Contraseña: "
    );

    const resultado = await api(
        URLS.auth + "/registro",
        "POST",
        { correo, clave }
    );

    console.log("\n" + resultado.mensaje);
    console.log("Correo:", resultado.usuario.correo);
    console.log("Ya puedes iniciar sesión.");
}

// 12. Inicio de sesión

async function iniciarSesion() {
    titulo("INICIAR SESIÓN");

    const correo = await preguntar(
        "Correo electrónico: "
    );

    const clave = await preguntar(
        "Contraseña: "
    );

    const resultado = await api(
        URLS.auth + "/login",
        "POST",
        { correo, clave }
    );

    if (!resultado.token || !resultado.usuario) {
        throw new Error(
            "La autenticación no devolvió una sesión válida."
        );
    }

    tokenActual = resultado.token;
    usuarioActual = resultado.usuario;

    console.log("\nInicio de sesión correcto.");
    console.log("Usuario:", usuarioActual.correo);
    console.log("Rol:", usuarioActual.rol);

    try {
        if (usuarioActual.rol === "ADMINISTRADOR") {
            carrito = [];
            await menuAdministrador();

        } else if (usuarioActual.rol === "CLIENTE") {
            cargarCarrito();
            await menuCliente();

        } else {
            throw new Error(
                "Rol de usuario no reconocido."
            );
        }

    } finally {
        await cerrarSesion();
    }
}

// 13. Cierre de sesión

async function cerrarSesion() {
    if (!usuarioActual) return;

    const usuario = usuarioActual;
    const token = tokenActual;

    if (usuario.rol === "CLIENTE") {
        guardarCarrito();
    }

    try {
        if (token) {
            await api(
                URLS.auth + "/logout",
                "POST",
                undefined,
                token
            );
        }
    } catch {
        console.log(
            "No fue posible notificar el cierre de sesión."
        );
    } finally {
        usuarioActual = null;
        tokenActual = null;
        carrito = [];

        console.log("\nSesión cerrada correctamente.");
    }
}

// 14. Catálogo de productos

async function obtenerProductos() {
    return api(URLS.catalogo);
}

async function mostrarProductos() {
    titulo("CATÁLOGO DE PRODUCTOS");

    const lista = await obtenerProductos();

    if (!lista.length) {
        console.log("No hay productos registrados.");
        return lista;
    }

    for (const producto of lista) {
        console.log("\nID:", producto.id);
        console.log("Producto:", producto.nombre);
        console.log("Precio:", dinero(producto.precio));
        console.log("Descripción:", producto.descripcion);

        console.log(
            "Existencias:",
            producto.cantidadInventario ?? "Sin registro"
        );

        console.log("Estado:", producto.estado);

        if (producto.estado === "AGOTADO") {
            console.log(
                "***** PRODUCTO AGOTADO *****"
            );
        }
    }

    return lista;
}

// 15. Agregar producto al carrito

async function agregarCarrito() {
    const lista = await mostrarProductos();

    const id = await numero(
        "\nID del producto: "
    );

    const producto = lista.find(
        p => p.id === id
    );

    if (!producto) {
        console.log("Producto no encontrado.");
        return;
    }

    if (producto.estado !== "DISPONIBLE") {
        console.log("Producto no disponible.");
        return;
    }

    const cantidad = await numero(
        "Cantidad a agregar: "
    );

    if (!cantidad || cantidad < 1) {
        console.log("Cantidad inválida.");
        return;
    }

    const existente = carrito.find(
        p => p.productoId === id
    );

    const actual = existente
        ? existente.cantidad
        : 0;

    if (
        actual + cantidad >
        producto.cantidadInventario
    ) {
        console.log("Inventario insuficiente.");
        return;
    }

    if (existente) {
        existente.cantidad += cantidad;
    } else {
        carrito.push({
            productoId: id,
            cantidad
        });
    }

    guardarCarrito();

    console.log(
        "Producto agregado correctamente."
    );
}

// 16. Consultar carrito

async function mostrarCarrito() {
    titulo("MI CARRITO");

    if (!carrito.length) {
        console.log("El carrito está vacío.");
        return;
    }

    const lista = await obtenerProductos();
    let total = 0;

    for (const item of carrito) {
        const producto = lista.find(
            p => p.id === item.productoId
        );

        if (!producto) {
            console.log(
                "Producto no disponible:",
                item.productoId
            );
            continue;
        }

        const subtotal =
            producto.precio * item.cantidad;

        total += subtotal;

        console.log("\nProducto:", producto.nombre);
        console.log("Cantidad:", item.cantidad);
        console.log("Subtotal:", dinero(subtotal));
    }

    console.log(
        "\nTOTAL ESTIMADO:",
        dinero(total)
    );
}

// 17. Modificar cantidad del carrito

async function cambiarCantidad(aumentar) {
    if (!carrito.length) {
        console.log("El carrito está vacío.");
        return;
    }

    await mostrarCarrito();

    const id = await numero(
        "\nID del producto: "
    );

    const item = carrito.find(
        p => p.productoId === id
    );

    if (!item) {
        console.log(
            "Producto no encontrado en carrito."
        );
        return;
    }

    if (aumentar) {
        const producto = await api(
            URLS.catalogo + "/" + id
        );

        if (
            producto.estado !== "DISPONIBLE" ||
            item.cantidad >= producto.cantidadInventario
        ) {
            console.log("No hay más existencias.");
            return;
        }

        item.cantidad++;
    } else {
        item.cantidad--;

        if (item.cantidad === 0) {
            carrito = carrito.filter(
                p => p.productoId !== id
            );

            guardarCarrito();

            console.log("Producto retirado.");
            return;
        }
    }

    guardarCarrito();

    console.log("Cantidad actualizada.");
}

// 18. Eliminar y vaciar carrito

async function eliminarDelCarrito() {
    if (!carrito.length) {
        console.log("El carrito está vacío.");
        return;
    }

    await mostrarCarrito();

    const id = await numero(
        "\nID a eliminar: "
    );

    const anterior = carrito.length;

    carrito = carrito.filter(
        p => p.productoId !== id
    );

    guardarCarrito();

    console.log(
        carrito.length < anterior
            ? "Producto eliminado del carrito."
            : "Producto no encontrado."
    );
}

function vaciarCarrito() {
    carrito = [];
    guardarCarrito();

    console.log("Carrito vacío.");
}

// 19. Registrar pedido

async function confirmarCompra() {
    if (!carrito.length) {
        console.log("No hay productos en el carrito.");
        return;
    }

    if (
        !usuarioActual ||
        usuarioActual.rol !== "CLIENTE"
    ) {
        throw new Error(
            "Debes iniciar sesión como cliente."
        );
    }

    await mostrarCarrito();

    const confirmar = await preguntar(
        "\n¿Registrar pedido? (s/n): "
    );

    if (confirmar.toLowerCase() !== "s") {
        return;
    }

    const resultado = await api(
        URLS.pedidos,
        "POST",
        {
            productos: carrito
        }
    );

    const pedido = resultado.pedido;

    if (!pedido || !pedido.id) {
        throw new Error(
            "El servicio no devolvió un pedido válido."
        );
    }

    console.log("\nPEDIDO REGISTRADO");
    console.log("Número:", pedido.id);
    console.log("Cliente:", usuarioActual.correo);
    console.log("Total:", dinero(pedido.total));
    console.log("Estado inicial:", pedido.estado);

    carrito = [];
    guardarCarrito();

    titulo("PROCESAMIENTO AUTOMÁTICO");

    if (resultado.camunda?.iniciado === true) {
        console.log(
            "[CORRECTO] Proceso iniciado en Camunda."
        );

        console.log(
            "Instancia:",
            resultado.camunda.processInstanceKey
        );

        console.log(
            "Proceso: proceso_pedidos_teletienda"
        );

        console.log("Estado: EN PROCESAMIENTO");
    } else {
        console.log(
            "[ATENCIÓN] El pedido quedó guardado."
        );

        console.log(
            "No se confirmó el inicio en Camunda."
        );

        console.log(
            "Detalle:",
            resultado.camunda?.detalle ||
            "Sin información adicional"
        );
    }
}

// 20. Consultar mis pedidos

async function consultarMisPedidos() {
    titulo("MIS PEDIDOS");

    const pedidos = await api(URLS.pedidos);

    if (!pedidos.length) {
        console.log("No tienes pedidos registrados.");
        return;
    }

    for (const pedido of pedidos) {
        console.log("\nPedido:", pedido.id);
        console.log("Total:", dinero(pedido.total));
        console.log("Fecha:", pedido.fecha);

        try {
            const seguimiento = await api(
                URLS.seguimiento + "/" + pedido.id
            );

            console.log("Estado:", seguimiento.estado);
        } catch {
            console.log(
                "Seguimiento aún no disponible."
            );
        }
    }
}

// 21. Crear producto

async function crearNuevoProducto() {
    titulo("CREAR PRODUCTO");

    const nombre = await preguntar("Nombre: ");
    const descripcion = await preguntar("Descripción: ");
    const precio = await numero("Precio: ");

    const cantidadInventario = await numero(
        "Inventario inicial: "
    );

    if (
        !nombre ||
        !descripcion ||
        precio === null ||
        precio <= 0 ||
        cantidadInventario === null
    ) {
        console.log("Datos inválidos.");
        return;
    }

    const resultado = await api(
        URLS.catalogo,
        "POST",
        {
            nombre,
            descripcion,
            precio,
            cantidadInventario
        }
    );

    console.log(
        "Producto creado:",
        resultado.producto
    );
}

// 22. Modificar producto

async function modificarProducto() {
    await mostrarProductos();

    const id = await numero(
        "\nID del producto: "
    );

    const actual = await api(
        URLS.catalogo + "/" + id
    );

    console.log(
        "Deja vacío para conservar el dato."
    );

    const nombre = await preguntar(
        "Nombre [" + actual.nombre + "]: "
    );

    const descripcion = await preguntar(
        "Descripción [" + actual.descripcion + "]: "
    );

    const precioTexto = await preguntar(
        "Precio [" + actual.precio + "]: "
    );

    const cambios = {};

    if (nombre) {
        cambios.nombre = nombre;
    }

    if (descripcion) {
        cambios.descripcion = descripcion;
    }

    if (precioTexto) {
        const precio = Number(precioTexto);

        if (
            !Number.isSafeInteger(precio) ||
            precio <= 0
        ) {
            console.log("Precio inválido.");
            return;
        }

        cambios.precio = precio;
    }

    const resultado = await api(
        URLS.catalogo + "/" + id,
        "PUT",
        cambios
    );

    console.log(
        "Producto actualizado:",
        resultado.producto
    );
}

// 23. Eliminar producto

async function eliminarProducto() {
    await mostrarProductos();

    const id = await numero(
        "\nID a eliminar: "
    );

    const confirmar = await preguntar(
        "¿Eliminar definitivamente? (s/n): "
    );

    if (confirmar.toLowerCase() !== "s") {
        return;
    }

    const resultado = await api(
        URLS.catalogo + "/" + id,
        "DELETE"
    );

    console.log(resultado.mensaje);
}

// 24. Ajustar inventario

async function ajustarInventario() {
    await mostrarProductos();

    const id = await numero(
        "\nID del producto: "
    );

    const cantidad = await numero(
        "Nueva cantidad disponible: "
    );

    if (id === null || cantidad === null) {
        console.log("Datos inválidos.");
        return;
    }

    const resultado = await api(
        URLS.inventario + "/" + id,
        "PUT",
        {
            cantidadDisponible: cantidad
        }
    );

    console.log(
        "Inventario actualizado:",
        resultado
    );
}

// 25. Consultar todos los pedidos

async function listarPedidosAdmin() {
    titulo("TODOS LOS PEDIDOS");

    const pedidos = await api(URLS.pedidos);

    if (!pedidos.length) {
        console.log("No hay pedidos registrados.");
        return;
    }

    for (const pedido of pedidos) {
        console.log("\nPedido:", pedido.id);
        console.log("Cliente ID:", pedido.clienteId);
        console.log("Productos:", pedido.productos);
        console.log("Total:", dinero(pedido.total));

        try {
            const seguimiento = await api(
                URLS.seguimiento + "/" + pedido.id
            );

            console.log("Estado:", seguimiento.estado);
        } catch {
            console.log("Estado: SIN SEGUIMIENTO");
        }
    }
}

// 26. Consultar seguimiento

async function verSeguimiento() {
    titulo("SEGUIMIENTO DE PEDIDOS");

    const id = await numero(
        "ID del pedido: "
    );

    if (!id || id <= 0) {
        console.log("ID inválido.");
        return;
    }

    const seguimiento = await api(
        URLS.seguimiento + "/" + id
    );

    console.log("Pedido:", seguimiento.pedidoId);
    console.log("Estado:", seguimiento.estado);
    console.log("Historial:");

    for (const evento of seguimiento.historial) {
        console.log(
            " -",
            evento.fecha,
            evento.estado
        );
    }
}

// 27. Estado de Camunda

async function consultarEstadoCamunda() {
    titulo("ESTADO DE CAMUNDA");

    const conectado = await verificarCamunda();

    console.log(
        "Motor:",
        conectado ? "CONECTADO" : "DESCONECTADO"
    );

    console.log(
        "Worker iniciado por esta aplicación:",
        workerActivo ? "SÍ" : "NO"
    );

    if (conectado) {
        console.log(
            "Proceso BPMN: proceso_pedidos_teletienda"
        );

        console.log(
            "Operate: http://localhost:8088/operate"
        );
    }
}

// 28. Menú cliente

async function menuCliente() {
    let opcion;

    do {
        titulo("MENÚ CLIENTE");

        console.log("Usuario:", usuarioActual.correo);
        console.log("");

        console.log("1. Consultar productos");
        console.log("2. Agregar producto al carrito");
        console.log("3. Ver carrito");
        console.log("4. Aumentar cantidad (+)");
        console.log("5. Disminuir cantidad (-)");
        console.log("6. Eliminar producto del carrito");
        console.log("7. Vaciar carrito");
        console.log("8. Registrar pedido");
        console.log("9. Consultar mis pedidos");
        console.log("0. Cerrar sesión");

        opcion = await preguntar("\nOpción: ");

        try {
            switch (opcion) {
                case "1":
                    await mostrarProductos();
                    break;

                case "2":
                    await agregarCarrito();
                    break;

                case "3":
                    await mostrarCarrito();
                    break;

                case "4":
                    await cambiarCantidad(true);
                    break;

                case "5":
                    await cambiarCantidad(false);
                    break;

                case "6":
                    await eliminarDelCarrito();
                    break;

                case "7":
                    vaciarCarrito();
                    break;

                case "8":
                    await confirmarCompra();
                    break;

                case "9":
                    await consultarMisPedidos();
                    break;

                case "0":
                    break;

                default:
                    console.log("Opción inválida.");
            }
        } catch (error) {
            console.log("ERROR:", error.message);
        }

        if (opcion !== "0") {
            await pausa();
        }

    } while (opcion !== "0");
}

// 29. Menú administrador

async function menuAdministrador() {
    let opcion;

    do {
        titulo("MENÚ ADMINISTRADOR");

        console.log("Usuario:", usuarioActual.correo);
        console.log("");

        console.log("1. Consultar productos");
        console.log("2. Crear producto");
        console.log("3. Modificar producto");
        console.log("4. Eliminar producto");
        console.log("5. Consultar inventario");
        console.log("6. Ajustar inventario");
        console.log("7. Consultar pedidos");
        console.log("8. Consultar seguimiento");
        console.log("9. Consultar estado de Camunda");
        console.log("0. Cerrar sesión");

        opcion = await preguntar("\nOpción: ");

        try {
            switch (opcion) {
                case "1":
                    await mostrarProductos();
                    break;

                case "2":
                    await crearNuevoProducto();
                    break;

                case "3":
                    await modificarProducto();
                    break;

                case "4":
                    await eliminarProducto();
                    break;

                case "5":
                    console.table(
                        await api(URLS.inventario)
                    );
                    break;

                case "6":
                    await ajustarInventario();
                    break;

                case "7":
                    await listarPedidosAdmin();
                    break;

                case "8":
                    await verSeguimiento();
                    break;

                case "9":
                    await consultarEstadoCamunda();
                    break;

                case "0":
                    break;

                default:
                    console.log("Opción inválida.");
            }
        } catch (error) {
            console.log("ERROR:", error.message);
        }

        if (opcion !== "0") {
            await pausa();
        }

    } while (opcion !== "0");
}

// 30. Inicio de Teletienda

async function iniciar() {
    try {
        prepararClaveInterna();

        await iniciarServicios();

        if (process.env.SIN_WORKER !== "1") {
            await iniciarWorker();
        }

        let opcion;

        do {
            titulo("TELETIENDA SOA");

            console.log("Servicios SOA: ACTIVOS");

            console.log(
                "Worker Camunda:",
                workerActivo ? "ACTIVO" : "NO INICIADO"
            );

            console.log("");
            console.log("1. Iniciar sesión");
            console.log("2. Crear cuenta");
            console.log("0. Salir");

            opcion = await preguntar("\nOpción: ");

            try {
                switch (opcion) {
                    case "1":
                        await iniciarSesion();
                        break;

                    case "2":
                        await crearCuenta();
                        break;

                    case "0":
                        console.log(
                            "Aplicación finalizada."
                        );
                        break;

                    default:
                        console.log("Opción inválida.");
                }
            } catch (error) {
                console.log("ERROR:", error.message);
            }

            if (opcion !== "0") {
                await pausa();
            }

        } while (opcion !== "0");

    } finally {
        if (usuarioActual) {
            try {
                await cerrarSesion();
            } catch (error) {
                console.error(
                    "Error al cerrar sesión:",
                    error.message
                );
            }
        }

        rl.close();
        cerrarServicios();
    }
}

// 31. Cierre de Teletienda

rl.on("SIGINT", () => {
    console.log("\nCerrando Teletienda...");

    if (usuarioActual?.rol === "CLIENTE") {
        try {
            guardarCarrito();
        } catch (error) {
            console.error(
                "Error guardando carrito:",
                error.message
            );
        }
    }

    cerrarServicios();
    rl.close();
    process.exit(0);
});

process.on("SIGTERM", () => {
    cerrarServicios();
    process.exit(0);
});

iniciar().catch(error => {
    console.error(
        "\nERROR AL INICIAR TELETIENDA:",
        error.message
    );

    cerrarServicios();
    process.exitCode = 1;
});
