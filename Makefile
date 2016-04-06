demo/webppl-viz.js : src/index.js
	@browserify -t [ babelify --presets [ react ] ] "$<" > "$@"

watch :
	@watchify -v -t [ babelify --presets [ react ] ] src/index.js -o demo/webppl-viz.js

mirror :
	rsync --exclude=".git" --exclude="node_modules/" -rLvz demo/ corn:~/WWW/wp-viz
