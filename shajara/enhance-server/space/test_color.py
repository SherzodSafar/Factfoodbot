# Sinov: tayyor (tiklangan) oq-qora natijaga DDColor bilan rang berish
import base64, sys, time
sys.path.insert(0, '/tmp/space')
import cv2, numpy as np
import enhance_core as E
src = cv2.imread(sys.argv[1])
t = time.time()
oc = E.colorize(src)
print('COLOR', round(time.time() - t, 1), 's', oc.shape, flush=True)
H = 700
a = cv2.resize(src, (round(src.shape[1] * H / src.shape[0]), H)); b = cv2.resize(oc, (a.shape[1], H))
sheet = np.hstack([a, np.full((H, 8, 3), 255, np.uint8), b])
open(sys.argv[2], 'w').write(base64.b64encode(cv2.imencode('.jpg', sheet, [cv2.IMWRITE_JPEG_QUALITY, 78])[1].tobytes()).decode())
