import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

let _db: ReturnType<typeof postgres<Contract>> | null = null;

function getDb() {
  if (!_db) {
    // Load env if not already loaded (for Bun)
    if (!process.env.DATABASE_URL) {
      // Try to load from root .env
      try {
        const fs = require('fs');
        const path = require('path');
        const envPath = path.resolve(process.cwd(), '../../.env');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf-8');
          for (const line of envContent.split('\n')) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
              process.env[key.trim()] = valueParts.join('=').trim();
            }
          }
        }
      } catch {
        // Ignore
      }
    }
    _db = postgres<Contract>({
      contractJson,
      url: process.env['DATABASE_URL']!,
    });
  }
  return _db;
}

export async function connectDb() {
  const db = getDb();
  await db.connect();
}

export function getDbInstance() {
  return getDb();
}
