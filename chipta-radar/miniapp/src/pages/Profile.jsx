/**
 * Profil: statistika, sozlamalar, qo'llanma va savollar.
 */
import { useEffect, useState } from 'react';
import { SwitchRow } from '../components/ui.jsx';
import { useApp } from '../context/AppContext.jsx';
import api from '../lib/api.js';
import { openLink } from '../lib/telegram.js';
import { save, KEYS } from '../lib/storage.js';
import { BOT_LINK, BUY_URL } from '../config.js';

const FAQ = [
  {
    q: 'Bot chipta sotadimi?',
    a: 'Yo\'q. Bot bo\'sh joylarni topadi va darhol xabar beradi. Chiptani rasmiy eticket.railway.uz saytida o\'zingiz sotib olasiz — xabardagi tugma sizni to\'g\'ri o\'sha yerga olib boradi.',
  },
  {
    q: 'Ma\'lumotlar qanchalik aniq?',
    a: 'Barcha ma\'lumotlar (poyezdlar, vagonlar, joy raqamlari, narxlar) eticket.railway.uz dan real vaqtda olinadi. Joylar juda tez sotiladi, shuning uchun xabar kelganda imkon qadar tezroq harakat qiling.',
  },
  {
    q: 'Kuzatuv qancha tez-tez tekshiriladi?',
    a: 'Har bir faol kuzatuv taxminan har daqiqada tekshiriladi. Kimdir chiptasini qaytarsa yoki yangi vagon qo\'shilsa — bir necha daqiqa ichida bilasiz.',
  },
  {
    q: 'To\'rttalik va bokovoy nima?',
    a: 'Plaskartli vagonda to\'rttalik — 4 o\'rinli asosiy bo\'lim (pastki va yuqori o\'rinlar). Bokovoy — yo\'lak bo\'ylab joylashgan yon o\'rinlar (37–54). Kupe vagonda hamma o\'rinlar yopiq 4 kishilik kupelarda.',
  },
  {
    q: '"Hammasi bitta joyda" nimani bildiradi?',
    a: 'Barcha chiptalar bitta kupe yoki bo\'limda bo\'lishini kuzatamiz. Odamlar soni bo\'lim sig\'imidan ko\'p bo\'lsa — yonma-yon bo\'limlarda.',
  },
];

export default function Profile() {
  const { user, boot, showToast } = useApp();
  const [stats, setStats] = useState(null);
  const [quietNight, setQuietNight] = useState(Boolean(user?.quietNight));
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.profile().then((data) => setStats(data.stats)).catch(() => {});
  }, []);

  const toggleQuiet = async (value) => {
    setQuietNight(value);
    try {
      await api.updateProfile({ quietNight: value });
      showToast(value ? '🌙 Tunda xabarlar ovozsiz keladi' : '🔔 Xabarlar doim ovozli', 'success');
    } catch (error) {
      setQuietNight(!value);
      showToast(error.message, 'error');
    }
  };

  const initial = (user?.firstName || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="page">
      <div className="profile-head">
        <span className="avatar">{initial}</span>
        <div>
          <h2>
            {user?.firstName} {user?.lastName || ''}
          </h2>
          <p className="muted small">{user?.username ? `@${user.username}` : boot?.appName}</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat">
          <b>{stats?.active ?? '—'}</b>
          <span>Faol kuzatuv</span>
        </div>
        <div className="stat">
          <b>{stats?.notifications ?? '—'}</b>
          <span>Topilgan joy xabarlari</span>
        </div>
        <div className="stat">
          <b>{stats?.found ?? '—'}</b>
          <span>Olingan chiptalar</span>
        </div>
        <div className="stat">
          <b>{stats?.searches ?? '—'}</b>
          <span>Qidiruvlar</span>
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h3>Sozlamalar</h3>
        </div>
        <SwitchRow
          title="🌙 Tungi ovozsiz rejim"
          hint="23:00–07:00 oralig'ida xabarlar ovozsiz keladi"
          checked={quietNight}
          onChange={toggleQuiet}
        />
      </div>

      <div className="section">
        <div className="section__head">
          <h3>Qanday ishlaydi?</h3>
        </div>
        <div className="modes">
          <div className="mode-card">
            <span className="mode-card__icon mode-card__icon--green">🔍</span>
            <span className="grow">
              <h4>1. Hozir bor joylar</h4>
              <p>Yo'nalish va sanani tanlang — barcha poyezdlar, vagonlar, bo'sh joylar xaritasi va narxlar.</p>
            </span>
          </div>
          <div className="mode-card">
            <span className="mode-card__icon mode-card__icon--blue">🔔</span>
            <span className="grow">
              <h4>2. Joy chiqsa xabar ber</h4>
              <p>Kun, vagon turi va chiptalar soni — joy paydo bo'lishi bilan botda xabar keladi.</p>
            </span>
          </div>
          <div className="mode-card">
            <span className="mode-card__icon mode-card__icon--amber">🎯</span>
            <span className="grow">
              <h4>3. Aniq joy buyurtmasi</h4>
              <p>To'rttalik yoki bokovoy, pastki yoki yuqori, hammasi bitta joyda — aynan shuni kuzatamiz.</p>
            </span>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h3>Savollar</h3>
        </div>
        {FAQ.map((item, index) => (
          <div className="faq" key={item.q}>
            <button type="button" onClick={() => setOpen(open === index ? null : index)}>
              {item.q}
              <span className="muted">{open === index ? '−' : '+'}</span>
            </button>
            {open === index && <p>{item.a}</p>}
          </div>
        ))}
      </div>

      <div className="section">
        <button type="button" className="btn btn--ghost btn--block" onClick={() => openLink(BUY_URL)}>
          🌐 eticket.railway.uz saytini ochish
        </button>
        <button type="button" className="btn btn--ghost btn--block mt-8" onClick={() => openLink(BOT_LINK)}>
          🤖 Botga o'tish
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--block mt-8"
          onClick={() => {
            save(KEYS.onboarded, false);
            window.location.reload();
          }}
        >
          👋 Tanishuvni qayta ko'rish
        </button>
      </div>

      <p className="muted small center mt-24">{boot?.appName || 'Chipta Radar'} · ma'lumotlar eticket.railway.uz dan</p>
    </div>
  );
}
