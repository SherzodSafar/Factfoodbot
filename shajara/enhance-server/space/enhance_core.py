# Shajara — eski rasmni ASL HOLICHA sifatli qilish (faqat CPU).
#   Real-ESRGAN x2plus — butun rasm 2×: fon, kiyim, matn tiniqlashadi; hech narsa qayta chizilmaydi.
#   CodeFormer (w — o'xshashlik, 0.7) — faqat yuzlar tiklanadi va aynan o'z joyiga, o'z o'lchamida qaytariladi.
#   Oq-qora (yoki sarg'aygan) rasm o'z rangida qoladi: natijaning yorug'ligi + aslning rangi (Lab).
#   colorize=True — DDColor bilan tabiiy rang beriladi (tiklashdan keyin).
import glob, os, subprocess, sys, threading

HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get('CODEFORMER_DIR', os.path.join(HERE, 'CodeFormer'))
DD = os.environ.get('DDCOLOR_DIR', os.path.join(HERE, 'DDColor'))


def _prepare():
    if not os.path.isdir(CF):
        subprocess.run(['git', 'clone', '--depth', '1', 'https://github.com/sczhou/CodeFormer.git', CF], check=True)
        # yangi torchvision'da transforms.functional_tensor yo'q
        for f in glob.glob(os.path.join(CF, 'basicsr', '**', '*.py'), recursive=True):
            s = open(f, encoding='utf-8').read()
            if 'functional_tensor' in s:
                open(f, 'w', encoding='utf-8').write(s.replace('torchvision.transforms.functional_tensor', 'torchvision.transforms.functional'))
        vf = os.path.join(CF, 'basicsr', 'version.py')
        if not os.path.exists(vf):
            open(vf, 'w').write("__version__ = '1.3.2'\n__gitsha__ = 'none'\nversion_info = (1, 3, 2)\n")


_prepare()
sys.path.insert(0, CF)
os.chdir(CF)  # facelib/basicsr og'irliklarni nisbiy weights/ papkasidan o'qiydi

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402
from torchvision.transforms.functional import normalize  # noqa: E402
from basicsr.archs.rrdbnet_arch import RRDBNet  # noqa: E402
from basicsr.utils import img2tensor, tensor2img  # noqa: E402
from basicsr.utils.download_util import load_file_from_url  # noqa: E402
from basicsr.utils.realesrgan_utils import RealESRGANer  # noqa: E402
from basicsr.utils.registry import ARCH_REGISTRY  # noqa: E402
from facelib.utils.face_restoration_helper import FaceRestoreHelper  # noqa: E402

REL = 'https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/'
for name, d in [('codeformer.pth', 'weights/CodeFormer'), ('RealESRGAN_x2plus.pth', 'weights/realesrgan'),
                ('detection_Resnet50_Final.pth', 'weights/facelib'), ('parsing_parsenet.pth', 'weights/facelib')]:
    if not os.path.exists(os.path.join(d, name)):
        load_file_from_url(REL + name, model_dir=d, progress=False, file_name=name)

MAX_IN = int(os.environ.get('MAX_IN', '1600'))  # kirish rasmining eng katta tomoni (CPU vaqti uchun)
torch.set_num_threads(os.cpu_count() or 2)
device = torch.device('cpu')
upsampler = RealESRGANer(scale=2, model_path='weights/realesrgan/RealESRGAN_x2plus.pth',
                         model=RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2),
                         tile=400, tile_pad=40, pre_pad=0, half=False)
net = ARCH_REGISTRY.get('CodeFormer')(dim_embd=512, codebook_size=1024, n_head=8, n_layers=9,
                                     connect_list=['32', '64', '128', '256']).to(device)
net.load_state_dict(torch.load('weights/CodeFormer/codeformer.pth', map_location='cpu')['params_ema'])
net.eval()
lock = threading.Lock()
_ddcolor = None


def shrink(img):
    h, w = img.shape[:2]
    k = min(1.0, MAX_IN / max(h, w))
    return cv2.resize(img, (round(w * k), round(h * k)), interpolation=cv2.INTER_AREA) if k < 1 else img


def is_gray(img):
    """Oq-qora yoki bir tusli (sarg'ish/jigarrang) eski rasm: rang to'yinganligi juda past."""
    small = cv2.resize(img, (256, 256), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(small, cv2.COLOR_BGR2LAB).astype(np.float32)
    a, b = lab[..., 1] - 128, lab[..., 2] - 128
    # bir tusli rasmda a/b deyarli o'zgarmaydi (faqat umumiy tus)
    return float(np.std(a)) < 4.0 and float(np.std(b)) < 6.0


def keep_tone(src, out):
    """Natijaning yorug'ligi (detallar) + asl rasmning rangi/tusi: oq-qora rasm oq-qora bo'lib qoladi."""
    up = cv2.resize(src, (out.shape[1], out.shape[0]), interpolation=cv2.INTER_CUBIC)
    lo, lu = cv2.cvtColor(out, cv2.COLOR_BGR2LAB), cv2.cvtColor(up, cv2.COLOR_BGR2LAB)
    lo[..., 1:] = lu[..., 1:]
    return cv2.cvtColor(lo, cv2.COLOR_LAB2BGR)


def restore(img, w=0.7):
    helper = FaceRestoreHelper(2, face_size=512, crop_ratio=(1, 1), det_model='retinaface_resnet50',
                               save_ext='png', use_parse=True, device=device)
    helper.read_image(img)
    helper.get_face_landmarks_5(only_center_face=False, resize=640, eye_dist_threshold=5)
    helper.align_warp_face()
    for cropped in helper.cropped_faces:
        t = img2tensor(cropped / 255., bgr2rgb=True, float32=True)
        normalize(t, (0.5, 0.5, 0.5), (0.5, 0.5, 0.5), inplace=True)
        with torch.no_grad():
            o = net(t.unsqueeze(0).to(device), w=w, adain=True)[0]
        helper.add_restored_face(tensor2img(o, rgb2bgr=True, min_max=(-1, 1)).astype('uint8'), cropped)
    bg = upsampler.enhance(img, outscale=2)[0]
    if not helper.cropped_faces:
        return bg, 0
    helper.get_inverse_affine(None)
    return helper.paste_faces_to_input_image(upsample_img=bg, draw_box=False), len(helper.cropped_faces)


def colorize(img):
    global _ddcolor
    if _ddcolor is None:
        from ddcolor_run import load  # DDColor (kerak bo'lganda yuklanadi)
        _ddcolor = load(DD)
    return _ddcolor(img)


def enhance(img, w=0.7, color=False):
    """img — BGR uint8. Natija: (BGR uint8, ma'lumot)."""
    img = shrink(img)
    gray = is_gray(img)
    with lock:
        out, faces = restore(img, float(w))
        if gray:
            out = keep_tone(img, out)
        if color:
            out = colorize(out)
    return out, {'faces': faces, 'gray': gray, 'color': bool(color), 'size': [out.shape[1], out.shape[0]]}
