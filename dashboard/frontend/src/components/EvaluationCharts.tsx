import { useId } from 'react'
import { ChartNoAxesCombined, Grid2X2 } from 'lucide-react'
import type { Evaluation, ModelId } from '../types'
import { emotionLabels, modelNames } from '../types'
import { ArtifactEmpty } from './Performance'

export function ConfusionMatrix({ evaluation, model, error }: { evaluation?: Evaluation; model: ModelId; error: string | null }) {
  const id = useId().replace(/:/g, '')
  const matrix = evaluation?.confusion
  const color = (value: number) => {
    // The cell interpolation and legend use exactly the same three color stops.
    const stops = [[12, 43, 70], [104, 43, 173], [232, 169, 255]]
    const segment = value <= .5 ? 0 : 1
    const weight = segment === 0 ? value * 2 : (value - .5) * 2
    return `rgb(${stops[segment].map((channel, i) => Math.round(channel + (stops[segment + 1][i] - channel) * weight)).join(',')})`
  }
  return <section className="card chart-card" aria-labelledby="matrix-title">
    <h2 id="matrix-title"><Grid2X2 /> Confusion Matrix <span>({modelNames[model]})</span></h2>
    {!matrix ? <ArtifactEmpty message={error ?? evaluation?.errors.confusion ?? 'Loading saved confusion matrix…'} /> : <svg className="matrix-chart" viewBox="0 0 430 260" role="img" aria-label={`Real held-out Test confusion matrix for ${modelNames[model]}; row-normalized color and recording counts`}>
      <defs><linearGradient id={id} x1="0" y1="1" x2="0" y2="0"><stop stopColor="#0c2b46" /><stop offset=".5" stopColor="#682bad" /><stop offset="1" stopColor="#e8a9ff" /></linearGradient></defs>
      {matrix.normalized.map((row, i) => row.map((value, j) => <g key={`${i}-${j}`}>
        <rect x={92 + j * 42} y={17 + i * 30} width="41.5" height="29.5" fill={color(value)}><title>{emotionLabels[i]} → {emotionLabels[j]}: {matrix.counts[i][j]} recordings ({(value * 100).toFixed(2)}%)</title></rect>
        <text x={113 + j * 42} y={36 + i * 30} textAnchor="middle" className="matrix-number">{matrix.counts[i][j]}</text>
      </g>))}
      {emotionLabels.map((label, i) => <g key={label}><text x="83" y={36 + i * 30} textAnchor="end" className="axis-label">{label}</text><text x={113 + i * 42} y="216" textAnchor="middle" className="matrix-x-label">{label}</text></g>)}
      <text x="218" y="246" textAnchor="middle" className="axis-title">Predicted Emotion</text>
      <text x="18" y="107" transform="rotate(-90 18 107)" textAnchor="middle" className="axis-title">True Emotion</text>
      <rect x="363" y="17" width="11" height="180" fill={`url(#${id})`} rx="1" />
      {[1, .8, .6, .4, .2, 0].map(value => <text key={value} x="382" y={22 + (1 - value) * 176} className="axis-label">{value.toFixed(1)}</text>)}
    </svg>}
  </section>
}

const rocColors = ['#ffa62b', '#12daef', '#31e5a2', '#f4dd36', '#c3b7ff', '#ed46bc']
export function RocCurves({ evaluation, error }: { evaluation?: Evaluation; error: string | null }) {
  const curves = evaluation?.roc
  const x = (value: number) => 55 + value * 345
  const y = (value: number) => 204 - value * 182
  return <section className="card chart-card" aria-labelledby="roc-title">
    <h2 id="roc-title"><ChartNoAxesCombined /> ROC Curves <span>(One-vs-Rest)</span></h2>
    {!curves ? <ArtifactEmpty message={error ?? evaluation?.errors.roc ?? 'Loading saved ROC curves…'} /> : <svg className="roc-chart" viewBox="0 0 430 260" role="img" aria-label={`Saved one-vs-rest ROC curves and AUC values for ${evaluation?.name}`}>
      {[0, .2, .4, .6, .8, 1].map(value => <g key={value}>
        <path d={`M55 ${y(value)}H400 M${x(value)} 22V204`} className="gridline" />
        <text x="46" y={y(value) + 4} textAnchor="end" className="axis-label">{value.toFixed(1)}</text>
        <text x={x(value)} y="224" textAnchor="middle" className="axis-label">{value.toFixed(1)}</text>
      </g>)}
      <path d="M55 22V204H400" className="axis-line" />
      <path d="M55 204L400 22" stroke="#838899" strokeWidth="1" strokeDasharray="6 4" fill="none" />
      {curves.map((curve, i) => <path key={curve.label} d={curve.points.map(([fpr, tpr], j) => `${j ? 'L' : 'M'}${x(fpr).toFixed(3)},${y(tpr).toFixed(3)}`).join(' ')} fill="none" stroke={rocColors[i]} strokeWidth="1.7"><title>{curve.label}: AUC {curve.auc.toFixed(4)}</title></path>)}
      <rect x="222" y="87" width="176" height="114" rx="4" fill="#080b19" fillOpacity=".94" stroke="#343047" />
      {curves.map((curve, i) => <g key={curve.label}>
        <path d={`M232 ${99 + i * 18}h15`} stroke={rocColors[i]} strokeWidth="2" />
        <text x="254" y={103 + i * 18} className="roc-legend">{curve.label} (AUC = {curve.auc.toFixed(3)})</text>
      </g>)}
      <text x="227" y="250" textAnchor="middle" className="axis-title">False Positive Rate</text>
      <text x="15" y="113" transform="rotate(-90 15 113)" textAnchor="middle" className="axis-title">True Positive Rate</text>
    </svg>}
  </section>
}
