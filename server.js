/**
 * server.js — ClearLabel AI Production Server
 *
 * Serves the Vite-built static frontend and securely proxies
 * ingredient analysis requests to the Gemini API.
 *
 * Security: path traversal protection, body size limit,
 * security headers, CORS policy, graceful shutdown, health endpoint.
 */

import http from 'http';
import fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '8080', 10);
const DIST_DIR = path.join(__dirname, 'dist');
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const API_KEY = process.env.GEMINI_API_KEY;
const MAX_BODY_BYTES = 64 * 1024; // 64 KB limit
const UPSTREAM_TIMEOUT_MS = 30_000; // 30s timeout on Gemini

// ─── MIME Types ───────────────────────────────────────────────────────────────

const MIME_TYPES = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js',   'text/javascript; charset=utf-8'],
    ['.css',  'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png',  'image/png'],
    ['.jpg',  'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.gif',  'image/gif'],
    ['.svg',  'image/svg+xml'],
    ['.ico',  'image/x-icon'],
    ['.webp', 'image/webp'],
    ['.woff', 'font/woff'],
    ['.woff2','font/woff2'],
    ['.ttf',  'font/ttf'],
    ['.wasm', 'application/wasm'],
]);

// ─── Security Headers ─────────────────────────────────────────────────────────

const SECURITY_HEADERS = {
    'X-Content-Type-Options':  'nosniff',
    'X-Frame-Options':         'DENY',
    'Referrer-Policy':         'strict-origin-when-cross-origin',
    'Permissions-Policy':      'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",        // Vite inlines some scripts
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https://ui-avatars.com",
        "connect-src 'self'",
    ].join('; '),
};

// Cache-Control for static assets (1 year for fingerprinted assets, no-cache for HTML)
function cacheControlFor(ext) {
    if (ext === '.html') return 'no-cache, no-store, must-revalidate';
    if (['.js', '.css', '.woff', '.woff2', '.webp', '.png'].includes(ext)) {
        return 'public, max-age=31536000, immutable';
    }
    return 'public, max-age=3600';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sends a JSON response. */
function sendJson(res, status, payload, extraHeaders = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        ...SECURITY_HEADERS,
        ...extraHeaders,
    });
    res.end(body);
}

/** Reads the incoming request body with a byte limit. */
function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];

        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                req.destroy();
                return reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
            }
            chunks.push(chunk);
        });

        req.on('end',   () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
    });
}

/** Validates that a resolved file path stays within the dist directory. */
function safeResolvePath(requestUrl) {
    // Strip query strings and decode URI
    const parsed = new URL(requestUrl, 'http://localhost');
    const relative = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
    const resolved = path.resolve(DIST_DIR, '.' + relative);

    // Prevent path traversal
    if (!resolved.startsWith(DIST_DIR + path.sep) && resolved !== DIST_DIR) {
        return null;
    }
    return resolved;
}

// ─── Request Handlers ─────────────────────────────────────────────────────────

/** GET /healthz — Cloud Run liveness check */
function handleHealth(res) {
    sendJson(res, 200, { status: 'ok', uptime: Math.floor(process.uptime()) });
}

/** POST /api/analyze — Secure Gemini proxy */
async function handleAnalyze(req, res) {
    if (!API_KEY) {
        return sendJson(res, 503, { error: 'Service unavailable: API key not configured.' });
    }

    let body;
    try {
        body = await readBody(req);
    } catch (err) {
        return sendJson(res, err.statusCode || 400, { error: err.message });
    }

    // Validate that the body is valid JSON before forwarding
    try {
        JSON.parse(body);
    } catch {
        return sendJson(res, 400, { error: 'Invalid JSON in request body.' });
    }

    // Forward to Gemini with a timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
        const upstream = await fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: controller.signal,
        });

        const data = await upstream.json();
        sendJson(res, upstream.status, data);
    } catch (err) {
        const isTimeout = err.name === 'AbortError';
        sendJson(res, isTimeout ? 504 : 502, {
            error: isTimeout ? 'Upstream request timed out.' : 'Proxy error.',
            message: err.message,
        });
    } finally {
        clearTimeout(timer);
    }
}

/** GET /* — Serve static files from dist/ */
async function handleStatic(req, res) {
    const filePath = safeResolvePath(req.url);

    if (!filePath) {
        return sendJson(res, 403, { error: 'Forbidden.' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES.get(ext) || 'application/octet-stream';

    const fileExists = existsSync(filePath);

    // SPA fallback: serve index.html for unknown routes
    const targetPath = fileExists ? filePath : path.join(DIST_DIR, 'index.html');
    const targetExt  = fileExists ? ext : '.html';
    const targetType = fileExists ? contentType : 'text/html; charset=utf-8';

    try {
        const stat = await fs.stat(targetPath);
        res.writeHead(200, {
            'Content-Type':   targetType,
            'Content-Length': stat.size,
            'Cache-Control':  cacheControlFor(targetExt),
            ...SECURITY_HEADERS,
        });
        createReadStream(targetPath).pipe(res);
    } catch {
        sendJson(res, 500, { error: 'Internal server error.' });
    }
}

// ─── Main Server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    const { method, url } = req;

    // Health check
    if (url === '/healthz' && method === 'GET') {
        return handleHealth(res);
    }

    // API proxy
    if (url === '/api/analyze' && method === 'POST') {
        return handleAnalyze(req, res);
    }

    // Only allow GET for static files
    if (method !== 'GET') {
        return sendJson(res, 405, { error: 'Method not allowed.' });
    }

    return handleStatic(req, res);
});

// ─── Graceful Shutdown (Cloud Run sends SIGTERM) ──────────────────────────────

function shutdown(signal) {
    console.log(`[server] Received ${signal}. Closing HTTP server...`);
    server.close(() => {
        console.log('[server] HTTP server closed.');
        process.exit(0);
    });

    // Force exit after 10s if connections don't drain
    setTimeout(() => {
        console.error('[server] Forced shutdown after timeout.');
        process.exit(1);
    }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
    console.log(`[server] Running at http://localhost:${PORT}`);
    console.log(`[server] API key configured: ${API_KEY ? 'YES' : 'NO ⚠️'}`);
    console.log(`[server] Serving dist from: ${DIST_DIR}`);
});
