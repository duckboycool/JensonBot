const { dbQueryOne, dbQueryAll, dbExecute, tagNameMaxLen, tagContentMaxLen } = require('../lib');
const { ModalBuilder, LabelBuilder, SlashCommandBuilder, TextInputBuilder, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, GuildNSFWLevel, InteractionContextType, MessageFlags, PermissionFlagsBits,
  TextInputStyle } = require('discord.js');

const autocompleteTag = async (interaction) => {
  const curValue = interaction.options.getString('tag-name', true);

  const sql = `SELECT DISTINCT tagName, tags.id FROM
    (SELECT tagName, tagName alias, id, visibilityType FROM message_tags UNION
     SELECT tagName, alias, tagId id, visibilityType FROM tag_aliases
     JOIN message_tags ON message_tags.id=tag_aliases.tagId) tags
    WHERE LOCATE(?, alias) LIMIT 25`;
  const matches = await dbQueryAll(sql, [curValue]);

  return interaction.respond(matches.map((tag) => ({ name: tag.tagName, value: tag.tagName })));
};

module.exports = {
  category: 'Message Tags',
  commands: [
    {
      longDescription: 'Add or update a message tag. If a user includes this tag in any part of ' +
        'a message, the bot will respond with the content of this tag. Tags may contain only letters, ' +
        'numbers, and underscores.',
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-edit')
        .setDescription('Update a message tag, or create a new one if not present.')
        .addStringOption((opt) => opt
          .setName('tag-name')
          .setDescription('The tag to create/edit')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const tagName = interaction.options.getString('tag-name').toLowerCase();
        if (!await module.exports.validateTagName(interaction, tagName)) {
          return;
        }

        sql = 'SELECT id, tagContent, visibilityType FROM message_tags WHERE tagName=?';
        const existingTag = await dbQueryOne(sql, [tagName]);

        const editModal = new ModalBuilder()
          .setCustomId(`tagEdit-${tagName}`)
          .setTitle(`${existingTag ? 'Edit' : 'Add'} &${tagName} Tag`);

        const editBox = new TextInputBuilder()
          .setCustomId('tagInput')
          .setRequired(true)
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(1)
          .setMaxLength(tagContentMaxLen)
          .setPlaceholder('Edit tag content...');

        const contentLabel = new LabelBuilder()
          .setLabel('Tag Content')
          .setTextInputComponent(editBox)
          .setDescription('You can use the templates {{mainonly|...}} or {{adonly|...}} for server-specific text.');

        const visibilitySelect = new StringSelectMenuBuilder()
          .setCustomId('visibility')
          .setRequired(true)
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('Global')
              .setDescription('Can be used in any server.')
              .setValue('global')
              .setDefault(!existingTag?.visibilityType == null || existingTag?.visibilityType === -1),
            new StringSelectMenuOptionBuilder()
              .setLabel('Main-Only')
              .setDescription('Can only be used in servers that are not age-restricted.')
              .setValue('main-only')
              .setDefault(existingTag?.visibilityType === 0),
            new StringSelectMenuOptionBuilder()
              .setLabel('AD-Only')
              .setDescription('Can only be used in servers that are age-restricted.')
              .setValue('ad-only')
              .setDefault(existingTag?.visibilityType === 1),
          );

        const visibilityLabel = new LabelBuilder()
          .setLabel('Visibility')
          .setStringSelectMenuComponent(visibilitySelect);
          
        editModal.addLabelComponents(contentLabel, visibilityLabel);

        if (existingTag) {
          editBox.setValue(existingTag.tagContent);

          const renameInput = new TextInputBuilder()
            .setCustomId('tagRenameInput')
            .setRequired(false)
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(tagNameMaxLen)
            .setPlaceholder('New tag name...');

          const renameLabel = new LabelBuilder()
            .setLabel('New Tag Name')
            .setTextInputComponent(renameInput)
            .setDescription('Enter new tag name, or leave empty to keep current name.');

          editModal.addLabelComponents(renameLabel);
        }

        return interaction.showModal(editModal);
      },
      autocomplete: autocompleteTag
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-delete')
        .setDescription('Remove a message &tag.')
        .addStringOption((opt) => opt
          .setName('tag-name')
          .setDescription('Name of the tag to be removed')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const tagName = interaction.options.getString('tag-name').toLowerCase();

        // If the tag does not exist, inform the user
        const existing = await dbQueryOne('SELECT id FROM message_tags WHERE tagName=?', [tagName]);
        if (!existing) {
          return interaction.reply({
            content: `The \`${tagName}\` tag does not exist.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        // Delete the tag from the database
        await dbExecute('DELETE FROM message_tags WHERE id=?', [existing.id]);
        await dbExecute('DELETE FROM tag_aliases WHERE tagId=?', [existing.id]);

        return interaction.reply({
          content: `Deleted tag \`${tagName}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      },
      autocomplete: autocompleteTag
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-alias')
        .setDescription('Add an alias to an existing &tag.')
        .addStringOption((opt) => opt
          .setName('tag-name')
          .setDescription('The tag to add an alias to')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .addStringOption((opt) => opt
          .setName('alias')
          .setDescription('The alias to be added')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const tagName = interaction.options.getString('tag-name').toLowerCase();
        const alias = interaction.options.getString('alias').toLowerCase();

        // Tags may contain only alphanumeric characters
        if (alias.search(/\W/) > -1) {
          return interaction.reply({
            content: 'Tag names may contain only letters, numbers, and underscores.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const tagId = await dbQueryOne('SELECT id FROM message_tags WHERE tagName=?', [tagName]);
        if (!tagId) {
          return interaction.reply({
            content: `Could not find tag \`${tagName}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const existingTag = await dbQueryOne('SELECT 1 FROM message_tags WHERE tagName=?', [alias]);
        if (existingTag) {
          return interaction.reply({
            content: `There is already a \`${alias}\` tag.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const sql = `SELECT tagName FROM tag_aliases alias JOIN message_tags tag ON alias.tagId=tag.id WHERE alias=?`;
        const existingAlias = await dbQueryOne(sql, [alias]);
        if (existingAlias) {
          return interaction.reply({
            content: `The \`${existingAlias.tagName}\` tag already has \`${alias}\` as an alias.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        // Save new alias to database
        await dbExecute('INSERT INTO tag_aliases (tagId, alias) VALUES (?, ?)', [tagId.id, alias]);

        return interaction.reply({
          content: `Set \`${alias}\` as an alias for tag \`${tagName}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      },
      autocomplete: autocompleteTag
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-unalias')
        .setDescription('Remove an existing alias for a &tag.')
        .addStringOption((opt) => opt
          .setName('tag-name')
          .setDescription('The tag to remove an alias from')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .addStringOption((opt) => opt
          .setName('alias')
          .setDescription('The alias to be removed')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const tagName = interaction.options.getString('tag-name').toLowerCase();
        const alias = interaction.options.getString('alias').toLowerCase();

        const tagId = await dbQueryOne('SELECT id FROM message_tags WHERE tagName=?', [tagName]);
        if (!tagId) {
          return interaction.reply({
            content: `Could not find tag \`${tagName}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const aliasId = await dbQueryOne(
          'SELECT alias.id FROM tag_aliases alias WHERE tagId=? AND alias=?', [tagId.id, alias]
        );
        if (!aliasId) {
          return interaction.reply({
            content: `Could not find the alias \`${alias}\` on \`${tagName}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        // Remove alias from db
        await dbExecute('DELETE FROM tag_aliases WHERE id=?', [aliasId.id]);

        return interaction.reply({
          content: `Removed \`${alias}\` as an alias for tag \`${tagName}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      },
      async autocomplete(interaction) {
        const field = interaction.options.getFocused(true);
        if (field.name === 'tag-name') {
          return autocompleteTag(interaction);
        }

        const tagName = interaction.options.getString('tag-name');
        if (!tagName || field.name !== 'alias') {
          return interaction.respond([]);
        }
        const match = await dbQueryOne('SELECT * FROM message_tags WHERE tagName=?', [tagName]);
        if (!match) {
          return interaction.respond([]);
        }

        const sql = `SELECT alias FROM tag_aliases WHERE tagId=? AND LOCATE(?, alias) LIMIT 25`;
        const matches = await dbQueryAll(sql, [match.id, field.value]);

        return interaction.respond(matches.map((match) => ({ name: match.alias, value: match.alias })));
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-list')
        .setDescription('List all &tags available on this server.')
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        // Fetch tags usable in guild
        const guildType = Number(interaction.guild.nsfwLevel === GuildNSFWLevel.AgeRestricted);
        let sql = `SELECT tagName, id FROM message_tags
                   WHERE visibilityType = -1 OR visibilityType = ?
                   ORDER BY tagName`;
        const tags = await dbQueryAll(sql, [guildType]);

        const aliasList = await dbQueryAll('SELECT alias, tagId FROM tag_aliases');
        const aliasMap = new Map();
        for (const alias of aliasList) {
          // Too bad getOrInsert doesn't exist here
          let tagAliases = aliasMap.get(alias.tagId);
          if (tagAliases == null) {
            tagAliases = [];
            aliasMap.set(alias.tagId, tagAliases);
          }
          tagAliases.push(alias.alias);
        }

        // If there are no tags available for this guild, inform the user
        if (tags.length === 0) {
          return interaction.reply('There are currently no tags available on this server.');
        }

        // Build a string containing all the tag names surrounded by backticks
        let tagString = '';
        for (const tag of tags) {
          tagString += `\`${tag.tagName}\``;
          const aliases = aliasMap.get(tag.id);
          if (aliases?.length > 0) {
            tagString += ` (alias${aliases.length > 1 ? 'es' : ''}: \`${aliases.join('`, `')}\`)`
          }
          tagString += ', ';
        }
        tagString = tagString.slice(0, -2);
        tagString = `The following tags are available on this server:\n${tagString}`;

        // Send the list of tags to the user
        if (tagString.length <= 2000) {
          return interaction.reply(tagString);
        } else {
          return interaction.reply('Message tag list is too long to send!');
        }
      }
    }
  ],

  validateTagName: async (interaction, tagName) => {
    // Tags may contain only alphanumeric characters
    if (tagName.search(/\W/) > -1) {
      interaction.reply({
        content: 'Tag names may contain only letters, numbers, and underscores.',
        flags: MessageFlags.Ephemeral,
      });
      return false;
    }

    const sql = 'SELECT tagName FROM tag_aliases alias JOIN message_tags tag ON alias.tagId=tag.id WHERE alias=?';
    const existingAlias = await dbQueryOne(sql, [tagName]);
    if (existingAlias) {
      interaction.reply({
        content: `The \`${existingAlias.tagName}\` tag already has \`${tagName}\` as an alias.`,
        flags: MessageFlags.Ephemeral,
      });
      return false;
    }

    return true;
  }
};
