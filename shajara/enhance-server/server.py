# Shajara — rasm sifatini oshirish serveri (Oracle Cloud bepul VM, faqat CPU).
# up   — Real-ESRGAN x2plus: tiniqlashtirish, yuzni qayta chizmaydi.
# face — CodeFormer (w=0.7, o'xshashlik ustun) + fon Real-ESRGAN bilan.
# Modellar bir marta yuklanadi; so'rovlar navbat bilan (bitta-bitta) bajariladi.
import os, sys, threading
import cv2, numpy as np, torch
from fastapi import FastAPI, Request, HTTPException, Response

ROOT = os.environ.get('CODEFORMER_DIR', os.path.expanduser('~/CodeFormer'))
sys.path.insert(0, ROOT)
os.chdir(ROOT)
from torchvision.transforms.functional import normalize
from basicsr.utils import img2tensor, tensor2img
from basicsr.utils.registry import ARCH_REGISTRY
from basicsr.archs.rrdbnet_arch import RRDBNet
from basicsr.utils.realesrgan_utils import RealESRGANer
from facelib.utils.face_restoration_helper import FaceRestoreHelper

KEY = os.environ.get('ENHANCE_KEY', '')
MAX_IN = int(os.environ.get('MAX_IN', '1600'))  # kirish rasmi eng katta tomoni (CPU vaqti uchun)
FIDELITY = float(os.environ.get('FIDELITY', '0.7'))
torch.set_num_threads(os.cpu_count() or 4)
device = torch.device('cpu')

upsampler = RealESRGANer(scale=2, model_path=os.path.join(ROOT, 'weights/realesrgan/RealESRGAN_x2plus.pth'),
                         model=RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2),
                         tile=400, tile_pad=40, pre_pad=0, half=False)
net = ARCH_REGISTRY.get('CodeFormer')(dim_embd=512, codebook_size=1024, n_head=8, n_layers=9,
                                     connect_list=['32', '64', '128', '256']).to(device)
net.load_state_dict(torch.load(os.path.join(ROOT, 'weights/CodeFormer/codeformer.pth'), map_location='cpu')['params_ema'])
net.eval()
lock = threading.Lock()
app = FastAPI()


def shrink(img):
    h, w = img.shape[:2]
    k = min(1.0, MAX_IN / max(h, w))
    return cv2.resize(img, (round(w * k), round(h * k)), interpolation=cv2.INTER_AREA) if k < 1 else img


def restore_faces(img):
    helper = FaceRestoreHelper(2, face_size=512, crop_ratio=(1, 1), det_model='retinaface_resnet50',
                               save_ext='png', use_parse=True, device=device)
    helper.read_image(img)
    helper.get_face_landmarks_5(only_center_face=False, resize=640, eye_dist_threshold=5)
    helper.align_warp_face()
    for cropped in helper.cropped_faces:
        t = img2tensor(cropped / 255., bgr2rgb=True, float32=True)
        normalize(t, (0.5, 0.5, 0.5), (0.5, 0.5, 0.5), inplace=True)
        with torch.no_grad():
            out = net(t.unsqueeze(0).to(device), w=FIDELITY, adain=True)[0]
        helper.add_restored_face(tensor2img(out, rgb2bgr=True, min_max=(-1, 1)).astype('uint8'), cropped)
    bg = upsampler.enhance(img, outscale=2)[0]
    if not helper.cropped_faces:
        return bg
    helper.get_inverse_affine(None)
    return helper.paste_faces_to_input_image(upsample_img=bg, draw_box=False)


@app.get('/health')
def health():
    return {'ok': True}


@app.post('/enhance')
async def enhance(req: Request, mode: str = 'up'):
    if not KEY or req.headers.get('x-key') != KEY:
        raise HTTPException(401, 'kalit noto‘g‘ri')
    data = await req.body()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, 'rasm juda katta')
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, 'rasm o‘qilmadi')
    img = shrink(img)
    with lock:
        out = restore_faces(img) if mode == 'face' else upsampler.enhance(img, outscale=2)[0]
    ok, jpg = cv2.imencode('.jpg', out, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return Response(jpg.tobytes(), media_type='image/jpeg')
