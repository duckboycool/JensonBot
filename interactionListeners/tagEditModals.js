const { validateTagName } = require('../slashCommandCategories/messageTags');
const { dbQueryOne, dbExecute } = require('../lib');
const { MessageFlags } = require('discord.js');

module.exports = async (client, interaction) => {
  // Only listen for modal submissions
  if (!interaction.isModalSubmit()) { return; }

  // Only listen for the target interaction having customId eventRoom
  if (!interaction.hasOwnProperty('customId') || !interaction.customId.startsWith('tagEdit')) { return; }

  // Get tag name
  const commandParts = interaction.customId.split('-');
  const tagName = commandParts[1];

  const newContent = interaction.fields.getTextInputValue('tagInput');
  const visibilityString = interaction.fields.getStringSelectValues('visibility')[0];
  const newVisibility = visibilityString === 'ad-only' ? 1 : visibilityString === 'main-only' ? 0 : -1;

  const sql = 'SELECT id FROM message_tags WHERE tagName=?';
  const existingTag = await dbQueryOne(sql, [tagName]);

  if (!existingTag) {
    // Save new tag to database
    const sql = 'INSERT message_tags (tagName, tagContent, createdByUserId, visibilityType) VALUES (?, ?, ?, ?)';
    await dbExecute(sql, [tagName, newContent, interaction.user.id, newVisibility]);

    return interaction.reply({
      content: `Created new tag \`${tagName}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    let newTagName = tagName;
    const rename = interaction.fields.getTextInputValue('tagRenameInput');
    if (rename) {
      if (!await validateTagName(interaction, rename)) {
        return;
      }

      const renameConflict = await dbQueryOne('SELECT id FROM message_tags WHERE tagName=?', [rename]);
      if (renameConflict) {
        return interaction.reply({
          content: `Edit failed, there is an existing \`${rename}\` tag.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      newTagName = rename;
    }

    const sql = `UPDATE message_tags SET tagName=?, tagContent=?, createdByUserId=?, visibilityType=? WHERE id=?`;
    await dbExecute(sql, [newTagName, newContent, interaction.user.id, newVisibility, existingTag.id]);

    if (rename) {
      return interaction.reply({
        content: `Changed \`${tagName}\` to \`${rename}\`.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      return interaction.reply({
        content: `Updated \`${tagName}\` tag.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
};
