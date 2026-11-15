import { test, expect, chromium } from '@playwright/test'
import path from 'node:path'

const speech = path.resolve('../verification/1016_DFA_ANG_XX.wav')
const percentage = (value: number) => `${(value * 100).toFixed(2)}%`

test('empty state and saved metrics, matrices and ROC switch between real models', async ({ page, request }) => {
  const catalog = await (await request.get('/api/catalog')).json()
  const errors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Speech Emotion Recognition')
  await expect(page.getByText('Ready to listen')).toBeVisible()
  await expect(page.getByTestId('predicted-emotion')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Play audio', exact: true })).toBeDisabled()
  for (const evaluation of catalog.models) {
    await page.getByRole('radio', { name: evaluation.name, exact: true }).check()
    for (const key of ['accuracy', 'uar', 'macro_f1', 'weighted_f1']) {
      await expect(page.getByTestId(`metric-${key}`)).toHaveText(percentage(evaluation.metrics[key]))
    }
    await expect(page.locator('.matrix-number')).toHaveText(evaluation.confusion.counts.flat().map(String))
    await expect(page.locator('.roc-legend')).toHaveText(evaluation.roc.map((curve: { label: string; auc: number }) => `${curve.label} (AUC = ${curve.auc.toFixed(3)})`))
  }
  await page.getByRole('radio', { name: 'CNN–LSTM', exact: true }).check()
  await page.screenshot({ path: '../verification/dashboard-empty.png', fullPage: true })
  expect(errors).toEqual([])
  expect(externalRequests).toEqual([])
})

test('actual speech upload, model switching, six real scores and playback', async ({ page }) => {
  await page.goto('/')
  const response = page.waitForResponse(response => response.url().endsWith('/api/predict') && response.request().method() === 'POST')
  await page.getByLabel('Upload audio file').setInputFiles(speech)
  const first = await (await response).json()
  expect(first.model).toBe('cnn_lstm')
  await expect(page.getByTestId('predicted-emotion')).toHaveText(first.emotion.charAt(0).toUpperCase() + first.emotion.slice(1))
  await expect(page.locator('.probability-value')).toHaveText(first.probabilities.map((score: number) => `${(score * 100).toFixed(1)}%`))
  await expect(page.getByRole('img', { name: 'Waveform of the current audio recording' })).toHaveCount(2)
  await page.getByRole('button', { name: 'Play audio', exact: true }).click()
  await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(.1)
  await page.getByRole('button', { name: 'Pause audio', exact: true }).click()
  await page.getByRole('slider', { name: 'Playback position' }).click({ position: { x: 40, y: 2 } })
  await page.getByRole('button', { name: 'Mute audio', exact: true }).click()
  await expect(page.locator('audio')).toHaveJSProperty('muted', true)
  await page.screenshot({ path: '../verification/dashboard-cnn-lstm.png', fullPage: true })
  const switched = page.waitForResponse(response => response.url().endsWith('/api/predict'))
  await page.getByRole('radio', { name: 'Transformer', exact: true }).check()
  const second = await (await switched).json()
  expect(second.model).toBe('transformer')
  expect(second.checkpoint_sha256).not.toBe(first.checkpoint_sha256)
  await expect(page.locator('.probability-value')).toHaveText(second.probabilities.map((score: number) => `${(score * 100).toFixed(1)}%`))
  await page.screenshot({ path: '../verification/dashboard-transformer.png', fullPage: true })
  await page.getByRole('button', { name: 'Clear audio', exact: true }).click()
  await expect(page.getByTestId('predicted-emotion')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Play audio', exact: true })).toBeDisabled()
})

test('unsupported and corrupt uploads never produce a prediction', async ({ page }) => {
  await page.goto('/')
  let requests = 0
  page.on('request', request => { if (request.url().endsWith('/api/predict')) requests++ })
  await page.getByLabel('Upload audio file').setInputFiles({ name: 'wrong.txt', mimeType: 'text/plain', buffer: Buffer.from('not audio') })
  await expect(page.getByRole('alert')).toContainText('Unsupported file type')
  await page.getByLabel('Upload audio file').setInputFiles({ name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('not audio') })
  await expect(page.getByRole('alert')).toContainText('could not be decoded')
  await expect(page.getByTestId('predicted-emotion')).toHaveCount(0)
  expect(requests).toBe(0)
})

test('microphone permission denial is actionable (simulated denial)', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied by test', 'NotAllowedError') }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Record Audio', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Microphone permission was denied')
  await expect(page.getByTestId('predicted-emotion')).toHaveCount(0)
})

test('automatic and manual recording with replayed real speech (emulated device)', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${speech}`,
  ] })
  try {
    const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1672, height: 941 } })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:8000')
    const response = page.waitForResponse(response => response.url().endsWith('/api/predict'))
    await page.getByRole('button', { name: 'Record Audio', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Stop Recording', exact: true })).toBeVisible()
    const completed = await response
    const result = await completed.json()
    expect(completed.status(), JSON.stringify(result)).toBe(200)
    expect(result.probabilities).toHaveLength(6)
    expect(result.duration_seconds).toBeCloseTo(6, 3)
    await expect(page.getByTestId('predicted-emotion')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play audio', exact: true })).toBeEnabled()
    const manualResponse = page.waitForResponse(response => response.url().endsWith('/api/predict'))
    await page.getByRole('button', { name: 'Record Audio', exact: true }).click()
    await page.getByText(/^Recording 0:01/).waitFor()
    await page.getByRole('button', { name: 'Stop Recording', exact: true }).click()
    const manual = await manualResponse
    const stopped = await manual.json()
    expect(manual.status(), JSON.stringify(stopped)).toBe(200)
    expect(stopped.duration_seconds).toBeGreaterThan(.9)
    expect(stopped.duration_seconds).toBeLessThan(6)
    expect(stopped.probabilities).toHaveLength(6)
    // This verifies capture wiring, not a physical microphone or natural speech accuracy.
  } finally { await browser.close() }
})

test('mobile layout fits without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByTestId('metric-accuracy')).toHaveText('60.42%')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const metricWidths = await page.locator('.metric strong').evaluateAll(elements => elements.map(element => ({
    text: element.getBoundingClientRect().width,
    fits: element.scrollWidth <= element.clientWidth,
  })))
  expect(metricWidths.every(value => value.fits)).toBe(true)
  await expect(page.getByRole('button', { name: 'Upload Audio', exact: true })).toBeVisible()
  await page.screenshot({ path: '../verification/dashboard-mobile.png', fullPage: true })
})

test('clearing audio prevents a delayed real prediction from reappearing', async ({ page }) => {
  await page.route('**/api/predict', async route => {
    // Delay an actual backend response; no prediction values are fabricated.
    const response = await route.fetch()
    await new Promise(resolve => setTimeout(resolve, 700))
    await route.fulfill({ response }).catch(() => {})
  })
  await page.goto('/')
  const sent = page.waitForRequest(request => request.url().endsWith('/api/predict'))
  await page.getByLabel('Upload audio file').setInputFiles(speech)
  await sent
  await page.getByRole('button', { name: 'Clear audio', exact: true }).click()
  await expect(page.getByText('Ready to listen')).toBeVisible()
  await page.waitForTimeout(900)
  await expect(page.getByTestId('predicted-emotion')).toHaveCount(0)
})

test('unavailable backend shows a recoverable empty state', async ({ page }) => {
  await page.route('**/api/catalog', route => route.abort('connectionrefused'))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible()
  await expect(page.locator('.matrix-number')).toHaveCount(0)
  await page.unroute('**/api/catalog')
  await page.getByRole('button', { name: 'Retry connection' }).click()
  await expect(page.getByTestId('metric-accuracy')).toHaveText('60.42%')
  await expect(page.locator('.matrix-number')).toHaveCount(36)
})
