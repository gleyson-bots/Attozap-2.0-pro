declare module '*.svg?url' {
  const src: string;
  export default src;
}

export {};

declare global {
  interface AttozapWebChatApi {
    [key: string]: any;
    list(accountId: string, search?: string): Promise<any>;
    messages(accountId: string, remoteJid: string, limit?: number): Promise<any>;
    sendText(accountId: string, target: string, text: string): Promise<any>;
    sendMedia(accountId: string, target: string, type: 'image' | 'video' | 'document' | 'audio' | 'sticker', input: any): Promise<any>;
    sendPoll(accountId: string, target: string, input: { name: string; values: string[]; selectableCount?: number }): Promise<any>;
    sendLocation(accountId: string, target: string, input: { latitude: number; longitude: number; name?: string; address?: string }): Promise<any>;
    sendContact(accountId: string, target: string, input: { displayName: string; phone: string; organization?: string }): Promise<any>;
  }
  interface AttozapAiProvider {
    id: string;
    label: string;
    model: string;
    configured: boolean;
    protocol: string;
    imageSupported?: boolean;
    imageModel?: string;
    imageConfigured?: boolean;
  }
  interface AttozapWorkflowNode {
    id: string;
    type: 'trigger_message' | 'trigger_schedule' | 'condition_text' | 'wait' | 'send_text' | 'send_location' | 'send_contact' | 'send_poll' | 'ai_rewrite';
    label: string;
    x: number;
    y: number;
    config: Record<string, unknown>;
  }
  interface AttozapWorkflowEdge { id: string; source: string; target: string; condition?: 'true' | 'false'; }
  interface AttozapWorkflow {
    id: string;
    account_id?: string | null;
    name: string;
    description: string;
    enabled: number;
    trigger_type: 'manual' | 'message' | 'schedule';
    nodes_json: string;
    edges_json: string;
    run_count: number;
    last_run_at?: string | null;
    created_at: string;
    updated_at: string;
  }
  interface AttozapWorkflowRun {
    id: string;
    workflow_id: string;
    trigger_type: string;
    status: string;
    error?: string | null;
    started_at: string;
    finished_at?: string | null;
  }
  interface AttozapWorkflowsApi {
    list(accountId?: string): Promise<AttozapWorkflow[]>;
    get(id: string): Promise<AttozapWorkflow | null>;
    create(payload: any): Promise<AttozapWorkflow>;
    update(id: string, payload: any): Promise<AttozapWorkflow>;
    remove(id: string): Promise<{ ok: boolean }>;
    toggle(id: string, enabled: boolean): Promise<AttozapWorkflow>;
    runs(workflowId?: string): Promise<AttozapWorkflowRun[]>;
    run(id: string, input?: any): Promise<AttozapWorkflowRun>;
  }
  interface AttozapAiApi {
    providers(): Promise<AttozapAiProvider[]>;
    chat(payload: any): Promise<any>;
    rewrite(payload: { provider: string; model?: string; action: 'correct' | 'shorten' | 'expand' | 'context'; text: string; context?: string }): Promise<any>;
    image(payload: { provider: string; model?: string; prompt: string; negativePrompt?: string; width?: number; height?: number; aspectRatio?: string; quality?: 'auto' | 'low' | 'medium' | 'high'; outputFormat?: 'png' | 'jpeg' | 'webp'; seed?: number }): Promise<any>;
  }
  interface AttozapAiAgentApi {
    list(accountId?: string): Promise<any[]>;
    logs(agentId?: string, limit?: number): Promise<any[]>;
    save(payload: any): Promise<any>;
    toggle(accountId: string, enabled: boolean): Promise<any>;
    remove(accountId: string): Promise<{ ok: boolean }>;
  }
  interface Window {
    attozap: {
      app: { version(): Promise<string>; platform(): Promise<string>; openExternal(url: string): Promise<boolean> };
      accounts: any;
      campaigns: any;
      contacts: any;
      chats: any;
      webchat: AttozapWebChatApi;
      browser: any;
      recruiting: any;
      tools: any;
      groups: any;
      templates: any;
      polls: any;
      extractors: any;
      importers: any;
      autoReply: any;
      workflows: AttozapWorkflowsApi;
      aiAgents: AttozapAiAgentApi;
      warmup: any;
      license: any;
      files: { pick(options?: any): Promise<string[]>; saveText(payload: any): Promise<any>; saveTempBinary(payload: { base64: string; suggestedName?: string; maxBytes?: number }): Promise<{ filePath: string; size: number }>; readPreview(filePath: string): Promise<{ filePath: string; fileName: string; mimeType: string; kind: 'image' | 'video' | 'audio' | 'document'; size: number; dataUrl: string }> };
      clipboard: any;
      settings: any;
      secure: any;
      ai: AttozapAiApi;
      system: any;
      diagnostics: any;
      identities: any;
      audit: any;
      messages: any;
      delivery: any;
    };
  }
}
