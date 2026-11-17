// No easy way to get this directly from the messageListener
const purge_period = 180_000;

module.exports = (client) => {
  const curTime = Date.now();
  const startLength = client.recentMessages.size;
  let startMessageCount = 0;
  let endMessageCount = 0;

  for (const [user, messages] of client.recentMessages.entries()) {
    startMessageCount += messages.length;
    const filtered = messages.filter((msg) => curTime < msg.createdTimestamp + purge_period);
    endMessageCount += filtered.length;

    if (filtered.length == 0) {
      client.recentMessages.delete(user);
    } else {
      client.recentMessages.set(user, filtered);
    }
  }

  const purgeLength = client.purgeTimes.size;

  for (const [user, time] of client.purgeTimes.entries()) {
    if (curTime > time + purge_period) {
      client.purgeTimes.delete(user);
    }
  }

  console.log(`Cleared spam logs from ${startLength} users to ${client.recentMessages.size}, ` +
    `${startMessageCount} messages to ${endMessageCount}, ${purgeLength} purges to ${client.purgeTimes.size}.`);
};
