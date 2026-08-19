import { dialog, ipcMain, type BrowserWindow } from 'electron';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { AttozapDatabase } from './database.js';

function splitCsvLine(line: string, separator: string) {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i++; }
      else quoted = !quoted;
    } else if (char === separator && !quoted) { out.push(current.trim()); current = ''; }
    else current += char;
  }
  out.push(current.trim());
  return out;
}

function detectSeparator(line: string) {
  const candidates = [';', ',', '\t'];
  return candidates.map(separator => ({ separator, count: splitCsvLine(line, separator).length })).sort((a, b) => b.count - a.count)[0]?.separator ?? ';';
}

export function registerRecruitingIpc(window: BrowserWindow, db: AttozapDatabase) {
  ipcMain.handle('recruiting:jobs-list', () => db.prepare(`SELECT * FROM recruiting_jobs ORDER BY updated_at DESC`).all());
  ipcMain.handle('recruiting:job-save', (_event, input: any) => {
    const title = String(input?.title ?? '').trim();
    if (!title) throw new Error('Informe o título da vaga');
    const id = String(input?.id || randomUUID());
    db.prepare(`
      INSERT INTO recruiting_jobs (id,title,company,location,description,status)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,company=excluded.company,location=excluded.location,description=excluded.description,status=excluded.status,updated_at=CURRENT_TIMESTAMP
    `).run(id, title, String(input?.company ?? '').trim() || null, String(input?.location ?? '').trim() || null, String(input?.description ?? '').trim() || null, String(input?.status ?? 'draft'));
    return db.prepare(`SELECT * FROM recruiting_jobs WHERE id=?`).get(id);
  });
  ipcMain.handle('recruiting:job-remove', (_event, id: string) => { db.prepare(`DELETE FROM recruiting_jobs WHERE id=?`).run(id); return true; });
  ipcMain.handle('recruiting:candidates-list', (_event, jobId?: string) => jobId
    ? db.prepare(`SELECT * FROM recruiting_candidates WHERE job_id=? ORDER BY updated_at DESC`).all(jobId)
    : db.prepare(`SELECT * FROM recruiting_candidates ORDER BY updated_at DESC LIMIT 5000`).all());
  ipcMain.handle('recruiting:candidate-save', (_event, input: any) => {
    const name = String(input?.name ?? '').trim();
    if (!name) throw new Error('Informe o nome do candidato');
    const id = String(input?.id || randomUUID());
    db.prepare(`
      INSERT INTO recruiting_candidates (id,job_id,name,email,phone,source,profile_url,notes,status)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET job_id=excluded.job_id,name=excluded.name,email=excluded.email,phone=excluded.phone,source=excluded.source,profile_url=excluded.profile_url,notes=excluded.notes,status=excluded.status,updated_at=CURRENT_TIMESTAMP
    `).run(id, input?.jobId || null, name, String(input?.email ?? '').trim() || null, String(input?.phone ?? '').replace(/\D/g, '') || null, String(input?.source ?? '').trim() || null, String(input?.profileUrl ?? '').trim() || null, String(input?.notes ?? '').trim() || null, String(input?.status ?? 'new'));
    return db.prepare(`SELECT * FROM recruiting_candidates WHERE id=?`).get(id);
  });
  ipcMain.handle('recruiting:candidate-remove', (_event, id: string) => { db.prepare(`DELETE FROM recruiting_candidates WHERE id=?`).run(id); return true; });

  ipcMain.handle('recruiting:import-csv', async (_event, jobId?: string) => {
    const picked = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'CSV / TSV', extensions: ['csv','tsv','txt'] }] });
    if (picked.canceled || !picked.filePaths[0]) return { imported: 0, skipped: 0 };
    const content = (await readFile(picked.filePaths[0], 'utf8')).replace(/^\uFEFF/, '');
    const lines = content.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return { imported: 0, skipped: 0 };
    const separator = detectSeparator(lines[0]);
    const headers = splitCsvLine(lines[0], separator).map(item => item.toLowerCase().trim());
    const aliases: Record<string, string[]> = {
      name: ['name','nome','candidato','candidate'], email: ['email','e-mail'], phone: ['phone','telefone','celular','whatsapp'],
      source: ['source','origem','fonte'], profile_url: ['profile_url','perfil','linkedin','url'], notes: ['notes','notas','observacoes','observações'], status: ['status','situacao','situação'],
    };
    const indexFor = (key: string) => headers.findIndex(header => aliases[key].includes(header));
    const indexes = Object.fromEntries(Object.keys(aliases).map(key => [key, indexFor(key)])) as Record<string, number>;
    let imported = 0; let skipped = 0;
    const insert = db.prepare(`INSERT INTO recruiting_candidates (id,job_id,name,email,phone,source,profile_url,notes,status) VALUES (?,?,?,?,?,?,?,?,?)`);
    const tx = db.transaction(() => {
      for (const line of lines.slice(1)) {
        const cols = splitCsvLine(line, separator);
        const name = indexes.name >= 0 ? String(cols[indexes.name] ?? '').trim() : '';
        if (!name) { skipped++; continue; }
        insert.run(randomUUID(), jobId || null, name,
          indexes.email >= 0 ? String(cols[indexes.email] ?? '').trim() || null : null,
          indexes.phone >= 0 ? String(cols[indexes.phone] ?? '').replace(/\D/g, '') || null : null,
          indexes.source >= 0 ? String(cols[indexes.source] ?? '').trim() || null : null,
          indexes.profile_url >= 0 ? String(cols[indexes.profile_url] ?? '').trim() || null : null,
          indexes.notes >= 0 ? String(cols[indexes.notes] ?? '').trim() || null : null,
          indexes.status >= 0 ? String(cols[indexes.status] ?? '').trim() || 'new' : 'new');
        imported++;
      }
    });
    tx();
    return { imported, skipped, separator };
  });
}
