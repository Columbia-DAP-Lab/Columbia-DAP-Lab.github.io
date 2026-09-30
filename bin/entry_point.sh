#!/bin/bash

CONFIG_FILE=_config.yml

# The site's content lives in Convex, not the repo; fetch it before serving.
# Without it the pages build but show no events, papers or people.
ruby scripts/fetch_content.rb || echo "Could not fetch content from Convex; pages will be empty until it can be."

/bin/bash -c "rm -f Gemfile.lock && exec bundle exec jekyll serve --watch --port=8080 --host=0.0.0.0 --livereload --verbose --trace --force_polling"&

while true; do

  inotifywait -q -e modify,move,create,delete $CONFIG_FILE

  if [ $? -eq 0 ]; then

    echo "Change detected to $CONFIG_FILE, restarting Jekyll"

    jekyll_pid=$(pgrep -f jekyll)
    kill -KILL $jekyll_pid

    /bin/bash -c "rm -f Gemfile.lock && exec bundle exec jekyll serve --watch --port=8080 --host=0.0.0.0 --livereload --verbose --trace --force_polling"&

  fi

done

