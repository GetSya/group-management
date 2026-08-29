const { Markup } = require('telegraf');

/**
 * Builds Telegraf InlineKeyboard from custom command button structure
 * @param {Array<Array<object>>} buttons 2D array of button definitions
 * @returns {object|null} Telegraf InlineKeyboardMarkup or null
 */
function buildCustomKeyboard(buttons) {
  if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
    return null;
  }

  const rows = [];

  for (const row of buttons) {
    if (!Array.isArray(row) || row.length === 0) continue;

    const rowButtons = [];
    for (const btn of row) {
      if (!btn || !btn.text) continue;

      if (btn.type === 'url' && btn.url) {
        rowButtons.push(Markup.button.url(btn.text, btn.url));
      } else {
        // All non-URL buttons trigger customcmd callback by button ID
        rowButtons.push(Markup.button.callback(btn.text, `customcmd:button:${btn.id}`));
      }
    }

    if (rowButtons.length > 0) {
      rows.push(rowButtons);
    }
  }

  return rows.length > 0 ? Markup.inlineKeyboard(rows) : null;
}

module.exports = {
  buildCustomKeyboard,
};
