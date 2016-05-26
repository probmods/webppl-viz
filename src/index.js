var _ = require('underscore');
var d3 = require('d3');
var $ = require('jquery');

global.d3 = d3;

var vl = require('vega-lite');
var vg = require('vega');

var React = require('react');
var ReactDOM = require('react-dom');
var md5 = require('md5');

var kde = require('./stats').kde;
var kde2d = require('./stats').kde2d;

function runningInBrowser() {
  return (typeof window === 'object')
}

function isErp(x) {
  // TODO: take from dippl
  return x.support && x.score;
}

function scorer(erp, val) {
  // backwards compatible with both webppl 0.7.0+ (foo.score(val))
  // and earlier versions: foo.score(null, val)
  if (erp.score.length == 2) {
    // old versions of scorers look like "function(params, val) {...}"
    return erp.score(null, val)
  } else {
    return erp.score(val)
  }
}

// convert a list of samples to an ERP
function samplesToErp(xs) {
  var n = xs.length;

  var frequencies = _.countBy(xs, function(x) { return JSON.stringify(x) });
  var support = _.keys(frequencies).map(function(x) { return JSON.parse(x) });
  var probabilities = _.mapObject(frequencies, function(freq, key) { return freq/n });

  var scorer = function(params, x) {
    return Math.log(probabilities[JSON.stringify(x)]);
  }

  var sampler = function(params) {
    return global.categorical(probabilities, support);
  }

  var ret = new global.ERP({
    sample: sampler,
    score: scorer,
    support: function() { return support }
  })
  return ret;
}

// a data frame is an array of objects where
// all objects have the same keys
// TODO: do with underscore
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

var wait = function(ms,f) {
  setTimeout(f,ms);
}

// i think i need this for proper axis labels when states are objects
// but you don't want this turning numbers into strings either
function stringifyIfObject(x) {
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

  barDispatch(values, probs, {xLabel: fieldName, yLabel: 'frequency'})
}

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

  renderSpec(vlSpec);

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

  renderSpec(vlSpec);
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

  renderSpec(vlSpec);

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

  renderSpec(vlSpec);
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

           renderSpec(vlSpec);
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

  // mapping choices: {c0, c1} -> {facet, color}
  // TODO: write cccr (use facet_row as well)

  // issue with writing a forward model here: this library is javascript
  // but we want to call webppl (i guess i precompile the inference and stick it in here)

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

  var vlSpec1 = {
    "data": {"values": densityEstimatesTidied},
    "mark": "line",
    encoding: {
      x: {"type": "quantitative", "field": "item", axis: {title: rDimName}},
      y: {"type": "quantitative", "field": "density"},
      color: {"type": "nominal", "field": cDimName, axis: {title: cDimName}},
      column: {type: 'nominal', field: facetDimName}
    }
  };

  var vlSpec2 = {
    "data": {"values": densityEstimatesTidied},
    "mark": "line",
    encoding: {
      x: {"type": "quantitative", "field": "item", axis: {title: rDimName}},
      y: {"type": "quantitative", "field": "density"},
      color: {"type": "nominal", "field": facetDimName, axis: {title: facetDimName}},
      column: {type: 'nominal', field: cDimName}
    }
  };

  renderSpec(vlSpec1);
  //renderArray([vlSpec1, vlSpec2])

}

// HT http://codereview.stackexchange.com/a/59621
function perms(data) {
    data = data.slice();  // make a copy
    var permutations = [],
        stack = [];

    function doPerm() {
        if (data.length == 0) {
            permutations.push(stack.slice());
        }
        for (var i = 0; i < data.length; i++) {
            var x = data.splice(i, 1);
            stack.push(x);
            doPerm();
            stack.pop();
            data.splice(i, 0, x);
        }
    }

    doPerm();
    return permutations;
}

kindPrinter.cccr = function(types, support, scores) {
  var typesExpanded = _.map(types, function(v,k) {
    return {name: k,
            type: v}
  })

  var cDimNames = _(typesExpanded).chain().where({type: 'categorical'}).pluck('name').value();
  var rDimNames = _(typesExpanded).chain().where({type: 'real'}).pluck('name').value();

  var rDimName = rDimNames[0];

  // mapping choices: {c0, c1} -> {facet, color}
  // TODO: write cccr (use facet_row as well)

  // issue with writing a forward model here: this library is javascript
  // but we want to call webppl (i guess i precompile the inference and stick it in here)

  var data = _.zip(support, scores).map(function(x) {
    return _.extend({prob: Math.exp(x[1])}, x[0])
  })

  var categoricalPermutations = perms(cDimNames);


  var specs = _.map(
    categoricalPermutations,
    function(perm) {

      var dataGroupedByC = _.groupBy(data,
                                     function(obs) { return JSON.stringify(_.pick(obs, cDimNames)) })

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


      var densityEstimatesTidied = _
          .chain(densityEstimates)
          .map(function(vs,k) {
            var kParsed = JSON.parse(k); _.each(vs, function(v) { _.extend(v, kParsed) });
            return vs })
          .flatten(1)
          .value();

      return {
        "data": {"values": densityEstimatesTidied},
        "mark": "line",
        encoding: {
          column: {type: 'nominal', field: perm[0]},
          row: {type: 'nominal', field: perm[1]},
          color: {"type": "nominal", "field": perm[2], axis: {title: perm[2]}},
          x: {"type": "quantitative", "field": "item", axis: {title: rDimName}},
          y: {"type": "quantitative", "field": "density"}
        }
      };


    })

  renderArray(specs);

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

  renderSpec(vlSpec);
}

// TODO: also expose as viz.parcoords
function parallelCoordinates(types, support, scores) {
  var fieldNames = _.keys(support[0]);

  var data = _.zip(support, scores).map(function(x) {
    return _.extend({prob: Math.exp(x[1])}, x[0])
  })

  var overallScale = {
    name: "ord",
    type: "ordinal",
    points: true,
    range: "width",
    domain: fieldNames
  };

  var probWidthScale = {
    name: 'probWidth',
    type: "linear",
    range: [1,3],
    domain: {data: 'values', field: 'prob'}
  };

  var probOpacityScale = {
    name: 'probOpacity',
    type: "log",
    range: [0.2,1],
    domain: {data: 'values', field: 'prob'}
  };

  var individualScales = _.map(fieldNames,
                               function(name) {
                                 return {
                                   name: name,
                                   type: "linear",
                                   range: "height",
                                   zero: false,
                                   nice: true,
                                   domain: {data: 'values', field: name}
                                 }
                               });

  var individualAxes = _.map(fieldNames,
                             function(name) {
                               return {
                                 type: 'y',
                                 scale: name,
                                 offset: {scale: 'ord', value: name}
                               }
                             });

  var vegaSpec = {
    data: [{name: 'values', values: data},
           {name: 'fields', values: fieldNames}],
    scales: [overallScale,probWidthScale,probOpacityScale].concat(individualScales),
    axes: individualAxes,
    marks: [
      {
        type: "group",
        from: {data: "values"},
        marks: [
          {
            type: "line",
            from: {data: "fields"},
            properties: {
              enter: {
                x: {scale: "ord", field: "data"},
                y: {
                  scale: {datum: "data"},
                  field: {parent: {datum: "data"}}
                },
                stroke: {value: "steelblue"},
                strokeWidth: {
                  field: {"parent": "prob"},
                  scale: "probWidth"
                },
                strokeOpacity: {
                  field: {"parent": "prob"},
                  scale: "probOpacity"
                }

              }
            }
          }
        ]
      },
      {
        "type": "text",
        "from": {"data": "fields"},
        "properties": {
          "enter": {
            "x": {"scale": "ord", "field": "data", "offset":-8},
            "y": {"field": {"group": "height"}, "offset": 6},
            "fontWeight": {"value": "bold"},
            "fill": {"value": "black"},
            "text": {"field": "data"},
            "align": {"value": "right"},
            "baseline": {"value": "top"}
          }
        }
      }
    ]
  }
  renderSpec(vegaSpec, "regularVega")
}

// automatically render an ERP
function auto(obj) {
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
    // TODO: write wpEditor.warn method, use it to inform user that auto only works on ERPs
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
                     function(state){return scorer(obj, state)});

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

  // HACK: use parallel coords for rn where n >= 3
  if (dfKind.indexOf('c') == -1 && dfKind.length >= 3) {
    parallelCoordinates(columnTypesDict, supportStringified, scores);
  } else if (_.has(kindPrinter, dfKind)) {
    // NB: passes in supportStringified, not support
    kindPrinter[dfKind](columnTypesDict, supportStringified, scores);
  } else {
    // TODO: switch to warning rather than error
    // (and maybe use wpEditor.put to store the data)
    console.log(dfKind)
    throw new Error('viz.print() doesn\'t know how to render objects of kind ' + dfKind);
  }


}

var GraphComponent = React.createClass({
  getInitialState: function() {
    return {view: 0}
  },
  toggleSettings: function() {
    $(this.refs.wrench).toggleClass('white');
    $(this.refs.actions).toggleClass('expanded');
  },
  notYetImplemented: function() {
    alert('not yet implemented')
  },
  render: function() {
    // TODO: use a common hash and different suffixes?
    // TODO: don't run these computations until they click the wrench? (save memory, cycles)
    var dataStringified = JSON.stringify(this.props.spec.data[0].values, null, 2);
    var dataBlob = new Blob([dataStringified], {type: 'application/json'})
    var dataUrl = URL.createObjectURL(dataBlob);
    var dataName = md5(dataStringified).substring(0,6) + ".json";

    var vegaStringified = JSON.stringify(this.props.spec, null, 2);
    var vegaBlob = new Blob([vegaStringified], {type: 'application/json'})
    var vegaUrl = URL.createObjectURL(vegaBlob);
    var vegaName = md5(vegaStringified).substring(0,6) + ".vega.json";

    var graphUrl = (this.state.view == 0
                        ? null
                        : this.state.view.toImageURL('svg'));
    var graphName = (graphUrl == null
                     ? null
                     : md5(graphUrl || "").substring(0,6) + '.svg');

    // NB: download doesn't work perfectly in safari (it just spawns the picture in a new tab)
    // but that's how it works for the vega online editor too, so leave it here for now

    // JSX is a complication so don't use it here.. use babel repl to get pure js
    /*
    (<div className='graphComponent'>
     <div ref='actions' className='actions'>
     <button ref='wrench' className="settings" onClick={this.toggleSettings}></button>
     <ul>
     <li><a href={graphUrl} download={graphName} target="_blank">download graph</a></li>
     <li><a href={dataUrl} download={dataName} target="_blank">download data</a></li>
     <li><a href={vegaUrl} download={vegaName} target="_blank">download vega</a></li>
     <li onClick={this.notYetImplemented}>resize</li>
     </ul>
     </div>
     <div ref='content' className='content'></div>
     <div className='clearboth'></div>
     </div>)
    */


    return React.createElement(
      'div',
      { className: 'graphComponent' },
      React.createElement(
        'div',
        { ref: 'actions', className: 'actions' },
        React.createElement('button', { ref: 'wrench', className: 'settings', onClick: this.toggleSettings }),
        React.createElement(
          'ul',
          null,
          React.createElement(
            'li',
            null,
            React.createElement(
              'a',
              { href: graphUrl, download: graphName, target: '_blank' },
              'download graph'
            )
          ),
          React.createElement(
            'li',
            null,
            React.createElement(
              'a',
              { href: dataUrl, download: dataName, target: '_blank' },
              'download data'
            )
          ),
          React.createElement(
            'li',
            null,
            React.createElement(
              'a',
              { href: vegaUrl, download: vegaName, target: '_blank' },
              'download vega'
            )
          ),
          React.createElement(
            'li',
            { onClick: this.notYetImplemented },
            'resize'
          )
        )
      ),
      React.createElement('div', { ref: 'content', className: 'content' }),
      React.createElement('div', { className: 'clearboth' })
    );
  }
})

// parse a vega-lite or regular vega description and render it
function renderSpec(spec, regularVega) {
  // OPTIMIZE: don't mutate spec (but probably don't just want to clone either, since
  // data can be large)
  if (!_.has(spec, 'config')) {
    spec.config = {numberFormat: '.1e'}
  } else {
    if (!_.has(spec.config, 'numberFormat')) {
      spec.config.numberFormat = '.1e';
    }
  }

  // TODO:
  // for each quantitative field that is displayed, pick a better number format
  // (ideally, do this to the axis labels, not all the data)

  var vgSpec = regularVega ? spec : vl.compile(spec).spec;


  var resultContainer;

  if (runningInBrowser()) {
    if (wpEditor && wpEditor.makeResultContainer) {
      resultContainer = wpEditor.makeResultContainer()

      var r = React.createElement(GraphComponent, {spec: vgSpec});

      // different possible architectures:
      // - render before making React component, call update(), and pass result as prop
      // - React component takes vega spec (not vega-lite spec) as prop and calls update() itself
      //
      // considerations:
      // - might want to visualize streamed data that comes from inference callback
      // - might want to support interaction like brushing, linking (it's not clear to me how orthogonal Reactive Vega is to React)
      // - if structure is the same... show animation interpolating between previous result and current?
      ReactDOM.render(r, resultContainer, function() {
        var comp = this;
        var node = this.refs.content;
        $(node).text('   rendering...');

        vg.parse.spec(vgSpec,
                      function(error, chart) {
                        $(node).empty();

                        comp.setState({view: chart({el:node, renderer: 'svg'}).update()});
                      });

      })

    } else {
      // TODO: if running in browser but editor isn't present, append graphic to body
    }
  } else {
    vg.parse.spec(vgSpec,
                  function(error, chart) {
                    var view = chart({renderer: 'svg'}).update();
                    var svgText = view.svg();
                    var hash = md5(svgText).substring(0,7);

                    require('fs').writeFileSync(hash + '.svg', svgText);
                    console.log("Rendered to " + hash + ".svg");
                  });

  }

}

// parse an array of vega-lite or regular vega descriptions and render them
function renderArray(specs/*: array */, regularVega) {
  var nSpecsRemaining = specs.length;

  var resultContainer = wpEditor.makeResultContainer();

  // div that holds selected item
  var $zoomDiv = $("<div>").addClass("zoomDiv");

  _.each(specs,
         function(spec) {

           var vgSpec = regularVega ? spec : vl.compile(spec).spec;
           var thumbnailContainer = $('<div>').addClass('thumbnail');

           $(resultContainer).append(thumbnailContainer);

           vg.parse.spec(vgSpec,
                         function(error, chart) {
                           // TODO: current thumbnail sizing is hacky, figure out more idiomatic way
                           var view = chart({el: thumbnailContainer[0], renderer: 'svg'}).update();

                           var $svg = $(view._el).find("svg");

                           var origHeight = $svg.attr("height");
                           var origWidth = $svg.attr("width");
                           var origTransform = $svg.children().attr("transform");

                           $svg.attr({height: origHeight * 0.2,
                                      width: origWidth * 0.2});


                           $svg.children().attr("transform","scale(0.2) " + origTransform );

                           $svg.click(function() {
                             //console.log('todo')

                             var $zoomSvg = $(this)
                                 .clone()
                                 .attr({height: origHeight,
                                        width: origWidth})

                             debugger;
                             $zoomSvg.children().attr("transform", origTransform);

                             $zoomDiv
                               .empty()
                               .append($zoomSvg);
                           })

                         });
         }
        );

  $(resultContainer)
    .append($("<div>").addClass("clearboth"))
    .append($zoomDiv);


}

// TODO: groupBy defaults to the third key in df
// TODO: clean up options stuff
function barDfs(df, options) {
  options = _.defaults(options || {},
                       {groupBy: false,
                        xType: 'nominal'
                       })

  var xName = _.keys(df[0])[0];
  var yName = _.keys(df[0])[1];

  // TODO: assert that groupBy variable is actually in the df

  var vlSpec = {
    "data": {values: df},
    "mark": "bar",
    "encoding": {
      "x": {"field": xName, "type": options.xType, axis: {title: options.xLabel || xName}},
      "y": {"field": yName, "type": "quantitative", axis: {title: options.yLabel || yName}}
    }
  };

  if (options.groupBy) {

    vlSpec.encoding.column = {
      "field": xName, "type": "ordinal",
      "scale": {"padding": 4},
      "axis": {"orient": "bottom", "axisWidth": 1, "offset": -8, "labelAngle": 270}
    }

    vlSpec.encoding.x = {
      "field": options.groupBy, "type": "ordinal",
      "scale": {"bandSize": 6},
      "axis": false
    }

    vlSpec.encoding.y.axis = {grid: false};

    vlSpec.encoding.color = {
      field: options.groupBy,
      type: 'nominal',
      scale: {range: "category10"}
    }

    vlSpec.config =  {"facet": {"cell": {"strokeWidth": 0}}}
  }

  renderSpec(vlSpec);
}

function barDispatch() {
  var args = _.toArray(arguments);

  if (isDataFrame(arguments[0])) {
    barDfs.apply(null,args)
  } else {
    var xs = args[0];
    var ys = args[1];

    var df = [];
    for(var i = 0, ii = xs.length; i < ii; i++) {
      df.push({x: xs[i], y: ys[i]})
    }

    barDfs.apply(null,[df].concat(args.slice(2)));
  }
}

// currently hist operates on a collection of samples as well (e.g., from repeat)
function hist(obj, options) {
  options = _.defaults(options || {},
                       {numBins: 30})

  var erp;
  if (_.isArray(obj)) {
    erp = samplesToErp(obj)
  } else if (isErp(obj)) {
    erp = obj;
  } else {
    throw new Error('hist takes an ERP or a list of samples as an argument')
  }

  var support = erp.support();
  var probs = support.map(function(x) { return Math.exp(scorer(erp, x)) });
  if (typeof support[0] == 'number') {
    var min = _.min(support),
        max = _.max(support),
        binWidth = (max-min)/options.numBins;

    // TODO: move into stats.js, maybe rely on d3 methods
    // OPTIMIZE
    var bins = [];
    for(var i = 0; i < options.numBins; i++) {
      var currentBin = {
        lower: min + i * binWidth,
        upper: min + (i + 1) * binWidth
      };
      currentBin.entries = _.filter(support, function(x) { return x >= currentBin.lower && x < currentBin.upper })
      bins.push(currentBin)
    }

    // make sure max point gets into histogram
    bins[bins.length-1].upper += Number.EPSILON;

    var binProbs = bins.map(function(bin) {
      return util.sum(_.map(bin.entries, function(x) { return Math.exp(scorer(erp, x)) }));
    })

    // TODO: do ticks based on bin boundaries, rather than showing bin means, as i've done here
    var binLabels = _.map(bins, function(bin) {
      return ((bin.upper + bin.lower)/2).toExponential(2)
    })

    barDispatch(binLabels, binProbs, {xLabel: 'Bin mean', yLabel: 'Probability', xType: 'quantitative'})

    return;
  }

  var supportStringified = support.map(stringifyIfObject)

  barDispatch(supportStringified, probs, {xLabel: 'Value', yLabel: 'Probability'})

};

function scatterDfs(df, options) {

  options = _.defaults(options || {},
                       {groupBy: false
                       })

  var xName = _.keys(df[0])[0];
  var yName = _.keys(df[0])[1];

  var vlSpec = {
    "data": {"values": df},
    "mark": "point",
    "encoding": {
      "x": {"field": xName, "type": "quantitative", axis: {title: options.xName}},
      "y": {"field": yName, "type": "quantitative", axis: {title: options.yName}}
    }
  }

  if (options.groupBy) {
    vlSpec.encoding.color = {
      field: options.groupBy,
      type: 'nominal'
    }
  }

  renderSpec(vlSpec);
}

function scatterDispatch() {
  var args = _.toArray(arguments);

  if (isDataFrame(arguments[0])) {
    scatterDfs.apply(null,args)
  } else {
    var xs = args[0];
    var ys = args[1];

    var df = [];
    for(var i = 0, ii = xs.length; i < ii; i++) {
      df.push({x: xs[i], y: ys[i]})
    }

    scatterDfs.apply(null,[df].concat(args.slice(2)));
  }
}


// TODO: figure out more idiomatic way of reducing empty space around heatmap
// TODO: add numBins option, log option
function heatMap(samples) {

  if (isErp(samples)) {
    throw new Error('erp arguments to heat map not yet supported')
  }

  var x, y;
  if (_.isArray(samples[0])) {
    x = _.pluck(samples,'0')
    y = _.pluck(samples,'1')
  } else if (_.isObject(samples[0])) {
    var keys = _.keys(samples[0]);
    x = _.pluck(samples, keys[0])
    y = _.pluck(samples, keys[1]);
  }

  var densityEstimate = kde2d(x,y);

  var formatter = d3.format('.1e');
  _.forEach(densityEstimate,
            function(row) {
              row.x = formatter(row.x);
              row.y = formatter(row.y);
            })

  var spec = {
    data: [{'name': 'csv', values: densityEstimate}],
    "padding": {"left": 50, "top": 10, "right": 150, "bottom": 50},
    "scales": [
      {
        "name": "x",
        "type": "ordinal",
        "domain": {"data": "csv","field": "x"},
        "range": "width"
      },
      {
        "name": "y",
        "type": "ordinal",
        "domain": {"data": "csv","field": "y"},
        "range": "height",
        "reverse": true
      },
      {
        "name": "c",
        "type": "linear",
        "domain": {"data": "csv","field": "density"},
        "range": ["#ffffff","#313695"]
      }
    ],
    "axes": [
      {"type": "x","scale": "x","format": ".1e",
       "properties": {"labels": {"angle": {"value": 45}, "align": {"value": "left"}}}

      },
      {"type": "y","scale": "y","format": ".1e"

      }
    ],
    "marks": [
      {
        "type": "rect",
        "from": {"data": "csv"},
        "properties": {
          "enter": {
            "x": {"scale": "x","field": "x"},
            "width": {"scale": "x","band": true},
            "y": {"scale": "y","field": "y"},
            "height": {"scale": "y","band": true},
            "fill": {"scale": "c","field": "density"},
            "stroke": {"value": "#dddddd"},
            "strokeWidth": {"value": "0.2"}
          }
        }
      }
    ],
    "legends": [{"fill": "c", "values": [0, _.max(_.pluck(densityEstimate, 'density'))]}],
    "config": {"numberFormat": ".1e"}
  };

  renderSpec(spec, 'regularVega')
}

// TODO: should you be able to pass this an erp too?
// TODO: rename as kde
function density(samples, options) {
  options = _.defaults(options || {},
                       {bounds: 'auto'})

  var min, max;
  if (options.bounds == 'auto') {
    min = _.min(samples)
    max = _.max(samples)
  } else {
    min = options.bounds[0];
    max = options.bounds[1];
  }

  var densityEstimate = kde(samples, options);

  var vlSpec = {
    "data": {values: densityEstimate},
    "mark": "line",
    "encoding": {
      "x": {"field": "item",
            "type": "quantitative",
            axis: {title: 'Value'},
            scale: {domain: [min,max]}
           },
      "y": {"field": "density","type": "quantitative", axis: {title: 'Density'}}
    },
    "config": {"mark": {"interpolate": "monotone"}}
  };

  renderSpec(vlSpec);
}

// TODO: show points too
function lineDfs(df, options) {
  options = _.defaults(options || {},
                       {groupBy: false})

  var xName = _.keys(df[0])[0];
  var yName = _.keys(df[0])[1];

  // TODO: assert that groupBy variable is actually in the df

  var vlSpec = {
    "data": {values: df},
    "mark": "line",
    "encoding": {
      "x": {"field": xName, "type": "quantitative"},
      "y": {"field": yName, "type": "quantitative"}
    }
  };

  if (options.groupBy) {
    vlSpec.encoding.color = {
      field: options.groupBy,
      type: 'nominal'
    }
  }

  renderSpec(vlSpec);

}

function lineDispatch() {
  var args = _.toArray(arguments);
  if (isDataFrame(arguments[0])) {
    return lineDfs.apply(null, arguments);
  } else {
    var xs = args[0];
    var ys = args[1];

    var df = [];
    for(var i = 0, ii = xs.length; i < ii; i++) {
        df.push({x: xs[i], y: ys[i]})
    }

    return lineDfs(df);
  }
}

// visualize an erp as a table
// TODO: if support items all have the same keys, expand them out
// TODO, maybe one day: make this a fancy react widget with sortable columns
// TODO: support a data frame structure as input
// and smart hiding if there are too many rows
function table(obj, options) {
  //wpEditor is not present if not run in the browser
  if (typeof(wpEditor) === 'undefined') {
    console.log("viz.print: no wpEditor, not drawing");
    return;
  }

  options = _.defaults(options || {},
                       {log: false})

  var erp;
  if (_.isArray(obj)) {
    erp = samplesToErp(obj)
  } else if (isErp(obj)) {
    erp = obj;
  } else {
    throw new Error('table takes an ERP or a list of samples as an argument')
  }

  var support = erp.support();
  var scores = support.map(function(state) { return scorer(erp,state) });

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

global.viz = {
  d3auto: require('./old').print,
  auto: auto,
  bar: barDispatch,
  hist: hist,
  scatter: scatterDispatch,
  density: density,
  line: lineDispatch,
  table: table,
  heatMap: heatMap
}
