require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { startRenewalChecker } = require('./services/renewalService');
const { startWebhookServer } = require('./server');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

client.commands = new Collection();

// ── Command Loader ────────────────────────────────────────────────────────────
function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      console.log(`[Commands] Loaded: ${command.data.name}`);
    } else {
      console.warn(`[Commands] Skipped ${file} — missing required 'data' or 'execute' property.`);
    }
  }
}

// ── Event Loader ──────────────────────────────────────────────────────────────
function loadEvents() {
  const eventsPath = path.join(__dirname, 'events');
  if (!fs.existsSync(eventsPath)) return;

  const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
  for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (!event.name || !event.execute) {
      console.warn(`[Events] Skipped ${file} — missing required 'name' or 'execute' property.`);
      continue;
    }
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`[Events] Loaded: ${event.name} (once=${!!event.once})`);
  }
}

// ── interactionCreate ─────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(`[interactionCreate] Error in /${interaction.commandName}:`, err);
    const reply = { content: 'An error occurred while running that command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once('ready', (c) => {
  console.log(`[Ready] Logged in as ${c.user.tag} (${c.user.id})`);
  console.log(`[Ready] Serving ${c.guilds.cache.size} guild(s).`);
  
  // Start membership renewal checker (if enabled in .env)
  startRenewalChecker(client);
});

// ── Register Slash Commands & Start ───────────────────────────────────────────
async function main() {
  loadCommands();
  loadEvents();

  const commandBodies = [...client.commands.values()].map(cmd => cmd.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('[Deploy] Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commandBodies }
    );
    console.log(`[Deploy] ${commandBodies.length} command(s) registered.`);
  } catch (err) {
    console.error('[Deploy] Failed to register commands:', err);
  }

  // Start webhook server (if enabled in .env)
  startWebhookServer();

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);

module.exports = client;
