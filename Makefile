demo/webppl-viz.js : src/index.js
	@browserify -t brfs "$<" > "$@"

watch :
	@watchify src/index.js -o demo/webppl-viz.js -v -t brfs
