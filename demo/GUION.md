# Guion del video de demostración — THI · CMMS

Para narrar en vivo mientras grabas la pantalla (OBS, Xbox Game Bar con `Win+Alt+R`, o la grabadora de Chrome).
Antes de grabar: backend (`npm run dev`, :4000) y frontend (`npm run dev`, :5173) encendidos, y `npm run seed` ejecutado.

Distintivos: ⭐ administrador · 🔩 técnico (se ven en el menú lateral, cronograma, OT y alertas).

## Cuentas

| Rol | Correo | Contraseña |
|---|---|---|
| ⭐ Administrador | anfelombana123@umariana.edu.co | THIadmin2026* |
| 🔩 Técnico | carlos.mendoza@thi.com.co | THItecnico2026* |

## Orden recomendado (el flujo se alimenta solo)

Administrador crea y asigna → Técnico ejecuta → Administrador revisa reportes.

## Parte 1 — ⭐ Administrador (≈ 6 min)

1. **Login.** "Se ingresa con correo institucional; el rol define qué ve cada usuario." Resalta el ⭐ junto al nombre abajo a la izquierda.
2. **Equipos.** Inventario de activos; abre un equipo: ficha, mantenimientos e historial.
3. **Mantenimiento → Cronograma.** Calendario mensual, filtros por equipo, técnico, estado y prioridad.
4. **Nuevo mantenimiento.** Elige equipo, tarea, fecha de hoy, prioridad y una nota. *Programar*.
5. **Asignar técnico (novedad).** Abre la ocurrencia recién creada. En el selector los técnicos salen **ordenados por menor esfuerzo**: el primero dice «★ Recomendado» y cada uno muestra sus pendientes y horas (`libre`, `1 pendiente · 1 h`…). Explica: "El esfuerzo es la suma de la duración estimada de lo que ya tiene asignado". Asigna al recomendado; muestra el 🔩 en la columna Técnico.
6. **Órdenes de trabajo.** *Generar órdenes de la semana*: el sistema crea las OT (consecutivo `OT-AAAA-0000`) de lo programado. Abre una y muestra la descarga del PDF.
7. **Alertas.** Preventivas a 15, 8 y 1 día, y vencidas.
8. **Reportes** (solo administrador): costos, equipos, áreas, recursos (mano de obra por 🔩 técnico) e historial; muestra la exportación CSV.
9. **Salir.**

## Parte 2 — 🔩 Técnico (≈ 5 min)

1. **Login** con la cuenta de técnico. Muestra que el menú no tiene *Reportes* y que «Mantenimiento» pasó a ser **Mis Tareas**.
2. **Aviso de datos personales (Ley 1581).** Se acepta una vez por versión del texto.
3. **Dashboard** del técnico: su trabajo.
4. **Mis Tareas:** solo lo que el administrador le asignó (la tarea del paso 5 de la Parte 1).
5. **Ejecutar:** *Iniciar mantenimiento* (queda la hora). Completa hora de inicio y fin, **valor hora** (obligatorio para finalizar), observaciones, insumos (opcional), evidencias antes/después (PNG, JPEG o PDF) y la casilla de **firma de conformidad** (el sistema escribe nombre, fecha y hora). *Guardar datos*.
6. **Finalizar mantenimiento (Completado):** los costos quedan congelados. Alternativa a mostrar: *Registrar No Ejecutado* con motivo.
7. **Órdenes de trabajo** y **Alertas** del técnico (solo las suyas).
8. **Salir.**

## Cierre (≈ 1 min) — ⭐ Administrador otra vez

Entra a **Reportes → Recursos**: el trabajo recién ejecutado aparece en horas-hombre y costo del 🔩 técnico. "Todo el ciclo: programar, asignar, ejecutar, cerrar y medir."

## Consejos para la grabación

- Resolución 1920×1080, zoom del navegador al 100 %–110 % para que se lea.
- Dos ventanas de navegador (una por rol, una en modo incógnito) evitan cerrar y abrir sesión.
- Después de cada demo, la base queda con datos nuevos; para repetir limpio, vuelve a correr `npm run seed`.
