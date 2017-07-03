// ==UserScript==
// @name        DiscordTinker
// @namespace   https://yingtongli.me
// @include     https://discordapp.com/*
// @version     1
// @grant       none
// @run-at document-start
// ==/UserScript==

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

USER_AGENT = 'DiscordTinker (https://runassudo.github.io, ' + GM_info.script.version + ')'

console.log('DiscordTinker ' + GM_info.script.version + ' loaded!')
// Discord now unsets window.localStorage for security. We will restore it so we can access it from the script.
// WARNING: This opens the user up to potential attacks on the API token. Take care!
window._localStorage = window.localStorage;

window.token = JSON.parse(_localStorage.getItem('token'));
window.ws = undefined;

var isWsReady = false;
var lastS = null; // Required for heartbeat responses
var heartbeatTimer;

window.addEventListener('load', function() {
	var xhr = new XMLHttpRequest();
	xhr.open('GET', 'https://discordapp.com/api/gateway');
	xhr.setRequestHeader('Authorization', token);
	xhr.setRequestHeader('User-Agent', USER_AGENT);
	xhr.addEventListener('load', function() {
		var gatewayResponse = JSON.parse(this.responseText);
		window.ws = new WebSocket(gatewayResponse.url + '?v=5&encoding=json');
		ws.onerror = function() {
			console.log('A DiscordTinker error occurred');
		}
		ws.onclose = function(event) {
			console.log('DiscordTinker websocket closed');
			console.log(event);
			closeWS();
		}
		ws.onmessage = function(event) {
			var msg = JSON.parse(event.data);
			//console.log(msg);
			switch (msg.op) {
				case 10:
					// Hello
					// Begin sending heartbeats
					heartbeatTimer = setInterval(function() {
						ws.send(JSON.stringify({
							op: 1,
							d: lastS
						}));
					}, msg.d.heartbeat_interval * 0.9);
					// Send Identify
					ws.send(JSON.stringify({
						op: 2,
						d: {
							token: token,
							properties: {
								'$os': 'linux',
								'$browser': 'DiscordTinker',
								'$device': 'DiscordTinker',
								'$referrer': '',
								'$referring_domain': ''
							},
							compress: false,
							large_threshold: 50,
							shard: [0, 1]
						}
					}));
					break;
				case 0:
					// Dispatch
					lastS = msg.s;
					switch (msg.t) {
						case 'READY':
							console.log('DiscordTinker websocket ready');
							isWsReady = true;
					}
					break;
			}
		}
	});
	xhr.send();

	window.closeWS = function() {
		isWsReaady = false;
		clearInterval(heartbeatTimer);
		ws.close();
	}

	window.setStatus = function(status) {
		ws.send(JSON.stringify({
			op: 3,
			d: {
				idle_since: null,
				game: {
					name: status
				}
			}
		}));
	}

	window.sendEmbed = function(authorName, authorIcon, description, time) {
		var channelId = window.location.href.split('/')[5];
		var xhr = new XMLHttpRequest();
		xhr.open('POST', 'https://discordapp.com/api/channels/' + channelId + '/messages');
		xhr.setRequestHeader('Authorization', token);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.setRequestHeader('User-Agent', USER_AGENT);
		xhr.addEventListener('load', function() {
			console.log(this);
		});
		xhr.send(JSON.stringify({
			embed: {
				description: description,
				timestamp: time,
				author: {
					name: authorName,
					icon_url: authorIcon
				}
			}
		}));
	}

	window.addEventListener('keypress', function(evt) {
		if (evt.key === 'q' && evt.altKey) {
			// Commands!
			var command = prompt('DiscordTinker command:');
			if (command === null) {
				return;
			}
			var commandBits = command.split(' ');
			if (commandBits.length == 0) {
				return;
			}
			switch (commandBits[0]) {
				case 'quote':
					var msgId = commandBits[1];
					// Get the message
					var channelId = window.location.href.split('/')[5];
					var xhr = new XMLHttpRequest();
					// For some reason the channels/ID/messages/ID endpoint is restricted to bots only
					xhr.open('GET', 'https://discordapp.com/api/channels/' + channelId + '/messages?around=' + msgId);
					xhr.setRequestHeader('Authorization', token);
					xhr.setRequestHeader('User-Agent', USER_AGENT);
					xhr.addEventListener('load', function() {
						console.log(this);
						var messages = JSON.parse(this.responseText);
						for (var message of messages) {
							if (message.id === msgId) {
								sendEmbed(message.author.username, 'https://cdn.discordapp.com/avatars/' + message.author.id + '/' + message.author.avatar + '.png?size=64', message.content, message.timestamp);
							}
						}
					});
					xhr.send();
					break;
				default:
					alert('Unknown command');
			}
		}
	});
});
