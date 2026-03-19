module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client) {
    // ── Slash commands ────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[interactionCreate] Command /${interaction.commandName} error:`, err);
        await sendInteractionError(interaction, 'An error occurred running that command.');
      }
      return;
    }

    // ── Buttons ───────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      const component = resolveComponent(client, interaction.customId);
      if (!component) return;

      try {
        await component.execute(interaction, client);
      } catch (err) {
        console.error(`[interactionCreate] Button ${interaction.customId} error:`, err);
        await sendInteractionError(interaction, 'An error occurred handling that button.');
      }
      return;
    }

    // ── Modals ────────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const component = resolveComponent(client, interaction.customId);
      if (!component) return;

      try {
        await component.execute(interaction, client);
      } catch (err) {
        console.error(`[interactionCreate] Modal ${interaction.customId} error:`, err);
        await sendInteractionError(interaction, 'An error occurred handling that form.');
      }
    }
  },
};

async function sendInteractionError(interaction, message) {
  const payload = { content: message, ephemeral: true };

  try {
    if (interaction.replied) {
      await interaction.followUp(payload);
      return;
    }

    if (interaction.deferred) {
      await interaction.editReply(payload);
      return;
    }

    await interaction.reply(payload);
  } catch (replyErr) {
    console.error('[interactionCreate] Failed to send error response:', replyErr);
  }
}

/**
 * Resolves a component handler by exact customId first,
 * then by prefix (for dynamic IDs like approve_application_<userId>).
 */
function resolveComponent(client, customId) {
  // Exact match
  if (client.components.has(customId)) return client.components.get(customId);
  // Prefix match — e.g. 'approve_application' matches 'approve_application_123'
  for (const [key, handler] of client.components) {
    if (customId.startsWith(key + '_')) return handler;
  }
  return null;
}
