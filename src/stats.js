var _ = require('underscore');
var d3 = require('d3');

// input: a list of samples and, optionally, a kernel function
// output: a list of estimated densities
function kde(samps, options) {
  options = _.defaults(options || {},
                       {bounds: 'auto',
                        bandwidth: 'auto',
                        kernel: 'epanechnikov',
                        numPoints: 100,
                        weights: false
                       })

  var kernel;
  // TODO: add more kernels
  if (options.kernel === 'epanechnikov') {
    kernel = function(u) {
      return Math.abs(u) <= 1 ? .75 * (1 - u * u) : 0;
    };
  } else if (typeof options.kernel == 'function') {
    kernel = options.kernel
  }

  // add weights
  var isWeighted = _.isArray(options.weights),
      weights = options.weights;

  // get optimal bandwidth
  // HT http://en.wikipedia.org/wiki/Kernel_density_estimation#Practical_estimation_of_the_bandwidth
  // to support ERP as argument, we need to know the number of samples from an ERP
  // (TODO: submit PR for webppl where Histogram.prototype.toERP preserves this info)
  var mean = 0, n = samps.length;
  var sumWeights = 0;
  if (isWeighted) {
    for(var i = 0; i < n; i++) {
      sumWeights += weights[i];
      mean += weights[i] * samps[i];
    }
    mean = mean / sumWeights;
  } else {
    mean = samps.reduce(function(x,y) { return x + y })/n;
  }

  var bandwidth;
  if (options.bandwidth == 'auto') {
    var s = Math.sqrt(samps.reduce(function(acc, x, i) {
      return acc + (isWeighted ? weights[i] : 1) * Math.pow(x - mean, 2)
    }, 0) / (isWeighted ? sumWeights : n-1));
    // TODO: silverman's rule can fail
    bandwidth = 1.06 * s * Math.pow(n, -0.2);
  } else {
    bandwidth = options.bandwidth;
  }

  var min, max;
  if (options.bounds == 'auto') {
    min = _.min(samps);
    max = _.max(samps);
  } else {
    min = options.bounds[0];
    max = options.bounds[1];
  }

  var numPoints = options.numPoints;
  var binWidth = (max - min) / numPoints;

  var results = [];

  for (var i = 0; i <= numPoints; i++) {
    var x = min + i * binWidth;
    var kernelSum = 0;
    for (var j = 0, jj = samps.length; j < jj; j++) {
      var w = isWeighted ? weights[j] : 1;
      kernelSum += w * kernel((x - samps[j]) / bandwidth);
    }
    results.push({
      item: x,
      density: kernelSum / ((isWeighted ? sumWeights : n) * bandwidth)
    });
  }
  return results;
}

function kde2d(x,y) {
  // mimics kde2d from the MASS package in R, which uses axis-aligned gaussian kernel

  function dnorm(x) {
    var mu = 0, sigma = 1;

    return 1/(sigma * Math.sqrt(2*Math.PI)) * Math.exp(-Math.pow(x-mu,2) / (2 * sigma * sigma))
  }

  // HT rosetta code
  function Matrix(ary) {
    this.mtx = ary
    this.height = ary.length;
    this.width = ary[0].length;
  }

  // HT rosetta code
  // returns a new matrix
  Matrix.prototype.mult = function(other) {
    if (this.width != other.height) {
      throw new Error("Matrix multiply: incompatible sizes (" + this.width + "," + this.height + "), (" + other.width + "," + other.height + ")" );
    }

    var result = [];
    for (var i = 0; i < this.height; i++) {
      result[i] = [];
      for (var j = 0; j < other.width; j++) {
        var sum = 0;
        for (var k = 0; k < this.width; k++) {
          sum += this.mtx[i][k] * other.mtx[k][j];
        }
        result[i][j] = sum;
      }
    }
    return new Matrix(result);
  }

  Matrix.prototype.transpose = function() {
    var transposed = [];
    for (var i = 0; i < this.width; i++) {
      transposed[i] = [];
      for (var j = 0; j < this.height; j++) {
        transposed[i][j] = this.mtx[j][i];
      }
    }
    return new Matrix(transposed);
  }

  Matrix.prototype.map = function(f) {
    var res = [];
    for (var i = 0; i < this.height; i++) {
      var row = [];
      for (var j = 0; j < this.width; j++) {
        row.push( f(this.mtx[i][j]) );
      }
      res.push(row);
    }
    return new Matrix(res);
  }


  var nx = x.length;
  var n1 = 25;
  var n2 = 25;

  var minX = _.min(x);
  var maxX = _.max(x);

  var minY = _.min(y);
  var maxY = _.max(y);

  var stepWidthX = (maxX - minX)/(n1-1);
  var stepWidthY = (maxY - minY)/(n2-1);

  var gx = _.range(n1).map(function(k) { return minX + k * stepWidthX });
  var gy = _.range(n2).map(function(k) { return minY + k * stepWidthY });

  // todo

  var mean = function(v) {
    return util.sum(v) / v.length;
  }

  var variance = function(v) {
    var m = mean(v);
    return util.sum(_.map(v, function(vi) { return (vi-m) * (vi-m) }))/(v.length - 1);
  }

  var getBandwidth = function(v) {
    var scale = d3.scale.quantile().domain(v).range(d3.range(4));
    var r = [scale.invertExtent(0)[1], scale.invertExtent(2)[1]];
    var h = (r[1] - r[0])/1.34;
    return 4 * 1.06 * Math.min(Math.sqrt(variance(v)), h) * Math.pow(v.length, -0.2)
  }

  var h = [getBandwidth(x)/4, getBandwidth(y)/4]

  // compute limits for 25 percentile through 75

  var ax = _.map(gx,
                 function(_gx) {
                   return _.map(x, function(_x) {
                     return (_gx - _x)/h[0];
                   })
                 }
                )

  var ay = _.map(gy,
                 function(_gy) {
                   return _.map(y, function(_y) {
                     return (_gy - _y)/h[1];
                   })
                 }
                )

  var mx = new Matrix(ax).map(dnorm);
  var my = new Matrix(ay).map(dnorm);

  var z = mx.mult(my.transpose()).mtx.map(function(row) {
    return row.map(function(col) {
      return col/(nx * h[0] * h[1])
    })
  })

  var ret = [];
  for(var ix = 0; ix < n1; ix++) {
    for(var iy = 0; iy < n2; iy++) {
      ret.push({x: gx[ix], y: gy[iy], density: z[ix][iy]})
    }
  }

  return ret;

}

var exports = {
  kde: kde,
  kde2d: kde2d
}

if (typeof viz !== 'undefined') {
  viz.stats = exports;
}
module.exports = exports;
