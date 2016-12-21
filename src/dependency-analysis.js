var esprima = require('esprima');
var escodegen = require('escodegen');

var traverse = require('estraverse').traverse;
var replace = require('estraverse').replace;
var _ = require('underscore');
var lodash = require('lodash');
var Closure = require('./closure');

function m(globalStore, _k1, _address154) {
  var _currentAddress = _address154;
  _addr.save(_globalCurrentAddress, _address154);
  return function () {
    return flip(globalStore, function (globalStore, x) {
      _addr.save(_globalCurrentAddress, _currentAddress);
      var _k2 = function (globalStore, y) {
        _addr.save(_globalCurrentAddress, _currentAddress);
        return function () {
          return _k1(globalStore, y);
        };
      };
      return function () {
        return x ? gaussian(globalStore, _k2, _address154.concat('_157'), 0, 1) : beta(globalStore, _k2, _address154.concat('_158'), 2, 2);
      };
    }, _address154.concat('_156'), 0.5);
  };
};

var mString = m.toString();

var mAst = esprima.parse(mString);

// undo the trampolining

// MOCK
var mUntrampolined = [
  '(function() {',
  'var x = flip(0.5); // [x]',
  'var y = repeat(2, x ? gaussian(0,1) : beta(2,2)); // [x,y]', // TODO: second arg should be a function, not a value
  'var z = map(function (x) { var y = x + 1; return y }, y); // [x,y,x]',
  'return z',
  '})'
].join('\n')


var ast1 = esprima.parse(mUntrampolined);

// _ast must be untrampolined
var uniqueNames = function(_ast) {
  var ast = lodash.cloneDeep(_ast);
  var rename = function(node, from, to) {
    return replace(node, {
      enter: function(node, parent) {
        if (node.type == 'Identifier') {
          if (node.name == from) {
            return _.extend({}, node, {name: to});
          }
        }
      }
    })
  }

  var gensymDict = {}
  var gensym = function(prefix) {
    if (!gensymDict[prefix]) {
      gensymDict[prefix] = 0
    }
    gensymDict[prefix] += 1
    return prefix + ('__' + gensymDict[prefix])
  }


  var currentClosure = new Closure({name: '__top__'});
  var topClosure = currentClosure;


  // traverse the untrampolined code, keeping a stack of names
  traverse(ast, {
    enter: function(node, parent) {
      //console.log('entering',node.type)

      if (node.type == 'VariableDeclaration') {
        var declNames = _.pluck(_.pluck(node.declarations, 'id'), 'name');

        currentClosure.addVariables(declNames);
      }
      if (node.type == 'FunctionExpression') {
        var newClosure = new Closure({name: node.id ? node.id.name : false,
                                      node: node
                                     });
        currentClosure.addChild(newClosure);
        var paramNames = _.pluck(node.params, 'name');
        newClosure.addVariables(paramNames);
        currentClosure = newClosure;
      }
    },
    leave: function(node, parent) {
      if (node.type == 'FunctionExpression') {
        if (currentClosure.parent) {
          currentClosure = currentClosure.parent;
        }
      }
    }
  })

  function getNameConflicts(closure) {
    var names = closure.variables;
    var current = closure;
    var conflicts = [];
    while(current.parent) {
      conflicts = _.union(conflicts, _.intersection(names, current.parent.variables));
      current = current.parent;
    }
    return conflicts;
  }

  // traverse the closures and mutate the ast, renaming is required
  var closuresQueue = [topClosure];
  while(closuresQueue.length > 0) {
    var closure = closuresQueue.shift();

    // get any name conflicts
    var nameConflicts = getNameConflicts(closure);

    closuresQueue = closuresQueue.concat(closure.children)

    if (nameConflicts.length > 0) {
      // TODO: optimize this by having rename take an array of froms and tos
      nameConflicts.forEach(function(name) { rename(closure.node, name, gensym(name)) })
    }
  }

  return ast;
}


var ast2 = uniqueNames(ast1);

// TODO: filter out variables that are entirely deterministic (i.e., neither random nor derived from random)
var getTopLevelVars = function(ast) {
  return _.chain(ast.body[0].expression.body.body)
    .where({type: 'VariableDeclaration'})
    .pluck('declarations')
    .flatten()
    .pluck('id')
    .pluck('name')
    .value();
}

// returns all identifiers referenced in a syntax subtree
var treeIdentifiers = function(t, name) {

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
  var varNames = getTopLevelVars(ast);

  var modelBody = ast.body[0].expression.body.body;

  return _.chain(varNames)
    .map(function(varName) {

      var declaration = _.find(modelBody,
                               function(ast1) {
                                 return ast1.type == 'VariableDeclaration' &&
                                   ast1.declarations[0].id.name == varName
                               });

      var otherIdentifiers = _.without(treeIdentifiers(declaration), varName);
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
        console.log(getParents(curNode));
        queue = queue.concat(getParents(curNode))
      } else {
        queue = queue.concat(getChildren(curNode))
      }
    }
  }

  return visited;

}

// emit a vega spec for the dependency graph

var nodesDf = getTopLevelVars(ast2).map(function(name) { return {name: name} });
var edgesDf = _.chain(topLevelDependencies(ast2))
    .map(function(vs, k) {
      return vs.map(function(v) {
        return {source: v, target: k}
      })
    })
    .flatten('shallow')
    .value();

console.log(edgesDf);

var vgSpec = {
  data: [
    {name: 'edges', values: edgesDf},
    {name: 'nodes', values: nodesDf,
     transform: [{type: 'force',
                  size: [800, 500],
                  links: 'edges',
                  "linkDistance": 30,
                  "linkStrength": 0.5,
                  "charge": -80,
                  "interactive": true,
                  "fixed": "fixed"
                 }]
    }
  ],
  marks: [
    {
      type: 'path',
      from: {data: 'edges'},
      "transform": [
        { "type": "lookup", "on": "nodes",
          "keys": ["source", "target"],
          "as":   ["_source", "_target"] },
        { "type": "linkpath", "shape": "line" }
      ],
      "properties": {
        "update": {
          "path": {"field": "layout_path"},
          "stroke": {"value": "#ccc"},
          "strokeWidth": {"value": 0.5}
        }
      }
    },
    {
      "type": "symbol",
      "from": {"data": "nodes"},
      "properties": {
        "enter": {
          "fillOpacity": {"value": 0.3},
          "fill": {"value": "steelblue"}
        },
        "update": {
          "x": {"field": "layout_x"},
          "y": {"field": "layout_y"},
          "stroke": [
            { "test": "indata('fixed', datum._id, 'id')",
              "value": "firebrick" },
            { "value": "steelblue" }
          ]
        }
      }
    }
  ]
}

console.log(JSON.stringify(vgSpec))
