module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log(`[Ready] Logged in as ${client.user.tag} (${client.user.id})`);
    console.log(`[Ready] Serving ${client.guilds.cache.size} guild(s).`);
  },
};
