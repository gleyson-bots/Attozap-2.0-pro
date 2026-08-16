export {};

declare global {
  interface Window {
    attozap: {
      app: { version(): Promise<string>; platform(): Promise<string> };
      accounts: any;
      campaigns: any;
      contacts: any;
      chats: any;
      webchat: any;
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
      audit: any;
      messages: any;
    };
  }
}
