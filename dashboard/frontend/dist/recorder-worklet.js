/* Captures actual microphone PCM. Audio output remains silent (no feedback). */
class PCMRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(2048)
    this.used = 0
    this.total = 0
    this.finished = false
    this.port.onmessage = event => { if (event.data === 'stop') this.finish() }
  }
  flush() {
    if (this.used) {
      const chunk = this.buffer.slice(0, this.used)
      this.port.postMessage({ type: 'chunk', samples: chunk }, [chunk.buffer])
      this.used = 0
    }
  }
  finish() {
    if (this.finished) return
    this.flush()
    this.finished = true
    this.port.postMessage({ type: 'done' })
  }
  process(inputs) {
    if (this.finished) return false
    const channels = inputs[0]
    if (!channels?.length) return true
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0
      for (const channel of channels) value += channel[i] / channels.length
      this.buffer[this.used++] = value
      this.total++
      if (this.used === this.buffer.length) this.flush()
      if (this.total >= sampleRate * 6) { this.finish(); return false }
    }
    return true
  }
}
registerProcessor('pcm-recorder', PCMRecorder)
