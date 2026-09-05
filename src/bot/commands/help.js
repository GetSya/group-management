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

<b>General Commands:</b>
• <code>/rules</code> - View current group regulations
• <code>/admin [reason]</code> - Alert group admins about an issue
• <code>/help</code> - Show this command list`;

  return ctx.reply(text, { parse_mode: 'HTML' });
}

module.exports = helpCommand;
