const { dbQueryOne, dbExecute, verifyLeadModRole } = require('../lib');
const { SlashCommandBuilder, MessageFlags, InteractionContextType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  category: 'Message History',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('set-message-history')
        .setDescription('Set channel to log edited and deleted messages.')
        .addChannelOption((opt) => opt
          .setName('channel')
          .setDescription('Channel to set as message history channel')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      async execute(interaction) {
        if (!await verifyLeadModRole(interaction.member)) {
          return interaction.reply({
            content: 'Message history can only be edited by lead mods.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const channel = interaction.options.getChannel('channel', true);

        const sql = `SELECT go.id
                     FROM guild_options go
                     JOIN guild_data gd ON go.guildDataId = gd.id
                     WHERE gd.guildId=?`;
        const options = await dbQueryOne(sql, [interaction.guild.id]);

        await dbExecute('UPDATE guild_options SET messageHistoryChannelId=? WHERE id=?', [channel.id, options.id]);

        return interaction.reply({
          content: `Message history channel has been set to ${channel}.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  ],
};
