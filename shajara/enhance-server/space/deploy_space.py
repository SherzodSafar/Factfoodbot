# Xususiy HF Space yaratish/yangilash: HF_TOKEN=hf_... python deploy_space.py
# Natija: HF_SPACE manzili (Vercel env'ga qo'yiladi). Space bepul CPU'da (cpu-basic) ishlaydi.
import json, os, time, urllib.request
from huggingface_hub import HfApi

TOKEN = os.environ['HF_TOKEN']
api = HfApi(token=TOKEN)
user = api.whoami()['name']
repo = f"{user}/{os.environ.get('SPACE_NAME', 'shajara-enhance')}"
api.create_repo(repo, repo_type='space', space_sdk='gradio', private=True, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
api.upload_folder(folder_path=here, repo_id=repo, repo_type='space', commit_message='Shajara enhance',
                  allow_patterns=['app.py', 'enhance_core.py', 'ddcolor_run.py', 'requirements.txt', 'README.md'])
info = lambda: json.loads(urllib.request.urlopen(urllib.request.Request(
    f'https://huggingface.co/api/spaces/{repo}', headers={'authorization': f'Bearer {TOKEN}'}), timeout=30).read())
print('REPO', repo, 'HOST', info().get('host'), flush=True)
for _ in range(120):  # 30 daqiqagacha kutamiz (birinchi build ~10-20 daqiqa)
    st = (info().get('runtime') or {}).get('stage')
    print('STAGE', st, flush=True)
    if st in ('RUNNING', 'BUILD_ERROR', 'RUNTIME_ERROR', 'CONFIG_ERROR'):
        break
    time.sleep(15)
