const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const config = require('./config');

const bot = new Telegraf(config.botToken);
const premiumFile = './premium.json';

// Load data premium
function loadPremium() {
    try {
        if (fs.existsSync(premiumFile)) {
            return JSON.parse(fs.readFileSync(premiumFile, 'utf8'));
        }
        return {};
    } catch (error) {
        console.error('Error loading premium data:', error);
        return {};
    }
}

// Save data premium
function savePremium(data) {
    try {
        fs.writeFileSync(premiumFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving premium data:', error);
    }
}

// Cek status user
async function checkUser(ctx) {
    try {
        const memberChannel = await ctx.telegram.getChatMember(config.channelId, ctx.from.id);
        const memberGroup = await ctx.telegram.getChatMember(config.groupId, ctx.from.id);
        
        if (memberChannel.status === 'left' || memberGroup.status === 'left') {
            ctx.reply(`⚠️ Harus join channel ${config.channelUsername} dan group ${config.groupUsername} terlebih dahulu!`);
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error checking user:', error);
        ctx.reply('❌ Error saat mengecek keanggotaan. Pastikan bot adalah admin di channel dan group.');
        return false;
    }
}

// Command start
bot.start(async (ctx) => {
    if (!(await checkUser(ctx))) return;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📦 Ambil Kode', 'get_code')]
    ]);
    
    ctx.reply('Selamat datang! Pilih menu:', keyboard);
});

// Command addpremium (owner only)
bot.command('addpremium', (ctx) => {
    if (ctx.from.id !== config.ownerId) return ctx.reply('❌ Akses ditolak!');
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Gunakan: /addpremium <user_id>');
    
    const userId = args[1];
    const premium = loadPremium();
    premium[userId] = true;
    savePremium(premium);
    
    ctx.reply(`✅ User ${userId} ditambahkan ke premium!`);
});

// Command delpremium (owner only)
bot.command('delpremium', (ctx) => {
    if (ctx.from.id !== config.ownerId) return ctx.reply('❌ Akses ditolak!');
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Gunakan: /delpremium <user_id>');
    
    const userId = args[1];
    const premium = loadPremium();
    delete premium[userId];
    savePremium(premium);
    
    ctx.reply(`✅ User ${userId} dihapus dari premium!`);
});

// Handle callback query untuk create website
let waitingForWebsiteName = {};

bot.action('create_website', async (ctx) => {
    if (!(await checkUser(ctx))) return;
    
    const premium = loadPremium();
    if (!premium[ctx.from.id]) {
        return ctx.reply('❌ Fitur ini hanya untuk user premium!');
    }
    
    ctx.reply('Masukkan nama website:');
    waitingForWebsiteName[ctx.from.id] = true;
});

// Handle callback query untuk ambil kode
let waitingForUrl = {};

bot.action('get_code', async (ctx) => {
    if (ctx.from.id !== config.ownerId) {
        return ctx.reply('❌ Fitur ini hanya untuk owner!');
    }
    
    ctx.reply('Masukkan URL website:');
    waitingForUrl[ctx.from.id] = true;
});

// Handle text messages
bot.on('text', async (ctx) => {
    if (waitingForWebsiteName[ctx.from.id]) {
        delete waitingForWebsiteName[ctx.from.id];
        const websiteName = ctx.message.text;
        
        try {
            const response = await axios.post(
                'https://api.vercel.com/v13/deployments',
                {
                    name: websiteName,
                    files: [
                        {
                            file: 'index.html',
                            data: Buffer.from('<html><body><h1>Website Berhasil Dibuat!</h1></body></html>').toString('base64')
                        }
                    ]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${config.vercelToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            ctx.reply(`✅ Website berhasil dibuat!\nURL: ${response.data.url}`);
        } catch (error) {
            console.error('Error creating website:', error);
            ctx.reply('❌ Gagal membuat website: ' + (error.response?.data?.error?.message || error.message));
        }
    } else if (waitingForUrl[ctx.from.id]) {
        delete waitingForUrl[ctx.from.id];
        const url = ctx.message.text;
        
        try {
            const response = await axios.get(url);
            const htmlCode = response.data;
            
            // Potong kode jika terlalu panjang (batas Telegram 4096 karakter)
            if (htmlCode.length > 4096) {
                const truncatedCode = htmlCode.substring(0, 4090) + '...';
                return ctx.reply(`<code>${truncatedCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`, { parse_mode: 'HTML' });
            }
            
            ctx.reply(`<code>${htmlCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Error fetching code:', error);
            ctx.reply('❌ Gagal mengambil kode: ' + error.message);
        }
    }
});

// Start bot
bot.launch().then(() => {
    console.log('Bot started successfully!');
}).catch(error => {
    console.error('Error starting bot:', error);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));