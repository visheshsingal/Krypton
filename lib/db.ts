import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'krypton';

function getMongoUri(): string {
  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env or Vercel Settings');
  }
  return MONGODB_URI;
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development and serverless function executions in production.
 */
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      dbName: MONGODB_DB,
      serverSelectionTimeoutMS: 10000,
      autoIndex: true,
    };

    cached.promise = mongoose.connect(getMongoUri(), opts).then((mongooseInstance) => {
      console.log(`[Database] Connected to MongoDB Atlas (${MONGODB_DB}) via Vercel Serverless`);
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}
