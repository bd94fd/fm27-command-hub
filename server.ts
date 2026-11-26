import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { loadServerConfig, type ServerConfig } from './server/config.ts';
import { GeminiService } from './server/geminiService.ts';
import { createFm27Router } from './server/routes/fm27Routes.ts';
import {
  cleanupAllPendingUploadsAndJobs,
  createFmDecodeRouter,
} from './server/routes/fmDecodeRoutes.ts';
import { createSecurityGuard } from './server/middleware/securityGuard.ts';
import {
  buildServerErrorEvent,
  logServerError,
} from './server/errorReporting.ts';
import { redactSensitiveText } from './src/utils/errorRedaction.ts';

dotenv.config();

export interface CreateAppOptions {
  config?: ServerConfig;
  geminiService?: GeminiService;
  serveFrontend?: boolean;
}

const NO_CACHE_STATIC_FILES = new Set([
  'index.html',
  'sw.js',
  'registerSW.js',
  'fm-save-worker.js',
  'fm-save-mapper.py',
  'fm_layout_patcher.py',
  'manifest.json',
]);

function isApiRequest(req: express.Request): boolean {
  const requestPath = req.path || req.originalUrl || '';
  return requestPath === '/api' || requestPath.startsWith('/api/');
}

export async function createApp(
  options: CreateAppOptions = {}
): Promise<express.Express> {
  const app = express();
  const config = options.config ?? loadServerConfig();
  const geminiService = options.geminiService ?? new GeminiService({ config });

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
    })
  );
  app.use(compression());
  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.locals.requestStartedAtMs = Date.now();
    res.setHeader('X-Request-Id', requestId);
    next();
  });
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Mount modular API routers under /api
  app.use('/api', createFm27Router({ geminiService }));
  const decodeGuard = createSecurityGuard({
    hubAccessToken: config.hubAccessToken,
    rateLimitWindowMs: config.rateLimitWindowMs,
    // Allow up to 600 chunked upload/poll requests per window for large saves up to 1 GB
    rateLimitMaxRequests: Math.max(config.rateLimitMaxRequests, 600),
  });
  app.use('/api/fm27/decode-save', decodeGuard);
  app.use('/api', createFmDecodeRouter({ autoTryLayout: true }));

  // Strict JSON 404 handler for any unmatched /api/* route BEFORE Vite/SPA HTML fallback
  app.all('/api/{*splat}', (req, res) => {
    return res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.path}`,
    });
  });
  app.all('/api', (req, res) => {
    return res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.path}`,
    });
  });
  // Belt-and-braces: no /api/* request may ever fall through to the SPA HTML shell
  app.use('/api', (req, res) => {
    return res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    });
  });

  app.use(
    (
      err: {
        type?: string;
        status?: number;
        name?: string;
        message?: string;
        stack?: string;
        statusCode?: number;
      },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (!isApiRequest(req)) {
        return next(err);
      }
      // A partially written response cannot be converted to JSON safely.
      if (res.headersSent) {
        return next(err);
      }
      const requestId = (res.locals.requestId as string | undefined) || randomUUID();
      if (
        err &&
        (err.type === 'entity.too.large' ||
          err.status === 413 ||
          err.statusCode === 413 ||
          err.name === 'PayloadTooLargeError')
      ) {
        return res.status(413).json({
          error:
            'Request payload was too large (upload chunks are limited to 8 MB each; total .fm save limit is 1024 MB / 1 GB; attached screenshots are automatically compressed).',
          requestId,
        });
      }
      if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({
          error: 'Malformed JSON request body. Please retry the request.',
          requestId,
        });
      }
      const status =
        typeof err?.status === 'number' && err.status >= 400 && err.status < 600
          ? err.status
          : typeof err?.statusCode === 'number' &&
              err.statusCode >= 400 &&
              err.statusCode < 600
            ? err.statusCode
            : 500;
      const startedAt = res.locals.requestStartedAtMs as number | undefined;
      if (status >= 500) {
        logServerError(
          buildServerErrorEvent({
            requestId,
            method: req.method,
            path: req.path,
            status,
            durationMs: startedAt ? Date.now() - startedAt : undefined,
            error: err,
          })
        );
      }
      return res.status(status).json({
        error:
          redactSensitiveText(err?.message || 'Unexpected server API error.', 1200) ||
          'Unexpected server API error.',
        status,
        requestId,
      });
    }
  );

  if (options.serveFrontend !== false) {
    if (config.nodeEnv !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(
        '/assets',
        express.static(path.join(distPath, 'assets'), {
          maxAge: '1y',
          immutable: true,
        })
      );
      app.use(
        express.static(distPath, {
          setHeaders(res, filePath) {
            const base = path.basename(filePath);
            if (NO_CACHE_STATIC_FILES.has(base) || /^workbox-.*\.js$/i.test(base)) {
              res.setHeader(
                'Cache-Control',
                'no-cache, no-store, must-revalidate'
              );
            }
          },
        })
      );
      app.get('/{*splat}', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

async function startServer() {
  const config = loadServerConfig();
  const app = await createApp({ config, serveFrontend: true });

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`FM27 Command Hub running on http://localhost:${config.port}`);
  });

  let shuttingDown = false;
  const handleShutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down FM27 Command Hub gracefully...`);
    const forceTimer = setTimeout(() => {
      process.exit(0);
    }, 8_000);
    forceTimer.unref();

    server.close(() => {
      void cleanupAllPendingUploadsAndJobs().finally(() => {
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

const isDirectEntry =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectEntry) {
  void startServer();
}
