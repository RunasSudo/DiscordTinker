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
	DiscordTinker.UI.popoutButtons.push({
		label: 'React Text',
		onClick: function(optionPopout) {
			var text = window.prompt('React text?');
			if (text) {
				DiscordTinker.Chat.addTextReacts(optionPopout.props.message.id, DiscordTinker.Chat.getChannelIds()[1], text);
			}
			optionPopout.props.onClose();
		}
	});
	
	DiscordTinker.Chat.addReact = function(messageId, channelId, react, callback) {
		DiscordTinker.HTTP.xhr('PUT', 'https://discordapp.com/api/channels/' + channelId + '/messages/' + messageId + '/reactions/' + react + '/@me', function(xhr) {
			console.log(xhr);
			callback(xhr);
		});
	};
	
	DiscordTinker.Chat.addTextReacts = function(messageId, channelId, text) {
		// Compute reacts
		var reacts = [];
		for (var c of text) {
			if (c.toLowerCase() >= 'a' && c.toLowerCase() <= 'z') {
				var letter_index = c.toLowerCase().charCodeAt(0) - 97;
				var emoji = String.fromCodePoint(0x1f1e6 + letter_index);
				if (reacts.indexOf(emoji) < 0) {
					reacts.push(emoji);
				} else {
					// Repeat letter
					if (c === 'a' && reacts.indexOf(String.fromCodePoint(0x1f170)) < 0)
						reacts.push(String.fromCodePoint(0x1f170));
					else if (c === 'b' && reacts.indexOf(String.fromCodePoint(0x1f171)) < 0)
						reacts.push(String.fromCodePoint(0x1f171));
					else if (c === 'o' && reacts.indexOf(String.fromCodePoint(0x30, 0xfe0f, 0x20e3)) < 0)
						reacts.push(String.fromCodePoint(0x30, 0xfe0f, 0x20e3));
					else if (c === 'o' && reacts.indexOf(String.fromCodePoint(0x1f17e)) < 0)
						reacts.push(String.fromCodePoint(0x1f17e));
					else if (c === 'i' && reacts.indexOf(String.fromCodePoint(0x31, 0xfe0f, 0x20e3)) < 0)
						reacts.push(String.fromCodePoint(0x31, 0xfe0f, 0x20e3));
					else {
						window.alert('Don\'t know how to repeat character: ' + c);
						return;
					}
				}
			} else {
				window.alert('Unsupported character: ' + c);
				return;
			}
		}
		
		var i = 0;
		function doOneReact() {
			DiscordTinker.Chat.addReact(messageId, channelId, reacts[i], callback);
		}
		function callback(xhr) {
			if (xhr.status == 204) {
				i++;
				if (i < text.length) {
					doOneReact();
				}
			}
		}
		
		doOneReact();
	};
	
	DiscordTinker.UI.commands['react'] = function(command, commandBits) {
		var msgId = commandBits[1];
		// Get the message
		var channelId = DiscordTinker.Chat.getChannelIds()[1];
		DiscordTinker.Chat.addTextReacts(msgId, channelId, commandBits.slice(2).join(' '));
	};
})();
