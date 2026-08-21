import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomUUID } from 'node:crypto';
import { audit, db, ensureSchema, normalizeEmail, publicUser } from './db.js';

const COOKIE_NAME = 'attozap_session';

function secret() {
  const explicit = String(process.env.AUTH_SECRET || '').trim();
  if (explicit.length >= 32) return new TextEncoder().encode(explicit);

  // Fallback seguro para ambientes onde AUTH_SECRET ainda não foi cadastrado:
  // deriva uma chave HMAC de 256 bits de um segredo já exclusivamente server-side.
  // Nada do TURSO_AUTH_TOKEN é enviado ao navegador ou persistido no banco.
  const tursoToken = String(process.env.TURSO_AUTH_TOKEN || '').trim();
  if (tursoToken.length >= 32) {
    return createHash('sha256')
      .update(`attozap:portal:auth:v1:${tursoToken}`, 'utf8')
      .digest();
  }

  throw new Error('Configuração de autenticação indisponível. Defina AUTH_SECRET ou TURSO_AUTH_TOKEN na Vercel.');
}

export async function ensureAdmin() {
  await ensureSchema();
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) return;
  const existing = await db().execute({ sql: `SELECT id FROM users WHERE email=? LIMIT 1`, args: [email] });
  if (existing.rows[0]) return;
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  await db().execute({
    sql: `INSERT INTO users (id,name,email,password_hash,role,status) VALUES (?,?,?,?, 'admin','active')`,
    args: [id, process.env.ADMIN_NAME || 'Administrador ATTOZAP', email, passwordHash],
  });
  await audit(id, 'admin.bootstrap', 'user', id, { email });
}

export async function createSession(user) {
  return new SignJWT({ role: user.role, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure ? '; Secure' : ''}`);
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

function cookieValue(req, name) {
  const raw = String(req.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export async function currentUser(req) {
  await ensureSchema();
  await ensureAdmin();
  const token = cookieValue(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    const result = await db().execute({ sql: `SELECT * FROM users WHERE id=? LIMIT 1`, args: [payload.sub] });
    const row = result.rows[0];
    if (!row || row.status !== 'active') return null;
    return row;
  } catch { return null; }
}

export async function requireUser(req) {
  const user = await currentUser(req);
  if (!user) {
    const error = new Error('Não autenticado');
    error.statusCode = 401;
    throw error;
  }
  return user;
}

export async function requireAdmin(req) {
  const user = await requireUser(req);
  if (user.role !== 'admin') {
    const error = new Error('Acesso administrativo necessário');
    error.statusCode = 403;
    throw error;
  }
  return user;
}

export async function registerUser({ name, email, password }) {
  await ensureSchema();
  const normalized = normalizeEmail(email);
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) throw Object.assign(new Error('Informe seu nome'), { statusCode: 400 });
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw Object.assign(new Error('E-mail inválido'), { statusCode: 400 });
  if (String(password || '').length < 8) throw Object.assign(new Error('A senha deve ter pelo menos 8 caracteres'), { statusCode: 400 });
  const exists = await db().execute({ sql: `SELECT id FROM users WHERE email=? LIMIT 1`, args: [normalized] });
  if (exists.rows[0]) throw Object.assign(new Error('Já existe uma conta com este e-mail'), { statusCode: 409 });
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(String(password), 12);
  await db().execute({
    sql: `INSERT INTO users (id,name,email,password_hash,role,status) VALUES (?,?,?,?, 'customer','active')`,
    args: [id, cleanName, normalized, passwordHash],
  });
  await audit(id, 'user.register', 'user', id, { email: normalized });
  return { id, name: cleanName, email: normalized, role: 'customer', status: 'active' };
}

export async function loginUser(email, password) {
  await ensureSchema();
  await ensureAdmin();
  const normalized = normalizeEmail(email);
  const result = await db().execute({ sql: `SELECT * FROM users WHERE email=? LIMIT 1`, args: [normalized] });
  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(String(password || ''), String(row.password_hash)))) {
    throw Object.assign(new Error('E-mail ou senha incorretos'), { statusCode: 401 });
  }
  if (row.status !== 'active') throw Object.assign(new Error('Esta conta está bloqueada'), { statusCode: 403 });
  await audit(row.id, 'user.login', 'user', row.id);
  return row;
}

export { publicUser };
