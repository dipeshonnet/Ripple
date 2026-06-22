const fs = require('fs');
const http = require('http');
const path = require('path');
const { createApi } = require('./app');

const port = Number(process.env.PORT || 5174);
const host = process.env.HOST || '127.0.0.1';
const rootDir = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const api = createApi({
  persist: process.env.ARENA_API_PERSIST !== '0',
  storeFile: process.env.ARENA_API_STORE_FILE,
});

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/')) {
    return api.handler(req, res);
  }
  return serveStatic(req, res, parsed.pathname);
});

function serveStatic(req, res, requestPath) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    return res.end('Method not allowed');
  }

  const filePath = resolveStaticPath(requestPath);
  if (!filePath) {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    return res.end('Not found');
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      res.statusCode = error.code === 'ENOENT' ? 404 : 500;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      return res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
    }

    res.statusCode = 200;
    res.setHeader('content-type', MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.setHeader('cache-control', 'no-store');
    return req.method === 'HEAD' ? res.end() : res.end(buffer);
  });
}

function resolveStaticPath(requestPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath || '/');
  } catch (error) {
    return null;
  }

  const normalized = path.posix.normalize(`/${decodedPath.replace(/\\/g, '/')}`);
  if (normalized.includes('\0')) return null;

  if (normalized === '/admin' || normalized === '/admin/') {
    return path.join(rootDir, 'admin', 'index.html');
  }

  const directFile = safeResolve(normalized);
  if (directFile && isFile(directFile)) return directFile;

  const directIndex = safeResolve(path.posix.join(normalized, 'index.html'));
  if (directIndex && isFile(directIndex)) return directIndex;

  if (normalized.startsWith('/admin/') && !path.posix.extname(normalized)) {
    return path.join(rootDir, 'admin', 'index.html');
  }

  if (!path.posix.extname(normalized)) {
    return path.join(rootDir, 'index.html');
  }

  return null;
}

function safeResolve(urlPath) {
  const resolved = path.resolve(rootDir, `.${urlPath}`);
  return resolved === rootDir || resolved.startsWith(`${rootDir}${path.sep}`) ? resolved : null;
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
}

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Performance Arena listening at http://${host}:${port}`);
  console.log(`Admin Control Centre: http://${host}:${port}/admin`);
});
