import mongoose from 'mongoose';
import { config } from './env';

export async function connectDatabase(): Promise<typeof mongoose> {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      dbName: config.mongoDbName,
      serverSelectionTimeoutMS: 10000,
      autoIndex: true,
    });
    console.log(`[Database] MongoDB connected successfully to database: ${conn.connection.name}`);
    return conn;
  } catch (error: any) {
    console.error(`[Database] MongoDB connection failed: ${error.message}`);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.log('[Database] MongoDB disconnected');
}
