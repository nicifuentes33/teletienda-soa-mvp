
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    validarSolicitud,
    agruparProductos
} = require("../pedidos/pedido");

// 1. Validar pedido correcto

test("U01 - Acepta un pedido válido", () => {
    const productos = [
        { productoId: 1, cantidad: 2 },
        { productoId: 2, cantidad: 1 }
    ];

    assert.doesNotThrow(() => {
        validarSolicitud(1, productos);
    });
});

// 2. Rechazar identificador inválido

test("U02 - Rechaza cliente con ID inválido", () => {
    assert.throws(
        () => validarSolicitud(0, [
            { productoId: 1, cantidad: 1 }
        ]),
        /clienteId/
    );
});

// 3. Rechazar pedido vacío

test("U03 - Rechaza pedidos sin productos", () => {
    assert.throws(
        () => validarSolicitud(1, []),
        /al menos un producto/
    );
});

// 4. Rechazar cantidad negativa

test("U04 - Rechaza cantidades negativas", () => {
    assert.throws(
        () => validarSolicitud(1, [
            { productoId: 1, cantidad: -2 }
        ]),
        /cantidad válida/
    );
});

// 5. Rechazar ID de producto inválido

test("U05 - Rechaza producto con ID inválido", () => {
    assert.throws(
        () => validarSolicitud(1, [
            { productoId: 0, cantidad: 1 }
        ]),
        /ID y una cantidad válida/
    );
});

// 6. Agrupar productos repetidos

test("U06 - Agrupa productos repetidos", () => {
    const resultado = agruparProductos([
        { productoId: 1, cantidad: 2 },
        { productoId: 1, cantidad: 3 },
        { productoId: 2, cantidad: 1 }
    ]);

    assert.deepEqual(resultado, [
        { productoId: 1, cantidad: 5 },
        { productoId: 2, cantidad: 1 }
    ]);
});

// 7. Mantener productos diferentes

test("U07 - Conserva productos diferentes", () => {
    const resultado = agruparProductos([
        { productoId: 1, cantidad: 2 },
        { productoId: 3, cantidad: 4 }
    ]);

    assert.equal(resultado.length, 2);
    assert.equal(resultado[0].productoId, 1);
    assert.equal(resultado[1].productoId, 3);
});

// 8. Detectar desbordamiento

test("U08 - Rechaza cantidades demasiado grandes", () => {
    assert.throws(
        () => agruparProductos([
            {
                productoId: 1,
                cantidad: Number.MAX_SAFE_INTEGER
            },
            {
                productoId: 1,
                cantidad: 1
            }
        ]),
        /Cantidad demasiado grande/
    );
});

// 9. Validar cantidades decimales

test("U09 - Rechaza cantidades decimales", () => {
    assert.throws(
        () => validarSolicitud(1, [
            { productoId: 1, cantidad: 1.5 }
        ]),
        /cantidad válida/
    );
});

// 10. Mantener agrupación correcta

test("U10 - Calcula cantidades agrupadas", () => {
    const resultado = agruparProductos([
        { productoId: 5, cantidad: 4 },
        { productoId: 5, cantidad: 6 }
    ]);

    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].cantidad, 10);
});
