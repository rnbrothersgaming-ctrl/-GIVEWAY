require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const database = require('./database');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(port, () => console.log(`Health check server listening on port ${port}`));

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;

// Simple state management
const userStates = {};

// Admin Command Handlers
async function handleCreate(ctx) {
    if (ctx.from.id !== ADMIN_ID) return;
    const activePoll = database.getActivePoll();
    if (activePoll) {
        return ctx.reply('⚠️ একটি পোল বর্তমানে রানিং আছে। নতুন পোল তৈরি করার আগে বর্তমান পোলটি শেষ করুন।\n\nকমান্ড: /end');
    }
    userStates[ctx.from.id] = { step: 'TITLE' };
    ctx.reply('Please send the **Title** for your poll.\nYou can use *bold*, _italic_, or regular text.', { parse_mode: 'Markdown' });
}

async function handleOptions(ctx) {
    if (ctx.from.id !== ADMIN_ID) return;
    const activePoll = database.getActivePoll();
    if (!activePoll) return ctx.reply('কোনো রানিং পোল নেই।');
    let text = `📊 <b>বর্তমান পোলের অপশন লিস্ট:</b>\n\n`;
    activePoll.options.forEach((opt, i) => {
        text += `${i + 1}. <b>${opt.name}</b> (ভোট: ${opt.votes.length})\n`;
    });
    text += `\n💡 ভোট যোগ করতে ব্যবহার করুন: <code>/addvote [নম্বর] [পরিমাণ]</code>`;
    ctx.reply(text, { parse_mode: 'HTML' });
}

async function handleEnd(ctx) {
    if (ctx.from.id !== ADMIN_ID) return;
    const activePoll = database.getActivePoll();
    if (!activePoll) return ctx.reply('কোনো রানিং পোল খুঁজে পাওয়া যায়নি।');
    database.endPoll(activePoll.id);
    const endText = generatePollEndText(activePoll);
    try {
        if (activePoll.channelMsgId) {
            await ctx.telegram.editMessageText(CHANNEL_ID, activePoll.channelMsgId, null, endText, {
                parse_mode: 'HTML'
            });
        }
        ctx.reply('✅ পোলটি সফলভাবে বন্ধ করা হয়েছে এবং রেজাল্ট চ্যানেলে পোস্ট করা হয়েছে।');
    } catch (error) {
        console.error('Error ending poll:', error);
        ctx.reply('পোলটি বন্ধ করার সময় কিছু সমস্যা হয়েছে।');
    }
}

// Bot Commands & Buttons
bot.start((ctx) => {
    if (ctx.from.id === ADMIN_ID) {
        const adminKeyboard = Markup.keyboard([
            ['🚀 Create Poll', '📊 Active Options'],
            ['🛑 End Poll', '🛠 Help']
        ]).resize();
        return ctx.reply('Welcome Admin! Use the buttons below to control the bot.', adminKeyboard);
    }
    ctx.reply('Welcome! This bot is used for voting polls in the channel.');
});

bot.command('create', handleCreate);
bot.hears('🚀 Create Poll', handleCreate);

bot.command('options', handleOptions);
bot.hears('📊 Active Options', handleOptions);

bot.command('end', handleEnd);
bot.hears('🛑 End Poll', handleEnd);

bot.hears('🛠 Help', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply('💡 **Admin Help**:\n\n' +
        '1. Click **Create Poll** to start.\n' +
        '2. Click **Active Options** to see participant numbers.\n' +
        '3. Use `/addvote [Number] [Count]` to add votes manually.\n' +
        '4. Click **End Poll** to stop voting and post results.', { parse_mode: 'Markdown' });
});

bot.command('addvote', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply('Only admins can use this command.');

    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('Usage: `/addvote [OptionNumber] [Count]`\nExample: `/addvote 1 50` (Adds 50 votes to option 1)', { parse_mode: 'Markdown' });
    }

    const optionIndex = parseInt(args[1]) - 1; // Convert to 0-based index
    const count = parseInt(args[2]);

    if (isNaN(optionIndex) || isNaN(count) || count < 1) {
        return ctx.reply('Please provide valid numbers.');
    }

    const result = database.addManualVotes(optionIndex, count);
    
    if (!result.success) {
        return ctx.reply(`Error: ${result.message}`);
    }

    ctx.reply(`✅ Successfully added ${count} votes to option ${optionIndex + 1}.`);

    // Update the Channel Poll UI
    const poll = result.poll;
    if (poll.channelMsgId) {
        const keyboard = generatePollKeyboard(poll);
        const messageText = poll.title;
        try {
            await ctx.telegram.editMessageText(CHANNEL_ID, poll.channelMsgId, null, messageText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (e) {}
    }
});

function generatePollEndText(poll) {
    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
    const sortedOptions = [...poll.options].sort((a, b) => b.votes.length - a.votes.length);
    const winnerCount = poll.winnerCount || 1;
    const winners = sortedOptions.slice(0, winnerCount).filter(opt => opt.votes.length > 0);

    let text = `📋 <b>Poll Ended</b>\n\n`;

    poll.options.forEach(opt => {
        const count = opt.votes.length;
        const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
        
        // Progress bar (10 blocks)
        const filledBlocks = Math.round(percent / 10);
        const emptyBlocks = 10 - filledBlocks;
        const bar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
        
        // Emoji: crown for top winners, user for others
        const isWinner = winners.some(w => w.name === opt.name && count > 0);
        const emoji = isWinner ? '👑' : '👤';
        text += `${emoji} ${opt.name} ${bar} ${percent}% (${count} ভোট)\n`;
    });

    text += `\n🏆 <b>বিজয়ীদের দেখুন 👇 :</b>\n`;
    
    if (winners.length > 0) {
        const medals = ['🥇', '🥈', '🥉', '🏅'];
        winners.forEach((w, i) => {
            const medal = medals[i] || medals[3];
            const rankText = i === 0 ? 'প্রথম বিজয়ী' : (i === 1 ? 'দ্বিতীয় বিজয়ী' : (i === 2 ? 'তৃতীয় বিজয়ী' : `${i+1}তম বিজয়ী`));
            text += `${medal} <b>${rankText}:</b> ${w.name} (${w.votes.length} ভোট)\n`;
        });
    } else {
        text += `<i>কোনো ভোট পড়েনি।</i>\n`;
    }

    text += `👥 <b>মোট ভোটার:</b> ${totalVotes} জন\n`;
    text += `👤 <b>ইউনিক ভোটার:</b> ${totalVotes} জন\n\n`;
    
    text += `🛑 <b>পোল এখন বন্ধ করা হয়েছে।</b>\n`;
    text += `➡️ <b>বিজয়ীদের উপরে বেছে নেওয়া হয়েছে।</b>`;

    return text;
}

bot.on('text', async (ctx) => {
    const state = userStates[ctx.from.id];
    if (!state) return;

    if (state.step === 'TITLE') {
        state.title = ctx.message.text;
        state.step = 'OPTIONS';
        ctx.reply('Now send the names/options separated by "**&**".\nExample: `Araf & Rifat & Nishad`');
    } else if (state.step === 'OPTIONS') {
        const optionsText = ctx.message.text;
        const options = optionsText.split('&').map(o => o.trim()).filter(o => o.length > 0);
        
        if (options.length < 2) {
            return ctx.reply('Please provide at least 2 options separated by "&".');
        }

        state.options = options;
        state.step = 'WINNERS';
        ctx.reply('How many winners do you want for this poll?\nSend a number (e.g., `1`, `2`, or `3`).');
    } else if (state.step === 'WINNERS') {
        const winnerCount = parseInt(ctx.message.text);
        if (isNaN(winnerCount) || winnerCount < 1) {
            return ctx.reply('Please send a valid number for winners.');
        }

        state.winnerCount = winnerCount;
        state.step = 'PREVIEW';

        const pollData = database.createPoll(state.title, state.options, state.winnerCount);
        state.pollId = pollData.id;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Post to Channel', `post_${pollData.id}`, false, { style: 'primary' })],
            [Markup.button.callback('❌ Cancel', 'cancel', false, { style: 'danger' })]
        ]);

        ctx.reply(`**Poll Preview**:\n\n${state.title}\n\nWinners: ${state.winnerCount}\nOptions:\n${state.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }
});

bot.action(/post_(.+)/, async (ctx) => {
    const pollId = ctx.match[1];
    const poll = database.getPoll(pollId);
    if (!poll) return ctx.answerCbQuery('Poll not found.');

    const keyboard = generatePollKeyboard(poll);
    
    const messageText = poll.title;

    try {
        const msg = await ctx.telegram.sendMessage(CHANNEL_ID, messageText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
        
        poll.channelMsgId = msg.message_id;
        database.save();

        ctx.editMessageText('✅ Poll posted to channel successfully!');
        delete userStates[ctx.from.id];
    } catch (error) {
        console.error('Error posting to channel:', error);
        ctx.reply('Error posting to channel. Make sure the bot is an admin in the channel.');
    }
});

bot.action(/vote_(.+)_(.+)/, async (ctx) => {
    const pollId = ctx.match[1];
    const optionIndex = parseInt(ctx.match[2]);
    const userId = ctx.from.id;

    const result = database.vote(pollId, optionIndex, userId);
    
    if (!result.success) {
        return ctx.answerCbQuery(result.message, { show_alert: true });
    }

    ctx.answerCbQuery('Vote registered!');
    
    const poll = result.poll;
    const votedOption = poll.options[optionIndex].name;
    const voter = ctx.from;

    // Helper to escape HTML characters
    const escapeHTML = (str) => {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    // 1. Notify Admin Immediately using HTML mode (much safer than Markdown)
    const adminMsg = `🗳 <b>পোলটি স্বয়ংক্রিয়ভাবে ট্র্যাক করা হচ্ছে।</b>\n\n` +
        `👷 <b>ভোট দিয়েছেন:</b>\n` +
        `────────────────────\n` +
        `👤 <b>নাম:</b> ${escapeHTML(voter.first_name)}${voter.last_name ? ' ' + escapeHTML(voter.last_name) : ''}\n` +
        `🔰 <b>ইউজারনেম:</b> ${voter.username ? '@' + escapeHTML(voter.username) : 'নেই'}\n` +
        `🆔 <b>ইউজার আইডি:</b> <code>${voter.id}</code>\n` +
        `📌 <b>ভোট দিয়েছে:</b> ${escapeHTML(votedOption)}\n` +
        `────────────────────`;

    try {
        await ctx.telegram.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
    } catch (err) {
        console.error('Failed to notify admin:', err.message);
        // Fallback to plain text if HTML fails
        await ctx.telegram.sendMessage(ADMIN_ID, `Vote Tracking Error: ${voter.id} voted for ${votedOption}`).catch(() => {});
    }

    // 2. Update the Channel Poll UI
    const keyboard = generatePollKeyboard(poll);
    const messageText = poll.title;
    
    try {
        await ctx.editMessageText(messageText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    } catch (e) {
        // Silently catch "Message is not modified"
    }
});

bot.action('cancel', (ctx) => {
    delete userStates[ctx.from.id];
    ctx.editMessageText('Poll creation cancelled.');
});

// Handle users leaving the channel (Fake Vote Protection)
bot.on('chat_member', async (ctx) => {
    const update = ctx.chatMember;
    const userId = update.from.id;
    const status = update.new_chat_member.status;

    // Detect if user left (left or kicked)
    if (status === 'left' || status === 'kicked') {
        const result = database.removeVote(userId);
        
        if (result) {
            const { poll, removedOption } = result;
            const user = update.from;
            const userName = `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`;

            // 1. Post warning in channel
            const warningMsg = `⚠️ <b>Fake Vote Detected!</b>\n\n` +
                `👤 <b>নাম:</b> ${userName}\n` +
                `🆔 <b>আইডি:</b> <code>${userId}</code>\n` +
                `📌 <b>অবস্থা:</b> চ্যানেল থেকে লিভ নিয়েছেন।\n` +
                `📉 <b>ভোট রিমুভ করা হয়েছে:</b> ${removedOption}\n\n` +
                `<i>সবাই সৎভাবে ভোট দিন। কোনো ফেক ভোট গ্রহণযোগ্য নয়!</i>`;

            try {
                await ctx.telegram.sendMessage(CHANNEL_ID, warningMsg, { parse_mode: 'HTML' });

                // 2. Update the Poll UI in channel
                if (poll.channelMsgId) {
                    const keyboard = generatePollKeyboard(poll);
                    const messageText = poll.title;
                    await ctx.telegram.editMessageText(CHANNEL_ID, poll.channelMsgId, null, messageText, {
                        parse_mode: 'Markdown',
                        ...keyboard
                    });
                }

                // 3. Notify Admin
                await ctx.telegram.sendMessage(ADMIN_ID, `🚫 <b>Fake Vote Removed:</b> ${userName} (${userId}) left the channel.`, { parse_mode: 'HTML' });

            } catch (err) {
                console.error('Error handling fake vote removal:', err);
            }
        }
    }
});

bot.action(/join_(.+)/, async (ctx) => {
    const pollId = ctx.match[1];
    const user = ctx.from;
    const name = `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`;

    const result = database.addParticipant(pollId, user.id, name);

    if (!result.success) {
        return ctx.answerCbQuery(result.message, { show_alert: true });
    }

    ctx.answerCbQuery('You have joined the vote! 🚀');

    // Update the message UI
    const poll = result.poll;
    const keyboard = generatePollKeyboard(poll);
    const messageText = poll.title;

    try {
        await ctx.editMessageText(messageText, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    } catch (e) {
        // Silently catch
    }
});

function generatePollKeyboard(poll) {
    const styles = ['primary', 'success', 'danger'];
    const buttons = [];
    
    for (let i = 0; i < poll.options.length; i += 2) {
        const row = [];
        
        // Option 1
        const opt1 = poll.options[i];
        const count1 = opt1.votes.length;
        row.push({
            text: `${opt1.name} (${count1})`,
            callback_data: `vote_${poll.id}_${i}`,
            style: styles[i % styles.length]
        });
        
        // Option 2
        if (i + 1 < poll.options.length) {
            const opt2 = poll.options[i + 1];
            const count2 = opt2.votes.length;
            row.push({
                text: `${opt2.name} (${count2})`,
                callback_data: `vote_${poll.id}_${i + 1}`,
                style: styles[(i + 1) % styles.length]
            });
        }
        
        buttons.push(row);
    }

    // Add Join button at the bottom if poll is active
    if (poll.status === 'active') {
        buttons.push([{
            text: '✨ Join Now',
            callback_data: `join_${poll.id}`,
            style: 'primary'
        }]);
    }

    return Markup.inlineKeyboard(buttons);
}

bot.launch({
    allowedUpdates: ['message', 'callback_query', 'chat_member']
}).then(() => console.log('Bot is running...'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
