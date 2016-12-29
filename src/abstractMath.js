var _ = require('underscore');
var lodash = require('lodash');

var Interval = require('interval-arithmetic');


// a support is an array of intervals

function Support(intervals) {
  this.intervals = intervals
}

Support.prototype.lower = function() {
  return _.min(_.pluck(this.intervals, 'lower'))
}

Support.prototype.upper = function() {
  return _.max(_.pluck(this.intervals, 'upper'))
}

Support.prototype.length = function() {
  return this.intervals.length;
}

// merge overlapping intervals within a support
Support.prototype.normalize = function() {
  var runningIntervals = [];
  this.intervals.forEach(function(curInt) {

    var overlapsCurrent = function(prevInt) {
      return Interval.intervalsOverlap(prevInt, curInt);
    }

    // partition previously touched intervals by whether they overlap
    // the current one or not
    var partitioned = _.groupBy(runningIntervals, overlapsCurrent),
        dontMerge = partitioned['false'] || [],
        doMerge = partitioned['true'] || [];

    var merged = _.reduce(doMerge, Interval.union, curInt);

    runningIntervals = dontMerge.concat(merged);
  })
  return runningIntervals
}

function support() {
  var args = _.toArray(arguments);
  var intervals = args.map(function(x) {
    if (_.isArray(x)) {
      return Interval(x[0], x[1])
    } else if (_.isNumber(x)) {
      return Interval(x)
    } else {
      throw new Error('unhandled interval argument : ' + x)
    }
  })
  return new Support(intervals)
}

function productMap(S, T, f) {
  var r = [];
  for(var i = 0, ii = S.length(); i < ii; i++) {
    var s = S.intervals[i];
    for(var j = 0, jj = T.length(); j < jj; j++) {
      var t = T.intervals[j];

      r.push(f(s,t))
    }
  }
  return r;
}

function add(S, T) {
  var U = new Support(productMap(S, T, Interval.add));
  return U.normalize();
}

function sub(S, T) {
  var U = new Support(productMap(S, T, Interval.sub));
  return U.normalize();
}

function mul(S, T) {
  var U = new Support(productMap(S, T, Interval.mul));
  return U.normalize();
}

function div(S, T) {
  var U = new Support(productMap(S, T, Interval.div));
  return U.normalize();
}


var x = support([1,2],[3,4]);
var y = support(1, 2);

console.log(add(x,y))
console.log(sub(x,y))
console.log(mul(x,y))
console.log(div(x,y))

module.exports = {
  add: add,
  sub: sub,
  mul: mul,
  div: div
}
