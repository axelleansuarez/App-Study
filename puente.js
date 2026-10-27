/* Puente Apps Script -> fetch (v2)
   Reemplaza google.script.run cuando la página corre fuera de Apps Script. */
(function () {
  if (window.google && google.script && google.script.run) return;

  var API_URL = 'https://script.google.com/macros/s/AKfycbwugEy43Ne1qJlTKO6btZbujj2BubDOPw3Js_PjFfcCLZUQ9Gnok7BzacdiMd5V4yFdeA/exec';
  var LARGAS = { generarResumen: 1, generarResumenUnidad: 1, prepararFinal: 1, generarFlashcardsDesdeSintesis: 1, generarRepaso: 1, generarFlashcards: 1, generarFlashcardsDesdeGuia: 1, generarRepasoDesdeTexto: 1, generarExamen: 1, generarExamenPorUnidades: 1, generarExamenDiagnostico: 1, compararTextos: 1, resumirApuntesClase: 1 };
  var LECTURA = /^get/;                 // lecturas: se pueden reintentar sin riesgo
  var MAX_ESPERA = 10 * 60 * 1000;      // 10 min como máximo para una tarea larga

  function token() {
    var t = localStorage.getItem('api_token');
    if (!t) { t = prompt('Clave de acceso:'); if (t) localStorage.setItem('api_token', t.trim()); }
    return t || '';
  }
  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function call(fn, args, timeoutMs) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 90000);
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita preflight CORS
      body: JSON.stringify({ fn: fn, args: args, token: token() }),
      signal: ctrl.signal
    })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j.ok) {
        if (j.error === 'No autorizado') localStorage.removeItem('api_token');
        throw new Error(j.error || 'Error de servidor');
      }
      return j.result;
    })
    .catch(function (e) {
      if (e && e.name === 'AbortError') throw new Error('El servidor tardó demasiado en responder. Probá de nuevo.');
      throw e;
    })
    .then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
  }

  // Reintenta solo si la conexión se cayó (TypeError = "Failed to fetch")
  function conReintento(fn, args, n, timeoutMs) {
    return call(fn, args, timeoutMs).catch(function (e) {
      if (n > 0 && e instanceof TypeError) return esperar(1500).then(function () { return conReintento(fn, args, n - 1, timeoutMs); });
      throw e;
    });
  }

  function esperarTarea(id, t0, fallos) {
    return esperar(fallos ? 3000 : 2500)
      .then(function () { return call('estadoTarea', [id], 30000); })
      .then(function (r) {
        if (r.estado === 'listo') return r.result;
        if (r.estado === 'error') throw new Error(r.error || 'Error en la tarea');
        if (r.estado === 'perdida') throw new Error('La tarea se perdió en el servidor. Intentá de nuevo.');
        var t = Date.now() - t0;
        if (r.estado === 'pendiente' && t > 150000) throw new Error('El servidor no inició la tarea (faltan permisos de Apps Script).');
        if (t > MAX_ESPERA) throw new Error('La tarea tardó más de 10 minutos.');
        return esperarTarea(id, t0, 0);
      }, function (e) {
        if (e instanceof TypeError && fallos < 5 && Date.now() - t0 < MAX_ESPERA) return esperarTarea(id, t0, fallos + 1);
        throw e;
      });
  }

  function ejecutar(fn, args) {
    if (LARGAS[fn]) {
      return conReintento('iniciarTarea', [fn, args], 2, 30000)
        .then(function (r) { return esperarTarea(r.id, Date.now(), 0); });
    }
    return LECTURA.test(fn) ? conReintento(fn, args, 2) : call(fn, args);
  }

  function makeRunner(ok, fail) {
    return new Proxy({}, { get: function (_, name) {
      if (name === 'withSuccessHandler') return function (f) { return makeRunner(f, fail); };
      if (name === 'withFailureHandler') return function (f) { return makeRunner(ok, f); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        ejecutar(name, args)
          .then(function (r) { if (ok) ok(r); })
          .catch(function (e) { if (fail) fail(e); else console.error(name, e); });
      };
    } });
  }

  window.google = { script: { run: makeRunner(null, null) } };
})();