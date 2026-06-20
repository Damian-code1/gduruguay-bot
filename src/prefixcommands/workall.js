module.exports = {
  name: 'workall',
  aliases: ['all'],
  help: {
    purpose: 'Ejecuta todos los métodos de income disponibles de una sola vez.',
    category: '💰 Economía',
  },
  async execute(message) {
    const incomeCommand = message.client.prefixCommands?.get('income');
    if (!incomeCommand) {
      return message.reply('No pude encontrar el comando `income`.');
    }

    return incomeCommand.execute(message, ['all']);
  },
};