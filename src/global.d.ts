export {};

declare global {
  interface Window {
    attozap: {
      app: { version(): Promise<string>; platform(): Promise<string> };
      accounts: any;
      campaigns: any;
      contacts: any;
      tools: any;
      groups: any;
      autoReply: any;
      files: any;
      settings: any;
      audit: any;
      messages: any;
    };
  }
}
