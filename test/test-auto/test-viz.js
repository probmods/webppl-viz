// to run this test
// first, cd to the test-auto directory
// next, run 'node test-viz.js'

var fs = require('fs');
var readline = require('readline');
var webppl = require('webppl');
require('../../')

// this function collects all examples in docs/index.html
// all examples are saved in the code array
// if saveDir is specified, code snippets are also stored as files in saveDir
function parseHTMLForCode(filename, saveArray, saveDir) {
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
      saveArray.push(code);
      if (saveDir) {
        var logger = fs.createWriteStream(saveDir + counter + '.wppl');
        for (var j in code) {
          logger.write(code[j]);
          logger.write('\n');
        }
      }
      counter++;
    }
    i++;
  }
}

// delete a folder and all its content
var deleteFolderRecursive = function(path) {
  if( fs.existsSync(path) ) {
    fs.readdirSync(path).forEach(function(file,index){
      var curPath = path + "/" + file;
      if(fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

// run all webppl code snippets in the array sequentially
function runCode(array, callback) {
  var index = 0;
  var results = [];

  function next() {
    // Run next command in the array
    if (index < array.length) {
      var code = array[index];
      index++;
      codeStr = code.join('\n');
      try {
        if (index in blackList) {
          next();
        } else {
          console.log('Executing: #' + index + ' - ' + testNum2testName[index]);
          webppl.run('util.seedRNG(1);' + codeStr, next);
        }
      } catch(err) {
        console.log('*******FAILED*******');
        next();
      }
    } else {
      // all done
      callback(null, results);
    }
  }
  // start the first iteration
  next();
}

// return true if the file is svg file
function isSvg(filename) {
  return filename.indexOf('.svg') >= 0
}

// move svgs to the ./results dir and diff directories
function compareSvgs() {
  var currentFiles = fs.readdirSync('.');
  for (var i = 0; i < currentFiles.length; i++) {
    var filename = currentFiles[i];
    if (isSvg(filename)) {
      fs.renameSync(filename, 'results/' + filename);
    }
  }
  diff('./results', './correct-svgs');
}

// compare two files
// return true if two files are exactly the same
function areSameFiles(filename1, filename2) {
  var file1 = fs.readFileSync(filename1);
  var file2 = fs.readFileSync(filename2);
  return file1.toString() === file2.toString();
}

// diff two directories
function diff(results, correct) {
  var svgs = fs.readdirSync(results).sort().filter(isSvg);
  var correctSvgs = fs.readdirSync(correct).sort().filter(isSvg);
  var i = 0, j = 0;
  var unexpectedOnes = [];
  var missingOnes = [];
  var errOnes = [];
  while (i < svgs.length && j < correctSvgs.length) {
    if (svgs[i] < correctSvgs[j]) {
      unexpectedOnes.push(svgs[i]);
      i++;
    } else if (svgs[i] > correctSvgs[j]) {
      missingOnes.push(correctSvgs[j]);
      j++;
    } else {
      if (!areSameFiles(results + '/' + svgs[i], correct + '/' + correctSvgs[j])) {
        errOnes.push(svgs[i]);
      }
      i++;
      j++;
    }
  }
  if (unexpectedOnes.length > 0) {
    console.log('These svgs are unexpected: ' + unexpectedOnes);
  }
  if (missingOnes.length > 0) {
    console.log('These svgs are missing: ' + missingOnes);
  }
  if (errOnes.length > 0) {
    console.log('These svgs are incorrect: ' + errOnes);
  }
  var failedTests = {}
  for (var i in missingOnes) {
    failedTests[testNum2testName[svg2testNum[missingOnes[i]]]] = 1;
  }
  for (var j in errOnes) {
    failedTests[testNum2testName[svg2testNum[errOnes[j]]]] = 1;
  }
  failedNames = Object.keys(failedTests);
  if (failedNames.length === 0) {
    console.log('All ' + Object.keys(testNum2testName).length + ' tests passed!');
  } else {
    console.log('Tests failed: ');
    console.log(failedNames);
  }
}


// only set updateSvgMap to true when the results of the current
// execution are going to be set as correct answers
var updateSvgMap = false;
// key: svg name; value: the webppl script generating the svg
var svgMap = {};
// check test dir exists or not, parse index.html if not
var codeArray = [];
parseHTMLForCode('../../docs/index.html', codeArray);

// key: svg name
// value: the id of the test it belongs to
var svg2testNum = JSON.parse(fs.readFileSync('svgs.json'));

// key: the id of a test
// value: the name of a test
var testNum2testName = JSON.parse(fs.readFileSync('test-names.json'));

// create a new results dir
// the old one is removed first
if (!fs.existsSync('results')) {
  fs.mkdirSync('results');
} else {
  deleteFolderRecursive('results');
  fs.mkdirSync('results');
}

// the keys of blackList are the numbers of code snippets that
// we don't want to run below
var blackList = {19: 1, 20: 1, 21: 1, 22: 1};

// run code snippets and compare with correct svgs
runCode(codeArray, function (err, results) {
  setTimeout(compareSvgs, 3000);
});