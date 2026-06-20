const { EmbedBuilder } = require('discord.js');
const { findDepartment, getDepartmentRoles } = require('../utils/departmentStore');
const { handleLevelSearchInteraction } = require('../utils/levelSearchSessions');
const { handleGiveawayInteraction } = require('../utils/giveawayService');
const { handleAuraTopInteraction } = require('../prefixcommands/aura');

// ─── Helper inline (si no usás departmentHelpers.js separado) ─────────────────
// Si ya tenés un interactionCreate con slash commands, integrá solo el bloque
// del selectMenu dentro de tu execute() existente.

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (await handleGiveawayInteraction(interaction)) {
      return;
    }

    if (await handleLevelSearchInteraction(interaction)) {
      return;
    }

    if (await handleAuraTopInteraction(interaction)) {
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands?.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error('[autocomplete]', error);
        }
      }
      return;
    }

    // ── Select menu de departamentos ─────────────────────────────────────────
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith('department_select')
    ) {
      await interaction.deferReply({ ephemeral: true });

      const URUDASHER_ROLE_ID = '1487919461100163163';
      const hasUrudasherRole = interaction.member?.roles.cache.has(URUDASHER_ROLE_ID);

      if (!hasUrudasherRole) {
        const embed = new EmbedBuilder()
          .setTitle('🚫 Acceso denegado')
          .setDescription('Necesitás el rol de **urudasher** para asignarte un departamento.')
          .setColor(0xED4245);
        return interaction.editReply({ embeds: [embed] });
      }

      const selected = interaction.values[0]; // valor = nombre del departamento
      const department = findDepartment(selected);

      if (!department) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Departamento inválido')
          .setDescription(`No encontré el departamento \`${selected}\`.`)
          .setColor(0xED4245);
        return interaction.editReply({ embeds: [embed] });
      }

      const departmentRoles = getDepartmentRoles();
      const roleId = departmentRoles[department.name];

      if (!roleId) {
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Rol no configurado')
          .setDescription(`El rol para **${department.name}** no está configurado. Contactá a un admin.`)
          .setColor(0xFAA61A);
        return interaction.editReply({ embeds: [embed] });
      }

      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) {
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Rol eliminado')
          .setDescription(`El rol de **${department.name}** fue eliminado del servidor. Contactá a un admin.`)
          .setColor(0xFAA61A);
        return interaction.editReply({ embeds: [embed] });
      }

      // Remover otros roles de departamento y asignar el nuevo
      const userDeptRoles = interaction.member.roles.cache.filter(r =>
        Object.values(departmentRoles).includes(r.id)
      );
      const previousRole = userDeptRoles.first() ?? null;

      for (const [, deptRole] of userDeptRoles) {
        if (deptRole.id !== roleId) {
          await interaction.member.roles.remove(deptRole).catch(() => null);
        }
      }
      await interaction.member.roles.add(role).catch(() => null);

      const embed = new EmbedBuilder()
        .setTitle('✅ Departamento asignado')
        .setDescription(`Ahora sos parte de **${department.name}**`)
        .setColor(0x57F287)
        .addFields(
          { name: '📍 Departamento', value: role.toString(), inline: true },
          previousRole
            ? { name: '🔄 Anterior', value: previousRole.toString(), inline: true }
            : { name: '🆕 Primer departamento', value: 'Bienvenido', inline: true },
          {
            name: '⏰ Asignado',
            value: `<t:${Math.floor(Date.now() / 1000)}:f>`,
            inline: false,
          }
        )
        .setFooter({ text: `Sistema de departamentos • ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── Slash commands (si los tenés, poné tu lógica existente acá) ──────────
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands?.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        const payload = { content: '❌ Error ejecutando el comando.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload).catch(() => null);
        } else {
          await interaction.reply(payload).catch(() => null);
        }
      }
    }
  },
};