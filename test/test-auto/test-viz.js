var fs = require('fs')
var readline = require('readline')
var exec = require('child_process').exec;

function parseHTMLSaveCode(filename, saveDir) {
  var data = fs.readFileSync(filename)
  var content = data.toString().split("\n");
  var length = content.length, i = 0, counter = 1;
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

function getExecCommands(examples) {
  var execCommands = []
  for (var i in examples) {
    var scriptName = examples[i];
    execCommands.push('webppl test_js/' + scriptName + ' --require ../.. --random-seed 1');
  }
  return execCommands;
}

function runCommands(array, callback) {
  var index = 0;
  var results = [];
  // Find all occurrences of a substring in a string
  // return: an array of indices
  function locations(substring, string){
    var a = [], i = -1;
    while((i = string.indexOf(substring,i + 1)) >= 0) a.push(i);
    return a;
  }
  function next() {
    if (index < array.length) {
      var cmd = array[index++]
      exec(cmd, {maxBuffer: 1024 * 8192}, function(err, stdout) {
        console.log('Executing: ' + cmd);
        var locs = locations('.svg', stdout);
        if (cmd.indexOf('diff') !== -1) {
          if ((!stdout || stdout.length < 1) && (!err || stdout.length < 1)) {
            console.log('Compared. All generated svgs are correct.');
          } else {
            if (!fs.existsSync('correct-svgs')) {
              console.log('Error: No directory named "correct-svgs"');
            } else {
              var errsvgs = {};
              for (var j in locs) {
                var svg = stdout.substring(locs[j] - 7, locs[j] + 4);
                errsvgs[svg] = svgMap[svg];
              }
              if (Object.keys(errsvgs).length > 0) {
                console.log('These tests did not pass:');
                console.log(errsvgs);
              }
            }
          }
        } else {
          if (err) console.log(err.message);
          for (var j in locs) {
            var svg = stdout.substring(locs[j] - 7, locs[j] + 4);
            var args = cmd.split(" ");
            var scriptName = args[1]
            svgMap[svg] = scriptName;
          }
        }
        // do the next iteration
        results.push(stdout);
        next();
      });
    } else {
      // all done here
      callback(null, results);
    }
  }
  // start the first iteration
  next();
}

var svgMap = {}
if (!fs.existsSync('test_js')) {
  fs.mkdirSync('test_js');
  parseHTMLSaveCode('../../docs/index.html', 'test_js/');
}
var scripts = fs.readdirSync('test_js/');
var commands = getExecCommands(scripts);
if (!fs.existsSync('results')) {
  commands.push("mkdir results");
}
commands.push("mv *.svg results", "diff -bur results correct-svgs");
runCommands(commands, function (err, results) {});