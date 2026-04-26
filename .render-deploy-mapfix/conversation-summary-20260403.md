# Conversation Summary — April 3, 2026
## Status: ✅ STABLE — Site working on Render

---

## Resumen de todo lo que se hizo esta sesión

### 1. Blacklist Permission Fix — `8c51867`
- **Problema**: Dispatch users (webAccess: true, no admin) no podían remover pacientes del Blacklist. Recibían 403.
- **Fix**: `src/app/api/blacklist/route.js` — Abrió el PUT a cualquier usuario autenticado con `webAccess: true` que no sea driver.
- **Código clave**: `const hasBlacklistWriteAccess = isAdminRole(userRole) || (Boolean(session?.user?.webAccess) && !isDriverRole(userRole));`

### 2. Dispatcher Messaging JSON Crash — `fdc8b80`
- **Problema**: "Unexpected token `<`, `<!DOCTYPE` ... is not valid JSON" en el panel de mensajes.
- **Causa**: La API `system-messages` devolvía HTML cuando crasheaba; el frontend llamaba `.json()` sin verificar content-type.
- **Fix**:
  - `src/app/api/system-messages/route.js` — Envuelto todos los handlers en try/catch.
  - `src/components/nemt/DispatcherMessagingPanel.jsx` — Función `readJsonResponse()` que valida content-type antes de parsear. Alert banner movido a badge pequeño en el header.

### 3. Driver App EAS OTA Update — `7a9608b`
- **Problema**: Driver app no tenía `expo-updates` configurado, no podía recibir updates OTA.
- **Fix**:
  - Instalado `expo-updates: ~55.0.18`, `react-dom: 19.2.0`, `react-native-web: ^0.21.0`
  - `driver-app/app.json` — Agregado `runtimeVersion: {policy: "appVersion"}` y `updates.url`
  - Update group publicado: `bb493768-5192-47dc-8552-d637ed846013`
- **EAS Project ID**: `18100902-f02f-4e6e-a660-d3718fd5200d`

### 4. App Crash (Client-side Exception) + Dashboard Glitch — `016c77d`
- **Problema 1**: "Application error: a client-side exception has occurred" en Render.
  - **Causa**: `blockingState` usada en el filter de `matchedTrips` en `ConfirmationWorkspace.jsx` sin estar declarada en ese scope → `ReferenceError`.
  - **Fix**: `src/components/nemt/ConfirmationWorkspace.jsx` ~línea 583 — agregado `const blockingState = tripBlockingMap.get(trip.id);` antes del uso.
- **Problema 2**: Trip Dashboard "going crazy" / mostrando vacío.
  - **Causa**: `tripDateFilter === 'all'` hacía que `cityOptionTrips` useMemo retornara lista vacía.
  - **Fix**: `src/components/nemt/TripDashboardWorkspace.jsx` — `const effectiveTripDateFilter = tripDateFilter === 'all' ? todayDateKey : tripDateFilter;`

### 5. Full System Audit + 9 Critical API Routes Hardened — `2115e70`
- **Encontrado**: 15 de 48 rutas sin try/catch. Las 9 más críticas fueron corregidas.
- **SQL Layer**: LIMPIO — todas las queries usan parámetros posicionales (`$1`, `$2`), sin SQL injection.
- **Rutas corregidas** (todas con `internalError` helper que devuelve JSON 500 en lugar de crashear):
  - `src/app/api/nemt/dispatch/route.js` (GET + PUT) — Hub principal de despacho
  - `src/app/api/nemt/admin/route.js` (GET + PUT) — Admin data
  - `src/app/api/mobile/driver-trips/route.js` (GET) — Driver app trips
  - `src/app/api/mobile/driver-location/route.js` (POST) — GPS updates
  - `src/app/api/mobile/driver-messages/route.js` (GET + POST) — Chat
  - `src/app/api/mobile/driver-trip-actions/route.js` (POST) — Trip actions (arrived/complete)
  - `src/app/api/driver-portal/me/route.js` (GET) — Driver web portal
  - `src/app/api/driver-portal/me/messages/route.js` (POST)
  - `src/app/api/driver-portal/me/trips/action/route.js` (POST)

### 6. 502 Bad Gateway Fix — `c6d2eb1`
- **Problema**: Render mostraba 502 Bad Gateway.
- **Causa**: keepAliveTimeout bajo del load balancer de Render cortaba conexiones Node.js.
- **Fix**:
  - `package.json` → `"start": "next start --keepAliveTimeout 120000"` 
  - `render.yaml` → `NODE_OPTIONS: "--max-old-space-size=400"` para evitar OOM en Starter (512MB)

---

## Estado Actual del Sistema

### Web App (Render)
- **URL**: `care-mobility-dispatch-web.onrender.com`
- **Estado**: ✅ FUNCIONANDO
- **Último deploy**: commit `c6d2eb1` (tag `stable-20260403`)
- **Plan**: Starter (512MB RAM, 0.5 CPU)

### Driver App (Expo)
- **Package**: `com.caremobility.driverapp`
- **Versión**: `1.0.0` en `app.json`, `version: "1.0.0"` en package.json
- **SDK Expo**: ~55
- **EAS Project ID**: `18100902-f02f-4e6e-a660-d3718fd5200d`
- **OTA configurado**: Sí (últimas actualizaciones via EAS Update)
- **Rutas API mobile que usa**:
  - `POST /api/mobile/driver-login` — Login con username/password
  - `POST /api/mobile/driver-notifications` — Registro push token
  - `GET /api/mobile/driver-trips?driverId=X` — Cargar trips del driver
  - `POST /api/mobile/driver-trip-actions` — En route/arrived/complete
  - `GET /api/mobile/driver-messages?driverId=X` — Mensajes
  - `POST /api/mobile/driver-messages` — Enviar mensaje
  - `POST /api/mobile/driver-location` — GPS (intervalo corto)
  - `GET /api/mobile/driver-profile` — Perfil del driver

### Base de Datos
- **Tipo**: PostgreSQL (Render managed)
- **Conexión**: `DATABASE_URL` env var (solo disponible en Render, no local)
- **Cliente**: `src/server/db.js`
- **Schema**: `src/server/db-schema.js` (corre migrations al iniciar)

### Autenticación
- **Web**: NextAuth.js JWT sessions, IP-binding, inactividad 15min
- **Driver App**: Token custom via `/api/mobile/driver-login`
- **Roles**: `'DBSS Admin(Full...)'` (admin) | `'Driver(Driver)'` (driver)
- `isAdminRole()` → busca substring `'admin'`
- `isDriverRole()` → busca substring `'driver'`

---

## Credenciales Importantes

### Harold (Driver)
- **Username**: `Harold`
- **Password**: `Harold@95`
- **Phone**: `813-465-0895`
- **ID**: `user-9`
- **Role**: `Driver(Driver)`

### Fórmula de passwords
```
buildPasswordForUser(user) → `${CapitalizedFirstName}@${lastTwoPhoneDigits}`
```
Ejemplo: Harold, phone `813-465-0895` → `Harold@95`

### Admin principal
- **Username**: `Admin`
- **User**: DBSS / balbino perez
- **Phone**: `407-868-2466` → Password: `Admin@66` (pero puede tener password custom)

---

## Archivos Clave del Proyecto

```
src/
  app/
    api/
      auth/[...nextauth]/options.js   ← NextAuth config, IP binding, session
      blacklist/route.js              ← Fixed: webAccess users can modify
      nemt/dispatch/route.js          ← Main dispatch state R/W (hardened)
      nemt/admin/route.js             ← Admin data R/W (hardened)
      system-messages/route.js        ← Messages API (hardened)
      mobile/
        driver-login/route.js         ← Driver app authentication
        driver-trips/route.js         ← Driver trips (hardened)
        driver-location/route.js      ← GPS tracking (hardened)
        driver-messages/route.js      ← Driver chat (hardened)
        driver-trip-actions/route.js  ← Trip status actions (hardened)
        driver-notifications/route.js ← Push token registration
      driver-portal/me/route.js       ← Web portal for drivers (hardened)
  components/nemt/
    ConfirmationWorkspace.jsx         ← Fixed: blockingState crash
    TripDashboardWorkspace.jsx        ← Fixed: 'all' date filter
    DispatcherMessagingPanel.jsx      ← Fixed: JSON parse hardened
  server/
    db.js                             ← PostgreSQL client
    db-schema.js                      ← Migrations (run on startup)
    nemt-dispatch-store.js            ← Main dispatch state persistence
    nemt-admin-store.js               ← Admin/drivers state persistence
    system-messages-store.js          ← Messages persistence
    system-users-store.js             ← Users (seeded from system-users.js)
  helpers/
    system-users.js                   ← USER_SEED array + buildPasswordForUser
    nemt-dispatch-state.js            ← Normalizers and helpers
    nemt-admin-model.js               ← Admin model helpers

driver-app/
  app.json                            ← Expo config (OTA configured)
  package.json                        ← expo-updates ~55.0.18 installed
  app/                                ← Expo Router screens
  components/                         ← Driver app components

render.yaml                           ← Render deployment config
package.json                          ← next start --keepAliveTimeout 120000
```

---

## Git History (últimos commits relevantes)

```
c6d2eb1 Fix Render 502: add keepAliveTimeout 120s and Node memory cap for starter plan
2115e70 System audit: add try/catch to 9 critical API routes (dispatch, admin, mobile, driver-portal)
016c77d Fix confirmation crash and stabilize trip dashboard filters
7a9608b Configure driver app for EAS OTA updates
fdc8b80 Harden dispatcher messaging alerts API handling
8c51867 Allow dispatcher web users to update blacklist
```

**Git tag estable**: `stable-20260403`
Para restaurar: `git checkout stable-20260403`

---

## Rutas API Still Missing try/catch (baja prioridad)
Estas no crashean el cliente pero podrían mejorarse en el futuro:
- `cron/license-check` — Solo se llama desde el cron diario
- `email-templates` — Admin only, low traffic
- `integrations/sms/ringcentral/webhook/route.js` — Webhook externo
- `integrations/sms/telnyx/webhook/route.js` — Webhook externo
- `integrations/sms/twilio/webhook/route.js` — Webhook externo
- `integrations/uber/callback/route.js` — OAuth callback

---

## Para Prevenir Futuros 502 en Render

### Ya aplicado:
- `next start --keepAliveTimeout 120000` en `package.json`
- `NODE_OPTIONS=--max-old-space-size=400` en `render.yaml`

### Recomendaciones adicionales para el próximo chat:
1. **Upgrade plan** en Render de Starter a Starter+ o Standard para más RAM y evitar OOM
2. **Health check** más robusto — agregar endpoint `/api/health` que verifique DB connection
3. **Render deploy notifications** — configurar en Render dashboard para alertas en Discord/email
4. **Keep-warm cron** — si el plan hace sleep, agregar un ping cada 14 minutos
5. **Monitor logs** en Render dashboard → Logs tab para ver si hay más errores OOM o SIGKILL

---

## Estado de la Driver App Build
El build APK fue iniciado múltiples veces via EAS. Para verificar el estado del último build:
```
cd driver-app
npx eas build:list --platform android --limit 5
```
O en: https://expo.dev/accounts/[account]/projects/driver-app/builds
