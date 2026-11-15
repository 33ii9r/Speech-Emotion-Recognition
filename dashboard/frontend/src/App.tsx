import { useCallback, useEffect, useRef, useState } from 'react'
import { analyze, getCatalog } from './api'
import { useRecorder } from './hooks/useRecorder'
import type { AudioClip, Evaluation, ModelId, Phase, Prediction } from './types'
import TryItNow from './components/TryItNow'
import PredictionCard from './components/PredictionCard'
import { Comparison, Performance } from './components/Performance'
import { ConfusionMatrix, RocCurves } from './components/EvaluationCharts'
import AudioPlayer from './components/AudioPlayer'

export default function App() {
  const [model, setModel] = useState<ModelId>('cnn_lstm')
  const [models, setModels] = useState<Evaluation[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [clip, setClip] = useState<AudioClip | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [live, setLive] = useState<Float32Array | null>(null)
  const [recordedSeconds, setRecordedSeconds] = useState(0)
  const decodeGeneration = useRef(0)
  const inferenceRequest = useRef<AbortController | null>(null)
  const [reload, setReload] = useState(0)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setCatalogError(null)
    void getCatalog(controller.signal).then(result => setModels(result.models)).catch(error => {
      if (error.name !== 'AbortError') setCatalogError('Saved results are unavailable. Check that the local backend is running.')
    })
    return () => controller.abort()
  }, [reload])

  const loadFile = useCallback(async (file: File) => {
    inferenceRequest.current?.abort()
    const token = ++decodeGeneration.current
    setPrediction(null); setClip(null); setError(null); setPhase('decoding'); setLive(null)
    let context: AudioContext | null = null
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose an audio file smaller than 20 MB.')
      if (!/\.(wav|flac|ogg)$/i.test(file.name)) throw new Error('Unsupported file type. Choose WAV, FLAC or OGG audio.')
      context = new AudioContext()
      const decoded = await context.decodeAudioData(await file.arrayBuffer())
      if (token !== decodeGeneration.current) return
      if (decoded.duration < .1 || decoded.duration > 120) throw new Error('Audio must be between 0.1 and 120 seconds long.')
      const samples = new Float32Array(decoded.length)
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const data = decoded.getChannelData(channel)
        for (let i = 0; i < data.length; i++) samples[i] += data[i] / decoded.numberOfChannels
      }
      // Waveform/playback use this decoded view; inference receives the original file.
      setClip({ file, samples, duration: decoded.duration, url: URL.createObjectURL(file) })
    } catch (error) {
      if (token !== decodeGeneration.current) return
      setPhase('error'); setError(error instanceof Error && error.name !== 'EncodingError' ? error.message : 'This audio could not be decoded. Try a valid PCM WAV file.')
    } finally { if (context) void context.close().catch(() => {}) }
  }, [])

  const recorder = useRecorder({ onState: setPhase, onLive: (samples, seconds) => { setLive(samples); setRecordedSeconds(seconds) },
    onComplete: file => void loadFile(file), onError: message => { setError(message); setPhase('error'); setLive(null) } })

  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url) }, [clip])
  useEffect(() => () => { decodeGeneration.current++ }, [])

  useEffect(() => {
    setPrediction(null)
    if (!clip) return
    const controller = new AbortController()
    inferenceRequest.current = controller
    setError(null); setPhase('processing')
    void analyze(clip.file, model, controller.signal).then(result => {
      if (controller.signal.aborted) return
      const expected = ['angry', 'disgust', 'fearful', 'happy', 'neutral', 'sad']
      if (result.model !== model || result.labels.join(',') !== expected.join(',') || result.probabilities.length !== 6 || result.probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 1) || Math.abs(result.probabilities.reduce((a, b) => a + b, 0) - 1) > .0001) throw new Error('The model returned an incompatible response.')
      setPrediction(result); setPhase('ready')
    }).catch(error => {
      if (controller.signal.aborted) return
      setPhase('error'); setError(error instanceof TypeError ? 'Cannot reach the local inference service. Start the backend and try again.' : error.message)
    })
    return () => controller.abort()
  }, [clip, model, retry])

  const clear = () => {
    inferenceRequest.current?.abort()
    decodeGeneration.current++; recorder.cancel(); setClip(null); setPrediction(null)
    setPhase('idle'); setError(null); setLive(null); setRecordedSeconds(0)
  }
  const startRecording = () => { clear(); void recorder.start() }
  const selectModel = (id: ModelId) => {
    inferenceRequest.current?.abort()
    setPrediction(null)
    setModel(id)
  }
  const evaluation = models.find(item => item.model === model)

  return <main className="dashboard">
    <header className="page-header"><h1>Speech Emotion <span>Recognition</span></h1><p>AI-Powered Voice Emotion Analytics</p></header>
    <div className="primary-grid">
      <TryItNow clip={clip} model={model} phase={phase} error={error} live={live} recordedSeconds={recordedSeconds} onFile={file => void loadFile(file)} onModel={selectModel} onRecord={startRecording} onStop={recorder.stop} onClear={clear} onRetry={() => setRetry(value => value + 1)} />
      <PredictionCard prediction={prediction} phase={phase} />
    </div>
    {catalogError && <div className="connection-message" role="alert"><span>{catalogError}</span><button className="text-button" onClick={() => setReload(value => value + 1)}>Retry connection</button></div>}
    <div className="summary-grid"><Performance evaluation={evaluation} error={catalogError} /><Comparison models={models} error={catalogError} selected={model} /></div>
    <div className="analysis-grid"><ConfusionMatrix evaluation={evaluation} model={model} error={catalogError} /><RocCurves evaluation={evaluation} error={catalogError} /><AudioPlayer clip={clip} /></div>
  </main>
}
