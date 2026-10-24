# Rasm sifatini oshirish serveri (Oracle Cloud — bepul)

Real-ESRGAN (tiniqlashtirish) + CodeFormer (yuzlarni tiklash, o'xshashlik 0.7). Faqat protsessorda ishlaydi:
bitta rasm ~20–60 soniya. Oracle Free Tier: 4 yadro, 24 GB xotira — muddatsiz bepul.

## 1. Oracle hisobi
1. https://signup.cloud.oracle.com — ro'yxatdan o'ting (karta so'raladi, pul yechilmaydi; «Always Free»).
2. Home region — yaqin va kam band hudud (masalan, Germany Frankfurt yoki UK London). Keyin o'zgartirib bo'lmaydi.

## 2. Server yaratish
1. ☰ → Compute → Instances → **Create instance**.
2. Image: **Ubuntu 22.04**. Shape: **Ampere → VM.Standard.A1.Flex**, **4 OCPU, 24 GB**.
   («Out of capacity» desa — boshqa «Availability domain»ni tanlang yoki birozdan keyin urinib ko'ring.)
3. Networking: «Assign a public IPv4 address» — yoqilgan.
4. SSH keys: **Generate a key pair** → «Save private key» (faylni saqlab qo'ying).
5. **Create**. Bir-ikki daqiqada «Running» bo'ladi, «Public IP address»ni yozib oling.

## 3. 80 va 443 portlarni ochish
Instance sahifasi → Primary VNIC → Subnet → Security List → **Add Ingress Rules**:
Source CIDR `0.0.0.0/0`, TCP, Destination port `80`; yana bittasi — `443`.

## 4. O'rnatish (bitta buyruq)
Oracle sahifasining yuqorisidagi **Cloud Shell** (>_ belgisi) ni oching, saqlangan kalit faylini yuklang (⚙ → Upload), so'ng:
```
chmod 600 ssh-key-*.key
ssh -i ssh-key-*.key ubuntu@SERVER_IP
curl -fsSL https://raw.githubusercontent.com/SherzodSafar/Factfoodbot/shajara-main/shajara/enhance-server/install.sh | bash
```
15–25 daqiqa davom etadi. Oxirida chiqadigan ikki qatorni (`ENHANCE_URL=...`, `ENHANCE_KEY=...`) Claude'ga yuboring.
