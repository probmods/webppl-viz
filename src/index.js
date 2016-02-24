'use strict';

/*

  relies on vega-lite library

  */

var _ = require('underscore');
var d3 = require('d3');
var insertCss = require('insert-css');
var fs = require('fs');
var $ = require('jquery');

var vl = require('vega-lite');
var vg = require('vega');

function isErpWithSupport(x) {
  // TODO: take from dippl
  return true;
}

var cssInjected = false;


var wait = function(ms,f) {
  setTimeout(f,ms);
}
// TODO: switch to vega completely

var numPlots = 0;

var cssFileContents = fs.readFileSync(__dirname + '/../demo/viz.css', 'utf8');

function print(x) {
  // TODO: remove this once i switch print() to vega
  if (!cssInjected) {
    insertCss(cssFileContents)
    cssInjected = true;
  }

  // name the plots to keep compatibility with the rest of erin's code
  var _resultDiv = wpEditor.makeResultContainer();
  var resultDiv = $(_resultDiv);
  var resultDivId = "_v" + numPlots;
  resultDiv.attr("id", resultDivId);
  numPlots = numPlots + 1;


  if (isErpWithSupport(x)){
    // console.log("isErpWithSupport");
    var params = Array.prototype.slice.call(arguments, 2);
    var labels = x.support(params);
    var scores = _.map(labels, function(label){return x.score(params, label);});
    // TODO: npm install underscore
    if (_.find(scores, isNaN) !== undefined){
      resultDiv.append(document.createTextNode("ERP with NaN scores!\n"));
      return;
    }
    var counts = scores.map(Math.exp);
    var resultDivSelector = "#" + resultDiv.attr('id');

    //var resultDivSelector = resultDiv[0];

    // // what kind of plot should I show?
    if (isDataFrame(labels)) {
      // console.log("isDataFrame");
      plotMarginals(labels, counts, resultDivSelector);
    } else {
      // if not a dataframe, (currently) assume that support is just a single variable
      // (rather than, say, a ragged structure like [{x: 1},{x:1, y:2}, ...])

      // console.log("is not DataFrame");
      var result_div = d3.select(resultDivSelector);
      var plotid = "plot" + resultDiv.children().length;
      var plot_div = result_div.append("svg")
        .attr("id", plotid);
      plotSingleVariable(labels, counts, resultDivSelector + " #" + plotid, graph_width, graph_height, "");
    }
  } else if (isNumericErpObject(x)) {
    // Q: do we ever actually enter this branch? my understanding is that numericErpObject are special types of erpWithSupports
    var keys = Object.keys(x);
    for (var i=0; i<keys.length; i++) {
      var key = keys[i];
      var erp = x[key]
      var labels = erp.support();
      var scores = _.map(labels, function(label){return erp.score([], label);});
      var counts = scores.map(Math.exp);
      var resultDivSelector = "#" + resultDiv.attr('id');
      var result_div = d3.select(resultDivSelector);
      var plotid = "plot" + resultDiv.children().length;
      var plot_div = result_div.append("svg")
        .attr("id", plotid);
      plotSingleVariable(labels, counts, resultDivSelector + " #" + plotid, graph_width/2, graph_height/2, key);
    }
  } else {
    // console.log("is not ErpWithSupport");
    //otherwise, stringify and print
    resultDiv.append(
      document.createTextNode(
        JSON.stringify(x) + "\n"));
  }
}

var kindPrinter = {};

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
      color: {field: 'prob', type: 'quantitative'}
      // size and color don't work perfectly; stumbles on visualizing vanilla 2d gaussian from MH (no conditioning)
      // because MH can result in there being only a single unique score value (relative probabilities between states are not preserved in posterior)
    }
  }

  parseVl(vlSpec);
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

  parseVl(vlSpec);

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
    // TODO: tweak number formatting so it doesn't show too many significant digits
    config: {mark: {applyColorToBackground: true}, numberFormat: "f"}
  }

  parseVl(vlSpec);
}

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

  if (isErpWithSupport(obj)) {
    var support = obj.support();
    var scores = _.map(support,
                       function(state){return obj.score(null, state);});

    var columnTypesDict = getColumnTypes(support);

    // the *kind* of a dataframe is the set of its
    // column types,
    // e.g., the type of [{a: 2.5, b: 'foo'}, {a: 3.1, b: 'bar'}]
    // is cr
    var dfKind = _.values(columnTypesDict)
        .map(function(str) { return str.substring(0,1) })
        .sort()
        .join('');

    if (_.has(kindPrinter, dfKind)) {
      kindPrinter[dfKind](columnTypesDict, support, scores);
    } else {
      throw new Error('viz.print() doesn\'t know how to render this object');
    }

  }
}


// overall chart properties, for fitting plot within container
var margin = {top: 20, right: 30, bottom: 30, left: 50};
var graph_width = 500;
var graph_height = 300;

var make_chart = function(container_selector, margin, width, height) {
  // initialize empty chart
  var chart = d3.select(container_selector)
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
  // for all the elements in the chart, move to allow desired margins
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  return chart;
}

var make_x_scale = function(chart, width, height, type, params) {
  // make scale
  var ticks;
  var x;
  if (type == "linear") {
    x = d3.scale.linear()
      .range([0, width])
      .domain([ params.lowest, params.highest ]);
    ticks = 5;
  } else if (type == "ordinal") {
    x = d3.scale.ordinal()
      .domain(params.values)
      .rangeBands([0, width], 0.1);
  } else {
    console.log("error 88: not a valid type: " + type);
  }

  // draw scale
  var x_axis = d3.svg.axis()
    .scale(x)
    .orient("bottom")
    .ticks(ticks);
  var x_axis_drawn = chart.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height + ")")
    .call(x_axis)
  x_axis_drawn.append("text")
    .attr("x", width/2)
    .attr("dy", "3em")
    .style("text-anchor", "end")
    .text(params.label);
  return x;
}

var make_y_scale = function(chart, width, height, type, params) {
  if (type == "linear") {
    var y = d3.scale.linear()
      .range([height, 0])
      .domain([params.lowest, params.highest]);
  } else if (type == "ordinal") {
    var y = d3.scale.ordinal()
      .domain(params.values)
      .rangeBands([height, 0], 0.1);
  } else {
    console.log("error 93: not a valid type: " + type);
  }
  var yAxis = d3.svg.axis()
      .scale(y)
      .orient("left");
  var y_axis_drawn = chart.append("g")
    .attr("class", "y axis")
    .call(yAxis);
  y_axis_drawn.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 6)
    .attr("x", -height/2)
    .attr("dy", "-4em")
    .style("text-anchor", "end")
    .text(params.label);
  return y;
}

var make_data = function(values, probabilities) {
  var data = [];
  for (var i=0; i<values.length; i++) {
    data.push({
      value: values[i],
      probability: probabilities[i]
    })
  }
  return data;
}
var make_2cat_data = function(cat1_values, cat2_values, probabilities, cat1, cat2) {
  var data = [];
  for (var i=0; i<probabilities.length; i++) {
    var datum = {};
    datum[cat1] = cat1_values[i];
    datum[cat2] = cat2_values[i];
    datum["probability"] = probabilities[i];
    data.push(datum);
  }
  return data;
}

var pdf = function(values, probabilities, container_selector, container_width, container_height, category) {
  /*
   * draw histogram and/or density
   * when domain is an interval in R
   *
   * `values` will always be real numbers if
   * we're plotting pdfs. there might be very few data
   * points, in which case a simple histogram is correct.
   * but there might be too many for that, in which case
   * we should do a binned histogram.
   *
   * at the moment, everything is a binned histogram,
   * even if that's not the most sensible thing to do.
   */

  // overall chart properties, for fitting plot within container
  var width = container_width - margin.left - margin.right;
  var height = container_height - margin.top - margin.bottom;

  var data = make_data(values, probabilities);

  // add density option later
  // var draw_hist = true;
  // var draw_density = true;

  // initialize empty chart
  var chart = make_chart(container_selector, margin, width, height);

  // extract some useful properties of the data
  // var values = data.map(function(x) {return x.value;});
  var lowest = d3.min(values);
  var highest = d3.max(values);
  // var probabilities = data.map(function(x) {return x.probability;});
  var highest_probability = d3.max(probabilities);

  // histogram requires binned data
  var n_bins = 20;
  var bin_width = (highest - lowest)/n_bins;
  var hist_data = [];
  for (var i=0; i<n_bins; i++) {
    var total_probability = data.reduce(
      function(prev,current) {
        if ( current.value >= i*bin_width+lowest & (current.value < (i+1)*bin_width+lowest | (current.value == highest & i == n_bins - 1))) {
          return  +(current.probability) + prev;
        }
        return +prev;
      }, 0);
    if (total_probability > highest_probability) {
      // one of the histogram probabilities might
      // be the highest y value.
      highest_probability = total_probability;
    }
    hist_data.push({
      value: i*bin_width + lowest,
      probability: total_probability
    })
  }

  var x = make_x_scale(chart, width, height, "linear", {"lowest": lowest, "highest": highest, "label": category});
  var y = make_y_scale(chart, width, height, "linear", {"lowest": 0, "highest": highest_probability, "label": ""});

  // make histogram bars
  chart.selectAll(".bar")
    .data(hist_data)
    .enter().append("rect")
    .attr("class", "bar")
    .attr("x", function(d) { return x(d.value); })
    .attr("y", function(d) { return y(d.probability); })
    .attr("height", function(d) { return height - y(d.probability); })
    .attr("width", width/n_bins);
  // chart.append("text")
  //     .attr("x", width / 2)
  //     .attr("y", 0)
  //     //.attr("dy", ".75em")
  // .text(function(d) { return category; });
}

var heat_map = function(cat1_values, cat2_values, probabilities, container_selector, container_width, container_height, category1, category2) {
  //size of circle is propto score
  //opacity is fairly low

  var data = make_2cat_data(cat1_values, cat2_values, probabilities, category1, category2);
  // console.log(data);

  // overall chart properties, for fitting plot within container
  var width = container_width - margin.left - margin.right;
  var height = container_height - margin.top - margin.bottom;

  // initialize empty chart
  var chart = make_chart(container_selector, margin, width, height);

  // cat1 is on X axis
  var cat1 = make_x_scale(chart, width, height, "ordinal", {"values": cat1_values, "label": category1});

  // cat2 is on Y axis
  var cat2 = make_y_scale(chart, width, height, "ordinal", {"values": cat2_values, "label": category2});

  var minprob = d3.min(probabilities);
  var maxprob = d3.max(probabilities);
  // console.log(probabilities);
  // console.log(_.map(data, function(datum) {return datum.probability;}));
  // console.log(maxprob);
  var color_scale = d3.scale.linear()
      .domain([0, maxprob])
    .range(["white", "steelblue"]);

  chart.selectAll(".tile")
    .data(data)
    .enter().append("rect")
    .attr("class", "tile")
    .attr("x", function(d) { return cat1(d[category1]); })
    .attr("width", function(d) { return cat1.rangeBand(); })
    .attr("y", function(d) { return cat2(d[category2]); })
    .attr("height", function(d) { return cat2.rangeBand(); })
    .style("fill", function(d) { return color_scale(d.probability); });
}

var scatter = function(cat1_values, cat2_values, probabilities, container_selector, container_width, container_height, category1, category2) {
  //size of circle is propto score
  //opacity is fairly low

  // overall chart properties, for fitting plot within container
  var width = container_width - margin.left - margin.right;
  var height = container_height - margin.top - margin.bottom;

  // initialize empty chart
  var chart = make_chart(container_selector, margin, width, height);

  var data = make_2cat_data(cat1_values, cat2_values, probabilities, category1, category2);

  // var cat1_values = data.map(function(x) {return x[category1];});
  var cat1_lowest = d3.min(cat1_values);
  var cat1_highest = d3.max(cat1_values);
  var cat1_scale = make_x_scale(chart, width, height, "linear", {"lowest": cat1_lowest, "highest": cat1_highest, "label": category1});

  // var cat2_values = data.map(function(x) {return x[category2];});
  var cat2_lowest = d3.min(cat2_values);
  var cat2_highest = d3.max(cat2_values);
  var cat2_scale = make_y_scale(chart, width, height, "linear", {"lowest": cat2_lowest, "highest": cat2_highest, "label": category2});

  var probability_scale_factor = 1/d3.min(probabilities);

  chart.selectAll(".dot")
    .data(data)
    .enter().append("circle")
    .attr("class", "dot")
    .attr("r", function(d) { return d.probability*probability_scale_factor; })
    .attr("cx", function(d) { return cat1_scale(d[category1]); })
    .attr("cy", function(d) { return cat2_scale(d[category2]); })
    .style("fill", "steelblue")
}

// function isErp(x){
//   return (x && (x.score != undefined) && (x.sample != undefined));
// }

// function isErpWithSupport(x){
//   return (isErp(x) && (x.support != undefined));
// }

function discrete_probability_distribution(values, probabilities, container_selector, container_width, container_height, category){
  /*
   * draw barchart for a discrete probability distribution
   * domain might be strings, booleans, objects, etc.
   */

  // overall chart properties, for fitting plot within container
  var width = container_width - margin.left - margin.right;
  var height = container_height - margin.top - margin.bottom;

  var data = make_data(values, probabilities);

  // initialize empty chart
  var chart = make_chart(container_selector, margin, width, height);

  // extract some useful properties of the data
  var highest_probability = d3.max(probabilities);

  // // x axis should be ordinal
  // var x = d3.scale.ordinal()
  //     .domain(values)
  //     .rangeBands([0, width], 0.1);
  // var x_axis = d3.svg.axis()
  //  .scale(x)
  //  .orient("bottom");
  // var x_axis_drawn = chart.append("g")
  //  .attr("class", "x axis")
  //  .attr("transform", "translate(0," + height + ")")
  //  .call(x_axis);

  // var x = make_x_scale(chart, width, height, 0, highest_probability, "");
  // I kinda want everything to be on the same scale always, so that plots can be compared more easily.
  // this should be an option, but for now, let's do this.
  var x = make_x_scale(chart, width, height, "linear", {"lowest": 0, "highest": 1, "label": ""});
  var y = make_y_scale(chart, width, height, "ordinal", {"values": values, "label": category});

  // bar.append("rect")
  //     .attr("width", function(d) { return x(d.value); })
  //     .attr("height", barHeight - 1);

  // make histogram bars
  chart.selectAll(".bar")
    .data(data)
    .enter().append("rect")
    .attr("class", "bar")
  // .attr("x", function(d) { return x(d.value); })
    .attr("y", function(d) { return y(d.value); })
    .attr("width", function(d) { return x(d.probability); })
    .attr("height", y.rangeBand());
}

function isNumeric(arr) {
  for(var i=0; i<arr.length; i++) {
    var n = arr[i];
    var is_num = !isNaN(parseFloat(n)) && isFinite(n);
    if (!is_num) {
      return false;
    }
  }
  return true;
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

// are all the items in the support numbers?
function isNumericErpObject(x) {
  var keys = Object.keys(x);
  for (var i=0; i<keys.length; i++) {
    var key = keys[i];
    var erp = x[key]
    if (isErpWithSupport(erp)) {
      var labels = erp.support();
      if (!isNumeric(labels)) {
        return false;
      };
    } else {
      return false;
    }
  }
  return true;
}

function plotSingleVariable(values, probabilities, container_selector, container_width, container_height, category) {
  if (isNumeric(values)) {
    // console.log("isNumeric");
    pdf(values, probabilities, container_selector, container_width, container_height, category);
  } else {
    // console.log("is not Numeric");
    discrete_probability_distribution(values, probabilities, container_selector, container_width, container_height, category);
  }
}

function plotTwoVariables(values1, values2, probabilities, container_selector, category1, category2) {
  if (isNumeric(values1) & isNumeric(values2)) {
    scatter(values1, values2, probabilities, container_selector, graph_width/2, graph_height/2, category1, category2);
  } else if (!isNumeric(values1) & !isNumeric(values2)) {
    // first, we marginalize to these 2 variables only
    var category_data = make_2cat_data(values1, values2, probabilities, category1, category2);
    var category1values = _.unique(values1);
    var category2values = _.unique(values2);
    var heatmap_probabilities = _.flatten(_.map(category1values, function(cat1val) {
      return _.map(category2values, function(cat2val) {
        var relevant_data = _.filter(category_data, function(datum) {
          return datum[category1] == cat1val & datum[category2] == cat2val;
        });
        if (relevant_data.length > 0) {
          return (_.map(relevant_data, function(datum) { return datum.probability; })).reduce(function(a, b) {
            return a + b;
          });
        } else {
          return 0;
        }
      });
    }));
    var category1values_aligned_with_probs = _.flatten(_.map(category1values, function(cat1val) {
      return _.map(category2values, function(cat2val) {
        return cat1val;
      })
    }));
    var category2values_aligned_with_probs = _.flatten(_.map(category1values, function(cat1val) {
      return _.map(category2values, function(cat2val) {
        return cat2val;
      })
    }));
    // console.log(heatmap_probabilities);
    heat_map(category1values_aligned_with_probs, category2values_aligned_with_probs, heatmap_probabilities,
             container_selector, graph_width/2, graph_height/2, category1, category2);
  }
}

// shows all 1d marginals and pairwise plots
function plotMarginals(labels, counts, resultDivSelector) {
  var categories = Object.keys(labels[0]);

  var result_div = d3.select(resultDivSelector);

  for (var i=0; i<categories.length; i++) {
    //marginals
    var category = categories[i];
    var category_data = make_data(labels, counts);
    var values = _.unique(_.map(category_data, function(datum) {return datum.value[category];}));
    var probabilities = _.map(values, function(value) {
      var relevant_data = _.filter(category_data, function(datum) {return datum.value[category] == value;});
      return (_.map(relevant_data, function(datum) { return datum.probability; })).reduce(function(a, b) {
        return a + b;
      });
    });
    var marginal_plot_tag = "marginal_" + category;
    var plotid = "plot" + $(resultDivSelector).children().length;
    var marginal_div = result_div.append("svg")
      .attr("id", plotid);
    plotSingleVariable(values, probabilities, resultDivSelector + " #" + plotid, graph_width/2, graph_height/2, category);

  }
  // plot all pairwise plots
  for (var i=0; i<categories.length; i++) {
    for (var j=0;j<i; j++) {
      if (i != j) {
        var category1 = categories[i];
        var category2 = categories[j];
        var values1 = labels.map(function(x) {return x[category1];});
        var values2 = labels.map(function(x) {return x[category2];});
        var probabilities = counts;
        var plotid = "plot" + $(resultDivSelector).children().length;
        var plot_container = result_div.append("svg")
          .attr("id", plotid);
        plotTwoVariables(values1, values2, counts, resultDivSelector + " #" + plotid, category1, category2);
      }
    }
  }
}

var svgTemplate = _.template(
  '<?xml version="1.0" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg class="marks" width="<%- width %>" height="<%- height %>" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><style type="text/css">' + cssFileContents +'</style></defs>');

function parseVl(vlSpec) {
  var vgSpec = vl.compile(vlSpec).spec;

  var resultContainer = wpEditor.makeResultContainer();
  var tempDiv = document.createElement('div');

  $(resultContainer).text('rendering...')

  vg.parse.spec(vgSpec,
                function(error, chart) {
                  // // directly inject svg (resulting image is not downloadable)
                  // chart({el:resultContainer,renderer: 'svg'}).update();

                  // render to a tempDiv, then get the text of the svg and inject it into an <img>
                  // element using a data uri (resulting image is downloadable)
                  chart({el:tempDiv,renderer: 'svg'}).update();
                  var svg = $(tempDiv).find("svg")[0];
                  var svgText = svg.innerHTML;
                  // when tempDiv, using jQuery to get width and height doesn't work
                  var svgHeader = svgTemplate({width: svg.width.baseVal.value,//$(svg).width(),
                                               height: svg.height.baseVal.value // $(svg).height()
                                              })

                  $(resultContainer)
                    .empty()
                    .append($("<img>")
                            .addClass("graphic")
                            .attr({src: 'data:image/svg+xml;utf8,' +
                                   svgHeader +
                                   svgText + '</svg>'
                                  }));
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
    }
  };

  parseVl(vlSpec);
}

var hist = function(samples) {
  var frequencyDict = _(samples).countBy(function(x) { return typeof x === 'string' ? x : JSON.stringify(x) });
  var labels = _(frequencyDict).keys();
  var counts = _(frequencyDict).values();
  bar(labels, counts, {xLabel: 'Value', yLabel: 'Frequency'})
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

  parseVl(vlSpec);
}

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

  parseVl(vlSpec);
}

global.viz = {
  print: print,
  vegaPrint: vegaPrint,
  bar: bar,
  hist: hist,
  scatter: _scatter,
  density: density
}
