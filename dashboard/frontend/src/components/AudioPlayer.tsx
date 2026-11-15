import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AudioLines, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import type { AudioClip } from '../types'
import Waveform from './Waveform'

export function clock(seconds: number) { return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}` }

export default function AudioPlayer({ clip }: { clip: AudioClip | null }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setPosition(0); setPlaying(false); setError(null) }, [clip])
  const toggle = async () => {
    if (!audio.current) return
    if (playing) audio.current.pause()
    else try { await audio.current.play(); setError(null) } catch { setError('Playback could not start. Try a WAV recording.') }
  }
  return <section className="card audio-card" aria-labelledby="audio-title">
    <h2 id="audio-title"><AudioLines /> Audio &amp; Waveform</h2>
    <div className="playback-wave">
      <Waveform samples={clip?.samples} progress={clip ? position / clip.duration : 0} />
      {!clip && <p className="empty-wave-caption">Your audio will appear here</p>}
    </div>
    {clip && <div className="filename" title={clip.file.name}>{clip.file.name}</div>}
    <audio ref={audio} src={clip?.url} muted={muted} preload="metadata" onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { if (clip) setError('This browser could not play the file. Try WAV audio.') }} />
    <div className="playback-controls">
      <button className="play-button" onClick={() => void toggle()} disabled={!clip} aria-label={playing ? 'Pause audio' : 'Play audio'}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
      <span className="time-display">{clock(position)} / {clip ? clock(clip.duration) : '—:—'}</span>
      <input className="seek" type="range" min="0" max={clip?.duration ?? 1} step="0.01" value={position} disabled={!clip} aria-label="Playback position" onChange={event => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value; setPosition(value) }} style={{ '--progress': `${clip ? 100 * position / clip.duration : 0}%` } as CSSProperties} />
      <button className="icon-button volume" onClick={() => setMuted(value => !value)} disabled={!clip} aria-label={muted ? 'Unmute audio' : 'Mute audio'}>{muted ? <VolumeX /> : <Volume2 />}</button>
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>
}
