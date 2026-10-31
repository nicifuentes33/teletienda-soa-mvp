
# TELETIENDA SOA

## Producto Mínimo Viable (MVP)

**Proyecto:** Teletienda SOA  
**Asignatura:** Arquitectura de Software II  
**Metodología:** Aprendizaje Basado en Proyectos (ABP)  
**Fase:** 3 - Implementación, integración, pruebas y mantenimiento  
**Estado:** MVP funcional en entorno local  
**Arquitectura:** Orientada a Servicios (SOA)

---

## 1. Descripción del proyecto

Teletienda SOA es un Producto Mínimo Viable (MVP) de comercio electrónico desarrollado bajo los principios de la Arquitectura Orientada a Servicios (SOA).

Su propósito es implementar una plataforma de ventas en la que los usuarios puedan consultar productos, registrarse, iniciar sesión, agregar artículos al carrito y generar pedidos.

La solución integra cinco servicios REST y un motor de procesos BPMN encargado de coordinar la validación de inventario, la confirmación o el rechazo de pedidos y la actualización del seguimiento.

El proyecto fue desarrollado con fines académicos y se ejecuta en un entorno local de desarrollo.

## 2. Objetivo general

Implementar un Producto Mínimo Viable de comercio electrónico mediante una arquitectura orientada a servicios, integrando componentes de catálogo, inventario, pedidos, seguimiento y autenticación, con orquestación de procesos mediante Camunda 8.

## 3. Tecnologías utilizadas

| Tecnología | Función |
|---|---|
| HTML5 | Estructura de la interfaz web |
| CSS3 | Diseño visual y adaptación a dispositivos |
| JavaScript | Interacciones del frontend y lógica del backend |
| Node.js | Entorno de ejecución |
| Express.js | Implementación de las APIs REST |
| JSON | Persistencia de información del MVP |
| HTTP/REST | Comunicación entre servicios |
| Docker Desktop | Ejecución del entorno de Camunda |
| Docker Compose | Administración de contenedores |
| Camunda 8 | Orquestación de procesos empresariales |
| BPMN 2.0 | Modelado del proceso de pedidos |
| Git y GitHub | Control de versiones |
| PowerShell | Ejecución y administración local |
| Visual Studio Code | Desarrollo y mantenimiento del código |

No se requiere instalar React, Angular ni una base de datos SQL para ejecutar este MVP.

## 4. Requisitos de software

Para ejecutar Teletienda SOA se requiere:

- Windows 10 u 11, o un sistema compatible.
- Node.js 24.x, versión utilizada durante las pruebas.
- npm, incluido con Node.js.
- Docker Desktop instalado y funcionando.
- Docker Compose.
- Camunda 8 compatible con el proyecto.
- Navegador actualizado.
- Git, para clonar y actualizar el repositorio.
- Visual Studio Code, recomendado.

### 4.1. Verificar Node.js

```powershell
node -v
npm -v
```

### 4.2. Verificar Docker

```powershell
docker --version
docker compose version
docker info
```

Si `docker info` presenta errores de conexión, comprobar que Docker Desktop esté iniciado.

### 4.3. Verificar Git

```powershell
git --version
```

## 5. Estructura del proyecto

```text
Teletienda/
|
|-- .gitignore
|-- README.md
|
|-- backend/
|   |-- app.js
|   |-- inicializar.js
|   |-- seguridad.js
|   |-- package.json
|   |-- package-lock.json
|   |
|   |-- auth/
|   |   |-- api.js
|   |   |-- usuarios.json
|   |   |-- carritos.json
|   |
|   |-- catalogo/
|   |   |-- api.js
|   |   |-- producto.js
|   |   |-- productos.json
|   |
|   |-- inventario/
|   |   |-- api.js
|   |   |-- inventario.js
|   |   |-- inventario.json
|   |
|   |-- pedidos/
|   |   |-- api.js
|   |   |-- pedido.js
|   |   |-- pedidos.json
|   |
|   |-- seguimiento/
|   |   |-- api.js
|   |   |-- seguimiento.js
|   |   |-- seguimiento.json
|   |
|   |-- tests/
|   |   |-- unitarias.test.js
|   |   |-- integracion.test.js
|   |
|   |-- monitoreo/
|   |   |-- monitor.js
|   |
|   |-- mantenimiento/
|   |   |-- respaldo.js
|   |   |-- verificar-respaldo.js
|   |
|   |-- evidencias/
|   |-- respaldos/
|
|-- frontend/
|   |-- index.html
|   |-- estilos.css
|   |-- api.js
|   |-- app.js
|   |-- server.js
|
|-- camunda/
    |-- worker.js
    |-- proceso-pedidos.bpmn
    |-- instalacion/
        |-- docker-compose.yaml
        |-- README.md
```

Los seis archivos JSON son generados por el inicializador y no se incluyen en GitHub porque contienen datos locales.

Las carpetas `evidencias` y `respaldos` pueden crearse durante la ejecución de las herramientas correspondientes.

## 6. Arquitectura de servicios

Teletienda está conformada por cinco servicios REST independientes.

| Servicio | Puerto | Función |
|---|---:|---|
| Catálogo | 3001 | Consulta y administración de productos |
| Inventario | 3002 | Control de existencias |
| Pedidos | 3003 | Registro y consulta de pedidos |
| Seguimiento | 3004 | Estados e historial de pedidos |
| Autenticación | 3005 | Registro, sesiones y permisos |

Componentes adicionales:

| Componente | Puerto | Función |
|---|---:|---|
| Frontend | 3000 | Interfaz para clientes y administradores |
| Camunda 8 | 8088 | Orquestación de procesos BPMN |

### 6.1. Comunicación entre componentes

1. El usuario interactúa con el frontend.
2. El frontend envía solicitudes HTTP a las APIs REST.
3. Los servicios ejecutan sus operaciones de negocio.
4. El servicio de Pedidos inicia una instancia del proceso BPMN.
5. Camunda coordina las actividades mediante el worker.
6. El inventario determina si existen unidades suficientes.
7. El pedido se confirma o rechaza.
8. El servicio de Seguimiento registra el resultado.

## 7. Instalación desde GitHub

### 7.1. Clonar el repositorio

Abrir PowerShell en la carpeta donde se desea guardar el proyecto.

Ejecutar:

```powershell
git clone https://github.com/TU-USUARIO/teletienda-soa-mvp.git
```

Reemplazar `TU-USUARIO` por el usuario propietario del repositorio.

Como el repositorio es privado, se requiere una cuenta de GitHub con acceso autorizado.

Ingresar al proyecto:

```powershell
cd teletienda-soa-mvp
```

Se recomienda utilizar una carpeta que no esté sincronizándose activamente con OneDrive, para reducir posibles bloqueos durante las escrituras de archivos JSON.

### 7.2. Instalar dependencias del backend

Desde la carpeta principal del proyecto:

```powershell
cd backend
npm ci
```

`npm ci` instala las dependencias utilizando el archivo `package-lock.json`.

El frontend utiliza JavaScript nativo, por lo que no requiere instalar paquetes adicionales.

### 7.3. Inicializar los archivos JSON

Antes de iniciar el backend por primera vez, ejecutar:

```powershell
node inicializar.js
```

Este comando prepara los seis archivos de persistencia del sistema:

- `auth/usuarios.json`
- `auth/carritos.json`
- `catalogo/productos.json`
- `inventario/inventario.json`
- `pedidos/pedidos.json`
- `seguimiento/seguimiento.json`

En una instalación nueva, se generan las estructuras iniciales necesarias.

El inicializador no sobrescribe archivos existentes, por lo que también puede ejecutarse en instalaciones que ya contienen información.

Los usuarios, productos y existencias deberán configurarse para utilizar el sistema en una instalación completamente nueva.

### 7.4. Estructuras generadas

El sistema utiliza las siguientes estructuras iniciales:

**Usuarios**

```json
[]
```

**Carritos**

```json
{}
```

**Catálogo**

```json
{
  "siguienteId": 1,
  "productos": []
}
```

**Inventario**

```json
{
  "inventario": [],
  "pedidosProcesados": []
}
```

**Pedidos**

```json
{
  "siguienteId": 1,
  "pedidos": []
}
```

**Seguimiento**

```json
{
  "seguimientos": []
}
```

Estas estructuras permiten preparar los archivos de datos sin publicar información de usuarios, contraseñas o pedidos anteriores.

## 8. Configuración de Camunda 8

Camunda 8 se utiliza para coordinar automáticamente el procesamiento de los pedidos mediante BPMN.

La implementación conserva la configuración local utilizada durante el desarrollo del proyecto.

Antes de iniciar Camunda, comprobar que Docker Desktop esté funcionando.

### 8.1. Iniciar Camunda

Desde la carpeta principal del proyecto, ejecutar:

```powershell
docker compose -f camunda/instalacion/docker-compose.yaml up -d
```

Este comando utiliza el archivo Docker Compose incluido en el proyecto.

También es posible ingresar directamente a la carpeta correspondiente:

```powershell
cd camunda/instalacion
docker compose up -d
```

### 8.2. Verificar los contenedores

Desde la carpeta principal:

```powershell
docker compose -f camunda/instalacion/docker-compose.yaml ps
```

Comprobar que los componentes necesarios estén activos.

### 8.3. Acceso a Camunda Operate

Abrir en el navegador:

http://localhost:8088/operate

La API REST de Camunda utilizada por el proyecto se encuentra en:

http://localhost:8088/v2

### 8.4. Proceso BPMN

El archivo del proceso está ubicado en:

`camunda/proceso-pedidos.bpmn`

Identificador del proceso:

`proceso_pedidos_teletienda`

El proceso implementa la verificación de inventario y las rutas de confirmación y rechazo de pedidos.

### 8.5. Despliegue del proceso

Antes de registrar pedidos, el proceso BPMN debe encontrarse desplegado en Camunda.

Si el entorno de Camunda es nuevo, verificar que el proceso esté disponible y realizar el despliegue correspondiente.

El worker de Teletienda se inicia desde el backend y ejecuta las actividades de servicio definidas en el proceso.

## 9. Ejecutar el backend

Con Camunda iniciado y los archivos JSON preparados, abrir una terminal desde la carpeta principal.

Ejecutar:

```powershell
cd backend
node app.js
```

El archivo `app.js` inicia los cinco servicios REST y el worker de Camunda.

Mantener esta terminal abierta mientras se utiliza el sistema.

### 9.1. Comprobar los servicios

**Catálogo**

http://127.0.0.1:3001/api/productos

**Inventario**

http://127.0.0.1:3002/api/inventario

**Pedidos**

http://127.0.0.1:3003/api/pedidos

**Seguimiento**

http://127.0.0.1:3004/api/seguimiento

**Autenticación**

http://127.0.0.1:3005/api/auth/usuario

Algunas rutas protegidas pueden responder con HTTP 401 si no se proporciona un token de sesión válido. Este comportamiento es esperado.

## 10. Ejecutar el frontend

Abrir una segunda terminal desde la carpeta principal del proyecto.

Ejecutar:

```powershell
cd frontend
node server.js
```

El frontend estará disponible en:

http://127.0.0.1:3000

Abrir esta dirección en el navegador.

El archivo `index.html` no debe abrirse directamente mediante doble clic, ya que la aplicación utiliza un servidor local para comunicarse con las APIs.

## 11. Funcionalidades del sistema

### 11.1. Cliente

El cliente puede:

- Crear una cuenta.
- Iniciar y cerrar sesión.
- Consultar productos.
- Visualizar los cuatro productos más recientes.
- Buscar productos por nombre o descripción.
- Consultar precios y existencias.
- Agregar productos al carrito.
- Modificar cantidades.
- Retirar productos del carrito.
- Registrar pedidos.
- Consultar sus pedidos y estados.

El carrito web se almacena por cliente en el navegador.

La aplicación de consola dispone de almacenamiento de carritos mediante JSON. Ambos mecanismos no están sincronizados en esta versión.

### 11.2. Administrador

El administrador puede:

- Iniciar sesión con una cuenta autorizada.
- Consultar el catálogo.
- Crear productos.
- Editar productos.
- Eliminar productos.
- Consultar pedidos registrados.
- Administrar inventario mediante los servicios autorizados.

Las operaciones administrativas cuentan con validación de permisos en el backend.

## 12. Proceso BPMN de pedidos

El proceso implementado se denomina:

`proceso_pedidos_teletienda`

Su ejecución comprende:

1. Registrar el pedido pendiente.
2. Verificar disponibilidad de inventario.
3. Evaluar la decisión mediante una compuerta BPMN.
4. Ejecutar la ruta correspondiente.
5. Actualizar el seguimiento.
6. Finalizar el proceso.

### 12.1. Pedido confirmado

Si existe inventario suficiente:

1. Se descuenta el inventario correspondiente.
2. Se confirma el pedido.
3. Se actualiza el seguimiento a `CONFIRMADO`.
4. Finaliza el proceso.

### 12.2. Pedido rechazado

Si no existe inventario suficiente:

1. Se rechaza el pedido.
2. Se actualiza el seguimiento a `RECHAZADO`.
3. Finaliza el proceso sin descontar inventario.

## 13. Pruebas automatizadas

Las pruebas se ejecutan mediante el módulo nativo de Node.js:

`node:test`

No se requiere instalar Jest ni otro framework adicional.

### 13.1. Ejecutar pruebas

Desde la carpeta `backend`, con los servicios y Camunda funcionando:

```powershell
node --test ".\tests\*.test.js"
```

### 13.2. Resultados obtenidos

Durante la validación realizada el 30 de octubre de 2026 se obtuvieron:

| Indicador | Resultado |
|---|---:|
| Pruebas unitarias | 10 |
| Pruebas de integración | 15 |
| Total de pruebas | 25 |
| Pruebas aprobadas | 25 |
| Pruebas fallidas | 0 |
| Tasa de aprobación | 100 % |

Las pruebas verificaron validaciones, autenticación, permisos, aislamiento de información y conectividad entre componentes.

Estos resultados corresponden a las pruebas realizadas en el entorno local.

## 14. Monitoreo de servicios

Teletienda incluye una herramienta automatizada para medir:

- Disponibilidad de endpoints.
- Códigos HTTP.
- Tiempo de respuesta.
- Cantidad de mediciones exitosas.
- Cantidad de mediciones fallidas.
- Disponibilidad porcentual observada.

### 14.1. Ejecutar monitoreo

Desde `backend`:

```powershell
node monitoreo/monitor.js
```

Por defecto, se realizan 10 rondas de medición con intervalos de 2 segundos.

### 14.2. Resultados obtenidos

Durante la prueba del 30 de octubre de 2026:

| Servicio | Disponibilidad observada | Tiempo promedio |
|---|---:|---:|
| Catálogo | 100 % | 10,91 ms |
| Inventario | 100 % | 6,05 ms |
| Pedidos | 100 % | 5,85 ms |
| Seguimiento | 100 % | 5,80 ms |
| Autenticación | 100 % | 5,94 ms |
| Camunda | 100 % | 7,42 ms |

Se completaron 60 mediciones sin respuestas diferentes de las esperadas.

La disponibilidad observada corresponde exclusivamente al periodo de medición y no representa una garantía de disponibilidad permanente.

### 14.3. Evidencias

Los resultados se almacenan en:

`backend/evidencias/`

La herramienta genera archivos JSON y CSV.

## 15. Mantenimiento y respaldos

El sistema cuenta con herramientas para realizar respaldos de sus archivos JSON.

### 15.1. Detener los servicios

Antes de ejecutar un respaldo, detener las APIs para evitar escrituras simultáneas.

En la terminal del backend:

`Ctrl + C`

### 15.2. Generar respaldo

Desde `backend`:

```powershell
node mantenimiento/respaldo.js
```

El procedimiento respalda seis archivos:

- Productos.
- Inventario.
- Pedidos.
- Seguimiento.
- Usuarios.
- Carritos.

Los respaldos se almacenan en:

`backend/respaldos/`

Cada respaldo incorpora un manifiesto con tamaños y huellas SHA-256.

### 15.3. Verificar respaldo

Ejecutar:

```powershell
node mantenimiento/verificar-respaldo.js
```

La herramienta verifica la existencia de los archivos, su estructura JSON y la coincidencia de sus huellas SHA-256.

### 15.4. Resultados

Durante las pruebas se comprobó:

- Creación exitosa de un respaldo de seis archivos.
- Verificación correcta de los seis archivos.
- Recuperación de archivos en una carpeta independiente.
- Coincidencia de las seis huellas SHA-256.

La recuperación se realizó sin sobrescribir los datos originales.

## 16. Configuración de red

El proyecto utiliza conexiones locales.

| Componente | Dirección |
|---|---|
| Frontend | http://127.0.0.1:3000 |
| Catálogo | http://127.0.0.1:3001 |
| Inventario | http://127.0.0.1:3002 |
| Pedidos | http://127.0.0.1:3003 |
| Seguimiento | http://127.0.0.1:3004 |
| Autenticación | http://127.0.0.1:3005 |
| Camunda | http://localhost:8088 |

Los puertos deben estar disponibles.

La configuración actual está diseñada para uso académico local y no para exposición directa a internet.

## 17. Control de versiones con Git y GitHub

El código fuente se administra mediante Git.

Repositorio:

`teletienda-soa-mvp`

El repositorio es privado y su acceso se limita a las personas autorizadas.

### 17.1. Actualizar el código local

Desde la carpeta principal:

```powershell
git pull origin main
```

Se recomienda detener los servicios antes de actualizar el código y realizar un respaldo de los datos.

### 17.2. Registrar cambios

Después de modificar los archivos:

```powershell
git status
git add .
git commit -m "Descripcion de los cambios"
git push origin main
```

Los archivos de datos locales, claves, dependencias y respaldos están excluidos mediante `.gitignore`.

### 17.3. Inicialización después de clonar

En una instalación nueva, ejecutar:

```powershell
cd backend
npm ci
node inicializar.js
```

Esto instala las dependencias y prepara la persistencia del MVP.

El inicializador conserva los datos existentes y únicamente crea los archivos faltantes.

## 18. Actualización y mantenimiento del sistema

Para actualizar Teletienda SOA se recomienda:

1. Detener el frontend y el backend.
2. Realizar un respaldo.
3. Verificar su integridad.
4. Actualizar el código desde GitHub.
5. Ejecutar `npm ci` cuando cambien las dependencias.
6. Ejecutar `node inicializar.js` para crear archivos que falten.
7. Actualizar el despliegue BPMN si cambió el proceso.
8. Iniciar Camunda y los servicios.
9. Ejecutar las pruebas automatizadas.
10. Ejecutar el monitoreo.
11. Verificar las funciones principales.

Los archivos JSON existentes deben conservarse durante las actualizaciones.

## 19. Mantenimiento preventivo y correctivo

### 19.1. Preventivo

- Ejecutar periódicamente las pruebas.
- Revisar resultados del monitoreo.
- Generar respaldos.
- Comprobar las huellas SHA-256.
- Revisar contenedores de Camunda.
- Actualizar dependencias cuando corresponda.
- Conservar evidencias de validación.

### 19.2. Correctivo

Ante una falla:

1. Identificar el componente afectado.
2. Revisar los registros del servicio.
3. Verificar los puertos y Docker.
4. Corregir la configuración o el código.
5. Reiniciar el componente.
6. Ejecutar nuevamente las pruebas.
7. Documentar la solución.

Si los archivos de datos presentan daños, evaluar una restauración desde un respaldo verificado.

## 20. Seguridad

El MVP incorpora:

- Registro y autenticación.
- Contraseñas almacenadas mediante derivación criptográfica.
- Tokens de sesión.
- Perfiles `CLIENTE` y `ADMINISTRADOR`.
- Validación de permisos.
- Restricciones de acceso entre servicios.
- Clave interna para comunicaciones autorizadas.

La clave `SOA_INTERNAL_KEY` no debe incluirse en el frontend.

Los tokens de sesión se mantienen en memoria y dejan de ser válidos al reiniciar el servicio de autenticación.

El repositorio privado no contiene archivos de datos locales ni claves internas generadas durante la ejecución.

La seguridad implementada corresponde al alcance académico del MVP.

## 21. Limitaciones del MVP

La implementación presenta las siguientes limitaciones:

- Persistencia mediante archivos JSON.
- Sesiones en memoria.
- Ejecución local.
- Carrito web almacenado en el navegador.
- Ausencia de pagos reales.
- Ausencia de infraestructura de producción.
- Posibles bloqueos de archivos en carpetas sincronizadas.
- Dependencia de la disponibilidad de Camunda.
- Necesidad de configurar usuarios y productos en una instalación nueva.

No se recomienda utilizar esta versión directamente en un entorno empresarial de producción.

## 22. Evidencias de validación

El proyecto cuenta con evidencias de:

1. Pruebas unitarias.
2. Pruebas de integración REST.
3. Ejecución BPMN con pedido rechazado.
4. Ejecución BPMN con pedido confirmado.
5. Monitoreo de seis componentes.
6. Generación de respaldos.
7. Verificación de integridad.
8. Recuperación controlada de archivos.

Las evidencias respaldan las actividades de implementación y validación de la Fase 3.

## 23. Conclusiones técnicas

Teletienda SOA demuestra la implementación de un Producto Mínimo Viable de comercio electrónico basado en servicios REST y orquestación de procesos BPMN.

La separación de responsabilidades permite organizar las funciones de autenticación, catálogo, inventario, pedidos y seguimiento.

Las pruebas realizadas verificaron las principales operaciones, los controles de acceso, la comunicación entre componentes y las rutas de confirmación y rechazo en Camunda 8.

Las herramientas de monitoreo y mantenimiento proporcionan mecanismos básicos para observar el funcionamiento de los servicios y preservar la información.

El uso de GitHub permite conservar el código fuente, documentar cambios y facilitar la revisión académica.

La solución constituye una implementación funcional en entorno local y una base para futuras mejoras relacionadas con bases de datos, seguridad, escalabilidad y despliegue.

---

**Teletienda SOA — MVP académico**  
**Arquitectura de Software II — Fase 3**
