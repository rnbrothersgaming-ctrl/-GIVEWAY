# Telegram Voting System Bot

A bot that allows admins to create polls with styled text and multiple options, which are then posted to a Telegram channel for voting.

## Features
- **Styled Titles**: Supports Markdown (Bold, Italic, etc.).
- **Multiple Options**: Easily add options separated by `&`.
- **Channel Integration**: Posts polls directly to your configured channel.
- **Secure Voting**: Prevents multiple votes from the same user.
- **Live Updates**: Vote counts are updated in real-time.

## Setup
1. Fill in the `.env` file:
   - `BOT_TOKEN`: Your Telegram bot token from @BotFather.
   - `CHANNEL_ID`: The ID of your channel (e.g., `-100...`).
   - `ADMIN_ID`: Your Telegram user ID.
2. Run `npm install`.
3. Run `node bot.js`.

## Usage
1. Send `/create` to the bot.
2. Send the title (e.g., `*Best Artist of the Year*`).
3. Send the names (e.g., `Araf & Rifat & Nishad`).
4. Click **Post to Channel**.
5. Users in the channel can now vote!
