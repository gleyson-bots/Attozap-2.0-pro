export {};

declare global {
  interface Window {
    attozap: {
      app: { version(): Promise<string>; platform(): Promise<string> };
      accounts: any;
      campaigns: any;
      contacts: any;
      chats: any;
      tools: any;
      groups: any;
      templates: any;
      autoReply: any;
      license: any;
      files: any;
      settings: any;
      audit: any;
      messages: any;
    };
  }
}
