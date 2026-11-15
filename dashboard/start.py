"""Launch the built local dashboard; never installs dependencies or runs training."""
import argparse
import importlib.util
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Choose a port between 1024 and 65535')
    missing = [name for name in ['fastapi', 'uvicorn', 'multipart', 'torch', 'librosa', 'soundfile']
               if importlib.util.find_spec(name) is None]
    if missing:
        raise SystemExit('Missing packages: ' + ', '.join(missing) + '\nUse the dashboard environment and install dashboard/requirements.txt.')
    if not (ROOT / 'dashboard/frontend/dist/index.html').is_file():
        raise SystemExit('Frontend build is missing. Run npm.cmd install and npm.cmd run build in dashboard/frontend first.')
    sys.path.insert(0, str(ROOT))
    os.chdir(ROOT)
    import uvicorn
    print(f'Open http://127.0.0.1:{args.port} in Edge or Chrome. Press Ctrl+C to stop.', flush=True)
    # One process, two PyTorch CPU threads, and lazy model caching suit the laptop.
    uvicorn.run('dashboard.backend.app:app', host='127.0.0.1', port=args.port, log_level='info', access_log=False)


if __name__ == '__main__':
    main()
