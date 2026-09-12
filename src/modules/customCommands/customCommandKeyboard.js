const { Markup } = require('telegraf');

const BUTTONS_COLS = 2;
const BUTTONS_ROWS = 5;
const BUTTONS_PER_PAGE = BUTTONS_COLS * BUTTONS_ROWS; // 10

/**
 * Flatten 2D button storage [[btn],[btn]] -> [btn, btn, ...]
 * Preserves creation order.
 */
function flattenButtons(buttons) {
  const flat = [];
  if (!buttons || !Array.isArray(buttons)) return flat;
  for (const row of buttons) {
    if (!Array.isArray(row)) continue;
    for (const btn of row) {
      if (btn && btn.text) flat.push(btn);
    }
  }
  return flat;
}

function toTelegramButton(btn) {
  if (btn.type === 'url' && btn.url) {
    return Markup.button.url(btn.text, btn.url);
  }
  // All non-URL buttons trigger customcmd callback by button ID
  return Markup.button.callback(btn.text, `customcmd:button:${btn.id}`);
}

/**
 * Builds Telegraf InlineKeyboard from custom command button structure
 * Layout: 5 rows x 2 cols (10 buttons per page). Extra pages via nav row.
 *
 * @param {Array<Array<object>>} buttons 2D array of button definitions
 * @param {number} page 1-indexed page number
 * @param {string|null} commandName required for pagination callbacks (customcmd:cpage:<cmd>:<page>)
 * @param {number} perPage buttons per page (default 10)
 * @returns {object|null} Telegraf InlineKeyboardMarkup or null
 */
function buildCustomKeyboard(buttons, page = 1, commandName = null, perPage = BUTTONS_PER_PAGE) {
  const flat = flattenButtons(buttons);
  if (flat.length === 0) {
    return null;
  }

  const per = Math.max(1, parseInt(perPage, 10) || BUTTONS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(flat.length / per));
  const p = Math.max(1, Math.min(totalPages, parseInt(page, 10) || 1));
  const slice = flat.slice((p - 1) * per, p * per);

  const rows = [];
  for (let i = 0; i < slice.length; i += BUTTONS_COLS) {
    const chunk = slice.slice(i, i + BUTTONS_COLS);
    rows.push(chunk.map(toTelegramButton));
  }

  // Pagination nav (only when we know the command name for callbacks)
  if (totalPages > 1 && commandName) {
    const navRow = [];
    if (p > 1) navRow.push(Markup.button.callback('⬅️ Prev', `customcmd:cpage:${commandName}:${p - 1}`));
    navRow.push(Markup.button.callback(`📄 ${p}/${totalPages}`, `customcmd:cpage:${commandName}:${p}`));
    if (p < totalPages) navRow.push(Markup.button.callback('Next ➡️', `customcmd:cpage:${commandName}:${p + 1}`));
    rows.push(navRow);
  }

  return rows.length > 0 ? Markup.inlineKeyboard(rows) : null;
}

module.exports = {
  buildCustomKeyboard,
  flattenButtons,
  BUTTONS_COLS,
  BUTTONS_ROWS,
  BUTTONS_PER_PAGE,
};
