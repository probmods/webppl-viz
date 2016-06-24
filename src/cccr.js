var $ = require('jquery'),
    _ = require('underscore');
var vg = require('vega'), vl = require('vega-lite');

var kde = require('./stats').kde;

function renderArray(specs/*: array */, _options) {
  var options = _.defaults(_options || {},
                           {regularVega: false});
  var nSpecsRemaining = specs.length;

  var resultContainer = wpEditor.makeResultContainer();

  // div that holds selected item
  var $zoomDiv = $("<div>").addClass("zoomDiv");

  _.each(specs,
         function(spec) {

           var vgSpec = options.regularVega ? spec : vl.compile(spec).spec;
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

// TODO: move to different file
var cccr = function(args, options) {
  var scores = args.scores, types = args.types, support = args.support;
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

  renderArray(specs, {});

}

module.exports = cccr;
