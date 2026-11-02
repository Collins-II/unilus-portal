import { setServers } from "node:dns";
import mongoose from "mongoose";

const MONGODB_URL = process.env.MONGODB_URL;

// Optional override for hosts whose local resolver refuses the SRV lookups used by mongodb+srv:// URLs.
if (process.env.DNS_SERVERS) setServers(process.env.DNS_SERVERS.split(",").map((server) => server.trim()).filter(Boolean));

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var motiveMongoose: MongooseCache | undefined;
}

// Cache the connection on globalThis so dev hot-reloads and serverless invocations reuse it.
const cached: MongooseCache = (globalThis.motiveMongoose ??= { conn: null, promise: null });

export async function connectToDatabase() {
  if (!MONGODB_URL) throw new Error("MONGODB_URL is missing");
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URL, { bufferCommands: false, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 20000, maxPoolSize: 10 })
      .catch((error) => {
        // Allow the next request to retry instead of caching the failure forever.
        cached.promise = null;
        console.error("[database] connection failed:", error instanceof Error ? error.message : error);
        throw error;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}