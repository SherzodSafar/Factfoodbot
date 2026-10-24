# DDColor — oq-qora rasmga tabiiy rang (CPU). Rasmning yorug'ligi (detallar) o'zgarmaydi, faqat rang qo'shiladi.
import os
import subprocess
import sys


def load(root):
    if not os.path.isdir(root):
        subprocess.run(['git', 'clone', '--depth', '1', 'https://github.com/piddnad/DDColor.git', root], check=True)
    if root not in sys.path:
        sys.path.append(root)  # oxiriga: CodeFormer'ning basicsr paketi ustun qolsin
    import torch
    from huggingface_hub import PyTorchModelHubMixin
    from ddcolor import ColorizationPipeline, DDColor

    class DDColorHF(DDColor, PyTorchModelHubMixin):
        def __init__(self, config=None, **kwargs):
            if isinstance(config, dict):
                kwargs = {**config, **kwargs}
            super().__init__(**kwargs)

    name = os.environ.get('DDCOLOR_MODEL', 'ddcolor_modelscope')
    model = DDColorHF.from_pretrained(f'piddnad/{name}').to('cpu').eval()
    pipe = ColorizationPipeline(model, input_size=512, device=torch.device('cpu'))
    return pipe.process
