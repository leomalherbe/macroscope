/* Local mock of the Apps Script backend: same service logic, in-memory storage.
   Usage: node dev/mock-server.js [port]   → serves ../macsim as static files and the API at /api */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const MS = require('../macsim/core.js');
global.MS = MS;
const MSService = require('./service.js');

const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const ROOT = path.join(__dirname, '..', 'macsim');

function memoryStorage() {
  const config = {};
  let groups = [];
  const tables = { decisions: [], results: [], pledges: [], comments: [], log: [] };
  let clock = null;
  return {
    now: () => clock ? new Date(clock) : new Date(),
    setClock: (iso) => { clock = iso; },
    getConfig: (k) => (k in config ? config[k] : null),
    setConfig: (k, v) => { config[k] = String(v); },
    listGroups: () => groups.map(g => Object.assign({}, g)),
    replaceGroups: (classId, list) => { groups = groups.filter(g => g.classId !== classId).concat(list.map(g => Object.assign({}, g))); },
    appendRow: (t, o) => { tables[t].push(JSON.parse(JSON.stringify(o))); },
    readRows: (t) => tables[t].map(r => Object.assign({}, r)),
    deleteConfig: (k) => { delete config[k]; },
    deleteRows: (t, pred) => { const before = tables[t].length; tables[t] = tables[t].filter(r => !pred(r)); return before - tables[t].length; },
    dump: () => ({ config, groups, tables }),
    reset: () => { Object.keys(config).forEach(k => delete config[k]); groups = []; Object.keys(tables).forEach(k => { tables[k] = []; }); clock = null; }
  };
}
const storage = memoryStorage();
function seed() {
  storage.reset();
  storage.setConfig('adminKey', 'TESTKEY');
  storage.setConfig('classes', '[]');
}
seed();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function runApi(params) {
  const p = Object.assign({}, params);
  ['payload', 'patch', 'rows', 'groups'].forEach(k => { if (typeof p[k] === 'string') { try { p[k] = JSON.parse(p[k]); } catch (e) { /* keep */ } } });
  if (p.action === '__reset') { seed(); return { ok: true }; }
  if (p.action === '__clock') { storage.setClock(p.iso || null); return { ok: true }; }
  if (p.action === '__dump') { return { ok: true, dump: storage.dump() }; }
  return MSService.handle(p.action, p, storage);
}

http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  if (u.pathname === '/api') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        let params = {};
        try { params = JSON.parse(body); } catch (e) { params = u.query; }
        send(res, 200, JSON.stringify(runApi(params)));
      });
      return;
    }
    let params = Object.assign({}, u.query);
    if (params.q) { try { params = Object.assign({}, params, JSON.parse(params.q)); } catch (e) { /* ignore */ } }
    const cb = params.callback; delete params.callback;
    const out = JSON.stringify(runApi(params));
    if (cb) return send(res, 200, cb + '(' + out + ');', 'text/javascript; charset=utf-8');
    return send(res, 200, out);
  }
  let file = u.pathname === '/' ? '/index.html' : u.pathname;
  if (file === '/engine.js' && !fs.existsSync(path.join(ROOT, 'engine.js'))) {
    /* real engine not written yet: serve the stub (dev/engine-stub.js) */
    return fs.readFile(path.join(__dirname, 'engine-stub.js'), (err, data) => err ? send(res, 404, 'not found', 'text/plain') : send(res, 200, data, MIME['.js']));
  }
  if (file.startsWith('/vendor/')) {
    const vroot = path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build');
    file = path.normalize(path.join(vroot, file.slice('/vendor/'.length)));
    if (!file.startsWith(vroot)) return send(res, 403, 'forbidden', 'text/plain');
  } else {
    file = path.normalize(path.join(ROOT, file));
    if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
  }
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}).listen(PORT, () => console.log('mock backend + static files on http://localhost:' + PORT + '  (API: /api, admin key: TESTKEY)'));
