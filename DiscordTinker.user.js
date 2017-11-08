// ==UserScript==
// @name        DiscordTinker
// @namespace   https://yingtongli.me
// @include     https://discordapp.com/channels/*
// @version     7
// @grant       none
// @run-at      document-start
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

if (typeof(GM_info) === 'undefined') {
	// Dummy for testing purposes
	GM_info = {script: {}};
}

(function(DiscordTinker) {
	DiscordTinker.USER_AGENT = 'DiscordTinker (https://runassudo.github.io, ' + GM_info.script.version + ')';
	
	console.log('DiscordTinker ' + GM_info.script.version + ' loaded!');
	
	// Discord now unsets window.localStorage for security. We will restore it so we can access it from the script.
	// WARNING: This opens the user up to potential attacks on the API token. Take care!
	if (!DiscordTinker.localStorage) {
		DiscordTinker.localStorage = window.localStorage;
	}
	
	DiscordTinker.token = JSON.parse(DiscordTinker.localStorage.getItem('token'));
	
	// Miscellaneous utility functions
	DiscordTinker.Util = {};
	DiscordTinker.Util.onLoad = function(callback) {
		if (document.readyState === 'complete') {
			callback();
		} else {
			window.addEventListener('load', callback);
		}
	};
	
	// DiscordTinker Plugin API
	DiscordTinker.Plugin = {};
	DiscordTinker.Plugin.listeners = {};
	DiscordTinker.Plugin.addListener = function(eventType, listener) {
		if (DiscordTinker.Plugin.listeners[eventType] === undefined) {
			DiscordTinker.Plugin.listeners[eventType] = [];
		}
		DiscordTinker.Plugin.listeners[eventType].push(listener);
	};
	DiscordTinker.Plugin.removeListener = function(eventType, listener) {
		if (DiscordTinker.Plugin.listeners[eventType] !== undefined) {
			if (listener === undefined) {
				// Remove all listeners. Avoid in production.
				console.warn('Removing all listeners for ' + eventType);
				DiscordTinker.Plugin.listeners[eventType].length = 0;
			} else {
				var index = DiscordTinker.Plugin.listeners.indexOf(listener);
				if (index >= 0) {
					DiscordTinker.Plugin.listeners.splice(index, 1);
				} else {
					throw 'Attempted to remove non-existent listener';
				}
			}
		}
	};
	DiscordTinker.Plugin.fireEvent = function(eventType, event) {
		if (DiscordTinker.Plugin.listeners[eventType] !== undefined) {
			for (var listener of DiscordTinker.Plugin.listeners[eventType]) {
				listener(event);
			}
		}
	};
	
	// HTTP API handling
	DiscordTinker.HTTP = {};
	DiscordTinker.HTTP.xhr = function(method, url, callback, headers, payload) {
		var xhr = new XMLHttpRequest();
		
		xhr.open(method, url);
		
		xhr.setRequestHeader('Authorization', DiscordTinker.token);
		xhr.setRequestHeader('User-Agent', DiscordTinker.USER_AGENT);
		if (headers) {
			for (header in headers) {
				xhr.setRequestHeader(header, headers[header]);
			}
		}
		
		xhr.addEventListener('load', function() {
			callback(this);
		});
		
		if (payload) {
			xhr.send(payload);
		} else {
			xhr.send();
		}
	};
	
	// WebSocket low-level handling
	DiscordTinker.WebSocket = {};
	DiscordTinker.WebSocket.ws = null;
	DiscordTinker.WebSocket.wsIsReady = false;
	DiscordTinker.WebSocket.wsUrl = 'wss://gateway.discord.gg';
	DiscordTinker.WebSocket.connect = function() {
		DiscordTinker.WebSocket.ws = new WebSocket(DiscordTinker.WebSocket.wsUrl + '?v=5&encoding=json');
		DiscordTinker.WebSocket.ws.onmessage = DiscordTinker.WebSocket.onmessage;
		DiscordTinker.WebSocket.ws.onerror = DiscordTinker.WebSocket.onerror;
		DiscordTinker.WebSocket.ws.onclose = DiscordTinker.WebSocket.onclose;
	};
	DiscordTinker.WebSocket.connectAfterFailure = function() {
		DiscordTinker.HTTP.xhr('GET', 'https://discordapp.com/api/gateway', function(xhr) {
			var gatewayUrl = JSON.parse(xhr.responseText).url;
			if (gatewayUrl === DiscordTinker.WebSocket.wsUrl) {
				// Something's gone badly wrong
				// TODO: Exponential backoff
				console.log('DiscordTinker WebSocket URL hasn\'t changed. Retrying in 5 seconds.');
				setTimeout(DiscordTinker.WebSocket.connectAfterFailure, 5000);
			} else {
				console.log('DiscordTinker got new WebSocket URL: ' + gatewayUrl);
				DiscordTinker.WebSocket.wsUrl = gatewayUrl;
				DiscordTinker.WebSocket.connect();
			}
		});
	};
	
	DiscordTinker.WebSocket.onmessage = function(event) {
		var msg = JSON.parse(event.data);
		//console.log(msg);
		DiscordTinker.Gateway.onmessage(msg.op, msg.d, msg.s, msg.t);
	};
	DiscordTinker.WebSocket.onerror = function(event) {
		console.error('DiscordTinker WebSocket error', event);
		
		if (DiscordTinker.WebSocket.wsIsReady) {
			// Connection dropped, etc. Retry.
			DiscordTinker.WebSocket.connect();
		} else {
			// Incorrect websocket URL. Refresh.
			connectAfterFailure();
		}
		
		DiscordTinker.WebSocket.wsIsReady = false;
		DiscordTinker.Gateway.onclose();
	};
	DiscordTinker.WebSocket.onclose = function(event) {
		console.log('DiscordTinker WebSocket closed', event);
		DiscordTinker.WebSocket.wsIsReady = false;
		DiscordTinker.Gateway.onclose();
	};
	
	// High-level gateway API operations
	DiscordTinker.Gateway = {};
	DiscordTinker.Gateway.Op = {
		DISPATCH: 0,
		HEARTBEAT: 1,
		IDENTIFY: 2,
		STATUS_UPDATE: 3,
		VOICE_STATE_UPDATE: 4,
		VOICE_SERVER_PING: 5,
		RESUME: 6,
		RECONNECT: 7,
		REQUEST_GUILD_MEMBERS: 8,
		INVALID_SESSION: 9,
		HELLO: 10,
		HEARTBEAT_ACK: 11
	};
	
	DiscordTinker.Gateway.send = function(op, d, s, t) {
		msg = {op: op, d: d};
		if (s) {
			msg.s = s;
		}
		if (t) {
			msg.t = t;
		}
		DiscordTinker.WebSocket.ws.send(JSON.stringify(msg));
	};
	DiscordTinker.Gateway.onmessage = function(op, d, s, t) {
		switch (op) {
			case DiscordTinker.Gateway.Op.HELLO:
				console.log('DiscordTinker Gateway got Hello');
				// Begin sending heartbeats
				DiscordTinker.Gateway.heartbeatTimer = setInterval(DiscordTinker.Gateway.heartbeat, d.heartbeat_interval);
				// Send Identify
				DiscordTinker.Gateway.identify();
				break;
			case DiscordTinker.Gateway.Op.DISPATCH:
				DiscordTinker.Gateway.lastDispatchS = s;
				switch (t) {
					case 'READY':
						console.log('DiscordTinker WebSocket ready');
						DiscordTinker.WebSocket.wsIsReady = true;
				}
				break;
			case DiscordTinker.Gateway.Op.INVALID_SESSION:
				// Identify was rate limited
				console.error('DiscordTinker Gateway got Invalid Session. Retrying after 1 second');
				setTimeout(DiscordTinker.Gateway.identify, 1000);
				break;
		}
	};
	DiscordTinker.WebSocket.onclose = function() {
		clearInterval(DiscordTinker.Gateway.heartbeatTimer);
	};
	
	DiscordTinker.Gateway.identify = function() {
		DiscordTinker.Gateway.send(DiscordTinker.Gateway.Op.IDENTIFY, {
			token: DiscordTinker.token,
			properties: {
				'$os': 'linux',
				'$browser': 'DiscordTinker',
				'$device': 'DiscordTinker',
				'$referrer': '',
				'$referring_domain': ''
			},
			compress: false,
			large_threshold: 50,
			shard: [0, 1] // TODO: Remove
		});
	};
	
	DiscordTinker.Gateway.heartbeatTimer = null;
	DiscordTinker.Gateway.lastDispatchS = null;
	DiscordTinker.Gateway.heartbeat = function() {
		DiscordTinker.Gateway.send(DiscordTinker.Gateway.Op.HEARTBEAT, DiscordTinker.Gateway.lastDispatchS);
		DiscordTinker.Plugin.fireEvent('heartbeat');
	};
	
	DiscordTinker.WebSocket.connect();
	
	// Internal stuff
	DiscordTinker.Int = {};
	DiscordTinker.Int.WebpackModules = {};
	DiscordTinker.Int.WebpackModules.find = function(filter) {
		for (var i in DiscordTinker.Int.WebpackModules.require.c) {
			// Ignore inherited properties
			if (DiscordTinker.Int.WebpackModules.require.c.hasOwnProperty(i)) {
				var module = DiscordTinker.Int.WebpackModules.require.c[i].exports;
				if (module && module.__esModule && module.default) {
					module = module.default;
				}
				//console.log(module);
				if (module && filter(module)) {
					return module;
				}
			}
		}
		return null;
	};
	DiscordTinker.Int.WebpackModules.findByProperties = function(properties) {
		return DiscordTinker.Int.WebpackModules.find(function(module) {
			// Skip if primitive
			if (module !== Object(module)) {
				return false;
			}
			//console.log(Object.keys(module));
			for (var property of properties) {
				if (!(property in module)) {
					return false;
				}
			}
			return true;
		});
	};
	
	// We must wait for the Javascript to be loaded before patching
	DiscordTinker.Util.onLoad(function() {
		DiscordTinker.Int.WebpackModules.require = webpackJsonp([], {'__discord_tinker__': function(module, exports, req) { exports.default = req; }}, ['__discord_tinker__']).default;
		delete DiscordTinker.Int.WebpackModules.require.m['__discord_tinker__'];
		delete DiscordTinker.Int.WebpackModules.require.c['__discord_tinker__'];
		
		DiscordTinker.Int.React = DiscordTinker.Int.WebpackModules.findByProperties(['Component', 'PureComponent', 'Children', 'createElement', 'cloneElement']);
		var createElement = function() { // TODO: Patching API
			if (arguments[0].displayName) {
				if (DiscordTinker.Int.ReactComponents.components[arguments[0].displayName] !== arguments[0]) {
					DiscordTinker.Int.ReactComponents.components[arguments[0].displayName] = arguments[0];
					DiscordTinker.Plugin.fireEvent('reactNewComponent', arguments[0]);
				}
			}
			DiscordTinker.Plugin.fireEvent('reactCreateElement', arguments);
			var result = createElement.__discord_tinker_patched.apply(this, arguments);
			return result;
		};
		createElement.__discord_tinker_patched = DiscordTinker.Int.React.createElement.__discord_tinker_patched !== undefined ? DiscordTinker.Int.React.createElement.__discord_tinker_undefined : DiscordTinker.Int.React.createElement;
		DiscordTinker.Int.React.createElement = createElement;
	});
	
	DiscordTinker.Int.ReactComponents = {};
	DiscordTinker.Int.ReactComponents.components = {};
	DiscordTinker.Int.ReactComponents.createFunnyElement = function(type, props, key, children) {
		// a la r(type, props, key, children...)
		props.children = children;
		return {
			$$typeof: Symbol.for('react.element'),
			type: type,
			key: key === undefined ? null : '' + key,
			ref: null,
			props: props,
			_owner: null
		};
	}
	DiscordTinker.Int.ReactComponents.getComponent = function(displayName, callback) {
		if (DiscordTinker.Int.ReactComponents.components[displayName] !== undefined) {
			// Component already loaded. Callback immediately.
			callback(DiscordTinker.Int.ReactComponents.components[displayName]);
		} else {
			// Component not yet loaded. Register an event to callback when loaded.
			var listener = function(component) {
				if (component.displayName === displayName) {
					callback(component);
					DiscordTinker.Plugin.removeListener('reactNewComponent', listener);
				}
			};
			DiscordTinker.Plugin.addListener('reactNewComponent', listener);
		}
	};
	DiscordTinker.Int.ReactComponents.patchRender = function(displayName, callback) {
		// Every time we create an element, we need to patch the render function
		DiscordTinker.Plugin.addListener('reactCreateElement', function(event) {
			if (event[0].displayName === displayName) {
				var orig = event[0].prototype.render;
				if (orig.__discord_tinker_patched) { // TODO: Patching API
					orig = orig.__discord_tinker_patched;
				}
				event[0].prototype.render = callback(event, orig);
				event[0].prototype.render.__discord_tinker_patched = orig;
			}
		});
	};
	
	// Behaviour stuff
	DiscordTinker.Prefs = {};
	DiscordTinker.Prefs.data = {};
	if (DiscordTinker.localStorage.getItem('discord_tinker_prefs')) {
		DiscordTinker.Prefs.data = JSON.parse(DiscordTinker.localStorage.getItem('discord_tinker_prefs'));
	}
	DiscordTinker.Prefs.getPref = function(key, def) {
		return DiscordTinker.Prefs.data[key] === undefined ? def : DiscordTinker.Prefs.data[key];
	};
	DiscordTinker.Prefs.setPref = function(key, val) {
		DiscordTinker.Prefs.data[key] = val;
		DiscordTinker.Prefs.save();
	};
	DiscordTinker.Prefs.save = function() {
		DiscordTinker.localStorage.setItem('discord_tinker_prefs', JSON.stringify(DiscordTinker.Prefs.data));
	};
	
	DiscordTinker.Chat = {};
	DiscordTinker.Chat.getChannelIds = function() {
		var bits = window.location.pathname.split('/');
		return [bits[2], bits[3]];
	}
	
	DiscordTinker.UI = {};
	DiscordTinker.UI.commands = {};
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
			
			if (DiscordTinker.UI.commands[commandBits[0]] !== undefined) {
				DiscordTinker.UI.commands[commandBits[0]](command, commandBits);
			} else {
				alert('Unknown command');
			}
		}
	});
	
	DiscordTinker.UI.popoutButtons = [];
	DiscordTinker.Int.ReactComponents.patchRender('OptionPopout', function(event, orig) {
		return function() {
			var result = orig.apply(this, arguments);
			for (var button of DiscordTinker.UI.popoutButtons) {
				result.props.children.push(DiscordTinker.Int.ReactComponents.createFunnyElement('div', { className: 'btn-item', onClick: function() {
					button.onClick(event);
				} }, undefined, [button.label]));
			}
			return result;
		}
	});
})(window.DiscordTinker = window.DiscordTinker || {});

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
	var discriminator;
	DiscordTinker.Plugin.addListener('heartbeat', function(event) {
		if (!discriminator && document.querySelector('.discriminator').innerText.startsWith('#')) {
			discriminator = document.querySelector('.discriminator').innerText;
		}
		
		if (DiscordTinker.Prefs.getPref('gameName', null) !== null) {
			DiscordTinker.Gateway.send(DiscordTinker.Gateway.Op.STATUS_UPDATE, {
				idle_since: null,
				game: {
					name: DiscordTinker.Prefs.getPref('gameName')
				}
			});
			document.querySelector('.discriminator').innerHTML = 'Playing <b>' + DiscordTinker.Prefs.getPref('gameName') + '</b>';
		} else {
			document.querySelector('.discriminator').innerText = discriminator;
		}
	});
	
	DiscordTinker.UI.commands['status'] = function(command, commandBits) {
		if (commandBits.length > 1) {
			DiscordTinker.Prefs.setPref('gameName', command.substring(7));
		} else {
			DiscordTinker.Prefs.setPref('gameName', null);
		}
		DiscordTinker.Plugin.fireEvent('heartbeat');
	};
})();

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
		label: 'Quote',
		onClick: function(event) {
			// props.message already contains the message object. How convenient!
			DiscordTinker.Chat.quoteMessage(event[1].message);
			event[1].onClose();
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
	DiscordTinker.Chat.sendImage = function(blob) {
		var formData = new FormData();
		formData.append('image.png', blob, 'image.png');
		
		var channelId = DiscordTinker.Chat.getChannelIds()[1];
		DiscordTinker.HTTP.xhr('POST', 'https://discordapp.com/api/channels/' + channelId + '/messages', function(xhr) {
			console.log(xhr);
		}, {}, formData);
	};
	
	DiscordTinker.CustomEmoji = {};
	DiscordTinker.CustomEmoji.SCALE = 2;
	DiscordTinker.CustomEmoji.FONT_SIZE = 15;
	DiscordTinker.CustomEmoji.LINE_SPACE = 16.5 - 15;
	DiscordTinker.CustomEmoji.MARGIN_LEFT = 12;
	DiscordTinker.CustomEmoji.IMAGES = {
		rooWut: ['image/png', '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', null]
	};
	
	// Prepare canvas
	DiscordTinker.CustomEmoji.canvas = document.createElement('canvas');
	var ctx = DiscordTinker.CustomEmoji.canvas.getContext('2d', {alpha: false});
	
	DiscordTinker.CustomEmoji.spaceWidth = ctx.measureText(' ').width;
	
	DiscordTinker.CustomEmoji.prepareText = function(text) {
		DiscordTinker.CustomEmoji.canvas.width = 400;
		ctx.font = DiscordTinker.CustomEmoji.FONT_SIZE + 'px Whitney,"Helvetica Neue",Helvetica,Arial,sans-serif';
		
		var lines = [];
		lines.push({
			words: [],
			width: 0,
			height: 0
		});
		
		function addWord(word) {
			// Can it fit on the current line?
			if (DiscordTinker.CustomEmoji.MARGIN_LEFT + word.width + lines[lines.length - 1].width > DiscordTinker.CustomEmoji.canvas.width) {
				// Overflow - start a new line
				lines.push({
					words: [],
					width: 0,
					height: 0
				});
			}
			lines[lines.length - 1].words.push(word);
			lines[lines.length - 1].width += word.width;
			lines[lines.length - 1].height = Math.max(lines[lines.length - 1].height, word.height);
			// Can we continue to fit things on the current line?
			if (DiscordTinker.CustomEmoji.MARGIN_LEFT + DiscordTinker.CustomEmoji.spaceWidth + lines[lines.length - 1].width >= DiscordTinker.CustomEmoji.canvas.width) {
				// Will overflow - start a new line
				lines.push({
					words: [],
					width: 0,
					height: 0
				});
			} else {
				lines[lines.length - 1].width += DiscordTinker.CustomEmoji.spaceWidth;
			}
		}
		
		var textLines = text.split('\n');
		for (var i = 0; i < textLines.length; i++) {
			var words = textLines[i].split(' ');
			for (var word of words) {
				if (word.startsWith(':') && word.endsWith(':') && word.substring(1, word.length - 1) in DiscordTinker.CustomEmoji.IMAGES) {
					var size = 32;
					// Wumboji?
					for (var otherWord of words) {
						if (otherWord.startsWith(':') && otherWord.endsWith(':') && otherWord.substring(1, word.length - 1) in DiscordTinker.CustomEmoji.IMAGES) {
							// Emoji - OK
						} else {
							// Text - not OK
							size = 22;
							break;
						}
					}
					
					addWord({
						type: 'image',
						content: word.substring(1, word.length - 1),
						width: size,
						height: size
					});
				} else {
					addWord({
						type: 'text',
						content: word,
						width: ctx.measureText(word).width,
						height: DiscordTinker.CustomEmoji.FONT_SIZE
					});
				}
			}
			// Start a new line
			lines.push({
				words: [],
				width: 0,
				height: 0
			});
		}
		
		return lines;
	}
	
	DiscordTinker.CustomEmoji.render = function(text) {
		// Prepare text
		var preparedText = DiscordTinker.CustomEmoji.prepareText(text);
		
		DiscordTinker.CustomEmoji.canvas.width = 400 * DiscordTinker.CustomEmoji.SCALE;
		
		// Calculate height
		DiscordTinker.CustomEmoji.canvas.height = 0;
		for (var line of preparedText) {
			DiscordTinker.CustomEmoji.canvas.height += line.height;
			DiscordTinker.CustomEmoji.canvas.height += DiscordTinker.CustomEmoji.LINE_SPACE;
		}
		DiscordTinker.CustomEmoji.canvas.height *= DiscordTinker.CustomEmoji.SCALE;
		
		// Reset the font because size changed
		ctx.font = (DiscordTinker.CustomEmoji.FONT_SIZE * DiscordTinker.CustomEmoji.SCALE) + 'px Whitney,"Helvetica Neue",Helvetica,Arial,sans-serif';
		
		// Load images
		function loadOneImage() {
			for (var line of preparedText) {
				for (var word of line.words) {
					if (word.type === 'image') {
						if (DiscordTinker.CustomEmoji.IMAGES[word.content][2] === null) {
							var img = new Image();
							DiscordTinker.CustomEmoji.IMAGES[word.content][2] = img;
							img.onload = loadOneImage;
							img.onerror = console.log;
							img.src = 'data:' + DiscordTinker.CustomEmoji.IMAGES[word.content][0] + ';base64,' + DiscordTinker.CustomEmoji.IMAGES[word.content][1];
							return;
						}
					}
				}
			}
			// All images loaded
			
			// Fill background
			ctx.fillStyle = 'rgb(54, 57, 62)';
			ctx.fillRect(0, 0, DiscordTinker.CustomEmoji.canvas.width, DiscordTinker.CustomEmoji.canvas.height);
			
			// Draw text
			ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
			
			var y = 0; // x,y of top left
			for (var line of preparedText) {
				var x = DiscordTinker.CustomEmoji.MARGIN_LEFT;
				for (var word of line.words) {
					if (word.type === 'image') {
						// x,y of top left
						ctx.drawImage(DiscordTinker.CustomEmoji.IMAGES[word.content][2], x * DiscordTinker.CustomEmoji.SCALE, (y + (line.height - word.height) / 2) * DiscordTinker.CustomEmoji.SCALE, word.width * DiscordTinker.CustomEmoji.SCALE, word.height * DiscordTinker.CustomEmoji.SCALE);
					} else {
						// x,y of baseline left
						ctx.fillText(word.content, x * DiscordTinker.CustomEmoji.SCALE, (y + line.height - (line.height - word.height) / 2) * DiscordTinker.CustomEmoji.SCALE);
					}
					x += word.width;
					x += DiscordTinker.CustomEmoji.spaceWidth;
				}
				y += line.height;
				y += DiscordTinker.CustomEmoji.LINE_SPACE;
			}
			
			// Process image
			DiscordTinker.CustomEmoji.canvas.toBlob(DiscordTinker.Chat.sendImage, 'image/png');
		}
		loadOneImage();
	};
	
	DiscordTinker.UI.commands['render'] = function(command, renderBits) {
		var text = renderBits.slice(1).join(' ');
		DiscordTinker.CustomEmoji.render(text);
	};
	
	window.addEventListener('keydown', function(evt) {
		if (evt.keyCode == 13 && !evt.shiftKey) {
			if (evt.target === document.querySelector('form textarea')) {
				var shouldIntercept = false;
				
				for (var image of Object.keys(DiscordTinker.CustomEmoji.IMAGES)) {
					if (evt.target.value.indexOf(':' + image + ':') >= 0) {
						shouldIntercept = true;
						break;
					}
				}
				
				if (shouldIntercept) {
					// Send message ourselves
					DiscordTinker.CustomEmoji.render(evt.target.value);
					// Prevent Discord sending message
					evt.target.value = '';
					evt.preventDefault();
				}
			}
		}
	});
	
	DiscordTinker.UI.commands['caps'] = function(command, renderBits) {
		var text = renderBits.slice(1).join(' ').toUpperCase().split('').join(' ');
		if (renderBits.slice(1).join('').length > 6) {
			DiscordTinker.CustomEmoji.render(text);
		} else {
			var channelId = DiscordTinker.Chat.getChannelIds()[1];
			DiscordTinker.HTTP.xhr('POST', 'https://discordapp.com/api/channels/' + channelId + '/messages', function(xhr) {
				console.log(xhr);
			}, {
				'Content-Type': 'application/json'
			}, JSON.stringify({
				content: text
			}));
		}
	};
})();

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
		onClick: function(event) {
			var text = window.prompt('React text?');
			if (text) {
				DiscordTinker.Chat.addTextReacts(event[1].message.id, DiscordTinker.Chat.getChannelIds()[1], text);
			}
			event[1].onClose();
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

