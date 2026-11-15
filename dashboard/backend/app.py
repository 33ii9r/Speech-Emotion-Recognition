"""Local-only HTTP interface and optional serving of the built React application."""
import os
from pathlib import Path
import tempfile

# Keep library caches outside protected research assets.
for variable, folder in [('NUMBA_CACHE_DIR', 'numba'), ('MPLCONFIGDIR', 'matplotlib')]:
    os.environ.setdefault(variable, str(Path(tempfile.gettempdir()) / 'arti502-dashboard' / folder))

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from .artifacts import Evidence, MODEL_NAMES, ROOT
from .audio import MAX_UPLOAD_BYTES
from .inference import InferenceService

app = FastAPI(title='Speech Emotion Recognition', docs_url='/api/docs', redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=['http://127.0.0.1:5173', 'http://localhost:5173'],
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])
service = InferenceService()
evidence = Evidence()


@app.middleware('http')
async def upload_limit(request: Request, call_next):
    if request.url.path == '/api/predict':
        size = request.headers.get('content-length')
        if size and (not size.isdigit() or int(size) > MAX_UPLOAD_BYTES + 65536):
            from fastapi.responses import JSONResponse
            return JSONResponse({'detail': 'Choose an audio file smaller than 20 MB.'}, status_code=413)
    response = await call_next(request)
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


def valid_model(model):
    if model not in MODEL_NAMES:
        raise HTTPException(422, 'Select CNN–LSTM or Transformer.')


@app.get('/api/health')
def health():
    return dict(status='ok', device='cpu', loaded_models=list(service._models))


@app.get('/api/catalog')
def catalog():
    return {'models': [evidence.evaluation(model) for model in MODEL_NAMES]}


@app.get('/api/evaluation/{model}')
def evaluation(model: str):
    valid_model(model)
    return evidence.evaluation(model)


@app.post('/api/predict')
async def predict(model: str = Form(...), audio: UploadFile = File(...)):
    valid_model(model)
    try:
        content = await audio.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, 'Choose an audio file smaller than 20 MB.')
        return await run_in_threadpool(service.predict, content, model)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except (RuntimeError, OSError) as error:
        raise HTTPException(503, str(error)) from error
    finally:
        await audio.close()


distribution = ROOT / 'dashboard/frontend/dist'
if distribution.is_dir():
    app.mount('/', StaticFiles(directory=distribution, html=True), name='dashboard')
