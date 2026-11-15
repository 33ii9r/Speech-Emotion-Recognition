import { BrainCircuit, Frown, LoaderCircle, Meh, Smile, AudioLines } from 'lucide-react'
import type { Phase, Prediction } from '../types'
import { emotionLabels } from '../types'

export default function PredictionCard({ prediction, phase }: { prediction: Prediction | null; phase: Phase }) {
  const loading = phase === 'processing' || phase === 'decoding'
  const winner = prediction ? prediction.probabilities.indexOf(Math.max(...prediction.probabilities)) : -1
  const Face = prediction?.emotion === 'happy' ? Smile : prediction?.emotion === 'neutral' ? Meh : Frown
  return <section className="card prediction-card" aria-labelledby="prediction-title" aria-busy={loading}>
    <h2 id="prediction-title"><BrainCircuit /> Prediction Result</h2>
    <div className="prediction-body">
      <div className={`emotion-summary ${prediction ? 'has-result' : ''}`} aria-live="polite">
        <div className="emotion-pill">
          {prediction ? <><Face /><strong data-testid="predicted-emotion">{emotionLabels[winner]}</strong></> : loading ? <><LoaderCircle className="spin" /><strong>Analyzing</strong></> : <><AudioLines /><strong>Ready to listen</strong></>}
        </div>
        <p className="confidence">{prediction ? <><span>{(prediction.confidence * 100).toFixed(1)}%</span> confidence</> : loading ? 'Running your selected model locally' : 'Add your voice to discover its emotion'}</p>
        <p className="probability-note">{prediction ? 'Model probability, not a certainty.' : 'Predictions appear after audio is analyzed.'}</p>
      </div>
      <div className="probability-list" aria-label="Six emotion probabilities">
        {emotionLabels.map((label, i) => <div className={`probability-row ${winner === i ? 'winning' : ''}`} key={label}>
          <span>{label}</span><div className="probability-track" role="progressbar" aria-label={`${label} probability`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={prediction ? prediction.probabilities[i] * 100 : undefined} aria-valuetext={prediction ? `${(prediction.probabilities[i] * 100).toFixed(2)} percent` : 'Not analyzed'}><div style={{ width: `${prediction ? prediction.probabilities[i] * 100 : 0}%` }} /></div>
          <span className="probability-value">{prediction ? `${(prediction.probabilities[i] * 100).toFixed(1)}%` : '—'}</span>
        </div>)}
      </div>
    </div>
  </section>
}
