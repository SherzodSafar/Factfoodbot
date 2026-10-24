FROM python:3.10-slim
RUN apt-get update && apt-get install -y --no-install-recommends git wget libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH CODEFORMER_DIR=/home/user/CodeFormer
WORKDIR /home/user
RUN git clone --depth 1 https://github.com/sczhou/CodeFormer.git
WORKDIR /home/user/CodeFormer
RUN pip install --no-cache-dir --user torch torchvision --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir --user -r requirements.txt fastapi "uvicorn[standard]"
RUN grep -rl "torchvision.transforms.functional_tensor" basicsr /home/user/.local/lib 2>/dev/null | xargs -r sed -i 's/torchvision.transforms.functional_tensor/torchvision.transforms.functional/'; \
    test -f basicsr/version.py || printf "__version__ = '1.3.2'\n__gitsha__ = 'none'\nversion_info = (1, 3, 2)\n" > basicsr/version.py
RUN PYTHONPATH=. python scripts/download_pretrained_models.py facelib \
 && PYTHONPATH=. python scripts/download_pretrained_models.py CodeFormer \
 && mkdir -p weights/realesrgan \
 && wget -q -O weights/realesrgan/RealESRGAN_x2plus.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth
COPY --chown=user server.py /home/user/server.py
EXPOSE 7860
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860", "--app-dir", "/home/user"]
