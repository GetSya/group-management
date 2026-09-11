async function helpCommand(ctx) {
  const text = `📖 <b>Available Bot Commands:</b>

<b>Admin Commands:</b>
• <code>/settings</code> - Open main settings dashboard
• <code>/warn [reply|@user] [reason]</code> - Warn a member
• <code>/warns [reply|@user]</code> - Check member warning count
• <code>/resetwarns [reply|@user]</code> - Reset member warnings
• <code>/block @username</code> - Block a user/username
• <code>/blockword keyword</code> - Blacklist a specific word
• <code>/blockdomain domain.com</code> - Block a domain link
• <code>/tagadmins [message]</code> - Mention all group administrators
• <code>/backup [create|list|info|send|export]</code> - Create & manage db.json backups
• <code>/restore [filename]</code> - Restore db.json (or reply to a .json file)
 • <code>/close</code> / <code>/tutup</code> - Tutup grup (hanya admin bisa chat)
 • <code>/open</code> / <code>/buka</code> - Buka grup kembali
 • <code>/lockstatus</code> - Cek apakah grup sedang tutup/buka
 • <code>/kick [reply|@user|id] [alasan]</code> - Kick member (bisa join lagi via link)
 • <code>/add [reply|@user|id]</code> - Unban + kirim link undangan (Bot API tidak bisa add paksa)
 • <code>/promote [reply|@user] [title]</code> - Angkat member jadi admin
 • <code>/demote [reply|@user]</code> - Turunkan admin jadi member
 • <code>/cekwelcome</code> - Diagnosa kenapa welcome diam di grup ini

<b>General Commands:</b>
• <code>/rules</code> - View current group regulations
• <code>/admin [reason]</code> - Alert group admins about an issue
• <code>/info [reply|@user|id]</code> - Lihat informasi pengguna
• <code>/help</code> - Show this command list`;

  return ctx.reply(text, { parse_mode: 'HTML' });
}

module.exports = helpCommand;
