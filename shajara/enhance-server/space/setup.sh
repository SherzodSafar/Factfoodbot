set -e
cd /tmp
export PATH=$HOME/.local/bin:$PATH
uv python install 3.10 >/dev/null 2>&1
uv venv -q -p 3.10 /tmp/py
. /tmp/py/bin/activate
uv pip install -q --index-url https://download.pytorch.org/whl/cpu torch==2.4.1 torchvision==0.19.1
uv pip install -q "numpy<2" opencv-python-headless==4.10.0.84 scipy scikit-image pyyaml addict tqdm requests Pillow yapf lmdb future
echo SETUP_OK
