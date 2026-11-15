export type ModelId = 'cnn_lstm' | 'transformer'
export const modelNames: Record<ModelId, string> = { cnn_lstm: 'CNN–LSTM', transformer: 'Transformer' }
export const emotionLabels = ['Angry', 'Disgust', 'Fearful', 'Happy', 'Neutral', 'Sad']
export interface Metrics { accuracy: number; uar: number; macro_f1: number; weighted_f1: number }
export interface Evaluation {
  model: ModelId; name: string; labels: string[]; metrics: Metrics | null
  confusion: { counts: number[][]; normalized: number[][] } | null
  roc: { label: string; auc: number; points: [number, number][] }[] | null
  errors: Record<string, string>; recordings?: number
}
export interface Prediction {
  model: ModelId; labels: string[]; probabilities: number[]; emotion: string; confidence: number
  duration_seconds: number; analyzed_seconds: number; processing_ms: number
  checkpoint_sha256: string; valid_frames: number; device: string
}
export interface AudioClip { file: File; url: string; samples: Float32Array; duration: number }
export type Phase = 'idle' | 'decoding' | 'permission' | 'recording' | 'processing' | 'ready' | 'error'
