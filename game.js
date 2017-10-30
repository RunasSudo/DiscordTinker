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
