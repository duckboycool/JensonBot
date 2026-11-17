const { MessageMentions, PermissionFlagsBits, messageLink } = require('discord.js');
const { dbQueryOne } = require('../lib.js');

const period = 16_000; // ms window for meeting threshold
const purge_period = 180_000; // ms window to store/purge prior messages
const threshold = 24; // Number of points needed to activate

const spamPoints = (messageList) => {
  const channelIds = new Set(messageList.map((message) => message.channelId));

  let points = 3 * channelIds.size;
  for (const channelId of channelIds) {
    // Add up number of attachments in a message in each channel, but cap at 3
    const channelMessages = messageList.filter((m) => m.channelId === channelId);
    const highest = Math.max(...channelMessages.map((m) => m.attachments.size));
    points += Math.min(highest, 3);

    // Add extra points for attempted role/everyone pings
    if (channelMessages.find((m) => m.content.search(MessageMentions.EveryonePattern) !== -1
      || m.content.search(MessageMentions.RolesPattern) !== -1)) {
      points += 2;
    }

    // Add extra points for links, with an additional one for discord invites
    if (channelMessages.find((m) => m.content.search(/discord\.gg\/\S/) !== -1)) {
      points += 3;
    } else if (channelMessages.find((m) => m.content.search(/https?:\/\/\S/) !== -1)) {
      points += 2;
    }
  };

  return points;
};

module.exports = async (client, message) => {
  // Ignore mod messages. Could use verifyModRole, but that might send a request on every message.
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages) || message.author.bot) {
    return;
  }

  if (client.purgeTimes.get(message.author.id) > message.createdTimestamp - period) {
    await message.delete();
    return;
  }

  let recent = client.recentMessages.get(message.author.id);
  if (recent == null) {
    client.recentMessages.set(message.author.id, [message]);
    return;
  }

  recent = recent.filter((old) => message.createdTimestamp < old.createdTimestamp + purge_period);
  recent.push(message);

  const spamTest = recent.filter((old) => message.createdTimestamp < old.createdTimestamp + period)
  const points = spamPoints(spamTest);
  if (points >= threshold) {
    let sql = `SELECT go.id, go.alertsChannelId, go.spamPurge
               FROM guild_options go
               JOIN guild_data gd ON go.guildDataId = gd.id
               WHERE gd.guildId=?`;
    const options = await dbQueryOne(sql, [message.guild.id]);

    client.purgeTimes.set(message.author.id, message.createdTimestamp);

    if (options.spamPurge) {
      await message.member.timeout(60 * 60 * 1000, `Hit spam filter with ${spamTest.length} messages.`);

      // Have to delete messages one channel at a time
      const sent = new Set(recent.map((message) => message.channel));
      for (const channel of sent) {
        try {
          await channel.bulkDelete(recent.filter((message) => message.channelId === channel.id));
        } catch (e) {
          console.error(`Hit error while trying to purge spam messages for ${message.author.id}`);
          console.error(e);
        }
      }
    }

    client.recentMessages.delete(message.author.id);

    if (!options?.alertsChannelId) {
        console.debug('No alerts channel set, skipping');
        return;
    }
    const alertsChannel = await message.guild.channels.fetch(options.alertsChannelId);

    const timestamps = spamTest.map((msg) => msg.createdTimestamp);
    // Keep 1 decimal point while dividing ms by 1000
    const duration = Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 100) / 10;

    let content = `Found ${message.author} for spam detection. Hit ${points}/${threshold} "spam points" ` +
      `in ${spamTest.length} messages (in ${duration}/${period/1000} seconds).\n\n`;

    if (!options.spamPurge) {
      content += 'Would have deleted the following messages:';

      for (const message of recent) {
        content += `\n* ${messageLink(message.channelId, message.id, message.guildId)}`;
      }
    }

    await alertsChannel.send({
      content: content
    });
  } else {
    // Not really an optimal solution, but re-fetching should help with dropping messages
    let nowRecent = client.recentMessages.get(message.author.id);
    nowRecent = nowRecent.filter((old) => message.createdTimestamp < old.createdTimestamp + purge_period);
    nowRecent.push(message);
    client.recentMessages.set(message.author.id, nowRecent);
  }
};
