import { InlineKeyboard } from "grammy"
import fs from "node:fs/promises"
import path from "node:path"

const ADMIN_ID = 8987678726
const DB_FILE = path.join(process.cwd(), "bot-data.json")

const defaultDB = {
  users: [],
  channels: [],
  welcomeText: "🎉 Welcome!\n\nहमारे सभी चैनल Join करें और आगे बढ़ें।",
  welcomePhoto: "",
  reward: 10,
  maintenance: false
}

let db = { ...defaultDB }
const adminState = new Map()

async function loadDB() {
  try {
    const data = await fs.readFile(DB_FILE, "utf8")
    db = { ...defaultDB, ...JSON.parse(data) }
  } catch {
    await saveDB()
  }
}

async function saveDB() {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2))
}

function isAdmin(ctx) {
  return ctx.from?.id === ADMIN_ID
}

function adminKeyboard() {
  return new InlineKeyboard()
    .text("📝 Welcome Text", "set_text")
    .text("🖼️ Welcome Photo", "set_photo")
    .row()
    .text("➕ Add Channel", "add_channel")
    .text("➖ Remove Channel", "remove_channel")
    .row()
    .text("📊 Statistics", "stats")
    .text("📢 Broadcast", "broadcast")
    .row()
    .text("🎁 Reward", "reward")
    .text(
      db.maintenance ? "🟢 Maintenance ON" : "🔴 Maintenance OFF",
      "maintenance"
    )
}

function mainKeyboard() {
  return new InlineKeyboard()
    .text("🎁 Demo Reward", "reward_user")
    .row()
    .text("🔄 Check Channels", "verify")
}

function channelKeyboard(channels) {
  const keyboard = new InlineKeyboard()

  channels.forEach((channel, index) => {
    keyboard.url(
      channel.title || `Join Channel ${index + 1}`,
      channel.link
    )

    if (index % 2 === 1) keyboard.row()
  })

  keyboard.row().text("✅ Verify & Continue", "verify")
  return keyboard
}

async function checkJoined(ctx) {
  const notJoined = []

  for (const channel of db.channels) {
    try {
      const member = await ctx.api.getChatMember(
        channel.id,
        ctx.from.id
      )

      if (
        !["creator", "administrator", "member"].includes(member.status)
      ) {
        notJoined.push(channel)
      }
    } catch (error) {
      console.error("Channel check error:", channel.id, error.message)
      notJoined.push(channel)
    }
  }

  return notJoined
}

async function showWelcome(ctx) {
  if (db.maintenance && !isAdmin(ctx)) {
    return ctx.reply("🔧 Bot is currently under maintenance.")
  }

  if (!db.users.includes(ctx.from.id)) {
    db.users.push(ctx.from.id)
    await saveDB()
  }

  const notJoined = await checkJoined(ctx)

  if (notJoined.length > 0) {
    const keyboard = channelKeyboard(notJoined)

    if (db.welcomePhoto) {
      return ctx.replyWithPhoto(db.welcomePhoto, {
        caption: db.welcomeText,
        reply_markup: keyboard
      })
    }

    return ctx.reply(db.welcomeText, {
      reply_markup: keyboard
    })
  }

  return ctx.reply("✅ Verification Successful!\n\nWelcome to Main Menu.", {
    reply_markup: mainKeyboard()
  })
}

export function registerCommands(bot) {

  loadDB()

  // START
  bot.command("start", async (ctx) => {
    await showWelcome(ctx)
  })

  // HELP
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Commands:\n/start - Start Bot\n/admin - Admin Panel\n/id - Your ID"
    )
  })

  // ID
  bot.command("id", async (ctx) => {
    await ctx.reply(`Your ID: ${ctx.from.id}`)
  })

  // ADMIN PANEL
  bot.command("admin", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply("❌ Access Denied!")

    await ctx.reply("👑 ADMIN CONTROL PANEL", {
      reply_markup: adminKeyboard()
    })
  })

  // ADMIN BUTTONS
  bot.callbackQuery("admin_home", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery()

    await ctx.answerCallbackQuery()
    await ctx.reply("👑 ADMIN PANEL", {
      reply_markup: adminKeyboard()
    })
  })

  // SET WELCOME TEXT
  bot.callbackQuery("set_text", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery()

    adminState.set(ctx.from.id, "welcome_text")
    await ctx.answerCallbackQuery()
    await ctx.reply("📝 Send your new Welcome Text:")
  })

  // SET WELCOME PHOTO
  bot.callbackQuery("set_photo", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery()

    adminState.set(ctx.from.id, "welcome_photo")
    await ctx.answerCallbackQuery()
    await ctx.reply("🖼️ Send a photo with optional caption:")
  })

  // ADD CHANNEL
  bot.callbackQuery("add_channel", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery()

    adminState.set(ctx.from.id, "add_channel")
    await ctx.answerCallbackQuery()

    await ctx.reply(
      "➕ Send channel details in this format:\n\n" +
      "CHANNEL_ID | INVITE_LINK | CHANNEL_NAME\n\n" +
      "Example:\n" +
      "-1001234567890 | https://t.me/+example | My Channel\n\n" +
      "⚠️ Bot must be admin in the channel."
    )
  })

  // REMOVE CHANNEL
  bot.callbackQuery("remove_channel", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery()

    await ctx.answerCallbackQuery()

    if (db.channels.length === 0) {
      return ctx.reply("No channels added yet.")
    }

    const keyboard = new InlineKeyboard()

    db.channels.forEach((channel, index) => {
      keyboard.text(
        `❌ ${channel.title || channel.id}`,
        `delete_${index}`
      ).row()
    })

    await ctx.reply("Select channel to remove:", {
      reply_markup: keyboard
    })
  })

  // DELETE CHANNEL
  bot.callbackQuery(/^delete_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery()

    const index = Number(ctx.match[1])

    if (db.channels[index]) {
      db.channels.splice(index, 1)
      await saveDB()
    }

    await ctx.answerCallbackQuery({ text: "Channel removed!" })
    await ctx.reply("✅ Channel removed.", {
      reply_markup: adminKeyboard()
    })
  })

  // STATISTICS
  bot.callbackQuery("stats", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery()

    await ctx.answerCallbackQuery()

    await ctx.reply(
      `📊 BOT STATISTICS\n\n` +
      `👥 Total Users: ${db.users.length}\n` +
      `📢 Total Channels: ${db.channels.length}\n` +
      `🎁 Reward: ₹${db.reward}\n` +
      `🔧 Maintenance: ${db.maintenance ? "ON" : "OFF"}`
    )
  })

  // BROADCAST
  bot.callbackQuery("broadcast", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery()

    adminState.set(ctx.from.id, "broadcast")
    await ctx.answerCallbackQuery()

    await ctx.reply(
      "📢 Send the message, photo or video you want to broadcast."
    )
  })

  // REWARD SETTING
  bot.callbackQuery("reward", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery()

    adminState.set(ctx.from.id, "reward")
    await ctx.answerCallbackQuery()

    await ctx.reply("🎁 Send new demo reward amount:")
  })

  // MAINTENANCE
  bot.callbackQuery("maintenance", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery()

    db.maintenance = !db.maintenance
    await saveDB()

    await ctx.answerCallbackQuery({
      text: "Maintenance setting updated!"
    })

    await ctx.reply("👑 ADMIN PANEL", {
      reply_markup: adminKeyboard()
    })
  })

  // VERIFY
  bot.callbackQuery("verify", async (ctx) => {
    await ctx.answerCallbackQuery()

    if (db.maintenance && !isAdmin(ctx)) {
      return ctx.reply("🔧 Bot is under maintenance.")
    }

    const notJoined = await checkJoined(ctx)

    if (notJoined.length > 0) {
      return ctx.reply(
        "❌ Please join all channels first.",
        { reply_markup: channelKeyboard(notJoined) }
      )
    }

    await ctx.reply(
      "✅ Verification Successful!\n\nWelcome to Main Menu.",
      { reply_markup: mainKeyboard() }
    )
  })

  // USER REWARD
  bot.callbackQuery("reward_user", async (ctx) => {
    await ctx
