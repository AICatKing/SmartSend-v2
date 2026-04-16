import { handleVercelApiRequest } from "../src/vercel-handler.js";

export default async function handler(request: Request) {
  return handleVercelApiRequest(request);
}

export const config = {
  runtime: "nodejs",
};
