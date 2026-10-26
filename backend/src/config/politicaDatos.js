// Aviso de tratamiento de datos personales (Ley 1581 de 2012, Habeas Data).
//
// La firma de conformidad y las fotografías de evidencia de una ejecución son
// datos personales, y podrían tratarse como sensibles (arts. 5 y 6). Por eso,
// antes de registrar una ejecución, cada usuario acepta este aviso y la
// aceptación queda guardada con la versión que leyó.
//
// REGLA: si el contenido de fondo cambia (finalidad, plazo de conservación,
// responsable, derechos), hay que subir `VERSION_POLITICA`. Todos vuelven a ver
// el aviso y a aceptarlo; cambiar solo la ortografía no lo exige.
//
// BORRADOR: el texto lo redactó el equipo de desarrollo y NO lo ha validado un
// asesor jurídico de THI S.A.S. Lo que está entre corchetes falta por definir.
// Cuando el área jurídica lo apruebe, se pone BORRADOR_PENDIENTE_VALIDACION en
// false (y se sube la versión si el texto cambió).

// HISTORIAL
//   2026-09-v1 — aviso inicial (registro de ejecuciones).
//   2026-10-v2 — Fase 3: copia de respaldo en Google Drive. Informa la transmisión
//     al encargado (Google LLC), que puede ser internacional (Ley 1581, art. 26;
//     Decreto 1074 de 2015, arts. 2.2.2.25.5.1 y 2.2.2.25.5.2), los nombres en las
//     órdenes de trabajo, y que la conservación y los derechos cubren esa copia.
//     Retira la frase "ni se entregan a terceros", que dejó de ser cierta.

const VERSION_POLITICA = '2026-10-v2';
const BORRADOR_PENDIENTE_VALIDACION = true;

const TITULO = 'Aviso de tratamiento de datos personales: registro de ejecuciones de mantenimiento';

const PARRAFOS = [
  'Responsable. THI S.A.S. es la responsable del tratamiento de los datos personales que se registran en este sistema de gestión del mantenimiento (CMMS).',
  'Datos que se tratan. Al registrar una ejecución se guardan tu nombre y usuario, la fecha y hora de tus actuaciones, tu firma de conformidad y las fotografías de evidencia (antes y después) que cargues. Las fotografías pueden mostrar personas, instalaciones o documentos. Tu nombre también figura en las órdenes de trabajo (OT) que se te asignan o que emites.',
  'Finalidad. Estos datos se usan exclusivamente para la auditoría, la trazabilidad y el control de los mantenimientos. No se usan para otra finalidad ni se comunican a terceros, salvo al encargado del respaldo que se indica en el párrafo siguiente o por requerimiento de una autoridad competente.',
  'Respaldo en Google Drive. Para que la evidencia no se pierda, el sistema guarda una copia de las fotografías de evidencia, de una constancia de tu firma (nombre, fecha y hora) y de las órdenes de trabajo en PDF en una carpeta de Google Drive de una cuenta administrada por THI S.A.S. Google LLC actúa como encargado del tratamiento: solo almacena esa copia por cuenta de THI S.A.S. y no la usa para fines propios. Sus servidores pueden estar fuera de Colombia (por ejemplo, en Estados Unidos), por lo que se trata de una transmisión internacional de datos (Ley 1581 de 2012, art. 26, y Decreto 1074 de 2015) [condiciones del contrato de transmisión con el proveedor por validar con el área jurídica de THI S.A.S.].',
  'Acceso. En este sistema, solo pueden ver las fotografías y la firma los usuarios autenticados con permiso sobre esa ejecución. Cada consulta de las fotografías en el sistema, y cada intento de verlas sin permiso, queda registrado en la bitácora de auditoría. A la copia en Google Drive solo accede el personal que THI S.A.S. designe; esas consultas las registra Google y no quedan en esta bitácora.',
  'Conservación. Los registros se conservan durante la vida útil del equipo y, como mínimo, diez (10) años, por su valor como evidencia del mantenimiento realizado [plazo por validar con el área jurídica de THI S.A.S.]. La copia en Google Drive se conserva por el mismo plazo.',
  'Tus derechos. Como titular puedes conocer, actualizar y rectificar tus datos, solicitar su supresión y revocar esta autorización, salvo cuando exista un deber legal o contractual de conservarlos (Ley 1581 de 2012, art. 8). Lo que se resuelva sobre tu solicitud se aplica también a la copia en Google Drive. Para ejercerlos escribe a [correo del responsable de datos personales de THI S.A.S.: por definir].',
  'Autorización facultativa. No estás obligado a autorizar el tratamiento de datos sensibles. Sin tu autorización no podrás registrar ejecuciones en este sistema, porque la firma y la evidencia forman parte del registro, y las órdenes de trabajo en las que figuras no se copian a Google Drive.',
  'Constancia. Al aceptar, el sistema guarda la fecha, la hora y la versión de este aviso como prueba de tu autorización. Ese registro no se puede modificar ni borrar.',
];

/** Aviso vigente. Devuelve una copia nueva: quien la modifique no altera el aviso. */
function avisoPolitica() {
  return {
    version: VERSION_POLITICA,
    titulo: TITULO,
    parrafos: [...PARRAFOS],
    borrador: BORRADOR_PENDIENTE_VALIDACION,
  };
}

module.exports = { VERSION_POLITICA, BORRADOR_PENDIENTE_VALIDACION, avisoPolitica };
