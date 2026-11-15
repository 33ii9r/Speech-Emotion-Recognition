"""Exact inference definitions recovered from the protected executed notebook.
No training code or previous-dashboard implementation is imported.
"""
import numpy as np
import torch
from torch import nn


def extract_logmel(wave, rate):
    import librosa
    wave = np.asarray(wave, dtype=np.float32)
    if wave.ndim == 2:
        wave = wave.mean(axis=1)
    if wave.ndim != 1 or not len(wave) or (not np.isfinite(wave).all()):
        raise ValueError('Invalid source audio')
    if rate != 16000:
        wave = librosa.resample(wave, orig_sr=rate, target_sr=16000, res_type='soxr_hq')
    wave = wave[:96000]
    mel = librosa.feature.melspectrogram(y=wave, sr=16000, n_fft=400, hop_length=320,
        n_mels=40, fmin=20, fmax=7600, power=2)
    return librosa.power_to_db(mel, ref=1.0).astype(np.float32)[:, :300].astype(np.float16)


def convolution_lengths(lengths, convolution):
    """PyTorch Conv1d output-length formula, applied to each valid sequence."""
    return (lengths + 2 * convolution.padding[0] - convolution.dilation[0] * (convolution.kernel_size[0] - 1) - 1) // convolution.stride[0] + 1


def masked_convolution(x, lengths, convolution, normalization, activation):
    valid = torch.arange(x.shape[2], device=x.device)[None, :] < lengths[:, None]
    x = convolution(x.masked_fill(~valid[:, None, :], 0))
    lengths = convolution_lengths(lengths, convolution)
    valid = torch.arange(x.shape[2], device=x.device)[None, :] < lengths[:, None]
    frames = x.transpose(1, 2)
    real = frames[valid]
    if normalization.training and len(real) == 1:
        real = torch.nn.functional.batch_norm(real, normalization.running_mean,
            normalization.running_var, normalization.weight, normalization.bias, training=False,
            eps=normalization.eps)
    else:
        real = normalization(real)
    output = torch.zeros_like(frames)
    output[valid] = activation(real).to(output.dtype)
    return (output.transpose(1, 2), lengths)


class CNNLSTM(nn.Module):

    def __init__(self, n_features, config):
        super().__init__()
        h = config['hidden']
        self.conv = nn.Sequential(nn.Conv1d(n_features, 64, 5, padding=2),
            nn.BatchNorm1d(64), nn.GELU(), nn.Conv1d(64, 96, 3, padding=1), nn.BatchNorm1d(96),
            nn.GELU())
        self.rnn = nn.LSTM(96, h, batch_first=True, bidirectional=True)
        self.head = nn.Sequential(nn.Dropout(config['dropout']), nn.Linear(2 * h, 6))

    def forward(self, x, lengths):
        lengths = torch.as_tensor(lengths, device=x.device)
        if x.ndim != 3 or lengths.shape != (len(x),) or lengths.is_floating_point() or torch.any(lengths < 1) or torch.any(lengths > x.shape[1]):
            raise ValueError('Expected positive integer lengths within the padded sequence')
        x = x[:, :int(lengths.max())].transpose(1, 2)
        for offset in (0, 3):
            x, lengths = masked_convolution(x, lengths, *self.conv[offset:offset + 3])
        packed = nn.utils.rnn.pack_padded_sequence(x.transpose(1, 2), lengths.detach().cpu(),
            batch_first=True, enforce_sorted=False)
        packed, _ = self.rnn(packed)
        x, _ = nn.utils.rnn.pad_packed_sequence(packed, batch_first=True)
        return self.head(x.sum(1) / lengths.unsqueeze(1))


class Transformer(nn.Module):

    def __init__(self, n_features, config):
        super().__init__()
        w = config['width']
        self.in_proj = nn.Linear(n_features, w)
        self.pos = nn.Parameter(torch.zeros(1, 300, w))
        nn.init.normal_(self.pos, std=0.02)
        layer = nn.TransformerEncoderLayer(w, config['heads'], 2 * w, config['dropout'],
            batch_first=True, activation='gelu')
        self.encoder = nn.TransformerEncoder(layer, config['layers'], enable_nested_tensor=False)
        self.head = nn.Sequential(nn.Dropout(config['head_dropout']), nn.Linear(w, 6))

    def forward(self, x, lengths):
        mask = torch.arange(x.shape[1], device=x.device)[None, :] >= lengths[:, None]
        z = self.encoder(self.in_proj(x) + self.pos[:, :x.shape[1]], src_key_padding_mask=mask)
        return self.head(z.masked_fill(mask.unsqueeze(-1), 0).sum(1) / lengths.clamp(min=1).unsqueeze(1))


def model_for(config, bands):
    return (CNNLSTM if config['architecture'] == 'cnn_lstm' else Transformer)(len(bands), config)
