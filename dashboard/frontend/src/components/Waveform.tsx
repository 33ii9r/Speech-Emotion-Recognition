import { useId, useMemo } from 'react'

export default function Waveform({ samples, progress = 0, compact = false }: { samples?: Float32Array | null; progress?: number; compact?: boolean }) {
  const id = useId().replace(/:/g, '')
  const bars = useMemo(() => {
    if (!samples?.length) return []
    const count = 100
    const peaks = Array.from({ length: count }, (_, i) => {
      let peak = 0
      const start = Math.floor(i * samples.length / count)
      const end = Math.floor((i + 1) * samples.length / count)
      for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(samples[j]))
      return peak
    })
    const maximum = Math.max(...peaks, 1e-8)
    return peaks.map(value => value / maximum)
  }, [samples])
  return <svg className={`waveform ${compact ? 'compact' : ''}`} viewBox="0 0 500 120" role="img" aria-label={bars.length ? 'Waveform of the current audio recording' : 'No audio loaded'}>
    <defs><linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="500" y2="0"><stop stopColor="#b835ff" /><stop offset=".48" stopColor="#9d6aff" /><stop offset="1" stopColor="#09e4ed" /></linearGradient></defs>
    {bars.length ? <>
      <g stroke={`url(#${id})`} strokeWidth="2.8" strokeLinecap="round">
        {bars.map((height, i) => <path key={i} d={`M${i * 5 + 2} ${60 - height * 49}v${height * 98 || 0.3}`} />)}
      </g>
      {progress > 0 && <line x1={progress * 500} x2={progress * 500} y1="8" y2="112" stroke="#e9e4ff" opacity=".8" />}
    </> : <path d="M5 60H495" stroke={`url(#${id})`} opacity=".22" strokeDasharray="2 7" />}
  </svg>
}
