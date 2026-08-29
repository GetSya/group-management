/**
 * Helper for safe string interpolation and user mentions
 */
function interpolate(template, data = {}) {
  if (!template || typeof template !== 'string') return '';
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return data[key] !== undefined ? String(data[key]) : match;
  });
}

function getUserMention(user, asHtml = true) {
  if (!user) return 'User';
  const name = user.first_name || user.username || 'User';
  const escapedName = escapeHtml(name);
  if (asHtml && user.id) {
    return `<a href="tg://user?id=${user.id}">${escapedName}</a>`;
  }
  return escapedName;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  interpolate,
  getUserMention,
  escapeHtml,
};
