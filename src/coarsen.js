var d3 = require('d3');

var coarsen = function(xs, numBins) {
  var scale = d3.scale.quantile().domain(xs).range(d3.range(4));
  return xs.map(function(x) { return scale(x) + '' })
}
