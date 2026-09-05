/**
 * Menerjemahkan error pengiriman Telegram menjadi pesan Indonesia yang actionable.
 * Kasus paling umum: bot tidak bisa memulai percakapan dengan user yang belum /start.
 */
function describeSendError(err) {
  const raw = String(err?.response?.description || err?.message || err || '');
  const low = raw.toLowerCase();

  if (low.includes('chat not found')) {
    return (
      '❌ <b>Chat tidak ditemukan (chat not found).</b>\n\n' +
      'Bot tidak bisa mengirim ke target ini. Penyebab paling umum:\n' +
      '1️⃣ User tersebut <b>belum pernah /start bot di private chat</b> (wajib — bot tidak bisa memulai duluan)\n' +
      '2️⃣ Username salah ketik / akun sudah tidak ada\n' +
      '3️⃣ Target adalah user yang hanya dikenal via username tapi belum pernah kontak bot\n\n' +
      '✅ <b>Solusi:</b> user target buka bot di private chat → tekan <b>START</b> → ulangi kirim.'
    );
  }
  if (low.includes("can't initiate conversation") || low.includes('cannot initiate conversation')) {
    return (
      '❌ <b>Bot tidak bisa memulai percakapan.</b>\n\n' +
      'User target belum pernah menekan <b>START</b> di private chat bot. Minta user tersebut buka bot dan tekan START dulu.'
    );
  }
  if (low.includes('bot was blocked by the user') || low.includes('blocked')) {
    return '❌ <b>Bot diblokir oleh user target.</b>\nMinta user membuka blokir bot, lalu tekan START lagi.';
  }
  if (low.includes('user is deactivated') || low.includes('account deleted')) {
    return '❌ <b>Akun target sudah dinonaktifkan/dihapus.</b> Gunakan target lain.';
  }
  if (low.includes('have no rights to send a message') || low.includes('not enough rights')) {
    return '❌ <b>Bot tidak punya hak kirim ke target.</b> Jika target grup/channel, jadikan bot admin / beri izin kirim pesan.';
  }
  if (low.includes('group chat was upgraded') || low.includes('migrated')) {
    return '❌ <b>Grup sudah di-upgrade ke supergroup</b> sehingga ID berubah. Atur ulang target dengan ID baru.';
  }

  return `❌ Gagal mengirim: <code>${raw.slice(0, 300)}</code>`;
}

module.exports = {
  describeSendError,
};
