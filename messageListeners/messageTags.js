const { GuildNSFWLevel } = require ('discord.js');
const { dbQueryOne } = require('../lib');
const msCooldown = 10_000; // Per tag, and per channel

module.exports = async (client, message) => {
  // Preprocess string to remove code blocks
  // This detection is definitely not perfect, but hopefully it'll be enough to suffice in practice
  // If not, the best option would probably be to bring in a discord markdown parsing lib
  const searchContent = message.content.replaceAll(/(?<!\\)(?:```.+?```|(`{1,2}).*?[^`]\1(?!`))/gs, '');
  // Extract and deduplicate tags present
  const messageTags = new Set(searchContent.match(/(?<=\B&)\w+/g));

  // If there are no tags in this message, do nothing
  if (messageTags.size === 0) { return; }

  const guildType = Number(message.guild.nsfwLevel === GuildNSFWLevel.AgeRestricted);

  // Send each tag message to the channel in a separate message, in order of message
  for (let tag of messageTags) {
    // Fetch the tag message from the database
    let sql = `SELECT DISTINCT mt.id, mt.tagContent
               FROM message_tags mt
               LEFT JOIN tag_aliases alias ON mt.id=alias.tagId
               WHERE ? IN (tagName, alias) AND (visibilityType = -1 OR visibilityType = ?)`;
    const row = await dbQueryOne(sql, [tag, guildType]);

    if (row != null) {
      // Cooldown also deduplicates different casing/aliases in a single message
      const lastTimestamp = client.lastTagUse.get(`${row.id};${message.channelId}`);
      if (lastTimestamp == null || message.createdTimestamp > lastTimestamp + msCooldown) {
        let content = row.tagContent;
        if (guildType === 0) {
          content = content.replaceAll(/{{adonly\|.+?}}/gs, '');
          content = content.replaceAll(/{{mainonly\|(.+?)}}/gs, '$1');
        } else if (guildType === 1) {
          content = content.replaceAll(/{{mainonly\|.+?}}/gs, '');
          content = content.replaceAll(/{{adonly\|(.+?)}}/gs, '$1');
        }
        await message.channel.send(content);
        client.lastTagUse.set(`${row.id};${message.channelId}`, message.createdTimestamp);
      }
    }
  }
};
