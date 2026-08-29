/**
 * Utility to parse structured callback queries
 * Example format: "module:action:param1:param2"
 */
function parseCallback(data) {
  if (!data || typeof data !== 'string') {
    return { module: '', action: '', params: [] };
  }

  const parts = data.split(':');
  const module = parts[0] || '';
  const action = parts[1] || '';
  const params = parts.slice(2);

  return {
    raw: data,
    module,
    action,
    params,
  };
}

module.exports = {
  parseCallback,
};
