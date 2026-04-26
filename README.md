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

## Local Map Tiles

La web tambien puede apuntar a tiles locales si defines esta variable:

```bash
NEXT_PUBLIC_LOCAL_TILE_URL=http://localhost:8080/tile/{z}/{x}/{y}.png
```

Importante: el archivo `.osm.pbf` descargado en `storage/maps/osm/` es fuente de datos y no se pinta directo en Leaflet. Primero hay que convertirlo o servirlo con un tile server local.

## Render Deploy

El repo ya incluye `render.yaml` para desplegar la web admin en Render.

Archivo:

```bash
render.yaml
```

### Estado actual de persistencia

La web ya no depende de archivos JSON locales para estado critico en produccion.

Ahora la persistencia principal va por PostgreSQL para:

- dispatch
- admin
- users
- messages
- preferences
- integrations
- blacklist
- driver discipline
- branding assets
- assistant knowledge assets

El filesystem local queda solo para desarrollo local y compatibilidad legacy temporal.

### Variables importantes en Render

```bash
NODE_ENV=production
NEXTAUTH_URL=https://your-service.onrender.com
NEXTAUTH_SECRET=generated-in-render
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_public_token
NEXT_PUBLIC_MAPBOX_STYLE_ID=mapbox/streets-v12
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_FROM=your_from_address
```

### Scaling en Render

Para poder usar multiples instancias o autoscaling, el web service no debe tener persistent disk adjunto.

Checklist esperado:

- sin `disk` en el servicio web
- sin `STORAGE_ROOT` obligatorio
- `DATABASE_URL` configurado
- health check en `/api/health`
- branding y assistant knowledge ya migrados a SQL

Los snapshots locales de respaldo estan desactivados en produccion para mantener el servicio stateless.

## Auth

NextAuth ahora usa `NEXTAUTH_SECRET` desde environment primero. Si no existe, todavia conserva el fallback local para no romper desarrollo.

## Que sube a Render

Si vas a Render, sube la web admin de la raiz del repo.

No subas `driver-app/` a Render como si fuera parte del servidor web.

## Que queda separado

- Root web app: Render
- `driver-app/`: Expo / EAS

Esa separacion evita mezclar dispatcher web con la app del chofer.
