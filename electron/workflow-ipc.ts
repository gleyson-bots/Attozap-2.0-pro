import { ipcMain } from 'electron';
import type { LicenseService } from './license-service.js';
import { WorkflowEngine, type WorkflowInput } from './automation/workflow-engine.js';

export function registerWorkflowIpc(engine: WorkflowEngine, license: LicenseService) {
  const requireFeature = () => license.assertFeature('workflows');

  ipcMain.handle('workflows:list', (_event, accountId?: string) => engine.list(accountId));
  ipcMain.handle('workflows:get', (_event, id: string) => engine.get(id));
  ipcMain.handle('workflows:create', (_event, input: WorkflowInput) => { requireFeature(); return engine.create(input); });
  ipcMain.handle('workflows:update', (_event, id: string, input: Partial<WorkflowInput>) => { requireFeature(); return engine.update(id, input); });
  ipcMain.handle('workflows:remove', (_event, id: string) => { requireFeature(); return engine.remove(id); });
  ipcMain.handle('workflows:toggle', (_event, id: string, enabled: boolean) => { requireFeature(); return engine.toggle(id, enabled); });
  ipcMain.handle('workflows:runs', (_event, workflowId?: string) => engine.runs(workflowId));
  ipcMain.handle('workflows:run', async (_event, id: string, input?: Parameters<WorkflowEngine['run']>[1]) => { requireFeature(); return engine.run(id, input); });
}
