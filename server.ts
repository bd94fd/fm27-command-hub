import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { loadServerConfig, type ServerConfig } from './server/config.ts';
import { GeminiService } from './server/geminiService.ts';
import { createFm27Router } from './server/routes/fm27Routes.ts';
import { createFmDecodeRouter } from './server/routes/fmDecodeRoutes.ts';

dotenv.config();

export interface CreateAppOptions {
  config?: ServerConfig;
  geminiService?: GeminiService;
  serveFrontend?: boolean;
}

export async function createApp(
  options: CreateAppOptions = {}
): Promise<express.Express> {
  const app = express();
  const config = options.config ?? loadServerConfig();
  const geminiService = options.geminiService ?? new GeminiService({ config });

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Mount modular API routers under /api
  app.use('/api', createFm27Router({ geminiService }));
  app.use('/api', createFmDecodeRouter());

  // Strict JSON 404 handler for any unmatched /api/* route BEFORE Vite/SPA HTML fallback
  app.all('/api/*', (req, res) => {
    return res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.path}`,
    });
  });

  app.use(
    (
      err: { type?: string; status?: number; name?: string; message?: string },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (
        err &&
        (err.type === 'entity.too.large' ||
          err.status === 413 ||
          err.name === 'PayloadTooLargeError')
      ) {
        return res.status(413).json({
          error:
            'Request payload was too large (upload chunks are limited to 8 MB each; total .fm save limit is 1024 MB / 1 GB; attached screenshots are automatically compressed).',
        });
      }
      if (req.path.startsWith('/api/')) {
        const status =
          typeof err?.status === 'number' && err.status >= 400 && err.status < 600
            ? err.status
            : 500;
        return res.status(status).json({
          error: err?.message || 'Unexpected server API error.',
        });
      }
      return next(err);
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
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

async function startServer() {
  const config = loadServerConfig();
  const app = await createApp({ config, serveFrontend: true });

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`FM27 Command Hub running on http://localhost:${config.port}`);
  });
}

const isDirectEntry =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectEntry) {
  void startServer();
}
