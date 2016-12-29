'use strict';

var esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');
var build = require('./builders');
var reflection = require('./reflection'),
    getWpplSource = reflection.getWpplSource;

// adapted from webppl src/transforms/ad.js
// ------------------------------------------------------------

var rules = function(node) {
  switch (node.type) {
    case 'UnaryExpression':
      switch (node.operator) {
        // abstractMath.plus is defined in src/ad.js
        case '+': return 'abstractMath.plus';
        case '-': return 'abstractMath.neg';
      }
      break;
    case 'BinaryExpression':
      switch (node.operator) {
        case '*': return 'abstractMath.mul';
        case '/': return 'abstractMath.div';
        case '+': return 'abstractMath.add';
        case '-': return 'abstractMath.sub';
        case '<': return 'abstractMath.lt';
        case '<=': return 'abstractMath.leq';
        case '>': return 'abstractMath.gt';
        case '>=': return 'abstractMath.geq';
        case '==': return 'abstractMath.eq';
        case '!=': return 'abstractMath.neq';
        case '===': return 'abstractMath.peq';
        case '!==': return 'abstractMath.pneq';
      }
      break;
  }
  return false;
};

// Parse a dotted identifier.
// e.g. 'ad.scalar' => memberExpr(identifer('ad'), identifer('scalar'))
function parse(dotted) {
  return dotted.split('.')
      .map(build.identifier)
      .reduce(function(a, b) { return build.memberExpression(a, b); });
}

function rewrite(node, fn) {
  var callee = parse(fn);
  if (node.type === 'UnaryExpression') {
    return build.callExpression(callee, [node.argument]);
  } else if (node.type === 'BinaryExpression') {
    return build.callExpression(callee, [node.left, node.right]);
  } else {
    throw new Error('Unexpected node type');
  }
}

function isInplaceAssignmentOp(op) {
  return op === '+=' || op === '-=' || op === '*=' || op === '/=';
}

function abstractMath(ast) {
  return estraverse.replace(ast, {
    enter: function(node, parent) {
      // Re-write operators
      var fn = rules(node);
      if (fn) {
        return rewrite(node, fn);
      }
      // Expand in-place assignment operators
      if (node.type === 'AssignmentExpression' &&
          isInplaceAssignmentOp(node.operator)) {
        return build.assignmentExpression(
            '=', node.left,
            build.binaryExpression(node.operator[0], node.left, node.right));
      }
      // Re-write Math.*
      if (node.type === 'MemberExpression' &&
          node.object.type === 'Identifier' &&
          node.object.name === 'Math') {
        return build.memberExpression(parse('abstractMath'), node.property, node.computed);
      }
    }
  });
}

// ------------------------------------------------------------

var priorSupport = function(f) {
  var wpplSource = getWpplSource(f);
  var ast = esprima.parse(wpplSource);
}

// gets the prior support for a generative model
function getSupport(f) {
  var wpplSource = getWpplSource(f);
  var ast = esprima.parse(wpplSource);

  // make math operations abstract
  abstractMath(ast);

  return escodegen.generate(ast);

}

module.exports = {
  getSupport: getSupport
};
