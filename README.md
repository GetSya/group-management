# 🛡 Telegram Group Management & Moderation Bot

A production-ready Telegram Group Management and Moderation Bot built entirely with **Node.js**, **Pure JavaScript (CommonJS)**, **Telegraf**, and an atomic file-backed **`db.json`** local database engine.

---

## 🚀 Key Highlights & Architecture

- **Full Pure JavaScript**: Standard Node.js (`.js`), zero TypeScript, zero Python.
- **Telegraf Framework**: High-performance Telegram Bot API wrapper.
- **Single Source of Truth (`db.json`)**: All permanent data (groups, settings, media rules, blacklists, warnings, admin logs) are stored centrally in `db.json`.
- **Atomic File Operations**: Safe memory caching + atomic file renaming (`db.json.tmp` ➔ `db.json`) + write queue to eliminate race conditions and data corruption.
- **Strict Group Isolation**: Every setting is indexed by `chatId`. Changes in Group A never affect Group B.
- **Custom Commands & Interactive Buttons**: Dynamic slash commands (`/rules`, `/info`, `/donate`, `/socials`) with aliases, multi-step interactive wizard, variable interpolation (`{mention}`, `{user_id}`, `{group}`, `{date}`, `{time}`), and customizable inline keyboard buttons (`url`, `command`, `response`, `callback`).
- **Priority-Driven Moderation Engine**: High-speed moderation pipeline checking Captcha, Blacklists, Anti-Raid Guardian, Anti-Spam, Anti-Flood, Night Mode, 12 Media types, Link protection, and Script filtering.
- **Full Settings Dashboard**: Interactive 2-column + full-width Inline Keyboard dashboard via `/settings`.

---

## 📂 Project Structure

```
telegram-group-management-bot/
├── src/
│   ├── app.js
│   ├── bot/
│   │   ├── index.js
│   │   ├── commands/
│   │   │   ├── start.js
│   │   │   ├── help.js
│   │   │   ├── settings.js
│   │   │   ├── rules.js
│   │   │   ├── warn.js
│   │   │   ├── warns.js
│   │   │   ├── block.js
│   │   │   ├── admin.js
│   │   │   └── tagadmins.js
│   │   ├── callbacks/
│   │   │   └── callbackRouter.js
│   │   ├── handlers/
│   │   │   ├── messageHandler.js
│   │   │   ├── memberHandler.js
│   │   │   └── joinRequestHandler.js
│   │   ├── keyboards/
│   │   │   ├── settingsKeyboard.js
│   │   │   ├── mediaKeyboard.js
│   │   │   ├── antispamKeyboard.js
│   │   │   ├── antifloodKeyboard.js
│   │   │   └── commonKeyboard.js
│   │   └── middleware/
│   │       ├── groupMiddleware.js
│   │       ├── adminMiddleware.js
│   │       ├── permissionMiddleware.js
│   │       ├── rateLimitMiddleware.js
│   │       └── errorMiddleware.js
│   ├── database/
│   │   ├── database.js
│   │   ├── schema.js
│   │   └── backup.js
│   ├── modules/
│   │   ├── baseModule.js
│   │   ├── settingsRegistry.js
│   │   ├── media/
│   │   ├── regulation/
│   │   ├── antispam/
│   │   ├── antiflood/
│   │   ├── welcome/
│   │   ├── goodbye/
│   │   ├── alphabets/
│   │   ├── captcha/
│   │   ├── checks/
│   │   ├── adminMention/
│   │   ├── blocks/
│   │   ├── porn/
│   │   ├── warns/
│   │   ├── night/
│   │   ├── tag/
│   │   ├── link/
│   │   ├── guardian/
│   │   ├── approval/
│   │   ├── deletingMessages/
│   │   ├── lang/
│   │   └── other/
│   ├── services/
│   │   ├── actionService.js
│   │   ├── groupService.js
│   │   ├── userService.js
│   │   ├── adminService.js
│   │   ├── settingsService.js
│   │   ├── moderationService.js
│   │   ├── sessionService.js
│   │   ├── i18nService.js
│   │   └── telegramService.js
│   ├── utils/
│   │   ├── mediaDetector.js
│   │   ├── linkDetector.js
│   │   ├── alphabetDetector.js
│   │   ├── callbackParser.js
│   │   ├── messageUtils.js
│   │   └── permissionUtils.js
│   └── config/
│       ├── env.js
│       ├── constants.js
│       └── logger.js
├── locales/
│   ├── en.json
│   └── id.json
├── backups/
├── db.json
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## ⚙️ Installation & Setup

### 1. Prerequisites
- Node.js LTS (v20.x or later)
- npm (v9.x or later)
- A Telegram Bot Token from [@BotFather](https://t.me/BotFather)

### 2. Clone and Install Dependencies
```bash
git clone <your-repo-url>
cd bot-managementgroup2
npm install
```

### 3. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and insert your Telegram Bot Token:
```env
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_your_telegram_bot_token
NODE_ENV=development
LOG_LEVEL=info
DB_PATH=./db.json
BACKUP_ENABLED=true
BACKUP_PATH=./backups
```

### 4. Start the Bot
```bash
npm start
```
Or in development mode with auto-reload:
```bash
npm run dev
```

---

## 🛡 Bot Commands

### Admin Commands
| Command | Parameters | Description |
| :--- | :--- | :--- |
| `/settings` | None | Open interactive settings dashboard |
| `/warn` | `[reply\|@user] [reason]` | Issue a warning to a member |
| `/warns` | `[reply\|@user]` | Check current warning count |
| `/resetwarns` | `[reply]` | Reset all warnings for target member |
| `/block` | `@username` | Blacklist a user by username or ID |
| `/blockword` | `keyword` | Blacklist specific text or word |
| `/blockdomain` | `domain.com` | Blacklist a specific website domain |
| `/tagadmins` | `[message]` | Tag all group administrators |

### Public Commands
| Command | Parameters | Description |
| :--- | :--- | :--- |
| `/rules` | None | View active group regulations |
| `/admin` | `[reason]` | Send an urgent alert to administrators |
| `/help` | None | Display command help sheet |
| `/start` | None | Initial greeting and instructions |

---

## 📦 Media Management

Supports 12 distinct media types toggled independently per group:
1. **Photo** (`🖼 Photo`)
2. **Video** (`🎥 Video`)
3. **Audio** (`🎵 Audio`)
4. **Voice** (`🎙 Voice`)
5. **Document** (`📄 Document`)
6. **Sticker** (`🎨 Sticker`)
7. **Animation** (`🎞 Animation`)
8. **Contact** (`👤 Contact`)
9. **Location** (`📍 Location`)
10. **Venue** (`🏢 Venue`)
11. **Poll** (`📊 Poll`)
12. **Dice** (`🎲 Dice`)

- Regular members sending disabled media have their messages automatically deleted.
- Administrators automatically bypass moderation checks.

---

## 🗄️ Database Architecture (`db.json`)

All persistent data is consolidated in `db.json`. Below is an example structure:

```json
{
  "groups": {
    "-100123456789": {
      "id": "-100123456789",
      "title": "My Supergroup",
      "type": "supergroup",
      "isActive": true
    }
  },
  "settings": {
    "-100123456789": {
      "language": "en",
      "media": {
        "photo": true,
        "video": false,
        "audio": true,
        "voice": false,
        "document": false,
        "sticker": true,
        "animation": true,
        "contact": false,
        "location": false,
        "venue": false,
        "poll": true,
        "dice": true
      },
      "antispam": {
        "enabled": true,
        "threshold": 5,
        "window": 10,
        "action": "delete"
      },
      "antiflood": {
        "enabled": true,
        "threshold": 5,
        "window": 10,
        "action": "mute"
      }
    }
  },
  "blocks": [],
  "warnings": [],
  "warningHistory": [],
  "logs": []
}
```

---

## 🔒 Security & Concurrency Design

1. **In-Memory Cache**: Zero file I/O during message moderation checks for maximum performance.
2. **Write Queue & Atomic Writes**: Database writes are queued and written to `db.json.tmp` before atomically replacing `db.json`.
3. **Automated Backups**: Regular snapshots saved to `backups/db-YYYY-MM-DD-HH-mm-ss.json`.
4. **Resilient Error Handling**: Bot automatically catches Telegram API restrictions (e.g. user already banned or message already deleted) without crashing.
