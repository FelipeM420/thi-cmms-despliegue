# ADR-0003: Archivos, consentimiento y retención de datos personales (Ley 1581)

**Fecha**: 2026-09-24
**Estado**: proposed
**Decisores**: Andrés Lombana y Sebastián Moreno (desarrollo). Pendiente: Product Owner (Diego Narváez) y asesoría jurídica de THI S.A.S.

## Contexto

La ejecución guarda fotografías de evidencia y una firma de conformidad. El Product Owner indicó que la foto de firma se trata como dato sensible (posiblemente biométrico): requiere consentimiento previo y solo se usa para auditoría y control del mantenimiento.
Indicó también que los registros se conservan al menos diez años o toda la vida útil del equipo.
El sistema servía `/uploads` sin autenticación, confiaba en el tipo de archivo que declaraba el cliente y permitía escribir la firma como texto libre.

## Decisión

1. **Acceso a archivos.** `/uploads` exige una cookie HttpOnly con el JWT que se emite al iniciar sesión. Sin cookie responde 401; un archivo inexistente y uno no autorizado responden el mismo 404. Cada prefijo tiene su regla: las evidencias solo las ve el técnico de esa ejecución o el administrador, y el informe de un servicio externo solo el administrador. Cada lectura de evidencia queda en la bitácora de auditoría.
2. **Subidas.** Solo PNG, JPEG y PDF, verificados por los bytes del contenido (no por el tipo que declara el cliente), con nombre generado y límite de tamaño. Se autoriza antes de leer la subida.
3. **Consentimiento.** El aviso tiene versión. Cada usuario acepta la vigente; la aceptación (quién, versión, fecha) se guarda en una tabla de solo altas que la base protege con un disparador. Sin aceptación no se inicia, edita ni finaliza una ejecución (403 con código `CONSENTIMIENTO_REQUERIDO`). Si cambia el texto de fondo, se sube la versión y todos vuelven a aceptar.
4. **Firma de conformidad.** La fija el servidor con el nombre del usuario autenticado y la hora real; el cliente solo indica si firma o no.
5. **Retención.** No hay purga automática. Todas las claves foráneas son `RESTRICT`, así que borrar un padre no elimina ni anula evidencia. La conservación mínima es de diez años o la vida útil del equipo, lo que sea mayor.

## Alternativas consideradas

### Alternativa 1: URL firmadas con vencimiento
- **A favor**: se pueden compartir enlaces temporales.
- **En contra**: el token viaja en la URL y queda en registros y en el encabezado `Referer`.
- **Por qué no**: la cookie HttpOnly no es legible por scripts ni aparece en la URL.

### Alternativa 2: pedir las imágenes con el encabezado `Authorization`
- **A favor**: un solo mecanismo de sesión.
- **En contra**: una etiqueta `<img>` no puede enviar encabezados; habría que descargar cada imagen como blob y reescribir todas las vistas.
- **Por qué no**: cambio de frontend grande para el mismo resultado.

### Alternativa 3: dejar `/uploads` público y confiar en nombres no adivinables
- **A favor**: cero cambios.
- **En contra**: cualquiera con el enlace ve datos personales; no hay trazabilidad de quién los consultó.
- **Por qué no**: incumple el principio de seguridad de la Ley 1581.

## Consecuencias

### Positivas
- Hay prueba de que cada usuario aceptó el aviso que corresponde a cada versión.
- El acceso a evidencia queda auditado, incluidos los intentos denegados.
- Nadie puede firmar con el nombre de otra persona.

### Negativas
- Sin sesión ya no se ven las imágenes (por ejemplo, un enlace copiado).
- Quien no acepta el aviso no puede registrar ejecuciones y el administrador tendría que hacerlo por él.

### Riesgos y pendientes (requieren criterio jurídico)
- El texto del aviso es un **borrador** del equipo de desarrollo (`backend/src/config/politicaDatos.js`, marcado `BORRADOR_PENDIENTE_VALIDACION`). Falta la revisión del asesor jurídico, el responsable y el correo para ejercer derechos, y la cita normativa exacta del plazo de conservación.
- Confirmar si aplica la inscripción de la base de datos en el RNBD.
- Definir qué significa revocar la autorización cuando existe el deber de conservar el registro histórico.
- El consentimiento de un empleado frente a su empleador puede no ser plenamente libre; valorar con jurídica si la base de legitimación es otra.
- Sin purga automática no hay olvido: definir el procedimiento manual y quién lo aprueba.
- La bitácora de auditoría sigue siendo un archivo plano, no una tabla consultable.
- Antes se aceptaba cualquier `image/*`; ahora `/uploads` solo sirve nombres `<prefijo>-<id>.(png|jpg|jpeg|pdf)`. Un archivo subido antes con otra extensión (webp, gif) dejaría de verse.
  En el entorno de desarrollo se verificó el 2026-09-26 que los seis archivos existentes cumplen el formato; en cualquier otro entorno hay que revisarlo antes de desplegar.
