Visualization for WebPPL. [Demo](http://probmods.github.io/webppl-viz/)

### Dependencies

- node.js (v4 or later)
- webppl (0.9.2-b0139d4 or later)
- Cairo (see [instructions for your operating system](https://github.com/Automattic/node-canvas/#installation))
- *(optional)* webppl-editor (1.0.5 or later)

TODO: refactor this into setup for browser versus setup for command line

### Setup

```
npm install --prefix ~/.webppl probmods/webppl-viz
```

To use on the command line, you need require `webppl-viz` as a [WebPPL package](http://docs.webppl.org/en/master/packages.html#webppl-packages). Example: `webppl foo.wppl --require webppl-viz`

To include `webppl-viz` in a browser, include webppl-viz.js and webppl-viz.css on your webpage.
You can get pre-compiled versions of these at TODO: link to GH releases.
To build these yourself, run `grunt bundle`.

### Basic usage

The `viz()` function visualizes two kinds of data: WebPPL *distributions* and *data frames*.

A data frame is an array of objects that all have the same keys (i.e., they have the same *schema*).
For example:

```javascript
viz([{country: 'usa', populationRank: 6, gdp: 12.5435},
     {country: 'mex', populationRank: 10, gdp: 12.5435},
     {country: 'can', populationRank: 9, gdp: 12321.4}])
```

Distribution elements do not need to be objects with keys, although this is recommended:

```javascript
viz(MH(function() { return          beta(2,1) }),   5) // okay
viz(MH(function() { return {weight: beta(2,1) } }), 5) // better
```

`viz` tries to automatically guess a useful graph.
If you'd like to change the graph, you can pass an additional options argument.

### Specifying options

##### Output size and format

```js
viz(d,
    {width: 100,
     height: 200,
     format: 'svg' // can also use png
    })
```
##### Changing variable types

viz chooses a graph using the *types* of variables in your data -- nominal (e.g., "usa"), ordinal (e.g., 6), or quantitative (e.g., 12.5435).
viz guesses the type of each variable using heuristics:

- strings are considered nominal
- booleans and integer numbers are considered ordinal
- non-integer numbers are considered quantitative

Sometimes, you might want to override these heuristics.
You can do this by changing the type of a variable:

```js
viz([{country: 'usa', populationRank: 6, gdp: 12.5435},
     {country: 'mex', populationRank: 10, gdp: 12.5435},
     {country: 'can', populationRank: 9, gdp: 12321.4}],
    {decoding: {populationRank: 'quantitative'}})
```
Here, we are treating `populationRank` as a continuous variable rather than a discrete one.

##### Changing graph types

flipping bar graph

```js
var dist = Rejection(function() { 
var a = Math.round(beta(3,1) * 9);
var b = Math.round(beta(2,4) * 9);
condition(a + b > 4);
return {a: a, b: b};

}, 5)
```



raw data versus aggregate: point versus line
