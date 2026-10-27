// ============================================================
// Api.gs (v2) — REEMPLAZÁ todo el contenido del archivo Api.gs por este.
// La clave de acceso ya quedó guardada en el servidor: no hace falta volver a cargarla.
// ============================================================

// Funciones que tardan (usan Gemini): corren en segundo plano y la app consulta el avance.
const LARGAS = ['generarResumen', 'generarResumenUnidad', 'prepararFinal', 'generarFlashcardsDesdeSintesis', 'generarRepaso', 'generarFlashcards', 'generarFlashcardsDesdeGuia', 'generarRepasoDesdeTexto', 'generarExamen', 'generarExamenPorUnidades', 'generarExamenDiagnostico', 'compararTextos', 'resumirApuntesClase'];

function _api() {
  return {
    getEstructuraCarrera: getEstructuraCarrera,
    getPlanEstudios: getPlanEstudios,
    getLecturas: getLecturas,
    toggleLecturaLeida: toggleLecturaLeida,
    getLecturasLeidas: getLecturasLeidas,
    agendarLecturas: agendarLecturas,
    getContenidoMateria: getContenidoMateria,
    generarResumen: generarResumen,
    generarResumenUnidad: generarResumenUnidad,
    getSintesis: getSintesis,
    eliminarSintesis: eliminarSintesis,
    prepararFinal: prepararFinal,
    generarFlashcardsDesdeSintesis: generarFlashcardsDesdeSintesis,
    generarRepaso: generarRepaso,
    generarFlashcards: generarFlashcards,
    generarFlashcardsDesdeGuia: generarFlashcardsDesdeGuia,
    generarRepasoDesdeTexto: generarRepasoDesdeTexto,
    generarExamen: generarExamen,
    generarExamenPorUnidades: generarExamenPorUnidades,
    generarExamenDiagnostico: generarExamenDiagnostico,
    compararTextos: compararTextos,
    resumirApuntesClase: resumirApuntesClase,
    validarRespuestaAbierta: validarRespuestaAbierta,
    generarPreguntaSocratica: generarPreguntaSocratica,
    consultarAsistente: consultarAsistente,
    interpretarComandoCalendario: interpretarComandoCalendario,
    getContextoPrograma: getContextoPrograma,
    guardarAnotacion: guardarAnotacion,
    getAnotaciones: getAnotaciones,
    eliminarAnotacion: eliminarAnotacion,
    guardarResumen: guardarResumen,
    getResumenes: getResumenes,
    guardarEventoCalendario: guardarEventoCalendario,
    getEventos: getEventos,
    eliminarEvento: eliminarEvento,
    guardarRatingSM2: guardarRatingSM2,
    guardarFlashcardsSM2: guardarFlashcardsSM2,
    generarPDFResumen: generarPDFResumen,
    iniciarTarea: iniciarTarea,
    estadoTarea: estadoTarea,
    diagnosticoDatos: diagnosticoDatos
  };
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const clave = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!clave || req.token !== clave) return _json({ ok: false, error: 'No autorizado' });
    const fn = _api()[req.fn];
    if (!fn) return _json({ ok: false, error: 'Función no permitida: ' + req.fn });
    return _json({ ok: true, result: fn.apply(null, req.args || []) });
  } catch (err) {
    return _json({ ok: false, error: err.message });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── TAREAS EN SEGUNDO PLANO ──────────────────────────────────
// La app pide "iniciarTarea", recibe un número al instante y después pregunta
// cada pocos segundos con "estadoTarea". Así no hay una conexión abierta minutos.

function iniciarTarea(fn, args) {
  if (LARGAS.indexOf(fn) === -1) throw new Error('Tarea no permitida: ' + fn);
  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  CacheService.getScriptCache().put('job_' + id, JSON.stringify({ estado: 'pendiente', fn: fn, args: args || [] }), 21600);
  _encolar(id);
  ScriptApp.newTrigger('ejecutarTareas').timeBased().after(1000).create();
  return { id: id };
}

function estadoTarea(id) {
  const raw = CacheService.getScriptCache().get('job_' + id);
  if (!raw) return { estado: 'perdida' };
  const j = JSON.parse(raw);
  return { estado: j.estado, result: j.result, error: j.error };
}

function ejecutarTareas(e) {
  _borrarTrigger(e);
  const cache = CacheService.getScriptCache();
  let id;
  while ((id = _sacar())) {
    const raw = cache.get('job_' + id);
    if (!raw) continue;
    const job = JSON.parse(raw);
    job.estado = 'corriendo';
    cache.put('job_' + id, JSON.stringify(job), 21600);
    try {
      job.result = _api()[job.fn].apply(null, job.args || []);
      job.estado = 'listo';
    } catch (err) {
      job.estado = 'error';
      job.error = err.message;
    }
    delete job.args;
    try { cache.put('job_' + id, JSON.stringify(job), 21600); }
    catch (err2) { cache.put('job_' + id, JSON.stringify({ estado: 'error', error: 'El resultado es demasiado grande.' }), 21600); }
  }
}

function _borrarTrigger(e) {
  try {
    const uid = e && e.triggerUid;
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'ejecutarTareas' && (!uid || t.getUniqueId() === uid)) ScriptApp.deleteTrigger(t);
    });
  } catch (err) {}
}

function _encolar(id) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const p = PropertiesService.getScriptProperties();
    const q = JSON.parse(p.getProperty('cola') || '[]'); q.push(id);
    p.setProperty('cola', JSON.stringify(q));
  } finally { lock.releaseLock(); }
}

function _sacar() {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const p = PropertiesService.getScriptProperties();
    const q = JSON.parse(p.getProperty('cola') || '[]');
    const id = q.shift();
    p.setProperty('cola', JSON.stringify(q));
    return id;
  } finally { lock.releaseLock(); }
}

// ── CACHÉS (hacen que todo sea mucho más rápido) ─────────────
// Antes de pegar esto, en Código.gs hay que renombrar 3 funciones (ver instrucciones).

// 1) Texto de un PDF: se convierte una vez y se reutiliza 6 horas.
function leerPDF(fileId, limite) {
  const cache = CacheService.getScriptCache();
  const k = 'pdf_' + fileId + '_' + (limite || 15000);
  const hit = cache.get(k);
  if (hit) return { ok: true, texto: hit };
  const r = _leerPDFraw(fileId, limite);
  if (r.ok && r.texto) { try { cache.put(k, r.texto, 21600); } catch (e) {} }
  return r;
}

// 2) Estructura de carpetas de una materia: 10 minutos.
function getContenidoMateria(materiaId) {
  const cache = CacheService.getScriptCache();
  const k = 'cm_' + materiaId;
  const hit = cache.get(k);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const r = _getContenidoMateriaRaw(materiaId);
  if (r && r.ok) { try { cache.put(k, JSON.stringify(r), 600); } catch (e) {} }
  return r;
}

// 3) Contexto del programa: antes costaba una llamada extra a Gemini en CADA resumen.
//    Ahora se calcula una vez por materia y queda guardado.
function obtenerContextoPrograma(materiaId) {
  const p = PropertiesService.getScriptProperties();
  const k = 'ctx_' + materiaId;
  const hit = p.getProperty(k);
  if (hit) return hit;
  const r = _obtenerContextoProgramaRaw(materiaId);
  if (r) p.setProperty(k, r);
  return r;
}

// Si cambiás el PDF del programa de una materia, ejecutá esto a mano.
function limpiarContextoPrograma() {
  const p = PropertiesService.getScriptProperties();
  p.getKeys().filter(function (k) { return k.indexOf('ctx_') === 0; }).forEach(function (k) { p.deleteProperty(k); });
}

// ── DIAGNÓSTICO ──────────────────────────────────────────────
// Ejecutalo a mano: mira "Registro de ejecución" y mostrame lo que dice.
function diagnosticoDatos() {
  const cuenta = function (keys, pref) { return keys.filter(function (k) { return k.indexOf(pref) === 0; }).length; };
  const resumen = function (keys) {
    return { total: keys.length, resumenes: cuenta(keys, 'res_'), sintesis: cuenta(keys, 'sint_'),
             anotaciones: cuenta(keys, 'anot_'), tarjetas: cuenta(keys, 'sm2_'), eventos: cuenta(keys, 'cal_ev') };
  };
  let cuenta_email = '';
  try { cuenta_email = Session.getEffectiveUser().getEmail(); } catch (e) { cuenta_email = '(sin permiso)'; }
  const r = {
    cuenta: cuenta_email,
    propiedadesDeUsuario: resumen(PropertiesService.getUserProperties().getKeys()),
    propiedadesDelScript: resumen(PropertiesService.getScriptProperties().getKeys()),
    triggersActivos: ScriptApp.getProjectTriggers().length
  };
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
