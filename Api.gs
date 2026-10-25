// ============================================================
// Api.gs — archivo NUEVO. Pegalo como un archivo aparte en tu proyecto
// de Apps Script. No toca nada de Code.gs.
// ============================================================

// Ejecutar UNA vez a mano (con tu clave) y después borrar el valor de acá.
function configurarClave() {
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', 'ESCRIBI-ACA-UNA-CLAVE-LARGA');
}

const API = {
  getEstructuraCarrera,
  getPlanEstudios,
  getLecturas,
  toggleLecturaLeida,
  getLecturasLeidas,
  agendarLecturas,
  getContenidoMateria,
  generarResumen,
  generarResumenUnidad,
  getSintesis,
  eliminarSintesis,
  prepararFinal,
  generarFlashcardsDesdeSintesis,
  generarRepaso,
  generarFlashcards,
  generarFlashcardsDesdeGuia,
  generarRepasoDesdeTexto,
  generarExamen,
  generarExamenPorUnidades,
  generarExamenDiagnostico,
  compararTextos,
  resumirApuntesClase,
  validarRespuestaAbierta,
  generarPreguntaSocratica,
  consultarAsistente,
  interpretarComandoCalendario,
  getContextoPrograma,
  guardarAnotacion,
  getAnotaciones,
  eliminarAnotacion,
  guardarResumen,
  getResumenes,
  guardarEventoCalendario,
  getEventos,
  eliminarEvento,
  guardarRatingSM2,
  guardarFlashcardsSM2,
  generarPDFResumen
};

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const clave = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!clave || req.token !== clave) return _json({ ok: false, error: 'No autorizado' });
    const fn = API[req.fn];
    if (!fn) return _json({ ok: false, error: 'Función no permitida: ' + req.fn });
    return _json({ ok: true, result: fn.apply(null, req.args || []) });
  } catch (err) {
    return _json({ ok: false, error: err.message });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
