/**
 * Bot va sozlamalar holatini tekshirish:  npm run bot:info
 */
import 'dotenv/config';

const token = process.env.BOT_TOKEN;

async function call(method) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`);
  return response.json();
}

async function main() {
  if (!token) {
    console.error('\n❌ .env faylida BOT_TOKEN yo\'q.\n');
    process.exit(1);
  }

  const me = await call('getMe');
  if (!me.ok) {
    console.error(`\n❌ Token noto'g'ri: ${me.description}\n`);
    process.exit(1);
  }

  const menu = await call('getChatMenuButton');

  console.log('\n🤖 Bot ma\'lumotlari');
  console.log(`   Nomi:      ${me.result.first_name}`);
  console.log(`   Username:  @${me.result.username}`);
  console.log(`   ID:        ${me.result.id}`);
  console.log(`\n📱 Mini App`);
  console.log(`   .env WEBAPP_URL:  ${process.env.WEBAPP_URL || '(bo\'sh)'}`);
  console.log(`   Menu tugmasi:     ${menu.result?.web_app?.url || menu.result?.type || '(sozlanmagan)'}`);
  console.log('');
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}\n`);
  process.exit(1);
});
