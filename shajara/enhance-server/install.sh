#!/usr/bin/env bash
# Oracle Cloud (Ubuntu 22.04/24.04, Ampere A1 yoki x86) — bir buyruq bilan o'rnatish:
#   curl -fsSL https://raw.githubusercontent.com/SherzodSafar/Factfoodbot/shajara-main/shajara/enhance-server/install.sh | bash
set -e
KEY=${ENHANCE_KEY:-$(head -c 24 /dev/urandom | base64 | tr -dc A-Za-z0-9 | head -c 32)}
IP=$(curl -fsS https://api.ipify.org)
sudo apt-get update -y
sudo apt-get install -y git python3-venv python3-dev build-essential libgl1 libglib2.0-0 wget debian-keyring debian-archive-keyring apt-transport-https
# 1) CodeFormer (ichida Real-ESRGAN ham bor)
cd ~
[ -d CodeFormer ] || git clone --depth 1 https://github.com/sczhou/CodeFormer.git
cd CodeFormer
python3 -m venv ~/enh-venv
source ~/enh-venv/bin/activate
pip install --upgrade pip wheel
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
pip install fastapi 'uvicorn[standard]'
python basicsr/setup.py develop
# yangi torchvision bilan mos kelmaydigan importni tuzatish
grep -rl "torchvision.transforms.functional_tensor" basicsr ~/enh-venv/lib/python3*/site-packages 2>/dev/null | xargs -r sed -i 's/torchvision.transforms.functional_tensor/torchvision.transforms.functional/'
python scripts/download_pretrained_models.py facelib
python scripts/download_pretrained_models.py CodeFormer
mkdir -p weights/realesrgan
[ -f weights/realesrgan/RealESRGAN_x2plus.pth ] || wget -q -O weights/realesrgan/RealESRGAN_x2plus.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth
curl -fsSL -o ~/enh_server.py https://raw.githubusercontent.com/SherzodSafar/Factfoodbot/shajara-main/shajara/enhance-server/server.py
# 2) doimiy xizmat (qayta yoqilganda ham ishlaydi)
sudo tee /etc/systemd/system/enhance.service >/dev/null <<UNIT
[Unit]
Description=Shajara enhance
After=network.target
[Service]
User=$USER
Environment=ENHANCE_KEY=$KEY
Environment=CODEFORMER_DIR=$HOME/CodeFormer
WorkingDirectory=$HOME
ExecStart=$HOME/enh-venv/bin/uvicorn enh_server:app --host 127.0.0.1 --port 8080 --app-dir $HOME
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now enhance
# 3) HTTPS (Caddy + bepul sertifikat, domen: <IP>.sslip.io)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -y && sudo apt-get install -y caddy
echo "$IP.sslip.io {
  reverse_proxy 127.0.0.1:8080
}" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl restart caddy
# Oracle'ning ichki fayervoli: 80 va 443 portlarni ochish
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true
echo
echo "================ TAYYOR ================"
echo "ENHANCE_URL=https://$IP.sslip.io"
echo "ENHANCE_KEY=$KEY"
echo "Shu ikki qatorni nusxalab, Claude'ga yuboring."
echo "========================================"
