import os, sys
from huggingface_hub import HfApi
api = HfApi(token=os.environ['HF_TOKEN'])
user = api.whoami()['name']
repo = f"{user}/shajara-enhance"
api.create_repo(repo, repo_type='space', space_sdk='docker', exist_ok=True)
api.add_space_secret(repo, 'ENHANCE_KEY', os.environ['ENHANCE_KEY'])
api.upload_folder(folder_path='space', repo_id=repo, repo_type='space', commit_message='Shajara enhance server')
print('REPO', repo)
print('URL', f"https://{user.lower().replace('_','-')}-shajara-enhance.hf.space")
