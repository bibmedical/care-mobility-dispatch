# Communication Extensions - WhatsApp, Telegram, Viber, Signal, SMS

Este módulo permite enviar mensajes a los choferes a través de múltiples canales de comunicación directamente desde Care Mobility.

## 🚀 Auto-Liga con Números Existentes

**¡Buena noticia!** El sistema automáticamente usa los números de teléfono que ya tienes guardados:

- **WhatsApp**: Usa `whatsappNumber` si está guardado, sino usa `phone`
- **SMS**: Usa `phone` directamente
- **Telegram/Viber/Signal**: Usa los campos específicos si están configurados

Esto significa que **ya puedes enviar WhatsApp a todos tus choferes sin hacer nada** - el sistema detecta automáticamente el número. ✅

## Canales Soportados

### 1. **WhatsApp** 🟢
- Usa **Twilio WhatsApp Business API**
- Envía mensajes de texto y multimedia
- Requiere número verificado de WhatsApp Business

**Configuración:**
```bash
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

**Costo:** ~$0.005 - $0.02 por mensaje

---

### 2. **Telegram** 🔵
- Usa **Telegram Bot API**
- Envía mensajes de texto y comandos
- Requiere que el driver tenga Telegram

**Configuración:**
```bash
TELEGRAM_BOT_TOKEN=your_bot_token
```

**Pasos:**
1. Abre Telegram y busca `@BotFather`
2. Crea un nuevo bot: `/newbot`
3. Guarda el token en `.env.local`

**Costo:** ¡Gratis!

---

### 3. **Viber** 💜
- Usa **Viber Business Messages API**
- Envía notificaciones y mensajes promotivos
- Requiere número de Viber registrado

**Configuración:**
```bash
VIBER_BOT_TOKEN=your_viber_token
```

**Costo:** Similar a WhatsApp

---

### 4. **Signal** 🔒
- Mensajería encriptada
- Requiere Signal server/bridge propio
- Máxima privacidad

**Configuración:**
```bash
SIGNAL_SERVER_URL=https://your-signal-server.com
```

---

### 5. **SMS** 📱
- Usa **Twilio SMS API**
- Funciona en cualquier teléfono
- Tarifa por mensaje

**Configuración:**
```bash
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_SMS_NUMBER=+1234567890
```

---

## Instalación

### 1. Agregar números de contacto a los choferes

En **Drivers > Editar Driver > Extensions**:
- WhatsApp: +1 (555) 123-4567
- Telegram: @driver_username
- Viber: +1 (555) 123-4567
- Signal: +1 (555) 123-4567
- Phone: ya existe

### 2. Configurar las claves API

Copia `.env.local.example` a `.env.local`:
```bash
cp .env.local.example .env.local
```

Llena tus claves API (o déjalas vacías para **modo demo**).

### 3. Usar desde la interface

**Opción A - Desde Dispatch Dashboard:**
- Ve a **Dispatch > Driver > Click en ícono de mensaje**
- Selecciona el canal (WhatsApp, Telegram, etc.)
- Escribe el mensaje
- Click **Send**

**Opción B - Desde Drivers Management:**
- Ve a **Drivers > Editar Driver > Pestaña Extensions**
- Botón "Send Message" (si agregas)
- Selecciona canal y envía

---

## Modo Demo (Sin Configuración)

Si no configuras las claves API, el sistema corre en **DEMO MODE**:
- Los mensajes se **registran en logs**
- No se envían realmente
- Perfecto para testing y desarrollo
- Útil para demostración de features

---

## API Endpoints

### POST `/api/extensions/send-message`

**Body:**
```json
{
  "method": "whatsapp",
  "phoneNumber": "+1234567890",
  "telegramHandle": "@driver_username",
  "viberNumber": "+1234567890",
  "signalNumber": "+1234567890",
  "message": "Your route is ready",
  "driverId": "driver_123",
  "driverName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "provider": "whatsapp",
  "messageId": "SM1234567890abcdef",
  "demo": false
}
```

---

## Costos Estimados (Mensual)

Suponiendo 100 choferes, 2 mensajes/dia = 6000 mensajes/mes:

| Canal | Costo/Mensaje | Mensual |
|-------|---------------|---------|
| WhatsApp | $0.01 | $60 |
| SMS | $0.0075 | $45 |
| Telegram | GRATIS | $0 |
| Viber | $0.015 | $90 |
| Signal | GRATIS* | $0 |

*Signal solo si tienes tu propio servidor

---

## Próximas Features

- [ ] Crear "Broadcast" para enviar a múltiples choferes
- [ ] Plantillas de mensajes pre-hechas ("Viaje Asignado", "Cambio de Ruta", etc.)
- [ ] Historial de mensajes por driver
- [ ] Webhooks para recibir respuestas
- [ ] Soporte para WhatsApp Templates (más barato)
- [ ] Media files (imágenes, PDFs de rutas)

---

## Troubleshooting

### "Twilio not configured"
→ Configura `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN` en `.env.local`

### "Telegram message failed"
→ Verifica que el `telegramHandle` sea válido (ej: `@username` o `123456789`)

### "WhatsApp says recipient is invalid"
→ Asegúrate que el número esté en formato internacional: `+1` + país + número

### En "Demo Mode", ¿quién recibe el mensaje?
→ Nadie. Se registra en los logs de la app solo. Útil para testing.

---

## Seguridad

- Los números de teléfono se **nunca se loguean** en texto plano
- Las claves API se **protegen en `.env`** (no se commitean)
- Los mensajes se **encriptan en tránsito** (HTTPS)
- Signal ofrece **encriptación end-to-end**

---

**¿Preguntas?** Revisa `/src/app/api/extensions/send-message/route.js` para ver la implementación.
