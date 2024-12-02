const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");

let warnings = {};
let userData = {};

const countriesAndFlags = [
  { country: "Brazil", flag: "🇧🇷" },
  { country: "United States", flag: "🇺🇸" },
  { country: "Germany", flag: "🇩🇪" },
  { country: "United Kingdom", flag: "🇬🇧" },
  { country: "France", flag: "🇫🇷" },
  { country: "Japan", flag: "🇯🇵" },
  { country: "India", flag: "🇮🇳" },
  { country: "Canada", flag: "🇨🇦" },
  { country: "Australia", flag: "🇦🇺" },
  { country: "Italy", flag: "🇮🇹" },
  { country: "Mexico", flag: "🇲🇽" },
  { country: "Spain", flag: "🇪🇸" },
  { country: "Russia", flag: "🇷🇺" },
  { country: "South Korea", flag: "🇰🇷" },
  { country: "China", flag: "🇨🇳" },
  { country: "South Africa", flag: "🇿🇦" },
  { country: "Argentina", flag: "🇦🇷" },
  { country: "Egypt", flag: "🇪🇬" },
  { country: "Saudi Arabia", flag: "🇸🇦" },
  { country: "Nigeria", flag: "🇳🇬" },
];

function loadData() {
  const userDataPath = "./user-data.json";
  if (fs.existsSync(userDataPath)) {
    userData = JSON.parse(fs.readFileSync(userDataPath));
  }
}

function saveData() {
  fs.writeFileSync("./user-data.json", JSON.stringify(userData, null, 2));
}

function getFileExtension(type) {
  const mapping = {
    image: "png",
    video: "mp4",
  };
  return mapping[type] || "bin";
}

// Save media to disk
async function saveMedia(message) {
  try {
    const media = await message.downloadMedia();
    if (media && media.data) {
      const fileExtension = getFileExtension(message.type);
      const fileName = `./saved-media/media-${Date.now()}.${fileExtension}`;

      if (!fs.existsSync("./saved-media")) {
        fs.mkdirSync("./saved-media");
      }

      fs.writeFileSync(fileName, Buffer.from(media.data, "base64"));
      console.log(`Media saved: ${fileName}`);
      return fileName;
    } else {
      console.log("No media data available to save.");
      return null;
    }
  } catch (error) {
    console.error("Failed to save media:", error.message);
    return null;
  }
}

async function isAdmin(msg) {
  const chat = await msg.getChat();
  if (chat.isGroup) {
    const senderId = msg.author || msg.from;
    const participant = chat.participants.find(
      (p) => p.id._serialized === senderId
    );
    return participant && participant.isAdmin;
  }
  return false;
}

async function addWarning(user, chat, reason) {
  if (!warnings[user]) warnings[user] = { count: 0, reasons: [] };
  warnings[user].count++;
  warnings[user].reasons.push(reason);

  if (warnings[user].count >= 3) {
    await chat.removeParticipants([user]);
    delete warnings[user];
  }

  return warnings[user];
}

function removeWarning(user) {
  if (warnings[user]) {
    warnings[user].count--;
    if (warnings[user].count <= 0) delete warnings[user];
  }
  return warnings[user] ? warnings[user].count : 0;
}

function listWarnings(user) {
  if (warnings[user]) {
    return warnings[user].reasons
      .map((reason, idx) => `${idx + 1}. ${reason}`)
      .join("\n");
  }
  return "No warnings for this user.";
}

function getUptime() {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
}

const client = new Client({
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/refs/heads/main/html/2.3000.1018090133-alpha.html",
  },
  authStrategy: new LocalAuth({
    dataPath: "data",
  }),
});

client.once("ready", () => {
  console.log("Client is ready!");
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

async function startGuessFlagGame(msg) {
  const senderId = msg.from;
  const currentDate = new Date().toISOString().split("T")[0];

  if (!userData[senderId]) {
    userData[senderId] = { balance: 0, lastPlayed: {}, gamesPlayed: 0 };
  }

  if (userData[senderId].lastPlayed.date !== currentDate) {
    userData[senderId].lastPlayed.date = currentDate;
    userData[senderId].gamesPlayed = 0;
  }

  if (userData[senderId].gamesPlayed >= 5) {
    return await msg.reply(
      "You have reached the maximum of 5 attempts for the flag guessing game today. Try again tomorrow!"
    );
  }

  const randomCountry =
    countriesAndFlags[Math.floor(Math.random() * countriesAndFlags.length)];

  await msg.reply(
    `Guess the country for this flag: ${randomCountry.flag}\n\nType the country's name directly in this chat. You have 30 seconds to respond.`
  );

  let timeoutReached = false;

  const handleResponse = async (responseMsg) => {
    if (responseMsg.from !== senderId || timeoutReached) return;

    if (
      responseMsg.body.toLowerCase() === randomCountry.country.toLowerCase()
    ) {
      userData[senderId].balance += 10;
      userData[senderId].gamesPlayed += 1;
      await responseMsg.reply(
        `Correct! The country is ${randomCountry.country}. You've earned 10 points. Your balance is now ${userData[senderId].balance} points.`
      );
    } else {
      await responseMsg.reply(
        `Incorrect! The correct answer was ${randomCountry.country}.`
      );
    }

    saveData();
    client.removeListener("message", handleResponse);
  };

  client.on("message", handleResponse);

  setTimeout(() => {
    timeoutReached = true;
    msg.reply("Time's up! You didn't answer in time. The game has ended.");
    client.removeListener("message", handleResponse);
  }, 30000);
}

client.on("message_create", async (msg) => {
  try {
    const senderId = msg.from;
    const chat = await msg.getChat();

    if (msg.body.startsWith("!")) {
      const args = msg.body.split(" ");
      const command = args[0];
      const target = args[1] ? args[1] + "@c.us" : null;
      const reason = args.slice(2).join(" ");

      if (command === "!help") {
        const isAdminUser = await isAdmin(msg);
        let helpMessage = "*Available Commands:*\n\n";

        helpMessage += "📋 *General Commands:*\n";
        helpMessage += "`!guessflag` - Start a flag guessing game.\n";
        helpMessage += "`guess <country>` - Submit your answer.\n";
        helpMessage += "`!ping` - Check bot responsiveness.\n";
        helpMessage += "`!botinfo` - Get bot uptime.\n";
        helpMessage += "`!status` - Check bot status.\n\n";

        if (isAdminUser) {
          helpMessage += "🛠️ *Admin Commands:*\n";
          helpMessage +=
            "`!warn @user <reason>` - Warn a user (3 warnings = kick).\n";
          helpMessage += "`!listwarn @user` - List warnings for a user.\n";
          helpMessage += "`!delwarn @user` - Remove a user's warning.\n";
          helpMessage += "`!kick @user` - Kick a user from the group.\n";
        }

        await msg.reply(helpMessage);
        return;
      }

      if (command === "!guessflag") {
        await startGuessFlagGame(msg, senderId);
        return;
      }

      if (command === "!ping") {
        await msg.reply("Pong! The bot is online.");
        return;
      }

      if (command === "!botinfo") {
        await msg.reply(`Bot uptime: ${getUptime()}`);
        return;
      }

      if (command === "!get" && msg.hasQuotedMsg) {
        const quotedMessage = await msg.getQuotedMessage();

        if (quotedMessage._data.isViewOnce) {
          const media = await quotedMessage.downloadMedia();
          await saveMedia(quotedMessage);

          if (media && media.data) {
            await msg.reply(media);
            console.log("Replied with view-once media.");
          } else {
            console.error("Failed to download media.");
            msg.reply("Sorry, I couldn't retrieve the media.");
          }
        } else {
          msg.reply("The quoted message is not a view-once media.");
        }
      }

      if (await isAdmin(msg)) {
        if (command === "!warn" && target && reason) {
          const count = await addWarning(target, chat, reason);
          await msg.reply(
            `User @${target} warned. Total warnings: ${count.count}`
          );
        } else if (command === "!delwarn" && target) {
          const count = removeWarning(target);
          await msg.reply(
            `Removed a warning for @${target}. Total warnings: ${count}`
          );
        } else if (command === "!listwarn" && target) {
          const warningsList = listWarnings(target);
          await msg.reply(`Warnings for @${target}:\n${warningsList}`);
        } else if (command === "!kick" && target) {
          await chat.removeParticipants([target]);
          await msg.reply(`User @${target} has been removed.`);
        }
      } else {
        await msg.reply("You don't have permission to use this command.");
      }
    }
  } catch (error) {
    console.error("Error processing command:", error.message);
    await msg.reply("An error occurred while processing your request.");
  }
});

loadData();
client.initialize();
