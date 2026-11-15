import { ChartNoAxesCombined, Layers3 } from 'lucide-react'
import type { Evaluation, ModelId } from '../types'

export function ArtifactEmpty({ message }: { message: string }) { return <div className="artifact-empty" role="status">{message}</div> }
export const percent = (value: number) => `${(value * 100).toFixed(2)}%`

export function Performance({ evaluation, error }: { evaluation?: Evaluation; error: string | null }) {
  const metrics = evaluation?.metrics
  const rows = [['Accuracy', 'accuracy'], ['UAR', 'uar'], ['Macro F1', 'macro_f1'], ['Weighted F1', 'weighted_f1']] as const
  return <section className="card performance-card" aria-labelledby="performance-title">
    <h2 id="performance-title"><ChartNoAxesCombined /> Model Performance <span>(Test Set)</span></h2>
    {error || evaluation?.errors.metrics ? <ArtifactEmpty message={error ?? evaluation!.errors.metrics} /> : <div className="metric-grid">
      {rows.map(([label, key]) => <div className="metric" key={key}><span title={key === 'uar' ? 'Unweighted Average Recall / Balanced Accuracy' : undefined}>{label}</span><strong data-testid={`metric-${key}`}>{metrics ? percent(metrics[key]) : '—'}</strong></div>)}
    </div>}
  </section>
}

export function Comparison({ models, error, selected }: { models: Evaluation[]; error: string | null; selected: ModelId }) {
  const best = models.reduce<Evaluation | undefined>((previous, current) => !current.metrics ? previous : !previous?.metrics || current.metrics.uar > previous.metrics.uar ? current : previous, undefined)
  return <section className="card comparison-card" aria-labelledby="comparison-title">
    <h2 id="comparison-title"><Layers3 /> Model Comparison</h2>
    {error ? <ArtifactEmpty message={error} /> : <table>
      <thead><tr><th scope="col">Model</th><th scope="col">Accuracy ↑</th><th scope="col">UAR ↑</th><th scope="col">Macro F1 ↑</th></tr></thead>
      <tbody>{models.length ? models.map(model => <tr key={model.model} className={best?.model === model.model ? 'best-model' : ''} aria-current={model.model === selected ? 'true' : undefined}>
        <th scope="row">{model.name}</th>
        {(['accuracy', 'uar', 'macro_f1'] as const).map(key => <td key={key}>{model.metrics ? percent(model.metrics[key]) : 'Unavailable'}</td>)}
      </tr>) : <tr><td colSpan={4} className="table-loading">Loading saved Test results…</td></tr>}</tbody>
    </table>}
  </section>
}
