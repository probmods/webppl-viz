'use strict';


var d3 = require('d3');
var insertCss = require('insert-css');
var fs = require('fs');
var $ = require('jquery');

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

function print(x) {
  if (!cssInjected) {
    insertCss(fs.readFileSync(__dirname + '/../demo/viz.css'))
    cssInjected = true;
  }

  // name the plots to keep compatibility with the rest of erin's code
  var _resultDiv = makeResultContainer();
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

global.viz = {
  print: print
}
