'use strict';

var _ = require('underscore');
var open = require('open');
var child_process = require('child_process');
var fs = require('fs');

module.exports = function(grunt) {
  grunt.initConfig({
    clean: ['docs/webppl-viz.*'],
    watch: {
      scripts: {
        files: ['src/style.css'],
        tasks: ['css']
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-clean');

  grunt.registerTask('default', ['bundle']);

  grunt.registerTask('bundle', 'Create browser bundle (= css + browserify)', function() {
    var taskArgs = (arguments.length > 0) ? ':' + _.toArray(arguments).join(':') : '';
    grunt.task.run('css', 'browserify' + taskArgs);
  });

  grunt.registerTask('css', 'Concatenate css files', function() {
    var cssSource = fs.readFileSync('src/style.css','utf8');
    fs.writeFileSync('docs/webppl-viz.css', cssSource)
  })

  function browserifyArgs(args) {
    return ' -t [babelify --presets [react] ] src/index.js -o docs/webppl-viz.js';
  }

  grunt.registerTask('browserify', 'Generate "docs/webppl-viz.js".', function() {
    child_process.execSync('browserify' + browserifyArgs(arguments));
  });

  grunt.registerTask('browserify-watch', 'Run the browserify task on fs changes.', function() {
    var done = this.async();
    child_process.execSync('mkdir -p docs');
    var args = '-v' + browserifyArgs(arguments);
    var p = child_process.spawn('watchify', args.split(' '));
    p.stdout.on('data', grunt.log.writeln);
    p.stderr.on('data', grunt.log.writeln);
    p.on('close', done);
  });

  grunt.registerTask('uglify', 'Generate "docs/webppl-viz.min.js".', function() {
    child_process.execSync('uglifyjs docs/webppl-viz.js -b ascii_only=true,beautify=false > docs/webppl-viz.min.js');
  });

};
