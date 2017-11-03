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
		rooWut: ['image/png', 'm4_esyscmd(`base64 img/rooWut.png | tr -d "\n"')', null]
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
