const { v4: uuidv4 } = require('uuid');
const db = require('../../database/database');
const logger = require('../../config/logger');

class CustomCommandRepository {
  getGroupCommands(chatId) {
    const cid = String(chatId);
    const all = db.get('customCommands') || {};
    return all[cid] || {};
  }

  findAll(chatId) {
    const cmds = this.getGroupCommands(chatId);
    return Object.values(cmds);
  }

  findByName(chatId, name) {
    if (!name) return null;
    const clean = name.toLowerCase().trim();
    const cmds = this.getGroupCommands(chatId);

    // Direct match
    if (cmds[clean]) return cmds[clean];

    // Alias match
    for (const cmd of Object.values(cmds)) {
      if (cmd.aliases && Array.isArray(cmd.aliases)) {
        if (cmd.aliases.map(a => a.toLowerCase()).includes(clean)) {
          return cmd;
        }
      }
    }

    return null;
  }

  create(chatId, commandData) {
    const cid = String(chatId);
    const name = commandData.name.toLowerCase().trim();
    const all = db.get('customCommands') || {};

    if (!all[cid]) {
      all[cid] = {};
    }

    const newCmd = {
      id: `cmd_${uuidv4().slice(0, 8)}`,
      name,
      aliases: commandData.aliases || [],
      enabled: commandData.enabled !== undefined ? commandData.enabled : true,
      permission: commandData.permission || 'everyone', // 'everyone' | 'admin'
      parseMode: commandData.parseMode || 'HTML',
      response: commandData.response || '',
      buttons: commandData.buttons || [],
      cooldown: commandData.cooldown || 3,
      deleteTrigger: commandData.deleteTrigger || false,
      deleteResponseAfter: commandData.deleteResponseAfter || null,
      createdBy: String(commandData.createdBy || 'system'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    all[cid][name] = newCmd;
    db.set('customCommands', cid, all[cid], true);

    logger.info({ chatId: cid, command: name }, 'Custom command created');
    return newCmd;
  }

  update(chatId, name, updater) {
    const cid = String(chatId);
    const clean = name.toLowerCase().trim();
    const all = db.get('customCommands') || {};

    if (!all[cid] || !all[cid][clean]) {
      return null;
    }

    const current = all[cid][clean];
    const updated = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
    updated.updatedAt = new Date().toISOString();

    all[cid][clean] = updated;
    db.set('customCommands', cid, all[cid], true);

    logger.info({ chatId: cid, command: clean }, 'Custom command updated');
    return updated;
  }

  delete(chatId, name) {
    const cid = String(chatId);
    const clean = name.toLowerCase().trim();
    const all = db.get('customCommands') || {};

    if (all[cid] && all[cid][clean]) {
      delete all[cid][clean];
      db.set('customCommands', cid, all[cid], true);
      logger.info({ chatId: cid, command: clean }, 'Custom command deleted');
      return true;
    }

    return false;
  }

  toggle(chatId, name) {
    const cmd = this.findByName(chatId, name);
    if (!cmd) return null;
    return this.update(chatId, name, { enabled: !cmd.enabled });
  }

  addButton(chatId, commandName, button, rowIndex = null) {
    const cmd = this.findByName(chatId, commandName);
    if (!cmd) return null;

    const newBtn = {
      id: `btn_${uuidv4().slice(0, 8)}`,
      text: button.text,
      type: button.type, // 'command' | 'url' | 'response' | 'callback'
      action: button.action || {},
      url: button.url || null,
      response: button.response || null,
    };

    const buttons = [...(cmd.buttons || [])];

    if (rowIndex !== null && rowIndex >= 0 && rowIndex < buttons.length) {
      buttons[rowIndex].push(newBtn);
    } else {
      // New row
      buttons.push([newBtn]);
    }

    return this.update(chatId, commandName, { buttons });
  }

  deleteButton(chatId, commandName, buttonId) {
    const cmd = this.findByName(chatId, commandName);
    if (!cmd || !cmd.buttons) return null;

    const updatedRows = [];
    for (const row of cmd.buttons) {
      const filtered = row.filter(b => b.id !== buttonId);
      if (filtered.length > 0) {
        updatedRows.push(filtered);
      }
    }

    return this.update(chatId, commandName, { buttons: updatedRows });
  }

  recordUsage(chatId, commandName) {
    const cid = String(chatId);
    const clean = commandName.toLowerCase().trim();
    const stats = db.get('statistics') || {};

    if (!stats[cid]) stats[cid] = {};
    if (!stats[cid].customCommands) stats[cid].customCommands = {};
    if (!stats[cid].customCommands[clean]) {
      stats[cid].customCommands[clean] = { uses: 0, lastUsedAt: null };
    }

    stats[cid].customCommands[clean].uses += 1;
    stats[cid].customCommands[clean].lastUsedAt = new Date().toISOString();

    db.set('statistics', cid, stats[cid], false);
  }
}

module.exports = new CustomCommandRepository();
