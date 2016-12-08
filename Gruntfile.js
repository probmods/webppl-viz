'use strict';

var _ = require('underscore');
var open = require('open');
var child_process = require('child_process');
var fs = require('fs');

module.exports = function(grunt) {
  grunt.initConfig({
    clean: ['bundle/*.js']
  });

  grunt.loadNpmTasks('grunt-contrib-clean');

  grunt.registerTask('default', ['bundle']);

  grunt.registerTask('bundle', 'Create browser bundle (= css + browserify + uglify)', function() {
    var taskArgs = (arguments.length > 0) ? ':' + _.toArray(arguments).join(':') : '';
    grunt.task.run('browserify' + taskArgs, 'uglify','css');
  });

  grunt.registerTask('css', 'Concatenate css files', function() {
    child_process.execSync('mkdir -p bundle');
    var cssSource = fs.readFileSync('src/style.css','utf8');
    fs.writeFileSync('bundle/webppl-viz.css', cssSource)
  })

  function browserifyArgs(args) {
    return ' -t [babelify --presets [react] ] src/index.js -o bundle/webppl-viz.js';
  }

  grunt.registerTask('browserify', 'Generate "bundle/webppl-viz.js".', function() {
    child_process.execSync('mkdir -p bundle');
    child_process.execSync('browserify' + browserifyArgs(arguments));
  });

  grunt.registerTask('browserify-watch', 'Run the browserify task on fs changes.', function() {
    var done = this.async();
    child_process.execSync('mkdir -p bundle');
    var args = '-v' + browserifyArgs(arguments);
    var p = child_process.spawn('watchify', args.split(' '));
    p.stdout.on('data', grunt.log.writeln);
    p.stderr.on('data', grunt.log.writeln);
    p.on('close', done);
  });

  grunt.registerTask('uglify', 'Generate "bundle/webppl-viz.min.js".', function() {
    child_process.execSync('mkdir -p bundle');
    child_process.execSync('uglifyjs bundle/webppl-viz.js -b ascii_only=true,beautify=false > bundle/webppl-viz.min.js');
  });

};
