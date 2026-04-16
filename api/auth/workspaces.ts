import { handleVercelNodeRequest } from "../../apps/api/src/vercel-node-handler.js";

export default async function handler(req: any, res: any) {
  await handleVercelNodeRequest(req, res);
}
