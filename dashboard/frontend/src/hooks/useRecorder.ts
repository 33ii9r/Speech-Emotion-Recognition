import { useCallback, useEffect, useRef } from 'react'

function wavFile(samples: Float32Array, sampleRate: number): File {
  const bytes = new ArrayBuffer(44 + samples.length * 4)
  const view = new DataView(bytes)
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 3, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 32, true)
  text(36, 'data'); view.setUint32(40, samples.length * 4, true)
  samples.forEach((value, i) => view.setFloat32(44 + i * 4, value, true))
  return new File([bytes], 'Microphone recording.wav', { type: 'audio/wav' })
}

function microphoneError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Microphone permission was denied. Allow access in your browser, or upload an audio file.'
    if (error.name === 'NotFoundError') return 'No microphone was found. Connect a microphone or upload an audio file.'
    if (error.name === 'NotReadableError') return 'The microphone is unavailable or in use by another application.'
  }
  return error instanceof Error ? error.message : 'The microphone could not start.'
}

export function useRecorder(callbacks: {
  onState: (state: 'permission' | 'recording') => void
  onLive: (samples: Float32Array, seconds: number) => void
  onComplete: (file: File) => void
  onError: (message: string) => void
}) {
  const handlers = useRef(callbacks)
  handlers.current = callbacks
  const resource = useRef<{ context: AudioContext; stream?: MediaStream; node?: AudioWorkletNode; source?: MediaStreamAudioSourceNode; mute?: GainNode; timer?: number } | null>(null)
  const generation = useRef(0)
  const cancel = useCallback(() => {
    generation.current++
    const active = resource.current
    resource.current = null
    if (!active) return
    clearTimeout(active.timer)
    active.stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
    if (active.node) { active.node.port.onmessage = null; active.node.disconnect() }
    active.source?.disconnect(); active.mute?.disconnect()
    void active.context.close().catch(() => {})
  }, [])

  const start = useCallback(async () => {
    cancel()
    const token = generation.current
    handlers.current.onState('permission')
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Microphone recording requires localhost and a supported browser. Open the local application URL in Edge or Chrome.')
      const context = new AudioContext()
      resource.current = { context }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
      if (token !== generation.current) { stream.getTracks().forEach(track => track.stop()); return }
      resource.current!.stream = stream
      await context.resume()
      await context.audioWorklet.addModule('/recorder-worklet.js')
      if (token !== generation.current) return
      const source = context.createMediaStreamSource(stream)
      const node = new AudioWorkletNode(context, 'pcm-recorder')
      const mute = context.createGain(); mute.gain.value = 0
      Object.assign(resource.current!, { node, source, mute })
      const chunks: Float32Array[] = []
      let count = 0
      const finish = () => {
        if (token !== generation.current) return
        const samples = new Float32Array(count)
        let offset = 0
        for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length }
        const rate = context.sampleRate
        cancel()
        if (count < rate * 0.1) handlers.current.onError('The recording is too short. Record at least a moment of speech.')
        else handlers.current.onComplete(wavFile(samples, rate))
      }
      node.port.onmessage = event => {
        if (token !== generation.current) return
        if (event.data.type === 'chunk') {
          const samples = event.data.samples as Float32Array
          chunks.push(samples); count += samples.length
          // The live display shows the newest real PCM samples, never generated data.
          handlers.current.onLive(samples, count / context.sampleRate)
        } else if (event.data.type === 'done') finish()
      }
      stream.getAudioTracks().forEach(track => {
        track.onended = () => { if (token === generation.current) { cancel(); handlers.current.onError('The microphone disconnected. Please record again.') } }
      })
      source.connect(node); node.connect(mute); mute.connect(context.destination)
      resource.current!.timer = window.setTimeout(() => {
        if (token === generation.current) { cancel(); handlers.current.onError('Recording timed out. Check your microphone and try again.') }
      }, 12000)
      handlers.current.onState('recording')
    } catch (error) {
      if (token !== generation.current) return
      cancel(); handlers.current.onError(microphoneError(error))
    }
  }, [cancel])
  const stop = useCallback(() => resource.current?.node?.port.postMessage('stop'), [])
  useEffect(() => cancel, [cancel])
  return { start, stop, cancel }
}
