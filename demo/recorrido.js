// Recorrido automático del CMMS por rol, GRABADO en video (.webm) con subtítulos.
// Sirve como guion del video de demostración y como sesión de testing grabada.
//
//   npm run demo:admin | demo:tecnico | demo:todo      (backend :4000 y frontend :5173 encendidos)
//
// Variables: URL_APP (http://localhost:5173), GRABAR=0 (sin video), LENTO=1 (más pausa para narrar),
//            SIN_VENTANA=1 (navegador oculto), NAVEGADOR (chrome | msedge, por defecto chrome).
// Salida: demo/videos/<rol>.webm e informe demo/videos/informe-<rol>.json (qué pasos pasaron o fallaron).
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const URL_APP = process.env.URL_APP || 'http://localhost:5173';
const GRABAR = process.env.GRABAR !== '0';
const PAUSA = process.env.LENTO === '1' ? 2600 : 1300;
const DIR_VIDEOS = path.join(__dirname, 'videos');

const CUENTAS = {
  admin: { email: 'anfelombana123@umariana.edu.co', password: 'THIadmin2026*' },
  tecnico: { email: 'carlos.mendoza@thi.com.co', password: 'THItecnico2026*' },
};

// Fecha-hora local (formato de <input type="datetime-local">) a `min` minutos de ahora.
const localISO = (min) => {
  const d = new Date(Date.now() + min * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const hoy = () => new Date().toISOString().slice(0, 10);

// Subtítulo superpuesto: se vuelve a poner en cada paso (una navegación completa lo borra).
async function subtitulo(page, texto) {
  await page
    .evaluate((t) => {
      let el = document.getElementById('__subtitulo_demo');
      if (!el) {
        el = document.createElement('div');
        el.id = '__subtitulo_demo';
        el.style.cssText =
          'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;max-width:80%;' +
          'background:rgba(15,23,42,.92);color:#fff;font:600 17px system-ui;padding:12px 22px;border-radius:12px;' +
          'box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none;text-align:center';
        document.body.appendChild(el);
      }
      el.textContent = t;
    }, texto)
    .catch(() => {});
  await page.waitForTimeout(PAUSA);
}

function crearInforme(rol) {
  const pasos = [];
  const paso = async (page, texto, accion) => {
    await subtitulo(page, texto);
    try {
      await accion();
      pasos.push({ paso: texto, ok: true });
    } catch (e) {
      const motivo = String(e.message).split('\n')[0];
      pasos.push({ paso: texto, ok: false, error: motivo });
      console.log(`  ✗ ${texto}: ${motivo}`);
      await page.screenshot({ path: path.join(DIR_VIDEOS, `fallo-${rol}-${pasos.length}.png`) }).catch(() => {});
      return;
    }
    console.log(`  ✓ ${texto}`);
    await page.waitForTimeout(500);
  };
  const guardar = () => {
    fs.mkdirSync(DIR_VIDEOS, { recursive: true });
    fs.writeFileSync(
      path.join(DIR_VIDEOS, `informe-${rol}.json`),
      JSON.stringify({ rol, fecha: new Date().toISOString(), pasos }, null, 2)
    );
    const fallos = pasos.filter((p) => !p.ok).length;
    console.log(`  → ${pasos.length - fallos}/${pasos.length} pasos correctos`);
    return fallos;
  };
  return { paso, guardar };
}

async function entrar(page, cuenta) {
  await page.goto(`${URL_APP}/login`);
  await page.getByPlaceholder('nombre@umariana.edu.co').fill(cuenta.email);
  await page.getByPlaceholder('••••••••').fill(cuenta.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/equipos/, { timeout: 15000 });
}

async function aceptarConsentimientoSiAparece(page) {
  const aceptar = page.getByRole('button', { name: /acepto|aceptar/i });
  if (await aceptar.first().isVisible({ timeout: 2500 }).catch(() => false)) await aceptar.first().click();
}

const irA = (page, ruta) => page.goto(`${URL_APP}${ruta}`, { waitUntil: 'networkidle' });
const salir = (page) => page.getByRole('button', { name: 'Salir' }).click();

// ─────────────────────────── Administrador ───────────────────────────
async function recorridoAdmin(page) {
  const { paso, guardar } = crearInforme('admin');
  console.log('Rol ADMINISTRADOR ⭐');
  let referenciaDemo = '';
  await paso(page, '⭐ Administrador: inicia sesión con su correo institucional', () => entrar(page, CUENTAS.admin));
  await paso(page, 'Dashboard: indicadores generales del mantenimiento', async () => {
    await aceptarConsentimientoSiAparece(page);
    await irA(page, '/dashboard');
  });
  await paso(page, 'Equipos: inventario de activos de la planta', () => irA(page, '/equipos'));
  await paso(page, 'Detalle de un equipo: ficha, mantenimientos e historial', async () => {
    await page.locator('tbody tr').first().click();
    await page.waitForLoadState('networkidle');
  });
  await paso(page, 'Mantenimiento: cronograma mensual con todas las ocurrencias', () => irA(page, '/mantenimiento'));
  await paso(page, 'Programa un nuevo mantenimiento sobre un equipo', async () => {
    await page.getByRole('button', { name: /Nuevo mantenimiento/ }).click();
    await page.locator('#nm-equipo').selectOption({ index: 1 });
    referenciaDemo = (await page.locator('#nm-equipo option:checked').innerText()).split(' · ')[0].trim();
    await page.locator('#nm-tarea').selectOption({ index: 1 });
    await page.locator('#nm-fecha').fill(hoy());
    await page.locator('#nm-notas').fill('Demo: mantenimiento creado durante el recorrido grabado');
    await page.getByRole('button', { name: 'Programar' }).click();
    await page.waitForLoadState('networkidle');
  });
  await paso(page, 'Abre el mantenimiento: los técnicos salen ordenados por menor esfuerzo (★ Recomendado)', async () => {
    // El cronograma es un calendario: se abren las ocurrencias del equipo hasta dar con la recién creada (por su nota).
    const fichas = page.locator('tbody tr').filter({ hasText: referenciaDemo }).filter({ hasText: 'Sin asignar' });
    const total = Math.min(await fichas.count(), 40);
    for (let i = 0; i < total; i++) {
      await fichas.nth(i).click();
      if (await page.getByText('Demo: mantenimiento creado').first().isVisible({ timeout: 1200 }).catch(() => false)) return;
      await page.getByRole('button', { name: 'Cerrar' }).click();
    }
    throw new Error('no se encontró la ocurrencia recién creada');
  });
  await paso(page, '🔩 Asigna al técnico recomendado (el de menos carga de trabajo)', async () => {
    const selector = page.locator('select').filter({ hasText: 'Selecciona un técnico' });
    await selector.selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Asignar', exact: true }).click();
    await page.waitForLoadState('networkidle');
  });
  await paso(page, 'Órdenes de trabajo: seguimiento de todas las OT', () => irA(page, '/ordenes-trabajo'));
  await paso(page, 'El sistema genera las OT de la semana automáticamente', async () => {
    await page.getByRole('button', { name: /Generar órdenes de la semana/ }).click();
    await page.waitForLoadState('networkidle');
  });
  await paso(page, 'Alertas: preventivas (15, 8 y 1 día) y vencidas', () => irA(page, '/alertas'));
  await paso(page, 'Reportes (solo administrador): costos por trimestre', () => irA(page, '/reportes'));
  for (const [pestana, texto] of [
    ['Horas por equipo', 'Reportes: horas de intervención por equipo'],
    ['Áreas', 'Reportes: participación y tipo de intervención por área'],
    ['Recursos', 'Reportes: gasto en insumos y horas-hombre por técnico'],
  ]) {
    await paso(page, texto, async () => {
      await page.getByRole('button', { name: pestana }).or(page.getByRole('tab', { name: pestana })).or(page.getByText(pestana, { exact: true })).first().click();
      await page.waitForLoadState('networkidle');
      await page.locator('main').evaluate((m) => m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' }));
    });
  }
  await paso(page, 'Cierra sesión', () => salir(page));
  return guardar();
}

// ───────────────────────────── Técnico ─────────────────────────────
async function recorridoTecnico(page) {
  const { paso, guardar } = crearInforme('tecnico');
  console.log('Rol TECNICO 🔩');
  await paso(page, '🔩 Técnico: inicia sesión con su cuenta', () => entrar(page, CUENTAS.tecnico));
  await paso(page, 'Acepta el aviso de tratamiento de datos (Ley 1581)', () => aceptarConsentimientoSiAparece(page));
  await paso(page, 'Dashboard del técnico: su trabajo de hoy', () => irA(page, '/dashboard'));
  await paso(page, 'Mis Tareas: solo lo que el administrador le asignó', () => irA(page, '/mantenimiento'));
  await paso(page, 'Abre la hoja de ejecución de su tarea', async () => {
    await page.getByRole('button', { name: /Ejecutar|Iniciar|Continuar|Registrar/ }).first().click();
  });
  await paso(page, 'Inicia el mantenimiento (queda registrada la hora)', async () => {
    const iniciar = page.getByRole('button', { name: /Iniciar mantenimiento/ });
    if (await iniciar.isVisible({ timeout: 3000 }).catch(() => false)) await iniciar.click();
    await page.getByText('Hora de inicio').first().waitFor();
  });
  await paso(page, 'Registra tiempos, valor hora, observaciones y firma de conformidad', async () => {
    const [inicio, fin] = await page.locator('input[type="datetime-local"]').all();
    await inicio.fill(localISO(-90));
    await fin.fill(localISO(-5));
    await page.getByPlaceholder('$ / hora').fill('25000');
    await page.locator('textarea').first().fill('Demo: revisión completa, equipo operando normal.');
    const firma = page.getByRole('checkbox').first();
    if (await firma.isVisible().catch(() => false)) await firma.check();
    await page.getByRole('button', { name: 'Guardar datos' }).click();
    await page.waitForLoadState('networkidle');
  });
  await paso(page, 'Finaliza el mantenimiento: los costos quedan congelados', async () => {
    await page.getByRole('button', { name: /Finalizar mantenimiento/ }).click();
    await page.waitForLoadState('networkidle');
  });
  await paso(page, 'Órdenes de trabajo asignadas al técnico', () => irA(page, '/ordenes-trabajo'));
  await paso(page, 'Alertas de sus mantenimientos próximos', () => irA(page, '/alertas'));
  await paso(page, 'Cierra sesión', () => salir(page));
  return guardar();
}

async function grabar(rol, recorrido, navegador) {
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 810 },
    recordVideo: GRABAR ? { dir: DIR_VIDEOS, size: { width: 1440, height: 810 } } : undefined,
  });
  const page = await contexto.newPage();
  const fallos = await recorrido(page).catch((e) => {
    console.log('  ✗ recorrido interrumpido:', e.message);
    return 1;
  });
  const video = GRABAR ? page.video() : null;
  await contexto.close(); // cierra y escribe el video
  if (video) {
    const destino = path.join(DIR_VIDEOS, `${rol}.webm`);
    await video.saveAs(destino).catch(() => {});
    await video.delete().catch(() => {});
    console.log(`  🎬 ${destino}`);
  }
  return fallos;
}

(async () => {
  const quien = process.argv[2] || 'todo';
  const roles = { admin: recorridoAdmin, tecnico: recorridoTecnico };
  const lista = quien === 'todo' ? ['admin', 'tecnico'] : [quien];
  if (lista.some((r) => !roles[r])) {
    console.error('Uso: node recorrido.js [admin|tecnico|todo]');
    process.exit(2);
  }
  fs.mkdirSync(DIR_VIDEOS, { recursive: true });
  const navegador = await chromium.launch({
    channel: process.env.NAVEGADOR || 'chrome',
    headless: process.env.SIN_VENTANA === '1',
    slowMo: 120,
  });
  let fallos = 0;
  for (const rol of lista) fallos += await grabar(rol, roles[rol], navegador);
  await navegador.close();
  process.exit(fallos ? 1 : 0);
})();
