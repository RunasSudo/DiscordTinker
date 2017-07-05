#!/bin/bash
cat {main,game,quote}.js | pee 'xclip -i -selection clipboard' 'tee DiscordTinker.user.js'
