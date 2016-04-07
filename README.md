Visualization functions for WebPPL (browser only, for now)

Demo: http://probmods.github.io/webppl-viz/

Dependencies:

- webppl version 0.6.1 or higher
- webppl-editor commit 657d1c or later

Usage: include webppl-viz.js and webppl-viz.css in your web page.

## Standard functions

### Table

Shows an ERP as a textual table.

Function signatures:

- `viz.table(erp, [options])`

Options:

- `log` (default = false). If true, shows log probabilities.

### Bar chart

Function signatures:

- `viz.bar(xs, ys, [options])`

Options:

- `horizontal` (default = false) (TODO). Produce a horizontal bar chart rather than vertical

### Histogram

Function signatures:

- `viz.hist(samples, [options])`
- `viz.hist(erp, [options])`

Options:

- `binwidth` (defaults to 0). TODO.

### Line chart

Function signatures:

- `viz.line(xs, ys)`

### Scatter plot

Function signatures:

- `viz.scatter(xs,ys)`

### Density curve

Function signatures:

- `viz.density(samples, [options])`
- `viz.density(erp, [options])` (TODO)

Options:

- `bounds` (defaults to bounds of the data). An array of bounds for density estimation

### Heat map

TODO

- `viz.heatMap(samples, [options])`
- `viz.heatMap(erp, [options])`

### Parallel coordinates

TODO: expose this functionality to end users

- `viz.parcoords(erp)`

## Automatic function

There is currently only one automatic function: `viz.vegaPrint(erp, [options])`

`viz.vegaPrint` tries to automatically construct a suitable visualization based on the types of the items in the ERP support.

Options:

- `summarize` (default = false). (TODO) For data with real-valued components, you can either try to show all the data (scatter plot) or summarize by showing a density estimate (heat map). This option has no effect if data is entirely categorical.

### Data types

First, a bit of notation: `c` stands for categorical variables and `r` for real variables (for now, ordinal variables are treated as categorical).

Some examples of types for different supports:

- Every support element is an integer → type is `c`
- Every support element is a real number → type is `r`
- Every support element is an object `{k1: <a>, k2: <b>}` → `<a><b>`
	- (e.g., if `<a>` is `r` and `<b>` is `c`, then the type is `rc`)
- Every support element is an array `[<a>,<b>]` → type is `<a><b>`
	- (e.g., if `<a>` is `r` and `<b>` is `c`, then the type is `rc`)

### Type renderings

- `c`: histogram
- `r`: density curve
- `cc`: frequency table
- `cr`: density curve, colors for different categorical groups
- `rr`: scatter plot / heatmap (TODO)
- `ccc`: trellis frequency table
- `ccr`: trellis density plot, colors for different categorical groups
- `crr`: trellis scatter plot / trellis heatmap (TODO)
- `rrr+` (3 or more `r`'s): parallel coordinates plot
- `cccc`: trellis frequency table (TODO)
- `cccr`: trellis scatter plot (TODO) / heat map (TODO)
- `ccrr`: trellis scatter plot (TODO) / heat map (TODO)
- `crrr`: trellis parallel coordinates plot (TODO)
- `ccrrr`: trellis parallel coordinates plot (TODO)

## Developing

Compiling:

```sh
make demo/webppl-viz.js
```

Watchified compiling (incrementally rebuilds after source files have updated):

```sh
make watch
```
