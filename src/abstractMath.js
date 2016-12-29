var _ = require('underscore');
var lodash = require('lodash');

// int.upper can be equal to int.lower
// in which case we just have a number
function Interval(opts) {
  this.lower = opts.lower;
  this.upper = opts.upper;
}

function between(x, lower, upper) {
  return x >= lower && x <= upper
}

Interval.prototype.overlaps = function(that) {
  return false ||
    //
    //     ...---]
    //     [----------]
    //
    between(this.upper, that.lower, that.upper) ||
    between(that.upper, this.lower, this.upper) ||
    //
    //          [---...
    //     [----------]
    //
    between(this.lower, that.lower, that.upper) ||
    between(that.lower, this.lower, this.upper);
}

Interval.prototype.merge = function(that) {
  return new Interval({
    lower: Math.min(this.lower, that.lower),
    upper: Math.max(this.upper, that.upper)
  })
}

function interval(lower, upper) {
  var int = new Interval({lower: lower, upper: upper});
  return int;
}

Interval.prototype.isFinite = function() {
  return this.lower == this.upper
}

// a support is an array of intervals
// trick for subclassing Array from https://jokeyrhyme.github.io/blog/2013/05/13/1/js_inheritance_and_array_prototype.html

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

// merge overlapping intervals
Support.prototype.normalize = function() {
  var newIntervals = [];
  this.intervals.forEach(function(curInt) {
    // see if we can merge with any previously seen intervals
    var previousMergeIndex = _.findIndex(newIntervals,
                                         function(prevInt) {
                                           return prevInt.overlaps(curInt)
                                         }
                                        )
  })
}

function support() {
  var args = _.toArray(arguments);
  var intervals = args.map(function(x) {
    if (_.isArray(x)) {
      return interval(x[0], x[1])
    } else if (_.isNumber(x)) {
      return interval(x, x)
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
  return productMap(S, T,
                    function(s, t) {
                      return new Interval({
                        lower: s.lower + t.lower,
                        upper: s.upper + t.upper
                      })
  })
}


// add(support(interval(3,5)))

// var x = support([3, 5], [6, 7])
// var y = support(1, 2)

// console.log(add(x, y))

var a = interval(3, 4);
var b = interval(1, 5);
console.log(a.overlaps(b))
