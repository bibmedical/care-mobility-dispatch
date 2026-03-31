# Chat Backup - 2026-03-31 (Scroll + WillCall + Confirmation)

## Contexto rapido
Sesion enfocada en Dispatcher, Route Dashboard y Confirmation para corregir flujo operativo real en NEMT.

## Cambios aplicados

### 1) Dispatcher y Route Dashboard - scroll horizontal superior
- Se corrigio el comportamiento para que el scrollbar superior funcione cuando hay viajes reales cargados.
- Se sincroniza top/bottom scroll.
- Se mide el ancho real de la tabla (no solo del contenedor) para evitar que desaparezca con filas cargadas.
- Se usa observacion de resize para actualizar ancho en cambios dinamicos.
- El scrollbar superior se oculta cuando no hay viajes (evita mostrarlo en vacio).

### 2) Dispatcher y Route Dashboard - WillCall y notas
- Se agrego estado efectivo para WillCall en visualizacion/filtros.
- Regla automatica: candidatos no-AL con hora faltante/no valida se tratan como WillCall.
- Se mantiene conversion manual WC por boton para cualquier viaje.
- Se agrego override para apagar WC automatico cuando el usuario lo quite manualmente.
- Se aislaron eventos de input en modales de notas para evitar bloqueo al escribir.

### 3) Confirmation - controles de max miles y formato de pickup time
- Se agrego checkbox para mostrar/ocultar el badge de "Detected max".
- Queda apagado por defecto.
- Se mantuvo en Confirmation solamente (sin cambiar esa parte en Dispatcher/Route Dashboard).
- Se corrigio Pickup Time para valores numericos tipo Excel (ej. 46112.3222): ahora se convierte a hora legible AM/PM.

## Resultado esperado de UX
- Scroll superior visible cuando hay filas y oculto cuando no hay filas.
- WillCall consistente con reglas operativas + control manual.
- Modales de notas editables sin perder teclado.
- Confirmation sin badge "Detected max" hasta que el usuario active el check.
- Pickup Time legible en Confirmation.

## Archivos tocados en esta fase
- src/components/nemt/DispatcherWorkspace.jsx
- src/components/nemt/TripDashboardWorkspace.jsx
- src/components/nemt/ConfirmationWorkspace.jsx
- backup/chat-20260331-scroll-willcall-confirmation-backup.md
