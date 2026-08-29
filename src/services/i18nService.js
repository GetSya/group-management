const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

class I18nService {
  constructor() {
    this.locales = {};
    this.defaultLocale = 'en';
    this.loadLocales();
  }

  loadLocales() {
    const localesDir = path.join(process.cwd(), 'locales');
    try {
      const files = fs.readdirSync(localesDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const lang = file.replace('.json', '');
          const content = fs.readFileSync(path.join(localesDir, file), 'utf-8');
          this.locales[lang] = JSON.parse(content);
        }
      }
      logger.info({ languages: Object.keys(this.locales) }, 'Loaded localization files');
    } catch (error) {
      logger.error({ error }, 'Failed to load localization files');
    }
  }

  t(lang = 'en', keyPath = '', variables = {}) {
    const targetLang = this.locales[lang] ? lang : this.defaultLocale;
    const keys = keyPath.split('.');
    let value = this.locales[targetLang];

    for (const key of keys) {
      if (value && value[key] !== undefined) {
        value = value[key];
      } else {
        // Fallback to default language
        value = this.getFallback(keys);
        break;
      }
    }

    if (typeof value !== 'string') {
      return keyPath;
    }

    return value.replace(/\{(\w+)\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  getFallback(keys) {
    let value = this.locales[this.defaultLocale];
    for (const key of keys) {
      if (value && value[key] !== undefined) {
        value = value[key];
      } else {
        return null;
      }
    }
    return value;
  }
}

module.exports = new I18nService();
