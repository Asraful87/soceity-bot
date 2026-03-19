const fs = require('fs');
const path = require('path');

function loadCommands(client) {
  const commandsPath = path.join(__dirname, '../commands');
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      console.log(`[CommandHandler] Loaded: ${command.data.name}`);
    } else {
      console.warn(`[CommandHandler] Skipped ${file} — missing 'data' or 'execute'.`);
    }
  }

  // Load component handlers (buttons + modals)
  const componentsRoot = path.join(__dirname, '../components');
  const subDirs = ['buttons', 'modals'];

  for (const dir of subDirs) {
    const dirPath = path.join(componentsRoot, dir);
    if (!fs.existsSync(dirPath)) continue;

    for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.js'))) {
      const component = require(path.join(dirPath, file));
      if (component.customId && component.execute) {
        client.components.set(component.customId, component);
        console.log(`[CommandHandler] Component loaded: ${component.customId}`);
      } else {
        console.warn(`[CommandHandler] Skipped component ${file} — missing 'customId' or 'execute'.`);
      }
    }
  }
}

module.exports = { loadCommands };
