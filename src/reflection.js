var esprima = require('esprima');
var escodegen = require('escodegen'),
    gen = escodegen.generate;
var estraverse = require('estraverse'),
    traverse = estraverse.traverse;
var lodash = require('lodash');
var escope = require('escope');
var SourceMapConsumer = require('source-map').SourceMapConsumer;

var getWpplSource = function(f) {
  var smc = new SourceMapConsumer(global.__sourceMap__);
  var mappings = [];
  smc.eachMapping(function(m) {
    mappings.push(m)
  })

  var fName = f.name;
  var fString = f.toString();

  // get line, col position that f appears in in generated code
  var fPosition = global.__compiled__.indexOf(fString);
  var fSplit = global.__compiled__.slice(0, fPosition).split('\n');
  var fLine = fSplit.length;

  var mapping = _.findWhere(mappings, {source: 'webppl:program', generatedLine: fLine});
  // get original position
  var originalLine = mapping.originalLine,
      originalColumn = mapping.originalColumn;

  var wpplCode = _.last(global.__sourceMap__.sourcesContent);

  var wpplAst = esprima.parse(wpplCode, {loc: true});

  var originalCode;

  traverse(wpplAst,
           {enter: function(node, parent) {
             // look for var <name> = function(...) { ... }
             if (node.type == 'VariableDeclarator' && node.id.name == fName && node.init.type == 'FunctionExpression') {
               //candidateModelCode.push(gen(node))
               if (node.loc.start.line == originalLine && node.loc.start.column == originalColumn) {
                 originalCode = gen(node);
                 this.break();
               }
             }
           }})

  // TODO: there can be multiple locations mapping these attributes; ensure that i've picked the right one

  return ('(' + originalCode + ')');

}

// _ast must be untrampolined
var uniqueNames = function(_ast) {
  var ast = lodash.cloneDeep(_ast);

  var scopeManager = escope.analyze(ast);
  var topScope = scopeManager.acquire(ast);

  var gensymDict = {}
  var gensym = function(prefix) {
    if (!gensymDict[prefix]) {
      gensymDict[prefix] = 0
    }
    gensymDict[prefix] += 1
    // console.log('gensym', prefix, gensymDict[prefix]);
    return prefix + ('__' + gensymDict[prefix])
  }

  var ancestorScopes = function(scope) {
    var currScope = scope;
    var ancestors = [];
    while(currScope.upper) {
      currScope = currScope.upper;
      ancestors.push(currScope);
    }
    return ancestors;
  }

  var scopesToTraverse = [topScope];
  // traverse scopes, marking
  while(scopesToTraverse.length) {
    var scope = scopesToTraverse.shift();
    // console.log('inside of:')
    // console.log('------------------------------')
    // console.log(escodegen.generate(scope.block))
    // console.log('------------------------------')

    var variables = _.chain(scope.variables)
        .pluck('name')
        .without('arguments')
        .value();
    // console.log('variables are', variables.join(', '));

    // get any conflicts with variables in ancestor scopes
    var ancestorVariables = _.chain(ancestorScopes(scope))
        .pluck('variables')
        .flatten()
        .pluck('name')
        .without('arguments')
        .value();

    var conflictingNames = _.intersection(variables, ancestorVariables);

    if (conflictingNames.length > 0) {
      // console.log('conflicting names are', conflictingNames.join(', '))

      conflictingNames.forEach(function(name) {
        // TODO: using findWhere means I don't handle multiple redefinitions of the same variable
        var scopeEntry = _.findWhere(scope.variables,{name: name});
        var defNames = _.pluck(scopeEntry.defs, 'name');
        var refNames = _.pluck(scopeEntry.references, 'identifier');
        var changeSites = defNames.concat(refNames);

        var newName = gensym(name);

        // console.log('renaming', name, 'to', newName);
        changeSites.forEach(function(x) { x.name = newName })
      })
    }
    // console.log('\n')

    scopesToTraverse = scopesToTraverse.concat(scope.childScopes);
  }


  return ast;
}

"# testing"; {
// // test with untransformed
// var source = 'var x = [[1]]; var y = map(function(x) { return x.map(function(x) { var y = x + 1; return y}) }, x);';
// console.log(escodegen.generate(uniqueNames(esprima.parse(source))))
// process.exit()

// test with cps-transformed
// /*
//   (function() {,
//   var x = flip(0.5); // [x],
//   var y = repeat(2, x ? gaussian(0,1) : beta(2,2)); // [x,y], // TODO: second arg should be a function, not a value
//   var z = map(function (x) { var y = x + 1; return y }, y); // [x,y,x],
//   return z,
//   })
// */
// function m() {
//   return _k0(globalStore, function (globalStore, _k1, _address153) {
//     var _currentAddress = _address153;
//     _addr.save(_globalCurrentAddress, _address153);
//     return function () {
//       return flip(globalStore, function (globalStore, x) {
//         _addr.save(_globalCurrentAddress, _currentAddress);
//         var _k4 = function (globalStore, _result3) {
//           _addr.save(_globalCurrentAddress, _currentAddress);
//           return function () {
//             return repeat(globalStore, function (globalStore, y) {
//               _addr.save(_globalCurrentAddress, _currentAddress);
//               return function () {
//                 return map(globalStore, function (globalStore, z) {
//                   _addr.save(_globalCurrentAddress, _currentAddress);
//                   return function () {
//                     return _k1(globalStore, z);
//                   };
//                 }, _address153.concat('_159'), function (globalStore, _k2, _address154, x) {
//                   var _currentAddress = _address154;
//                   _addr.save(_globalCurrentAddress, _address154);
//                   var y = ad.scalar.add(x, 1);
//                   return function () {
//                     return _k2(globalStore, y);
//                   };
//                 }, y);
//               };
//             }, _address153.concat('_158'), 2, _result3);
//           };
//         };
//         return function () {
//           return x ? gaussian(globalStore, _k4, _address153.concat('_156'), 0, 1) : beta(globalStore, _k4, _address153.concat('_157'), 2, 2);
//         };
//       }, _address153.concat('_155'), 0.5);
//     };
//   });
// }

// var ast = esprima.parse(m.toString())
// var ast2b = uniqueNames(ast);
// console.log(escodegen.generate(ast2b));
  // process.exit()
}

// currently unused
var getReturnVariablesCPS = function(ast) {
  var rets = [];
  // find where we call the _k1 continuation and extract those arguments (minus globalStore)
  traverse(
    ast,
    {enter: function(node, parent) {
      if (node.type == 'CallExpression' && node.callee.type == 'Identifier') {
        if (node.callee.name == '_k1') {
          rets = _.chain(node.arguments).pluck('name').without('globalStore').value();
          this.break(); // stops traversing
        }
      }
    }}
  )
  return rets;
}

// TODO: filter out variables that are entirely deterministic (i.e., neither random nor derived from random)
var getTopLevelVars = function(ast) {
  var topLevelVars = [];
  traverse(ast,
           {enter: function(node, parent) {
             if (node.type == 'FunctionExpression') {

               topLevelVars = _.chain(node.body.body)
                 .where({type: 'VariableDeclaration'})
                 .pluck('declarations')
                 .flatten()
                 .pluck('id')
                 .pluck('name')
                 .value();

               this.break();
             }
           }}
          );

  return topLevelVars;
}

// currently unused
// TODO: filter out variables that are entirely deterministic (i.e., neither random nor derived from random)
var getTopLevelVarsCPS = function(ast) {
  var vars = {};
  var whitelistContinuation = true;  // the top level continuation in a model function has an _address in it, so we don't count it as a lower-level cont
  traverse(
    ast,
    {enter: function(node, parent) {
      if (node.type == 'FunctionExpression') {

        if (whitelistContinuation) {
          whitelistContinuation = false;
          return;
        }

        // ignore thunks introduced by trampolining
        // if (node.params.length == 0) {
        //   return
        // }

        var variableNames = _.pluck(node.params, 'name');

        if (_.find(variableNames, function(name) { return /_address/.test(name) })) {
          this.skip();
        } else {
          var isBookKeepingName = function(name) { return /globalStore/.test(name) || /_k/.test(name) };

          // i believe that addedNames is either length 0 or length 1
          var addedNames = _.reject(variableNames, isBookKeepingName);

          if (addedNames.length > 1) {
            console.log('weird case: more than 1 added name: ', addedNames.join(', '))
          }

          if (addedNames.length == 0) {
            // return
          }

          console.log(gen(node))

          console.log('adding ', addedNames.join(', '))



          // get dependencies of this variable
          // assumption: parent is a CallExpression
          var dependencies = _.chain(parent.arguments)
              .filter(function(x) { return x.type == 'Identifier' })
              .pluck('name')
              .reject(isBookKeepingName)
              .value();

          console.log('-> dependencies are ', dependencies.join(', '))
          console.log('')

          _.each(addedNames,
                 function(name) {
                   vars[name] = dependencies
                 })
        }
      }
    }
    }
  )
  return vars;
}


module.exports = {
  getWpplSource: getWpplSource,
  uniqueNames: uniqueNames,
  getTopLevelVars: getTopLevelVars
}
