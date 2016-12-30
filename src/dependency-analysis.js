/*
  (local-set-key (kbd "s-r") (lambda () (interactive) (save-buffer) (process-send-string "*shell viz*" "echo '\n'; node src/dependency-analysis.js\n")))
*/

var _ = require('underscore');

var esprima = require('esprima');

var escodegen = require('escodegen'),
    gen = escodegen.generate;

var escope = require('escope');

var estraverse = require('estraverse'),
    traverse = estraverse.traverse,
    replace = estraverse.replace;

var lodash = require('lodash');
var Closure = require('./closure'); // TODO: decruft
var reflection = require('./reflection');


// returns all identifiers referenced in a syntax subtree
var getIdentifiers = function(t, name) {

  var names = [];

  traverse(t, {
    enter: function (node, parent) {
      if (node.type == 'Identifier') {
        names.push(node.name);
      }
    },
    leave: function (node, parent) {
    }
  });

  return names;
}

var topLevelDependencies = function(ast) {

  // walk AST until we hit a FunctionExpression, then extract top level vars
  // (we need to do this walking because the ast we receive might correspond to "var f = function() { }")
  // or, in the future, maybe just "function() {}" if the model passed to inference was anonymous
  // (though i'll need to stash info about the model with the posterior distribution in webppl)
  var fnAst;

  traverse(ast,
           {enter: function(node, parent) {
             if (node.type == 'FunctionExpression') {
               fnAst = node;
               this.break();
             }
           }}
          );

  var varNames = reflection.getTopLevelVars(fnAst);

  var modelBody = fnAst.body.body;

  return _.chain(varNames)
    .map(function(varName) {

      var declaration = _.find(modelBody,
                               function(ast1) {
                                 return ast1.type == 'VariableDeclaration' &&
                                   ast1.declarations[0].id.name == varName
                               });

      var otherIdentifiers = _.without(getIdentifiers(declaration), varName);
      return [varName, _.intersection(varNames, otherIdentifiers)];

    })
    .object()
    .value();
}

var bayesBall = function(dependencies, query, givens) {
  var getParents = function(node) {
    return dependencies[node];
  }

  var getChildren = function(node) {
    return _.keys(_.pick(dependencies,
                         function(v, k) {
                           return (_.contains(v, node))
                         }));
  }

  var curNode;
  var numVisited = 0;
  var visited = {};
  var queue = [query];

  var relation = function(a,b) {
    if (_.contains(dependencies[a], b)) {
      return 'child' // a is a child of b
    } else {
      return 'parent'
    }
  }

  // visit query
  while(true) {
    if (queue.length == 0) {
      break;
    }
    var lastNode = curNode;
    curNode = queue.shift();
    var from = !lastNode ? 'child' : relation(lastNode, curNode);

    // console.log('last: ', lastNode);
    // console.log('curr: ', curNode);
    // console.log('from: ', from);
    // console.log('');

    if (!_.has(visited, curNode)) {
      visited[curNode] = {};
    }

    if (visited[curNode][from]) {
      continue;
    }

    visited[curNode][from] = true;

    if (from == 'child') {
      if (_.contains(givens, curNode)) {

      } else {
        queue = queue.concat(getParents(curNode), getChildren(curNode))
      }
    } else {
      if (_.contains(givens, curNode)) {
        //console.log(getParents(curNode));
        queue = queue.concat(getParents(curNode))
      } else {
        queue = queue.concat(getChildren(curNode))
      }
    }
  }

  return visited;

}


var structure = function(f) {
  var wpplSource = reflection.getWpplSource(f);
  var ast = esprima.parse(wpplSource);
  ast = reflection.uniqueNames(ast);
  return topLevelDependencies(ast);
  // TODO: make sigma.js spec and render it
}

var cliques = function(f, observedVars, queryVars) {
  var wpplSource = reflection.getWpplSource(f);
  var ast = esprima.parse(wpplSource);
  ast = reflection.uniqueNames(ast);
  var dependencies = topLevelDependencies(ast);

  // // TODO: get conditions from source code
  // var observedVars = [];

  // // TODO: get query vars from source code
  // var queryVars = ['z'];

  return bayesBall(dependencies, queryVars[0], observedVars);
}


module.exports = {
  structure: structure,
  cliques: cliques
}
