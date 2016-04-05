'use strict';

/*

  relies on vega-lite library

  */

var _ = require('underscore');
var d3 = require('d3');
var $ = require('jquery');

var vl = require('vega-lite');
var vg = require('vega');

function isErp(x) {
  // TODO: take from dippl
  return x.support && x.score;
}

// a data frame is an array of objects where
// all objects have the same keys
function isDataFrame(arr) {
  var first_keys = _.keys(arr[0]);
  if (first_keys.length > 0) {
    //check if same keys all the way through
    for (var i=0; i<arr.length; i++) {
      var ith_keys = _.keys(arr[i]);
      for (var j=0; j<arr.length; j++) {
        if (ith_keys[j] != first_keys[j]) {
          return false;
        }
      }
    }
    return true;
  } else {
    return false;
  }
}

function isVector(arr) {
  var anyStructuredObjects = false;
  // first check case 1
  for(var i = 0, n = arr.length; i < n; i++) {
    if (_.isObject(arr[i])) {
      return false;
    }
  }
  return true;
}

// a pseudo data frame is either
// 1. an array of values OR
// 2. an array of subarrays where:
//      each subarray represents a row in a table
//      all subarrays have the same length and same type
function isPseudoDataFrame(arr, strict /* default true*/) {

  if (strict === undefined) {
    strict = true;
  }

  // TODO: if non-strict, subarray lengths can be different but types must still match
  var subArrayLengths = arr.map(function(x) { return x.length});

  var subArrayLengthsOk = _.unique(subArrayLengths).length == 1;
  if (!subArrayLengthsOk) {
    return false;
  }

  var n = subArrayLengths[0];

  // OPTIMIZE
  var columnTypesOk = _.range(0,n).map(function(colNum) {
    var values =  _.pluck(arr, colNum + '');
    var types = _.map(values, function(v) { return typeof(v) })
    return _.unique(types).length == 1;
  })

  return _.every(columnTypesOk);
}

var print = require('./old').print;

var wait = function(ms,f) {
  setTimeout(f,ms);
}

// i think i need this for proper axis labels when states are objects
// but you don't want this turning numbers into strings either
var stringifyIfObject = function(x) {
  if (typeof x == 'object') {
    return JSON.stringify(x)
  } else {
    return x;
  }
}

var kindPrinter = {};

kindPrinter.c = function(types, support, scores) {
  var fieldNames = _.keys(support[0]);
  var fieldName = fieldNames[0];

  var values = _.pluck(support, fieldName);
  var probs = scores.map(function(score) { return Math.exp(score) });

  bar(values, probs, {xLabel: fieldName, yLabel: 'frequency'})
}

// TODO: visualizing [{x: foo}, {x: bar}, {x: baz}]
// should be the same as visualizing [foo, bar, baz]
kindPrinter.r = function(types, support, scores) {
  var fieldNames = _.keys(support[0]);
  var fieldName = fieldNames[0];

  var values = _.pluck(support, fieldName);

  var data = _.zip(support, scores).map(function(x) {
    return _.extend({prob: Math.exp(x[1])}, x[0])
  })

  var densityEstimates = kde(values);

  var vlSpec = {
    "data": {"values": densityEstimates},
    "mark": "line",
    encoding: {
      x: {"type": "quantitative", "field": "item", axis: {title: fieldName}},
      y: {"type": "quantitative", "field": "density"}
    }
  };

  renderVlSpec(vlSpec);

}

kindPrinter.cc = function(types, support, scores) {
  var fieldNames = _.keys(support[0]);
  var field1Name = fieldNames[0];
  var field2Name = fieldNames[1];

  var data = _.zip(support, scores).map(function(x) {
    return _.extend({prob: Math.exp(x[1])}, x[0])
  })

  var vlSpec = {
    data: {values: data},
    mark: "text",
    encoding: {
      row: {field: field1Name, type: 'nominal'},
      column: {field: field2Name, type: 'nominal'},
      color: {field: 'prob', type: 'quantitative'},
      text: {field: 'prob', type: 'quantitative'}
      // size and color don't work perfectly; stumbles on visualizing vanilla 2d gaussian from MH (no conditioning)
      // because MH can result in there being only a single unique score value (relative probabilities between states are not preserved in posterior)
    },
    config: {mark: {applyColorToBackground: true}, numberFormat: ".1e"}
  }

  renderVlSpec(vlSpec);
}

kindPrinter.cr = function(types, support, scores) {
  var typesExpanded = _.map(types, function(v,k) {
    return {name: k,
            type: v}
  })

  var cDimNames = _(typesExpanded).chain().where({type: 'categorical'}).pluck('name').value();
  var rDimNames = _(typesExpanded).chain().where({type: 'real'}).pluck('name').value();

  var cDimName = cDimNames[0];
  var rDimName = rDimNames[0]

  var data = _.zip(support, scores).map(function(x) {
    return _.extend({prob: Math.exp(x[1])}, x[0])
  })

  var dataGroupedByC = _.groupBy(data, function(obs) { return obs[cDimName] });

  // for each group, get the density estimate and weight each bin within that estimate
  // by the total group probability
  var densityEstimates = _.mapObject(dataGroupedByC,
                                     function(states, k) {

                                       var groupWeight = util.sum(_.pluck(states,'prob'));

                                       var rValues = _.pluck(states, rDimName);
                                       var estimates = kde(rValues);
                                       _.each(estimates, function(est) { est.density *= groupWeight });
                                       return estimates;
                                     });

  // TODO: do this cleaner and without mutation
  var densityEstimatesTidied = _.chain(densityEstimates)
      .pairs()
      .map(function(x) {
        var cValue = x[0];
        var densityBins = x[1];
        densityBins.forEach(function(bin) { bin[cDimName] = cValue });
        return densityBins })
      .flatten(1)
      .value();

  var vlSpec = {
    "data": {"values": densityEstimatesTidied},
    "mark": "line",
    encoding: {
      x: {"type": "quantitative", "field": "item", axis: {title: rDimName}},
      y: {"type": "quantitative", "field": "density"},
      color: {"type": "nominal", "field": cDimName, axis: {title: cDimName}}
    }
  };

  renderVlSpec(vlSpec);

}

kindPrinter.rr = function(types, support, scores) {
  var fieldNames = _.keys(support[0]);
  var field1Name = fieldNames[0];
  var field2Name = fieldNames[1];

  var data = _.zip(support, scores).map(function(x) {
    return _.extend({prob: Math.exp(x[1])}, x[0])
  })

  var vlSpec = {
    data: {values: data},
    mark: "point",
    encoding: {
      x: {field: field1Name, type: "quantitative"},
      y: {field: field2Name, type: "quantitative"},
      size: {field: 'prob', type: 'quantitative'},
      color: {field: 'prob', type: 'quantitative'},
      order: {"field": 'prob', "type": "quantitative", "sort": "ascending"}
      // size and color don't work perfectly; stumbles on visualizing vanilla 2d gaussian from MH (no conditioning)
      // because MH can result in there being only a single unique score value (relative probabilities between states are not preserved in posterior)
    },
    config: {numberFormat: ".1e"}
  }

  renderVlSpec(vlSpec);
}


// TODO: find the field with the smallest number of values and use that for rows
// TODO: rewrite once vega-lite can support small multiples of heatmaps (https://github.com/vega/vega-lite/issues/699)
kindPrinter.ccc = function(types, support, scores) {
  var fieldNames = _.keys(support[0]);
  var field1Name = fieldNames[0];
  var field2Name = fieldNames[1];
  var field3Name = fieldNames[2];

  var data = _.zip(support, scores).map(function(x) {
    return _.extend({prob: Math.exp(x[1])}, x[0])
  })

  var bucketedData = _.groupBy(data, field3Name);

  _.each(bucketedData,
         function(d,field3Value) {
           // TODO: make this less hacky
           global.print({},function() {},'',field3Name + ' = ' + field3Value);
           var vlSpec = {
             data: {values: d},
             mark: "text",
             encoding: {
               row: {field: field1Name, type: 'nominal'},
               column: {field: field2Name, type: 'nominal'},
               color: {field: 'prob', type: 'quantitative'},
               text: {field: 'prob', type: 'quantitative'}
               // size and color don't work perfectly; stumbles on visualizing vanilla 2d gaussian from MH (no conditioning)
               // because MH can result in there being only a single unique score value (relative probabilities between states are not preserved in posterior)
             },
             config: {mark: {applyColorToBackground: true}, numberFormat: ".1e"}
           }

           renderVlSpec(vlSpec);
         });

  // todo
}

kindPrinter.ccr = function(types, support, scores) {
  var typesExpanded = _.map(types, function(v,k) {
    return {name: k,
            type: v}
  })

  var cDimNames = _(typesExpanded).chain().where({type: 'categorical'}).pluck('name').value();
  var rDimNames = _(typesExpanded).chain().where({type: 'real'}).pluck('name').value();

  var facetDimName = cDimNames[0];
  var cDimName = cDimNames[1];
  var rDimName = rDimNames[0]

  var data = _.zip(support, scores).map(function(x) {
    return _.extend({prob: Math.exp(x[1])}, x[0])
  })

  var dataGroupedByC = _.groupBy(data, function(obs) { return obs[facetDimName] + "," + obs[cDimName] });

  // for each group, get the density estimate and weight each bin within that estimate
  // by the total group probability
  var densityEstimates = _.mapObject(dataGroupedByC,
                                     function(states, k) {

                                       var groupWeight = util.sum(_.pluck(states,'prob'));

                                       var rValues = _.pluck(states, rDimName);
                                       var estimates = kde(rValues);
                                       _.each(estimates, function(est) { est.density *= groupWeight });
                                       return estimates;
                                     });


  // TODO: do this cleaner and without mutation
  var densityEstimatesTidied = _.chain(densityEstimates)
      .pairs()
      .map(function(x) {
        var keySplit = x[0].split(",");
        var facetValue = keySplit[0];
        var cValue = keySplit[1];
        var densityBins = x[1];
        densityBins.forEach(function(bin) { bin[facetDimName] = facetValue; bin[cDimName] = cValue });
        return densityBins })
      .flatten(1)
      .value();

  var vlSpec = {
    "data": {"values": densityEstimatesTidied},
    "mark": "line",
    encoding: {
      x: {"type": "quantitative", "field": "item", axis: {title: rDimName}},
      y: {"type": "quantitative", "field": "density"},
      color: {"type": "nominal", "field": cDimName, axis: {title: cDimName}},
      column: {type: 'nominal', field: facetDimName}
    }
  };

  renderVlSpec(vlSpec);

}

kindPrinter.crr = function(types, support, scores) {
  var typesExpanded = _.map(types, function(v,k) {
    return {name: k,
            type: v}
  })

  var cDimNames = _(typesExpanded).chain().where({type: 'categorical'}).pluck('name').value();
  var rDimNames = _(typesExpanded).chain().where({type: 'real'}).pluck('name').value();

  var data = _.zip(support, scores).map(function(x) {
    return _.extend({prob: Math.exp(x[1])}, x[0])
  })

  var vlSpec = {
    data: {values: data},
    mark: "point",
    encoding: {
      column: {field: cDimNames[0], type: "nominal"},
      x: {field: rDimNames[0], type: "quantitative"},
      y: {field: rDimNames[1], type: "quantitative"},
      size: {field: 'prob', type: 'quantitative'},
      color: {field: 'prob', type: 'quantitative'},
      order: {'field': 'prob', 'type': 'quantitative', 'sort': 'ascending'}
      // size and color don't work perfectly; stumbles on visualizing vanilla 2d gaussian from MH (no conditioning)
      // because MH can result in there being only a single unique score value (relative probabilities between states are not preserved in posterior)
    },
    config: {numberFormat: ".1e"}
  }

  renderVlSpec(vlSpec);
}

// automatically render an ERP
var vegaPrint = function(obj) {
  var getColumnType = function(columnValues) {
    // for now, support real, integer, and categorical
    // some questions:
    // - can we support list of reals a la dirichlet?
    // - would knowing type information from the forward model (e.g., foo ~ multinomial([a,b,c])) help?
    if (_.every(columnValues, _.isNumber)) {
      return _.every(columnValues, Number.isInteger) ? 'categorical' : 'real'
    } else {
      return 'categorical'
    }
  };

  var getColumnTypes = function(df) {
    var columnNames = _.keys(df[0]);
    return _.object(
      columnNames,
      _.map(columnNames,
            function(name) {
              var columnValues = _.pluck(df, name);
              return getColumnType(columnValues)
            })
    )
  };

  if (!isErp(obj)) {
    // TODO: write wpEditor.warn method, use it to inform user that vegaPrint only works on ERPs
    // (though maybe this isn't necessary since we are using __print__ decorator in wp-editor?)
    return null;
  }

  var support = obj.support();
  var supportStructure = (isVector(support)
                          ? 'vector'
                          : (isPseudoDataFrame(support)
                             ? 'pseudodataframe'
                             : (isDataFrame(support)
                                ? 'dataframe'
                                : 'other')));

  // fall back to table when support is not nicely structured
  if (supportStructure == 'other') {
    return table(obj);
  }

  var scores = _.map(support,
                     function(state){return obj.score(null, state);});

  if (isVector(support)) {
    // promote vector into data frame with a single column ("state")
    // so that we can directly use kindPrinter.c or kindPrinter.r
    support = support.map(function(x) {
      return {state: x}
    });
  }

  if (!isDataFrame(support) && isPseudoDataFrame(support)) {
    support = support.map(function(x) {
      var n = x.length;
      var keys = _.range(0,n).map(function(i) { return 'state_' + i + ''});
      return _.object(keys, x);
    })
  }

  var supportStringified = support.map(function(x) { return _.mapObject(x,stringifyIfObject) });

  var columnTypesDict = getColumnTypes(support);

  // the *kind* of a dataframe is the set of its
  // column types,
  // e.g., the type of [{a: 2.5, b: 'foo'}, {a: 3.1, b: 'bar'}]
  // is cr
  var dfKind = _.values(columnTypesDict)
      .map(function(str) { return str.substring(0,1) })
    .sort()
      .join('');

  // TODO: switch to warning rather than error
  // (and maybe use wpEditor.put to get data)
  if (_.has(kindPrinter, dfKind)) {
    // NB: passes in supportStringified, not support
    kindPrinter[dfKind](columnTypesDict, supportStringified, scores);
  } else {
    console.log(dfKind)
    throw new Error('viz.print() doesn\'t know how to render objects of kind ' + dfKind);
  }


}

// parse a vega-lite description and render it
function renderVlSpec(spec) {
  //wpEditor is not present if not run in the browser
  if (typeof(wpEditor) === 'undefined') {
    console.log("viz.print: no wpEditor, not drawing");
    return;
  }

  // OPTIMIZE: don't mutate spec (but probably don't just want to clone either, since
  // data can be large)
  if (!_.has(spec, 'config')) {
    spec.config = {numberFormat: '.1e'}
  } else {
    if (!_.has(spec.config, 'numberFormat')) {
      spec.config.numberFormat = '.1e';
    }
  }

  var vgSpec = vl.compile(spec).spec;

  var resultContainer = wpEditor.makeResultContainer();
  var tempDiv = document.createElement('div');

  $(resultContainer).text('rendering...')

  vg.parse.spec(vgSpec,
                function(error, chart) {
                  $(resultContainer).empty();
                  chart({el:resultContainer,renderer: 'svg'}).update();
                });
}


// TODO: maybe a better function signature is
// bar([{<key1>: ..., <key2>: ...])
// and we map key1 to x, key2 to y
//.. i wish javascript had types and multiple dispatch
var bar = function(xs,ys, opts) {
  opts = _.defaults(opts || {},
                    {xLabel: 'x',
                     yLabel: 'y'});

  var data = _.zip(xs,ys).map(function(pair) {
    return {x: pair[0], y: pair[1]}
  })

  var vlSpec = {
    "data": {"values": data},
    "mark": "bar",
    encoding: {
      x: {"type": "nominal", "field": "x", axis: {title: opts.xLabel}},
      y: {"type": "quantitative", "field": "y", axis: {title: opts.yLabel}}
    },
    config: {numberFormat: "f"}
  };

  renderVlSpec(vlSpec);
}

var hist = function(x) {
  if (isErp(x)) {
    var erp = x;
    var labels = erp.support();
    var labelsStringified = labels.map(function(x) { return JSON.stringify(x) })
    var probs = labels.map(function(x) { return Math.exp(erp.score(null, x)) });
    bar(labelsStringified, probs, {xLabel: 'Value', yLabel: 'Probability'})
  } else {
    var samples = x;
    var frequencyDict = _(samples).countBy(function(x) { return typeof x === 'string' ? x : JSON.stringify(x) });
    var labels = _(frequencyDict).keys();
    var counts = _(frequencyDict).values();
    bar(labels, counts, {xLabel: 'Value', yLabel: 'Frequency'})
  }
};

// TODO: rename to scatter after porting erin's vizPrint code to vega
var _scatter = function(xs, ys, opts) {
  opts = _.defaults(opts || {},
                    {xLabel: 'x',
                     yLabel: 'y'});

  var data = _.zip(xs,ys).map(function(pair) {
    return {x: pair[0], y: pair[1]}
  })

  var vlSpec = {
    "data": {"values": data},
    "mark": "point",
    "encoding": {
      "x": {"field": "x","type": "quantitative", axis: {title: opts.xLabel}},
      "y": {"field": "y","type": "quantitative", axis: {title: opts.yLabel}}
    }
  }

  renderVlSpec(vlSpec);
}

// TODO: density visualizations can be misleading at the bounds
// input: a list of samples and, optionally, a kernel function
// output: a list of estimated densities (range is min to max and number
// of bins is (max-min) / (1.06 * s * n^(-.02))
var kde = function(samps, kernel) {
  if (kernel === undefined || typeof kernel !== 'function') {
    kernel = function(u) {
      return Math.abs(u) <= 1 ? .75 * (1 - u * u) : 0;
    };
  }

  // get optimal bandwidth
  // HT http://en.wikipedia.org/wiki/Kernel_density_estimation#Practical_estimation_of_the_bandwidth
  var n = samps.length;
  var mean = samps.reduce(function(x,y) { return x + y })/n;

  var s = Math.sqrt(samps.reduce(function(acc, x) {
    return acc + Math.pow(x - mean, 2)
  }) / (n-1));

  var bandwidth = 1.06 * s * Math.pow(n, -0.2);

  var min = _.min(samps);
  var max = _.max(samps);

  var numBins = (max - min) / bandwidth;

  var results = [];

  for (var i = 0; i <= numBins; i++) {
    var x = min + bandwidth * i;
    var kernelSum = 0;
    for (var j = 0; j < samps.length; j++) {
      kernelSum += kernel((x - samps[j]) / bandwidth);
    }
    results.push({item: x, density: kernelSum / (n * bandwidth)});
  }
  return results;
}

var kde2d = function(samps) {
  // mimics kde2d from the MASS package in R
  // uses axis-aligned gaussian kernel


}

// TODO: should you be able to pass this an erp too?
var density = function(samples) {
  var densityEstimate = kde(samples);

  var vlSpec = {
    "data": {values: densityEstimate},
    "mark": "area",
    "encoding": {
      "x": {"field": "item", "type": "quantitative", axis: {title: 'Value'}},
      "y": {"field": "density","type": "quantitative", axis: {title: 'Density'}}
    },
    "config": {"mark": {"interpolate": "monotone"}}
  };

  renderVlSpec(vlSpec);
}

// TODO: show points
var line = function(xs, ys) {
  var data = _.zip(xs,ys).map(function(pair) { return {x: pair[0], y: pair[1]}})

  var vlSpec = {
    "data": {values: data},
    "mark": "line",
    "encoding": {
      "x": {"field": "x", "type": "quantitative", axis: {title: 'x'}},
      "y": {"field": "y","type": "quantitative", axis: {title: 'y'}}
    }
  };

  renderVlSpec(vlSpec);
}

// visualize an erp as a table
// TODO: if support items all have the same keys, expand them out
// TODO, maybe one day: make this a fancy react widget with sortable columns
// and smart hiding if there are too many rows
var table = function(obj, options) {
  //wpEditor is not present if not run in the browser
  if (typeof(wpEditor) === 'undefined') {
    console.log("viz.print: no wpEditor, not drawing");
    return;
  }

  if (options === undefined)
    options = {}
  options = _.defaults(options, {log: false})

  if (isErp(obj)) {
    var support = obj.support();
    var scores = support.map(function(state) { return obj.score(null,state) });

    var sortedZipped = _.sortBy(_.zip(support, scores),function(z) {
      return -z[1]
    });

    var tableString = '<table class="wviz-table"><tr><th>state</th><th>' + (options.log ? 'log probability' : 'probability') + '</th>';

    sortedZipped.forEach(function(pair) {
      var state = pair[0];
      var score = pair[1];
      tableString += "<tr><td>" + JSON.stringify(state) + "</td><td>" + (options.log ? score : Math.exp(score)) + "</td>"
    })

    var resultContainer = wpEditor.makeResultContainer();
    resultContainer.innerHTML = tableString;

  }
}

global.viz = {
  print: print,
  vegaPrint: vegaPrint,
  bar: bar,
  hist: hist,
  scatter: _scatter,
  density: density,
  line: line,
  table: table
}
