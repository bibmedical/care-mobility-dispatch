# Quick Start - Driver Communication

## 📱 Enviar Mensajes a Choferes

### Opción 1: Desde Dispatcher
En el panel de despacho, cuando seleccionas un chofer, verás botones de comunicación rápida:

```
[WhatsApp] [Telegram] [Viber] [Signal] [SMS]
```

Click en cualquiera para abrir el modal de mensajería.

### Opción 2: Desde Driver Profile
En **Drivers > Editar Chofer > Extensions tab**:
- Botón "Send Message" abre el selector de canales
- Preselecciona automáticamente el canal disponible

### Opción 3: Quick WhatsApp Link
Directamente desde el navegador, sin modal:
```javascript
import { openWhatsAppDirect } from '@/utils/communication-utils';

openWhatsAppDirect(driver, 'Your route is ready!');
```
Esto abre WhatsApp Web en una pestaña nueva. ✅

---

## 🔄 Flujo Automático de Números

**Todos tus choferes ya tienen números de teléfono guardados**, así que:

1. ✅ WhatsApp = usa `phone` automáticamente
2. ✅ SMS = usa `phone` automáticamente
3. 📱 Telegram = detecta si tiene `@handle`
4. 📱 Viber = detecta si tiene número
5. 📱 Signal = detecta si tiene número

**No necesitas hacer nada.** El sistema es inteligente. 🧠

---

## 💬 Cómo Funciona

### WhatsApp
```
Node.js App
    ↓
Twilio API (si está configurado)
    ↓
WhatsApp Business Account
    ↓
Driver's Phone
```

**Sin Twilio**: Solo abre WhatsApp Web (demo mode)

### SMS
```
Node.js App
    ↓
Twilio SMS API (si está configurado)
    ↓
Driver's Phone
```

### Telegram Bot
```
Node.js App
    ↓
Telegram Bot API
    ↓
Driver's Telegram Account
```

---

## ⚙️ Configuración Mínima

Solo necesitas llenar `.env.local` **SI quieres enviar mensajes reales**:

```bash
# Para WhatsApp + SMS (Recomendado)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_SMS_NUMBER=+1234567890

# Para Telegram (Gratis)
TELEGRAM_BOT_TOKEN=your_bot_token

# El rest es opcional
```

---

## 🎯 Casos de Uso

### 1. Notificación de Viaje Asignado
```
"Hola Juan, tu ruta está lista. 
Viajes: 5
Hora de inicio: 8:00 AM
Ver detalles: [LINK]"
```

### 2. Cambio de Ruta
```
"⚠️ Tu ruta del hoy ha cambiado.
Nuevos viajes: 7 (antes eran 5)
Por favor confirma en la app."
```

### 3. Alerta de Tráfico
```
"⏰ Tráfico en la ruta.
Estimado retraso: 15 min
Ajusta tu horario si es posible."
```

### 4. Confirmación de Llegada
```
"✅ Robert ha confirmado: Proyecto completado"
```

---

## 📊 Dashboard de Comunicación

(Próxima feature)
- Ver historial de mensajes por chofer
- Estadísticas: mensajes enviados, leídos, respondidos
- Templates predefinidos para ahorrar tiempo

---

## 🔒 Privacidad & Seguridad

- Los números **NUNCA se guardan en logs** en texto plano
- Las claves API se **protegen en `.env`** (no se commitean)
- WhatsApp/Telegram usan **encriptación end-to-end**
- Signal usa **encriptación E2E nativa**

---

## ❓ FAQ

**P: ¿Por qué no aparece el botón de WhatsApp?**
A: El chofer no tiene teléfono guardado. Agrega uno en **Drivers > Editar > Profile**.

**P: ¿Puedo enviar imágenes/PDF?**
A: Próxima feature. Por ahora solo texto.

**P: ¿Se cobra por WhatsApp?**
A: Si usas Twilio: $0.01 - $0.02 por mensaje. Sin Twilio: gratis (demo mode).

**P: ¿Funciona sin configuración?**
A: Sí. En demo mode se registra en logs pero no se envía realmente.

---

## 🚀 Próximas Features

- [ ] Mensajes con imágenes/PDFs
- [ ] Broadcast a múltiples choferes
- [ ] Templates de mensajes
- [ ] Recibir respuestas (webhook)
- [ ] Historial de mensajes
- [ ] WhatsApp Media Upload
- [ ] Auto-responder (fuera de hora)

---

**¿Preguntas?** Revisa [EXTENSIONS_README.md](./EXTENSIONS_README.md) para más detalles técnicos.
