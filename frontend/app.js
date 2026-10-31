
// 1. Estado de la aplicación

const $ = id => document.getElementById(id);

const estado = {
    usuario: null,
    productos: [],
    carrito: [],
    mostrarTodos: false,
    vista: "productos",
    modoRegistro: false
};

const formatoCOP = valor =>
    new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0
    }).format(valor);

let temporizadorAviso;

function avisar(mensaje, error = false) {
    const nodo = $("notificacion");

    nodo.textContent = mensaje;

    nodo.className = error
        ? "notificacion visible error"
        : "notificacion visible";

    clearTimeout(temporizadorAviso);

    temporizadorAviso = setTimeout(() => {
        nodo.classList.remove("visible");
    }, 4200);
}

function escapar(texto) {
    return String(texto ?? "").replace(
        /[&<>"']/g,
        caracter => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[caracter]
    );
}

function iconoProducto(nombre) {
    const valor = String(nombre).toLowerCase();

    if (/nintendo|consola|playstation|xbox|juego/.test(valor)) {
        return "🎮";
    }

    if (/celular|iphone|samsung|tel[eé]fono/.test(valor)) {
        return "📱";
    }

    if (/port[aá]til|computador|laptop|pc/.test(valor)) {
        return "💻";
    }

    if (/aud[ií]fono|parlante|sonido/.test(valor)) {
        return "🎧";
    }

    if (/reloj|smartwatch/.test(valor)) {
        return "⌚";
    }

    if (/televisor|tv|pantalla/.test(valor)) {
        return "📺";
    }

    if (/c[aá]mara|foto/.test(valor)) {
        return "📷";
    }

    return "📦";
}

function administrador() {
    return estado.usuario?.rol === "ADMINISTRADOR";
}

function cliente() {
    return estado.usuario?.rol === "CLIENTE";
}

// 2. Alternar entre registro e inicio de sesión

function alternarRegistro(registro) {
    estado.modoRegistro = registro;

    $("tituloAcceso").textContent = registro
        ? "Crear cuenta"
        : "Iniciar sesión";

    $("subtituloAcceso").textContent = registro
        ? "Regístrate para empezar a comprar."
        : "Ingresa tus datos para continuar con tus compras.";

    $("botonAcceso").textContent = registro
        ? "Crear cuenta →"
        : "Ingresar →";

    $("preguntaAcceso").textContent = registro
        ? "¿Ya tienes una cuenta?"
        : "¿Aún no tienes una cuenta?";

    $("alternarAcceso").textContent = registro
        ? "Iniciar sesión"
        : "Crear cuenta";

    $("clave").setAttribute(
        "autocomplete",
        registro ? "new-password" : "current-password"
    );

    $("clave").value = "";
}

// 3. Registrar usuario o iniciar sesión

async function enviarAcceso(evento) {
    evento.preventDefault();

    const correo = $("correo").value.trim();
    const clave = $("clave").value;
    const boton = $("botonAcceso");

    boton.disabled = true;

    try {
        if (estado.modoRegistro) {
            await SOA.registro(correo, clave);

            alternarRegistro(false);

            $("correo").value = correo;
            $("clave").focus();

            avisar(
                "Cuenta creada correctamente. Ahora inicia sesión."
            );

            return;
        }

        const sesion = await SOA.login(
            correo,
            clave
        );

        if (!sesion.token || !sesion.usuario) {
            throw new Error(
                "El servidor no devolvió una sesión válida."
            );
        }

        SOA.configurarToken(sesion.token);

        estado.usuario = sesion.usuario;
        estado.carrito = cargarCarrito();

        $("pantallaAcceso").classList.add("oculto");
        $("pantallaTienda").classList.remove("oculto");

        $("saludoUsuario").textContent =
            sesion.usuario.correo;

        $("rolUsuario").textContent = administrador()
            ? "ADMIN"
            : "CLIENTE";

        $("navCrear").classList.toggle(
            "oculto",
            !administrador()
        );

        $("panelCarrito").classList.toggle(
            "oculto",
            administrador()
        );

        document.querySelector(
            ".contenido-tienda"
        ).classList.toggle(
            "sin-carrito",
            administrador()
        );

        mostrarVista("productos");
        await actualizarProductos();

        avisar("¡Bienvenido a Teletienda!");

    } catch (error) {
        avisar(error.message, true);

    } finally {
        boton.disabled = false;
    }
}

// 4. Cerrar sesión

async function cerrarSesion() {
    guardarCarrito();

    try {
        await SOA.logout();
    } catch {
        // Se limpia la sesión local.
    }

    limpiarSesion();

    avisar(
        "Sesión cerrada. Puedes ingresar con otra cuenta."
    );
}

function limpiarSesion() {
    SOA.configurarToken(null);

    estado.usuario = null;
    estado.productos = [];
    estado.carrito = [];
    estado.vista = "productos";
    estado.mostrarTodos = false;

    document.querySelector(
        ".contenido-tienda"
    ).classList.remove("sin-carrito");

    $("pantallaTienda").classList.add("oculto");
    $("pantallaAcceso").classList.remove("oculto");

    $("formAcceso").reset();

    alternarRegistro(false);

    $("buscar").value = "";
    $("correo").focus();
}

// 5. Carrito individual por cliente

function claveCarrito() {
    return `teletienda-carrito-${estado.usuario.id}`;
}

function cargarCarrito() {
    if (!cliente()) {
        return [];
    }

    try {
        const datos = JSON.parse(
            localStorage.getItem(claveCarrito()) || "[]"
        );

        if (!Array.isArray(datos)) {
            return [];
        }

        return datos.filter(item =>
            Number.isSafeInteger(item.productoId) &&
            Number.isSafeInteger(item.cantidad) &&
            item.cantidad > 0
        );

    } catch {
        return [];
    }
}

function guardarCarrito() {
    if (cliente()) {
        localStorage.setItem(
            claveCarrito(),
            JSON.stringify(estado.carrito)
        );
    }
}

// 6. Agregar productos al carrito

function agregarAlCarrito(id) {
    if (!cliente()) {
        avisar(
            "Solo los clientes pueden agregar productos.",
            true
        );
        return;
    }

    const producto = estado.productos.find(
        item => item.id === id
    );

    if (
        !producto ||
        producto.estado !== "DISPONIBLE"
    ) {
        avisar("Producto no disponible.", true);
        return;
    }

    const actual = estado.carrito.find(
        item => item.productoId === id
    );

    const cantidad = actual?.cantidad || 0;

    if (
        cantidad + 1 >
        producto.cantidadInventario
    ) {
        avisar(
            "No hay suficientes existencias.",
            true
        );
        return;
    }

    if (actual) {
        actual.cantidad++;
    } else {
        estado.carrito.push({
            productoId: id,
            cantidad: 1
        });
    }

    guardarCarrito();
    renderizarCarrito();

    avisar("Producto agregado al carrito.");
}

// 7. Cambiar cantidades

function cambiarCantidad(id, cambio) {
    const item = estado.carrito.find(
        producto => producto.productoId === id
    );

    if (!item) {
        return;
    }

    const producto = estado.productos.find(
        producto => producto.id === id
    );

    const nueva = item.cantidad + cambio;

    if (
        nueva > 0 &&
        (!producto ||
        nueva > producto.cantidadInventario)
    ) {
        avisar("Inventario insuficiente.", true);
        return;
    }

    if (nueva <= 0) {
        estado.carrito = estado.carrito.filter(
            item => item.productoId !== id
        );
    } else {
        item.cantidad = nueva;
    }

    guardarCarrito();
    renderizarCarrito();
}

// 8. Mostrar carrito

function renderizarCarrito() {
    if (!cliente()) {
        return;
    }

    let total = 0;
    let unidades = 0;

    const html = estado.carrito.map(item => {
        const producto = estado.productos.find(
            p => p.id === item.productoId
        );

        if (!producto) {
            return `
                <div class="item-carrito">
                    <div class="item-info">
                        <strong>
                            Producto ${item.productoId} no disponible
                        </strong>
                        <button
                            class="quitar-item"
                            data-quitar="${item.productoId}"
                        >
                            Quitar
                        </button>
                    </div>
                </div>
            `;
        }

        total += producto.precio * item.cantidad;
        unidades += item.cantidad;

        return `
            <div class="item-carrito">

                <div class="mini-icono">
                    ${iconoProducto(producto.nombre)}
                </div>

                <div class="item-info">

                    <strong>
                        ${escapar(producto.nombre)}
                    </strong>

                    <small>
                        ${formatoCOP(producto.precio * item.cantidad)}
                    </small>

                    <div class="control-cantidad">

                        <button
                            data-cambio="-1"
                            data-id="${producto.id}"
                        >
                            −
                        </button>

                        <span>${item.cantidad}</span>

                        <button
                            data-cambio="1"
                            data-id="${producto.id}"
                        >
                            +
                        </button>

                        <button
                            class="quitar-item"
                            data-quitar="${producto.id}"
                        >
                            Quitar
                        </button>

                    </div>
                </div>
            </div>
        `;
    }).join("");

    $("itemsCarrito").innerHTML = html || `
        <div class="carrito-vacio">
            <span class="vacio-icono">🛍️</span>
            Tu carrito está vacío.
            <p>
                Explora los productos y comienza a comprar.
            </p>
        </div>
    `;

    $("totalCarrito").textContent = formatoCOP(total);
    $("contadorCarrito").textContent = unidades;
    $("btnComprar").disabled = !estado.carrito.length;
}

// 9. Consultar catálogo

async function actualizarProductos() {
    try {
        const productos = await SOA.productos();

        if (!Array.isArray(productos)) {
            throw new Error(
                "Respuesta de catálogo incorrecta."
            );
        }

        estado.productos = productos;

        renderizarProductos();
        renderizarCarrito();

    } catch (error) {
        avisar(error.message, true);
    }
}

// 10. Mostrar los cuatro productos recientes

function renderizarProductos() {
    const busqueda = $("buscar").value
        .trim()
        .toLocaleLowerCase("es");

    const ordenados = [...estado.productos].sort(
        (a, b) => b.id - a.id
    );

    const filtrados = busqueda
        ? ordenados.filter(producto =>
            `${producto.nombre} ${producto.descripcion}`
                .toLocaleLowerCase("es")
                .includes(busqueda)
        )
        : ordenados;

    const lista = estado.mostrarTodos || busqueda
        ? filtrados
        : filtrados.slice(0, 4);

    $("etiquetaLista").textContent = busqueda
        ? "RESULTADOS DE BÚSQUEDA"
        : estado.mostrarTodos
            ? "CATÁLOGO COMPLETO"
            : "NUESTRAS NOVEDADES";

    $("tituloLista").textContent = busqueda
        ? "Productos encontrados"
        : estado.mostrarTodos
            ? "Todos los productos"
            : "Recién llegados ✦";

    $("subtituloLista").textContent = busqueda
        ? `${lista.length} resultado(s)`
        : estado.mostrarTodos
            ? `${ordenados.length} productos en el catálogo`
            : "Los últimos 4 productos agregados a nuestra tienda";

    $("btnTodos").textContent = estado.mostrarTodos
        ? "Ver recientes ↑"
        : "Mostrar todos ↓";

    $("cuadriculaProductos").innerHTML = lista.map(
        producto => {
            const disponible =
                producto.estado === "DISPONIBLE";

            const stock = Number(
                producto.cantidadInventario || 0
            );

            return `
                <article class="ficha">

                    <div class="ficha-visual">

                        <span class="estado-stock ${disponible ? "" : "agotado"}">
                            ${disponible ? "✓ Disponible" : "Agotado"}
                        </span>

                        ${administrador() ? `
                            <div class="acciones-admin">

                                <button
                                    data-editar="${producto.id}"
                                    title="Editar producto"
                                >
                                    ✎
                                </button>

                                <button
                                    class="eliminar"
                                    data-eliminar="${producto.id}"
                                    title="Eliminar producto"
                                >
                                    ×
                                </button>

                            </div>
                        ` : ""}

                        <span class="producto-icono">
                            ${iconoProducto(producto.nombre)}
                        </span>
                    </div>

                    <div class="ficha-cuerpo">

                        <h3>${escapar(producto.nombre)}</h3>

                        <div class="ficha-descripcion">
                            ${escapar(producto.descripcion)}
                        </div>

                        <div class="ficha-pie">
                            <div>
                                <div class="precio">
                                    ${formatoCOP(producto.precio)}
                                </div>

                                <div class="detalle-stock">
                                    ${stock} unidad(es) disponibles
                                </div>
                            </div>

                            ${cliente() ? `
                                <button
                                    class="boton-agregar"
                                    data-agregar="${producto.id}"
                                    ${disponible ? "" : "disabled"}
                                >
                                    + Agregar
                                </button>
                            ` : ""}
                        </div>

                    </div>
                </article>
            `;
        }
    ).join("");

    $("estadoProductos").classList.toggle(
        "oculto",
        lista.length > 0
    );

    $("estadoProductos").textContent =
        "No encontramos productos con esos criterios.";
}

// 11. Cambiar entre catálogo y pedidos

function mostrarVista(vista) {
    estado.vista = vista;

    document.querySelector(
        ".buscador-contenedor"
    ).classList.toggle(
        "oculto",
        vista !== "productos"
    );

    $("cuadriculaProductos").classList.toggle(
        "oculto",
        vista !== "productos"
    );

    $("estadoProductos").classList.toggle(
        "oculto",
        vista !== "productos" ||
        estado.productos.length > 0
    );

    document.querySelector(
        ".zona-productos > .titulo-seccion"
    ).classList.toggle(
        "oculto",
        vista !== "productos"
    );

    $("vistaPedidos").classList.toggle(
        "oculto",
        vista !== "pedidos"
    );

    $("navInicio").classList.toggle(
        "nav-activo",
        vista === "productos"
    );

    $("navPedidos").classList.toggle(
        "nav-activo",
        vista === "pedidos"
    );

    $("navPedidos").textContent = administrador()
        ? "Todos los pedidos"
        : "Mis pedidos";

    $("tituloPedidos").textContent = administrador()
        ? "Todos los pedidos"
        : "Mis pedidos";

    if (vista === "productos") {
        renderizarProductos();
    } else {
        actualizarPedidos();
    }
}

// 12. Registrar pedido

async function registrarPedido() {
    if (!cliente() || !estado.carrito.length) {
        return;
    }

    if (!confirm("¿Deseas registrar este pedido?")) {
        return;
    }

    const boton = $("btnComprar");
    boton.disabled = true;

    try {
        const productos = estado.carrito.map(
            item => ({
                productoId: item.productoId,
                cantidad: item.cantidad
            })
        );

        const resultado = await SOA.crearPedido(
            productos
        );

        const id = resultado.pedido?.id;

        if (!id) {
            throw new Error(
                "No se recibió el identificador del pedido."
            );
        }

        estado.carrito = [];

        guardarCarrito();
        renderizarCarrito();

        avisar(
            `Pedido #${id} registrado correctamente.`
        );

        mostrarVista("pedidos");

    } catch (error) {
        avisar(error.message, true);

    } finally {
        boton.disabled = false;
        renderizarCarrito();
    }
}

// 13. Consultar pedidos y seguimiento

async function actualizarPedidos() {
    $("listaPedidos").innerHTML = `
        <div class="estado-vacio">
            Consultando pedidos...
        </div>
    `;

    try {
        const pedidos = await SOA.pedidos();

        if (!pedidos.length) {
            $("listaPedidos").innerHTML = `
                <div class="estado-vacio">
                    Todavía no hay pedidos registrados.
                </div>
            `;

            return;
        }

        const registros = await Promise.all(
            pedidos.slice().reverse().map(
                async pedido => {
                    let seguimiento;

                    try {
                        seguimiento = await SOA.seguimiento(
                            pedido.id
                        );
                    } catch {
                        seguimiento = null;
                    }

                    return { pedido, seguimiento };
                }
            )
        );

        $("listaPedidos").innerHTML = registros.map(
            ({ pedido, seguimiento }) => {
                const estadoPedido =
                    seguimiento?.estado ||
                    pedido.estado ||
                    "PENDIENTE";

                const clase = estadoPedido.toLowerCase();

                const fecha = pedido.fecha
                    ? new Date(pedido.fecha).toLocaleString("es-CO")
                    : "Sin fecha";

                const detalle = (pedido.productos || [])
                    .map(item =>
                        `${escapar(item.nombre || "Producto " + item.productoId)} × ${item.cantidad}`
                    )
                    .join(" · ");

                return `
                    <div class="tarjeta-pedido">

                        <div>
                            <h3>
                                Pedido #${pedido.id}
                            </h3>

                            <p>
                                ${administrador()
                                    ? `Cliente ID: ${pedido.clienteId} · `
                                    : ""}
                                ${escapar(fecha)}
                            </p>

                            <p>${detalle}</p>

                            <strong>
                                ${formatoCOP(pedido.total)}
                            </strong>
                        </div>

                        <span class="pastilla-estado ${clase}">
                            ${escapar(estadoPedido)}
                        </span>

                    </div>
                `;
            }
        ).join("");

    } catch (error) {
        $("listaPedidos").innerHTML = `
            <div class="estado-vacio">
                ${escapar(error.message)}
            </div>
        `;
    }
}

// 14. Abrir formulario de producto

function abrirProducto(id = null) {
    if (!administrador()) {
        return;
    }

    const producto = id === null
        ? null
        : estado.productos.find(
            item => item.id === id
        );

    $("formProducto").reset();

    $("productoId").value = producto?.id || "";

    $("tituloDialogo").textContent = producto
        ? "Editar producto"
        : "Crear producto";

    $("grupoInventario").classList.toggle(
        "oculto",
        !!producto
    );

    $("cantidadProducto").required = !producto;

    if (producto) {
        $("nombreProducto").value = producto.nombre;
        $("descripcionProducto").value =
            producto.descripcion;
        $("precioProducto").value = producto.precio;
    }

    $("dialogProducto").showModal();
}

// 15. Crear o editar producto

async function guardarProducto(evento) {
    evento.preventDefault();

    if (!administrador()) {
        return;
    }

    const id = Number(
        $("productoId").value
    ) || null;

    const datos = {
        nombre: $("nombreProducto").value.trim(),
        descripcion:
            $("descripcionProducto").value.trim(),
        precio: Number(
            $("precioProducto").value
        )
    };

    if (
        !datos.nombre ||
        !datos.descripcion ||
        !Number.isSafeInteger(datos.precio) ||
        datos.precio <= 0
    ) {
        avisar(
            "Revisa nombre, descripción y precio.",
            true
        );

        return;
    }

    if (!id) {
        datos.cantidadInventario = Number(
            $("cantidadProducto").value
        );

        if (
            !Number.isSafeInteger(datos.cantidadInventario) ||
            datos.cantidadInventario < 0
        ) {
            avisar(
                "Inventario inicial inválido.",
                true
            );
            return;
        }
    }

    const boton = $("guardarProducto");
    boton.disabled = true;

    try {
        if (id) {
            await SOA.editarProducto(id, datos);
        } else {
            await SOA.crearProducto(datos);
        }

        $("dialogProducto").close();

        await actualizarProductos();

        avisar(
            id
                ? "Producto actualizado."
                : "Producto creado correctamente."
        );

    } catch (error) {
        avisar(error.message, true);

    } finally {
        boton.disabled = false;
    }
}

// 16. Eliminar producto

async function eliminarProducto(id) {
    if (!administrador()) {
        return;
    }

    if (!confirm(
        "¿Eliminar este producto y su inventario?"
    )) {
        return;
    }

    try {
        await SOA.eliminarProducto(id);

        await actualizarProductos();

        avisar("Producto eliminado.");

    } catch (error) {
        avisar(error.message, true);
    }
}

// 17. Eventos de acceso

$("formAcceso").addEventListener(
    "submit",
    enviarAcceso
);

$("alternarAcceso").addEventListener(
    "click",
    () => alternarRegistro(!estado.modoRegistro)
);

$("mostrarClave").addEventListener(
    "click",
    () => {
        const campo = $("clave");

        campo.type = campo.type === "password"
            ? "text"
            : "password";

        $("mostrarClave").textContent =
            campo.type === "password"
                ? "Ver"
                : "Ocultar";
    }
);

$("btnSalir").addEventListener(
    "click",
    cerrarSesion
);

// 18. Eventos de navegación

$("navInicio").addEventListener(
    "click",
    () => mostrarVista("productos")
);

$("enlaceInicio").addEventListener(
    "click",
    evento => {
        evento.preventDefault();
        mostrarVista("productos");
    }
);

$("navPedidos").addEventListener(
    "click",
    () => mostrarVista("pedidos")
);

$("navCrear").addEventListener(
    "click",
    () => abrirProducto()
);

// 19. Eventos del catálogo

$("buscar").addEventListener(
    "input",
    () => {
        renderizarProductos();
    }
);

$("btnTodos").addEventListener(
    "click",
    () => {
        estado.mostrarTodos = !estado.mostrarTodos;
        $("buscar").value = "";
        renderizarProductos();
    }
);

$("btnActualizar").addEventListener(
    "click",
    actualizarProductos
);

$("btnActualizarPedidos").addEventListener(
    "click",
    actualizarPedidos
);

// 20. Eventos del carrito

$("btnComprar").addEventListener(
    "click",
    registrarPedido
);

$("btnVaciar").addEventListener(
    "click",
    () => {
        if (
            estado.carrito.length &&
            confirm("¿Vaciar todo el carrito?")
        ) {
            estado.carrito = [];

            guardarCarrito();
            renderizarCarrito();
        }
    }
);

$("cuadriculaProductos").addEventListener(
    "click",
    evento => {
        const agregar = evento.target.closest(
            "[data-agregar]"
        );

        const editar = evento.target.closest(
            "[data-editar]"
        );

        const eliminar = evento.target.closest(
            "[data-eliminar]"
        );

        if (agregar) {
            agregarAlCarrito(
                Number(agregar.dataset.agregar)
            );
        }

        if (editar) {
            abrirProducto(
                Number(editar.dataset.editar)
            );
        }

        if (eliminar) {
            eliminarProducto(
                Number(eliminar.dataset.eliminar)
            );
        }
    }
);

$("itemsCarrito").addEventListener(
    "click",
    evento => {
        const cambiar = evento.target.closest(
            "[data-cambio]"
        );

        const quitar = evento.target.closest(
            "[data-quitar]"
        );

        if (cambiar) {
            cambiarCantidad(
                Number(cambiar.dataset.id),
                Number(cambiar.dataset.cambio)
            );
        }

        if (quitar) {
            estado.carrito = estado.carrito.filter(
                item =>
                    item.productoId !==
                    Number(quitar.dataset.quitar)
            );

            guardarCarrito();
            renderizarCarrito();
        }
    }
);

// 21. Eventos administrativos

$("formProducto").addEventListener(
    "submit",
    guardarProducto
);

$("cerrarDialogo").addEventListener(
    "click",
    () => $("dialogProducto").close()
);

$("cancelarProducto").addEventListener(
    "click",
    () => $("dialogProducto").close()
);

// 22. Sesión vencida

window.addEventListener(
    "sesion-invalida",
    () => {
        if (estado.usuario) {
            guardarCarrito();
            limpiarSesion();

            avisar(
                "Tu sesión venció. Ingresa nuevamente.",
                true
            );
        }
    }
);
