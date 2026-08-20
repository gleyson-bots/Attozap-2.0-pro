declare module '*.svg' {
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
      warmup: any;
      license: any;
      files: any;
      clipboard: any;
      settings: any;
      secure: any;
      ai: any;
      system: any;
      diagnostics: any;
      identities: any;
      audit: any;
      messages: any;
      delivery: any;
    };
  }
}
