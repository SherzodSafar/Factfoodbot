# DDColor — oq-qora rasmga tabiiy rang (CPU). Rasmning yorug'ligi (detallar) o'zgarmaydi, faqat rang qo'shiladi.
import os
import shutil
import subprocess
import sys


def load(root, cf_root):
    if not os.path.isdir(root):
        subprocess.run(['git', 'clone', '--depth', '1', 'https://github.com/piddnad/DDColor.git', root], check=True)
    # DDColor modeli basicsr.archs.ddcolor_arch_utils ni import qiladi — xotirada esa CodeFormer'ning basicsr'i.
    # Bu papka mustaqil (faqat torch), shuning uchun uni CodeFormer'ning basicsr/archs ichiga nusxalaymiz.
    shutil.copytree(os.path.join(root, 'basicsr', 'archs', 'ddcolor_arch_utils'),
                    os.path.join(cf_root, 'basicsr', 'archs', 'ddcolor_arch_utils'), dirs_exist_ok=True)
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
