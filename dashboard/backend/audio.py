"""Audio decoding and the exact feature/normalization sequence used in the notebook."""
import io
import numpy as np
import soundfile as sf
import torch
from .models import extract_logmel

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def decode_audio(content: bytes):
    if not content:
        raise ValueError('The audio file is empty.')
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError('Choose an audio file smaller than 20 MB.')
    try:
        with sf.SoundFile(io.BytesIO(content)) as audio:
            if audio.format not in {'WAV', 'WAVEX', 'RF64', 'FLAC', 'OGG'}:
                raise ValueError('Unsupported audio format. Use WAV, FLAC or OGG audio.')
            duration = audio.frames / audio.samplerate
            if not 0.1 <= duration <= 120:
                raise ValueError('Audio must be between 0.1 and 120 seconds long.')
            if audio.channels not in (1, 2) or not 8000 <= audio.samplerate <= 192000:
                raise ValueError('Use mono or stereo audio sampled between 8 and 192 kHz.')
            rate = audio.samplerate
            waveform = audio.read(dtype='float32', always_2d=True)
    except (sf.LibsndfileError, RuntimeError) as error:
        raise ValueError('This file cannot be decoded. Choose a valid WAV, FLAC or OGG recording.') from error
    if not np.isfinite(waveform).all():
        raise ValueError('Audio contains invalid sample values.')
    # Float PCM can legitimately exceed unity after browser/device resampling.
    # Preserve finite samples exactly, as the notebook does; do not clip or rescale.
    # Only reject digital silence; quiet speech is neither trimmed nor amplified.
    first_six = waveform[:min(len(waveform), rate * 6)]
    if np.max(np.abs(first_six.mean(axis=1))) <= 1e-8:
        raise ValueError('No audio signal was found in the first six seconds. Please record speech.')
    return waveform, rate, duration


def model_input(waveform, rate, mean, std, bands):
    # FeatureBank.get casts the float16 cache to float32 before normalization.
    mel = extract_logmel(waveform, rate).astype(np.float32)
    real = ((mel - mean[:, None]) / std[:, None])[bands].T.astype(np.float32)
    if not 1 <= len(real) <= 300 or not np.isfinite(real).all():
        raise ValueError('Audio could not be converted to valid model features.')
    padded = torch.zeros(1, 300, len(bands), dtype=torch.float32)
    padded[0, :len(real)] = torch.from_numpy(real.copy())
    return padded, torch.tensor([len(real)], dtype=torch.long)
