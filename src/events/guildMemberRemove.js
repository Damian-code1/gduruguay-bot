'use strict';

const { updatePresence } = require('../utils/presence');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    await updatePresence(member.client);
  },
};
