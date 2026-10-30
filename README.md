# JensonBot
This is the bot used for server moderation in the [Archipelago Discord](https://discord.gg/B5pjMYy). It is a fork of
[AginahBot](https://github.com/LegendaryLinux/AginahBot) with changes made for the Archipelago discord in particular,
so if you want to use the bot in your own server it may be easier to use/modify AginahBot directly.

The bot is open to possible changes, but it would likely be beneficial to gather feedback on ideas in the `#ap-bot-dev`
channel or a `#general-suggestions` thread in the discord first.

## Main Changes from AginahBot
- A rework of `&tag`s in messages, allowing them to be ignored inside of code blocks, sending them in order of apperance
in the message, adding cooldowns per tag/channel combo, and adding a tag aliasing system.
- A new system for maintaining a world listing for an `/apworld-info` command that sends channel and release link.
- Separated handling for Mod and Lead Mod roles, most importantly allowing regular mods to be able to see the mod
contacts they open (and for lead mods to choose visibility for regular mods for them).
- Overhaul of pin permissions into a thread management system, allowing users to change tags, set title, and add perms
to others. Make thread OPs have perms inherently.
- A new command to purge members from a thread who haven't sent a message in a certain time, based on
[the prior script](https://github.com/LegendaryLinux/AginahBot/blob/9081df6efad172ec80bff4dd9c6fc9aea47079f1/scripts/purgeForumThreadUsers.js).
- An alert pinging mods into a thread when it gets over a certain threshold of members in it.
- A spam filter based on sending messages quickly in multiple channels (especially with attachments or attempted pings).
- Auto-logging of mod contacts when resolving them, based on input channel/message in the command.
- Reworks of existing systems, especially the role requestor.
- Addition of [ArchipelaBot](https://github.com/LegendaryLinux/ArchipelaBot)'s funcionality, with some fixes/reworks.

# Self-Hosting

The setup to run this version of the bot is nearly the same as base AginahBot. The main differences are that the
`moderatorRole` config option would instead be `leadModRole` and the permissions integer between all functionality
of this bot is `4505025841982544`.
