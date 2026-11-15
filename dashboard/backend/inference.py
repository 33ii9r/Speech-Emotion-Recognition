"""CPU inference with strict checkpoint loading and lazy, thread-safe caching."""
import threading
import time
import numpy as np
import torch
from .artifacts import ROOT, LABELS, artifact_path, read_json, sha256
from .audio import decode_audio, model_input
from .models import model_for

torch.set_num_threads(2)


class InferenceService:
    def __init__(self):
        self._models = {}
        self._lock = threading.RLock()

    def load(self, architecture):
        with self._lock:
            if architecture in self._models:
                return self._models[architecture]
            index = read_json(ROOT / 'configs/final_models.json')
            entry = index['models'][architecture]
            frozen = read_json(ROOT / index['frozen_selection'])
            decision = frozen['decisions'][architecture]
            plan = frozen['evaluation_plan']['final_' + architecture]
            paths = {kind: artifact_path(entry[kind]) for kind in ['checkpoint', 'normalizer']}
            for kind, path in paths.items():
                if sha256(path) != entry[kind + '_sha256'] or entry[kind + '_sha256'] != plan[kind + '_sha256']:
                    raise ValueError(f'The selected {kind} checksum does not match the frozen study.')
            checkpoint = torch.load(paths['checkpoint'], map_location='cpu', weights_only=True)
            if checkpoint['labels'] != LABELS or checkpoint['config'] != decision['final_config'] or checkpoint['bands'] != decision['bands']:
                raise ValueError('Checkpoint configuration or class order differs from the frozen selection.')
            model = model_for(checkpoint['config'], checkpoint['bands'])
            model.load_state_dict(checkpoint['model'], strict=True)
            model.eval().requires_grad_(False)
            with np.load(paths['normalizer'], allow_pickle=False) as saved:
                mean, std = saved['mean'].copy(), saved['std'].copy()
                if mean.shape != (40,) or std.shape != (40,) or not np.isfinite(mean).all() or not np.isfinite(std).all() or (std <= 0).any():
                    raise ValueError('Invalid saved training normalizer.')
                if saved['bands'].tolist() != checkpoint['bands']:
                    raise ValueError('Normalizer feature bands differ from the checkpoint.')
            loaded = dict(model=model, mean=mean, std=std, bands=checkpoint['bands'],
                          checkpoint_sha256=entry['checkpoint_sha256'])
            self._models[architecture] = loaded
            return loaded

    def predict(self, content, architecture):
        # One inference at a time keeps CPU and memory bounded on the laptop.
        with self._lock:
            started = time.perf_counter()
            waveform, rate, duration = decode_audio(content)
            try:
                loaded = self.load(architecture)
            except (OSError, KeyError, RuntimeError, ValueError) as error:
                raise RuntimeError(f'The trained model could not be loaded: {error}') from error
            x, lengths = model_input(waveform, rate, loaded['mean'], loaded['std'], loaded['bands'])
            with torch.inference_mode():
                scores = loaded['model'](x, lengths).softmax(dim=1)[0].cpu().numpy()
            if scores.shape != (6,) or not np.isfinite(scores).all():
                raise RuntimeError('The trained model returned invalid probabilities.')
            winner = int(scores.argmax())
            return dict(model=architecture, labels=LABELS, probabilities=scores.tolist(),
                        emotion=LABELS[winner], confidence=float(scores[winner]),
                        duration_seconds=duration, analyzed_seconds=min(duration, 6.0),
                        valid_frames=int(lengths[0]), sample_rate=16000,
                        checkpoint_sha256=loaded['checkpoint_sha256'], device='cpu',
                        processing_ms=round((time.perf_counter() - started) * 1000, 1))
