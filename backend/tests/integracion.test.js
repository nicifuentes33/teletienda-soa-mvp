
const test = require("node:test");
const assert = require("node:assert/strict");

// 1. Configuración de las APIs

const API = {
    catalogo: "http://127.0.0.1:3001/api/productos",
    inventario: "http://127.0.0.1:3002/api/inventario",
    pedidos: "http://127.0.0.1:3003/api/pedidos",
    seguimiento: "http://127.0.0.1:3004/api/seguimiento",
    auth: "http://127.0.0.1:3005/api/auth",
    camunda: "http://127.0.0.1:8088/v2"
};

const ADMIN = {
    correo: process.env.TEST_ADMIN_EMAIL ||
        "admin@test.com",
    clave: process.env.TEST_ADMIN_PASSWORD ||
        "1234"
};

const CLIENTE = {
    correo: process.env.TEST_CLIENT_EMAIL ||
        "cliente1@test.com",
    clave: process.env.TEST_CLIENT_PASSWORD ||
        "1234"
};

// 2. Solicitudes HTTP

async function solicitar(url, opciones = {}) {
    const respuesta = await fetch(url, {
        ...opciones,
        signal: AbortSignal.timeout(8000)
    });

    const texto = await respuesta.text();

    let datos = {};

    if (texto) {
        datos = JSON.parse(texto);
    }

    return {
        estado: respuesta.status,
        datos
    };
}

function encabezados(token) {
    return {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
    };
}

async function ingresar(credenciales) {
    const respuesta = await solicitar(
        API.auth + "/login",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(credenciales)
        }
    );

    assert.equal(respuesta.estado, 200);
    assert.ok(respuesta.datos.token);
    assert.ok(respuesta.datos.usuario);

    return respuesta.datos;
}

// 3. Probar disponibilidad de Catálogo

test("I01 - Catálogo está disponible", async () => {
    const respuesta = await solicitar(API.catalogo);

    assert.equal(respuesta.estado, 200);
    assert.ok(Array.isArray(respuesta.datos));
});

// 4. Probar disponibilidad de Inventario

test("I02 - Inventario está disponible", async () => {
    const respuesta = await solicitar(API.inventario);

    assert.equal(respuesta.estado, 200);
    assert.ok(Array.isArray(respuesta.datos));
});

// 5. Bloquear Pedidos sin token

test("I03 - Pedidos exige autenticación", async () => {
    const respuesta = await solicitar(API.pedidos);

    assert.equal(respuesta.estado, 401);
});

// 6. Bloquear Seguimiento sin token

test("I04 - Seguimiento exige autenticación", async () => {
    const respuesta = await solicitar(API.seguimiento);

    assert.equal(respuesta.estado, 401);
});

// 7. Autenticar administrador

test("I05 - Administrador inicia sesión", async () => {
    const sesion = await ingresar(ADMIN);

    assert.equal(
        sesion.usuario.rol,
        "ADMINISTRADOR"
    );
});

// 8. Autenticar cliente

test("I06 - Cliente inicia sesión", async () => {
    const sesion = await ingresar(CLIENTE);

    assert.equal(sesion.usuario.rol, "CLIENTE");
});

// 9. Bloquear token inválido

test("I07 - Rechaza tokens inválidos", async () => {
    const respuesta = await solicitar(
        API.pedidos,
        {
            headers: encabezados(
                "token-de-prueba-no-valido"
            )
        }
    );

    assert.equal(respuesta.estado, 401);
});

// 10. Cliente no puede crear productos

test("I08 - Cliente no puede crear productos", async () => {
    const sesion = await ingresar(CLIENTE);

    const respuesta = await solicitar(
        API.catalogo,
        {
            method: "POST",
            headers: encabezados(sesion.token),
            body: JSON.stringify({
                nombre: "Producto de prueba prohibido",
                descripcion: "No debe crearse",
                precio: 10000,
                cantidadInventario: 1
            })
        }
    );

    assert.equal(respuesta.estado, 403);
});

// 11. Cliente solo consulta sus pedidos

test("I09 - Pedidos filtra por cliente", async () => {
    const sesion = await ingresar(CLIENTE);

    const respuesta = await solicitar(
        API.pedidos,
        {
            headers: encabezados(sesion.token)
        }
    );

    assert.equal(respuesta.estado, 200);
    assert.ok(Array.isArray(respuesta.datos));

    for (const pedido of respuesta.datos) {
        assert.equal(
            pedido.clienteId,
            sesion.usuario.id
        );
    }
});

// 12. Administrador consulta todos los pedidos

test("I10 - Administrador consulta pedidos", async () => {
    const sesion = await ingresar(ADMIN);

    const respuesta = await solicitar(
        API.pedidos,
        {
            headers: encabezados(sesion.token)
        }
    );

    assert.equal(respuesta.estado, 200);
    assert.ok(Array.isArray(respuesta.datos));
});

// 13. Bloquear modificación de Inventario

test("I11 - Cliente no puede modificar inventario", async () => {
    const sesion = await ingresar(CLIENTE);

    const respuesta = await solicitar(
        API.inventario + "/1",
        {
            method: "PUT",
            headers: encabezados(sesion.token),
            body: JSON.stringify({
                cantidadDisponible: 100
            })
        }
    );

    assert.equal(respuesta.estado, 403);
});

// 14. Bloquear actualización de Seguimiento

test("I12 - Cliente no puede cambiar seguimientos", async () => {
    const sesion = await ingresar(CLIENTE);

    const respuesta = await solicitar(
        API.seguimiento + "/1",
        {
            method: "PUT",
            headers: encabezados(sesion.token),
            body: JSON.stringify({
                estado: "CONFIRMADO"
            })
        }
    );

    assert.equal(respuesta.estado, 403);
});

// 15. Validar disponibilidad de Camunda

test("I13 - Camunda responde a topología", async () => {
    const respuesta = await solicitar(
        API.camunda + "/topology"
    );

    assert.equal(respuesta.estado, 200);
    assert.ok(
        typeof respuesta.datos === "object"
    );
});

// 16. Verificar aislamiento entre clientes

test("I14 - Cliente no consulta pedidos ajenos", async t => {
    const admin = await ingresar(ADMIN);
    const cliente = await ingresar(CLIENTE);

    const respuestaAdmin = await solicitar(
        API.pedidos,
        {
            headers: encabezados(admin.token)
        }
    );

    assert.equal(respuestaAdmin.estado, 200);

    const ajeno = respuestaAdmin.datos.find(
        pedido => pedido.clienteId !== cliente.usuario.id
    );

    if (!ajeno) {
        t.skip(
            "No hay un pedido de otro cliente para comprobar el aislamiento"
        );
        return;
    }

    const respuesta = await solicitar(
        API.pedidos + "/" + ajeno.id,
        {
            headers: encabezados(cliente.token)
        }
    );

    assert.equal(respuesta.estado, 403);
});

// 17. Probar cierre de sesión

test("I15 - Logout invalida el token", async () => {
    const sesion = await ingresar(CLIENTE);

    const cierre = await solicitar(
        API.auth + "/logout",
        {
            method: "POST",
            headers: encabezados(sesion.token)
        }
    );

    assert.equal(cierre.estado, 200);

    const consulta = await solicitar(
        API.pedidos,
        {
            headers: encabezados(sesion.token)
        }
    );

    assert.equal(consulta.estado, 401);
});
