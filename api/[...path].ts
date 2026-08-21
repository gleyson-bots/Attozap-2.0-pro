import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server/app";

const app = createApp();

export default function handler(request: VercelRequest, response: VercelResponse) {
  return app(request, response);
}
