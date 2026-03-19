require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');
const { initDatabase } = require('./database/db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

client.commands = new Collection();
client.components = new Collection(); // buttons + modals

loadCommands(client);
loadEvents(client);

initDatabase()
  .then(() => client.login(process.env.DISCORD_TOKEN))
  .catch((err) => {
    console.error('[Startup] Failed to initialize database:', err);
    process.exit(1);
  });
