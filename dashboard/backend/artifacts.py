"""Read saved study evidence; never calculate replacement evaluation results."""
import csv
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STUDY = ROOT / 'outputs/CREMAD_SER/full/complete_experiments'
LABELS = ['angry', 'disgust', 'fearful', 'happy', 'neutral', 'sad']
DISPLAY_LABELS = ['Angry', 'Disgust', 'Fearful', 'Happy', 'Neutral', 'Sad']
MODEL_NAMES = {'cnn_lstm': 'CNN–LSTM', 'transformer': 'Transformer'}


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read_json(path):
    with Path(path).open(encoding='utf-8') as stream:
        return json.load(stream)


def artifact_path(relative):
    path = (ROOT / relative).resolve()
    if not path.is_relative_to(ROOT / 'outputs'):
        raise ValueError('Model artifact path must be inside the protected outputs directory.')
    return path


class Evidence:
    def evaluation(self, architecture):
        folder = STUDY / 'test_evaluation' / ('final_' + architecture)
        response = dict(model=architecture, name=MODEL_NAMES[architecture], labels=DISPLAY_LABELS,
                        metrics=None, confusion=None, roc=None, errors={})
        try:
            evaluation = read_json(folder / 'evaluation.json')
            frozen = read_json(STUDY / 'frozen_selection.json')
            plan = frozen['evaluation_plan']['final_' + architecture]
            provenance = evaluation['provenance']
            if provenance['checkpoint_sha256'] != plan['checkpoint_sha256'] or provenance['normalizer_sha256'] != plan['normalizer_sha256']:
                raise ValueError('Evaluation provenance does not match the selected model.')
            if provenance['frozen_sha256'] != sha256(STUDY / 'frozen_selection.json'):
                raise ValueError('The frozen-selection record differs from the evaluation provenance.')
            metrics = {key: float(evaluation['metrics'][key]) for key in ['accuracy', 'uar', 'macro_f1', 'weighted_f1']}
            if not all(math.isfinite(value) and 0 <= value <= 1 for value in metrics.values()):
                raise ValueError('Saved metrics contain invalid values.')
            response.update(metrics=metrics, recordings=evaluation['recordings'],
                            source=str((folder / 'evaluation.json').relative_to(ROOT)).replace('\\', '/'))
        except (OSError, KeyError, ValueError, TypeError) as error:
            response['errors'] = {key: f'Saved evaluation unavailable: {error}' for key in ['metrics', 'confusion', 'roc']}
            return response

        def verified_csv(filename):
            path = folder / filename
            if sha256(path) != evaluation['artifacts'][filename]:
                raise ValueError(f'{filename} differs from its recorded checksum.')
            with path.open(encoding='utf-8', newline='') as stream:
                return list(csv.reader(stream))

        try:
            matrices = []
            for filename in ['confusion_counts.csv', 'confusion_normalized.csv']:
                rows = verified_csv(filename)
                if rows[0][1:] != LABELS or [row[0] for row in rows[1:]] != LABELS:
                    raise ValueError('Confusion matrix label order is incompatible.')
                matrix = [[float(value) for value in row[1:]] for row in rows[1:]]
                if any(len(row) != 6 or any(not math.isfinite(x) or x < 0 for x in row) for row in matrix):
                    raise ValueError('Invalid confusion matrix values.')
                matrices.append(matrix)
            if sum(map(sum, matrices[0])) != evaluation['recordings']:
                raise ValueError('Confusion counts disagree with the saved evaluation size.')
            if any(abs(sum(row) - 1) > 1e-5 for row in matrices[1]):
                raise ValueError('Normalized confusion rows do not sum to one.')
            response['confusion'] = dict(counts=matrices[0], normalized=matrices[1])
        except (OSError, KeyError, ValueError, IndexError) as error:
            response['errors']['confusion'] = f'Confusion matrix unavailable: {error}'
        try:
            aucs = {row['label']: float(row['auc']) for row in evaluation['roc_auc']}
            curves = []
            for label, display in zip(LABELS, DISPLAY_LABELS):
                rows = verified_csv(label + '_roc.csv')
                if rows[0][:2] != ['fpr', 'tpr']:
                    raise ValueError('Unexpected ROC column names.')
                points = [[float(row[0]), float(row[1])] for row in rows[1:]]
                if not points or any(not math.isfinite(x) or not 0 <= x <= 1 for point in points for x in point):
                    raise ValueError('Invalid ROC coordinates.')
                if not 0 <= aucs[label] <= 1:
                    raise ValueError('Invalid saved AUC.')
                curves.append(dict(label=display, auc=aucs[label], points=points))
            response['roc'] = curves
        except (OSError, KeyError, ValueError, IndexError) as error:
            response['errors']['roc'] = f'ROC data unavailable: {error}'
        return response
