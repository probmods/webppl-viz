'use strict';

var _ = require('underscore');
var open = require('open');
var child_process = require('child_process');
var fs = require('fs');

var jslintSettings = {
  options: {
    flags: ['--flagfile .gjslintrc'],
    reporter: {
      name: 'console'
    },
    force: false
  },
  lib: {
    src: [
      'Gruntfile.js',
      'src/*.js',
    ]
  }
};
module.exports = function(grunt) {
  grunt.initConfig({
    subgrunt: {
      // TODO: after browserifying webppl, move to demo folder
      webppl: {
        'node_modules/webppl': 'browserify'
      },
      'webppl-editor': {
        'node_modules/webppl-editor': ['browserify','css']
      }
    },
    nodeunit: {
      all: ['tests/test-*.js']
    },
    jshint: {
      files: [
        'Gruntfile.js',
        'src/*.js'
      ],
      options: {
        maxerr: 500,
        camelcase: true,
        nonew: true,
        curly: true,
        noarg: true,
        trailing: true,
        forin: true,
        noempty: true,
        node: true,
        eqeqeq: true,
        strict: false,
        evil: true,
        undef: true,
        bitwise: true,
        browser: true,
        gcl: true,
        newcap: false
      }
    },
    gjslint: jslintSettings,
    fixjsstyle: jslintSettings,
    clean: ['bundle/*.js'],
    watch: {
      ad: {
        files: ['src/*.js'],
        tasks: ['build']
      }
    }
  });

  function browserifyArgs(args) {
    // var pkgArg = '';
    // var requires = _.chain(_.toArray(args))
    //     .map(function(name) { return ['--require', name]; })
    //     .flatten().value();
    // pkgArg = ' -t [' + ['./src/bundle.js'].concat(requires).join(' ') + ']';
    return ' -t [babelify --presets [react] ] src/index.js -o bundle/webppl-viz.js';
  }

  grunt.loadNpmTasks('grunt-subgrunt');
  grunt.loadNpmTasks('grunt-gjslint');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.registerTask('default', ['gjslint', 'nodeunit']);
  grunt.registerTask('test', ['nodeunit']);
  grunt.registerTask('lint', ['gjslint']);
  grunt.registerTask('hint', ['jshint']);
  grunt.registerTask('fixstyle', ['fixjsstyle']);

  grunt.registerTask('setup-demo', 'Build and install webppl.js and webppl-editor.js to demo', function() {
    grunt.task.run('subgrunt');
    //fs.createReadStream('node_modules/webppl/bundle/webppl.js').pipe(fs.createWriteStream('demo/webppl.js'));
    //fs.createReadStream('node_modules/webppl-editor/bundle/webppl-editor.js').pipe(fs.createWriteStream('demo/webppl-editor.js'));
    //fs.createReadStream('node_modules/webppl-editor/bundle/webppl-editor.css').pipe(fs.createWriteStream('demo/webppl-editor.css'));
  });

  grunt.registerTask('bundle', 'Create browser bundle (= css + browserify + uglify)', function() {
    var taskArgs = (arguments.length > 0) ? ':' + _.toArray(arguments).join(':') : '';
    grunt.task.run('browserify' + taskArgs, 'uglify','css');
  });

  grunt.registerTask('css', 'Concatenate css files', function() {
    child_process.execSync('mkdir -p bundle');
    var cssSource = fs.readFileSync('src/style.css','utf8');
    fs.writeFileSync('bundle/webppl-viz.css', cssSource)
  })

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
