const mediaModule = require('./media');
const regulationModule = require('./regulation');
const antispamModule = require('./antispam');
const antifloodModule = require('./antiflood');
const welcomeModule = require('./welcome');
const goodbyeModule = require('./goodbye');
const alphabetsModule = require('./alphabets');
const captchaModule = require('./captcha');
const checksModule = require('./checks');
const adminMentionModule = require('./adminMention');
const blocksModule = require('./blocks');
const pornModule = require('./porn');
const warnsModule = require('./warns');
const nightModule = require('./night');
const tagModule = require('./tag');
const linkModule = require('./link');
const guardianModule = require('./guardian');
const approvalModule = require('./approval');
const deletingMessagesModule = require('./deletingMessages');
const antiDeleteModule = require('./antiDelete');
const groupLockModule = require('./groupLock');
const langModule = require('./lang');
const otherModule = require('./other');
const customCommandsModule = require('./customCommands');
const backupModule = require('./backup');

class SettingsRegistry {
  constructor() {
    this.modules = new Map();
    this.registerModules();
  }

  register(module) {
    this.modules.set(module.key, module);
  }

  get(moduleKey) {
    return this.modules.get(moduleKey);
  }

  has(moduleKey) {
    return this.modules.has(moduleKey);
  }

  registerModules() {
    this.register(mediaModule);
    this.register(regulationModule);
    this.register(antispamModule);
    this.register(antifloodModule);
    this.register(welcomeModule);
    this.register(goodbyeModule);
    this.register(alphabetsModule);
    this.register(captchaModule);
    this.register(checksModule);
    this.register(adminMentionModule);
    this.register(blocksModule);
    this.register(pornModule);
    this.register(warnsModule);
    this.register(nightModule);
    this.register(tagModule);
    this.register(linkModule);
    this.register(guardianModule);
    this.register(approvalModule);
    this.register(deletingMessagesModule);
    this.register(antiDeleteModule);
    this.register(groupLockModule);
    this.register(langModule);
    this.register(otherModule);
    this.register(customCommandsModule);
    this.register(backupModule);
  }
}

module.exports = new SettingsRegistry();
