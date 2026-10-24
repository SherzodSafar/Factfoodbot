# Shajara AI — rasm sifatini ASL HOLICHA oshirish (Hugging Face Space, CPU, bepul).
# API: /enhance(image, fidelity=0.7, color=False) -> (rasm, info). Ilova (Vercel) HF_TOKEN bilan chaqiradi.
import tempfile

import cv2
import gradio as gr

import enhance_core as E


def enhance(image, fidelity=0.7, color=False):
    img = cv2.imread(image, cv2.IMREAD_COLOR)
    if img is None:
        raise gr.Error('Rasm o‘qilmadi')
    out, info = E.enhance(img, float(fidelity), bool(color))
    path = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False).name
    cv2.imwrite(path, out, [cv2.IMWRITE_JPEG_QUALITY, 93])
    return path, info


demo = gr.Interface(
    fn=enhance,
    inputs=[gr.Image(type='filepath', label='Rasm'),
            gr.Slider(0, 1, value=0.7, step=0.05, label='O‘xshashlik (1 — aslga eng yaqin)'),
            gr.Checkbox(False, label='Oq-qora rasmni rangli qilish')],
    outputs=[gr.Image(type='filepath', label='Natija'), gr.JSON(label='Ma’lumot')],
    title='Shajara — rasm sifati',
    description='Real-ESRGAN (butun rasm 2×) + CodeFormer (yuzlar, o‘xshashlik ustun) + DDColor (ixtiyoriy rang).',
    api_name='enhance',
    concurrency_limit=1,
    flagging_mode='never',
)
demo.queue(max_size=20).launch()
