/**
 * Helpers to verify Telegram bot and user administrative permissions
 */
async function isAdmin(telegram, chatId, userId) {
  try {
    const member = await telegram.getChatMember(chatId, userId);
    return member.status === 'creator' || member.status === 'administrator';
  } catch {
    return false;
  }
}

async function isOwner(telegram, chatId, userId) {
  try {
    const member = await telegram.getChatMember(chatId, userId);
    return member.status === 'creator';
  } catch {
    return false;
  }
}

async function checkBotPermissions(telegram, chatId) {
  try {
    const me = await telegram.getMe();
    const botMember = await telegram.getChatMember(chatId, me.id);
    if (botMember.status !== 'administrator') {
      return {
        isAdmin: false,
        canDeleteMessages: false,
        canRestrictMembers: false,
        canPinMessages: false,
        canInviteUsers: false,
      };
    }
    return {
      isAdmin: true,
      canDeleteMessages: botMember.can_delete_messages || false,
      canRestrictMembers: botMember.can_restrict_members || false,
      canPinMessages: botMember.can_pin_messages || false,
      canInviteUsers: botMember.can_invite_users || false,
    };
  } catch {
    return {
      isAdmin: false,
      canDeleteMessages: false,
      canRestrictMembers: false,
      canPinMessages: false,
      canInviteUsers: false,
    };
  }
}

module.exports = {
  isAdmin,
  isOwner,
  checkBotPermissions,
};
