# Gestora

Aplicación para gestionar solicitudes de equipo e inventario compartido. El backend Express valida sesiones y permisos; SQLite conserva cuentas, solicitudes, productos y movimientos de stock.

## Arquitectura

Frontend y backend tienen responsabilidades y despliegues separados:

- **Frontend:** `src/features/` agrupa los dominios `auth`, `dashboard`, `inventory`, `reports`, `requests`, `users` y `workspace`. Cada dominio mantiene juntas sus pantallas, adaptadores API y lógica propia; las pruebas específicas viven junto a su funcionalidad.
- **Composición del frontend:** `src/App.jsx` conecta autenticación, datos compartidos, navegación y páginas. Las páginas no dependen entre sí. `src/api.js` es el cliente HTTP común y cada adaptador de dominio encapsula las rutas y cuerpos API de su funcionalidad.
- **Presentación compartida:** `src/features/dashboard/` contiene el dashboard, navegación y configuración de roles/KPI. Los estilos globales y el tema compartido permanecen en `src/` y `src/styles/`.
- **Build:** Vite produce los archivos estáticos con `npm run build`; Reportes y Usuarios se cargan bajo demanda.
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
4. Reinicia `npm run server` y prueba el inicio de sesión. El OTP debe llegar al correo y no aparecer como `[OTP solo desarrollo]` en la terminal.

No pegues la contraseña de aplicación en el chat, en el código ni en Git. `.env` está excluido de Git. Para producción, revisa los límites de envío de Gmail; un proveedor transaccional es más adecuado para un uso de mayor volumen.

### Solución de problemas de acceso y OTP

- **“Correo o contraseña incorrectos”:** comprueba el correo de la cuenta y la contraseña de Gestora. La contraseña de aplicación de Gmail solo sirve para que SMTP envíe correo; no es la contraseña de acceso. El OTP todavía no se envió en este punto.
- **Aparece la pantalla para ingresar el OTP, pero no llega el correo:** el servidor aceptó el mensaje para su entrega a través de SMTP, aunque eso no garantiza que haya llegado a la bandeja. Revisa Spam, Promociones y Todos; busca el asunto `Tu código de acceso a Gestora` y confirma que revisas el buzón de la cuenta asociada.
- Puedes solicitar otro código después de 30 segundos. Cada código vence en 5 minutos. No compartas el OTP. Si el envío SMTP falla, la aplicación muestra un error; la API también registra el fallo en la terminal del servidor.
- Para aplicar cambios de `.env`, reinicia la API. En desarrollo mantén abierta una terminal para `npm.cmd run server` y otra para `npm.cmd run dev`. Si SMTP no está configurado, el código OTP solo se muestra en la terminal de la API en desarrollo.

## Seguridad de acceso

Las contraseñas se guardan con scrypt; el servidor entrega la sesión en una cookie `HttpOnly`, con vencimiento de 12 horas. Usa `SameSite=Strict` en desarrollo y `SameSite=None; Secure` en producción para permitir que la interfaz alojada por separado llame a la API. El identificador de sesión se guarda hasheado en SQLite, no en `localStorage`. Las rutas comprueban el rol en backend.

Las cuentas nuevas y las contraseñas temporales asignadas desde **Usuarios** requieren verificar OTP y cambiar la contraseña antes de usar el sistema. El comando de recuperación del superadministrador solicita una contraseña nueva elegida por el usuario y la activa inmediatamente. Desactivar una cuenta cierra sus sesiones y cancela sus OTP pendientes. El superadministrador no puede desactivarse desde la interfaz; los límites de administradores cuentan solo cuentas activas.

## Funciones de la interfaz

- **Solicitudes:** búsqueda por título, descripción o producto; filtros combinables por estado y prioridad; confirmación antes de completar. Si el stock no alcanza, la aplicación bloquea la finalización e indica las existencias requeridas.
- **Inventario:** aviso y filtro para productos en o bajo el mínimo; historial filtrable por tipo de movimiento.
- **Adaptabilidad y estados:** tarjetas para pantallas pequeñas, estados de carga y error con reintento, foco visible y respeto a la preferencia del sistema para reducir movimiento.
- **Carga diferida:** las páginas de **Reportes** y **Usuarios** se descargan al abrirlas, no durante la carga inicial.

## Reportes

Administradores y superadministradores pueden consultar desde **Reportes** las solicitudes completadas y los movimientos dentro de un periodo de hasta 366 días, los productos actualmente en o bajo su mínimo y descargar el detalle como CSV. Los respaldos locales antiguos no tenían fecha de finalización, por lo que esas solicitudes no se incluyen en el conteo histórico por periodo.

## Copias de seguridad y restauración

La base activa es `data/gestora.sqlite`. Crea y verifica un respaldo consistente con el servicio detenido o en marcha:

```bash
npm run db:backup
npm run db:backup -- "C:\ruta-segura\gestora.sqlite"
```

La creación escribe primero un archivo temporal en el mismo directorio, verifica integridad y esquema, y lo renombra al destino solo cuando está completo. Si falla, no publica una copia parcial. La restauración **reemplaza los datos actuales**. Detén el servidor, conserva una copia del respaldo fuera del equipo y ejecuta:

```bash
npm run db:restore -- "C:\ruta-segura\gestora.sqlite"
```

El comando valida integridad, esquema y referencias, crea una copia de seguridad de la base activa y recupera el archivo anterior si falla el reemplazo. Tras restaurar, inicia el servidor y revisa inicio de sesión, solicitudes e inventario. Guarda respaldos cifrados fuera del servidor y prueba periódicamente la restauración; no los subas al repositorio.

## Despliegue detrás de HTTPS

El despliegue no se ha ejecutado porque todavía falta elegir el proveedor de hosting. La plataforma debe ofrecer un disco/volumen **persistente** para SQLite y terminación HTTPS. Despliega `dist/` como frontend estático y ejecuta `npm run server` como servicio API. Para la API configura `NODE_ENV=production`, un `SESSION_SECRET` aleatorio de al menos 32 caracteres, `APP_ORIGIN` con el origen HTTPS exacto del frontend, SMTP y `DB_FILE` en el volumen persistente. Si la plataforma requiere escuchar en todas las interfaces, configura `HOST=0.0.0.0`; deja que el proxy gestione HTTPS y no expongas directamente el puerto de Node. Al construir el frontend define `VITE_API_URL` con el origen API, sin añadir `/api`. CORS solo permite el origen de `APP_ORIGIN`. Configura respaldos automáticos y prueba la restauración antes de usar datos reales.

## Roles

- **Empleado:** consulta el catálogo, crea solicitudes y solo puede cancelar sus solicitudes activas.
- **Administrador:** gestiona solicitudes e inventario compartidos.
- **Superadministrador:** gestiona cuentas y roles, además de las funciones de administrador.

El backend permite como máximo dos cuentas **ADMIN** activas y una **SUPER_ADMIN**. El superadministrador se crea mediante el comando de bootstrap; desde **Usuarios** puede crear empleados y administradores, restablecer contraseñas y desactivar/reactivar cuentas.

## Solicitudes y cancelaciones

Las solicitudes nuevas empiezan como **Pendiente**. Al completarlas, el servidor descuenta el stock y registra una salida vinculada a la solicitud en la misma transacción SQLite. Si no hay existencias suficientes, no cambia ni la solicitud ni el inventario.

Una solicitud activa se puede cancelar después de confirmar. Cancelarla no modifica el stock y es un estado final. No se puede cancelar una solicitud que ya consumió existencias. Reabrir una completada tampoco devuelve stock; si se completa otra vez, no se descuenta por segunda vez. Para corregir una salida, registra una entrada con su motivo.

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

Vitest tiene suites API por dominio (`auth.api.test.js`, `requests.api.test.js`, `users.api.test.js` y `data.api.test.js`) y prueba OTP, roles, importación, reportes, movimientos y solicitudes. Las suites API usan bases temporales; `server/services/services.test.js` invoca servicios de inventario y solicitudes con SQLite en memoria, sin Express.
