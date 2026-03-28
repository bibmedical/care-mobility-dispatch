## Care Mobility Dispatch

Este workspace tiene dos proyectos separados:

- Web admin en la raiz: dispatcher, trip dashboard, billing, imports, grouping, users e integrations
- App movil del chofer en `driver-app/`: proyecto Expo separado

La web y la app del chofer no deben desplegarse juntas.

## Web Admin

Proyecto principal: Next.js 15

Comandos locales:

```bash
npm run dev
npm run build
npm run start
```

## Driver App

Proyecto separado: Expo

Ruta:

```bash
driver-app/
```

Comandos locales:

```bash
cd driver-app
npm start
```

La app Expo no se sube a Render. Esa parte se publica con Expo / EAS.

## Mapbox

La web puede usar Mapbox con estas variables:

```bash
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_public_token
NEXT_PUBLIC_MAPBOX_STYLE_ID=mapbox/streets-v12
```

Si no existe token, usa OpenStreetMap.

## Render Deploy

El repo ya incluye `render.yaml` para desplegar la web admin en Render.

Archivo:

```bash
render.yaml
```

### Por que hizo falta update

La web guarda informacion en archivos JSON:

- `nemt-admin.json`
- `nemt-dispatch.json`
- `system-users.json`
- `integrations.json`

En Render, el filesystem normal no es confiable para persistencia entre reinicios y deploys. Por eso ahora el proyecto usa `STORAGE_ROOT` y un disco persistente.

### Variables importantes en Render

```bash
NODE_ENV=production
NEXTAUTH_URL=https://your-service.onrender.com
NEXTAUTH_SECRET=generated-in-render
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_public_token
NEXT_PUBLIC_MAPBOX_STYLE_ID=mapbox/streets-v12
STORAGE_ROOT=/var/data/care-mobility/storage
```

### Disco persistente

Render debe montar un disk en:

```bash
/var/data/care-mobility
```

La app guardara los JSON dentro de:

```bash
/var/data/care-mobility/storage
```

## Auth

NextAuth ahora usa `NEXTAUTH_SECRET` desde environment primero. Si no existe, todavia conserva el fallback local para no romper desarrollo.

## Que sube a Render

Si vas a Render, sube la web admin de la raiz del repo.

No subas `driver-app/` a Render como si fuera parte del servidor web.

## Que queda separado

- Root web app: Render
- `driver-app/`: Expo / EAS

Esa separacion evita mezclar dispatcher web con la app del chofer.
