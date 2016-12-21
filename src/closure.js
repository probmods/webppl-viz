var _ = require('underscore');

// a closure is a object with these properties:
// - name (optional)
// - variables
// - children (child closures)
// - parent (optional)
// - node (reference to an AST node)
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

module.exports = Closure;
