module.exports = {
  name: 'list',
  aliases: ['incomelist', 'ilist'],
  help: {
    purpose: 'Atajo de `-income list`.',
    category: '💰 Economía',
  },
  async execute(message) {
    const incomeCommand = message.client.prefixCommands?.get('income');
    if (!incomeCommand) {
      return message.reply('No pude encontrar el comando `income`.');
    }
    return incomeCommand.execute(message, ['list']);
  },
};
