var esprima = require('esprima');

var escodegen = require('escodegen'),
    gen = escodegen.generate;

var estraverse = require('estraverse'),
    traverse = estraverse.traverse;

var SourceMapConsumer = require('source-map').SourceMapConsumer;

var getWpplSource = function(f) {
  var smc = new SourceMapConsumer(global.__sourceMap__);
  var mappings = [];
  smc.eachMapping(function(m) {
    mappings.push(m)
  })

  var fName = f.name;
  var fString = f.toString();

  // get line, col position that f appears in in generated code
  var fPosition = global.__compiled__.indexOf(fString);
  var fSplit = global.__compiled__.slice(0, fPosition).split('\n');
  var fLine = fSplit.length;

  var mapping = _.findWhere(mappings, {source: 'webppl:program', generatedLine: fLine});
  // get original position
  var originalLine = mapping.originalLine,
      originalColumn = mapping.originalColumn;

  var wpplCode = _.last(global.__sourceMap__.sourcesContent);

  var wpplAst = esprima.parse(wpplCode, {loc: true});

  var originalCode;

  traverse(wpplAst,
           {enter: function(node, parent) {
             // look for var <name> = function(...) { ... }
             if (node.type == 'VariableDeclarator' && node.id.name == fName && node.init.type == 'FunctionExpression') {
               //candidateModelCode.push(gen(node))
               if (node.loc.start.line == originalLine && node.loc.start.column == originalColumn) {
                 originalCode = gen(node);
                 this.break();
               }
             }
           }})

  // TODO: there can be multiple locations mapping these attributes; ensure that i've picked the right one

  return ('(' + originalCode + ')');

}

module.exports = {
  getWpplSource: getWpplSource
}
