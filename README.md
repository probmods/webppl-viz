**Note: work in progress**

Some visualization functions for WebPPL running in the browser.

Demo: http://web.stanford.edu/~louyang/wp-viz/index.html

Usage:

```js
// automatically visualize a (possibly multivariate) inference result using some heuristics
viz.print(MH(function() { return {x: gaussian(0,1), y: beta(1,1)}}), 100)
// (in this case, it shows the marginals on x and y as well as the joint)

viz.bar([1,2,3],[4,5,6]) // bar chart
viz.hist(repeat(10, flip)) // histogram
viz.scatter([1,2,3],[4,5,6]) // scatter plot
viz.density(repeat(1e2, function() { return gaussian(0,1) })) // density
```

Compiling:

```sh
make demo/webppl-viz.js
```

Watchified compiling (incrementally rebuilds after source files have updated):

```sh
make watch
```
