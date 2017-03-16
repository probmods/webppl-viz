// to run this test
// first, cd to the test-auto directory
// next, run 'node test-viz.js'

var fs = require('fs');
var readline = require('readline');
var exec = require('child_process').exec;

// this function collects and saves all examples in docs/index.html
// all examples are saved in saveDir in separate files for test use
function parseHTMLSaveCode(filename, saveDir) {
  var data = fs.readFileSync(filename);
  var content = data.toString().split('\n');
  var length = content.length, i = 0, counter = 1;
  // parse by locating '<pre><code>' and '</code></pre>'
  var code_start = '<pre><code>', code_end = '</code></pre>';
  while (i < length) {
    var line = content[i];
    var sign = line.indexOf(code_start);
    if (sign !== -1) {
      var code = [];
      code.push(line.substring(sign + code_start.length));
      i++;
      line = content[i];
      while (line.indexOf(code_end) == -1) {
        code.push(line);
        i++;
        line = content[i];
      }
      code.push(line.substring(0, line.indexOf(code_end)))
      var logger = fs.createWriteStream(saveDir + counter + '.wppl');
      for (var j in code) {
        logger.write(code[j]);
        logger.write('\n');
      }
      counter++;
    }
    i++;
  }
}

// input: an array of paths to all test examples
// return: an array of commands (strings) to execute on these examples
function getExecCommands(example_paths) {
  var execCommands = [];
  for (var i in example_paths) {
    var scriptName = example_paths[i];
    execCommands.push('webppl test_js/' + scriptName + ' --require ../.. --random-seed 1');
  }
  return execCommands;
}

// this function runs an array of commands in order
function runCommands(array, callback) {
  var index = 0;
  var results = [];

  function locations(substring, string){
    // find all occurrences of a substring in a string
    // return: an array of indices
    var a = [], i = -1;
    while((i = string.indexOf(substring,i + 1)) >= 0) a.push(i);
    return a;
  }

  function next() {
    // Run next command in the array
    if (index < array.length) {
      var cmd = array[index++];
      exec(cmd, {maxBuffer: 1024 * 8192}, function(err, stdout) {
        console.log('Executing: ' + cmd);
        var locs = locations('.svg', stdout);
        // diff is the last command
        // do a summary when it is diff
        if (cmd.indexOf('diff') !== -1) {
          console.log('#####################################################');
          if ((!stdout || stdout.length < 1) && (!err || stdout.length < 1)) {
            console.log('Compared. All generated svgs are correct.');
          } else {
            if (!fs.existsSync('correct-svgs')) {
              console.log('Error: No directory named "correct-svgs"');
            } else {
              var errsvgs = {};
              // load the correct mapping of svg to its code
              var map = JSON.parse(fs.readFileSync('svgs.json'));
              for (var j in locs) {
                var svg = stdout.substring(locs[j] - 7, locs[j] + 4);
                errsvgs[svg] = map[svg];
              }
              if (Object.keys(errsvgs).length > 0) {
                console.log('These tests did not pass because of incorrect svgs:');
                console.log(errsvgs);
              }
            }
          }
        } else {
          if (err) console.log(err.message);
          for (var j in locs) {
            var svg = stdout.substring(locs[j] - 7, locs[j] + 4);
            console.log('  ' + svg + ' generated');
            if (updateSvgMap) {
              // add entries to the svgMap object
              // key: svg name; value: the webppl script generating the svg
              var args = cmd.split(' ');
              var scriptName = args[1];
              svgMap[svg] = scriptName.split('/')[1];
            }
          }
        }
        // run the next command
        results.push(stdout);
        next();
      });
    } else {
      // all done
      callback(null, results);
    }
  }
  // start the first iteration
  next();
}


// only set updateSvgMap to true when the results of the current
// execution are going to be set as correct answers
var updateSvgMap = false;
// key: svg name; value: the webppl script generating the svg
var svgMap = {};
// check test dir exists or not, parse index.html if not
if (!fs.existsSync('test_js')) {
  fs.mkdirSync('test_js');
  parseHTMLSaveCode('../../docs/index.html', 'test_js/');
}
var scripts = fs.readdirSync('test_js/');
// get the array of webppl command to execute on examples
var commands = getExecCommands(scripts);
if (!fs.existsSync('results')) {
  // make a dir for results if there aren't
  commands.push('mkdir results');
}
// move svgs to the results dir
// check results by diff
commands.push('mv *.svg results', 'diff -bur results correct-svgs');
runCommands(commands, function (err, results) {
  // do somethings here when all commands are completed
  if (updateSvgMap) {
    console.log('new svg map saved to json file');
    json = JSON.stringify(svgMap);
    fs.writeFileSync('svgs.json', json);
  }
  console.log('#####################################################');
});