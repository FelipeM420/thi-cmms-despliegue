# GUÍA TÉCNICA Y PROMPT EJECUTABLE PARA CLAUDE CODE
## Solución al Bloqueo de Puertos SMTP en Render mediante Webhook HTTPS (GmailApp)
**Proyecto:** THI-CMMS  
**Ubicación:** `D:\Mantenimiento\thi-cmms-sprint1\thi-cmms`

---

## 1. Diagnóstico del Error en Render

En los logs de Render se observa exactamente:
```
[CORREO] Enviando la OT OT-2026-0005 a: anfelombana123@umariana.edu.co, sefemoreno123@umariana.edu.co
[CORREO] No se pudo enviar el correo de la OT OT-2026-0005: Connection timeout
[CORREO] Enviando alerta(s) de mantenimiento a: ...
[CORREO] Error al enviar alerta: Connection timeout
```

### Causa Raíz
Render bloquea a nivel de cortafuegos (firewall) todos los puertos TCP salientes de correo directo (**puertos 25, 465 y 587**) en su plan gratuito para evitar abusos de spam.
Sin embargo, **el tráfico web saliente por HTTPS (Puerto 443) está 100% permitido y sin restricciones**.

### La Solución Arquitectónica (Ecosistema Google)
Dado que el proyecto de tesis ya integró y probó exitosamente el Webhook de **Google Apps Script** en la Fase 3 sobre HTTPS (Puerto 443), la solución más limpia y robusta es permitir que `correoAlertas.service.js` envíe el correo a través del mismo Webhook usando la API nativa de Google `GmailApp.sendEmail()`.

---

## 2. Actualización en el Google Apps Script (Por el usuario en script.google.com)

El script de Google Apps Script aceptará la acción `'enviar_correo'`:

```javascript
// Google Apps Script Webhook para THI-CMMS (Drive + Gmail)
const ID_CARPETA_RAIZ = 'ID_CARPETA_AQUI';
const TOKEN_SEGURIDAD = 'TOKEN_CONFIGURADO_EN_ENV';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN_SEGURIDAD) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'No autorizado' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ACCION 1: Despacho de Correo via Gmail (Puerto 443 HTTPS, nunca bloqueado por Render)
    if (data.accion === 'enviar_correo') {
      const { para, asunto, cuerpoHtml, cuerpoTexto, adjuntos } = data;
      const mailOptions = {
        htmlBody: cuerpoHtml,
      };
      if (adjuntos && adjuntos.length > 0) {
        mailOptions.attachments = adjuntos.map(att => {
          const decoded = Utilities.base64Decode(att.contenidoBase64);
          return Utilities.newBlob(decoded, att.mimeType, att.nombre);
        });
      }
      GmailApp.sendEmail(para, asunto, cuerpoTexto || '', mailOptions);
      return ContentService.createTextOutput(JSON.stringify({ 
        ok: true, 
        messageId: 'gas-' + new Date().getTime(),
        mensaje: 'Correo enviado con exito via GmailApp' 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ACCION 2: Respaldo en Google Drive (Existente de Fase 3)
    const { nombreArchivo, contenidoBase64, mimeType, subcarpeta } = data;
    const carpetaRaiz = DriveApp.getFolderById(ID_CARPETA_RAIZ);
    const subcarpetas = carpetaRaiz.getFoldersByName(subcarpeta);
    const destino = subcarpetas.hasNext() ? subcarpetas.next() : carpetaRaiz;

    const decoded = Utilities.base64Decode(contenidoBase64);
    const blob = Utilities.newBlob(decoded, mimeType, nombreArchivo);
    const archivo = destino.createFile(blob);

    return ContentService.createTextOutput(JSON.stringify({ 
      ok: true, 
      id: archivo.getId(), 
      url: archivo.getUrl() 
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

## 3. Instrucción Maestra para Claude Code (Copiar y Pegar en Claude)

```markdown
Hola Claude. En Render el envío de correo por SMTP directo (puerto 465) arrojó `Connection timeout` porque Render bloquea los puertos SMTP salientes en su plan gratuito.
Vamos a implementar el despacho por Webhook HTTPS de Google Apps Script (que ya usamos para Drive en el puerto 443) como canal primario/fallback en `backend/src/services/correoAlertas.service.js`.

Requerimientos:
1. En `backend/src/config/correo.js`:
   - Lee `GOOGLE_DRIVE_WEBHOOK_URL` y `GOOGLE_DRIVE_TOKEN`.
   - Si `GOOGLE_DRIVE_WEBHOOK_URL` está configurado, habilita el despacho por Webhook HTTPS.
2. En `backend/src/services/correoAlertas.service.js`:
   - Crea `enviarCorreoPorWebhookHttps({ para, asunto, cuerpoHtml, cuerpoTexto, adjuntos = [] })`:
     - Envía un `fetch` POST a `GOOGLE_DRIVE_WEBHOOK_URL` con:
       `{ accion: 'enviar_correo', token: GOOGLE_DRIVE_TOKEN, para, asunto, cuerpoHtml, cuerpoTexto, adjuntos }`
     - Los adjuntos se serializan a `{ nombre, mimeType, contenidoBase64 }`.
     - Si la respuesta es `{ ok: true }`, se registra éxito con su `messageId`.
   - En `notificarOrdenTrabajoConPdf` y `notificarAlertasGeneradas`:
     - Si `GOOGLE_DRIVE_WEBHOOK_URL` está definido, usa `enviarCorreoPorWebhookHttps`. Si falla o no está definido, intenta con `mailer.sendMail` (SMTP).
     - De este modo, en Render (que tiene `GOOGLE_DRIVE_WEBHOOK_URL` configurado) el correo sale por HTTPS (puerto 443) y **jamás da Connection timeout**. En local o en servidores con puertos abiertos sigue funcionando SMTP.
3. Actualiza las pruebas en `backend/test/correo-alertas.test.js` para cubrir el despacho vía Webhook.
4. Verifica que `npm test` pase al 100% con 0 fallos.
5. Haz commit en la rama `main` o en una rama dedicada.
```
