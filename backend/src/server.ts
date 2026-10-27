import http from 'http';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { config, validateProductionConfiguration } from './config/env';

async function bootstrap() {
  try {
    validateProductionConfiguration();
    await connectDatabase();

    const app = createApp();
    const server = http.createServer(app);

    server.listen(config.port, () => {
      console.log(`[Server] Krypton API Server running on port ${config.port} in ${config.nodeEnv} mode`);
      console.log(`[Server] Health check: http://localhost:${config.port}/api/public/health`);
    });

    const shutdown = async (signal: string) => {
      console.log(`[Server] Received ${signal}. Gracefully closing server...`);
      server.close(async () => {
        await disconnectDatabase();
        console.log('[Server] Process terminated cleanly.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err: any) {
    console.error(`[Server] Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

bootstrap();
