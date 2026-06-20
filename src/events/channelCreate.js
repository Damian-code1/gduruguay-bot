const { getMuteRoleId, applyMuteRoleToChannel } = require('../utils/muteRoleStore');

module.exports = {
  name: 'channelCreate',
  async execute(channel) {
    if (!channel?.guild) return;

    const muteRoleId = getMuteRoleId(channel.guild.id);
    if (!muteRoleId) return;

    await applyMuteRoleToChannel(channel, muteRoleId, 'Mute role sync (channel create)').catch(() => null);
  },
};