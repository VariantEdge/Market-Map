import { handleCompanyChatHealthRequest } from '../../server/http/companyChatHandlers.ts'

export default async function handler(req, res) {
  await handleCompanyChatHealthRequest(req, res)
}
