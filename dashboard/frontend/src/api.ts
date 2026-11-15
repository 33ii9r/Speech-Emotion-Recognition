import type { Evaluation, ModelId, Prediction } from './types'

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : `The local service returned an error (${response.status}).`)
  return data as T
}
export async function getCatalog(signal?: AbortSignal) {
  return responseJson<{ models: Evaluation[] }>(await fetch('/api/catalog', { signal }))
}
export async function analyze(file: File, model: ModelId, signal: AbortSignal) {
  const body = new FormData()
  body.append('audio', file)
  body.append('model', model)
  return responseJson<Prediction>(await fetch('/api/predict', { method: 'POST', body, signal }))
}
