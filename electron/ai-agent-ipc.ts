import { ipcMain } from 'electron';
import type { LicenseService } from './license-service.js';
import { AiAgentEngine, type AiAgentInput } from './automation/ai-agent.js';

export function registerAiAgentIpc(engine: AiAgentEngine, license: LicenseService) {
  const requireFeature = () => license.assertFeature('ai_chat');
  ipcMain.handle('ai-agents:list', (_event, accountId?: string) => engine.list(accountId));
  ipcMain.handle('ai-agents:logs', (_event, agentId?: string, limit?: number) => engine.logs(agentId, limit));
  ipcMain.handle('ai-agents:save', (_event, input: AiAgentInput) => { requireFeature(); return engine.save(input); });
  ipcMain.handle('ai-agents:toggle', (_event, accountId: string, enabled: boolean) => { requireFeature(); return engine.toggle(accountId, enabled); });
  ipcMain.handle('ai-agents:remove', (_event, accountId: string) => { requireFeature(); return engine.remove(accountId); });
}
