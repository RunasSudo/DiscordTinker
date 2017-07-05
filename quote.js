/*
    DiscordTinker
    Copyright © 2017  RunasSudo (Yingtong Li)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

(function() {
	DiscordTinker.Int.ReactComponents.patchRender('OptionPopout', function(event, orig) {
		return function() {
			var result = orig.apply(this, arguments);
			result.props.children.push(DiscordTinker.Int.ReactComponents.createFunnyElement('div', { className: 'btn-item', onClick: function() {
				// props.message already contains the message object. How convenient!
				DiscordTinker.Chat.quoteMessage(event[1].message);
				event[1].onClose();
			} }, undefined, ['Quote']));
			return result;
		}
	});
	
	DiscordTinker.Chat.sendEmbed = function(authorName, authorIcon, description, time, color) {
		var embedObj = {
			description: description,
			timestamp: time,
			author: {
				name: authorName,
				icon_url: authorIcon
			}
		};
		if (color) {
			embedObj.color = color;
		}
		
		var channelId = DiscordTinker.Chat.getChannelIds()[1];
		DiscordTinker.HTTP.xhr('POST', 'https://discordapp.com/api/channels/' + channelId + '/messages', function(xhr) {
			console.log(xhr);
		}, {
			'Content-Type': 'application/json'
		}, JSON.stringify({
			embed: embedObj
		}));
	};
	DiscordTinker.Chat.quoteMessage = function(message, messageText) {
		if (messageText === undefined) {
			messageText = message.content;
		}
		
		var guildId = DiscordTinker.Chat.getChannelIds()[0];
		DiscordTinker.HTTP.xhr('GET', 'https://discordapp.com/api/guilds/' + guildId + '/members/' + message.author.id, function(xhr) {
			console.log(xhr);
			var guildMember = JSON.parse(xhr.responseText);
			var messageAuthorName = null;
			if (guildMember.nick === undefined) {
				messageAuthorName = message.author.username;
			} else {
				messageAuthorName = guildMember.nick;
			}
			
			DiscordTinker.HTTP.xhr('GET', 'https://discordapp.com/api/guilds/' + guildId, function(xhr) {
				console.log(xhr);
				var guild = JSON.parse(xhr.responseText);
				var color = (function() {
					for (var roleId of guildMember.roles) {
						for (var roleObj of guild.roles) {
							if (roleId == roleObj.id) {
								if (roleObj.color != 0) {
									return roleObj.color;
								}
								break; // Break out of inner loop, proceed to next role ID
							}
						}
					}
					return undefined;
				})();
				
				DiscordTinker.Chat.sendEmbed(messageAuthorName, 'https://cdn.discordapp.com/avatars/' + message.author.id + '/' + message.author.avatar + '.png?size=64', messageText, message.timestamp, color);
			});
		});
	};
	
	DiscordTinker.UI.commands['quote'] = function(command, commandBits) {
		var msgId = commandBits[1];
		// Get the message
		var channelId = DiscordTinker.Chat.getChannelIds()[1];
		DiscordTinker.HTTP.xhr('GET', 'https://discordapp.com/api/channels/' + channelId + '/messages?around=' + msgId, function(xhr) {
			console.log(xhr);
			var messages = JSON.parse(xhr.responseText);
			for (var message of messages) {
				if (message.id === msgId) {
					DiscordTinker.Chat.quoteMessage(message);
				}
			}
		});
	};
})();
