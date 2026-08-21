import { createClient } from '@libsql/client';

let client;
let schemaPromise;

export function db() {
  if (!client) {
    if (!process.env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL não configurada');
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });
  }
  return client;
}

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    status TEXT NOT NULL DEFAULT 'active',
    stripe_customer_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER,
    currency TEXT NOT NULL DEFAULT 'brl',
    interval TEXT NOT NULL DEFAULT 'month',
    license_plan TEXT NOT NULL,
    max_seats INTEGER NOT NULL DEFAULT 1,
    max_instances INTEGER NOT NULL DEFAULT 1,
    features_json TEXT NOT NULL DEFAULT '[]',
    stripe_price_id TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    featured INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    current_period_end TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(plan_id) REFERENCES plans(id)
  )`,
  `CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    subscription_id TEXT,
    license_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    fingerprint TEXT,
    issued_at TEXT NOT NULL,
    expires_at TEXT,
    max_seats INTEGER NOT NULL DEFAULT 1,
    max_instances INTEGER NOT NULL DEFAULT 1,
    features_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(plan_id) REFERENCES plans(id)
  )`,
  `CREATE TABLE IF NOT EXISTS releases (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'stable',
    download_url TEXT NOT NULL,
    notes TEXT,
    mandatory INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id,status)`,
  `CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(user_id,status)`,
  `CREATE INDEX IF NOT EXISTS idx_releases_channel ON releases(channel,active,published_at DESC)`,
];

const seedPlans = [
  {
    id: 'plan_plus', slug: 'plus', name: 'Plus', price: 2400, licensePlan: 'solo_plus', seats: 1, instances: 2, featured: 0, order: 10,
    description: 'Para profissionais autônomos e operações enxutas.',
    features: ['WebChat e contatos','Contact Sender','Grupos e templates','Auto Reply','Health Center e backup local'],
    stripe: process.env.STRIPE_PRICE_PLUS || null,
  },
  {
    id: 'plan_pro', slug: 'pro', name: 'Pro', price: 3500, licensePlan: 'solo_pro', seats: 1, instances: 5, featured: 1, order: 20,
    description: 'Para operações que precisam de ferramentas avançadas e mais canais.',
    features: ['Tudo do Plus','Agendamentos e filtros','Google Maps & extratores','Centro JID / LID','Ferramentas em lote'],
    stripe: process.env.STRIPE_PRICE_PRO || null,
  },
  {
    id: 'plan_ultra', slug: 'ultra', name: 'Ultra', price: 9800, licensePlan: 'team_pro', seats: 5, instances: 15, featured: 0, order: 30,
    description: 'Para operações maiores com licenciamento ampliado.',
    features: ['Tudo do Pro','Aquecimento controlado opt-in','Biblioteca de mídias','Diagnóstico completo','Até 5 operadores'],
    stripe: process.env.STRIPE_PRICE_ULTRA || null,
  },
  {
    id: 'plan_enterprise', slug: 'enterprise', name: 'Enterprise', price: null, licensePlan: 'enterprise', seats: 50, instances: 100, featured: 0, order: 40,
    description: 'Limites, recursos e implantação definidos sob medida.',
    features: ['Limites personalizados','Licenciamento sob medida','Múltiplos operadores','Prioridade comercial','Condições personalizadas'],
    stripe: process.env.STRIPE_PRICE_ENTERPRISE || null,
  },
];

export async function ensureSchema() {
  if (!schemaPromise) schemaPromise = (async () => {
    const conn = db();
    await conn.batch(schema.map(sql => ({ sql, args: [] })), 'write');
    for (const plan of seedPlans) {
      await conn.execute({
        sql: `INSERT INTO plans (id,slug,name,description,price_cents,license_plan,max_seats,max_instances,features_json,stripe_price_id,featured,sort_order)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET
                stripe_price_id=COALESCE(excluded.stripe_price_id,plans.stripe_price_id),
                updated_at=CURRENT_TIMESTAMP`,
        args: [plan.id,plan.slug,plan.name,plan.description,plan.price,plan.licensePlan,plan.seats,plan.instances,JSON.stringify(plan.features),plan.stripe,plan.featured,plan.order],
      });
    }
  })().catch(error => { schemaPromise = undefined; throw error; });
  return schemaPromise;
}

export function safeJson(value, fallback = []) {
  try { return JSON.parse(String(value ?? '')); } catch { return fallback; }
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export async function audit(userId, action, entityType, entityId, metadata) {
  await ensureSchema();
  await db().execute({
    sql: `INSERT INTO audit_logs (user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)`,
    args: [userId || null, action, entityType || null, entityId || null, metadata ? JSON.stringify(metadata) : null],
  });
}

export function publicPlan(row) {
  if (!row) return null;
  return {
    id: row.id, slug: row.slug, name: row.name, description: row.description,
    priceCents: row.price_cents, currency: row.currency, interval: row.interval,
    licensePlan: row.license_plan, maxSeats: row.max_seats, maxInstances: row.max_instances,
    features: safeJson(row.features_json), active: Boolean(row.active), featured: Boolean(row.featured),
    stripeConfigured: Boolean(row.stripe_price_id), sortOrder: row.sort_order,
  };
}

export function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, status: row.status, createdAt: row.created_at };
}
