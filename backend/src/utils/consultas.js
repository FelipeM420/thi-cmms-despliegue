const { z } = require('zod');

// Validación de parámetros de query string.
//
// Los filtros llegan como texto y pueden venir vacíos. Sin validar, un valor
// de enum o una fecha inválidos llegan hasta Prisma y revientan con un 500
// opaco ("Error interno"). Con estos ayudantes se responde 400 explicando qué
// parámetro está mal.

const vacioAUndefined = (v) => (v === '' || v === null || v === undefined ? undefined : v);

const textoOpc = z.preprocess(vacioAUndefined, z.string().optional());

const fechaOpc = (etiqueta) =>
  z.preprocess(
    vacioAUndefined,
    z.coerce
      .date({ errorMap: () => ({ message: `El parámetro "${etiqueta}" no es una fecha válida.` }) })
      .optional()
  );

const enumOpc = (valores, etiqueta) =>
  z.preprocess(
    vacioAUndefined,
    z
      .enum(valores, {
        errorMap: () => ({
          message: `El parámetro "${etiqueta}" debe ser uno de: ${valores.join(', ')}.`,
        }),
      })
      .optional()
  );

const booleanoOpc = (etiqueta) =>
  z.preprocess(
    vacioAUndefined,
    z
      .enum(['true', 'false'], {
        errorMap: () => ({ message: `El parámetro "${etiqueta}" debe ser true o false.` }),
      })
      .optional()
  );

module.exports = { vacioAUndefined, textoOpc, fechaOpc, enumOpc, booleanoOpc };
