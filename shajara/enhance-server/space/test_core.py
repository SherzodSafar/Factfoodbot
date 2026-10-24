# Sinov: enhance_core konveyeri — ochiq (Wikimedia) suratlarda. Natija: solishtirish varaqlari (base64).
import base64, json, os, sys, time, urllib.parse, urllib.request
sys.path.insert(0, '/tmp/space')
OUT = '/tmp/cf/out'
LOG = []
def log(*a):
    LOG.append(' '.join(str(x) for x in a)); open(f'{OUT}/py.log', 'w').write('\n'.join(LOG))
UA = {'User-Agent': 'ShajaraTest/1.0 (photo restoration evaluation)'}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
def commons(title):
    q = urllib.parse.urlencode({'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|size', 'iiurlwidth': 1200, 'format': 'json'})
    p = list(json.loads(get('https://commons.wikimedia.org/w/api.php?' + q))['query']['pages'].values())[0]
    ii = p['imageinfo'][0]
    return get(ii.get('thumburl') or ii['url'])
t0 = time.time()
import cv2, numpy as np
import enhance_core as E
log('load', round(time.time() - t0, 1), 's')
from facelib.utils.face_restoration_helper import FaceRestoreHelper
TESTS = [('kaz', 'File:Kazakhs 19th Century 9.jpg'), ('uzw', 'File:Uzbek Wedding ceremony.jpg')] + [(f'x{i}', t) for i, t in enumerate(sys.argv[1:])]
def jpg(img, q=60):
    return cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, q])[1].tobytes()
for tid, title in TESTS:
    try:
        raw = commons(title)
    except Exception as e:
        log('SRC ERR', tid, title, e); continue
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]; k = 800 / max(h, w)
    img = cv2.resize(img, (round(w * k), round(h * k)), interpolation=cv2.INTER_AREA)
    img = cv2.imdecode(np.frombuffer(jpg(img, 55), np.uint8), cv2.IMREAD_COLOR)  # past sifatli nusxa
    t = time.time()
    out, info = E.enhance(img, 0.7)
    log('OK', tid, title, f'{img.shape[1]}x{img.shape[0]} -> {out.shape[1]}x{out.shape[0]}', round(time.time() - t, 1), 's', info)
    cv2.imwrite(f'/tmp/cf/w/py_{tid}.png', out)
    # 1) butun rasm: asl (2× bicubic) | natija
    up = cv2.resize(img, (out.shape[1], out.shape[0]), interpolation=cv2.INTER_CUBIC)
    H = 700
    a = cv2.resize(up, (round(up.shape[1] * H / up.shape[0]), H)); b = cv2.resize(out, (a.shape[1], H))
    sheet = np.hstack([a, np.full((H, 8, 3), 255, np.uint8), b])
    open(f'{OUT}/py_{tid}.b64', 'w').write(base64.b64encode(jpg(sheet, 78)).decode())
    # 2) yuzlar yaqindan: asl (2×) | natija
    hp = FaceRestoreHelper(1, face_size=512, det_model='retinaface_resnet50', use_parse=False, device=E.device)
    hp.read_image(img); hp.get_face_landmarks_5(only_center_face=False, resize=640, eye_dist_threshold=5)
    rows = []
    for f in sorted(hp.det_faces, key=lambda f: -(f[2] - f[0]) * (f[3] - f[1]))[:3]:
        x1, y1, x2, y2 = [int(v) for v in f[:4]]
        m = int(0.35 * (x2 - x1)); x1, y1, x2, y2 = max(0, x1 - m), max(0, y1 - m), min(img.shape[1], x2 + m), min(img.shape[0], y2 + m)
        ca, cb = up[2 * y1:2 * y2, 2 * x1:2 * x2], out[2 * y1:2 * y2, 2 * x1:2 * x2]
        s = 360 / ca.shape[0]
        ca = cv2.resize(ca, (round(ca.shape[1] * s), 360)); cb = cv2.resize(cb, (ca.shape[1], 360))
        rows.append(np.hstack([ca, np.full((360, 6, 3), 255, np.uint8), cb]))
    if rows:
        wmax = max(r.shape[1] for r in rows)
        rows = [np.hstack([r, np.full((360, wmax - r.shape[1], 3), 255, np.uint8)]) for r in rows]
        zoom = np.vstack(sum([[r, np.full((6, wmax, 3), 255, np.uint8)] for r in rows], [])[:-1])
        open(f'{OUT}/pyz_{tid}.b64', 'w').write(base64.b64encode(jpg(zoom, 82)).decode())
    log('SHEET', tid, 'faces', len(hp.det_faces))
    if info['gray']:  # oq-qora — rangli qilib ham sinaymiz
        t = time.time()
        oc, ic = E.enhance(img, 0.7, True)
        log('COLOR', tid, round(time.time() - t, 1), 's', ic)
        b = cv2.resize(oc, (a.shape[1], H))
        open(f'{OUT}/pyc_{tid}.b64', 'w').write(base64.b64encode(jpg(np.hstack([a, np.full((H, 8, 3), 255, np.uint8), b]), 78)).decode())
log('DONE', round(time.time() - t0, 1), 's')
