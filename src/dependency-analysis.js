/*
  (local-set-key (kbd "s-r") (lambda () (interactive) (save-buffer) (process-send-string "*shell viz*" "echo '\n'; node src/dependency-analysis.js\n")))
n*/

var _ = require('underscore'),
    $ = require('jquery');

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

sigma = require('sigma');

sigma.plugins = {};


// sigma plugin: animate

(function() {

  if (typeof sigma === 'undefined')
    throw 'sigma is not declared';

  sigma.utils.pkg('sigma.plugins');

  var _id = 0,
      _cache = {};

  // TOOLING FUNCTIONS:
  // ******************
  function parseColor(val) {
    if (_cache[val])
      return _cache[val];

    var result = [0, 0, 0];

    if (val.match(/^#/)) {
      val = (val || '').replace(/^#/, '');
      result = (val.length === 3) ?
        [
          parseInt(val.charAt(0) + val.charAt(0), 16),
          parseInt(val.charAt(1) + val.charAt(1), 16),
          parseInt(val.charAt(2) + val.charAt(2), 16)
        ] :
        [
          parseInt(val.charAt(0) + val.charAt(1), 16),
          parseInt(val.charAt(2) + val.charAt(3), 16),
          parseInt(val.charAt(4) + val.charAt(5), 16)
        ];
    } else if (val.match(/^ *rgba? *\(/)) {
      val = val.match(
        /^ *rgba? *\( *([0-9]*) *, *([0-9]*) *, *([0-9]*) *(,.*)?\) *$/
      );
      result = [
        +val[1],
        +val[2],
        +val[3]
      ];
    }

    _cache[val] = {
      r: result[0],
      g: result[1],
      b: result[2]
    };

    return _cache[val];
  }

  function interpolateColors(c1, c2, p) {
    c1 = parseColor(c1);
    c2 = parseColor(c2);

    var c = {
      r: c1.r * (1 - p) + c2.r * p,
      g: c1.g * (1 - p) + c2.g * p,
      b: c1.b * (1 - p) + c2.b * p
    };

    return 'rgb(' + [c.r | 0, c.g | 0, c.b | 0].join(',') + ')';
  }

  /**
   * This function will animate some specified node properties. It will
   * basically call requestAnimationFrame, interpolate the values and call the
   * refresh method during a specified duration.
   *
   * Recognized parameters:
   * **********************
   * Here is the exhaustive list of every accepted parameters in the settings
   * object:
   *
   *   {?array}             nodes      An array of node objects or node ids. If
   *                                   not specified, all nodes of the graph
   *                                   will be animated.
   *   {?(function|string)} easing     Either the name of an easing in the
   *                                   sigma.utils.easings package or a
   *                                   function. If not specified, the
   *                                   quadraticInOut easing from this package
   *                                   will be used instead.
   *   {?number}            duration   The duration of the animation. If not
   *                                   specified, the "animationsTime" setting
   *                                   value of the sigma instance will be used
   *                                   instead.
   *   {?function}          onComplete Eventually a function to call when the
   *                                   animation is ended.
   *
   * @param  {sigma}   s       The related sigma instance.
   * @param  {object}  animate An hash with the keys being the node properties
   *                           to interpolate, and the values being the related
   *                           target values.
   * @param  {?object} options Eventually an object with options.
   */
  sigma.plugins.animate = function(s, animate, options) {
    var o = options || {},
        id = ++_id,
        duration = o.duration || s.settings('animationsTime'),
        easing = typeof o.easing === 'string' ?
          sigma.utils.easings[o.easing] :
          typeof o.easing === 'function' ?
          o.easing :
          sigma.utils.easings.quadraticInOut,
        start = sigma.utils.dateNow(),
        nodes,
        startPositions;

    if (o.nodes && o.nodes.length) {
      if (typeof o.nodes[0] === 'object')
        nodes = o.nodes;
      else
        nodes = s.graph.nodes(o.nodes); // argument is an array of IDs
    }
    else
      nodes = s.graph.nodes();

    // Store initial positions:
    startPositions = nodes.reduce(function(res, node) {
      var k;
      res[node.id] = {};
      for (k in animate)
        if (k in node)
          res[node.id][k] = node[k];
      return res;
    }, {});

    s.animations = s.animations || Object.create({});
    sigma.plugins.kill(s);

    // Do not refresh edgequadtree during drag:
    var k,
        c;
    for (k in s.cameras) {
      c = s.cameras[k];
      c.edgequadtree._enabled = false;
    }

    function step() {
      var p = (sigma.utils.dateNow() - start) / duration;

      if (p >= 1) {
        nodes.forEach(function(node) {
          for (var k in animate)
            if (k in animate)
              node[k] = node[animate[k]];
        });

        // Allow to refresh edgequadtree:
        var k,
            c;
        for (k in s.cameras) {
          c = s.cameras[k];
          c.edgequadtree._enabled = true;
        }

        s.refresh();
        if (typeof o.onComplete === 'function')
          o.onComplete();
      } else {
        p = easing(p);
        nodes.forEach(function(node) {
          for (var k in animate)
            if (k in animate) {
              if (k.match(/color$/))
                node[k] = interpolateColors(
                  startPositions[node.id][k],
                  node[animate[k]],
                  p
                );
              else
                node[k] =
                  node[animate[k]] * p +
                  startPositions[node.id][k] * (1 - p);
            }
        });

        s.refresh();
        s.animations[id] = requestAnimationFrame(step);
      }
    }

    step();
  };

  sigma.plugins.kill = function(s) {
    for (var k in (s.animations || {}))
      cancelAnimationFrame(s.animations[k]);

    // Allow to refresh edgequadtree:
    var k,
        c;
    for (k in s.cameras) {
      c = s.cameras[k];
      c.edgequadtree._enabled = true;
    }
  };
})();

// sigma plugin: noverlap
;(function(undefined) {
  'use strict';

  if (typeof sigma === 'undefined')
    throw new Error('sigma is not declared');

  // Initialize package:
  sigma.utils.pkg('sigma.layout.noverlap');

  /**
   * Noverlap Layout
   * ===============================
   *
   * Author: @apitts / Andrew Pitts
   * Algorithm: @jacomyma / Mathieu Jacomy (originally contributed to Gephi and ported to sigma.js under the MIT license by @andpitts with permission)
   * Acknowledgement: @sheyman / Sébastien Heymann (some inspiration has been taken from other MIT licensed layout algorithms authored by @sheyman)
   * Version: 0.1
   */

  var settings = {
    speed: 3,
    scaleNodes: 1.2,
    nodeMargin: 5.0,
    gridSize: 20,
    permittedExpansion: 1.1,
    rendererIndex: 0,
    maxIterations: 500
  };

  var _instance = {};

  /**
   * Event emitter Object
   * ------------------
   */
  var _eventEmitter = {};

   /**
   * Noverlap Object
   * ------------------
   */
  function Noverlap() {
    var self = this;

    this.init = function (sigInst, options) {
      options = options || {};

      // Properties
      this.sigInst = sigInst;
      this.config = sigma.utils.extend(options, settings);
      this.easing = options.easing;
      this.duration = options.duration;

      if (options.nodes) {
        this.nodes = options.nodes;
        delete options.nodes;
      }

      if (!sigma.plugins || typeof sigma.plugins.animate === 'undefined') {
        throw new Error('sigma.plugins.animate is not declared');
      }

      // State
      this.running = false;
    };

    /**
     * Single layout iteration.
     */
    this.atomicGo = function () {
      if (!this.running || this.iterCount < 1) return false;

      var nodes = this.nodes || this.sigInst.graph.nodes(),
          nodesCount = nodes.length,
          i,
          n,
          n1,
          n2,
          xmin = Infinity,
          xmax = -Infinity,
          ymin = Infinity,
          ymax = -Infinity,
          xwidth,
          yheight,
          xcenter,
          ycenter,
          grid,
          row,
          col,
          minXBox,
          maxXBox,
          minYBox,
          maxYBox,
          adjacentNodes,
          subRow,
          subCol,
          nxmin,
          nxmax,
          nymin,
          nymax;

      this.iterCount--;
      this.running = false;

      for (i=0; i < nodesCount; i++) {
        n = nodes[i];
        n.dn.dx = 0;
        n.dn.dy = 0;

        //Find the min and max for both x and y across all nodes
        xmin = Math.min(xmin, n.dn_x - (n.dn_size*self.config.scaleNodes + self.config.nodeMargin) );
        xmax = Math.max(xmax, n.dn_x + (n.dn_size*self.config.scaleNodes + self.config.nodeMargin) );
        ymin = Math.min(ymin, n.dn_y - (n.dn_size*self.config.scaleNodes + self.config.nodeMargin) );
        ymax = Math.max(ymax, n.dn_y + (n.dn_size*self.config.scaleNodes + self.config.nodeMargin) );

      }

      xwidth = xmax - xmin;
      yheight = ymax - ymin;
      xcenter = (xmin + xmax) / 2;
      ycenter = (ymin + ymax) / 2;
      xmin = xcenter - self.config.permittedExpansion*xwidth / 2;
      xmax = xcenter + self.config.permittedExpansion*xwidth / 2;
      ymin = ycenter - self.config.permittedExpansion*yheight / 2;
      ymax = ycenter + self.config.permittedExpansion*yheight / 2;

      grid = {}; //An object of objects where grid[row][col] is an array of node ids representing nodes that fall in that grid. Nodes can fall in more than one grid

      for(row = 0; row < self.config.gridSize; row++) {
        grid[row] = {};
        for(col = 0; col < self.config.gridSize; col++) {
          grid[row][col] = [];
        }
      }

      //Place nodes in grid
      for (i=0; i < nodesCount; i++) {
        n = nodes[i];

        nxmin = n.dn_x - (n.dn_size*self.config.scaleNodes + self.config.nodeMargin);
        nxmax = n.dn_x + (n.dn_size*self.config.scaleNodes + self.config.nodeMargin);
        nymin = n.dn_y - (n.dn_size*self.config.scaleNodes + self.config.nodeMargin);
        nymax = n.dn_y + (n.dn_size*self.config.scaleNodes + self.config.nodeMargin);

        minXBox = Math.floor(self.config.gridSize* (nxmin - xmin) / (xmax - xmin) );
        maxXBox = Math.floor(self.config.gridSize* (nxmax - xmin) / (xmax - xmin) );
        minYBox = Math.floor(self.config.gridSize* (nymin - ymin) / (ymax - ymin) );
        maxYBox = Math.floor(self.config.gridSize* (nymax - ymin) / (ymax - ymin) );
        for(col = minXBox; col <= maxXBox; col++) {
          for(row = minYBox; row <= maxYBox; row++) {
            grid[row][col].push(n.id);
          }
        }
      }


      adjacentNodes = {}; //An object that stores the node ids of adjacent nodes (either in same grid box or adjacent grid box) for all nodes

      for(row = 0; row < self.config.gridSize; row++) {
        for(col = 0; col < self.config.gridSize; col++) {
          grid[row][col].forEach(function(nodeId) {
            if(!adjacentNodes[nodeId]) {
              adjacentNodes[nodeId] = [];
            }
            for(subRow = Math.max(0, row - 1); subRow <= Math.min(row + 1, self.config.gridSize - 1); subRow++) {
              for(subCol = Math.max(0, col - 1); subCol <= Math.min(col + 1,  self.config.gridSize - 1); subCol++) {
                grid[subRow][subCol].forEach(function(subNodeId) {
                  if(subNodeId !== nodeId && adjacentNodes[nodeId].indexOf(subNodeId) === -1) {
                    adjacentNodes[nodeId].push(subNodeId);
                  }
                });
              }
            }
          });
        }
      }

      //If two nodes overlap then repulse them
      for (i=0; i < nodesCount; i++) {
        n1 = nodes[i];
        adjacentNodes[n1.id].forEach(function(nodeId) {
          var n2 = self.sigInst.graph.nodes(nodeId);
          var xDist = n2.dn_x - n1.dn_x;
          var yDist = n2.dn_y - n1.dn_y;
          var dist = Math.sqrt(xDist*xDist + yDist*yDist);
          var collision = (dist < ((n1.dn_size*self.config.scaleNodes + self.config.nodeMargin) + (n2.dn_size*self.config.scaleNodes + self.config.nodeMargin)));
          if(collision) {
            self.running = true;
            if(dist > 0) {
              n2.dn.dx += xDist / dist * (1 + n1.dn_size);
              n2.dn.dy += yDist / dist * (1 + n1.dn_size);
            } else {
              n2.dn.dx += xwidth * 0.01 * (0.5 - Math.random());
              n2.dn.dy += yheight * 0.01 * (0.5 - Math.random());
            }
          }
        });
      }

      for (i=0; i < nodesCount; i++) {
        n = nodes[i];
        if(!n.fixed) {
          n.dn_x = n.dn_x + n.dn.dx * 0.1 * self.config.speed;
          n.dn_y = n.dn_y + n.dn.dy * 0.1 * self.config.speed;
        }
      }

      if(this.running && this.iterCount < 1) {
        this.running = false;
      }

      return this.running;
    };

    this.go = function () {
      this.iterCount = this.config.maxIterations;

      while (this.running) {
        this.atomicGo();
      };

      this.stop();
    };

    this.start = function() {
      if (this.running) return;

      var nodes = this.sigInst.graph.nodes();

      var prefix = this.sigInst.renderers[self.config.rendererIndex].options.prefix;

      this.running = true;

      // Init nodes
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].dn_x = nodes[i][prefix + 'x'];
        nodes[i].dn_y = nodes[i][prefix + 'y'];
        nodes[i].dn_size = nodes[i][prefix + 'size'];
        nodes[i].dn = {
          dx: 0,
          dy: 0
        };
      }
      _eventEmitter[self.sigInst.id].dispatchEvent('start');
      this.go();
    };

    this.stop = function() {
      var nodes = this.sigInst.graph.nodes();

      this.running = false;

      if (this.easing) {
        _eventEmitter[self.sigInst.id].dispatchEvent('interpolate');
        sigma.plugins.animate(
          self.sigInst,
          {
            x: 'dn_x',
            y: 'dn_y'
          },
          {
            easing: self.easing,
            onComplete: function() {
              self.sigInst.refresh();
              for (var i = 0; i < nodes.length; i++) {
                nodes[i].dn = null;
                nodes[i].dn_x = null;
                nodes[i].dn_y = null;
              }
              _eventEmitter[self.sigInst.id].dispatchEvent('stop');
            },
            duration: self.duration
          }
        );
      }
      else {
        // Apply changes
        for (var i = 0; i < nodes.length; i++) {
          nodes[i].x = nodes[i].dn_x;
          nodes[i].y = nodes[i].dn_y;
        }

        this.sigInst.refresh();

        for (var i = 0; i < nodes.length; i++) {
          nodes[i].dn = null;
          nodes[i].dn_x = null;
          nodes[i].dn_y = null;
        }
        _eventEmitter[self.sigInst.id].dispatchEvent('stop');
      }
    };

    this.kill = function() {
      this.sigInst = null;
      this.config = null;
      this.easing = null;
    };
  };

  /**
   * Interface
   * ----------
   */

  /**
   * Configure the layout algorithm.

   * Recognized options:
   * **********************
   * Here is the exhaustive list of every accepted parameter in the settings
   * object:
   *
   *   {?number}            speed               A larger value increases the convergence speed at the cost of precision
   *   {?number}            scaleNodes          The ratio to scale nodes by - a larger ratio will lead to more space around larger nodes
   *   {?number}            nodeMargin          A fixed margin to apply around nodes regardless of size
   *   {?number}            maxIterations       The maximum number of iterations to perform before the layout completes.
   *   {?integer}           gridSize            The number of rows and columns to use when partioning nodes into a grid for efficient computation
   *   {?number}            permittedExpansion  A permitted expansion factor to the overall size of the network applied at each iteration
   *   {?integer}           rendererIndex       The index of the renderer to use for node co-ordinates. Defaults to zero.
   *   {?(function|string)} easing              Either the name of an easing in the sigma.utils.easings package or a function. If not specified, the
   *                                            quadraticInOut easing from this package will be used instead.
   *   {?number}            duration            The duration of the animation. If not specified, the "animationsTime" setting value of the sigma instance will be used instead.
   *
   *
   * @param  {object} config  The optional configuration object.
   *
   * @return {sigma.classes.dispatcher} Returns an event emitter.
   */
  sigma.prototype.configNoverlap = function(config) {

    var sigInst = this;

    if (!config) throw new Error('Missing argument: "config"');

    // Create instance if undefined
    if (!_instance[sigInst.id]) {
      _instance[sigInst.id] = new Noverlap();

      _eventEmitter[sigInst.id] = {};
      sigma.classes.dispatcher.extend(_eventEmitter[sigInst.id]);

      // Binding on kill to clear the references
      sigInst.bind('kill', function() {
        _instance[sigInst.id].kill();
        _instance[sigInst.id] = null;
        _eventEmitter[sigInst.id] = null;
      });
    }

    _instance[sigInst.id].init(sigInst, config);

    return _eventEmitter[sigInst.id];
  };

  /**
   * Start the layout algorithm. It will use the existing configuration if no
   * new configuration is passed.

   * Recognized options:
   * **********************
   * Here is the exhaustive list of every accepted parameter in the settings
   * object
   *
   *   {?number}            speed               A larger value increases the convergence speed at the cost of precision
   *   {?number}            scaleNodes          The ratio to scale nodes by - a larger ratio will lead to more space around larger nodes
   *   {?number}            nodeMargin          A fixed margin to apply around nodes regardless of size
   *   {?number}            maxIterations       The maximum number of iterations to perform before the layout completes.
   *   {?integer}           gridSize            The number of rows and columns to use when partioning nodes into a grid for efficient computation
   *   {?number}            permittedExpansion  A permitted expansion factor to the overall size of the network applied at each iteration
   *   {?integer}           rendererIndex       The index of the renderer to use for node co-ordinates. Defaults to zero.
   *   {?(function|string)} easing              Either the name of an easing in the sigma.utils.easings package or a function. If not specified, the
   *                                            quadraticInOut easing from this package will be used instead.
   *   {?number}            duration            The duration of the animation. If not specified, the "animationsTime" setting value of the sigma instance will be used instead.
   *
   *
   *
   * @param  {object} config  The optional configuration object.
   *
   * @return {sigma.classes.dispatcher} Returns an event emitter.
   */

  sigma.prototype.startNoverlap = function(config) {

    var sigInst = this;

    if (config) {
      this.configNoverlap(sigInst, config);
    }

    _instance[sigInst.id].start();

    return _eventEmitter[sigInst.id];
  };

  /**
   * Returns true if the layout has started and is not completed.
   *
   * @return {boolean}
   */
  sigma.prototype.isNoverlapRunning = function() {

    var sigInst = this;

    return !!_instance[sigInst.id] && _instance[sigInst.id].running;
  };

}).call(this);

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

function dependenciesToSigmaSpec(deps) {
  var spec = {};
  var nodes = _.keys(deps);
  // TODO: a topological sort where parents have lower y's than their children
  // (and siblings are arrayed neatly)
  // maybe repurpose reingold-tilford?
  spec.nodes = _.map(nodes,
                     function(node, i) {
                       return {
                         id: node,
                         label: node,
                         x: Math.random() * i,
                         y: Math.random() * i,
                         size: 100
                       }
                     });

  var edgeNum = 0;
  spec.edges = _.chain(deps)
    .map(function(parents, child) {
      return _.map(parents,
                   function(parent) {
                     return {
                       id: [parent, child].join('->'),
                       source: parent,
                       target: child,
                       type: 'arrow',
                       color: 'blue',
                       size: 50,
                       weight: 1
                     }
                   }
                  )
    })
    .flatten()
    .value();

  return spec;
}

// TODO: render to svg
var structure = function(f) {
  var wpplSource = reflection.getWpplSource(f);
  var ast = esprima.parse(wpplSource);
  ast = reflection.uniqueNames(ast);

  var container = wpEditor.makeResultContainer();
  var containerId = 'sigma' + _.now();
  $(container).attr({id: containerId})
    .css({height: '500px'});

  var dependencies = topLevelDependencies(ast);

  var graphMock = {
    "nodes": [
      {
        "id": "n0",
        "label": "A node",
        "x": 0,
        "y": 0,
        "size": 3
      },
      {
        "id": "n1",
        "label": "Another node",
        "x": 3,
        "y": 1,
        "size": 2
      },
      {
        "id": "n2",
        "label": "And a last one",
        "x": 1,
        "y": 3,
        "size": 1
      }
    ],
    "edges": [
      {
        "id": "e0",
        "source": "n0",
        "target": "n1",
        "type": "arrow",
        "size": 100,
        "weight": 1
      },
      {
        "id": "e1",
        "source": "n1",
        "target": "n2"
      },
      {
        "id": "e2",
        "source": "n2",
        "target": "n0"
      }
    ]
  };

  var graph = dependenciesToSigmaSpec(dependencies);

  var sigmaSpec = {
    container: containerId,
    settings: {
      defaultNodeColor: '#ec5148',
      labelThreshold: 0,
      minNodeSize: 20,
      maxNodeSize: 20,
      minEdgeSize: 3,
      maxEdgeSize: 3,
      minArrowSize: 10
    },
    graph: graph//graphMock
  }

  var s = new sigma(sigmaSpec);
  s.startNoverlap({nodeMargin: 5});
}

var cliques = function(f, MOCK_observedVars, MOCK_queryVars) {
  var wpplSource = reflection.getWpplSource(f);
  var ast = esprima.parse(wpplSource);
  ast = reflection.uniqueNames(ast);
  var dependencies = topLevelDependencies(ast);

  // // TODO: get conditions from source code
  var observedVars = MOCK_observedVars;

  // // TODO: get query vars from source code
  var queryVars = MOCK_queryVars;

  var dependencySets = _.map(
    queryVars,
    function(queryVar) {
      return _.keys(bayesBall(dependencies, queryVar, observedVars));
    }
  )

  // merge dependency sets that overlap
  var runningDependencySets = [];
  _.each(dependencySets,
         function(curSet) {
           // console.log('curSet: ' + curSet);

           var overlapsCurrent = function(prevSet) {
             return _.intersection(curSet, prevSet).length > 0;
           }

           // partition previously touched depsets by whether they overlap
           // the current one or not
           var partitioned = _.groupBy(runningDependencySets, overlapsCurrent),
               dontMerge = partitioned['false'] || [],
               doMerge = partitioned['true'] || [];

           // console.log('dontMerge:', dontMerge);
           // console.log('doMerge:', doMerge);

           var merged = _.unique(_.flatten(doMerge).concat(curSet));
           // console.log('merged:', merged);

           runningDependencySets = dontMerge.concat([merged]);
           // console.log('running:', JSON.stringify(runningDependencySets));
           // console.log('\n')
         })

  return runningDependencySets;
}


module.exports = {
  structure: structure,
  cliques: cliques
}
