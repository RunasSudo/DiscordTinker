// ==UserScript==
// @name        DiscordTinker
// @namespace   https://yingtongli.me
// @include     https://discordapp.com/channels/*
// @version     3
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
		if (!discriminator && document.querySelector('.channels-wrap .discriminator').innerText.startsWith('#')) {
			discriminator = document.querySelector('.channels-wrap .discriminator').innerText;
		}
		
		if (DiscordTinker.Prefs.getPref('gameName', null) !== null) {
			DiscordTinker.Gateway.send(DiscordTinker.Gateway.Op.STATUS_UPDATE, {
				idle_since: null,
				game: {
					name: DiscordTinker.Prefs.getPref('gameName')
				}
			});
			document.querySelector('.channels-wrap .discriminator').innerHTML = 'Playing <b>' + DiscordTinker.Prefs.getPref('gameName') + '</b>';
		} else {
			document.querySelector('.channels-wrap .discriminator').innerText = discriminator;
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
