var esprima = require('esprima');
var escodegen = require('escodegen');

var traverse = require('estraverse').traverse;
var replace = require('estraverse').replace;
var _ = require('underscore');

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


// traverse the untrampolined code, keeping a stack of names

// before we enter a function, check that the parameters don't hide existing names. if they do, rename

var ast = esprima.parse(mUntrampolined);

// a closure is a object with these properties:
// - name (optional)
// - variables
// - children (child closures)
// - parent (optional)
var Closure = function(options) {
  _.extend(this, _.defaults(options,
                            {name: false,
                             children: [],
                             parent: false,
                             variables: []
                            }))
}

Closure.prototype.addVariables = function(variables) {
  //console.log('adding', names,)
  this.variables = this.variables.concat(variables);

}

Closure.prototype.addChild = function(child) {
  child.parent = this;
  this.children.push(child);
}

// remove all parent properties so we can run JSON.stringify without
// bumping into circularities
Closure.prototype.orphanize = function() {
  return {
    name: this.name,
    children: this.children.map(function(x) { return x.orphanize() }),
    variables: this.variables
  }
}


var currentClosure = new Closure({name: '__top__'});
var topClosure = currentClosure;

//console.log(currentClosure);




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

// traverse the closures and mutate the ast when renaming is required
var closuresQueue = [topClosure];
while(closuresQueue.length > 0) {
  var closure = closuresQueue.shift();

  // get any name conflicts
  var nameConflicts = getNameConflicts(closure);

  console.log(nameConflicts);
  closuresQueue = closuresQueue.concat(closure.children)

  if (nameConflicts.length > 0) {
    // TODO: optimize this by having rename take an array of froms and tos
    nameConflicts.forEach(function(name) { rename(closure.node, name, gensym(name)) })
  }
}

console.log(escodegen.generate(ast))

// console.log(JSON.stringify(topClosure.orphanize(), null, 1))
