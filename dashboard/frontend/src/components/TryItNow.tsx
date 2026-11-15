import { useRef, useState } from 'react'
import { Layers3, LoaderCircle, Mic, Square, Upload, X } from 'lucide-react'
import type { AudioClip, ModelId, Phase } from '../types'
import { modelNames } from '../types'
import Waveform from './Waveform'
import { clock } from './AudioPlayer'

interface Props {
  clip: AudioClip | null; model: ModelId; phase: Phase; error: string | null
  live: Float32Array | null; recordedSeconds: number
  onFile: (file: File) => void; onModel: (id: ModelId) => void
  onRecord: () => void; onStop: () => void; onClear: () => void; onRetry: () => void
}
export default function TryItNow(props: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const recording = props.phase === 'recording'
  const waiting = props.phase === 'permission'
  const busy = props.phase === 'decoding' || props.phase === 'processing'
  const message = recording ? `Recording ${clock(props.recordedSeconds)} / 0:06` : waiting ? 'Allow microphone access in your browser…' : props.phase === 'decoding' ? 'Reading your audio…' : props.phase === 'processing' ? `Analyzing with ${modelNames[props.model]}…` : props.clip ? `${props.clip.file.name} · ${props.clip.duration.toFixed(2)} s` : 'WAV, FLAC or OGG · First 6 seconds analyzed'
  return <section className={`card try-card ${dragging ? 'dragging' : ''}`} aria-labelledby="try-title" onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!recording && !waiting && event.dataTransfer.files[0]) props.onFile(event.dataTransfer.files[0]) }}>
    <div className="try-header"><Mic className="section-mic" /><div><h2 id="try-title">Try It Now</h2><p>Upload or record speech to predict the emotion.</p></div></div>
    <div className="try-content">
      <div className="capture-area">
        <div className="capture-wave"><Waveform samples={recording ? props.live : props.clip?.samples} compact />
          <button className={`mic-orb ${recording ? 'recording' : ''}`} aria-label={recording ? 'Stop microphone recording' : 'Start microphone recording'} disabled={waiting || busy} onClick={recording ? props.onStop : props.onRecord}>
            {recording ? <Square fill="currentColor" /> : busy || waiting ? <LoaderCircle className="spin" /> : <Mic />}
          </button>
        </div>
        <div className="capture-buttons">
          <button className="button" disabled={recording || waiting} onClick={() => input.current?.click()}><Upload size={18} /> Upload Audio</button>
          <button className={`button ${recording ? 'record-active' : ''}`} disabled={waiting || busy} onClick={recording ? props.onStop : props.onRecord}>{recording ? <Square size={16} /> : <Mic size={18} />}{recording ? 'Stop Recording' : 'Record Audio'}</button>
        </div>
        <input ref={input} type="file" accept=".wav,.flac,.ogg,audio/wav,audio/flac,audio/ogg" hidden aria-label="Upload audio file" onChange={event => { const file = event.target.files?.[0]; if (file) props.onFile(file); event.target.value = '' }} />
      </div>
      <fieldset className="model-picker" disabled={recording || waiting}>
        <legend><Layers3 size={22} /> Select Model</legend>
        {(Object.keys(modelNames) as ModelId[]).map(id => <label key={id} className={`model-option ${props.model === id ? 'selected' : ''}`}><input type="radio" name="model" value={id} checked={props.model === id} onChange={() => props.onModel(id)} /><span className="radio-dot" />{modelNames[id]}</label>)}
      </fieldset>
    </div>
    <div className={`capture-status ${recording ? 'live' : ''} ${props.error ? 'has-error' : ''}`} aria-live="polite">
      <span className="status-text" role={props.error ? 'alert' : undefined}>{props.error ?? message}</span>
      {props.error && props.clip && <button className="text-button" onClick={props.onRetry}>Retry</button>}
      {(props.clip || recording || waiting || props.error) && <button className="icon-button" title="Clear audio" aria-label="Clear audio" onClick={props.onClear}><X size={15} /></button>}
    </div>
  </section>
}
