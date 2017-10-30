#!/bin/bash
m4 -P DiscordTinker.user.js.m4 | pee 'xclip -i -selection clipboard' 'tee DiscordTinker.user.js'
