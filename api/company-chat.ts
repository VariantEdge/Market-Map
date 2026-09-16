import { handleCompanyChatRequest } from '../server/http/companyChatHandlers.ts'

export default async function handler(req, res) {
  await handleCompanyChatRequest(req, res, { body: req.body ?? {} })
}
