# Gestora

Aplicación para gestionar solicitudes de equipo e inventario compartido. El backend Express valida sesiones y permisos; SQLite conserva cuentas, solicitudes, productos y movimientos de stock.

## Arquitectura

Frontend y backend tienen responsabilidades y despliegues separados:

- **Frontend:** `src/features/` agrupa los dominios `auth`, `dashboard`, `inventory`, `reports`, `requests`, `users` y `workspace`. Cada dominio mantiene juntas sus pantallas, adaptadores API y lógica propia; las pruebas específicas viven junto a su funcionalidad.
- **Composición del frontend:** `src/App.jsx` conecta autenticación, resúmenes compartidos, navegación y páginas. Las páginas no dependen entre sí. `src/api.js` es el cliente HTTP común y cada adaptador de dominio encapsula las rutas y cuerpos API de su funcionalidad.
- **Presentación compartida:** `src/features/dashboard/` contiene el dashboard, navegación y configuración de roles/KPI. Los estilos globales y el tema compartido permanecen en `src/` y `src/styles/`.
- **Build:** Vite produce los archivos estáticos con `npm run build`. Dashboard, Solicitudes, Inventario, Reportes y Usuarios se cargan bajo demanda; el dashboard se precarga durante la espera del OTP y Solicitudes/Inventario al enfocar o apuntar a su opción de navegación.
- **API:** `server/app.js` compone middleware y routers. `server/routes/` separa autenticación, datos/reportes, inventario, solicitudes y usuarios.
- **Dominios del backend:** `server/services/` contiene las reglas de autenticación, usuarios, datos, solicitudes e inventario; `server/repositories/` concentra las consultas SQLite de esos dominios.
- **Rutas y composición:** las rutas validan peticiones y forman respuestas; `server/container.js` conecta servicios, repositorios y transacciones. `server/database.js` administra SQLite; `server/shared/http.js` conserva middleware de autorización, validación HTTP y serializadores.

El sistema es un monolito modular de bajo acoplamiento, no una colección de microservicios. Frontend y API se pueden desplegar por separado y se comunican mediante `VITE_API_URL`.

## Requisitos

- Node.js 26 (usa `node:sqlite`)
- npm

En PowerShell de Windows, si la política de ejecución bloquea `npm`, usa `npm.cmd` en los comandos siguientes.

## Preparar el primer superadministrador

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env` (PowerShell: `Copy-Item .env.example .env`) y define `SESSION_SECRET` con una cadena aleatoria propia de al menos 32 caracteres. No compartas ni subas `.env`.
3. En `.env`, define `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` y `BOOTSTRAP_ADMIN_PASSWORD` (mínimo 12 caracteres).
4. Ejecuta una sola vez:

   ```bash
   npm run create:super-admin
   ```

5. Borra las tres variables `BOOTSTRAP_ADMIN_*` de `.env`.

El superadministrador inicial se crea desde la terminal; no existe una ruta pública de registro que permita reclamar el sistema.

### Recuperar la contraseña del superadministrador

Si se pierde la contraseña de Gestora, detén la API y ejecuta desde la raíz del proyecto y una terminal interactiva:

```powershell
npm.cmd run reset:super-admin-password
```

Escribe y confirma una contraseña nueva (mínimo 12 caracteres). La entrada no se muestra ni se guarda en `.env`. El comando actualiza el hash y revoca las sesiones y códigos OTP anteriores; la nueva contraseña queda activa inmediatamente. Después, inicia de nuevo la API con `npm.cmd run server`. Este procedimiento no cambia la contraseña de Gmail/SMTP.

Para restablecer la cuenta de otra empresa, define `RESET_SUPER_ADMIN_EMAIL` con el correo de su superadministrador antes de ejecutar el comando. Si no se define, se restablece el superadministrador de la organización inicial **Gestora**. El proceso sigue requiriendo acceso local a la terminal del servidor.

## Ejecutar en desarrollo

Abre dos terminales en el proyecto:

```bash
npm run server
```

```bash
npm run dev
```

Vite reenvía `/api` al servidor local. Si no defines `APP_ORIGIN` en desarrollo, la API acepta solicitudes desde `http://localhost:5173` y `http://127.0.0.1:5173`; en producción es obligatorio configurar el origen HTTPS exacto. Si SMTP no está configurado, el código OTP se muestra **solo en la terminal del servidor**.

Para desplegar la interfaz y la API por separado, configura `VITE_API_URL` con el origen de la API al construir el frontend (por ejemplo, `https://api.ejemplo.com`). Déjalo vacío en desarrollo para conservar el proxy local de Vite.

## Configurar correo OTP con Gmail

1. Activa la verificación en dos pasos de la cuenta Google que enviará los códigos.
2. Desde Seguridad en la cuenta Google, crea una **contraseña de aplicación** para Gestora. Usa esa clave, no la contraseña normal de Gmail. Google puede no ofrecer esta opción en cuentas administradas o con ciertas políticas.
3. En `.env`, configura `SMTP_USER` con el correo completo, `SMTP_PASSWORD` con la contraseña de aplicación y `SMTP_FROM` con ese remitente, por ejemplo `Gestora <cuenta@gmail.com>`. El ejemplo ya configura `smtp.gmail.com`, puerto `587` y TLS de STARTTLS (`SMTP_SECURE=false`).
4. Reinicia `npm run server` y prueba el inicio de sesión. El OTP debe llegar al correo. En producción, SMTP incompleto impide iniciar la API; el código no se escribe en registros.

No pegues la contraseña de aplicación en el chat, en el código ni en Git. `.env` está excluido de Git. Para producción, revisa los límites de envío de Gmail; un proveedor transaccional es más adecuado para un uso de mayor volumen.

### Solución de problemas de acceso y OTP

- **“Correo o contraseña incorrectos”:** comprueba el correo de la cuenta y la contraseña de Gestora. La contraseña de aplicación de Gmail solo sirve para que SMTP envíe correo; no es la contraseña de acceso. El OTP todavía no se envió en este punto.
- **Aparece la pantalla para ingresar el OTP, pero no llega el correo:** el servidor aceptó el mensaje para su entrega a través de SMTP, aunque eso no garantiza que haya llegado a la bandeja. Revisa Spam, Promociones y Todos; busca el asunto `Tu código de acceso a Gestora` y confirma que revisas el buzón de la cuenta asociada.
- Puedes solicitar otro código después de 30 segundos. Cada código vence en 5 minutos. No compartas el OTP. Si el envío SMTP falla, la aplicación muestra un error; la API también registra el fallo en la terminal del servidor.
- Para aplicar cambios de `.env`, reinicia la API. En desarrollo mantén abierta una terminal para `npm.cmd run server` y otra para `npm.cmd run dev`. Si SMTP no está configurado, el código OTP solo se muestra en la terminal de la API en desarrollo. En producción se desactiva ese fallback.

## Seguridad de acceso

Las contraseñas se guardan con scrypt; el servidor entrega la sesión en una cookie `HttpOnly`, con vencimiento de 12 horas. Usa `SameSite=Strict` en desarrollo y `SameSite=None; Secure` en producción para permitir que la interfaz alojada por separado llame a la API. El identificador de sesión se guarda hasheado en SQLite, no en `localStorage`. Las rutas comprueban el rol en backend.

Las cuentas nuevas y las contraseñas temporales asignadas desde **Usuarios** requieren verificar OTP y cambiar la contraseña antes de usar el sistema. El comando de recuperación del superadministrador solicita una contraseña nueva elegida por el usuario y la activa inmediatamente. Desactivar una cuenta cierra sus sesiones y cancela sus OTP pendientes. El superadministrador no puede desactivarse desde la interfaz; los límites de administradores cuentan solo cuentas activas.

## Aislamiento multiempresa

Una instalación puede alojar varias empresas independientes. Al actualizar una base existente, la migración crea **Gestora** y asigna allí los usuarios, productos, solicitudes, movimientos y eventos de auditoría existentes; los datos no se eliminan. La migración se aplica al iniciar el servidor.

El servidor obtiene la empresa activa de la sesión autenticada, no de un identificador enviado por el navegador. Las consultas y operaciones de usuarios, inventario, solicitudes, reportes, importación local y auditoría se limitan a esa empresa. Los identificadores de registros de otra empresa no permiten consultarlos ni modificarlos. SQLite también valida la relación entre la empresa y sus usuarios, productos, solicitudes y movimientos.

Desde **Usuarios**, un superadministrador puede crear otra empresa y su primera cuenta de superadministrador. La cuenta nueva debe verificar OTP y cambiar su contraseña inicial. Los usuarios creados después pertenecen automáticamente a la empresa activa. Cada empresa tiene como máximo un superadministrador y dos administradores activos. Los correos siguen siendo únicos en toda la instalación, por lo que una dirección no se puede reutilizar en otra empresa.

Cada empresa empieza con la sucursal **Principal**; la migración asigna allí los datos existentes. Los administradores pueden crear sucursales y asignar cada empleado a una. Los empleados solo consultan productos y solicitudes de su sucursal; los administradores ven todas las sucursales de su empresa. Los productos, solicitudes y movimientos conservan su sucursal de origen.

## Funciones de la interfaz

- **Solicitudes:** empiezan pendientes de aprobación. Solo un administrador puede aprobarlas o rechazarlas; una aprobada pasa a proceso y al completarla descuenta existencias en la misma transacción. Si el stock no alcanza, no cambia ni la solicitud ni el inventario.
- **Paginación y filtros de solicitudes:** `GET /api/requests` devuelve 20 solicitudes por página por defecto (máximo 50) y filtra en SQLite por búsqueda, estado, aprobación, prioridad y fechas. La interfaz incluye filtros visibles de fecha inicial/final y conserva la búsqueda y los filtros al cambiar de sección durante la sesión. Para clientes API, `dateFrom` es el límite UTC ISO 8601 inclusivo y `dateTo` el límite exclusivo; la interfaz convierte las fechas locales a esos límites. `GET /api/data` entrega el resumen sin descargar toda la lista.
- **Inventario por sucursal:** administra sucursales y elige dónde registrar productos y movimientos. Los empleados quedan asignados a una sucursal y el servidor limita sus consultas, además de aplicar el aislamiento por empresa.
- **Alertas de inventario:** aviso y filtro para productos en o bajo el mínimo. Al cruzar el umbral, Gestora crea una notificación en la aplicación y envía un correo a los administradores activos mediante SMTP.
- **Búsqueda QR y código de barras:** guarda un código opcional por producto y sucursal, y permite buscarlo manualmente o con la cámara. El acceso a cámara requiere HTTPS (o localhost) y permiso del navegador.
- **Notificaciones:** el centro de notificaciones reúne solicitudes nuevas, decisiones de aprobación y alertas de inventario; permite marcar avisos como leídos. Los correos no incluyen descripciones ni motivos privados.
- **Resultados de acciones:** SweetAlert2 muestra confirmaciones, éxitos, advertencias y errores de las operaciones importantes con el tema oscuro de vidrio y acentos coral de Gestora, más animaciones suaves que respetan la preferencia de movimiento reducido; los avisos no críticos permanecen en la página.
- **Auditoría:** administradores y superadministradores pueden consultar eventos paginados en `GET /api/audit`: quién creó o modificó solicitudes, registró movimientos, administró cuentas o importó datos de su empresa. El registro no incluye contraseñas, OTP, descripciones ni motivos privados.
- **Búsqueda optimizada:** las búsquedas de solicitudes esperan 250 ms después de escribir antes de consultar la API. Se informa cuando la búsqueda está en curso, falla o no encuentra resultados; la búsqueda de inventario se realiza sobre los datos ya cargados.
- **Estados de pantalla:** se muestran estados de carga, error con opción de reintento y listas vacías o sin coincidencias, tanto en el espacio de trabajo como en solicitudes e inventario.
- **Validación de formularios:** productos, sucursales, solicitudes y movimientos de inventario muestran errores junto a los campos, además de asociarlos con los controles para lectores de pantalla.
- **Accesos rápidos:** el resumen permite abrir las solicitudes pendientes de aprobación o filtrar el inventario por productos con stock en o bajo el mínimo; las opciones respetan los permisos del perfil.
- **Adaptabilidad y accesibilidad:** las tarjetas y acciones de solicitudes e inventario se reorganizan para pantallas pequeñas. Los controles muestran un indicador de foco para navegación con teclado y las animaciones respetan la preferencia del sistema para reducir movimiento.
- **Carga diferida:** las páginas de **Reportes** y **Usuarios** se descargan al abrirlas, no durante la carga inicial.

## Reportes

Administradores y superadministradores pueden consultar desde **Reportes** las solicitudes completadas y los movimientos dentro de un periodo de hasta 366 días, los productos actualmente en o bajo su mínimo y descargar el detalle como CSV. El reporte incluye sucursal y estado de aprobación. Los respaldos locales antiguos no tenían fecha de finalización, por lo que esas solicitudes no se incluyen en el conteo histórico por periodo.

## Copias de seguridad y restauración

La base activa es `data/gestora.sqlite`. Crea y verifica un respaldo consistente con el servicio detenido o en marcha:

```bash
npm run db:backup
npm run db:backup -- "C:\ruta-segura\gestora.sqlite"
```

La creación escribe primero un archivo temporal con permisos restringidos, verifica integridad y esquema, y lo renombra al destino solo cuando está completo. En sistemas POSIX el directorio SQLite se crea con permisos privados y la base/respaldo con modo `0600`; en Windows configura ACL NTFS para que solo la cuenta del servicio y administradores autorizados puedan leerlos. Si falla, no publica una copia parcial.

El archivo `.sqlite` generado **no está cifrado por la aplicación**. Antes de sacarlo del servidor, guárdalo en un servicio de respaldos/almacenamiento externo con cifrado en reposo y transferencia TLS, usando una clave administrada fuera del servidor. No dejes la única copia ni la clave de cifrado en el mismo host. Configura retención y respaldos automáticos en el proveedor elegido, y prueba periódicamente la restauración. La restauración **reemplaza los datos actuales**. Detén el servidor, conserva una copia del respaldo fuera del equipo y ejecuta:

```bash
npm run db:restore -- "C:\ruta-segura\gestora.sqlite"
```

El comando valida integridad, esquema y referencias, crea una copia de seguridad de la base activa y recupera el archivo anterior si falla el reemplazo. Tras restaurar, inicia el servidor y revisa inicio de sesión, solicitudes e inventario. No subas bases ni respaldos al repositorio.

## Despliegue detrás de HTTPS

El despliegue no se ha ejecutado: todavía falta elegir hosting, dominio, proveedor SMTP y almacenamiento de respaldos; no se deben inventar ni guardar esos secretos en el repositorio. Antes de usar datos reales:

1. Elige un proveedor que permita terminar HTTPS en un proxy, mantener un volumen SQLite persistente y guardar respaldos cifrados fuera del servidor. Publica el frontend estático `dist/` y deja la API en una red privada o accesible solo a través del proxy. El proxy debe redirigir HTTP a HTTPS; no expongas directamente el puerto Node ni `data/` o `backups/` como contenido web.
2. En la configuración segura del proveedor define `NODE_ENV=production`, `HOST` y `PORT` según su plataforma, `DB_FILE` dentro del volumen persistente, el origen HTTPS exacto del frontend en `APP_ORIGIN` (sin ruta ni barra final) y las variables SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`). La API no inicia si faltan el origen HTTPS, un secreto de sesión fuerte o la configuración SMTP.
3. Genera un secreto nuevo, por ejemplo con `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Guarda `SESSION_SECRET` directamente en el almacén de secretos del proveedor, no en Git, tickets, capturas ni este chat. No reutilices el secreto de desarrollo. Define también `VITE_API_URL` con el origen HTTPS de la API al construir el frontend (sin `/api`); si frontend y API comparten origen, puede quedar vacío.
4. Limita el acceso administrativo al hosting a personas autorizadas y activa MFA para esas cuentas. Mantén el sistema operativo y Node actualizados. Comprueba que la cookie de sesión se envíe con `Secure` y que las respuestas HTTP se redirijan a HTTPS.
5. Configura copias de seguridad automáticas cifradas fuera del host y prueba una restauración antes de abrir el sistema a usuarios. Usa el reporte de aislamiento entre empresas como parte de las verificaciones de cada cambio.

El arranque valida el modo, el origen HTTPS, el secreto y SMTP para fallar de forma cerrada ante una configuración de producción incompleta. `APP_ORIGIN` configura CORS; la terminación HTTPS, el firewall, el almacenamiento persistente, las ACL y las copias externas se configuran en el proveedor y no se pueden activar desde este repositorio sin elegirlo.

## Revisión periódica de dependencias

Ejecuta `npm run security:audit` para revisar vulnerabilidades publicadas en las dependencias. GitHub Actions ejecuta pruebas, lint, build y auditoría semanalmente; Dependabot propone actualizaciones semanales. Revisa y prueba cada actualización antes de desplegarla.

## Roles

- **Empleado:** consulta el catálogo de su sucursal, crea solicitudes y solo puede cancelar sus solicitudes activas.
- **Administrador:** revisa solicitudes y gestiona inventario y sucursales de toda su empresa.
- **Superadministrador:** gestiona las cuentas de su empresa y puede crear otra empresa con su primer superadministrador, además de las funciones de administrador.

El backend permite como máximo dos cuentas **ADMIN** activas y una **SUPER_ADMIN** por empresa. El superadministrador inicial de **Gestora** se crea mediante el comando de bootstrap; desde **Usuarios** puede crear empresas e invitar superadministradores, empleados y administradores, restablecer contraseñas y desactivar/reactivar cuentas.

## Planes, invitaciones y recuperación

Las cuentas nuevas se crean mediante invitaciones por correo; el destinatario define su contraseña desde un enlace de un solo uso, válido por 48 horas. Las invitaciones pendientes reservan lugares del plan. Para evitar altas sin autorización, no hay registro público. El enlace usa el origen configurado en `APP_ORIGIN`.

Las empresas nuevas comienzan en **Prueba**: 5 usuarios (incluido el superadministrador), 1 sucursal y 500 productos. `TRIAL_DAYS` configura su duración entre 1 y 365 días; si no se define, dura 14 días. **Empresa** permite 25 usuarios, 5 sucursales y 5.000 productos. Los límites de usuarios consideran las invitaciones pendientes; los tres topes se hacen cumplir en el servidor.

La aplicación no cobra ni procesa pagos. Una persona con acceso administrativo al servidor puede asignar manualmente el plan desde la terminal:

```powershell
npm.cmd run plan:set -- <organization-id> empresa
npm.cmd run plan:set -- <organization-id> prueba
```

Para consultar un identificador de empresa, puede revisarse la sección **Usuarios** de esa empresa o su exportación autenticada. El cambio actualiza el plan de inmediato; asignar **Prueba** inicia un nuevo periodo de prueba. No expongas este comando como endpoint público ni compartas acceso a la terminal del servidor.

En **Usuarios**, un superadministrador puede exportar sus datos como JSON, solicitar la baja y cancelarla durante la retención. La baja suspende inmediatamente las operaciones normales, pero permite exportar los datos o cancelar la baja durante 30 días. Después, programa la tarea diaria de purga desde el proveedor de hosting:

```powershell
npm.cmd run organizations:purge -- --confirm
```

La purga es irreversible y solo elimina empresas cuya fecha de retención venció. Conserva una exportación y un respaldo cifrado antes de solicitar la baja; no ejecutes la purga manualmente sobre la base de producción para probarla.

El enlace **¿Olvidaste tu contraseña?** envía una respuesta indistinguible exista o no la cuenta; los enlaces vencen a los 30 minutos, se guardan hasheados y solo pueden usarse una vez. Al completar la recuperación, se revocan las sesiones y OTP existentes. Configura SMTP antes de invitar usuarios, habilitar recuperación o usar **Probar correo**.

## Monitoreo

`GET /api/health` comprueba que la API puede consultar SQLite y devuelve `503` si la base no está disponible. Los mensajes de error del servidor se registran sin cuerpos, correos, tokens, OTP ni mensajes crudos de dependencias. El endpoint de salud no revela detalles de la base ni secretos.

## Solicitudes y cancelaciones

Las solicitudes nuevas empiezan **Pendientes de aprobación** y no descuentan stock. Un administrador puede aprobarlas o rechazarlas; solo una aprobada puede pasar a **En proceso** o **Completada**. Al completarla, el servidor descuenta el stock y registra una salida vinculada a la solicitud en la misma transacción SQLite. Si no hay existencias suficientes, no cambia ni la solicitud ni el inventario.

Una solicitud activa se puede cancelar después de confirmar. Cancelarla no modifica el stock y es un estado final. No se puede cancelar una solicitud que ya consumió existencias ni reabrir una completada. Para corregir una salida, registra una entrada con su motivo.

Las solicitudes con consumo y los productos con movimientos se conservan para mantener el historial. Solo se pueden borrar solicitudes activas que no hayan consumido stock ni productos sin historial asociado.

## Inventario y movimientos

Desde **Inventario** se registran:

- **Entrada / reposición:** suma unidades.
- **Salida manual:** resta unidades solo si hay existencias suficientes.
- **Ajuste:** establece el stock final contado.

Todo movimiento registra producto, tipo, cantidad o valor final, stock anterior y resultante, variación, motivo, responsable y fecha. El sistema rechaza valores negativos y movimientos que no cambian el stock. El stock inicial positivo y los consumos de solicitudes también aparecen en el historial.

## Datos anteriores guardados en el navegador

Al iniciar sesión por primera vez con el superadministrador, si se encuentra la copia local `gestora:data` y la base SQLite está vacía, se ofrece importarla explícitamente. Se importa el saldo actual como apertura; no se puede reconstruir el historial de movimientos previo. La copia local se elimina solo después de confirmar que la importación terminó. También puedes descartarla desde el aviso.

La base de datos se crea en `data/gestora.sqlite`; tanto `data/` como `.env` están excluidos de Git.

## Pruebas y validación

```bash
npm run test
npm run lint
npm run build
```

Vitest tiene suites API por dominio (`auth.api.test.js`, `audit.api.test.js`, `requests.api.test.js`, `users.api.test.js` y `data.api.test.js`) y prueba OTP, roles, auditoría, aislamiento entre empresas, backfill de datos existentes, paginación, importación, reportes, movimientos y solicitudes. Las suites API usan bases temporales; `server/services/services.test.js` invoca servicios de inventario y solicitudes con SQLite en memoria, sin Express.
