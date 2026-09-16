import { handleCompanyChatWarmupRequest } from '../../server/http/companyChatHandlers.ts'

export default async function handler(req, res) {
  await handleCompanyChatWarmupRequest(req, res, { localOnly: true })
}
